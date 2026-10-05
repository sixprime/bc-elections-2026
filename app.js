import { mountMaps, disposeMaps, updateRidingMap, openRidingFinder, refreshMapIcons, refreshMapLanguage } from './map.js?v=riding-finder';
import { candidateDirectory, candidateResults, partyDirectory, partyResults, partyComparison, ridingCandidates, ridingMember, ridingMemberLabel } from './candidates.js?v=statement-sources';
import { atNominationDeadline } from './candidate-policy.js';
import { renderPollChart, pollSeries } from './poll-chart.js';
import { translate, setLanguage, translateElements, syncLanguageControls, formatNumber, formatPercent, formatDate } from './i18n.js';
import { currentRoute, routeHref, navigate, installRouter, refreshRouteLinks } from './routes.js';
import { districtSlug, pageInfo, publishedSite, updatePageMetadata } from './page-info.js';
import { mountComparison } from './comparison.js?v=party-layout';

const root = document.getElementById('main');
const state = { election: null, polls: null, query: '', filter: 'all', partyFilter: 'all' };
const candidateFilters = { query: '', partyId: 'all', riding: 'all' };
const programFilters = { query: '', partyId: 'ndp', topic: 'all' };
const programComparison = { topic: 'housing', layout: 'columns', columns: 'auto', mode: 'scroll', hiddenIds: [], pinnedIds: [], index: 0, pinnedIndex: 0 };
let disposeComparison = () => {};
let programView = 'compare';
let partyPrograms;
let programRequest;
let programError = '';
let candidateManifest;
let candidateError = '';
let candidateRequest;
let candidateReturnPosition;
const pollOptions = { pollster: 'all', scenario: false, months: 6 };
const number = { format: formatNumber };
const escapeHtml = (value) => String(value ?? '').replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
const text = (message, values) => escapeHtml(translate(message, values));
const percentage = formatPercent;
const readableDate = (date, options = {month:'short',day:'numeric'}) => formatDate(date, options);
const slug = districtSlug;
const party = id => state.election.parties.find(item => item.id === id) || state.polls?.historicalParties?.find(item => item.id === id) || {id,name:translate(id === 'independent'?'Independent':'Unaffiliated'),ballot:translate(id === 'independent'?'Independent':'Unaffiliated'),color:'#8294a8'};
const dot = (color, extra = '') => `<i class="party-dot ${extra}" style="--dot:${escapeHtml(color)}" aria-hidden="true"></i>`;
const panelHeader = (title, subtitle = '', label = '') => `<div class="card-header"><div><h2>${text(title)}</h2>${subtitle ? `<p>${text(subtitle)}</p>` : ''}</div>${label ? `<span class="source-tag">${text(label)}</span>` : ''}</div>`;
const sourceLink = (url, label='View source') => `<a class="action-link" href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer">${text(label)} ↗</a>`;
const cardBottom = (note, link) => `<div class="card-bottom"><span class="small-note">${text(note)}</span>${link}</div>`;

