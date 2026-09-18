import pytest

from textsearch import fold, porter_stem, terms_only, tokenize


@pytest.mark.parametrize(
    ("word", "stem"),
    [
        # The canonical Porter cases, from the algorithm's own published vocabulary.
        ("caresses", "caress"), ("ponies", "poni"), ("ties", "ti"), ("cats", "cat"),
        ("feed", "feed"), ("agreed", "agre"), ("plastered", "plaster"),
        ("motoring", "motor"), ("sing", "sing"), ("conflated", "conflat"),
        ("troubled", "troubl"), ("sized", "size"), ("hopping", "hop"),
        ("falling", "fall"), ("filing", "file"), ("happy", "happi"),
        ("relational", "relat"), ("connected", "connect"),
    ],
)
def test_the_stemmer_matches_the_published_examples(word, stem):
    assert porter_stem(word) == stem


def test_related_words_reduce_to_one_term():
    assert porter_stem("running") == porter_stem("runs") == "run"


def test_stemming_collides_words_that_are_not_related():
    """Stated as a test rather than buried in a caveat.

    The Porter algorithm knows nothing about meaning: university and universe
    both reduce to univers, so a search for one retrieves the other. That is the
    price of stemming, and it should be visible rather than surprising.
    """
    assert porter_stem("university") == porter_stem("universe") == "univers"


def test_a_very_short_word_is_left_alone():
    for word in ("a", "an", "is", "ox"):
        assert porter_stem(word) == word


def test_folding_removes_case_and_accents():
    assert fold("Café") == "cafe"
    assert fold("NAÏVE") == "naive"


def test_apostrophes_stay_inside_words():
    assert terms_only("don't", stem=False) == ["don't"]


def test_punctuation_does_not_stick_to_terms():
    assert terms_only("Hello, world!", stem=False) == ["hello", "world"]


def test_a_removed_stopword_leaves_its_position_open():
    """Dropping stopwords outright would make 'the cat sat' and 'cat sat' index
    identically, and a phrase query for 'cat sat' would then match 'cat the sat'."""
    tokens = tokenize("the cat sat", stem=False)

    assert tokens == ["", "cat", "sat"]
    assert terms_only("the cat sat", stem=False) == ["cat", "sat"]


def test_stopword_removal_can_be_switched_off():
    assert terms_only("the cat", stem=False, remove_stopwords=False) == ["the", "cat"]


def test_stemming_can_be_switched_off():
    assert terms_only("running cats", stem=False) == ["running", "cats"]


def test_empty_text_yields_no_terms():
    assert terms_only("") == []
    assert terms_only("   !!!   ") == []
