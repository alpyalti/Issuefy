# Daily brief evidence regression

The prior summary path could bypass signal extraction by summarizing arbitrary
recently scraped snippets when no signals were accepted, or reuse older signals
as today's developments. It also stripped invented citation IDs while still
publishing the remaining text, including text left with no citations.

The new path selects undismissed, sourced signals created within today's UTC
calendar day, and only source rows linked to the selected signals in the same
project. No accepted signals/evidence means no model call or summary overwrite.
Missing or invalid returned citation IDs reject the entire output before writes;
one supporting source is allowed and duplicate source IDs are stored once.

`node --test tests/summary/evidence.test.cjs` exercises the real summary function
with stubbed database/model boundaries, including valid and invalid output.
These checks establish provenance boundaries, not semantic proof that a valid
citation supports every generated sentence. Historical signals/briefs are never
backfilled or deleted. Existing word-count retry behavior remains unchanged.

Each selected signal carries a deterministic primary source ID in the prompt.
The source batch includes those IDs (at most one per selected signal), so the
12-source cap cannot displace another selected signal's evidence with extra links.
If selected evidence disappears between reads, generation skips without writes.
