# BC Election Guide

Your province. Your voice. Your choice.

An independent, unofficial explorer for the **October 24, 2026 British Columbia provincial election**. GitHub Pages serves checked-in HTML with crawlable content, enhanced by the shared browser app. There is no application server or runtime build. Leaflet, Turf and Lucide are checked-in browser libraries. Local publication tools use Node.js and Python/Pillow; no npm installation is required.

## Preview and local development

Open the published GitHub Pages URL in the repository's About section. For local development, serve the repository folder because JavaScript loads local data files:

```sh
python3 -m http.server 4173
```

Then open `http://localhost:4173/`. Section and riding pages load directly, for example `http://localhost:4173/ridings/burnaby-north/`. The shared app and data work both at the root and at `/bc-elections-2026/` on GitHub Pages.

## Static Pages And Sharing

The site has 99 indexable HTML pages: the province overview at `/`, five section
pages (`/ridings/`, `/candidates/`, `/parties/`, `/polls/`, `/about/`) and 93 riding
pages such as `/ridings/burnaby-north/`. Each response includes a unique title,
description, canonical URL, Open Graph and Twitter metadata, WebPage JSON-LD and
a 1200x630 PNG preview. Candidate records, original quotations, historical results
and source links are in the HTML, not just added after JavaScript runs.

[routes.js](routes.js) uses normal links and History API navigation, with native
new-tab/modifier clicks and Back/Forward support. A small compatibility handler
replaces old hash routes, including `/#riding/burnaby-north` and `/#methodology`,
with their path equivalents. This is a client-side redirect, not an HTTP 301:
fragments never reach GitHub Pages or a social-preview crawler. Old hash shares
cannot gain riding-specific previews; share the new path URLs instead.

[index.html](index.html) supplies the shared shell. Edit that shell or its shared
styles/scripts, not the generated section/riding HTML. Before publication, run:

```sh
node tools/update-data.mjs check
node tools/build-pages.mjs
node tools/build-pages.mjs --check
git diff --check
```

[tools/build-pages.mjs](tools/build-pages.mjs) reuses the candidate renderers and
reviewed datasets. [tools/render-pages.py](tools/render-pages.py) uses Python 3.10+
and Pillow to parse the shell and draw preview images from the official Elections
BC boundary geometry. No tile service, synthetic candidate portrait or external
rendering service is involved. Use `--python D:\Python\python.exe` or set
`BC_PREVIEW_PYTHON` if Python is not on PATH. The existing Windows font is Segoe UI
Bold; `BC_PREVIEW_FONT` can select a local TrueType font. Keep the same font and
Pillow version for byte-for-byte `--check` reproducibility. Generated outputs are
committed for ordinary GitHub Pages branch publishing; GitHub needs no generator.

Regenerate after changing data, the shell, renderers or metadata. The check fails
when generated files are missing or stale. Candidate pages are dated snapshots,
not live filings; regenerate at the nomination deadline and after verifying the
final Elections BC list. The interactive view still applies the deadline policy
at runtime. Generated previews describe the page, without speculative candidate
counts or political predictions.

[sitemap.xml](sitemap.xml) lists the 99 canonical pages; [robots.txt](robots.txt)
points to it. [404.html](404.html) is a genuine GitHub Pages not-found document
with `noindex`, not an SPA redirect that turns missing paths into overview pages.
Canonical, preview and sitemap URLs target `https://bcelectionguide.ca/`.
The generator reads [CNAME](CNAME) as its default publishing domain, including
the root-relative asset paths needed by the 404 page. It rejects malformed
domains, a conflicting `--site-url`, or a `publishedSite` value in
[page-info.js](page-info.js) that disagrees with CNAME. Update both when changing
domains. Without CNAME, the build falls back to `publishedSite` and still permits
an explicit `--site-url` for preview builds. Normal generation and `--check` need
no domain argument. Generation does not change DNS, Pages settings or publish
anything.

The pre-generated documents and social previews are English. `?lang=fr` selects
the French interactive interface; it is not a separate indexed French edition.
Actual search indexing and social-preview cache refreshes happen after publishing
and are controlled by the search/social services.

## First vertical slice

- Desktop province overview and riding explorer, responsive mobile layouts and bottom navigation, closely following the earlier visual mockups.
- Navigation follows Province, Ridings, Parties, Candidates, Polls, About. The mobile bottom bar uses the first five destinations, with Map / Carte as the short riding label and a full accessible name; About remains in the menu and footer. The countdown explicitly refers to election day, not the start of advance voting.
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
The 2026 candidate list appears immediately after the header, before the map and
historical results. Riding maps use the selected district name as their heading;
changing that heading does not move the camera.

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

