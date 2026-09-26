# Data Updates

The deployed website reads only `prod/`. Staging never changes production numbers.
An explicit localhost polling review is available at
`http://127.0.0.1:4173/?preview=staging#polls`, with a visible staging banner.

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
    _diff.json     file changes and added/changed/removed record IDs
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

Promotion checks poll fields/dates/shares, district counts and file hashes, and
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
