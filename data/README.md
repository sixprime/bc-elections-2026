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

The catalogue follows the final Elections BC list retrieved on October 4, 2026:
355 accepted candidates in 93 ridings (NDP 92, Conservative 93, Green 73,
CentreBC 35, OneBC 33, Libertarian 4, Communist 4, CHP 3, CanWest 2, Freedom 1,
independent 7, unaffiliated 8). Two earlier party-announced records, Kim Lockhart
(CentreBC) and Brent Chapman (OneBC), are not on the final ballot and are kept as
`not-on-ballot`. Missing photos are explicitly marked rather than fabricated.

```sh
node tools/update-data.mjs fetch election
node tools/update-data.mjs refresh-candidates
node tools/update-data.mjs check --sources
git diff -- data
```

Before running `refresh-candidates`, review the downloaded Elections BC candidate
list and update [assets/sources/accepted-candidates.json](assets/sources/accepted-candidates.json).
Each candidate row permits only `name`, `district` and `partyId`; a blank official
party field means `unaffiliated`, not `independent`. Official party fields use
registered abbreviations, such as `CWP` for `canwest`, which the guide displays
as CanWest Party. Record the list's exact source URL, SHA-256 and
retrieval timestamp. The registered `elections-bc-candidates` source is
the candidate-list page, which states that it shows the final candidates; the
`elections-bc-candidates-csv` download is a cross-check. The CSV is Windows-1252,
not UTF-8, and also contains agent columns, so read only its candidate columns.
The older `Candidate-Website-Report.PDF` still listed only 286 of the 355 final
rows on October 4 and is no longer used. Before reconciling, align a party-announced
record's name with the ballot name only when the same party has that riding; keep
its identifier so its portrait remains attached.

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

Do not publish candidates' financial-agent or official-agent names, addresses or
telephone numbers. The official candidate list carries use restrictions; the guide
needs candidate identities, not agent contacts. Keep the original page, CSV and any
PDF in the external cache, not in `data/`.
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

The schema-v2 dataset has 14 party records, 176 selected excerpts and
73 source records. It contains no policy summaries, assessments or commentary.
Each excerpt appears inside visible quotation marks, labelled as a verbatim
excerpt, with its speaker or publishing party, source title, publication date
or year when recorded, and a link to the full original. The excerpts are not
presented as complete platforms. Entire copyrighted documents are linked, not
republished.

The Conservative record includes 12 exact excerpts (184 words combined) from its
official Policy Declaration, adopted March 1, 2025. The platform-page placeholder
is retained as a source link but is not counted as policy. Coverage spans 12 topics.
The former Other topics category is removed; its sole CanWest statement belongs
to Economy & resources, with its wording and source unchanged.
The 2025 document is not labelled as a newly
released 2026 platform. Its adoption date is in the source title; the unknown
publication date remains unset. The full PDF and parsed evidence stay in the
external cache, with page/section locators and hashes attached to the excerpts.

The September 28 source audit added the full CHP policy statement, Green platform
chapters, the Libertarian 2026 platform index and its detailed article set.
Weak slogans and placeholders were removed or replaced with exact substantive
passages. All 45 source records have refreshed raw/text fingerprints and a
validated `kind`: platform, policy-declaration, policy-page, campaign-announcement,
record-and-priorities, vision-statement, party-website, source-index or
programme-update. Original dates stay attached to older documents; a link from
a 2026 index does not change an article's original publication date.

The October 4 campaign audit added 28 dated official sources: nine NDP campaign
releases, eight Conservative releases and statements plus the linked BC Energy
Superpower Plan PDF, eight Green releases plus the Green Our Plan page, and the
CHP's 2026 Platform Priorities. The energy plan PDF has letter-spaced and
reordered text in extraction, so it is linked without excerpts. The NDP Action for
You page and the Communist platform page were rewritten by their parties; their
source fingerprints were refreshed and only quotations present in the current text
were kept or replaced. Retained earlier evidence remains in the cache.