**Find my riding** opens an address/location picker. Street-address suggestions
come from the [BC Address Geocoder](https://bcgov.github.io/ols-geocoder/developer-guide/),
with keyboard selection and a 350 ms typing debounce. A request on Enter uses
the entered address rather than prefix completion. Postal-code-only queries are
rejected before any request. Street, city and province centroids are not accepted
as address matches; the service's interpolation is disabled.

The selected address point is checked against the same full-resolution district
GeoJSON used for geolocation. No riding is assigned merely from a postal code or
the geocoder's electoral-area label. Users confirm the suggested address and
choose the resulting riding; approximate or boundary-adjacent results carry a
confirmation warning. The 50/200/1500 m screening buffers for high/medium/other
source precision are conservative boundary checks, not measured confidence radii.

Browser CORS was tested without an API key from the actual
`https://sixprime.github.io` origin: HTTP 200, a readable CORS response, and a
matching `Access-Control-Allow-Origin`. This is observed access, not a service
guarantee: current developer guidance guarantees cross-origin access with an API
key and describes requesting access for production applications. Recheck the
intended custom domain before launch and contact the BC Location Services team
if registration is required. Do not bypass CORS or put a secret key in client code.
Rate-limit, timeout and unavailable-service states leave location and riding
selection available. No key, proxy or backend was added.

The official sample widget uses jQuery UI. This site uses the documented API
directly instead of adding that older dependency stack. Address queries go only
to the geocoder, with no credentials and no response caching requested. This site
does not persist address text or coordinates, does not put them in page URLs,
and clears finder state on close. The dialog links to the service privacy notice
and displays the required Open Government Licence - British Columbia attribution.

**Use my location** requests browser geolocation only after a click, with
`enableHighAccuracy: true`, a 15-second timeout and no cached position. Phones may
use GPS; the browser and operating system choose the actual location source.
Desktop devices often return less precise Wi-Fi or network-based locations.
Uncertain positions and shared boundaries require confirmation. Out-of-province,
denied, unavailable and timed-out locations leave manual riding search available.

Full-resolution official polygons are downloaded only for nearby candidate
districts. Simplified geometry is used for display, not location matching.
The display coordinates use five decimal places: about 2.05 MB uncompressed or
601 KB gzipped, down from 2.61 MB / 902 KB. `node tools/update-data.mjs compact-map`
performs the repeatable precision reduction and rejects collapsed rings. All
93 precise district files used for matching retain their original hashes.
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

Public portraits, logos, inventory previews and original-download links require
`asset.reuse.publishApproved === true`, enforced by [asset-policy.js](asset-policy.js).
All 179 currently recorded assets are enabled for publication at the site
operator's explicit request on September 28, 2026. Source credits, licence terms,
rights-review statuses and file hashes are unchanged; this editorial approval
does not assert a new licence or permission from a third party. The gate remains
available for future additions. Missing artwork remains unavailable rather than
being fabricated. This is a rendering gate, not access control: files already
tracked under `data/` still exist at their direct URLs.
Unavailable or unverified websites are labelled rather than guessed.
CanWest's official website is HTTP-only and is labelled accordingly.

The 125-candidate catalogue currently has 123 verified portraits. Thirty missing
portraits were recovered from official party candidate cards, feeds and profiles,
with original bytes, WebP derivatives, source credits and SHA-256 hashes retained.
Monica Mohan and Jordan Kealy still have no verified, reusable public portrait in
the catalogue. Kealy's identifiable campaign social page requires login; restricted
Legislature images and unrelated search-result photos were not substituted.
Public availability alone is not unrestricted reuse permission; existing
source-owner credits and permission-review flags remain attached to the images.

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

## Candidate Sources And Deadline

The current catalogue contains 125 source-backed candidates, including eight
accepted Elections BC nominations. This is a pre-deadline snapshot, not a final
ballot. Official party directories and dated official press releases are both
valid evidence for a **party-announced** candidacy. A party announcement never
becomes an accepted nomination without Elections BC confirmation.

Nominations close **October 3, 2026 at 1 p.m. Pacific**. From that time onward,
candidate views and counts use only a verified final Elections BC list. People
absent from that final list are excluded regardless of party-site announcements.
If the final list has not been refreshed, the site displays a verification-pending
message instead of presenting provisional or party-only records as the ballot.
Already-open candidate pages update at the deadline. The site does not fetch the
final list automatically; the reviewed local data must still be updated and published.

Financial-agent names, addresses and phone numbers are not imported. The raw
candidate PDF is kept outside the repository; the published official-source
record contains only candidate name, riding and party, plus source metadata.
Validation rejects extra candidate/contact fields and public candidate-list PDFs.

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
Fetching never automatically rewrites election, poll, programme or artwork datasets.
The explicit `refresh-candidates` command merges the cached current-year NDP feed
and reviewed candidate-only Elections BC records, validating before saving. Other
official party directories and releases are reviewed directly under the same rules.
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

Open `http://127.0.0.1:4173/polls/` or `http://127.0.0.1:4173/parties/` to review
local changes. No special preview parameter is needed. Refresh the page after
editing data and regenerate the static pages before publication. Publication
still requires an approved commit and push.

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
a JavaScript snippet, without moving hosting or DNS. [Plausible](https://plausible.io/)
is a paid, privacy-focused alternative. Any selected integration must observe
History API navigation as well as full document loads, and report the real page
paths without recording personal searches or location data.

Collection starts after installation; previous visits cannot be reconstructed.
Locations are approximate network-derived statistics, not GPS positions or
identified people. Do not send riding-location coordinates, search input or any
future ballot choices to analytics. Provider selection and installation require
separate approval.

## English / French Demo

The language selector uses plain EN/FR labels and full English/Français
accessible names, without country flags. The selected option has an outlined
background; native radios support Tab and arrow keys with visible focus.

The selector is available on the main site and artwork inventory. Use `?lang=en`
or `?lang=fr`, for example `/parties/?lang=fr`. The URL preserves the choice on reload; no cookie,
localStorage entry, translation service or application server is required.

[i18n.js](i18n.js) contains the French catalogue, using English messages as keys
and as fallback. Dynamic renderers call `translate()` with named placeholders.
Static text and accessible attributes use explicit `data-i18n` markers; source
content is never automatically rewritten. Dates, numbers, percentages, plural
forms and label sorting use Canadian English or French `Intl` rules. Nomination
deadlines still use their original Pacific-time instants.

The demo covers navigation, page content, filters, candidate statuses, programme
topics, map controls, address/GPS feedback, chart descriptions, About and the
artwork inventory. Switching language updates the document language and a polite
screen-reader announcement. Current routes, filters, party selections and map
positions remain in place. Dialogs retain focus handling and Escape dismissal.
Janet Routledge's member record has feminine French role/profile labels; the
translation context is keyed to her verified member ID, not inferred from a name
or photograph.

Muted text is controlled by `--text-muted`; small labels use `--font-label`
(0.8125rem, normally 13px) across the main site, map and inventory. The snapshot
is dated text without a green live indicator. Polling averages are ordered by
descending share, and factual data notes are collapsed by default.

Candidate and party names, official riding names, election figures, artwork and
source URLs remain as recorded. Programme quotations are unchanged, retain
visible quotation marks, and are marked as English for screen readers. French
views identify them as original English text. Source titles, source descriptions
and rights-review notes remain in their original language. A party's own French
programme material would require source verification and explicit schema/editorial
review under the quote-only policy, not an automatic translation of quotations.

French copy is a demonstration draft, not an independently reviewed translation.
Before publication, a fluent reviewer should check terminology, neutrality and
all states, followed by assistive-technology checks on real devices. Automated
DOM, keyboard and responsive checks do not establish full WCAG conformance.

## Before Paid Promotion

Before buying search/social ads, boosting a post or paying someone to create or
promote campaign-period content, check the current
[Elections BC provincial third-party advertising rules](https://elections.bc.ca/provincial-elections/advertising-rules/provincial-advertising-sponsors/)
and obtain Elections BC's guidance on the actual advertisement and linked site.
Do not assume that calling the guide independent or non-commercial creates an
exemption. The campaign-period definition can include issue-related advertising,
and paid promotion can be treated differently from an unpaid publication.

If the proposed activity is regulated, confirm registration before advertising,
sponsor identification, independence requirements, contribution and expense
limits, reporting obligations and final-voting-day restrictions before spending.
Use the current official guidance rather than copying thresholds into site code.
This is a release checklist, not a legal conclusion that the guide is or is not
regulated advertising. No paid promotion or advertising account is configured.

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
