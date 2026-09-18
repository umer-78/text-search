"""Querying the index: ranked search, phrases, boolean operators and typos."""

from __future__ import annotations

import re
from dataclasses import dataclass, field

from .index import Index
from .tokenize import fold, porter_stem, tokenize


@dataclass
class Hit:
    doc: int
    ref: str
    title: str
    score: float
    matched: list[str] = field(default_factory=list)
    snippet: str = ""


@dataclass
class Explanation:
    """Why a document scored what it did, term by term."""

    term: str
    frequency: int
    document_frequency: int
    idf: float
    contribution: float


def bm25(index: Index, term: str, posting_frequency: int, doc_length: int) -> float:
    """One term's contribution to one document's score.

    The saturating term frequency is what separates BM25 from plain TF-IDF: the
    tenth mention of a word adds far less than the second, because a document is
    not ten times more about a subject for saying it ten times. The length
    normalisation is the other half — without it, long documents win everything
    simply by containing more words.
    """
    idf = index.idf(term)
    numerator = posting_frequency * (index.k1 + 1)
    denominator = posting_frequency + index.k1 * (
        1 - index.b + index.b * doc_length / (index.average_length or 1)
    )
    return idf * numerator / denominator if denominator else 0.0


def tfidf(index: Index, term: str, posting_frequency: int, doc_length: int) -> float:
    """Plain TF-IDF, kept for the comparison in the tests and the README."""
    return posting_frequency * index.idf(term)


def search(index: Index, query: str, *, limit: int = 10, snippets: bool = True) -> list[Hit]:
    """Rank documents against a free-text query."""
    terms = [t for t in tokenize(query, stem=index.stem,
                                 remove_stopwords=index.remove_stopwords) if t]
    if not terms:
        return []

    scores: dict[int, float] = {}
    matched: dict[int, list[str]] = {}

    for term in terms:
        for posting in index.postings.get(term, ()):
            document = index.documents[posting.doc]
            scores[posting.doc] = scores.get(posting.doc, 0.0) + bm25(
                index, term, posting.frequency, document.length)
            matched.setdefault(posting.doc, []).append(term)

    ranked = sorted(scores.items(), key=lambda kv: (-kv[1], kv[0]))[:limit]
    return [
        Hit(doc=doc, ref=index.documents[doc].ref, title=index.documents[doc].title,
            score=round(score, 4), matched=sorted(set(matched[doc])),
            snippet=snippet(index.documents[doc].text, query) if snippets else "")
        for doc, score in ranked
    ]


def phrase_search(index: Index, phrase: str, *, limit: int = 10) -> list[Hit]:
    """Documents containing the terms adjacent, in order.

    This is what positions are for. Ranked search would return a document that
    mentions "new" in one paragraph and "york" in another; a phrase query must
    not.

    The query keeps its own gaps. Tokenising "state of the art" yields
    ["state", "", "", "art"] — the two stopwords are blanked but still occupy
    their slots — so the phrase is looked for with "art" three positions after
    "state", not directly after it. Collapsing the query to ["state", "art"]
    and demanding adjacency is the obvious implementation and it is wrong in
    both directions: it misses the document that actually contains the phrase
    and matches one that merely says "state art".
    """
    slots = [(offset, term) for offset, term
             in enumerate(tokenize(phrase, stem=index.stem,
                                   remove_stopwords=index.remove_stopwords)) if term]
    if not slots:
        return []

    base = slots[0][0]
    gaps = [(offset - base, term) for offset, term in slots]
    terms = [term for _, term in gaps]

    candidates = {p.doc for p in index.postings.get(terms[0], ())}
    for term in terms[1:]:
        candidates &= {p.doc for p in index.postings.get(term, ())}
    if not candidates:
        return []

    hits = []
    for doc in sorted(candidates):
        positions = {
            term: set(next(p.positions for p in index.postings[term] if p.doc == doc))
            for term in set(terms)
        }

        # A phrase occurs at p when every term sits at p plus its offset in the query.
        starts = [p for p in positions[terms[0]]
                  if all((p + gap) in positions[term] for gap, term in gaps[1:])]
        if not starts:
            continue

        document = index.documents[doc]
        score = sum(bm25(index, term, len(starts), document.length) for term in terms)
        hits.append(Hit(doc=doc, ref=document.ref, title=document.title,
                        score=round(score, 4), matched=terms,
                        snippet=snippet(document.text, phrase)))

    return sorted(hits, key=lambda h: -h.score)[:limit]


