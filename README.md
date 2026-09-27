# BC Election Guide

Your province. Your voice. Your choice.

An independent, unofficial explorer for the **October 24, 2026 British Columbia provincial election**. It runs entirely in the browser on GitHub Pages. There is no application server, package installation or build step. Leaflet, Turf and Lucide are checked-in browser libraries. Node.js is needed only for the optional data-update script.

## Preview and local development

Open the published GitHub Pages URL in the repository's About section. For local development, serve the repository folder because JavaScript loads local data files:

```sh
python3 -m http.server 4173
```

Then open `http://localhost:4173/`. Edit the files and refresh. All paths are relative so the same files work at `/bc-elections-2026/` on GitHub Pages.

## First vertical slice

- Desktop province overview and riding explorer, responsive mobile layouts and bottom navigation, closely following the earlier visual mockups.
- Searchable list of all 93 electoral districts, with source-checked 2024 vote tables and 2026 candidate records on riding pages. Complete result snapshots are checked against district, party and seat totals.
- Candidate directory grouped by all registered parties, with alphabetical names, portraits, riding links and filters. A logo strip jumps to each party; Top restores the previous position. Accepted nominations and party announcements remain distinct.
- Dated directory of every entry in Elections BC's September 25 party register PDF. The PDF contains 14 entries, though Elections BC's summary page currently says 13. The app follows the dated register and explains the difference.
- A selected archive of 32 original polling releases from 2017-2026, with source links, field dates, sample and method. The current average still uses the newest release per firm in the 14-day snapshot window.
- Separate, explicit areas for 2024 official results, 2026 professional polls and current candidate filings. There is **no seat forecast, riding projection, live ballot collection, or fabricated candidate data**.
- About retains the source and methodology notes and ends with a contact link to `contact@bcelectionguide.ca`, also available in the shared footer. Email opens the user's mail client; no contact-form service is configured. Existing `#methodology` links still open About.
- Community Ballot is removed from navigation and routing. It may return as a separately designed future feature; the previous prototype remains in Git history.

## Maps And Location

The riding explorer defaults to OpenStreetMap streets. The basemap starts from
the small district index while the larger riding overlay loads separately.
EOX satellite and terrain are also available. All 93 districts are clickable;
map controls toggle boundaries and reset to all of B.C. Mouse-wheel and trackpad
scrolling over the map zooms it; ordinary page scrolling remains unchanged outside it.

Moving between riding detail pages retains the live map, center, zoom, basemap
and overlay settings, as well as the page scroll position. Selecting a riding
updates its details and boundary highlight without panning, zooming or animating
the camera, regardless of its size or visibility. Users control panning and zoom
themselves. Initial map framing and explicit reset/location actions are unchanged.
The dated MLA portrait and affiliation stay in the riding header above the map.

All map views colour ridings by their **2024 winning party**, with 24% opacity
and a modest 34% hover highlight so the basemap remains visible. Solid orange
(`#f97316`), blue (`#0057ff`) and green (`#00a63e`) match the party colours used
elsewhere in the site. Hatching and dot patterns are not used. A dark 1.6 px
boundary has a light 4.4 px outer edge for contrast over streets, satellite and
terrain; the selected riding uses a heavier outline. A legend shows loaded
result counts, tooltips include the winner, vote share and margin, and the
riding directory lists each loaded winning party.
Party fills and boundary strokes have separate controls. These are historical
election affiliations, not current MLA affiliations or a 2026 forecast. Missing
results remain neutral and are counted as not loaded. Review data edits locally
and in Git before publishing.

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
Source metadata and the local licence copy are in `data/`.

## Artwork Review

Open `/assets/` on the preview server to inspect downloaded portraits, logos and
press material. See [the data workflow](data/README.md) and
[data/assets/manifest.json](data/assets/manifest.json) for source links, hashes, candidate status,
coverage gaps and publication-review flags. Nothing in the inventory changes
the public candidate page's official-filing rules.

The political-parties directory displays verified logos and website links,
including recovered OneBC and CanWest artwork. BC Party, B.C. Vision and Party
of Citizens have no verified logo in the directory. Unavailable or unverified
websites are labelled rather than guessed.
CanWest's official website is HTTP-only and is labelled accordingly.

Riding pages show a separate **MLA at dissolution** profile from the
Legislature's September 22, 2026 roster: 91 members across the 93 districts.
The two districts not listed as having an active member are identified explicitly.
Membership is not treated as a 2026 candidacy, and historical election results
retain their original affiliations.

The member catalogue has 90 sourced portraits; Jordan Kealy's portrait remains
unavailable rather than being guessed or copied from the Legislature under
terms requiring permission. Existing portraits are reused, with additional
images from official archived/member sources. Tara Armstrong's Commons portrait
is attributed to Othman Mekhloufi under CC BY-SA 4.0; the resized derivative
retains that licence. The artwork review includes a separate MLA collection.

