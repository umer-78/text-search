"""The index itself: postings, positions, statistics, idf and persistence."""

from __future__ import annotations

import math

import pytest

from textsearch import Index, search


def test_add_returns_sequential_ids(tiny):
    assert [d.id for d in tiny.documents] == [0, 1, 2]


def test_size_and_vocabulary(tiny):
    assert tiny.size == 3
    assert tiny.vocabulary == len(tiny.postings)


def test_postings_record_every_occurrence(tiny):
    posting = next(p for p in tiny.postings["york"] if p.doc == 0)
    assert posting.frequency == 2
    assert len(posting.positions) == 2


def test_positions_are_ascending(corpus):
    for term, postings in corpus.postings.items():
        for posting in postings:
            assert posting.positions == sorted(posting.positions), term


def test_a_term_appears_once_per_document_in_its_posting_list(corpus):
    for term, postings in corpus.postings.items():
        docs = [p.doc for p in postings]
        assert len(docs) == len(set(docs)), f"{term} has duplicate postings"


def test_document_length_counts_kept_terms_only(tiny):
    """Stopwords are dropped from the length but hold their position open.

    "New York is a large city in the state of New York." is twelve words; five
    of them are stopwords, so the document's length for scoring is seven, while
    the second "york" still sits at position eleven.
    """
    document = tiny.documents[0]
    assert document.length == 7
    posting = next(p for p in tiny.postings["york"] if p.doc == 0)
    assert posting.positions == [1, 11]


def test_average_length_is_the_mean_over_documents(tiny):
    total = sum(d.length for d in tiny.documents)
    assert tiny.average_length == pytest.approx(total / 3)


def test_average_length_of_an_empty_index_is_zero():
    assert Index().average_length == 0.0


def test_document_frequency_counts_documents_not_occurrences(tiny):
    # "york" occurs three times in total, but in only two documents.
    occurrences = sum(p.frequency for p in tiny.postings["york"])
    assert occurrences == 3
    assert tiny.document_frequency("york") == 2


def test_document_frequency_of_an_unknown_term_is_zero(corpus):
    assert corpus.document_frequency("dirigible") == 0


def test_add_directory_reads_every_file(corpus):
    assert corpus.size == 12
    assert {d.ref for d in corpus.documents} >= {"bm25.txt", "stemming.txt"}


def test_add_directory_uses_the_first_line_as_the_title(corpus):
    document = next(d for d in corpus.documents if d.ref == "bm25.txt")
    assert document.title and document.title != document.ref
    assert "\n" not in document.title


# -- the negative-idf finding ------------------------------------------------

def test_textbook_idf_goes_negative_for_a_common_term(corpus):
    """The measurement behind the README's headline.

    "document" appears in 10 of the 12 corpus files. The textbook BM25 idf —
    ln((N − df + 0.5) / (df + 0.5)) — is negative there, which means a document
    is *penalised* for containing the query term. The clamped form stays
    positive.
    """
    assert corpus.document_frequency("document") == 10
    assert corpus.textbook_idf("document") == pytest.approx(-1.4351, abs=1e-4)
    assert corpus.idf("document") == pytest.approx(0.2136, abs=1e-4)


def test_textbook_idf_crosses_zero_at_half_the_collection():
    index = Index()
    for i in range(10):
        index.add(f"{i}.txt", "alpha beta" if i < 4 else "beta gamma")

    # "beta" is everywhere, "alpha" in four of ten.
    assert index.document_frequency("beta") == 10
    assert index.textbook_idf("beta") < 0
    assert index.textbook_idf("alpha") > 0
    assert index.idf("beta") > 0


def test_clamped_idf_is_never_negative(corpus):
    assert all(corpus.idf(term) > 0 for term in corpus.postings)


def test_idf_decreases_as_the_term_gets_commoner(corpus):
    rare = min(corpus.postings, key=corpus.document_frequency)
    common = max(corpus.postings, key=corpus.document_frequency)
    assert corpus.idf(rare) > corpus.idf(common)


def test_idf_matches_the_formula(corpus):
    df = corpus.document_frequency("stem")
    expected = math.log(1 + (corpus.size - df + 0.5) / (df + 0.5))
    assert corpus.idf("stem") == pytest.approx(expected)


def test_a_term_in_every_document_still_scores_above_nothing():
    index = Index()
    for i in range(5):
        index.add(f"{i}.txt", "alpha beta gamma")
    hits = search(index, "alpha", snippets=False)
    assert len(hits) == 5
    assert all(hit.score > 0 for hit in hits)


# -- parameters --------------------------------------------------------------

def test_k1_must_not_be_negative():
    with pytest.raises(ValueError, match="k1"):
        Index(k1=-1)


@pytest.mark.parametrize("b", [-0.1, 1.5])
def test_b_must_lie_in_the_unit_interval(b):
    with pytest.raises(ValueError, match="b must"):
        Index(b=b)


def test_stemming_can_be_turned_off():
    plain = Index(stem=False)
    plain.add("a.txt", "running runner runs")
    assert set(plain.postings) == {"running", "runner", "runs"}

    stemmed = Index(stem=True)
    stemmed.add("a.txt", "running runner runs")
    assert len(stemmed.postings) < 3


def test_stopwords_can_be_kept():
    kept = Index(remove_stopwords=False)
    kept.add("a.txt", "the cat sat on the mat")
    assert "the" in kept.postings
    assert kept.documents[0].length == 6


# -- persistence -------------------------------------------------------------

def test_save_and_load_round_trip(corpus, tmp_path):
    path = corpus.save(tmp_path / "nested" / "index.pkl")
    assert path.exists()

    reloaded = Index.load(path)
    assert reloaded.size == corpus.size
    assert reloaded.vocabulary == corpus.vocabulary
    assert reloaded.total_length == corpus.total_length
    assert reloaded.stats() == corpus.stats()


def test_a_reloaded_index_returns_identical_rankings(corpus, tmp_path):
    reloaded = Index.load(corpus.save(tmp_path / "index.pkl"))
    before = [(h.ref, h.score) for h in search(corpus, "ranking documents", snippets=False)]
    after = [(h.ref, h.score) for h in search(reloaded, "ranking documents", snippets=False)]
    assert before == after


def test_a_reloaded_index_keeps_its_parameters(tmp_path):
    index = Index(k1=1.2, b=0.4, stem=False, remove_stopwords=False)
    index.add("a.txt", "alpha beta")
    reloaded = Index.load(index.save(tmp_path / "index.pkl"))
    assert (reloaded.k1, reloaded.b, reloaded.stem, reloaded.remove_stopwords) == (
        1.2, 0.4, False, False)


def test_a_reloaded_index_can_still_be_extended(corpus, tmp_path):
    reloaded = Index.load(corpus.save(tmp_path / "index.pkl"))
    doc_id = reloaded.add("extra.txt", "a document about hovercraft and eels")
    assert doc_id == corpus.size
    assert reloaded.document_frequency("hovercraft") == 1


def test_stats_reports_the_totals(corpus):
    stats = corpus.stats()
    assert stats["documents"] == 12
    assert stats["postings"] == sum(len(p) for p in corpus.postings.values())
    assert stats["average_length"] == pytest.approx(corpus.average_length, abs=0.05)


def test_to_json_is_parseable(corpus):
    import json
    assert json.loads(corpus.to_json())["documents"] == 12