Four party records still have no verified programme document: BC Party, BC United,
B.C. Vision and Party of Citizens. NDP coverage comes from its official
record/priorities page and dated campaign releases, not a verified complete current
platform. These are gaps in this guide's evidence, not claims about what the parties
have or have not proposed.

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
Issue tags are alphabetical. Party columns retain alphabetical label order
within the pinned and unpinned groups, including custom selections.

Each topic defaults to parties with at least one recorded programme quotation
on that topic. A visible note explains the default and that any party may be
chosen. This is based on reviewed excerpts, not an assertion that an unselected
party has no policy on the topic.

The checkbox picker supports all 14 registered parties, with Use topic defaults,
Select all and Clear selection. Custom choices, including an empty selection,
are remembered separately for each topic. Use topic defaults restores automatic
selection for the current topic without changing choices for other topics.
The programme view uses the same page-width cap as other views, with a 200px
minimum for desktop columns and no four-column limit. Scroll mode keeps native
horizontal scrolling, adds a visible top scrollbar and moves between groups with
previous/next controls. Pages mode renders only the current group of complete
columns. Either mode can pin any number of selected parties on the left using
checkboxes, Pin all or Unpin all. When more pins are selected than fit, separate
pinned-group controls make every pin reachable while reserving at least one
column for any unpinned parties. No pins are silently dropped on resize and
the page does not widen or shrink its text to fit them.
The current range is visible and announced to screen readers. A focused table
accepts Left/Right for columns (Scroll) or groups (Pages), and Home/End for the
beginning/end. When all selected parties are pinned, these keys navigate the
pinned group instead. Movement never wraps and respects reduced-motion preferences.
At phone widths up to 720 px, each selected party has a vertical section with
the same quotations, without sideways scrolling.
Desktop columns never wrap into multiple rows.
The table expands to its full height with the page, with no internal vertical
scrollbar. Navigation stays available while the page scrolls; at wide desktop
widths, headings also stay visible when the table fits. Selections, presentation,
pinning and both navigation positions persist across resizing, view and language
changes. Changing the topic resets the unpinned position while restoring that
topic's selection. A pin is removed when its party leaves the comparison.

The table contains quotations only, each with its own source link. Explore a
party offers the same excerpts with search and a topic index. Empty states say
that no quotation is recorded for that selection; they do not infer a position.
No separate cost, implementation or timetable assessment is generated.

The source-coverage panel lists every registered party, full-document links,
source kinds, dates and recorded topic counts. It is also present in the static
HTML and stays open across language/view changes. Quotation/source counts must
never be described as proof that a complete platform has been imported.

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

Public renderers require the strict boolean `reuse.publishApproved: true` for
portraits, logos and gallery downloads/previews. Source availability is not
publication approval. Withheld images (any flag other than `true`) must not be
stored under `data/`: keep their original and web files in the Git-ignored
`private-images/` folder at the repository root, using the same relative paths,
and keep their manifest records, hashes and source sidecars. `check` rejects a
withheld image under `data/` and, when `private-images/` exists, verifies every
private copy against its manifest hash. Publishing an image after permission
means moving its files back under `data/` and setting the flag to `true`.

`node tools/update-data.mjs compact-map` rounds only the simplified display map
to five decimals, retaining all 93 features and 92,929 positions. The command
rejects invalid or collapsed rings and records `displayCoordinateDecimals` in
the geography metadata. Full-resolution district files, their hashes and the
location-matching algorithm remain unchanged.

Historical party identities stay attached to their original records. The June
2025 proposed unnamed party is not retrospectively treated as OneBC. The March
2026 ARI residual-total inconsistency remains documented, not redistributed
among other parties.

Map tiles remain remote and follow the provider's caching terms; do not harvest
them. Browser libraries in `vendor/` remain separately reviewed application code.