function snapshotResponse(path) {
  return fetch(new URL(`./data/${path}`, import.meta.url));
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
  }).sort((first, second) => (second.mean ?? -Infinity) - (first.mean ?? -Infinity) || first.id.localeCompare(second.id));
}
function currentRows(compact = false) {
  return `<div class="poll-summary">${averages().filter(x => x.mean != null).map(x => `<div><div class="poll-row"><span class="party-name">${dot(party(x.id).color)}${escapeHtml(party(x.id).ballot)}</span><div class="bar-track"><div class="bar-fill" style="--bar:${party(x.id).color};width:${Math.min(x.mean/55*100,100)}%"></div></div><span class="value">${percentage(x.mean)}</span></div>${!compact ? `<p class="range-note">${text('Observed range {min}–{max} · {count} pollsters', { min: percentage(x.min,0), max: percentage(x.max,0), count: formatNumber(x.count) })}</p>` : ''}</div>`).join('')}</div>`;
}
function seatTrack() {
  const base = state.election.baseline2024;
  return `<div class="stacked-track" role="img" aria-label="${text('2024 results: BC NDP 47 seats, Conservatives 44 seats, BC Greens 2 seats')}">${base.seats.map(x => `<span style="width:${x.seats/93*100}%;background:${party(x.id).color}"></span>`).join('')}</div><div class="stack-label">${text('Majority: 47 seats')}</div><div class="seats-row">${base.seats.map(x => `<div class="seat"><span class="seat-name">${dot(party(x.id).color)}${escapeHtml(party(x.id).ballot)}</span><b>${formatNumber(x.seats)}</b><small>${text('seats in 2024')}</small></div>`).join('')}</div>`;
}
function baselineRows(limit = 9) {
  return state.election.baseline2024.popularVote.slice(0,limit).map(x => `<div class="baseline-row"><span class="label">${dot(x.color || party(x.id).color)}${escapeHtml(x.name || party(x.id).ballot)}</span><div class="bar-track"><div class="bar-fill" style="--bar:${x.color || party(x.id).color};width:${Math.max(x.share/50*100,.6)}%"></div></div><b>${percentage(x.share,x.share < 1?2:1)}</b></div>`).join('');
}
function mapCard(explorer = false, selectedSlug = '') {
  const selectedName = state.election.districts.find(name => slug(name) === selectedSlug);
  return `<section class="map-section map-card ${explorer ? 'expanded-map' : ''}">
    <div class="map-heading"><div><h2 data-map-title${selectedName ? ' lang="en-CA"' : ''}>${selectedName ? escapeHtml(selectedName) : text('British Columbia')}</h2><p data-i18n="2024 winning party · Historical election results">${text('2024 winning party · Historical election results')}</p></div>${!explorer ? `<a class="action-link" href="${routeHref('ridings')}" data-route="ridings" data-i18n="Open explorer →">${text('Open explorer →')}</a>` : ''}</div>
    <div class="map-tools"><div class="map-modes" role="group" aria-label="${text('Basemap')}" data-i18n-aria-label="Basemap"><button type="button" data-map-style="street" aria-pressed="true" class="selected" data-i18n="Streets">${text('Streets')}</button><button type="button" data-map-style="satellite" aria-pressed="false" data-i18n="Satellite">${text('Satellite')}</button><button type="button" data-map-style="terrain" aria-pressed="false" data-i18n="Terrain">${text('Terrain')}</button></div>
    <div class="map-actions"><button type="button" class="map-icon-button" data-map-boundaries aria-pressed="true" aria-label="${text('Show riding boundaries')}" title="${text('Show riding boundaries')}" data-i18n-aria-label="Show riding boundaries" data-i18n-title="Show riding boundaries"><i data-lucide="layers"></i></button><button type="button" class="map-icon-button" data-map-reset aria-label="${text('Show all British Columbia')}" title="${text('Show all British Columbia')}" data-i18n-aria-label="Show all British Columbia" data-i18n-title="Show all British Columbia"><i data-lucide="maximize"></i></button><button type="button" class="map-icon-button" data-find-riding aria-label="${text('Find my riding')}" title="${text('Find my riding')}" data-i18n-aria-label="Find my riding" data-i18n-title="Find my riding"><i data-lucide="locate-fixed"></i></button></div></div>
    <div class="map-results-bar"><span data-map-count>${text('{count} ridings', { count: 93 })}</span><label class="map-results-toggle"><input type="checkbox" data-map-results-toggle checked disabled><span data-i18n="Party overlay">${text('Party overlay')}</span></label></div><div class="map-results-legend" data-map-results-legend role="list" aria-label="${text('2024 winning parties')}" data-i18n-aria-label="2024 winning parties"><span class="map-legend-loading">${text('Loading results...')}</span></div>
    <div class="map-surface" data-riding-map data-map-results data-selected-riding="${escapeHtml(selectedSlug)}" role="region" aria-label="${selectedName ? text('Map of {riding}', { riding: selectedName }) : text('British Columbia 2024 winning party map')}" aria-busy="true"></div>
    <div class="map-source"><span data-map-caption>${text('Loading map...')}</span><div class="map-source-links"><a class="action-link" href="${escapeHtml(state.election.sources.districts)}" target="_blank" rel="noopener noreferrer" data-i18n="2024 results">${text('2024 results')}</a><a class="action-link" href="${escapeHtml(state.election.sources.boundaries)}" target="_blank" rel="noopener noreferrer" data-i18n="Boundary source">${text('Boundary source')}</a></div></div></section>`;
}
function closestCard() {
  const rows = Object.entries(state.election.featuredDistricts2024).map(([name,record]) => {
    const ranking = [...record.votes].sort((a,b)=>b.votes-a.votes);
    return {name,winner:ranking[0],margin:ranking[0].votes-ranking[1].votes,share:ranking[0].votes/record.validVotes*100};
  }).sort((a,b)=>a.margin-b.margin).slice(0,5);
  return `<section class="card card-pad closest-card">${panelHeader('Closest ridings','Smallest margins in the loaded 2024 results','2024 RESULTS')}<div class="table-wrap"><table class="data-table"><thead><tr><th>${text('Riding')}</th><th>${text('Winning party')}</th><th>${text('Vote margin')}</th><th>${text('Vote share')}</th></tr></thead><tbody>${rows.map(x=>`<tr><td><a href="${routeHref(`riding/${slug(x.name)}`)}" lang="en-CA">${escapeHtml(x.name)}</a></td><td class="strong">${dot(party(x.winner.party).color)}${escapeHtml(party(x.winner.party).ballot)}</td><td class="margin">${number.format(x.margin)}</td><td>${percentage(x.share)}</td></tr>`).join('')}</tbody></table></div>${cardBottom('These are past election results, not 2026 predictions.',`<a href="${routeHref('ridings')}" class="action-link">${text('View all 93 ridings →')}</a>`)}</section>`;
}
function recentCard() {
  const releases = state.polls.releases.slice(0,2);
  return `<section class="card card-pad recent-card">${panelHeader('What changed?','New releases in this source snapshot',translate('{date} SNAPSHOT', { date: readableDate(state.election.snapshotDate).toLocaleUpperCase() }))}<ul class="recent-list">${releases.map(p=>`<li><time datetime="${p.released}">${readableDate(p.released)}</time><span><b>${text('{pollster} published a B.C. poll', { pollster: p.pollster })}</b>${sourceLink(p.source,'Original release')}</span></li>`).join('')}<li><time datetime="${state.election.partyRegisterChecked}">${readableDate(state.election.partyRegisterChecked)}</time><span><b>${text('Party register checked against Elections BC')}</b>${sourceLink(state.election.sources.parties,'Party register')}</span></li></ul></section>`;
}
function province() {
  return `<div class="page-head"><div><p class="eyebrow">${text('2026 provincial general election')}</p><h1>${text('British Columbia, at a glance')}</h1><p>${text('{date} · Source-linked data, with each kind of evidence clearly labelled.', { date: readableDate(state.election.electionDate,{month:'long',day:'numeric',year:'numeric'}) })}</p></div><span class="snapshot-pill">${text('Snapshot · {date}', { date: readableDate(state.election.snapshotDate,{month:'short',day:'numeric',year:'numeric'}) })}</span></div><div class="province-grid"><div class="province-left">${mapCard()}${closestCard()}</div><div class="province-right"><section class="card card-pad poll-average-card">${panelHeader('Professional polling average','Current published vote intention',translate('{count} POLLSTERS', { count: currentPolls().length }))}<div class="poll-context"><span>${dot('#27a55d')}${text('Latest release per pollster')}</span><span>${text('{date} snapshot', { date: readableDate(state.polls.snapshotDate) })}</span></div>${currentRows()}${cardBottom('Simple mean · observed range is not a confidence interval.',`<a href="${routeHref('polls')}" class="action-link">${text('Polls & sources →')}</a>`)}</section><section class="card card-pad baseline-card">${panelHeader('Last election, not a forecast','Official Elections BC results · October 2024','2024 RESULTS')}<div class="stat-grid"><div class="stat-tile"><strong class="stat-number">93</strong><span>${text('electoral districts')}</span></div><div class="stat-tile"><strong class="stat-number">47</strong><span>${text('seats for majority')}</span></div><div class="stat-tile"><strong class="stat-number">${percentage(58.45,2)}</strong><span>${text('voter turnout')}</span></div></div>${seatTrack()}<h3 style="font-size:12px;margin:21px 0 12px">${text('Popular vote · each 2024 affiliation separately')}</h3><div class="baseline-list">${baselineRows()}</div>${cardBottom('2024 figures are historical context.',sourceLink(state.election.sources.districts,'Statement of Votes'))}</section>${recentCard()}</div></div>`;
}
function ridingRows() {
  const matches = state.election.districts.filter(name => name.toLowerCase().includes(state.query.toLowerCase().trim()) && (state.filter === 'all' || state.election.featuredDistricts2024[name]));
  return matches.length ? matches.map(name => {
    const record = state.election.featuredDistricts2024[name];
    const winner = record ? [...record.votes].sort((first, second) => second.votes - first.votes)[0] : null;
    return `<a href="${routeHref(`riding/${slug(name)}`)}"><span><span class="riding-name" lang="en-CA">${escapeHtml(name)}</span><span class="meta riding-winner">${winner ? `${dot(party(winner.party).color)}<span>2024 · ${escapeHtml(party(winner.party).ballot)}</span>` : `<span>${text('2024 result not loaded')}</span>`}</span></span><span class="chevron" aria-hidden="true">›</span></a>`;
  }).join('') : `<div class="empty-state"><strong>${text('No riding found')}</strong>${text('Try a different name or switch to all ridings.')}</div>`;
}
function ridingExplorer() {
  return `<div class="page-head"><div><p class="eyebrow">${text('93 electoral districts')}</p><h1>${text('Riding explorer')}</h1><p>${text('British Columbia · Official district boundaries')}</p></div><span class="snapshot-pill">${text('Independent / Unofficial')}</span></div><div class="riding-workspace"><aside class="riding-directory"><label class="search-field"><input id="ridingSearch" type="search" autocomplete="off" value="${escapeHtml(state.query)}" placeholder="${text('Search 93 ridings')}" aria-label="${text('Search 93 ridings')}"></label><div class="riding-list-header" id="ridingCount" role="status">${text('{count} of {total} ridings', { count: state.election.districts.filter(name => name.toLowerCase().includes(state.query.toLowerCase().trim())).length, total: 93 })}</div><div class="riding-list" id="ridingList">${ridingRows()}</div></aside>${mapCard(true)}</div>`;
}
function districtDetail(name) {
  const record = state.election.featuredDistricts2024[name];
  const ranked = record ? [...record.votes].sort((a,b)=>b.votes-a.votes) : [];
  const margin = record ? ranked[0].votes-ranked[1].votes : null;
  return `<div class="page-head riding-detail-head"><div class="riding-title"><p class="eyebrow"><a href="${routeHref('ridings')}">${text('← All ridings')}</a> / ${text('riding detail')}</p><h1 lang="en-CA">${escapeHtml(name)}</h1><p>${text('British Columbia · 2026 election · 2024 results shown for context.')}</p><span class="snapshot-pill">${text(record?'2024 verified':'Result unavailable')}</span></div>
    <section class="riding-header-member" aria-labelledby="memberRoleTitle"><p class="eyebrow" id="memberRoleTitle">${escapeHtml(ridingMemberLabel(candidateManifest,name))}</p><div id="ridingMember" data-riding="${escapeHtml(name)}">${ridingMember(candidateManifest,name,candidateError)}</div></section></div>
    <section class="riding-current-candidates">${panelHeader('2026 candidates','Elections BC determines ballot eligibility','SOURCE-BACKED')}
    <div id="ridingCandidates" data-riding="${escapeHtml(name)}">${ridingCandidates(state.election,candidateManifest,name,candidateError)}</div>
    ${cardBottom('Official party announcements are labelled separately.',sourceLink(state.election.sources.candidates,'Elections BC filings'))}</section>
    <section class="riding-historical-results">${panelHeader(record?'2024 final result':'2024 result unavailable','Official Elections BC source, not a 2026 projection','HISTORICAL DATA')}
    ${record ? `<div class="stat-grid"><div class="stat-tile"><strong class="stat-number">${escapeHtml(party(ranked[0].party).ballot)}</strong><span>${text('winning affiliation')}</span></div><div class="stat-tile"><strong class="stat-number">${number.format(margin)}</strong><span>${text('vote margin')}</span></div><div class="stat-tile"><strong class="stat-number">${number.format(record.validVotes)}</strong><span>${text('valid votes')}</span></div></div>
    ${Number.isFinite(record.turnout) ? `<p class="small-note">${text('2024 turnout: {turnout} · {count} registered voters', { turnout: percentage(record.turnout,2), count: number.format(record.registeredVoters) })}</p>` : ''}
    <div class="detail-vote">${ranked.map(vote=>`<div class="detail-vote-line"><span>${dot(party(vote.party).color)}${escapeHtml(vote.name)} <span class="subtle">· ${escapeHtml(party(vote.party).ballot)}</span></span><strong>${number.format(vote.votes)} · ${percentage(vote.votes/record.validVotes*100,2)}</strong><div class="bar-track"><div class="bar-fill" style="--bar:${party(vote.party).color};width:${vote.votes/record.validVotes*100}%"></div></div></div>`).join('')}</div>` : `<p class="small-note">${text('No detailed result is included for this riding in this snapshot.')}</p>`}
    ${cardBottom('Final 2024 count · no 2026 riding estimate.',sourceLink(record?.source || state.election.sources.districts,'Official results'))}</section>`;
}
function pollChart() {
  const firms = [...new Set(state.polls.releases.map(release => release.pollster))].sort();
  return `<div class="poll-chart-controls"><div class="poll-range-controls" role="group" aria-label="${text('Polling history range')}">${[[6,'6 months'],[12,'1 year'],[60,'5 years'],[120,'10 years']].map(([months,label]) => `<button type="button" data-poll-months="${months}" aria-pressed="${pollOptions.months === months}" class="${pollOptions.months === months ? 'selected' : ''}">${text(label)}</button>`).join('')}</div><label>${text('Pollster')} <select id="pollsterFilter"><option value="all">${text('All pollsters')}</option>${firms.map(firm => `<option value="${escapeHtml(firm)}" ${pollOptions.pollster === firm ? 'selected' : ''}>${escapeHtml(firm)}</option>`).join('')}</select></label><label class="poll-scenario-toggle"><input id="pollScenario" type="checkbox" ${pollOptions.scenario ? 'checked' : ''}> ${text('No-change scenario')}</label></div><div id="pollChartBody">${renderPollChart(state.polls, state.election, pollOptions)}</div>`;
}
function polls() {
  const list = pollSeries(state.polls, pollOptions).releases.sort((first, second) => second.released.localeCompare(first.released));
  return `<div class="page-head"><div><p class="eyebrow">${text('Original pollster releases')}</p><h1>${text('Professional polls')}</h1><p>${text('Published voting intention · Historical observations and current averages')}</p></div><span class="snapshot-pill">${text('Snapshot / {date}', { date: readableDate(state.polls.snapshotDate) })}</span></div>
    <section class="poll-history">${panelHeader('Voting intention over time','Source-linked observations / same-pollster series',translate('{count} OF {total} RELEASES', { count: list.length, total: state.polls.releases.length }))}${pollChart()}</section>
    <div class="poll-layout"><section class="card card-pad">${panelHeader('Poll release archive','Fieldwork, question base and sources','PRIMARY SOURCES')}<div class="release-list">
    ${list.map(release => `<article class="release"><div class="release-top"><strong>${escapeHtml(release.pollster)}</strong><time datetime="${release.released}">${readableDate(release.released,{month:'short',day:'numeric',year:'numeric'})}</time></div>
      <p class="details">${text('Fieldwork')} ${readableDate(release.fieldStart)}–${readableDate(release.fieldEnd)} · n=${number.format(release.sampleTotal)} ${text('total')}${release.sampleDecided ? ` / n=${number.format(release.sampleDecided)} ${text('voting-intention sample')}` : ''} · <span lang="en">${escapeHtml(release.method)} · ${escapeHtml(release.basis)}</span></p>
      <div class="figures">${Object.entries(release.shares).map(([id,value]) => `<span>${dot(party(id).color)}${escapeHtml(party(id).ballot)} <strong>${percentage(value)}</strong></span>`).join('')}</div>
      ${release.note ? `<details class="release-notes"><summary>${text('Data notes')}</summary><p lang="en">${escapeHtml(release.note)}</p></details>` : ''}<div class="release-sources">${sourceLink(release.source,'Original release')}${release.tables ? sourceLink(release.tables,'Data tables') : ''}</div></article>`).join('')}
    </div></section><div class="poll-right"><section class="card card-pad">${panelHeader('Current average',translate('Latest release per pollster / {count} days', { count: state.polls.summaryWindowDays }),translate('{count} POLLSTERS', { count: currentPolls().length }))}<div class="poll-context"><span>${dot('#27a55d')}${text('Observed releases')}</span><span>${text('{date} snapshot', { date: readableDate(state.polls.snapshotDate) })}</span></div>${currentRows()}${cardBottom('Unweighted mean. Separately reported parties only.',`<a href="${routeHref('about')}" class="action-link">${text('Calculation details →')}</a>`)}</section>
    <section class="card card-pad">${panelHeader('Observed poll range','Minimum and maximum included values','NOT A CI')}<div class="range-list">${averages().filter(result => result.mean != null).map(result => `<div class="range-row"><span>${dot(party(result.id).color)}${escapeHtml(party(result.id).ballot)}</span><div class="range-track" style="--bar:${party(result.id).color}"><i style="left:${result.min/55*100}%;width:${(result.max-result.min)/55*100}%"></i><b style="left:${result.mean/55*100}%"></b></div><strong>${percentage(result.min,0)}–${percentage(result.max,0)}</strong></div>`).join('')}</div><p class="small-note">${text('Observed ranges show disagreement between pollsters, not sampling uncertainty.')}</p></section></div></div>`;
}
function parties() {
  return partyDirectory(state.election, candidateManifest, candidateError, { programs: partyPrograms, filters: programFilters, programsError: programError, view: programView, comparison: programComparison });
}
function candidates() {
  return candidateDirectory(state.election, candidateManifest, candidateFilters, candidateError);
}

