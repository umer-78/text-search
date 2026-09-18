"""Writes the sample corpus in corpus/.

Twelve short documents, written for this repository rather than collected, so
nothing here carries a licence and every word in every test assertion is known.
They overlap deliberately — several mention indexing, several mention caching —
because a corpus where every document is about something different makes ranking
look better than it is.
"""

from __future__ import annotations

from pathlib import Path

CORPUS = Path(__file__).resolve().parent.parent / "corpus"

DOCUMENTS = {
"inverted-index.txt": ("Inverted indexes", """
An inverted index maps each term to the list of documents containing it. Building
one is the first thing a search engine does and the last thing it undoes. For each
document the text is tokenised, folded to lower case and usually stemmed, and each
resulting term gains a posting: the document identifier, and often the positions
where the term occurred.

Storing positions costs space and buys phrase search. Without them an index knows
that a document contains both new and york but not whether the two words sat next
to each other, and a query for the phrase new york will return every document
mentioning New Mexico and the House of York.
"""),
"bm25.txt": ("BM25 ranking", """
BM25 scores a document against a query by summing a contribution per term. Each
contribution multiplies an inverse document frequency by a saturating function of
the term frequency. Saturation is the important part: the tenth mention of a word
adds far less than the second, because a document is not ten times more about a
subject for repeating itself.

The other half is length normalisation. A long document contains more words and so
mentions everything more often. Dividing by the ratio of this document's length to
the average keeps a thousand-word page from beating a focused paragraph simply by
being longer. The parameter b controls how strongly that applies.
"""),
"stemming.txt": ("Stemming and its costs", """
A stemmer reduces related words to a shared form so that a search for running also
finds runs and ran. The Porter algorithm does this with a sequence of suffix rules
guarded by a syllable count, and it is fast, deterministic and entirely unaware of
meaning.

That unawareness has a price. University and universe both reduce to univers, so a
search for one retrieves the other. Lemmatisation avoids the collision by consulting
a dictionary, at the cost of needing one. Whether the trade is worth making depends
on the corpus, which is why stemming should be a setting rather than a fixture.
"""),
"caching.txt": ("Caching search results", """
Query traffic follows a long tail: a small number of queries account for a large
share of requests. Caching the result list for those queries removes most of the
ranking work, and a cache keyed on the normalised query string is usually enough.

The difficulty is invalidation. A document added to the index can change the ranking
of any query that touches its terms, and tracking that precisely costs more than the
cache saves. Most systems accept staleness measured in seconds and expire entries on
a timer rather than on a signal.
"""),
"tokenisation.txt": ("Tokenisation", """
Tokenisation decides what a word is, and the answer is never obvious. Splitting on
whitespace leaves punctuation attached. Splitting on every non-letter breaks don't
into two fragments that mean nothing. Languages without spaces between words need a
different approach entirely.

Case folding and accent stripping make cafe and Café the same term, which is usually
wanted and occasionally destroys a distinction that mattered. Every step here is
lossy, and writing them out rather than importing them is what makes the losses
visible.
"""),
"stopwords.txt": ("Stopwords", """
Stopwords are the words too common to discriminate between documents: the, of, and,
to. Removing them shrinks the index and speeds up queries that would otherwise scan
enormous posting lists.

Removing them also breaks phrase search. To be or not to be consists entirely of
stopwords, and an index that dropped them cannot find the line at all. A reasonable
compromise keeps a placeholder where the stopword stood, so positions stay true and
adjacent terms remain adjacent.
"""),
"spelling.txt": ("Spelling correction", """
A query with a typo matches nothing, and returning nothing is the worst answer a
search box can give. Edit distance measures how many insertions, deletions and
substitutions separate two strings, and terms within one or two edits of the query
make plausible corrections.

Computing that distance against every term in the vocabulary is expensive, so an
implementation abandons a comparison as soon as it cannot come in under the
threshold. Where two corrections are equally close, the one appearing in more
documents is usually the one intended.
"""),
"phrase-queries.txt": ("Phrase queries", """
A phrase query asks for terms adjacent and in order. With positions recorded in the
index the check is direct: for each document containing every term, look for a
position p where the first term sits at p, the second at p plus one, and so on.

Phrase queries are strict, and that strictness is the feature. A user who quotes a
phrase has said they want exactly that phrase, and a ranked search that returns
near misses has ignored them.
"""),
"boolean-queries.txt": ("Boolean queries", """
Boolean retrieval answers whether a document matches, not how well. AND intersects
posting lists, OR unions them, NOT subtracts from the full set. The result is a set,
and presenting it in an arbitrary order is more honest than inventing a ranking the
query never asked for.

Boolean and ranked retrieval are often combined: a boolean filter narrows the
candidates, then a ranking function orders what survives. Filters over metadata such
as language or date fit this shape naturally.
"""),
"compression.txt": ("Compressing posting lists", """
Posting lists are long and highly compressible. Document identifiers in a list are
sorted, so storing the gaps between them rather than the values themselves makes the
numbers small, and small numbers encode in fewer bits with a variable-length scheme.

Compression trades processor time for memory bandwidth and usually wins, because a
list that fits in cache is read far faster than one that does not. The same argument
explains why indexes are stored as immutable blocks and rebuilt rather than edited.
"""),
"evaluation.txt": ("Evaluating a search engine", """
Precision is the share of returned documents that were relevant. Recall is the share
of relevant documents that were returned. Improving either usually costs the other,
and a system tuned on one alone is easy to make look excellent and useless.

Ranked retrieval needs measures that care about order. Mean average precision and
normalised discounted cumulative gain both reward putting relevant results near the
top, which is what a person scanning the first page actually experiences.
"""),
"scaling.txt": ("Scaling an index", """
A single index fits on one machine until it does not. Sharding splits the documents
across machines, each building an index over its own share; a query goes to every
shard and the partial result lists are merged. Adding machines then adds capacity
almost linearly.

Replication is the other axis: several copies of each shard serve reads and survive
failures. The two combine, and the arithmetic of how many of each to run is mostly a
question of how much traffic arrives and how much downtime is tolerable.
"""),
}


def main() -> None:
    CORPUS.mkdir(exist_ok=True)
    for name, (title, body) in DOCUMENTS.items():
        text = f"{title}\n{body.strip()}\n"
        (CORPUS / name).write_text(text, encoding="utf-8")
    words = sum(len(body.split()) for _title, body in DOCUMENTS.values())
    print(f"{len(DOCUMENTS)} documents, about {words:,} words")


if __name__ == "__main__":
    main()