## Data Updates

```sh
node tools/update-data.mjs fetch polls
node tools/update-data.mjs check
git status --short
git diff -- data
```

All runtime data lives directly in `data/`. Edit those files, validate them and
review the changes in Git before committing. The local preview and GitHub Pages
use the same paths. Git provides history and rollback; no separate data-copy or
promotion step is required.

The standalone script downloads original sources into a local cache outside the
repository and updates retrieval metadata in [data/provenance.json](data/provenance.json).
It never automatically rewrites election, poll, programme or artwork datasets.
Raw source downloads and full-text quotation evidence are not published. The
script requires Node 20+ and Git, no packages or server, and never commits or
pushes. See [data/README.md](data/README.md) for commands and verification details.

[data/election.json](data/election.json) holds snapshot metadata, party register entries, the 93 district names and official 2024 results. [data/polls.json](data/polls.json) holds approved survey releases. Add new releases as new records and preserve corrections with a note. The deployed website reads checked-in data and performs no cross-origin scraping. The polling average is anchored to the stated snapshot date, not falsely presented as live after a missed update.

Party programmes use a separate reviewed dataset. The local Parties view opens
with an issue-focused comparison that defaults to parties with a recorded
programme quotation on the selected topic. This rule is stated above the party
picker; it describes the reviewed excerpts, not the full scope of each platform.
Clickable issue tags and comparison columns use alphabetical label order,
including manual party selections.
The picker supports any selection of the 14 registered parties, including all 14.
Use topic defaults restores the automatic selection. Six columns fit at desktop
widths of 1280 px and above; narrower screens and larger selections scroll
horizontally without hiding selected parties. The table expands to its full
height with the page, with no internal vertical scrollbar. When up to six columns
fit on desktop, headings stay visible while the page scrolls.
Both views display only selected verbatim excerpts in visible quotation marks,
with attribution, source dates and links to the original full text.
There are no paraphrased policies, editorial assessments or inferred cost and
implementation rows.

The separate Explore a party view has topic and text filters, a compact topic
index and the same source-attributed quotations. Custom comparison selections
are remembered separately for each topic and retained when switching views or
resizing. Dates identify older sources without
rewriting their wording. No quotation is an inferred position or an endorsement.
Full platforms are linked rather than republished. Programme edits must match
the cached source evidence before being committed. An unchanged Git checkout
can be validated without the source cache; `check --sources` explicitly repeats
full source-text verification when that cache is available.

```sh
node tools/update-data.mjs fetch programs
node tools/update-data.mjs check --sources
git diff -- data
```

The chart defaults to six months, with 1-year, 5-year and 10-year range controls.
The source archive follows the selected range and pollster. Lines connect
observations within each pollster, but break at elections, unreported shares and
gaps over 120 days. BC Liberal observations retain their historical name rather
than being relabelled as BC United or the federal Liberals. The optional election-day
continuation holds the latest average unchanged: a no-change scenario, not a
forecast, confidence interval or seat projection.

Open `http://127.0.0.1:4173/#polls` or `http://127.0.0.1:4173/#parties` to review
local changes. No special preview parameter is needed. Refresh the page after
editing data. Publication still requires an approved commit and push.

`node tools/update-data.mjs prune-assets` reports unreferenced artwork and obsolete
artwork sidecars without changing files. After reviewing the report, use
`prune-assets --apply` to remove them directly and inspect the deletions in Git.
Source PDFs and their retrieval records are retained.

## Visitor Analytics

No visitor analytics is installed. GitHub repository **Insights / Traffic**
measures visits to the repository, not this GitHub Pages website. GitHub does not
provide the site owner with a visitor dashboard or historical access logs.