async function loadPrograms() {
  if (programRequest || partyPrograms !== undefined || programError) return;
  programRequest = snapshotResponse('programs.json');
  try {
    const response = await programRequest;
    if (response.status === 404) { partyPrograms = null; return; }
    if (!response.ok) throw new Error('Programme sources could not be loaded.');
    const programs = await response.json();
    if (programs.schemaVersion !== 2 || !Array.isArray(programs.parties) || !Array.isArray(programs.sources) || !Array.isArray(programs.topics) || !Number.isFinite(Date.parse(programs.checkedAt))) throw new Error('Verified quotation data is unavailable.');
    partyPrograms = programs;
  } catch (error) {
    programError = error.message;
  } finally {
    programRequest = null;
    if (currentRoute() === 'parties') render();
  }
}

function updatePartyResults() {
  const container = document.getElementById('partyResults');
  disposeComparison();
  const results = programView === 'compare' ? partyComparison(state.election, candidateManifest, partyPrograms, programComparison) : partyResults(state.election, candidateManifest, partyPrograms, programFilters);
  container.innerHTML = results;
  refreshMapIcons();
  disposeComparison = mountComparison(container, programComparison);
}

function showProgramView(view, partyId) {
  if (!['compare', 'explore'].includes(view)) return;
  if (partyId) {
    if (!state.election.parties.some(party => party.id === partyId)) return;
    programFilters.partyId = partyId;
    programFilters.topic = 'all';
    programFilters.query = '';
  }
  programView = view;
  render();
  const focus = document.getElementById(partyId ? 'programParty' : view === 'compare' ? 'programTabCompare' : 'programTabExplore');
  focus?.focus({ preventScroll: true });
  if (partyId) document.getElementById('programViewPanel').scrollIntoView({ block: 'start', behavior: 'instant' });
}