def boolean_search(index: Index, query: str) -> set[int]:
    """AND, OR and NOT over whole terms.

    Deliberately unranked: a boolean query is a filter, and pretending to rank
    its results implies a relevance judgement it never made.
    """
    tokens = re.findall(r"\(|\)|\bAND\b|\bOR\b|\bNOT\b|[^\s()]+", query)
    position = 0

    def peek() -> str | None:
        return tokens[position] if position < len(tokens) else None

    def take() -> str:
        nonlocal position
        token = tokens[position]
        position += 1
        return token

    def term_set(word: str) -> set[int]:
        term = porter_stem(fold(word)) if index.stem else fold(word)
        return {p.doc for p in index.postings.get(term, ())}

    def parse_or() -> set[int]:
        result = parse_and()
        while peek() == "OR":
            take()
            result |= parse_and()
        return result

    def parse_and() -> set[int]:
        result = parse_not()
        while peek() == "AND":
            take()
            result &= parse_not()
        return result

    def parse_not() -> set[int]:
        if peek() == "NOT":
            take()
            return set(range(index.size)) - parse_not()
        return parse_atom()

    def parse_atom() -> set[int]:
        token = peek()
        if token is None:
            return set()
        if token == "(":
            take()
            inner = parse_or()
            if peek() == ")":
                take()
            return inner
        return term_set(take())

    return parse_or() if tokens else set()


# ---------------------------------------------------------------- typos

def levenshtein(a: str, b: str, *, limit: int | None = None) -> int:
    """Edit distance, with an early exit once every cell exceeds the limit.

    The limit matters: a fuzzy lookup over a large vocabulary computes this for
    every candidate term, and abandoning a comparison as soon as it cannot
    possibly come in under the threshold is what keeps that affordable.
    """
    if a == b:
        return 0
    if limit is not None and abs(len(a) - len(b)) > limit:
        return limit + 1

    previous = list(range(len(b) + 1))
    for i, ca in enumerate(a, start=1):
        current = [i]
        for j, cb in enumerate(b, start=1):
            current.append(min(previous[j] + 1, current[j - 1] + 1,
                               previous[j - 1] + (ca != cb)))
        if limit is not None and min(current) > limit:
            return limit + 1
        previous = current
    return previous[-1]


def suggest(index: Index, word: str, *, max_distance: int = 2, limit: int = 5) -> list[tuple[str, int]]:
    """Index terms within an edit distance of a word, commonest first.

    Ties are broken by document frequency rather than alphabetically: given two
    equally close corrections, the one that appears in more documents is the one
    the person probably meant.
    """
    target = porter_stem(fold(word)) if index.stem else fold(word)
    results = []
    for term in index.postings:
        distance = levenshtein(target, term, limit=max_distance)
        if distance <= max_distance:
            results.append((term, distance, index.document_frequency(term)))

    results.sort(key=lambda row: (row[1], -row[2], row[0]))
    return [(term, distance) for term, distance, _ in results[:limit]]


def fuzzy_search(index: Index, query: str, *, max_distance: int = 1,
                 limit: int = 10) -> list[Hit]:
    """Search, expanding any term that is not in the index to its near neighbours."""
    terms = [t for t in tokenize(query, stem=index.stem,
                                 remove_stopwords=index.remove_stopwords) if t]
    expanded = []
    for term in terms:
        if term in index.postings:
            expanded.append(term)
            continue
        near = suggest(index, term, max_distance=max_distance, limit=2)
        expanded.extend(candidate for candidate, _ in near)

    if not expanded:
        return []

    scores: dict[int, float] = {}
    matched: dict[int, list[str]] = {}
    for term in expanded:
        for posting in index.postings.get(term, ()):
            document = index.documents[posting.doc]
            scores[posting.doc] = scores.get(posting.doc, 0.0) + bm25(
                index, term, posting.frequency, document.length)
            matched.setdefault(posting.doc, []).append(term)

    ranked = sorted(scores.items(), key=lambda kv: (-kv[1], kv[0]))[:limit]
    return [Hit(doc=doc, ref=index.documents[doc].ref, title=index.documents[doc].title,
                score=round(score, 4), matched=sorted(set(matched[doc])),
                snippet=snippet(index.documents[doc].text, query))
            for doc, score in ranked]


# ---------------------------------------------------------------- output

def explain(index: Index, query: str, doc: int) -> list[Explanation]:
    """The per-term arithmetic behind one document's score."""
    document = index.documents[doc]
    out = []
    for term in dict.fromkeys(t for t in tokenize(query, stem=index.stem,
                                                  remove_stopwords=index.remove_stopwords) if t):
        posting = next((p for p in index.postings.get(term, ()) if p.doc == doc), None)
        frequency = posting.frequency if posting else 0
        out.append(Explanation(
            term=term, frequency=frequency,
            document_frequency=index.document_frequency(term),
            idf=round(index.idf(term), 4),
            contribution=round(bm25(index, term, frequency, document.length), 4) if frequency else 0.0,
        ))
    return sorted(out, key=lambda e: -e.contribution)


def snippet(text: str, query: str, *, width: int = 160) -> str:
    """A window of the document around the first query word that appears."""
    words = {fold(w) for w in re.findall(r"[\w']+", query)}
    lowered = fold(text)

    best = -1
    for word in words:
        found = lowered.find(word)
        if found != -1 and (best == -1 or found < best):
            best = found
    if best == -1:
        return text[:width].replace("\n", " ").strip() + ("…" if len(text) > width else "")

    start = max(0, best - width // 3)
    end = min(len(text), start + width)
    piece = text[start:end].replace("\n", " ").strip()
    return ("…" if start > 0 else "") + piece + ("…" if end < len(text) else "")
