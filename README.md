# BC Vote 2026

An independent, unofficial explorer for the **October 24, 2026 British Columbia provincial election**. It runs entirely in the browser on GitHub Pages. There is no application server, package installation or build step. Leaflet, Turf and Lucide are checked-in browser libraries. Node.js is needed only for the optional data-update script.

## Preview and local development

Open the published GitHub Pages URL in the repository's About section. For local development, serve the repository folder because JavaScript loads local data files:

```sh
python3 -m http.server 4173
```

Then open `http://localhost:4173/`. Edit the files and refresh. All paths are relative so the same files work at `/bc-elections-2026/` on GitHub Pages.

## First vertical slice

- Desktop province overview and riding explorer, responsive mobile layouts and bottom navigation, closely following the earlier visual mockups.
- Searchable list of all 93 electoral districts; three source-checked 2024 riding result examples, including Coquitlam-Burke Mountain.
- Candidate directory grouped by all registered parties, with alphabetical names, portraits, riding links and filters. A logo strip jumps to each party; Top restores the previous position. Accepted nominations and party announcements remain distinct.
- Dated directory of every entry in Elections BC's September 25 party register PDF. The PDF contains 14 entries, though Elections BC's summary page currently says 13. The app follows the dated register and explains the difference.
- A selected archive of 32 original polling releases from 2017-2026, with source links, field dates, sample and method. The current average still uses the newest release per firm in the 14-day snapshot window.
- Separate, explicit areas for 2024 official results, 2026 professional polls, current candidate filings, and a community ballot design preview. There is **no seat forecast, riding projection, live ballot collection, or fabricated candidate data**.

## Maps And Location

The riding explorer defaults to OpenStreetMap streets. The basemap starts from
the small district index while the larger riding overlay loads separately.
EOX satellite and terrain are also available. All 93 districts are clickable;
map controls toggle boundaries and reset to all of B.C. Mouse-wheel and trackpad
scrolling over the map zooms it; ordinary page scrolling remains unchanged outside it.

**Find my riding** requests browser geolocation only after a click, with
`enableHighAccuracy: true`, a 15-second timeout and no cached position. Phones may
use GPS; the browser and operating system choose the actual location source.
Desktop devices often return less precise Wi-Fi or network-based locations.
Uncertain positions and shared boundaries require confirmation. Out-of-province,
denied, unavailable and timed-out locations leave manual riding search available.

Full-resolution official polygons are downloaded only for nearby candidate
districts. Simplified geometry is used for display, not location matching.
Precise coordinates remain in memory, never in localStorage or URLs. Tile
providers receive the viewed area and ordinary network request metadata.
Current location is not necessarily a home riding. The result is unofficial;
confirm voter registration and district assignment with Elections BC.

Geolocation works on HTTPS GitHub Pages and localhost. Testing from a phone over
an ordinary LAN HTTP URL is not a secure context; use HTTPS for an actual device.

### Free Map Limits

