import { candidateRoster, candidateStatusLabel, candidateRosterNote } from './candidate-policy.js';
import { translate, translateCount, currentLanguage, compareLabels, formatDate, formatNumber } from './i18n.js';
import { routeHref, siteHref } from './routes.js';
import { canPublishAsset } from './asset-policy.js';

const collator = { compare: compareLabels };
const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]);
const text = (message, values) => escapeHtml(translate(message, values));
const candidateCount = count => escapeHtml(translateCount(count, '{count} candidate', '{count} candidates'));
const quotationCount = count => escapeHtml(translateCount(count, '{count} quotation', '{count} quotations'));
const normalize = value => String(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('en-CA');
const sourceLink = (url, label, { original = false, icon = false } = {}) => /^https?:\/\//.test(url || '') ? `<a href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer"${original ? ' lang="en"' : ''}>${original ? escapeHtml(label) : text(label)}${icon ? ' <i data-lucide="arrow-up-right" aria-hidden="true"></i>' : ''}</a>` : '';
const imageUrl = asset => canPublishAsset(asset) && asset?.web?.path?.startsWith('assets/') && !asset.web.path.includes('..') ? siteHref(`data/${asset.web.path}`) : '';

function partyLogo(group, manifest, byId) {
  const assets = (manifest.parties.find(item => item.id === group.id)?.assetIds || []).map(id => byId.get(id)).filter(asset => imageUrl(asset));
  const image = assets.find(asset => !/white/i.test(asset.sourceUrl)) || assets[0];
  if (!image) return `<span class="candidate-party-mark" style="--party:${escapeHtml(group.color)}" aria-hidden="true"></span>`;
  const dark = /white/i.test(image.sourceUrl);
  return `<span class="candidate-party-logo ${dark ? 'on-dark' : ''}"><img src="${escapeHtml(imageUrl(image))}" alt="" width="120" height="42" loading="lazy"></span>`;
}

function candidateGroups(election, candidates) {
  const groups = [...election.parties];
  for (const candidate of candidates) {
    if (!groups.some(group => group.id === candidate.partyId)) groups.push({ id: candidate.partyId, ballot: translate(candidate.partyId === 'independent' ? 'Independent' : 'Unaffiliated'), color: '#687d88' });
  }
  return groups.sort((first, second) => collator.compare(first.ballot, second.ballot));
}

function candidateSources(candidate, portrait) {
  const label = candidate.statusSourceType === 'party-release' ? 'Party press release' : candidate.statusSourceType === 'elections-bc' ? 'Elections BC nomination' : 'Party announcement';
  return `<div class="candidate-card-links">${sourceLink(candidate.profileUrl || candidate.sourcePage, 'Candidate source')}${portrait ? sourceLink(portrait.sourcePage, 'Photo source') : ''}${sourceLink(candidate.statusSource, label)}</div>${candidate.announcedOn ? `<p class="small-note">${text('Announced')} <time datetime="${escapeHtml(candidate.announcedOn)}">${formatDate(candidate.announcedOn, { dateStyle: 'medium' })}</time></p>` : ''}`;
}

export function candidateResults(election, manifest, filters) {
  const roster = candidateRoster(manifest);
  if (roster.phase === 'awaiting-official-list') return `<div class="empty-state" role="status"><strong>${text('Awaiting the final Elections BC list')}</strong><p>${candidateRosterNote(roster.phase)}</p>${sourceLink(election.sources.candidates, 'Current Elections BC candidate list')}</div>`;
  const byId = new Map(manifest.assets.map(asset => [asset.id, asset]));
  const groups = candidateGroups(election, roster.candidates);
  const query = normalize(filters.query.trim());
  const visible = roster.candidates.filter(candidate => {
    const group = groups.find(item => item.id === candidate.partyId);
    return (filters.partyId === 'all' || candidate.partyId === filters.partyId) &&
      (filters.riding === 'all' || (filters.riding === 'unresolved' ? candidate.district === null : candidate.district === filters.riding)) &&
      normalize(`${candidate.name} ${candidate.district || candidate.reportedDistrict || ''} ${group.ballot}`).includes(query);
  });
  const navigation = `<nav id="candidatePartyNavigation" class="candidate-party-nav" aria-label="${text('Jump to party')}" tabindex="-1">${groups.map(group => {
    const count = visible.filter(candidate => candidate.partyId === group.id).length;
    const available = (filters.partyId === 'all' || filters.partyId === group.id) && (count > 0 || (!query && filters.riding === 'all'));
    return `<button type="button" class="candidate-nav-button" data-party-jump="${escapeHtml(group.id)}" aria-label="${escapeHtml(group.ballot)}: ${candidateCount(count)}" title="${available ? text('Jump to {party}', { party: group.ballot }) : text('No matches with these filters')}" ${available ? '' : 'disabled'}>${partyLogo(group, manifest, byId)}<span class="candidate-nav-name">${escapeHtml(group.ballot)}</span><span class="candidate-nav-count">${candidateCount(count)}</span></button>`;
  }).join('')}</nav>`;
  const sections = groups.filter(group => filters.partyId === 'all' || group.id === filters.partyId).map(group => {
    const candidates = visible.filter(candidate => candidate.partyId === group.id).sort((first, second) => collator.compare(first.name, second.name));
    if (!candidates.length && (query || filters.riding !== 'all')) return '';
    return `<section class="candidate-party-section" aria-labelledby="candidate-party-${escapeHtml(group.id)}" data-candidate-party="${escapeHtml(group.id)}">
      <header class="candidate-party-heading">${partyLogo(group, manifest, byId)}<h2 id="candidate-party-${escapeHtml(group.id)}" tabindex="-1">${escapeHtml(group.ballot)}</h2><div class="candidate-group-actions"><span>${candidateCount(candidates.length)}</span><button type="button" class="candidate-top-control" data-candidate-top title="${text('Back to the party list')}"><i data-lucide="arrow-up-right" aria-hidden="true"></i>${text('Top')}</button></div></header>
      ${candidates.length ? `<div class="candidate-grid">${candidates.map(candidate => {
        const portrait = candidate.assetIds.map(id => byId.get(id)).find(asset => asset?.kind === 'portrait' && imageUrl(asset));
        const accepted = candidate.status === 'accepted';
        return `<article class="candidate-card" data-candidate-id="${escapeHtml(candidate.id)}">
          <div class="candidate-portrait">${portrait ? `<img src="${escapeHtml(imageUrl(portrait))}" alt="${escapeHtml(candidate.name)}" width="320" height="400" loading="lazy" decoding="async">` : `<span>${text('Portrait unavailable')}</span>`}</div>
          <div class="candidate-card-body"><h3>${escapeHtml(candidate.name)}</h3>${candidate.districtSlug ? `<a class="candidate-riding" href="${routeHref(`riding/${candidate.districtSlug}`)}" lang="en-CA">${escapeHtml(candidate.district)}</a>` : `<span class="candidate-riding candidate-unresolved">${text('Riding unconfirmed')}</span><p class="small-note">${text('Source lists: {riding}.', { riding: candidate.reportedDistrict })}</p>`}
          <span class="candidate-status ${accepted ? 'accepted' : ''}">${candidateStatusLabel(candidate, roster.phase)}</span>
          ${candidateSources(candidate, portrait)}</div>
        </article>`;
      }).join('')}</div>` : `<p class="candidate-empty-party">${text('No candidates recorded in this snapshot.')}</p>`}
    </section>`;
  }).join('');
  return `${navigation}<div class="candidate-results-count" role="status">${text('{count} of {total} candidates · Name A–Z', { count: formatNumber(visible.length), total: formatNumber(roster.candidates.length) })}</div>${sections || `<div class="empty-state"><strong>${text('No matching candidates')}</strong>${text('Clear the search or change the selected party or riding.')}</div>`}<button type="button" class="candidate-top-control candidate-top-floating" data-candidate-top title="${text('Back to the party list')}"><i data-lucide="arrow-up-right" aria-hidden="true"></i>${text('Top')}</button>`;
}

export function candidateDirectory(election, manifest, filters, error = '') {
  const heading = `<div class="page-head"><div><p class="eyebrow">${text('2026 provincial election')}</p><h1>${text('Parties & candidates')}</h1></div>${manifest ? `<span class="snapshot-pill">${text('Catalogue · {date}', { date: formatDate(manifest.collectedAt, { dateStyle: 'medium', timeZone: 'America/Vancouver' }) })}</span>` : ''}</div>`;
  if (error) return `${heading}<div class="empty-state"><strong>${text('Candidate catalogue unavailable')}</strong><p>${text(error)}</p><button class="secondary-button" type="button" data-candidate-retry>${text('Retry')}</button></div>`;
  if (!manifest) return `${heading}<div class="loading-state" role="status">${text('Loading candidates...')}</div>`;
  const roster = candidateRoster(manifest);
  if (roster.phase === 'awaiting-official-list') return `${heading}<div id="candidateResults">${candidateResults(election, manifest, filters)}</div>`;
  const parties = candidateGroups(election, roster.candidates);
  return `${heading}<p class="candidate-snapshot-note">${text('{count} registered parties', { count: election.parties.length })} · ${candidateRosterNote(roster.phase)}</p>
    <div class="candidate-toolbar"><label><span>${text('Candidate or riding')}</span><input id="candidateSearch" type="search" value="${escapeHtml(filters.query)}" placeholder="${text('Search by name or riding')}" autocomplete="off"></label>
    <label><span>${text('Party or affiliation')}</span><select id="candidateParty"><option value="all">${text('All affiliations')}</option>${parties.map(group => `<option value="${escapeHtml(group.id)}" ${filters.partyId === group.id ? 'selected' : ''}>${escapeHtml(group.ballot)} (${formatNumber(roster.candidates.filter(candidate => candidate.partyId === group.id).length)})</option>`).join('')}</select></label>
    <label><span>${text('Riding')}</span><select id="candidateRiding"><option value="all">${text('All ridings')}</option>${roster.candidates.some(candidate => candidate.district === null) ? `<option value="unresolved" ${filters.riding === 'unresolved' ? 'selected' : ''}>${text('Riding unconfirmed')}</option>` : ''}${[...election.districts].sort(collator.compare).map(name => `<option value="${escapeHtml(name)}" ${filters.riding === name ? 'selected' : ''}>${escapeHtml(name)}</option>`).join('')}</select></label></div>
    <div id="candidateResults">${candidateResults(election, manifest, filters)}</div>`;
}

export function ridingMemberLabel(manifest, district) {
  const member = manifest?.members?.find(record => record.district === district);
  return translate('MLA at dissolution', {}, member?.id);
}

export function ridingMember(manifest, district, error = '') {
  if (error) return `<p role="alert">${text(error)}</p><button type="button" class="secondary-button" data-candidate-retry>${text('Retry')}</button>`;
  if (!manifest) return `<p class="small-note" role="status">${text('Loading MLA profile...')}</p>`;
  const member = manifest.members?.find(record => record.district === district);
  if (!member) return `<p class="small-note">${text(manifest.memberSnapshot?.notListedDistricts.includes(district) ? 'The Legislature lists no active member for this riding at dissolution.' : 'No verified MLA profile is included for this riding in this snapshot.')}</p>`;
  const portrait = member.assetIds.map(id => manifest.assets.find(asset => asset.id === id)).find(asset => asset?.kind === 'portrait' && imageUrl(asset));
  const asOf = formatDate(manifest.memberSnapshot.asOf, { dateStyle: 'medium' });
  return `<article class="riding-member" data-member-id="${escapeHtml(member.id)}">
    ${portrait ? `<img class="riding-member-photo" src="${escapeHtml(imageUrl(portrait))}" alt="${escapeHtml(member.name)}" width="112" height="140" loading="lazy">` : `<span class="riding-member-photo">${text('Portrait unavailable')}</span>`}
    <div class="riding-member-info"><h3>${escapeHtml(member.name)}</h3><span lang="en-CA">${escapeHtml(member.affiliation)}</span><p class="small-note">${text('At dissolution · {date}', { date: asOf })}</p>
    <div class="candidate-card-links">${sourceLink(member.profileUrl, translate('MLA profile', {}, member.id))}${portrait ? sourceLink(portrait.sourcePage, 'Photo source') : ''}</div>
    ${portrait?.reuse?.licenseUrl ? `<p class="small-note" lang="en">${escapeHtml(portrait.credit)} ${sourceLink(portrait.reuse.licenseUrl, portrait.reuse.license, { original: true })}</p>` : ''}</div>
  </article>`;
}

export function ridingCandidates(election, manifest, district, error = '') {
  if (error) return `<p role="alert">${text(error)}</p><button type="button" class="secondary-button" data-candidate-retry>${text('Retry')}</button>`;
  if (!manifest) return `<p class="small-note" role="status">${text('Loading candidates...')}</p>`;
  const roster = candidateRoster(manifest);
  if (roster.phase === 'awaiting-official-list') return `<p class="small-note" role="status">${candidateRosterNote(roster.phase)}</p>${sourceLink(election.sources.candidates, 'Current Elections BC candidate list')}`;
  const candidates = roster.candidates.filter(candidate => candidate.district === district).sort((first, second) => collator.compare(first.name, second.name));
  if (!candidates.length) return `<p class="small-note">${text(roster.phase === 'final-ballot' ? 'No candidates for this riding are recorded in the verified final list.' : 'No candidates recorded for this riding in this snapshot. This is not confirmation that nobody is running.')}</p>`;
  const byId = new Map(manifest.assets.map(asset => [asset.id, asset]));
  return `<div class="riding-candidate-list">${candidates.map(candidate => {
    const group = candidateGroups(election, candidates).find(party => party.id === candidate.partyId);
    const portrait = candidate.assetIds.map(id => byId.get(id)).find(asset => asset?.kind === 'portrait' && imageUrl(asset));
    const accepted = candidate.status === 'accepted';
    return `<article class="riding-candidate" data-candidate-id="${escapeHtml(candidate.id)}">
      ${portrait ? `<img class="riding-candidate-photo" src="${escapeHtml(imageUrl(portrait))}" alt="${escapeHtml(candidate.name)}" width="68" height="85" loading="lazy">` : `<span class="riding-candidate-photo">${text('Portrait unavailable')}</span>`}
      <div class="riding-candidate-info"><h3>${escapeHtml(candidate.name)}</h3><span class="riding-candidate-party">${escapeHtml(group?.ballot || candidate.partyId)}</span>
      <span class="candidate-status ${accepted ? 'accepted' : ''}">${candidateStatusLabel(candidate, roster.phase)}</span>
      ${candidateSources(candidate, portrait)}</div>
    </article>`;
  }).join('')}</div>`;
}

const programDate = source => source.publishedOn ? formatDate(source.publishedOn, { dateStyle: 'medium' }) : source.electionYear ? translate('{year} material', { year: source.electionYear }) : translate('Publication date not stated');

const sourceKinds = {
  platform: 'Election platform',
  'policy-declaration': 'Policy declaration',
  'policy-page': 'Policy page',
  'campaign-announcement': 'Campaign announcement',
  'record-and-priorities': 'Record and priorities',
  'vision-statement': 'Vision statement',
  'party-website': 'Party website',
  'source-index': 'Document index',
  'programme-update': 'Programme update'
};

export function programSourceLibrary(election, programs) {
  const bySource = new Map(programs.sources.map(source => [source.id, source]));
  const byParty = new Map(programs.parties.map(program => [program.id, program]));
  return `<details class="program-source-library"><summary>${text('Full documents and source coverage')}</summary><p>${text('Coverage counts describe the excerpts recorded in this guide, not whether a party has a policy.')}</p><div class="program-source-list">${[...election.parties].sort((first, second) => compareLabels(first.ballot, second.ballot)).map(party => {
    const program = byParty.get(party.id);
    const topics = new Set((program?.quotes || []).map(quote => quote.topic)).size;
    return `<section class="program-source-party" data-source-party="${escapeHtml(party.id)}"><div><h3>${escapeHtml(party.ballot)}</h3><p>${text('{count} of {total} topics with recorded excerpts', { count: topics, total: programs.topics.length })}</p></div><div>${program?.sourceIds.length ? `<ul>${program.sourceIds.map(id => `<li>${programSource(bySource.get(id))}</li>`).join('')}</ul>` : `<p>${text('No official programme document verified in this guide.')}</p>`}</div></section>`;
  }).join('')}</div></details>`;
}

function programSource(source, locator = '') {
  return `<div class="program-citation">${sourceLink(source.url, source.title, { original: true })}${source.kind ? `<span class="program-source-kind">${text(sourceKinds[source.kind])}</span>` : ''}<span>${escapeHtml(programDate(source))}</span>${locator ? `<span lang="en">${escapeHtml(locator)}</span>` : ''}</div>`;
}

function programQuotation(quote, source) {
  return `<figure class="program-quote" data-quote-id="${escapeHtml(quote.id)}">${currentLanguage() === 'fr' ? `<span class="program-quote-label">${text('English original')}</span>` : ''}<blockquote cite="${escapeHtml(source.url)}" lang="en"><p>&ldquo;${escapeHtml(quote.text)}&rdquo;</p></blockquote><figcaption><strong lang="en">${escapeHtml(quote.speaker)}</strong>${programSource(source, quote.locator || '')}</figcaption></figure>`;
}

export function partyComparison(election, manifest, programs, comparison = { topic: 'housing' }) {
  const parties = [...election.parties].sort((first, second) => collator.compare(first.ballot, second.ballot));
  const byAsset = new Map(manifest.assets.map(asset => [asset.id, asset]));
  const bySource = new Map(programs.sources.map(source => [source.id, source]));
  const byProgram = new Map(programs.parties.map(program => [program.id, program]));
  const topic = programs.topics.find(topic => topic.id === comparison.topic) || programs.topics[0];
  const entries = parties.map(party => {
    const program = byProgram.get(party.id);
    const quotes = (program?.quotes || []).filter(quote => quote.topic === topic.id);
    const hidden = Boolean(comparison.hiddenIds?.includes(party.id));
    return { party, quotes, sourceIds: [...new Set(quotes.map(quote => quote.sourceId))], hidden, pinned: !hidden && Boolean(comparison.pinnedIds?.includes(party.id)) };
  });
  const shown = entries.filter(entry => !entry.hidden);
  const layout = comparison.layout === 'rows' ? 'rows' : 'columns';
  const quotations = entry => entry.quotes.length ? entry.quotes.map(quote => programQuotation(quote, bySource.get(quote.sourceId))).join('') : `<p class="comparison-missing">${text('No quotation recorded for this topic.')}</p>`;
  const sources = entry => entry.sourceIds.length ? `<ul class="comparison-sources">${entry.sourceIds.map(id => { const source = bySource.get(id); return `<li>${sourceLink(source.url, source.title, { original: true })}<span lang="en">${escapeHtml(source.publisher)}</span><span>${escapeHtml(programDate(source))}</span></li>`; }).join('')}</ul>` : `<p class="comparison-missing">${text('No source recorded.')}</p>`;
  const row = (id, label, content) => `<tbody><tr class="comparison-row-title"><th id="comparison-${id}" scope="rowgroup" colspan="${Math.max(1, shown.length)}"><span>${text(label)}</span></th></tr><tr data-comparison-row="${id}">${entries.map(entry => `<td headers="comparison-party-${escapeHtml(entry.party.id)} comparison-${id}">${content(entry)}</td>`).join('')}</tr></tbody>`;
  const choice = (kind, summary, legend, options, actions) => `<details class="comparison-choice comparison-${kind}-choice"><summary>${summary}</summary><div class="comparison-choice-panel"><fieldset class="comparison-choice-options"><legend class="sr-only">${text(legend)}</legend>${options}</fieldset><div class="comparison-choice-actions">${actions}</div></div></details>`;
  const option = (entry, kind, prefix, checked, hidden = false) => `<label${hidden ? ' hidden' : ''}><input id="${prefix}-${escapeHtml(entry.party.id)}" type="checkbox" data-comparison-${kind}="${escapeHtml(entry.party.id)}" ${checked ? 'checked' : ''}><span>${escapeHtml(entry.party.ballot)}</span></label>`;
  const pinPicker = choice('pin', text('Pinned parties ({count})', { count: entries.filter(entry => entry.pinned).length }), 'Parties to pin', entries.map(entry => option(entry, 'pin', 'comparisonPin', entry.pinned, entry.hidden)).join(''), `<button type="button" data-comparison-pin-action="all">${text('Pin all')}</button><button type="button" data-comparison-pin-action="clear">${text('Unpin all')}</button>`);
  const hidePicker = choice('hide', text('Hidden parties ({count})', { count: entries.length - shown.length }), 'Parties to hide', entries.map(entry => option(entry, 'hide', 'comparisonHide', entry.hidden)).join(''), `<button type="button" data-comparison-hide-action="clear">${text('Show all')}</button><button type="button" data-comparison-hide-action="all">${text('Hide all')}</button>`);
  const segmented = (name, legend, current, values) => `<fieldset class="comparison-segmented comparison-${name}"><legend class="sr-only">${text(legend)}</legend>${values.map(([value, label]) => `<label><input class="sr-only" type="radio" name="comparison-${name}" value="${value}" data-comparison-${name} ${current === value ? 'checked' : ''}><span>${text(label)}</span></label>`).join('')}</fieldset>`;
  const columnCount = String(comparison.columns ?? 'auto');
  const columnPicker = `<label class="comparison-columns-choice"><span>${text('Visible columns')}</span><select data-comparison-columns>${['auto', '1', '2', '3', '4', '5', '6'].map(value => `<option value="${value}" ${columnCount === value ? 'selected' : ''}>${value === 'auto' ? text('Auto') : formatNumber(Number(value))}</option>`).join('')}</select></label>`;
  const navigationButton = (direction, pinned = false) => {
    const label = pinned ? direction === 'previous' ? 'Previous pinned parties' : 'Next pinned parties' : direction === 'previous' ? 'Previous parties' : 'Next parties';
    return `<button type="button" class="comparison-nav-button comparison-${direction}" data-${pinned ? 'comparison-pin-move' : 'comparison-move'}="${direction}" aria-label="${text(label)}" title="${text(label)}" aria-controls="comparisonTableRegion" aria-disabled="${direction === 'previous'}"><i data-lucide="arrow-up-right" aria-hidden="true"></i></button>`;
  };
  const navigation = `<div class="comparison-navigation" role="group" aria-label="${text('Comparison navigation')}"><div class="comparison-navigation-controls">${segmented('layout', 'Party layout', layout, [['columns', 'Columns'], ['rows', 'Rows']])}${columnPicker}${segmented('mode', 'Comparison presentation', comparison.mode === 'pages' ? 'pages' : 'scroll', [['scroll', 'Scroll'], ['pages', 'Pages']])}${pinPicker}${hidePicker}<div class="comparison-range-controls">${navigationButton('previous')}<span class="comparison-range" data-comparison-range id="comparisonRange">${text('{count} parties', { count: shown.length })}</span>${navigationButton('next')}</div></div><div class="comparison-pin-navigation" role="group" aria-label="${text('Pinned party navigation')}" hidden>${navigationButton('previous', true)}<span class="comparison-range" data-comparison-pinned-range id="comparisonPinnedRange"></span>${navigationButton('next', true)}</div><div class="comparison-scrollbar" tabindex="-1" aria-hidden="true"><div></div></div></div><p id="comparisonKeyboard" class="sr-only">${text('Left and Right move between parties. Home and End jump to the beginning and end.')}</p><div class="sr-only" data-comparison-announcement role="status" aria-live="polite" aria-atomic="true"></div>`;
  const rowOrder = [...shown.filter(entry => entry.pinned), ...shown.filter(entry => !entry.pinned), ...entries.filter(entry => entry.hidden)];
  return `<div class="comparison-heading"><h2 id="comparisonHeading">${text(topic.label)}</h2><p data-comparison-count>${text(shown.length === 1 ? '{count} party' : '{count} parties', { count: shown.length })}</p></div><div class="comparison-view" data-comparison-view data-layout="${layout}" data-empty="${!shown.length}">${navigation}<div class="empty-state comparison-empty" data-comparison-empty${shown.length ? ' hidden' : ''}><strong>${text('All parties are hidden.')}</strong><button type="button" class="secondary-button" data-comparison-hide-action="clear">${text('Show all parties')}</button></div><div id="comparisonTableRegion" class="comparison-table-region" role="region" aria-labelledby="comparisonHeading" aria-describedby="comparisonRange comparisonPinnedRange comparisonKeyboard" tabindex="0" style="--comparison-columns:${Math.max(1, shown.length)}"><table class="comparison-table" aria-labelledby="comparisonHeading">
    <thead><tr>${entries.map(entry => `<th id="comparison-party-${escapeHtml(entry.party.id)}" scope="col" data-compare-party="${escapeHtml(entry.party.id)}">${partyLogo(entry.party, manifest, byAsset)}<span class="comparison-party-name">${escapeHtml(entry.party.ballot)}</span><span class="comparison-pin-marker" hidden>${text('Pinned')}</span><span class="program-quote-count">${quotationCount(entry.quotes.length)}</span><button type="button" class="comparison-explore" data-program-explore="${escapeHtml(entry.party.id)}">${text('All excerpts')}<i data-lucide="arrow-up-right" aria-hidden="true"></i></button></th>`).join('')}</tr></thead>
    ${row('quotes', 'Statements', quotations)}
    ${row('sources', 'Original sources / full text', sources)}
  </table></div><div class="comparison-rows" data-comparison-rows>${rowOrder.map(entry => `<section class="comparison-row-party" data-row-compare-party="${escapeHtml(entry.party.id)}" aria-labelledby="row-party-${escapeHtml(entry.party.id)}"${entry.hidden ? ' hidden' : ''}><header>${partyLogo(entry.party, manifest, byAsset)}<div><h3 id="row-party-${escapeHtml(entry.party.id)}">${escapeHtml(entry.party.ballot)}</h3><span class="comparison-pin-marker"${entry.pinned ? '' : ' hidden'}>${text('Pinned')}</span><span class="program-quote-count">${quotationCount(entry.quotes.length)}</span></div><button type="button" class="comparison-explore" data-program-explore="${escapeHtml(entry.party.id)}">${text('All excerpts')}<i data-lucide="arrow-up-right" aria-hidden="true"></i></button></header><div class="comparison-row-body"><div class="comparison-row-quotes">${quotations(entry)}</div><details class="comparison-row-sources"><summary>${text('Original sources / full text')}</summary>${sources(entry)}</details></div></section>`).join('')}</div></div>`;
}

function programContent(program, programs, filters, partyMatches, open) {
  const byId = new Map(programs.sources.map(source => [source.id, source]));
  const topicNames = new Map(programs.topics.map(topic => [topic.id, `${topic.label} ${translate(topic.label)}`]));
  const query = normalize(filters.query.trim());
  const matches = (item, text) => (filters.topic === 'all' || item.topic === filters.topic) && (!query || partyMatches || normalize(text).includes(query));
  const quotes = program.quotes.filter(quote => matches(quote, `${quote.text} ${quote.speaker} ${topicNames.get(quote.topic)}`));
  const policyGroups = programs.topics.map(topic => ({ ...topic, quotes: quotes.filter(quote => quote.topic === topic.id) })).filter(topic => topic.quotes.length).sort((first, second) => compareLabels(translate(first.label), translate(second.label)));
  const citedSourceIds = program.sourceIds.filter(id => quotes.some(quote => quote.sourceId === id));
  return `<details class="party-program-details" ${open ? 'open' : ''}><summary><span>${text('Statements')}</span><span>${quotationCount(quotes.length)}</span></summary>
    <div class="party-program-body">${policyGroups.length > 1 ? `<nav class="program-topic-index" aria-label="${text('Programme topics')}">${policyGroups.map(topic => `<button type="button" data-program-jump="program-topic-${escapeHtml(program.id)}-${escapeHtml(topic.id)}">${text(topic.label)}</button>`).join('')}</nav>` : ''}
    ${policyGroups.map(topic => `<section class="program-topic" data-program-topic="${escapeHtml(topic.id)}"><h3 id="program-topic-${escapeHtml(program.id)}-${escapeHtml(topic.id)}" tabindex="-1">${text(topic.label)}</h3><div>${topic.quotes.map(quote => programQuotation(quote, byId.get(quote.sourceId))).join('')}</div></section>`).join('')}
    ${policyGroups.length ? '' : `<p class="program-empty">${text('No quotation recorded for this selection.')}</p>`}
    <section class="program-sources"><h3>${text('Original sources / full text')}</h3>${citedSourceIds.length ? `<ul>${citedSourceIds.map(id => { const source = byId.get(id); return `<li>${sourceLink(source.url, source.title, { original: true })}<span><span lang="en">${escapeHtml(source.publisher)}</span> / ${escapeHtml(programDate(source))}</span></li>`; }).join('')}</ul>` : `<p class="program-empty">${text('No source recorded.')}</p>`}</section></div></details>`;
}

export function partyResults(election, manifest, programs, filters = { partyId: 'all', topic: 'all', query: '' }) {
  const byId = new Map(manifest.assets.map(asset => [asset.id, asset]));
  const roster = candidateRoster(manifest);
  const programsById = new Map((programs?.parties || []).map(program => [program.id, program]));
  const topicNames = new Map((programs?.topics || []).map(topic => [topic.id, `${topic.label} ${translate(topic.label)}`]));
  const query = normalize(filters.query.trim());
  const groups = [...election.parties].sort((first, second) => collator.compare(first.ballot, second.ballot)).filter(group => {
    if (filters.partyId !== 'all' && filters.partyId !== group.id) return false;
    const program = programsById.get(group.id);
    const partyMatches = normalize(`${group.name} ${group.ballot}`).includes(query);
    const content = (program?.quotes || []).filter(quote => filters.topic === 'all' || quote.topic === filters.topic);
    if (filters.topic !== 'all' && !content.length) return false;
    return !query || partyMatches || content.some(quote => normalize(`${quote.text} ${quote.speaker} ${topicNames.get(quote.topic) || ''}`).includes(query));
  });
  if (!groups.length) return `<div class="empty-state"><strong>${text('No matching quotations')}</strong></div>`;
  const firstProgram = groups.find(group => programsById.get(group.id)?.quotes.length)?.id;
  return `<p class="program-results-count" role="status">${text('{count} of {total} parties', { count: groups.length, total: election.parties.length })}</p><div class="party-directory">${groups.map(group => {
    const record = manifest.parties.find(item => item.id === group.id);
    const program = programsById.get(group.id);
    const website = ['unavailable', 'unverified'].includes(record?.websiteStatus) ? null : record?.website;
    const count = roster.candidates.filter(candidate => candidate.partyId === group.id).length;
    const hasLogo = record?.assetIds.some(id => imageUrl(byId.get(id)));
    return `<section class="party-program-section" data-directory-party="${escapeHtml(group.id)}"><div class="party-directory-row">
      <div class="party-directory-brand">${partyLogo(group, manifest, byId)}${hasLogo ? '' : `<small>${text('Logo unavailable')}</small>`}</div>
      <div class="party-directory-identity"><h2>${escapeHtml(group.ballot)}</h2>${group.name !== group.ballot ? `<p>${escapeHtml(group.name)}</p>` : ''}<p class="party-directory-leader">${text('Leader in register: {name}', { name: group.leader })}</p></div>
      <div class="party-directory-links">${website ? sourceLink(website, website.startsWith('http://') ? 'Website (HTTP)' : 'Website', { icon: true }) : `<span class="party-site-unavailable">${text(record?.websiteStatus === 'unavailable' ? 'Website unavailable' : 'Website not verified')}</span>`}<button type="button" class="party-candidate-link" data-party-candidates="${escapeHtml(group.id)}">${roster.phase === 'awaiting-official-list' ? text('Ballot list awaiting verification') : candidateCount(count)}</button></div>
    </div>${program ? programContent(program, programs, filters, normalize(`${group.name} ${group.ballot}`).includes(query), group.id === firstProgram || filters.partyId !== 'all' || filters.topic !== 'all' || Boolean(query)) : ''}</section>`;
  }).join('')}</div>`;
}

export function partyDirectory(election, manifest, error = '', options = {}) {
  const { programs, filters = { partyId: 'ndp', topic: 'all', query: '' }, programsError = '', view = 'compare', comparison = { topic: 'housing' } } = options;
  const heading = `<div class="page-head"><div><p class="eyebrow">${text('Party positions & original sources')}</p><h1>${text('Party programmes')}</h1></div><span class="snapshot-pill">${text('{count} registered parties', { count: election.parties.length })}</span></div>`;
  if (error) return `${heading}<div class="empty-state"><strong>${text('Party artwork unavailable')}</strong><p>${text(error)}</p><button type="button" class="secondary-button" data-candidate-retry>${text('Retry')}</button></div>`;
  if (!manifest) return `${heading}<div class="loading-state" role="status">${text('Loading party directory...')}</div>`;
  const status = programsError ? `<p class="program-load-status" role="alert">${text(programsError)} <button type="button" class="secondary-button" data-program-retry>${text('Retry')}</button></p>` : programs === undefined ? `<p class="program-load-status" role="status">${text('Loading programme sources...')}</p>` : !programs ? `<p class="program-load-status">${text('Programme quotations have not been published in this snapshot.')}</p>` : `<p class="program-review-date">${text('Selected verbatim excerpts from official sources. Full text is linked with each quotation. Sources checked {date}.', { date: formatDate(programs.checkedAt, { dateStyle: 'medium', timeZone: 'America/Vancouver' }) })}</p>`;
  const compare = view === 'compare';
  const tabs = programs ? `<div class="program-view-tabs" role="tablist" aria-label="${text('Programme views')}"><button type="button" id="programTabCompare" data-program-view="compare" role="tab" aria-controls="programViewPanel" aria-selected="${compare}" tabindex="${compare ? 0 : -1}">${text('Compare parties')}</button><button type="button" id="programTabExplore" data-program-view="explore" role="tab" aria-controls="programViewPanel" aria-selected="${!compare}" tabindex="${compare ? -1 : 0}">${text('Explore a party')}</button></div>` : '';
  const topics = [...(programs?.topics || [])].sort((first, second) => compareLabels(translate(first.label), translate(second.label)));
  const controls = !programs ? '' : compare ? `<fieldset class="comparison-issues"><legend>${text('Issue')}</legend><div class="comparison-topic-tags">${topics.map(topic => `<label class="comparison-topic-tag"><input type="radio" name="comparisonTopic" id="comparisonTopic-${escapeHtml(topic.id)}" value="${escapeHtml(topic.id)}" data-comparison-topic ${comparison.topic === topic.id ? 'checked' : ''} aria-controls="partyResults"><span>${text(topic.label)}</span></label>`).join('')}</div></fieldset>` : `<div class="program-controls program-explore-controls"><label><span>${text('Party')}</span><select id="programParty">${[...election.parties].sort((first, second) => collator.compare(first.ballot, second.ballot)).map(party => `<option value="${escapeHtml(party.id)}" ${filters.partyId === party.id ? 'selected' : ''}>${escapeHtml(party.ballot)}</option>`).join('')}</select></label><label><span>${text('Topic')}</span><select id="programTopic"><option value="all">${text('All topics')}</option>${topics.map(topic => `<option value="${escapeHtml(topic.id)}" ${filters.topic === topic.id ? 'selected' : ''}>${text(topic.label)}</option>`).join('')}</select></label><label><span>${text('Search this programme')}</span><input id="programSearch" type="search" value="${escapeHtml(filters.query)}" placeholder="${text('Policy or quotation')}" autocomplete="off"></label></div>`;
  const results = programs ? compare ? partyComparison(election, manifest, programs, comparison) : partyResults(election, manifest, programs, filters) : partyResults(election, manifest, programs);
  return `${heading}${status}${programs ? programSourceLibrary(election, programs) : ''}${tabs}<div id="programViewPanel" ${programs ? `role="tabpanel" aria-labelledby="${compare ? 'programTabCompare' : 'programTabExplore'}"` : ''}>${controls}<div id="partyResults">${results}</div></div><div class="party-directory-source"><span>${text('Register snapshot: {date}. Registration is not confirmation of a candidate in every riding.', { date: formatDate(election.partyRegisterChecked || election.snapshotDate, { dateStyle: 'medium' }) })}</span>${sourceLink(election.sources.parties, 'Official party register')}</div>`;
}
