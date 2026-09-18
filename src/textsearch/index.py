"""The inverted index and BM25 ranking."""

from __future__ import annotations

import json
import math
import pickle
from collections import defaultdict
from dataclasses import dataclass, field
from pathlib import Path

from .tokenize import tokenize


@dataclass
class Document:
    id: int
    ref: str
    title: str
    text: str
    length: int = 0


@dataclass
class Posting:
    """Where a term appears in one document, and how often."""

    doc: int
    positions: list[int] = field(default_factory=list)

    @property
    def frequency(self) -> int:
        return len(self.positions)


class Index:
    """Terms to postings, plus everything BM25 needs.

    Positions are stored, not just counts. An index that records only which
    terms appear cannot tell "New York" from a document that mentions New
    Mexico and York in different paragraphs, and phrase search is the first
    thing anyone asks for.
    """

    def __init__(self, *, stem: bool = True, remove_stopwords: bool = True,
                 k1: float = 1.5, b: float = 0.75):
        if k1 < 0:
            raise ValueError("k1 cannot be negative")
        if not 0 <= b <= 1:
            raise ValueError("b must be between 0 and 1")

        self.stem = stem
        self.remove_stopwords = remove_stopwords
        self.k1 = k1
        self.b = b

        self.documents: list[Document] = []
        self.postings: dict[str, list[Posting]] = defaultdict(list)
        self.total_length = 0

    # -- building ---------------------------------------------------------

    def add(self, ref: str, text: str, title: str = "") -> int:
        doc_id = len(self.documents)
        terms = tokenize(text, stem=self.stem, remove_stopwords=self.remove_stopwords)

        positions: dict[str, list[int]] = defaultdict(list)
        length = 0
        for position, term in enumerate(terms):
            if not term:          # a stopword placeholder holds the position open
                continue
            positions[term].append(position)
            length += 1

        for term, where in positions.items():
            self.postings[term].append(Posting(doc_id, where))

        self.documents.append(Document(doc_id, ref, title or ref, text, length))
        self.total_length += length
        return doc_id

    def add_directory(self, directory: str | Path, pattern: str = "*.txt") -> int:
        added = 0
        for path in sorted(Path(directory).glob(pattern)):
            text = path.read_text(encoding="utf-8")
            first, _, rest = text.partition("\n")
            self.add(path.name, rest.strip() or text, title=first.strip())
            added += 1
        return added

    # -- statistics -------------------------------------------------------

    @property
    def size(self) -> int:
        return len(self.documents)

    @property
    def vocabulary(self) -> int:
        return len(self.postings)

    @property
    def average_length(self) -> float:
        return self.total_length / self.size if self.size else 0.0

    def document_frequency(self, term: str) -> int:
        return len(self.postings.get(term, ()))

    def idf(self, term: str) -> float:
        """Inverse document frequency, in the form that cannot go negative.

        The textbook BM25 idf is ln((N − df + 0.5) / (df + 0.5)), and it turns
        negative the moment a term appears in more than half the collection. A
        negative idf means a document is *penalised* for containing the query
        term: search a corpus of recipes for "the" and the documents without it
        rank above the ones with it.

        Adding one inside the logarithm — what Lucene does — keeps the curve
        the same shape everywhere it mattered and floors it at zero. A test
        compares the two on a deliberately common term.
        """
        df = self.document_frequency(term)
        return math.log(1 + (self.size - df + 0.5) / (df + 0.5))

    def textbook_idf(self, term: str) -> float:
        """The unclamped form, kept so the failure can be demonstrated."""
        df = self.document_frequency(term)
        return math.log((self.size - df + 0.5) / (df + 0.5))

    # -- persistence ------------------------------------------------------

    def save(self, path: str | Path) -> Path:
        path = Path(path)
        path.parent.mkdir(parents=True, exist_ok=True)
        with path.open("wb") as handle:
            pickle.dump({
                "stem": self.stem, "remove_stopwords": self.remove_stopwords,
                "k1": self.k1, "b": self.b,
                "documents": self.documents, "postings": dict(self.postings),
                "total_length": self.total_length,
            }, handle)
        return path

    @classmethod
    def load(cls, path: str | Path) -> Index:
        with Path(path).open("rb") as handle:
            state = pickle.load(handle)
        index = cls(stem=state["stem"], remove_stopwords=state["remove_stopwords"],
                    k1=state["k1"], b=state["b"])
        index.documents = state["documents"]
        index.postings = defaultdict(list, state["postings"])
        index.total_length = state["total_length"]
        return index

    def stats(self) -> dict[str, float]:
        return {
            "documents": self.size,
            "vocabulary": self.vocabulary,
            "postings": sum(len(p) for p in self.postings.values()),
            "average_length": round(self.average_length, 1),
        }

    def to_json(self) -> str:
        return json.dumps(self.stats(), indent=2)
