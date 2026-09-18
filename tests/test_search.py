"""Ranking, phrases, booleans, typo tolerance and explanation."""

from __future__ import annotations

import pytest

from textsearch import (
    Index,
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


@pytest.fixture()
def lengths():
    """Three documents built to isolate term frequency from document length."""
    index = Index()
    index.add("short.txt", "alpha alpha filler words here")
    index.add("spam.txt", "alpha " * 20 + "filler words here")
    index.add("long.txt", "alpha alpha " + "padding " * 60)
    return index


# -- ranked search -----------------------------------------------------------

def test_search_returns_only_matching_documents(tiny):
    assert [h.ref for h in search(tiny, "New York")] == ["a.txt", "b.txt"]


def test_search_ranks_the_better_match_first(tiny):
    hits = search(tiny, "New York")
    assert hits[0].ref == "a.txt"
    assert hits[0].score > hits[1].score


def test_search_of_an_absent_term_returns_nothing(corpus):
    assert search(corpus, "dirigible") == []


def test_search_of_only_stopwords_returns_nothing(corpus):
    assert search(corpus, "the of and") == []


def test_search_respects_the_limit(corpus):
    assert len(search(corpus, "documents", limit=3)) == 3


def test_scores_are_descending(corpus):
    scores = [h.score for h in search(corpus, "ranking index terms")]
    assert scores == sorted(scores, reverse=True)


def test_ties_break_by_document_id():
    index = Index()
    for i in range(3):
        index.add(f"{i}.txt", "alpha beta gamma")
    hits = search(index, "alpha", snippets=False)
    assert [h.doc for h in hits] == [0, 1, 2]


def test_matched_terms_are_reported(tiny):
    hit = search(tiny, "New York city")[0]
    assert set(hit.matched) >= {"york", "citi"}


def test_search_finds_a_stemmed_variant(corpus):
    """The query says "stemming"; the corpus says "stemmer" and "stems"."""
    assert any(h.ref == "stemming.txt" for h in search(corpus, "stemming"))


def test_snippets_can_be_turned_off(tiny):
    assert all(h.snippet == "" for h in search(tiny, "york", snippets=False))


# -- the two halves of BM25 --------------------------------------------------

def test_term_frequency_saturates(lengths):
    """Ten times the mentions is not ten times the relevance.

    Held at one document length so only the term frequency varies: twenty
    mentions against two. Plain TF-IDF scores the repetition at exactly ten
    times the value; BM25's saturating numerator puts it at about a quarter
    more.
    """
    length = lengths.documents[0].length

    bm25_ratio = bm25(lengths, "alpha", 20, length) / bm25(lengths, "alpha", 2, length)
    tfidf_ratio = tfidf(lengths, "alpha", 20, length) / tfidf(lengths, "alpha", 2, length)

    assert tfidf_ratio == pytest.approx(10.0)
    assert bm25_ratio == pytest.approx(1.246, abs=0.01)


def test_saturation_survives_the_length_penalty(lengths):
    """And in the documents as they really are, repetition barely pays.

    spam.txt says "alpha" twenty times and is four times the length of
    short.txt, which says it twice. The extra eighteen mentions buy it a 21%
    higher score; under TF-IDF they would buy it 900%.
    """
    short, spam, _ = lengths.documents
    ratio = (bm25(lengths, "alpha", 20, spam.length)
             / bm25(lengths, "alpha", 2, short.length))
    assert ratio == pytest.approx(1.207, abs=0.01)


def test_length_normalisation_favours_the_shorter_document(lengths):
    """Identical term frequency, different document lengths.

    short.txt and long.txt both say "alpha" twice; long.txt is twelve times the
    length. TF-IDF cannot tell them apart. BM25 scores the short one nearly
    twice as high.
    """
    short, _, long = lengths.documents

    assert tfidf(lengths, "alpha", 2, short.length) == tfidf(lengths, "alpha", 2, long.length)
    assert bm25(lengths, "alpha", 2, short.length) > bm25(lengths, "alpha", 2, long.length) * 1.7


def test_b_zero_switches_length_normalisation_off():
    index = Index(b=0.0)
    index.add("short.txt", "alpha beta")
    index.add("long.txt", "alpha " + "padding " * 50)
    short, long = index.documents
    assert bm25(index, "alpha", 1, short.length) == pytest.approx(
        bm25(index, "alpha", 1, long.length))


def test_k1_zero_makes_every_frequency_equal():
    index = Index(k1=0.0)
    index.add("a.txt", "alpha")
    index.add("b.txt", "beta")
    assert bm25(index, "alpha", 1, 1) == pytest.approx(bm25(index, "alpha", 9, 1))


def test_bm25_is_zero_for_a_term_the_document_lacks(corpus):
    assert bm25(corpus, "dirigible", 0, 60) == 0.0


# -- phrases -----------------------------------------------------------------

def test_phrase_search_requires_adjacency(tiny):
    """b.txt contains "new" and "york", but paragraphs apart."""
    words = {h.ref for h in search(tiny, "New York")}
    phrases = {h.ref for h in phrase_search(tiny, "New York")}
    assert words == {"a.txt", "b.txt"}
    assert phrases == {"a.txt"}


def test_phrase_search_respects_order(tiny):
    assert phrase_search(tiny, "York New") == []


def test_phrase_search_of_a_single_term_matches_the_term(tiny):
    assert {h.ref for h in phrase_search(tiny, "york")} == {"a.txt", "b.txt"}


def test_phrase_search_of_an_absent_term_returns_nothing(corpus):
    assert phrase_search(corpus, "dirigible airship") == []


def test_phrase_search_of_an_empty_query_returns_nothing(corpus):
    assert phrase_search(corpus, "   ") == []


def test_phrase_search_finds_a_known_phrase(corpus):
    refs = {h.ref for h in phrase_search(corpus, "posting lists")}
    assert refs
    assert refs <= {h.ref for h in search(corpus, "posting lists")}


def test_a_phrase_spanning_a_stopword_still_matches():
    """Stopwords are removed, but their positions are held open.

    Without the placeholder, "state of the art" would collapse to "state art"
    and match a document that said "state" immediately followed by "art".
    """
    index = Index()
    index.add("a.txt", "the state of the art in ranking")
    index.add("b.txt", "state art")
    assert {h.ref for h in phrase_search(index, "state of the art")} == {"a.txt"}


# -- booleans ----------------------------------------------------------------

@pytest.fixture()
def boolean_index():
    index = Index()
    index.add("0.txt", "alpha")
    index.add("1.txt", "beta")
    index.add("2.txt", "gamma")
    index.add("3.txt", "alpha gamma")
    return index


def test_and_intersects(boolean_index):
    assert boolean_search(boolean_index, "alpha AND gamma") == {3}


def test_or_unions(boolean_index):
    assert boolean_search(boolean_index, "beta OR gamma") == {1, 2, 3}


def test_not_complements_against_the_whole_collection(boolean_index):
    assert boolean_search(boolean_index, "NOT alpha") == {1, 2}


def test_and_binds_tighter_than_or(boolean_index):
    # alpha OR (beta AND gamma) — not (alpha OR beta) AND gamma.
    assert boolean_search(boolean_index, "alpha OR beta AND gamma") == {0, 3}


def test_parentheses_override_precedence(boolean_index):
    assert boolean_search(boolean_index, "(alpha OR beta) AND gamma") == {3}


def test_not_binds_tighter_than_and(boolean_index):
    assert boolean_search(boolean_index, "gamma AND NOT alpha") == {2}


def test_an_unclosed_parenthesis_is_tolerated(boolean_index):
    assert boolean_search(boolean_index, "(alpha OR beta") == {0, 1, 3}


def test_an_empty_boolean_query_matches_nothing(boolean_index):
    assert boolean_search(boolean_index, "") == set()


def test_boolean_terms_are_stemmed_like_the_index(corpus):
    assert boolean_search(corpus, "stemming") == boolean_search(corpus, "stems")


def test_porter_does_not_conflate_stemming_with_stemmer(corpus):
    """A limitation of the algorithm, recorded rather than papered over.

    Porter removes "-ing" from "stemming" to give "stem", but leaves "stemmer"
    alone: its rule for "-er" fires only when the remainder has measure greater
    than one, and "stemm" has measure one. So a search for the noun does not
    find the gerund. A lemmatiser with a dictionary would; a five-step
    suffix-stripper working on letters alone cannot.
    """
    from textsearch import porter_stem

    assert porter_stem("stemming") == porter_stem("stems") == "stem"
    assert porter_stem("stemmer") == "stemmer"
    assert boolean_search(corpus, "stemming") != boolean_search(corpus, "stemmer")


def test_boolean_search_is_unranked(corpus):
    assert isinstance(boolean_search(corpus, "index AND query"), set)


# -- typos -------------------------------------------------------------------

@pytest.mark.parametrize(("a", "b", "expected"), [
    ("kitten", "sitting", 3),
    ("", "abc", 3),
    ("abc", "", 3),
    ("same", "same", 0),
    ("flaw", "lawn", 2),
])
def test_levenshtein(a, b, expected):
    assert levenshtein(a, b) == expected


def test_levenshtein_is_symmetric():
    assert levenshtein("index", "indices") == levenshtein("indices", "index")


def test_levenshtein_gives_up_past_the_limit():
    """Over the limit the exact distance is not computed, only bounded."""
    assert levenshtein("kitten", "sitting", limit=1) == 2
    assert levenshtein("kitten", "sitting", limit=2) == 3
    assert levenshtein("kitten", "sitting", limit=3) == 3


def test_levenshtein_rejects_on_length_difference_alone():
    assert levenshtein("a", "abcdefgh", limit=2) == 3


def test_suggest_finds_the_intended_word(corpus):
    assert suggest(corpus, "invertd")[0][0] == "invert"


def test_suggest_returns_distances_in_order(corpus):
    distances = [d for _, d in suggest(corpus, "rankng", max_distance=2)]
    assert distances == sorted(distances)


def test_suggest_respects_the_limit(corpus):
    assert len(suggest(corpus, "term", max_distance=2, limit=3)) == 3


def test_suggest_breaks_ties_by_document_frequency():
    """Two corrections one edit away; the commoner one comes first."""
    index = Index(stem=False)
    for i in range(5):
        index.add(f"common{i}.txt", "cat")
    index.add("rare.txt", "bat")

    assert [term for term, _ in suggest(index, "hat", max_distance=1)][:2] == ["cat", "bat"]


def test_fuzzy_search_recovers_from_a_typo(corpus):
    typed = {h.ref for h in fuzzy_search(corpus, "stemer")}
    correct = {h.ref for h in search(corpus, "stemmer")}
    assert typed & correct


def test_fuzzy_search_leaves_known_terms_alone(corpus):
    assert [h.ref for h in fuzzy_search(corpus, "ranking")] == [
        h.ref for h in search(corpus, "ranking")]


def test_fuzzy_search_of_an_unrecoverable_word_returns_nothing(corpus):
    assert fuzzy_search(corpus, "zzzzzzzzzz") == []


# -- explanation and snippets ------------------------------------------------

def test_explain_covers_every_query_term(corpus):
    hit = search(corpus, "saturating length normalisation")[0]
    rows = explain(corpus, "saturating length normalisation", hit.doc)
    assert {r.term for r in rows} == {"satur", "length", "normalis"}


def test_explain_contributions_sum_to_the_score(corpus):
    hit = search(corpus, "ranking documents by relevance", snippets=False)[0]
    rows = explain(corpus, "ranking documents by relevance", hit.doc)
    assert sum(r.contribution for r in rows) == pytest.approx(hit.score, abs=1e-3)


def test_explain_orders_by_contribution(corpus):
    rows = explain(corpus, "index ranking terms", search(corpus, "index ranking terms")[0].doc)
    contributions = [r.contribution for r in rows]
    assert contributions == sorted(contributions, reverse=True)


def test_explain_reports_absent_terms_as_zero(corpus):
    rows = explain(corpus, "bm25 dirigible", search(corpus, "bm25")[0].doc)
    absent = next(r for r in rows if r.term == "dirig")
    assert absent.frequency == 0
    assert absent.contribution == 0.0


def test_explain_deduplicates_repeated_query_terms(corpus):
    rows = explain(corpus, "index index index", 0)
    assert len(rows) == 1


def test_snippet_centres_on_the_query_word():
    text = "padding " * 30 + "the needle is here " + "padding " * 30
    assert "needle" in snippet(text, "needle")


def test_snippet_falls_back_to_the_opening(corpus):
    text = corpus.documents[0].text
    assert snippet(text, "dirigible").startswith(text[:20].strip()[:10])


def test_snippet_respects_its_width():
    text = "word " * 200
    assert len(snippet(text, "word", width=80)) <= 82


def test_a_short_document_is_not_given_an_ellipsis():
    assert snippet("a short document", "short") == "a short document"
