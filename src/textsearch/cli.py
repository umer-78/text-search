"""textsearch: build an index over a folder of text, then query it."""

from __future__ import annotations

import argparse
import json
import os
import sys
from pathlib import Path

from . import __version__
from .index import Index
from .search import boolean_search, explain, fuzzy_search, phrase_search, search, suggest
from .tokenize import porter_stem, terms_only

DEFAULT_INDEX = Path("index/corpus.pkl")


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(prog="textsearch", description=__doc__)
    parser.add_argument("--version", action="version", version=f"textsearch {__version__}")
    sub = parser.add_subparsers(dest="cmd", required=True)

    index = sub.add_parser("index", help="build an index over a folder")
    index.add_argument("directory", type=Path, nargs="?", default=Path("corpus"))
    index.add_argument("-o", "--out", type=Path, default=DEFAULT_INDEX)
    index.add_argument("--no-stem", action="store_true")
    index.add_argument("--keep-stopwords", action="store_true")

    def query(p: argparse.ArgumentParser) -> None:
        p.add_argument("query", nargs="+")
        p.add_argument("-i", "--index", type=Path, default=DEFAULT_INDEX)
        p.add_argument("-n", "--limit", type=int, default=5)

    find = sub.add_parser("search", help="ranked search")
    query(find)
    find.add_argument("--json", action="store_true")

    phrase = sub.add_parser("phrase", help="terms adjacent and in order")
    query(phrase)

    boolean = sub.add_parser("boolean", help="AND / OR / NOT over whole terms")
    query(boolean)

    fuzzy = sub.add_parser("fuzzy", help="search, tolerating typos")
    query(fuzzy)
    fuzzy.add_argument("--distance", type=int, default=1)

    why = sub.add_parser("explain", help="the arithmetic behind one document's score")
    query(why)
    why.add_argument("--doc", type=int, default=None)

    spell = sub.add_parser("suggest", help="index terms near a word")
    query(spell)
    spell.add_argument("--distance", type=int, default=2)

    stem = sub.add_parser("stem", help="what the tokeniser does to some text")
    stem.add_argument("text", nargs="+")

    stats = sub.add_parser("stats", help="what is in the index")
    stats.add_argument("-i", "--index", type=Path, default=DEFAULT_INDEX)

    return parser


def main(argv: list[str] | None = None) -> int:
    """Entry point. Wraps the real work so that piping into `head` — which closes
    the pipe early — ends quietly instead of printing a BrokenPipeError."""
    try:
        return _run(argv)
    except BrokenPipeError:
        devnull = os.open(os.devnull, os.O_WRONLY)
        os.dup2(devnull, sys.stdout.fileno())
        return 0
    except KeyboardInterrupt:
        print(file=sys.stderr)
        return 130
    except (ValueError, FileNotFoundError) as error:
        print(f"textsearch: {error}", file=sys.stderr)
        return 2


def _load(path: Path) -> Index:
    if not path.exists():
        raise FileNotFoundError(f"no index at {path} — run `textsearch index` first")
    return Index.load(path)


def _show(hits, limit: int) -> None:
    if not hits:
        print("no matches")
        return
    for rank, hit in enumerate(hits[:limit], start=1):
        print(f"{rank}. {hit.title}  [{hit.ref}]  score {hit.score}")
        if hit.matched:
            print(f"   matched: {', '.join(hit.matched)}")
        if hit.snippet:
            print(f"   {hit.snippet}")
        print()


def _run(argv: list[str] | None) -> int:
    args = build_parser().parse_args(argv)

    if args.cmd == "index":
        index = Index(stem=not args.no_stem, remove_stopwords=not args.keep_stopwords)
        count = index.add_directory(args.directory)
        if count == 0:
            raise ValueError(f"no .txt files in {args.directory}")
        index.save(args.out)
        stats = index.stats()
        print(f"indexed {count} documents from {args.directory} -> {args.out}")
        print(f"  {stats['vocabulary']:,} distinct terms, {stats['postings']:,} postings, "
              f"{stats['average_length']} terms per document on average")
        return 0

    if args.cmd == "stem":
        text = " ".join(args.text)
        terms = terms_only(text)
        print(f"{'word':<18}{'stem':<18}")
        for word in text.split():
            print(f"{word:<18}{porter_stem(word.lower().strip('.,!?')):<18}")
        print(f"\nindex terms: {terms}")
        return 0

    if args.cmd == "stats":
        index = _load(args.index)
        print(index.to_json())
        commonest = sorted(index.postings.items(), key=lambda kv: -len(kv[1]))[:8]
        print("\ncommonest terms:")
        for term, postings in commonest:
            print(f"  {term:<16}{len(postings):>3} documents   idf {index.idf(term):.3f}")
        return 0

    index = _load(args.index)
    query = " ".join(args.query)

    if args.cmd == "search":
        hits = search(index, query, limit=args.limit)
        if args.json:
            print(json.dumps([{"rank": i, "ref": h.ref, "title": h.title, "score": h.score,
                               "matched": h.matched} for i, h in enumerate(hits, 1)], indent=2))
            return 0
        _show(hits, args.limit)
        return 0

    if args.cmd == "phrase":
        hits = phrase_search(index, query, limit=args.limit)
        ranked = len(search(index, query, limit=1000, snippets=False))
        _show(hits, args.limit)
        print(f"{len(hits)} document(s) contain the phrase; "
              f"{ranked} contain the words anywhere.")
        return 0

    if args.cmd == "boolean":
        docs = sorted(boolean_search(index, query))
        for doc in docs:
            document = index.documents[doc]
            print(f"{document.title}  [{document.ref}]")
        print(f"\n{len(docs)} document(s) match. Boolean queries filter; they do not rank.")
        return 0

    if args.cmd == "fuzzy":
        hits = fuzzy_search(index, query, max_distance=args.distance, limit=args.limit)
        exact = search(index, query, limit=args.limit, snippets=False)
        if not exact and hits:
            print(f"nothing matched {query!r} exactly; searching near terms instead\n")
        _show(hits, args.limit)
        return 0

    if args.cmd == "suggest":
        for word in args.query:
            near = suggest(index, word, max_distance=args.distance)
            if not near:
                print(f"{word}: no terms within {args.distance} edits")
                continue
            print(f"{word}:")
            for term, distance in near:
                print(f"   {term:<16} {distance} edit(s), {index.document_frequency(term)} documents")
        return 0

    hits = search(index, query, limit=1, snippets=False)
    doc = args.doc if args.doc is not None else (hits[0].doc if hits else None)
    if doc is None:
        print("nothing matched, so there is nothing to explain")
        return 0

    document = index.documents[doc]
    print(f"{document.title}  [{document.ref}]  {document.length} terms "
          f"(average {index.average_length:.1f})\n")
    print(f"{'term':<14}{'in doc':>8}{'in corpus':>11}{'idf':>9}{'contributes':>13}")
    total = 0.0
    for row in explain(index, query, doc):
        total += row.contribution
        print(f"{row.term:<14}{row.frequency:>8}{row.document_frequency:>11}"
              f"{row.idf:>9.3f}{row.contribution:>13.4f}")
    print(f"{'total':<14}{'':>8}{'':>11}{'':>9}{total:>13.4f}")
    return 0