async function loadCandidates() {
  if (candidateRequest || candidateManifest || candidateError) return;
  candidateRequest = snapshotResponse('assets/manifest.json');
  try {
    const response = await candidateRequest;
    if (!response.ok) throw new Error('The candidate data could not be loaded.');
    const manifest = await response.json();
    if (!Array.isArray(manifest.candidates) || !Array.isArray(manifest.assets) || !Array.isArray(manifest.parties)) throw new Error('The candidate catalogue is incomplete.');
    candidateManifest = manifest;
    atNominationDeadline(manifest, () => {
      if (['candidates', 'parties'].includes(currentRoute()) || currentRoute()?.startsWith('riding/')) render();
    });
  } catch (error) {
    candidateError = error.message;
  } finally {
    candidateRequest = null;
    if (['candidates', 'parties'].includes(currentRoute())) render();
    const panel = document.getElementById('ridingCandidates');
    if (panel) panel.innerHTML = ridingCandidates(state.election,candidateManifest,panel.dataset.riding,candidateError);
    const memberPanel = document.getElementById('ridingMember');
    if (memberPanel) {
      memberPanel.innerHTML = ridingMember(candidateManifest,memberPanel.dataset.riding,candidateError);
      document.getElementById('memberRoleTitle').textContent = ridingMemberLabel(candidateManifest,memberPanel.dataset.riding);
    }
  }
}
function about() {
  const e=state.election.sources;
  return `<div class="page-head"><div><p class="eyebrow">BC Election Guide</p><h1>${text('About')}</h1><p>${text('An independent, unofficial guide to British Columbia elections. Not affiliated with Elections BC or any political party.')}</p></div></div>
    <div class="simple-layout"><section class="card card-pad prose-card">
    ${panelHeader('Sources & methodology', 'Independent and unofficial', 'SOURCES')}
    <h3>${text('Election records')}</h3><p>${text("Official 2024 provincial totals and {count} riding results come from Elections BC's final Statement of Votes. Complete riding imports are checked against the report's independent district totals, party vote totals and seat totals. The party directory follows the registered-party PDF dated {registerDate}. Election Day comes from Elections BC. Past results are not current projections.", { count: Object.keys(state.election.featuredDistricts2024).length, registerDate: readableDate(state.election.partyRegisterChecked, { month: 'long', day: 'numeric', year: 'numeric' }) })}</p>
    <h3>${text('Polling summary')}</h3><p>${text('{count} survey records come from the original pollsters. The current summary takes the latest release from each distinct pollster in the {days} days ending {date}. Values are arithmetic means of reported party shares. Ranges are the smallest and largest release values, not confidence intervals. At least two pollsters must report a party separately for it to appear in the summary.', { count: state.polls.releases.length, days: state.polls.summaryWindowDays, date: readableDate(state.polls.snapshotDate) })}</p>
    <p>${text('Older releases remain in the archive without counting the same firm twice in the current mean. Grouped responses are never divided among named parties. Chart lines connect observations from the same pollster, with gaps for unreported values; question bases remain listed on each release. These lines are descriptive, not a fitted polling average.')}</p>
    <p>${text('The optional dashed election-day continuation holds the recent average unchanged. This no-change scenario is not a forecast, confidence interval or seat projection.')}</p>
    <h3>${text('Geography and location')}</h3><p>${text('The 93 district boundaries come from Elections BC through DataBC. Display boundaries are simplified; location matching uses the full-resolution geometry. Contains information licenced under the')} ${sourceLink('https://www.elections.bc.ca/docs/EBC-Open-Data-Licence.pdf','Elections BC Open Data Licence')}.</p>
    <p>${text('Location access requires permission. Phones may use GPS; desktop locations can be less precise. Coordinates stay in memory and are not saved in localStorage or URLs. Map providers receive requests for the viewed area. A current location is not necessarily a home address, and this match is not an official voter assignment. Confirm your home riding with Elections BC.')}</p>
    <p>${text('Address queries are sent to the BC Address Geocoder. Postal codes and city-only results are not used to assign a riding. The selected address is checked against the full-resolution district boundaries locally. Address text and coordinates are not stored by this site; they are cleared when the finder closes. Contains information licensed under the')} ${sourceLink('https://www2.gov.bc.ca/gov/content/data/policy-standards/data-policies/open-data/open-government-licence-bc','Open Government Licence - British Columbia')}.</p>
    <h3>${text('Map imagery')}</h3><p>${text('Sentinel-2 cloudless 2024 imagery is provided by EOX under')} ${sourceLink('https://cloudless.eox.at/license-non-commercial','CC BY-NC-SA 4.0')}${text(', for non-commercial use with attribution. Its 10 m resolution is regional satellite imagery, not live or house-level aerial photography. EOX also supplies terrain and reference labels. Streets are from OpenStreetMap contributors. These free services are best-effort and may be rate-limited.')}</p>
    <h3>${text('Candidate sources')}</h3><p>${text('Before nominations close on October 3 at 1 p.m. Pacific, official party directories and dated party press releases can establish a party-announced candidacy. Only Elections BC can establish an accepted nomination. After the deadline, ballot views use the verified final Elections BC list; if that list has not been refreshed, the site reports that verification is pending. Financial-agent names, addresses and phone numbers are not included.')}</p>
    <h3>${text('Candidate artwork')}</h3><p>${text('The separate artwork inventory records source pages, original files and usage-review status. Downloading a photograph or logo does not grant unrestricted reuse or imply endorsement. Missing artwork is not fabricated.')}</p>
    <h3>${text('Limits')}</h3><p>${text('No 2026 seat forecast is computed. The site is independent and unofficial. Use Elections BC for voting instructions, registration and current filings.')}</p>
    </section><aside class="card card-pad">${panelHeader('Original sources','','LINKS')}<ul class="source-list">
    <li>${sourceLink(e.election,'Elections BC')}<small>${text('Election and voter information')}</small></li>
    <li>${sourceLink(e.districts,'2024 Statement of Votes')}<small>${text('Official historical results')}</small></li>
    <li>${sourceLink(e.parties,'Registered parties PDF')}<small>${text('{date} register', { date: readableDate(state.election.partyRegisterChecked, { month: 'long', day: 'numeric' }) })}</small></li>
    <li>${sourceLink(e.candidates,'2026 candidate filings')}<small>${text('Accepted nominations')}</small></li>
    <li>${sourceLink(e.boundaries,'GIS spatial data')}<small>${text('93 electoral districts')}</small></li>
    <li>${sourceLink('https://maps.eox.at/','EOX Maps')}<small>${text('Satellite, terrain and reference labels')}</small></li>
    <li>${sourceLink('https://www.openstreetmap.org/copyright','OpenStreetMap')}<small>${text('Street data and attribution')}</small></li>
    ${state.polls.releases.map(release=>`<li>${sourceLink(release.source,release.pollster)}<small>${text('Released {date}', { date: readableDate(release.released) })}</small></li>`).join('')}</ul></aside></div>
    <section class="about-contact" aria-labelledby="contactHeading"><h2 id="contactHeading">${text('Contact')}</h2><p>${text('Questions, feedback or a correction?')}</p><a href="mailto:contact@bcelectionguide.ca">contact@bcelectionguide.ca</a></section>`;
}

