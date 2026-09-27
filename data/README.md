# Data Updates

The deployed website reads only `prod/`. Staging never changes production numbers.
An explicit localhost review is available at
`http://127.0.0.1:4173/?preview=staging#polls`, with a visible staging banner.
It also supports riding results, candidates and their artwork. Refresh the
change index with `node tools/update-data.mjs diff` after editing staging.
Only changed files come from staging; unchanged files still come from prod.

```text
data/
  sources.json
  prod/
    election.json
    polls.json
    assets/        manifest, originals, web images, source records
    map/           display boundaries, district index, geography metadata
    districts/     precise per-riding boundaries
    licenses/
  staging/         created by the updater; same paths for reviewed data
    sources/       raw downloads for review, not publication
    _review.json   source URLs, hashes, failures, prod-snapshot baseline
    _diff.json     file changes, reviewed removals and record IDs
```

## Commands

Requires Node.js 20 or newer, with no package installation.

```sh
node tools/update-data.mjs fetch polls
node tools/update-data.mjs diff
node tools/update-data.mjs check
node tools/update-data.mjs promote --approve
```

`fetch` accepts `polls`, `election`, `assets`, `map`, `licenses` or `all`.
The source registry is extended using the source URLs already recorded in prod
polls, artwork and geography. Pollster feeds help identify newly published releases.
`fetch` refuses to overwrite an existing review. `discard --approve` removes only
staging when a review is no longer needed.

To append a newly discovered primary source without replacing an open review:

```sh
node tools/update-data.mjs source poll-source-id https://publisher.example/release.pdf
```

New source evidence is stored under the current review's group. An `all` review
uses the polling group for manually appended sources.

To queue obsolete artwork for removal after reviewing the staged catalogue:

```sh
node tools/update-data.mjs prune-assets
node tools/update-data.mjs diff
node tools/update-data.mjs check
```

Cleanup compares the staged asset manifest with prod originals, web images and
per-asset source records. It records removals in the review without deleting
production files. Referenced assets, source PDFs and the candidate/party-register
retrieval records are retained. Promotion rejects removal of artwork that the
reviewed catalogue still references, and guarded resume verifies the reduced
file set as well as additions and replacements.

## Election Records

The complete 2024 import uses the official Statement of Votes candidate tables
on PDF pages 10-17 and the independent district tables on PDF pages 18-20.
All 93 district sums, 322 candidate records, 2,105,341 valid votes, affiliation
totals and the 47/44/2 seat split were cross-checked. Per-riding links point to
the relevant PDF page. `resultsCoverage2024.complete` makes complete coverage,
candidate count, provincial votes and seat totals required validation gates.

Candidate updates combine accepted Elections BC nominations with explicit
party announcements. An accepted candidate is not removed merely because a
party directory omits them. Missing or ambiguous riding assignments use null
district/slug fields, `districtStatus: unresolved`, the original reported label
and an explanation. They appear in the catalogue without being attached to a
guessed riding. Federal riding names are not aliases for provincial districts.

The separate `members` collection follows the Legislature's roster at
dissolution on September 22, 2026. `memberSnapshot` records the parliament,
source date and districts with no active member listed. Its 91 member records
and two unlisted districts must account for all 93 ridings without duplication.
Member records never enter the candidate list automatically. Affiliation at
dissolution is kept separate from the 2024 ballot affiliation.

The registered Legislature source uses a read-only GraphQL query by POST.
Its query body is retained in source provenance as well as the response hash.
The updater rejects mutation operations. Portraits are matched by verified
member identity, not inferred from the member's present party. Ninety member
portraits are available; Jordan Kealy has an explicit missing-portrait note.
The Legislature's restricted images were not republished. Licensed images keep
creator and licence attribution in the riding view and artwork review.

## Polling Records

The requested historical update is now in prod: 32 selected primary-source
releases spanning April 2017 to September 2026 fieldwork. The default six-month
view contains nine releases. The archive is not exhaustive; gaps are not filled
with invented observations. Research Co. archive responses and the original
Angus Reid 2017 report were reviewed alongside release methodology. Source URLs
and retrieval hashes are recorded in provenance, and record-specific caveats
remain in the polling JSON.

Federal polls, exit polls and hypothetical leadership ballots were excluded.
Historical BC Liberal shares are separate from BC United, using names as asked.
The June 2025 proposed unnamed party is not retrospectively treated as OneBC.
The March 2026 ARI residual-total inconsistency remains documented, not corrected
or assigned to other parties.

Review the downloads and edit the staged JSON before promotion. The current script
does not automatically turn arbitrary HTML/PDF tables into trusted polling figures,
rebuild simplified boundaries, discover every new candidate, or resize new artwork.
Asset refresh downloads the original sources; replacing an image also requires
updating its manifest/hash and any web derivative. Paths in the artwork manifest
are relative to the snapshot root, not the website root.

Promotion checks poll fields/dates/shares, result totals, candidate identities
and riding assignments, district counts, reviewed removals and file hashes, and
refuses to overwrite a prod snapshot that changed since review began. It swaps
the prepared snapshot into place with rollback on a failed rename. It does not
commit or push. Raw review downloads are discarded after promotion; source URLs,
retrieval timestamps and hashes are retained in `prod/provenance.json`.

If Windows blocks the final folder rename, the prepared snapshot is retained.
After the lock clears, `promote --approve --resume` verifies every prepared file
and the source provenance against the unchanged review before retrying the swap.
It refuses to resume a different or edited prepared snapshot.

## Recommended Automation

Use a scheduled or manually triggered GitHub Action to fetch sources, retain
staging as a review artifact, and open a PR containing only reviewed prod data.
Merging that PR can trigger the existing Pages deployment. Keep raw staging out of
the published repository; it may contain copyrighted pages or unwanted contact data.
This workflow is a proposal, not an installed GitHub Action.

Add small source-specific extractors gradually, starting with primary pollsters
and structured Elections BC data. A source layout change must stop that import,
not erase the last good dataset. Compare normalized records by stable ID and show
field changes, corrections and withdrawals explicitly. Git history provides the
published archive; no duplicate dated copies are needed in the public data tree.

Keep accepted nominations separate from party announcements. Downloaded logos and
portraits retain their original rights; `reuse.publishApproved: false` is not a
licence to publish them. Prefer press-kit originals and preserve attribution.
OneBC's verified site is `https://1bc.ca/`. CanWest's legacy HTTP-only source is
explicitly marked `allowInsecureHttp`; HTTPS remains required for other sources.

Map tiles remain remote and follow the provider's caching terms; do not harvest
them. The checked-in browser libraries in `vendor/` are application code, not
election data, and should have separately reviewed, pinned-version updates.