- [EOX satellite](https://cloudless.eox.at/license-non-commercial) is free for
	non-commercial use under CC BY-NC-SA 4.0 with attribution. The 10 m Sentinel-2
	imagery is useful for provincial/regional context, not Google-style close-up
	aerial detail of individual houses. It is a 2024 mosaic, not live imagery.
- [EOX map services](https://maps.eox.at/#about) are best-effort and rate-limited,
	with no availability guarantee. Use a licensed service if the project becomes
	commercial or requires guaranteed capacity.
- [OpenStreetMap standard tiles](https://operations.osmfoundation.org/policies/tiles/)
	require attribution, normal browser caching and a valid referrer. No bulk
	downloads, offline tile packs or background prefetching are implemented.
- Leaflet is the renderer, not an imagery provider. Mapbox/MapTiler free tiers
	remain alternatives for higher-resolution imagery, but require an account/key
	and have usage limits. No paid service or billing account was configured.

Boundary source: [Elections BC / DataBC](https://catalogue.data.gov.bc.ca/dataset/1cba4b16-263f-4d42-8d84-f5fecaa03d1a).
Contains information licenced under the [Elections BC Open Data Licence](https://www.elections.bc.ca/docs/EBC-Open-Data-Licence.pdf).
Source metadata and the local licence copy are in `data/prod/`.

## Artwork Review

Open `/assets/` on the preview server to inspect downloaded portraits, logos and
press material. See [the data workflow](data/README.md) and
[the artwork manifest](data/prod/assets/manifest.json) for source links, hashes, candidate status,
coverage gaps and publication-review flags. Nothing in the inventory changes
the public candidate page's official-filing rules.

The political-parties directory displays verified logos and website links. Logos
are available for 12 of the 14 registered parties, including recovered OneBC and
CanWest artwork. BC Party and Party of Citizens still have no verified logo in
the inventory. Unavailable or unverified websites are labelled rather than guessed.
CanWest's official website is HTTP-only and is labelled accordingly.

## Data Updates

```sh
node tools/update-data.mjs fetch polls
node tools/update-data.mjs diff
```

The standalone script downloads original sources into `data/staging/`, prepares
editable JSON copies, and compares them with `data/prod/`. It requires no
packages and never publishes automatically. Review and normalize source material
before using `promote --approve`. See [the data workflow](data/README.md) for
supported sources, limits and the proposed GitHub Actions review process.

[election.json](data/prod/election.json) holds snapshot metadata, party register entries, the 93 district names and official 2024 results. [polls.json](data/prod/polls.json) holds approved survey releases. Add new releases as new records and preserve corrections with a note. The deployed website reads only prod data and performs no cross-origin scraping. The polling average is anchored to the stated snapshot date, not falsely presented as live after a missed update.

The chart defaults to six months, with 1-year, 5-year and 10-year range controls.
The source archive follows the selected range and pollster. Lines connect
observations within each pollster, but break at elections, unreported shares and
gaps over 120 days. BC Liberal observations retain their historical name rather
than being relabelled as BC United or the federal Liberals. The optional election-day
continuation holds the latest average unchanged: a no-change scenario, not a
forecast, confidence interval or seat projection.

For local review only, open `http://127.0.0.1:4173/?preview=staging#polls`.
That explicitly labelled preview reads staged polling data; other datasets still
come from prod. The preview parameter is ignored outside localhost/loopback.
It requires an open staging review. New research stays in staging until the user
approves production promotion; the requested historical archive has been promoted locally.

## GitHub Pages Deployment

The repository is configured for branch-based Pages publishing from `main`, `/`.
After committing the desired code and approved prod data, pushing to `main`
automatically starts the Pages deployment. No build step or UI action is needed.
Do not include `data/staging/` in the commit: there is deliberately no gitignore.

```sh
gh run list --repo sixprime/bc-elections-2026 --branch main --limit 5
```

To request another Pages build of the committed `main` branch without a new push:

```sh
gh api --method POST repos/sixprime/bc-elections-2026/pages/builds
```

Alternatively, view the `pages build and deployment` run under GitHub's Actions
tab and use **Re-run all jobs**. Neither route publishes uncommitted local files.

Polling rule: take the latest release per pollster from the 14 calendar days ending at the snapshot date. For each party reported separately by at least two pollsters, display the unweighted arithmetic mean and the observed minimum and maximum. An observed range is not a confidence interval. The release archive may also include older polls and differing question bases, which are labelled and excluded from this current average. Grouped residual party responses are never assigned to named parties.

### Primary sources

- [Elections BC 2026 election](https://elections.bc.ca/)
- [2024 Statement of Votes](https://elections.bc.ca/docs/rpt/statement-of-votes-2024-provincial-election.pdf) and [GIS spatial data](https://elections.bc.ca/resources/maps/gis-spatial-data/)
- [Registered political parties, dated September 25, 2026](https://elections.bc.ca/docs/fin/Registered-Political-Parties-Information.pdf)
- [2026 accepted candidate nominations](https://elections.bc.ca/2026-provincial-election/candidate-list/)
- Original releases from [Angus Reid Institute](https://angusreid.org/ballot-backlash-bc-conservatives-open-8-point-lead-after-snap-election-call-but-electorate-far-from-locked-in/), [Liaison Strategies](https://press.liaisonstrategies.ca/bc-ndp-leads-conservatives-41-to-36-as-election-begins/), [Research Co.](https://researchco.ca/2026/08/18/bcpoli-aug2026/) and [604 Polling](https://604polling.ca/). Each record links to its own primary source.

The site is independent and is not affiliated with Elections BC or a political party. Always use Elections BC for voting procedures and the latest official filings. Source data and third-party releases have their own terms; the code license does not relicense them.

## Structure

```text
index.html     Page shell and navigation
app.js         Client-side views, search and poll summary
map.js         Interactive map and location selection
assets/        Artwork review interface, not the image data
data/prod/     Published JSON, artwork, boundaries and licences
data/staging/  Pending source downloads and reviewed changes
data/sources.json  External source registry
tools/         Standalone data-update script
vendor/        Browser libraries and their licences
.nojekyll      Static GitHub Pages publishing
```

## Code license

MIT for original site code and SVG illustrations; see `LICENSE`. Election results are attributed to Elections BC, and poll release data remains attributed to the originating firms.