function notFound() {
  return `<div class="page-head"><div><h1>${text('Page not found')}</h1><p>${text('This page is not available. Choose a riding or return to the overview.')}</p><a class="action-link" href="${routeHref('ridings')}">${text('Browse ridings')}</a></div></div>`;
}

function route() {
  const path = currentRoute();
  if (path?.startsWith('riding/')) {
    const name = state.election.districts.find(d => slug(d) === path.slice(7));
    return {section:name?'ridings':'not-found',ridingSlug:name?path.slice(7):null,name,html:name?districtDetail(name):notFound()};
  }
  const pages = {province,ridings:ridingExplorer,polls,parties,candidates,about};
  const section=Object.hasOwn(pages,path)?path:'not-found';
  return {section,html:section==='not-found'?notFound():pages[section]()};
}
function render(preserveMap = false) {
  if (!state.election || !state.polls) return;
  disposeComparison();
  const view = route();
  const sourceLibraryOpen = root.querySelector('.program-source-library')?.open;
  const retainedGeography = view.ridingSlug ? root.querySelector('.detail-geography') : null;
  const retainedMap = !retainedGeography && preserveMap ? root.querySelector('.map-section') : null;
  disposeMaps(retainedGeography || retainedMap);
  retainedGeography?.remove();
  retainedMap?.remove();
  root.innerHTML=view.html;
  const sourceLibrary = root.querySelector('.program-source-library');
  if (sourceLibrary && sourceLibraryOpen) sourceLibrary.open = true;
  if (retainedMap) root.querySelector('.map-section')?.replaceWith(retainedMap);
  if (view.ridingSlug) {
    const geography = retainedGeography || document.createElement('div');
    if (!retainedGeography) {
      geography.className = 'detail-geography';
      geography.innerHTML = mapCard(false, view.ridingSlug);
    }
    root.querySelector('.riding-current-candidates').after(geography);
    geography.querySelector('[data-riding-map]').dataset.selectedRiding = view.ridingSlug;
    if (retainedGeography) updateRidingMap(geography, view.ridingSlug);
  }
  document.querySelectorAll('[data-nav]').forEach(link=>{const active=link.dataset.nav===view.section;link.classList.toggle('active',active);if(active)link.setAttribute('aria-current','page');else link.removeAttribute('aria-current')});
  refreshRouteLinks();
  updatePageMetadata(pageInfo(currentRoute(), state.election, document.querySelector('meta[name="site-url"]')?.content || publishedSite));
  mountMaps(state.election);
  disposeComparison = mountComparison(root, programComparison);
  if (['candidates', 'parties'].includes(view.section) || view.ridingSlug) loadCandidates();
  if (view.section === 'parties') loadPrograms();
  return Boolean(retainedGeography);
}
function updateCountdown() {
  if (!state.election)return;
  const days=Math.max(0,Math.ceil((new Date(`${state.election.electionDate}T00:00:00-07:00`)-new Date())/86400000));
  document.getElementById('countdown').textContent=days===0?translate('Election Day · Oct 24'):translate(days === 1 ? '{count} day to election day' : '{count} days to election day', { count: formatNumber(days) });
}

