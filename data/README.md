# Data Updates

All runtime data lives directly in this directory. Local preview and GitHub Pages
read the same files. Edit data in place and use Git for review, history and rollback.
The website remains entirely client-side; the update script is a local tool, not
a service.

## Update Flow

Run these commands from the repository root with Node 20+ and Git installed:

```sh
node tools/update-data.mjs fetch polls
node tools/update-data.mjs check
node tools/build-pages.mjs
node tools/build-pages.mjs --check
git status --short
git diff -- data
```

Review downloaded originals and edit the relevant JSON between `fetch` and
`check`. Downloads do not automatically become trusted poll figures, results,
candidates, programme excerpts or resized artwork. The script updates source
retrieval metadata in [provenance.json](provenance.json), but leaves those datasets
unchanged. It never commits or pushes.

After reviewing data edits, regenerate the static HTML, previews and sitemap
before publishing. The generator needs local Python/Pillow; use `--python` when
the interpreter is not on PATH. Its `--check` mode rejects stale generated pages.
See the [static publishing workflow](../README.md#static-pages-and-sharing).
Regenerate at the nomination deadline and when the verified final ballot changes;
pre-generated pages are dated snapshots, not live filings.

Supported source groups are `polls`, `election`, `programs`, `assets`, `map`,
`licenses` and `all`. A registered GraphQL source may issue a read-only query;
mutations are rejected before a request is sent. HTTPS is required except for
explicitly reviewed HTTP-only sources.

```sh
node tools/update-data.mjs source <id> <https-url> [group]
node tools/update-data.mjs cache
node tools/update-data.mjs check --sources
node tools/update-data.mjs prune-assets
```

An unregistered `source` defaults to the `programs` group. `prune-assets` only
reports unreferenced artwork and sidecars. Review its output before running
`prune-assets --apply`, then inspect the deletions in Git. Source PDFs and shared
source records are retained.

## Source Cache

Raw downloaded pages, PDFs and full-text quotation evidence stay outside the
repository. The default Windows location is
`%LOCALAPPDATA%/bc-elections-2026/source-cache`; other systems use
`~/.cache/bc-elections-2026/source-cache`. `cache` prints the actual directory.
Set `BC_VOTE_SOURCE_CACHE` to use another directory outside the repository.

Downloads are content-addressed and recorded in `retrievals.json` in that cache.
Refreshing a source retains the previous bytes used by existing quotations.
Failures are recorded separately, cause a nonzero exit, and do not replace data
with an empty response or error page. Empty files, oversized responses, invalid
JSON and invalid PDF signatures are rejected.

The cache is not a second application dataset. It contains source evidence only
and is never requested by the browser or published with the site.

## Candidate Sources

Before October 3, 2026 at 1 p.m. Pacific, use either an official party directory
or a dated official party press release to record a **party-announced** candidate.
The source must explicitly establish candidacy for this election and the riding;
do not infer it from an MLA profile, a previous election or a by-election announcement.
Portrait availability is not a condition for including a verified candidate.
Party sources cannot establish an **accepted** nomination: that status requires
the current Elections BC candidate list.

The current catalogue has 125 candidates: NDP 42, Conservative 59, CentreBC 8,
Green 7, OneBC 7, one independent and one unaffiliated. Eight nominations are
accepted by Elections BC in the retrieved provisional list. One riding assignment
remains unresolved. Missing photos are explicitly marked rather than fabricated.

```sh
node tools/update-data.mjs fetch election
node tools/update-data.mjs refresh-candidates
node tools/update-data.mjs check --sources
git diff -- data
```

Before running `refresh-candidates`, review the downloaded Elections BC PDF and
update [assets/sources/accepted-candidates.json](assets/sources/accepted-candidates.json).
Each candidate row permits only `name`, `district` and `partyId`; a blank official
party field means `unaffiliated`, not `independent`. Record its exact source URL,
SHA-256 and retrieval timestamp. The official PDF URL is case-sensitive and
currently ends in `.PDF`. `final` stays false until Elections BC publishes the
complete final list after the nomination deadline. The page's current list is
provisional, and absence from it before the deadline is not proof of withdrawal.

The refresh command merges the cached `cand2026` NDP feed and the sanitized
official records by identity and riding. It imports only approved fields,
preserves other reviewed party records and reuses portraits only for a matching
person. Elections BC overrides party status and affiliation. When importing a
verified final list, the party feed is not needed, and other records become
`not-on-ballot`. They remain historical records in the data but are excluded from
candidate views. The command validates everything before saving the catalogue.

Other parties' records can be edited directly in
[assets/manifest.json](assets/manifest.json) after checking their primary sources.
Use `statusSourceType: party-directory` or `party-release`. A press-release record
also requires `announcedOn`, `sourceElectionDate: 2026-10-24`, its `statusSource`
URL and `statusSourceSha256`. The source must belong to that party's verified
domain and match the cached original. Existing candidate-release URLs are included
by `fetch election`; a new release can first be retrieved with
`source <id> <https-url> election`. Older releases are not silently relabelled as
2026 candidacies. Record a release only after reading its explicit nomination
statement; a search snippet or an opponent's characterization is not sufficient.

After the deadline, the shared candidate policy uses only `accepted` records in
`candidateSnapshot.officialCandidateIds`, backed by the matching Elections BC
source and a verified final-list timestamp. A stale or incomplete snapshot shows
**awaiting verification**, not a partial final ballot. Refresh and publish the
final list after it is available; the client does not scrape Elections BC at runtime.

### Financial-Agent Privacy

Do not publish candidates' financial-agent names, addresses or telephone numbers.
The candidate PDF carries use restrictions; the guide needs candidate identities,
not agent contacts. Keep the original PDF in the external cache, not in `data/`.
Only the sanitized candidate-only record and source URL/hash are published.

PDF text visitors can merge adjacent columns into one string. Exclude agent
columns at the individual text-operation or word-coordinate level before retaining
text, and verify the layout rather than trusting a paragraph's starting position.
Do not copy party-feed email, social/contact or biography fields into the catalogue.
Validation uses field allowlists and rejects raw candidate-list PDFs in public data.

## Quote-Only Party Programmes

The required editorial rule is verbatim quotation only. Do not paraphrase,
interpret, assess, judge or comment on a party's programme. Do not turn missing
review data into claims about what a party has or has not proposed. Readers must
be able to distinguish the original words from navigation and source metadata.

The schema-v2 dataset has 14 party records, 66 selected excerpts and
22 source records. It contains no policy summaries, assessments or commentary.
Each excerpt appears inside visible quotation marks, labelled as a verbatim
excerpt, with its speaker or publishing party, source title, publication date
or year when recorded, and a link to the full original. The excerpts are not
presented as complete platforms. Entire copyrighted documents are linked, not
republished.

### Source Verification

Use the original wording and punctuation. Normalize only display whitespace;
do not fix a source's spelling, silently alter numbers, join unrelated fragments,
invent timestamps or attribute party-authored text to a named speaker.

Store parsed source evidence at `sources/programs/quotation-evidence.json`,
relative to the external source cache. Its schema version is 1 and its `sources`
array contains each source's `id`, cached `path`, `sourceSha256` and parsed `text`.
The path and raw hash must match a record in the cache's `retrievals.json`.
[programs.json](programs.json) stores raw-source and parsed-text fingerprints,
and each quotation stores its own text fingerprint. Only the selected excerpts,
attribution and fingerprints belong in the repository, not the full source text.

`check` requires source evidence whenever the programme file differs from its
committed Git version or is new. `check --sources` always verifies the evidence.
An unchanged committed programme file can be checked without the cache. It verifies
raw source bytes against the retrieval record, parsed text against its stored
fingerprint, and each excerpt against that text without altering punctuation.
It rejects changed quotes, missing attribution, unknown editorial fields and
quotes that do not occur in the source. Excerpts are capped at 45 words each
and 200 words combined per source URL. These limits do not replace reviewing
context or source-specific reuse terms.

Any later programme edit must match retained source evidence before commit.
The previous paraphrased schema is rejected by the application and updater.

### Programme View

Clickable issue tags select one topic at a time and wrap on smaller screens.
Issue tags and party columns use alphabetical label order, including custom selections.

Each topic defaults to parties with at least one recorded programme quotation
on that topic. A visible note explains the default and that any party may be
chosen. This is based on reviewed excerpts, not an assertion that an unselected
party has no policy on the topic.

The checkbox picker supports all 14 registered parties, with Use topic defaults,
Select all and Clear selection. Custom choices, including an empty selection,
are remembered separately for each topic. Use topic defaults restores automatic
selection for the current topic without changing choices for other topics.
Six columns fit at desktop widths of 1280 px and above. Narrower screens and larger selections
scroll horizontally, keeping all selected parties and readable column widths.
The table expands to its full height with the page, with no internal vertical
scrollbar. When up to six columns fit on desktop, headings stay visible while
the page scrolls. Choices persist when resizing and switching views.

The rows contain quotations and original sources only. Explore a party offers
the same excerpts with search and a topic index. Empty states say that no
quotation is recorded for that selection; they do not infer a position. No
separate cost, implementation or timetable assessment is generated.

The local programme view is `http://127.0.0.1:4173/parties/`. It requires no
preview parameter. Publication still requires an approved commit and push.

## Data Integrity

`check` validates poll dates, samples and shares; 2024 candidate and provincial
vote totals; current candidate identities and riding assignments; the separate
MLA roster; district counts; and artwork and boundary file hashes.

Asset refresh downloads originals into the cache. Replacing a published image
also requires updating its manifest hash and any web derivative. Manifest paths
are relative to this data directory, not the website root. Keep accepted
nominations separate from party announcements, and MLA membership separate from
candidacy. Preserve image attribution and source-specific reuse terms.

Historical party identities stay attached to their original records. The June
2025 proposed unnamed party is not retrospectively treated as OneBC. The March
2026 ARI residual-total inconsistency remains documented, not redistributed
among other parties.

Map tiles remain remote and follow the provider's caching terms; do not harvest
them. Browser libraries in `vendor/` remain separately reviewed application code.
