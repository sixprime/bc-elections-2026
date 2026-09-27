import { mountMaps, disposeMaps, findMyRiding, refreshMapIcons } from './map.js';
import { candidateDirectory, candidateResults, partyDirectory, ridingCandidates, ridingMember } from './candidates.js';
import { renderPollChart, pollSeries } from './poll-chart.js';

const root = document.getElementById('main');
const state = { election: null, polls: null, query: '', filter: 'all', partyFilter: 'all' };
const stagingPreview = ['localhost', '127.0.0.1', '[::1]'].includes(location.hostname) && new URLSearchParams(location.search).get('preview') === 'staging';
const stagedFiles = new Set();
const candidateFilters = { query: '', partyId: 'all', riding: 'all' };
let candidateManifest;
let candidateError = '';
let candidateRequest;
let candidateReturnPosition;
const pollOptions = { pollster: 'all', scenario: false, months: 6 };
const number = new Intl.NumberFormat('en-CA');
const escapeHtml = (value) => String(value ?? '').replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
const percentage = (value, decimals = 1) => `${Number(value).toFixed(decimals).replace(/\.0$/, '')}%`;
const readableDate = (date, options = {month:'short',day:'numeric'}) => new Date(`${date}T12:00:00Z`).toLocaleDateString('en-CA',{timeZone:'UTC',...options});
const slug = name => name.toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/(^-|-$)/g,'');
const party = id => state.election.parties.find(item => item.id === id) || state.polls?.historicalParties?.find(item => item.id === id) || {id,name:id === 'independent'?'Independent':'Unaffiliated',ballot:id === 'independent'?'Independent':'Unaffiliated',color:'#8294a8'};
const dot = (color, extra = '') => `<i class="party-dot ${extra}" style="--dot:${escapeHtml(color)}" aria-hidden="true"></i>`;
const panelHeader = (title, subtitle = '', label = '') => `<div class="card-header"><div><h2>${title}</h2>${subtitle ? `<p>${subtitle}</p>` : ''}</div>${label ? `<span class="source-tag">${label}</span>` : ''}</div>`;
const sourceLink = (url, label='View source') => `<a class="action-link" href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer">${label} ↗</a>`;
const cardBottom = (note, link) => `<div class="card-bottom"><span class="small-note">${note}</span>${link}</div>`;

function snapshotResponse(path) {
  return fetch(`./data/${stagingPreview && stagedFiles.has(path) ? 'staging' : 'prod'}/${path}`);
}

