"""A search engine from scratch: inverted index, BM25, phrases, booleans and typos."""

from .index import Document, Index, Posting
from .search import (
    Explanation,
    Hit,
    bm25,
    boolean_search,
    explain,
    fuzzy_search,
    levenshtein,
    phrase_search,
    search,
    snippet,
    suggest,
    tfidf,
)
from .tokenize import STOPWORDS, fold, porter_stem, terms_only, tokenize

__all__ = [
    "STOPWORDS", "Document", "Explanation", "Hit", "Index", "Posting", "bm25",
    "boolean_search", "explain", "fold", "fuzzy_search", "levenshtein",
    "phrase_search", "porter_stem", "search", "snippet", "suggest", "terms_only",
    "tfidf", "tokenize",
]
__version__ = "1.0.0"
