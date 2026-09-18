"""Turning text into the terms an index stores.

Every choice here is lossy, and the point of writing it out rather than importing
it is that the losses are visible. Case folding loses the difference between
"Apple" and "apple". Stemming loses the difference between "university" and
"universe" — both become "univers", and a search for one finds the other. That is
usually worth it and sometimes is not, so stemming is a flag rather than a
fixture, and a test states the collision rather than hiding it.
"""

from __future__ import annotations

import re
import unicodedata

# Letters, digits and apostrophes inside words. Splitting on whitespace alone
# would keep trailing punctuation attached; splitting on every non-letter would
# break "don't" into two useless fragments.
WORD = re.compile(r"[\w']+", re.UNICODE)

# A short list on purpose. Aggressive stopword removal makes phrase search worse
# — "to be or not to be" becomes nothing at all — so only the words that carry
# no discriminating power anywhere are dropped.
STOPWORDS = frozenset([
    "a", "an", "and", "are", "as", "at", "be", "by", "for", "from", "has",
    "have", "in", "is", "it", "its", "of", "on", "that", "the", "to", "was",
    "were", "will", "with",
])


def fold(text: str) -> str:
    """Lowercase and strip accents, so 'Café' and 'cafe' are one term."""
    decomposed = unicodedata.normalize("NFKD", text.lower())
    return "".join(ch for ch in decomposed if not unicodedata.combining(ch))


def tokenize(text: str, *, stem: bool = True, remove_stopwords: bool = True) -> list[str]:
    """Split text into index terms, in order.

    Order is kept because phrase search needs positions. An index that stores
    only which terms appear cannot tell "New York" from a document mentioning
    New Mexico and York separately.
    """
    terms = []
    for match in WORD.finditer(fold(text)):
        word = match.group().strip("'")
        if not word:
            continue
        if remove_stopwords and word in STOPWORDS:
            # Kept as a placeholder so positions stay true: dropping it outright
            # would make "the cat sat" and "cat sat" index identically, and a
            # phrase query for "cat sat" would then match "cat the sat".
            terms.append("")
            continue
        terms.append(porter_stem(word) if stem else word)
    return terms


def terms_only(text: str, **kwargs) -> list[str]:
    """Tokens with the stopword placeholders removed, for counting."""
    return [term for term in tokenize(text, **kwargs) if term]


# ---------------------------------------------------------------- stemming

VOWELS = "aeiou"


def _is_consonant(word: str, i: int) -> bool:
    letter = word[i]
    if letter in VOWELS:
        return False
    if letter == "y":
        return i == 0 or not _is_consonant(word, i - 1)
    return True


def _measure(stem: str) -> int:
    """Porter's m: how many vowel-consonant sequences the stem contains."""
    count = 0
    previous_vowel = False
    for i in range(len(stem)):
        vowel = not _is_consonant(stem, i)
        if previous_vowel and not vowel:
            count += 1
        previous_vowel = vowel
    return count


def _has_vowel(stem: str) -> bool:
    return any(not _is_consonant(stem, i) for i in range(len(stem)))


def _double_consonant(word: str) -> bool:
    return (len(word) >= 2 and word[-1] == word[-2]
            and _is_consonant(word, len(word) - 1))


def _cvc(word: str) -> bool:
    """Consonant-vowel-consonant where the last is not w, x or y."""
    if len(word) < 3:
        return False
    if not (_is_consonant(word, len(word) - 3) and not _is_consonant(word, len(word) - 2)
            and _is_consonant(word, len(word) - 1)):
        return False
    return word[-1] not in "wxy"


def porter_stem(word: str) -> str:
    """The Porter stemmer, steps 1 through 5.

    Written out rather than imported because it is the part of a search engine
    people most often treat as magic. It is a sequence of suffix rules guarded by
    a syllable count, and reading it makes plain why 'universe' and 'university'
    collide: both reduce to 'univers' before any rule can tell them apart.
    """
    if len(word) <= 2:
        return word

    # Step 1a: plurals. SSES -> SS, IES -> I, SS -> SS, S -> "". The first two
    # branches happen to share an action; they are kept apart so the code reads
    # against the published rule table rather than a compressed version of it.
    if word.endswith("sses"):  # noqa: SIM114
        word = word[:-2]
    elif word.endswith("ies"):
        word = word[:-2]
    elif word.endswith("ss"):
        pass
    elif word.endswith("s"):
        word = word[:-1]

    # Step 1b: -eed, -ed, -ing.
    second_pass = False
    if word.endswith("eed"):
        if _measure(word[:-3]) > 0:
            word = word[:-1]
    elif word.endswith("ed") and _has_vowel(word[:-2]):
        word = word[:-2]
        second_pass = True
    elif word.endswith("ing") and _has_vowel(word[:-3]):
        word = word[:-3]
        second_pass = True

    if second_pass:
        if word.endswith(("at", "bl", "iz")):
            word += "e"
        elif _double_consonant(word) and not word.endswith(("l", "s", "z")):
            word = word[:-1]
        elif _measure(word) == 1 and _cvc(word):
            word += "e"

    # Step 1c: y -> i.
    if word.endswith("y") and _has_vowel(word[:-1]):
        word = word[:-1] + "i"

    step2 = {
        "ational": "ate", "tional": "tion", "enci": "ence", "anci": "ance",
        "izer": "ize", "abli": "able", "alli": "al", "entli": "ent", "eli": "e",
        "ousli": "ous", "ization": "ize", "ation": "ate", "ator": "ate",
        "alism": "al", "iveness": "ive", "fulness": "ful", "ousness": "ous",
        "aliti": "al", "iviti": "ive", "biliti": "ble",
    }
    for suffix, replacement in step2.items():
        if word.endswith(suffix) and _measure(word[: -len(suffix)]) > 0:
            word = word[: -len(suffix)] + replacement
            break

    step3 = {"icate": "ic", "ative": "", "alize": "al", "iciti": "ic",
             "ical": "ic", "ful": "", "ness": ""}
    for suffix, replacement in step3.items():
        if word.endswith(suffix) and _measure(word[: -len(suffix)]) > 0:
            word = word[: -len(suffix)] + replacement
            break

    step4 = ("al", "ance", "ence", "er", "ic", "able", "ible", "ant", "ement",
             "ment", "ent", "ou", "ism", "ate", "iti", "ous", "ive", "ize")
    for suffix in sorted(step4, key=len, reverse=True):
        if word.endswith(suffix):
            stem = word[: -len(suffix)]
            if _measure(stem) > 1:
                if suffix == "ion" and not stem.endswith(("s", "t")):
                    break
                word = stem
            break
    if word.endswith("ion") and _measure(word[:-3]) > 1 and word[-4:-3] in ("s", "t"):
        word = word[:-3]

    # Step 5: a trailing e, and a doubled l.
    if word.endswith("e"):
        measure = _measure(word[:-1])
        if measure > 1 or (measure == 1 and not _cvc(word[:-1])):
            word = word[:-1]
    if _measure(word) > 1 and _double_consonant(word) and word.endswith("l"):
        word = word[:-1]

    return word