function currentPolls() {
  const {snapshotDate, summaryWindowDays, releases} = state.polls;
  const cutoff = new Date(`${snapshotDate}T12:00:00Z`).getTime() - summaryWindowDays * 86400000;
  const candidates = releases.filter(p => new Date(`${p.released}T12:00:00Z`).getTime() >= cutoff).sort((a,b) => b.released.localeCompare(a.released));
  const seen = new Set();
  return candidates.filter(p => seen.has(p.pollster) ? false : (seen.add(p.pollster), true));
}
function averages() {
  const recent = currentPolls();
  return ['ndp','con','green','one','centre'].map(id => {
    const values = recent.map(p => p.shares[id]).filter(v => Number.isFinite(v));
    return {id, count:values.length, mean: values.length >= 2 ? values.reduce((a,b)=>a+b,0)/values.length : null, min:Math.min(...values),max:Math.max(...values)};
  });
}
function currentRows(compact = false) {
  return `<div class="poll-summary">${averages().filter(x => x.mean != null).map(x => `<div><div class="poll-row"><span class="party-name">${dot(party(x.id).color)}${escapeHtml(party(x.id).ballot)}</span><div class="bar-track"><div class="bar-fill" style="--bar:${party(x.id).color};width:${Math.min(x.mean/55*100,100)}%"></div></div><span class="value">${percentage(x.mean)}</span></div>${!compact ? `<p class="range-note">Observed range ${percentage(x.min,0)}–${percentage(x.max,0)} · ${x.count} pollsters</p>` : ''}</div>`).join('')}</div>`;
}
function seatTrack() {
  const base = state.election.baseline2024;
  return `<div class="stacked-track" role="img" aria-label="2024 results: BC NDP 47 seats, Conservatives 44 seats, BC Greens 2 seats">${base.seats.map(x => `<span style="width:${x.seats/93*100}%;background:${party(x.id).color}"></span>`).join('')}</div><div class="stack-label">Majority: 47 seats</div><div class="seats-row">${base.seats.map(x => `<div class="seat"><span class="seat-name">${dot(party(x.id).color)}${escapeHtml(party(x.id).ballot)}</span><b>${x.seats}</b><small>seats in 2024</small></div>`).join('')}</div>`;
}
function baselineRows(limit = 9) {
  return state.election.baseline2024.popularVote.slice(0,limit).map(x => `<div class="baseline-row"><span class="label">${dot(x.color || party(x.id).color)}${escapeHtml(x.name || party(x.id).ballot)}</span><div class="bar-track"><div class="bar-fill" style="--bar:${x.color || party(x.id).color};width:${Math.max(x.share/50*100,.6)}%"></div></div><b>${percentage(x.share,x.share < 1?2:1)}</b></div>`).join('');
}
function mapCard(explorer = false, selectedSlug = '') {
  return `<section class="map-section map-card ${explorer ? 'expanded-map' : ''}">
    <div class="map-heading"><div><h2>British Columbia</h2><p>2024 winning party · Historical election results</p></div>${!explorer ? '<a class="action-link" href="#ridings">Open explorer →</a>' : ''}</div>
    <div class="map-tools"><div class="map-modes" role="group" aria-label="Basemap"><button type="button" data-map-style="street" aria-pressed="true" class="selected">Streets</button><button type="button" data-map-style="satellite" aria-pressed="false">Satellite</button><button type="button" data-map-style="terrain" aria-pressed="false">Terrain</button></div>
    <div class="map-actions"><button type="button" class="map-icon-button" data-map-boundaries aria-pressed="true" aria-label="Show riding boundaries" title="Show riding boundaries"><i data-lucide="layers"></i></button><button type="button" class="map-icon-button" data-map-reset aria-label="Show all British Columbia" title="Show all British Columbia"><i data-lucide="maximize"></i></button><button type="button" class="map-icon-button" data-find-riding aria-label="Find my riding" title="Find my riding"><i data-lucide="locate-fixed"></i></button></div></div>
    <div class="map-results-bar"><span>93 ridings</span><label class="map-results-toggle"><input type="checkbox" data-map-results-toggle checked disabled>Party overlay</label></div><div class="map-results-legend" data-map-results-legend role="list" aria-label="2024 winning parties"><span class="map-legend-loading">Loading results...</span></div>
    <div class="map-surface" data-riding-map data-map-results data-selected-riding="${escapeHtml(selectedSlug)}" role="region" aria-label="British Columbia 2024 winning party map" aria-busy="true"></div>
    <div class="map-source"><span data-map-caption>Loading map...</span><div class="map-source-links">${sourceLink(state.election.sources.districts,'2024 results')}${sourceLink(state.election.sources.boundaries,'Boundary source')}</div></div></section>`;
}
function closestCard() {
  const rows = Object.entries(state.election.featuredDistricts2024).map(([name,record]) => {
    const ranking = [...record.votes].sort((a,b)=>b.votes-a.votes);
    return {name,winner:ranking[0],margin:ranking[0].votes-ranking[1].votes,share:ranking[0].votes/record.validVotes*100};
  }).sort((a,b)=>a.margin-b.margin).slice(0,5);
  return `<section class="card card-pad closest-card">${panelHeader('Closest ridings','Smallest margins in the loaded 2024 results','2024 RESULTS')}<div class="table-wrap"><table class="data-table"><thead><tr><th>Riding</th><th>Winning party</th><th>Vote margin</th><th>Vote share</th></tr></thead><tbody>${rows.map(x=>`<tr><td><a href="#riding/${slug(x.name)}">${escapeHtml(x.name)}</a></td><td class="strong">${dot(party(x.winner.party).color)}${escapeHtml(party(x.winner.party).ballot)}</td><td class="margin">${number.format(x.margin)}</td><td>${percentage(x.share)}</td></tr>`).join('')}</tbody></table></div>${cardBottom('These are past election results, not 2026 predictions.',`<a href="#ridings" class="action-link">View all 93 ridings →</a>`)}</section>`;
}
function recentCard() {
  const releases = state.polls.releases.slice(0,2);
  return `<section class="card card-pad recent-card">${panelHeader('What changed?','New releases in this source snapshot','SEP 25 SNAPSHOT')}<ul class="recent-list">${releases.map(p=>`<li><time datetime="${p.released}">${readableDate(p.released)}</time><span><b>${escapeHtml(p.pollster)} published a B.C. poll</b>${sourceLink(p.source,'Original release')}</span></li>`).join('')}<li><time datetime="2026-09-25">Sep 25</time><span><b>Party register checked against Elections BC</b>${sourceLink(state.election.sources.parties,'Party register')}</span></li></ul></section>`;
}
function province() {
  return `<div class="page-head"><div><p class="eyebrow">2026 provincial general election</p><h1>British Columbia, at a glance</h1><p>October 24, 2026 · Source-linked data, with each kind of evidence clearly labelled.</p></div><span class="snapshot-pill">Snapshot · Sep 25, 2026</span></div><div class="province-grid"><div class="province-left">${mapCard()}${closestCard()}</div><div class="province-right"><section class="card card-pad poll-average-card">${panelHeader('Professional polling average','Current published vote intention','2 POLLSTERS')}<div class="poll-context"><span>${dot('#27a55d')}Latest release per pollster</span><span>Sep 25 snapshot</span></div>${currentRows()}${cardBottom('Simple mean · observed range is not a confidence interval.',`<a href="#polls" class="action-link">Polls & sources →</a>`)}</section><section class="card card-pad baseline-card">${panelHeader('Last election, not a forecast','Official Elections BC results · October 2024','2024 RESULTS')}<div class="stat-grid"><div class="stat-tile"><strong class="stat-number">93</strong><span>electoral districts</span></div><div class="stat-tile"><strong class="stat-number">47</strong><span>seats for majority</span></div><div class="stat-tile"><strong class="stat-number">58.45%</strong><span>voter turnout</span></div></div>${seatTrack()}<h3 style="font-size:12px;margin:21px 0 12px">Popular vote · each 2024 affiliation separately</h3><div class="baseline-list">${baselineRows()}</div>${cardBottom('2024 figures are historical context.',sourceLink(state.election.sources.districts,'Statement of Votes'))}</section>${recentCard()}</div></div>`;
}
function ridingRows() {
  const matches = state.election.districts.filter(name => name.toLowerCase().includes(state.query.toLowerCase().trim()) && (state.filter === 'all' || state.election.featuredDistricts2024[name]));
  return matches.length ? matches.map(name => {
    const record = state.election.featuredDistricts2024[name];
    const winner = record ? [...record.votes].sort((first, second) => second.votes - first.votes)[0] : null;
    return `<button type="button" data-riding="${escapeHtml(slug(name))}"><span><span class="riding-name">${escapeHtml(name)}</span><span class="meta riding-winner">${winner ? `${dot(party(winner.party).color)}<span>2024 · ${escapeHtml(party(winner.party).ballot)}</span>` : '<span>2024 result not loaded</span>'}</span></span><span class="chevron" aria-hidden="true">›</span></button>`;
  }).join('') : `<div class="empty-state"><strong>No riding found</strong>Try a different name or switch to all ridings.</div>`;
}
function ridingExplorer() {
  return `<div class="page-head"><div><p class="eyebrow">93 electoral districts</p><h1>Riding explorer</h1><p>British Columbia · Official district boundaries</p></div><span class="snapshot-pill">Independent / Unofficial</span></div><div class="riding-workspace"><aside class="riding-directory"><label class="search-field"><input id="ridingSearch" type="search" autocomplete="off" value="${escapeHtml(state.query)}" placeholder="Search 93 ridings" aria-label="Search 93 ridings"></label><div class="riding-list-header" id="ridingCount">${state.election.districts.filter(name => name.toLowerCase().includes(state.query.toLowerCase().trim())).length} of 93 ridings</div><div class="riding-list" id="ridingList">${ridingRows()}</div></aside>${mapCard(true)}</div>`;
}
function districtDetail(name) {
  const record = state.election.featuredDistricts2024[name];
  const ranked = record ? [...record.votes].sort((a,b)=>b.votes-a.votes) : [];
  const margin = record ? ranked[0].votes-ranked[1].votes : null;
  return `<div class="page-head"><div><p class="eyebrow"><a href="#ridings">← All ridings</a> / riding detail</p><h1>${escapeHtml(name)}</h1><p>British Columbia · 2026 election · 2024 results shown for context.</p></div><span class="snapshot-pill">${record?'2024 verified':'Result unavailable'}</span></div>
    <div class="simple-layout"><div class="poll-left"><section class="card card-pad">${panelHeader(record?'2024 final result':'2024 result unavailable','Official Elections BC source, not a 2026 projection','HISTORICAL DATA')}
    ${record ? `<div class="stat-grid"><div class="stat-tile"><strong class="stat-number">${escapeHtml(party(ranked[0].party).ballot)}</strong><span>winning affiliation</span></div><div class="stat-tile"><strong class="stat-number">${number.format(margin)}</strong><span>vote margin</span></div><div class="stat-tile"><strong class="stat-number">${number.format(record.validVotes)}</strong><span>valid votes</span></div></div>
    ${Number.isFinite(record.turnout) ? `<p class="small-note">2024 turnout: ${percentage(record.turnout,2)} · ${number.format(record.registeredVoters)} registered voters</p>` : ''}
    <div class="detail-vote">${ranked.map(vote=>`<div class="detail-vote-line"><span>${dot(party(vote.party).color)}${escapeHtml(vote.name)} <span class="subtle">· ${escapeHtml(party(vote.party).ballot)}</span></span><strong>${number.format(vote.votes)} · ${percentage(vote.votes/record.validVotes*100,2)}</strong><div class="bar-track"><div class="bar-fill" style="--bar:${party(vote.party).color};width:${vote.votes/record.validVotes*100}%"></div></div></div>`).join('')}</div>` : '<p class="small-note">No detailed result is included for this riding in this snapshot.</p>'}
    ${cardBottom('Final 2024 count · no 2026 riding estimate.',sourceLink(record?.source || state.election.sources.districts,'Official results'))}</section></div>
    <div class="poll-right"><section class="card card-pad">${panelHeader('MLA at dissolution','43rd Parliament','LEGISLATURE RECORD')}
    <div id="ridingMember" data-riding="${escapeHtml(name)}">${ridingMember(candidateManifest,name,candidateError)}</div></section>
    <section class="card card-pad">${panelHeader('2026 candidates','Nominations close October 3 at 1 p.m. PT','SOURCE-BACKED')}
    <div id="ridingCandidates" data-riding="${escapeHtml(name)}">${ridingCandidates(state.election,candidateManifest,name,candidateError)}</div>
    ${cardBottom('Party announcements are not accepted nominations.',sourceLink(state.election.sources.candidates,'Elections BC filings'))}</section></div></div>`;
}
function pollChart() {
  const firms = [...new Set(state.polls.releases.map(release => release.pollster))].sort();
  return `<div class="poll-chart-controls"><div class="poll-range-controls" role="group" aria-label="Polling history range">${[[6,'6 months'],[12,'1 year'],[60,'5 years'],[120,'10 years']].map(([months,label]) => `<button type="button" data-poll-months="${months}" aria-pressed="${pollOptions.months === months}" class="${pollOptions.months === months ? 'selected' : ''}">${label}</button>`).join('')}</div><label>Pollster <select id="pollsterFilter"><option value="all">All pollsters</option>${firms.map(firm => `<option value="${escapeHtml(firm)}" ${pollOptions.pollster === firm ? 'selected' : ''}>${escapeHtml(firm)}</option>`).join('')}</select></label><label class="poll-scenario-toggle"><input id="pollScenario" type="checkbox" ${pollOptions.scenario ? 'checked' : ''}> No-change scenario</label></div><div id="pollChartBody">${renderPollChart(state.polls, state.election, pollOptions)}</div>`;
}
function polls() {
  const list = pollSeries(state.polls, pollOptions).releases.sort((first, second) => second.released.localeCompare(first.released));
  return `<div class="page-head"><div><p class="eyebrow">Original pollster releases</p><h1>Professional polls</h1><p>Published voting intention · Historical observations and current averages</p></div><span class="snapshot-pill">${stagedFiles.has('polls.json') ? 'STAGING / Not published' : `Prod / ${readableDate(state.polls.snapshotDate)}`}</span></div>
    <section class="poll-history">${panelHeader('Voting intention over time','Source-linked observations / same-pollster series',`${list.length} OF ${state.polls.releases.length} RELEASES`)}${pollChart()}</section>
    <div class="poll-layout"><section class="card card-pad">${panelHeader('Poll release archive','Fieldwork, question base and sources','PRIMARY SOURCES')}<div class="release-list">
    ${list.map(release => `<article class="release"><div class="release-top"><strong>${escapeHtml(release.pollster)}</strong><time datetime="${release.released}">${readableDate(release.released,{month:'short',day:'numeric',year:'numeric'})}</time></div>
      <p class="details">Fieldwork ${readableDate(release.fieldStart)}–${readableDate(release.fieldEnd)} · n=${number.format(release.sampleTotal)} total${release.sampleDecided ? ` / n=${number.format(release.sampleDecided)} voting-intention sample` : ''} · ${escapeHtml(release.method)} · ${escapeHtml(release.basis)}</p>
      <div class="figures">${Object.entries(release.shares).map(([id,value]) => `<span>${dot(party(id).color)}${escapeHtml(party(id).ballot)} <strong>${percentage(value)}</strong></span>`).join('')}</div>
      <p class="caption">${escapeHtml(release.note)}</p><div class="release-sources">${sourceLink(release.source,'Original release')}${release.tables ? sourceLink(release.tables,'Data tables') : ''}</div></article>`).join('')}
    </div></section><div class="poll-right"><section class="card card-pad">${panelHeader('Current average',`Latest release per pollster / ${state.polls.summaryWindowDays} days`,`${currentPolls().length} POLLSTERS`)}<div class="poll-context"><span>${dot('#27a55d')}Observed releases</span><span>${readableDate(state.polls.snapshotDate)} snapshot</span></div>${currentRows()}${cardBottom('Unweighted mean. Separately reported parties only.','<a href="#methodology" class="action-link">Calculation details →</a>')}</section>
    <section class="card card-pad">${panelHeader('Observed poll range','Minimum and maximum included values','NOT A CI')}<div class="range-list">${averages().filter(result => result.mean != null).map(result => `<div class="range-row"><span>${dot(party(result.id).color)}${escapeHtml(party(result.id).ballot)}</span><div class="range-track" style="--bar:${party(result.id).color}"><i style="left:${result.min/55*100}%;width:${(result.max-result.min)/55*100}%"></i><b style="left:${result.mean/55*100}%"></b></div><strong>${percentage(result.min,0)}–${percentage(result.max,0)}</strong></div>`).join('')}</div><p class="small-note">Observed ranges show disagreement between pollsters, not sampling uncertainty.</p></section></div></div>`;
}
function parties() {
  return partyDirectory(state.election, candidateManifest, candidateError);
}
function candidates() {
  return candidateDirectory(state.election, candidateManifest, candidateFilters, candidateError);
}
async function loadCandidates() {
  if (candidateRequest || candidateManifest || candidateError) return;
  candidateRequest = snapshotResponse('assets/manifest.json');
  try {
    const response = await candidateRequest;
    if (!response.ok) throw new Error('The candidate data could not be loaded.');
    const manifest = await response.json();
    if (!Array.isArray(manifest.candidates) || !Array.isArray(manifest.assets) || !Array.isArray(manifest.parties)) throw new Error('The candidate catalogue is incomplete.');
    for (const asset of manifest.assets) asset.staged = stagingPreview && stagedFiles.has(asset.web?.path);
    candidateManifest = manifest;
  } catch (error) {
    candidateError = error.message;
  } finally {
    candidateRequest = null;
    if (['#candidates', '#parties'].includes(location.hash)) render();
    const panel = document.getElementById('ridingCandidates');
    if (panel) panel.innerHTML = ridingCandidates(state.election,candidateManifest,panel.dataset.riding,candidateError);
    const memberPanel = document.getElementById('ridingMember');
    if (memberPanel) memberPanel.innerHTML = ridingMember(candidateManifest,memberPanel.dataset.riding,candidateError);
  }
}
function ballot() {
  return `<div class="page-head"><div><p class="eyebrow">Design preview</p><h1>Community Ballot</h1><p>A future opt-in participation feature, separate from professional surveys and official votes.</p></div><span class="snapshot-pill">Preview only</span></div><div class="simple-layout"><section class="card card-pad prose-card">${panelHeader('How the community flow could feel','A transparent, three-step ballot experience','UI PROTOTYPE')}<div class="info-strip"><span class="info-icon">i</span><span>There is no vote collection, identity system or community tally in this client-only build. Any future community sample would be self-selected and unscientific.</span></div><div class="preview-card" style="margin-top:17px"><div class="preview-step"><span>1</span><strong>Choose a riding</strong></div><div class="preview-step"><span>2</span><strong>Select an officially filed candidate</strong></div><div class="preview-step"><span>3</span><strong>Review and submit, once a safe collection service exists</strong></div></div><h3>Why this is a preview</h3><p>A shared vote tally and safeguards against repeat participation need infrastructure. Static GitHub Pages cannot collect or verify ballots by itself. We can decide later whether to build that part.</p><a href="#ridings" class="secondary-button">Explore ridings →</a></section><aside class="card card-pad">${panelHeader('Three separate measures','Easy to distinguish anywhere on the site','TRANSPARENCY')}<div class="side-fact"><b>01</b><p>Official Elections BC past results and, later, 2026 results.</p></div><div class="side-fact"><b>02</b><p>Professional pollster releases, with dates and methods.</p></div><div class="side-fact"><b>03</b><p>Community participation data, only after a separate system exists.</p></div></aside></div>`;
}
function methodology() {
  const e=state.election.sources;
  return `<div class="page-head"><div><p class="eyebrow">September 25 snapshot</p><h1>Sources & methodology</h1></div></div>
    <div class="simple-layout"><section class="card card-pad prose-card">
    ${panelHeader('Election evidence', 'Independent and unofficial', 'SOURCES')}
    <h3>Election records</h3><p>Official 2024 provincial totals and ${Object.keys(state.election.featuredDistricts2024).length} riding results come from Elections BC's final Statement of Votes. Complete riding imports are checked against the report's independent district totals, party vote totals and seat totals. The party directory follows the registered-party PDF dated September 25, 2026. Election Day comes from Elections BC. Past results are not current projections.</p>
    <h3>Polling summary</h3><p>${state.polls.releases.length} survey records come from the original pollsters. The current summary takes the latest release from each distinct pollster in the ${state.polls.summaryWindowDays} days ending ${readableDate(state.polls.snapshotDate)}. Values are arithmetic means of reported party shares. Ranges are the smallest and largest release values, <strong>not</strong> confidence intervals. At least two pollsters must report a party separately for it to appear in the summary.</p>
    <p>Older releases remain in the archive without counting the same firm twice in the current mean. Grouped responses are never divided among named parties. Chart lines connect observations from the same pollster, with gaps for unreported values; question bases remain listed on each release. These lines are descriptive, not a fitted polling average.</p>
    <p>The optional dashed election-day continuation holds the recent average unchanged. This no-change scenario is not a forecast, confidence interval or seat projection. Production uses approved data only; the explicit localhost staging preview is for review.</p>
    <h3>Geography and location</h3><p>The 93 district boundaries come from Elections BC through DataBC. Display boundaries are simplified; location matching uses the full-resolution geometry. Contains information licenced under the ${sourceLink('https://www.elections.bc.ca/docs/EBC-Open-Data-Licence.pdf','Elections BC Open Data Licence')}.</p>
    <p>Location access requires permission. Phones may use GPS; desktop locations can be less precise. Coordinates stay in memory and are not saved in localStorage or URLs. Map providers receive requests for the viewed area. A current location is not necessarily a home address, and this match is not an official voter assignment. Confirm your home riding with Elections BC.</p>
    <h3>Map imagery</h3><p>Sentinel-2 cloudless 2024 imagery is provided by EOX under ${sourceLink('https://cloudless.eox.at/license-non-commercial','CC BY-NC-SA 4.0')}, for non-commercial use with attribution. Its 10 m resolution is regional satellite imagery, not live or house-level aerial photography. EOX also supplies terrain and reference labels. Streets are from OpenStreetMap contributors. These free services are best-effort and may be rate-limited.</p>
    <h3>Candidate artwork</h3><p>The separate artwork inventory records source pages, original files and usage-review status. Party announcements are kept separate from accepted Elections BC nominations. Downloading a photograph or logo does not grant unrestricted reuse or imply endorsement. Missing artwork is not fabricated.</p>
    <h3>Limits</h3><p>No 2026 seat forecast or community ballot tally is computed. The site is independent and unofficial. Use Elections BC for voting instructions, registration and current filings.</p>
    </section><aside class="card card-pad">${panelHeader('Original sources','','LINKS')}<ul class="source-list">
    <li>${sourceLink(e.election,'Elections BC')}<small>Election and voter information</small></li>
    <li>${sourceLink(e.districts,'2024 Statement of Votes')}<small>Official historical results</small></li>
    <li>${sourceLink(e.parties,'Registered parties PDF')}<small>September 25 register</small></li>
    <li>${sourceLink(e.candidates,'2026 candidate filings')}<small>Accepted nominations</small></li>
    <li>${sourceLink(e.boundaries,'GIS spatial data')}<small>93 electoral districts</small></li>
    <li>${sourceLink('https://maps.eox.at/','EOX Maps')}<small>Satellite, terrain and reference labels</small></li>
    <li>${sourceLink('https://www.openstreetmap.org/copyright','OpenStreetMap')}<small>Street data and attribution</small></li>
    ${state.polls.releases.map(release=>`<li>${sourceLink(release.source,release.pollster)}<small>Released ${readableDate(release.released)}</small></li>`).join('')}</ul></aside></div>`;
}

