from pathlib import Path

import pytest

from textsearch import Index

CORPUS = Path(__file__).resolve().parent.parent / "corpus"


@pytest.fixture(scope="session")
def corpus():
    index = Index()
    index.add_directory(CORPUS)
    return index


@pytest.fixture()
def tiny():
    """Three documents with a known overlap, for exact assertions."""
    index = Index()
    index.add("a.txt", "New York is a large city in the state of New York.", "New York")
    index.add("b.txt", "New Mexico borders Texas. The city of York is in England.", "Elsewhere")
    index.add("c.txt", "Search engines rank documents by relevance.", "Search")
    return index