A custom domain is not required. [Cloudflare Web Analytics](https://developers.cloudflare.com/web-analytics/get-started/)
can be installed manually on the existing Pages hostname with a free account and
a JavaScript snippet, without moving hosting or DNS. [Plausible](https://plausible.io/docs/hash-based-routing)
is a paid, privacy-focused alternative with explicit support for this site's
hash routes. Hash-aware tracking is needed to distinguish views such as `#polls`
and `#riding/...`, rather than reporting only the HTML document.

Collection starts after installation; previous visits cannot be reconstructed.
Locations are approximate network-derived statistics, not GPS positions or
identified people. Do not send riding-location coordinates, search input or any
future ballot choices to analytics. Provider selection and installation require
separate approval.

## Custom Domain And Email Setup

The chosen address is `https://bcelectionguide.ca/`, with
`contact@bcelectionguide.ca` for correspondence. The root presents the latest
covered B.C. election; there is no `/2026/` subdirectory. Dates in the content
still identify the election and source snapshots explicitly.

CanSpace manages the domain and DNS, GitHub Pages serves the website with free
HTTPS, and Zoho hosts email. These instructions do not activate any accounts or
change the live site. Complete and test the mailbox before publishing the new
footer contact link.

Prices checked September 27, 2026, before tax: CanSpace domain registration
C$11.99 for one year, renewal C$12.99/year; Zoho Mail Lite 5 GB for one user
C$1.25/month billed annually, or C$15/year. Total: C$26.99 in year one and
C$27.99/year at current renewal rates. Confirm checkout prices before paying.

### 1. Register The Domain With CanSpace

1. Open [CanSpace domain registration](https://www.canspace.ca/domains.html), search for `bcelectionguide.ca`, and choose **one year** of domain registration only. No web hosting, email package or paid SSL certificate is needed.
2. Register using your own details and the applicable CIRA Canadian-presence category. Use an existing email address you already receive mail at for account recovery and registration notices, not the new contact address.
3. Complete any registration verification emails, check the renewal date and price, and choose your auto-renew setting. Enable two-factor authentication where offered and keep recovery codes outside the repository.
4. In the [CanSpace client area](https://www.canspace.ca/clients/), open your domain's **DNS Zone Manager / DNS Manager**. Keep CanSpace's DNS hosting and nameservers; neither GitHub nor Zoho needs to become the nameserver provider. Ask CanSpace to enable its included domain DNS management if the option is missing.

DNS is the routing directory for the domain. `A` and `CNAME` records route web
traffic; `MX` records route incoming email; `TXT` records prove ownership and
configure email authentication. They can coexist in the same zone.

In the instructions below, `@` means `bcelectionguide.ca` itself. If the editor
requires a full hostname instead, use that domain. A host such as `www` means
`www.bcelectionguide.ca`; do not append the domain twice. Keep the default TTL,
or use 3600 seconds when a value is required. TTL controls DNS caching.

### 2. Set Up Zoho Mail

1. Open [Zoho Mail pricing](https://www.zoho.com/mail/zohomail-pricing.html). Choose **Mail Lite, 5 GB, one user, annual billing**, not a Workplace bundle or a higher-tier trial. Use an existing reachable address for signup/recovery and enable two-factor authentication.
2. Choose the option to use a domain you already own and enter `bcelectionguide.ca`. Do not buy or transfer the domain through Zoho.
3. In the setup wizard or **Admin Console > Domains > bcelectionguide.ca**, select **TXT verification**. Copy the exact host and value Zoho supplies into a new TXT record in CanSpace, save it, then return to Zoho and click **Verify**. Leave the verification record in place.
4. Create `contact@bcelectionguide.ca` as your single paid mailbox under **Users**. If setup has already created that mailbox, do not add another user. Optional `admin@` and `corrections@` addresses can be aliases of the same mailbox rather than additional paid users.
5. Under **Domains > bcelectionguide.ca > Email Configuration > MX**, copy every MX server and its priority into CanSpace at host `@`. Replace only any existing parking/other-provider MX records for this domain. Preserve website and verification records. Return to Zoho and verify MX.
6. Open **Email Configuration > SPF**. Add the exact TXT value supplied by Zoho at `@`, then verify it. There must be only one TXT record starting with `v=spf1` at that hostname; other unrelated TXT records remain separate.
7. Open **Email Configuration > DKIM**, add selector `zoho` with a 2048-bit key, and add its generated public TXT value in CanSpace at the hostname Zoho displays, normally `zoho._domainkey`. Return to Zoho, verify the record and **enable DKIM signing**. Do not just leave it verified but disabled.
8. Add an alias `dmarc@bcelectionguide.ca` to the contact mailbox for authentication reports. Under **Email Configuration > DMARC**, start with **Do nothing / p=none**, relaxed alignment and that alias as the aggregate-report address. Publish the generated TXT record at `_dmarc`, then verify it. Only one DMARC record belongs at that hostname. After checking legitimate mail and reports, move to quarantine or reject; `p=none` only monitors and does not request blocking of spoofed mail.

**Use the MX and SPF values displayed in your own Zoho Admin Console.** Zoho
has different data centres, including Canada; examples from another region can
be wrong for your account. Verification values and DKIM keys are also specific
to your domain. Do not paste sample values from another account.

Open [Zoho Mail](https://www.zoho.com/mail/), select **Sign In**, and bookmark
the mailbox URL reached after login. Start with webmail; Outlook, Apple Mail or
Thunderbird can be configured later using the server settings shown in your
account. The website's email link opens a visitor's configured mail application;
it is not an email form or a mailbox by itself.

Sources: [Zoho setup order](https://www.zoho.com/mail/help/adminconsole/email-hosting-setup.html),
[MX records](https://www.zoho.com/mail/help/adminconsole/configure-email-delivery.html),
[SPF](https://www.zoho.com/mail/help/adminconsole/spf-configuration.html),
[DKIM](https://www.zoho.com/mail/help/adminconsole/dkim-configuration.html), and
[DMARC](https://www.zoho.com/mail/help/adminconsole/dmarc-policy.html).

### 3. Connect GitHub Pages And HTTPS

1. After registration, sign into GitHub as **sixprime**. Open your profile picture > **Settings > Pages > Add a domain**. This is your personal account's Settings, not the repository's. Enter `bcelectionguide.ca`.
2. GitHub supplies a TXT verification record, normally at `_github-pages-challenge-sixprime`. Add the exact host and value in CanSpace, then click **Verify** in GitHub. Keep this TXT record permanently. Verification helps prevent another GitHub account from claiming the domain.
3. Open [the repository's Pages settings](https://github.com/sixprime/bc-elections-2026/settings/pages). Keep **Deploy from a branch**, branch **main**, folder **/(root)**. Set **Custom domain** to `bcelectionguide.ca` and save. Do not include `https://`, a slash or `/2026/`.

For this branch-based deployment, saving the custom domain creates a `CNAME`
file and a commit on remote `main`. Keep that file in future deployments.
Fetch and reconcile that commit with any uncommitted local work before the next
push; do not force-push over it. Finish this GitHub step before pointing web DNS
at GitHub. The site content still comes from committed `main`, not local edits.

In CanSpace, add these five website records. Each A record is a separate row:

| Type | Host | Value |
| --- | --- | --- |
| A | `@` | `185.199.108.153` |
| A | `@` | `185.199.109.153` |
| A | `@` | `185.199.110.153` |
| A | `@` | `185.199.111.153` |
| CNAME | `www` | `sixprime.github.io` |

Replace only conflicting parking/old-host A or AAAA records at `@` and records
at `www`. Preserve CanSpace's nameservers, Zoho MX records and all required TXT
records. Do not create a CNAME at `@`, add wildcard records, or enable domain
forwarding/masking. The `www` CNAME points to the hostname only, without the
repository name or any path. Additional IPv6 records are optional, not required.

4. Return to the repository's **Settings > Pages** and wait for the DNS check and certificate issuance. GitHub obtains and manages a free Let's Encrypt certificate; nothing needs to be purchased or uploaded at CanSpace.
5. Enable **Enforce HTTPS** when it becomes available. DNS and certificate setup can take up to 24 hours. If it is still failing after that, check the records against GitHub's documentation; existing CAA records must permit `letsencrypt.org`.
6. Check `https://bcelectionguide.ca/`. With both hostname records configured, `www.bcelectionguide.ca` redirects to the root domain. The existing `https://sixprime.github.io/bc-elections-2026/` address redirects to the custom domain. No `/2026/` directory or paid redirect service is needed.

Sources: [GitHub ownership verification](https://docs.github.com/en/pages/configuring-a-custom-domain-for-your-github-pages-site/verifying-your-custom-domain-for-github-pages),
[custom-domain DNS setup](https://docs.github.com/en/pages/configuring-a-custom-domain-for-your-github-pages-site/managing-a-custom-domain-for-your-github-pages-site), and
[automatic HTTPS](https://docs.github.com/en/pages/getting-started-with-github-pages/securing-your-github-pages-site-with-https).

### 4. Test Before Publishing The Contact Address

1. Send a message from an existing Gmail, Outlook or other external account to `contact@bcelectionguide.ca`. Confirm it arrives in Zoho, then reply from Zoho and confirm the reply arrives externally with the new From address.
2. Check Zoho's MX, SPF, DKIM and DMARC indicators. For an outgoing message received in Gmail, use **Show original** and confirm SPF, DKIM and DMARC pass. Keep checking spam folders and authentication reports during initial setup.
3. Open the root domain, its `www` variant, an HTTP URL and the old GitHub Pages URL in a private browser window. Confirm they reach the HTTPS site without certificate warnings, and test the map, Parties view and footer contact link on a phone.
4. Publish the local contact-link change only after the mailbox works. Keep account recovery on an existing address outside this domain, and retain domain and mailbox renewal reminders. Buying the domain or adding DNS records does not publish local website changes.

## GitHub Pages Deployment

The repository is configured for branch-based Pages publishing from `main`, `/`.
After committing the desired code and reviewed data, pushing to `main`
automatically starts the Pages deployment. No build step or UI action is needed.
Keep raw downloads and full-source evidence in the external source cache, not
in the commit. There is deliberately no gitignore.

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
data/          Canonical JSON, artwork, boundaries and licences
data/sources.json  External source registry
tools/         Standalone data-update script
vendor/        Browser libraries and their licences
.nojekyll      Static GitHub Pages publishing
```

## Code license

MIT for original site code and SVG illustrations; see `LICENSE`. Election results are attributed to Elections BC, and poll release data remains attributed to the originating firms.