function route() {
  const path = decodeURIComponent((location.hash || '#province').slice(1));
  if (path.startsWith('riding/')) {
    const name = state.election.districts.find(d => slug(d) === path.slice(7));
    return {section:'ridings',html:name?districtDetail(name):ridingExplorer()};
  }
  const pages = {province,ridings:ridingExplorer,polls,parties,candidates,ballot,methodology};
  const section=pages[path]?path:'province';
  return {section,html:pages[section]()};
}
function render() {
  if (!state.election || !state.polls) return;
  disposeMaps();
  const view=route();root.innerHTML=(stagingPreview ? '<div class="poll-review-banner" role="status">Staging review. Not published.</div>' : '')+view.html;
  if (location.hash.startsWith('#riding/')) {
    const geography = document.createElement('div');
    geography.className = 'detail-geography';
    geography.innerHTML = mapCard(false, location.hash.slice('#riding/'.length));
    root.querySelector('.page-head').after(geography);
  }
  document.querySelectorAll('[data-nav]').forEach(link=>{const active=link.dataset.nav===view.section;link.classList.toggle('active',active);if(active)link.setAttribute('aria-current','page');else link.removeAttribute('aria-current')});
  document.title=`${view.section==='province'?'Overview':view.section.charAt(0).toUpperCase()+view.section.slice(1)} · BC Vote 2026`;
  mountMaps(state.election);
  if (['candidates', 'parties'].includes(view.section) || location.hash.startsWith('#riding/')) loadCandidates();
}
function updateCountdown() {
  if (!state.election)return;
  const days=Math.max(0,Math.ceil((new Date(`${state.election.electionDate}T00:00:00-07:00`)-new Date())/86400000));
  document.getElementById('countdown').textContent=days===0?'Election Day · Oct 24':`${days} days to vote`;
}
document.addEventListener('click', e=>{
  const pollRange = e.target.closest('[data-poll-months]');
  if (pollRange) {
    const months = Number(pollRange.dataset.pollMonths);
    if (![6, 12, 60, 120].includes(months)) return;
    pollOptions.months = months;
    render();
    document.querySelector(`[data-poll-months="${months}"]`).focus({ preventScroll: true });
    return;
  }
  const partyCandidates = e.target.closest('[data-party-candidates]');
  if (partyCandidates) {
    candidateFilters.query = '';
    candidateFilters.riding = 'all';
    candidateFilters.partyId = partyCandidates.dataset.partyCandidates;
    candidateReturnPosition = null;
    location.hash = '#candidates';
    return;
  }
  const partyJump = e.target.closest('[data-party-jump]');
  if (partyJump) {
    const target = document.getElementById(`candidate-party-${partyJump.dataset.partyJump}`);
    if (target) {
      candidateReturnPosition = { top: window.scrollY, partyId: partyJump.dataset.partyJump };
      target.focus({ preventScroll: true });
      target.scrollIntoView({ block: 'start', behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth' });
    }
    return;
  }
  if (e.target.closest('[data-candidate-top]')) {
    const navigation = document.getElementById('candidatePartyNavigation');
    if (navigation) {
      const previous = candidateReturnPosition;
      const control = previous ? navigation.querySelector(`[data-party-jump="${previous.partyId}"]`) : navigation;
      (control || navigation).focus({ preventScroll: true });
      window.scrollTo({ top: previous?.top ?? Math.max(0, navigation.getBoundingClientRect().top + window.scrollY - 20), behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth' });
    }
    return;
  }
  if(e.target.closest('[data-candidate-retry]')){candidateError='';render();return}
  if(e.target.closest('[data-find-riding]')){findMyRiding();return}
  const filter=e.target.closest('[data-filter]');if(filter){state.filter=filter.dataset.filter;render();return}
  const partyFilter=e.target.closest('[data-party-filter]');if(partyFilter){state.partyFilter=partyFilter.dataset.partyFilter;render();return}
  const riding=e.target.closest('[data-riding]');if(riding){location.hash=`#riding/${riding.dataset.riding}`;return}
  const menu=e.target.closest('#menuButton');if(menu){const panel=document.getElementById('mobileMenu');const open=panel.hidden;panel.hidden=!open;menu.setAttribute('aria-expanded',String(open));return}
  if(e.target.closest('#mobileMenu a')){document.getElementById('mobileMenu').hidden=true;document.getElementById('menuButton').setAttribute('aria-expanded','false')}
});
document.addEventListener('input',e=>{
  if(e.target.id==='candidateSearch'){
    candidateFilters.query=e.target.value;
    document.getElementById('candidateResults').innerHTML=candidateResults(state.election,candidateManifest,candidateFilters);
    candidateReturnPosition = null;
    refreshMapIcons();
  }
  if(e.target.id==='ridingSearch'){
    state.query=e.target.value;
    document.getElementById('ridingList').innerHTML=ridingRows();
    const visible=state.election.districts.filter(name=>name.toLowerCase().includes(state.query.toLowerCase().trim())&&(state.filter==='all'||state.election.featuredDistricts2024[name])).length;
    document.getElementById('ridingCount').textContent=`${visible} of ${state.election.districts.length} ridings · alphabetical`;
  }
  if(e.target.id==='globalSearch'){
    state.query=e.target.value;
    if(location.hash!=='#ridings')location.hash='#ridings';else {document.getElementById('ridingList').innerHTML=ridingRows();document.getElementById('ridingSearch').value=state.query}
  }
});
document.addEventListener('change', event => {
  if (event.target.id === 'pollsterFilter' || event.target.id === 'pollScenario') {
    if (event.target.id === 'pollsterFilter') {
      pollOptions.pollster = event.target.value;
      render();
      document.getElementById('pollsterFilter').focus({ preventScroll: true });
      return;
    }
    pollOptions.scenario = event.target.checked;
    document.getElementById('pollChartBody').innerHTML = renderPollChart(state.polls, state.election, pollOptions);
    return;
  }
  if (event.target.id === 'candidateParty') candidateFilters.partyId = event.target.value;
  else if (event.target.id === 'candidateRiding') candidateFilters.riding = event.target.value;
  else return;
  document.getElementById('candidateResults').innerHTML = candidateResults(state.election, candidateManifest, candidateFilters);
  candidateReturnPosition = null;
  refreshMapIcons();
});
window.addEventListener('hashchange',()=>{render();window.scrollTo({top:0,behavior:'instant'})});
try {
  if (stagingPreview) {
    const reviewResponse = await fetch('./data/staging/_diff.json');
    if (!reviewResponse.ok) throw Error('No staging review is available.');
    const review = await reviewResponse.json();
    if (!Array.isArray(review.changes)) throw Error('The staging review is invalid.');
    for (const change of review.changes) if (change.status !== 'removed') stagedFiles.add(change.path);
  }
  const [electionResponse,pollsResponse]=await Promise.all([snapshotResponse('election.json'),snapshotResponse('polls.json')]);
  if(!electionResponse.ok||!pollsResponse.ok)throw Error('One of the data files could not be loaded.');
  [state.election,state.polls]=await Promise.all([electionResponse.json(),pollsResponse.json()]);
  document.getElementById('snapshotStatus').textContent=`Source snapshot · ${readableDate(state.election.snapshotDate,{month:'long',day:'numeric',year:'numeric'})} PT`;
  updateCountdown();render();setInterval(updateCountdown,3600000);
} catch(error) {
  root.innerHTML=`<div class="card card-pad"><h1>Data unavailable</h1><p>The site could not load its local JSON files. Please reload the page or open the published site through a web server.</p><p class="small-note">${escapeHtml(error.message)}</p></div>`;
}