function setMenuOpen(open) {
  const button = document.getElementById('menuButton');
  const message = open ? 'Close menu' : 'Open menu';
  document.getElementById('mobileMenu').hidden = !open;
  button.setAttribute('aria-expanded', String(open));
  button.dataset.i18nAriaLabel = message;
  button.setAttribute('aria-label', translate(message));
}

document.addEventListener('keydown', event => {
  if (event.key !== 'Escape' || document.getElementById('mobileMenu').hidden || document.getElementById('ridingFinder').open) return;
  setMenuOpen(false);
  document.getElementById('menuButton').focus();
});

function updateLanguage() {
  const top = window.scrollY;
  translateElements();
  refreshRouteLinks();
  syncLanguageControls();
  if (state.election) {
    document.getElementById('snapshotStatus').textContent = translate('Source snapshot · {date} PT', { date: readableDate(state.election.snapshotDate,{month:'long',day:'numeric',year:'numeric'}) });
    updateCountdown();
    render(true);
    refreshMapLanguage();
    window.scrollTo({ top, behavior: 'instant' });
  }
  document.getElementById('languageStatus').textContent = translate('Interface language changed to English.');
}
translateElements();
syncLanguageControls();
window.addEventListener('languagechange', updateLanguage);

document.querySelector('.skip-link').addEventListener('click', event => {
  event.preventDefault();
  root.focus({ preventScroll: true });
  root.scrollIntoView({ block: 'start', behavior: 'instant' });
});
document.addEventListener('click', e=>{
  if (e.target.closest('[data-program-retry]')) { programError = ''; render(); return; }
  const programTab = e.target.closest('[data-program-view]');
  if (programTab) { showProgramView(programTab.dataset.programView); return; }
  const exploreProgram = e.target.closest('[data-program-explore]');
  if (exploreProgram) { showProgramView('explore', exploreProgram.dataset.programExplore); return; }
  const programJump = e.target.closest('[data-program-jump]');
  if (programJump) {
    const target = document.getElementById(programJump.dataset.programJump);
    target?.focus({ preventScroll: true });
    target?.scrollIntoView({ block: 'start', behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth' });
    return;
  }
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
    navigate('candidates');
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
  const ridingFinder = e.target.closest('[data-find-riding]');
  if(ridingFinder){openRidingFinder(ridingFinder);return}
  const filter=e.target.closest('[data-filter]');if(filter){state.filter=filter.dataset.filter;render();return}
  const partyFilter=e.target.closest('[data-party-filter]');if(partyFilter){state.partyFilter=partyFilter.dataset.partyFilter;render();return}
  const menu=e.target.closest('#menuButton');if(menu){setMenuOpen(document.getElementById('mobileMenu').hidden);return}
  if(e.target.closest('#mobileMenu a')) setMenuOpen(false);
});
document.addEventListener('input',e=>{
  if (e.target.id === 'programSearch') { programFilters.query = e.target.value; updatePartyResults(); return; }
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
    document.getElementById('ridingCount').textContent=translate('{count} of {total} ridings · alphabetical', { count: visible, total: state.election.districts.length });
  }
  if(e.target.id==='globalSearch'){
    state.query=e.target.value;
    if(currentRoute()!=='ridings')navigate('ridings');else {document.getElementById('ridingList').innerHTML=ridingRows();document.getElementById('ridingSearch').value=state.query}
  }
});
document.addEventListener('change', event => {
  if (event.target.matches('input[data-language]')) { setLanguage(event.target.value); return; }
  if (event.target.matches('[data-comparison-topic]')) {
    if (!event.target.checked || !partyPrograms.topics.some(topic => topic.id === event.target.value)) return;
    disposeComparison();
    programComparison.index = 0;
    programComparison.topic = event.target.value;
    updatePartyResults();
    const table = document.querySelector('.comparison-table-region');
    if (table) table.scrollTop = 0;
    return;
  }
  if (event.target.id === 'programParty' || event.target.id === 'programTopic') {
    programFilters[event.target.id === 'programParty' ? 'partyId' : 'topic'] = event.target.value;
    updatePartyResults();
    return;
  }
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
document.addEventListener('keydown', event => {
  if (!event.target.matches('[data-program-view]') || !['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
  event.preventDefault();
  const next = event.key === 'Home' ? 'compare' : event.key === 'End' ? 'explore' : programView === 'compare' ? 'explore' : 'compare';
  showProgramView(next);
});
window.addEventListener('routechange', () => {
  setMenuOpen(false);
  if (!render()) {
    root.focus({ preventScroll: true });
    window.scrollTo({ top: 0, behavior: 'instant' });
  }
});
installRouter();
refreshRouteLinks();
try {
  const [electionResponse,pollsResponse]=await Promise.all([snapshotResponse('election.json'),snapshotResponse('polls.json')]);
  if(!electionResponse.ok||!pollsResponse.ok)throw Error('One of the data files could not be loaded.');
  [state.election,state.polls]=await Promise.all([electionResponse.json(),pollsResponse.json()]);
  document.getElementById('snapshotStatus').removeAttribute('data-i18n');
  document.getElementById('snapshotStatus').textContent=translate('Source snapshot · {date} PT', { date: readableDate(state.election.snapshotDate,{month:'long',day:'numeric',year:'numeric'}) });
  updateCountdown();render();setInterval(updateCountdown,3600000);
} catch(error) {
  root.innerHTML=`<div class="card card-pad"><h1 data-i18n="Data unavailable">${text('Data unavailable')}</h1><p data-i18n="The site could not load its local JSON files. Please reload the page or open the published site through a web server.">${text('The site could not load its local JSON files. Please reload the page or open the published site through a web server.')}</p><p class="small-note" data-i18n="${escapeHtml(error.message)}">${text(error.message)}</p></div>`;
}
