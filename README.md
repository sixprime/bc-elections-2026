# BC Vote 2026

An independent, unofficial, responsive prototype for the **October 24, 2026 British Columbia provincial election**. It runs entirely in the browser and is published as a static GitHub Pages site. No account, API key, database, runtime server, build step, or third-party front-end dependency is required.

## Preview and local development

Open the published GitHub Pages URL in the repository's About section. For local development, serve the repository folder because JavaScript `fetch()` loads two JSON files:

```sh
python3 -m http.server 4173
```

Then open `http://localhost:4173/`. Edit the files and refresh. All paths are relative so the same files work at `/bc-elections-2026/` on GitHub Pages.

## First vertical slice

- Desktop province overview and riding explorer, responsive mobile layouts and bottom navigation, closely following the earlier visual mockups.
- Searchable list of all 93 electoral districts; three source-checked 2024 riding result examples, including Coquitlam-Burke Mountain.
- Dated directory of every entry in Elections BC's September 25 party register PDF. The PDF contains 14 entries, though Elections BC's summary page currently says 13. The app follows the dated register and explains the difference.
- Five original pollster releases with links, field dates, sample and method; a simple current average and observed min/max across the newest release from each of two firms within the 14-day snapshot window.
- Separate, explicit areas for 2024 official results, 2026 professional polls, current candidate filings, and a community ballot design preview. There is **no seat forecast, riding projection, live ballot collection, or fabricated candidate data**.

## Data and updates

`election.json` holds snapshot metadata, party register entries, the 93 district names and official 2024 results. `polls.json` holds survey releases. Add new poll releases as new records rather than overwriting an old release; preserve any correction with a note. Data is reviewed and prepared locally, then committed to GitHub. The website itself performs no cross-origin scraping. The current average is anchored to the stated snapshot date, so it cannot silently claim to be live after a missed update.

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
index.html     Semantic page shell and navigation
styles.css     Responsive design system
app.js         Client-side routes, rendering, search and poll summary
election.json  Official source snapshots and riding examples
polls.json     Dated, source-linked poll release archive
*.svg          Small illustrations and icon
.nojekyll      Direct static publishing from the main branch
```

## Code license

MIT for original site code and SVG illustrations; see `LICENSE`. Election results are attributed to Elections BC, and poll release data remains attributed to the originating firms.
