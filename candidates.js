const collator = new Intl.Collator('en-CA', { sensitivity: 'base', numeric: true });
const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]);
const normalize = value => String(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('en-CA');
const sourceLink = (url, label) => /^https?:\/\//.test(url || '') ? `<a href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer">${label}</a>` : '';
const imageUrl = asset => asset?.web?.path?.startsWith('assets/') && !asset.web.path.includes('..') ? new URL(`./data/${asset.web.path}`, import.meta.url).href : '';

function partyLogo(group, manifest, byId) {
  const assets = (manifest.parties.find(item => item.id === group.id)?.assetIds || []).map(id => byId.get(id)).filter(asset => imageUrl(asset));
  const image = assets.find(asset => !/white/i.test(asset.sourceUrl)) || assets[0];
  if (!image) return `<span class="candidate-party-mark" style="--party:${escapeHtml(group.color)}" aria-hidden="true"></span>`;
  const dark = /white/i.test(image.sourceUrl);
  return `<span class="candidate-party-logo ${dark ? 'on-dark' : ''}"><img src="${escapeHtml(imageUrl(image))}" alt="${escapeHtml(group.ballot)} logo" width="120" height="42" loading="lazy"></span>`;
}

export function candidateResults(election, manifest, filters) {
  const byId = new Map(manifest.assets.map(asset => [asset.id, asset]));
  const groups = [...election.parties].sort((first, second) => collator.compare(first.ballot, second.ballot));
  for (const candidate of manifest.candidates) {
    if (!groups.some(group => group.id === candidate.partyId)) groups.push({ id: candidate.partyId, ballot: candidate.partyId === 'independent' ? 'Independent' : 'Unaffiliated', color: '#687d88' });
  }
  const query = normalize(filters.query.trim());
  const visible = manifest.candidates.filter(candidate => {
    const group = groups.find(item => item.id === candidate.partyId);
    return (filters.partyId === 'all' || candidate.partyId === filters.partyId) &&
      (filters.riding === 'all' || (filters.riding === 'unresolved' ? candidate.district === null : candidate.district === filters.riding)) &&
      normalize(`${candidate.name} ${candidate.district || candidate.reportedDistrict || ''} ${group.ballot}`).includes(query);
  });
  const navigation = `<nav id="candidatePartyNavigation" class="candidate-party-nav" aria-label="Jump to party" tabindex="-1">${groups.map(group => {
    const count = visible.filter(candidate => candidate.partyId === group.id).length;
    const available = (filters.partyId === 'all' || filters.partyId === group.id) && (count > 0 || (!query && filters.riding === 'all'));
    return `<button type="button" class="candidate-nav-button" data-party-jump="${escapeHtml(group.id)}" aria-label="${escapeHtml(group.ballot)}: ${count} candidates" title="${available ? `Jump to ${escapeHtml(group.ballot)}` : 'No matches with these filters'}" ${available ? '' : 'disabled'}>${partyLogo(group, manifest, byId)}<span class="candidate-nav-name">${escapeHtml(group.ballot)}</span><span class="candidate-nav-count">${count} ${count === 1 ? 'candidate' : 'candidates'}</span></button>`;
  }).join('')}</nav>`;
  const sections = groups.filter(group => filters.partyId === 'all' || group.id === filters.partyId).map(group => {
    const candidates = visible.filter(candidate => candidate.partyId === group.id).sort((first, second) => collator.compare(first.name, second.name));
    if (!candidates.length && (query || filters.riding !== 'all')) return '';
    return `<section class="candidate-party-section" aria-labelledby="candidate-party-${escapeHtml(group.id)}" data-candidate-party="${escapeHtml(group.id)}">
      <header class="candidate-party-heading">${partyLogo(group, manifest, byId)}<h2 id="candidate-party-${escapeHtml(group.id)}" tabindex="-1">${escapeHtml(group.ballot)}</h2><div class="candidate-group-actions"><span>${candidates.length} ${candidates.length === 1 ? 'candidate' : 'candidates'}</span><button type="button" class="candidate-top-control" data-candidate-top title="Back to the party list"><i data-lucide="arrow-up-right" aria-hidden="true"></i>Top</button></div></header>
      ${candidates.length ? `<div class="candidate-grid">${candidates.map(candidate => {
        const portrait = candidate.assetIds.map(id => byId.get(id)).find(asset => asset?.kind === 'portrait' && imageUrl(asset));
        const accepted = candidate.status === 'accepted';
        return `<article class="candidate-card" data-candidate-id="${escapeHtml(candidate.id)}">
          <div class="candidate-portrait">${portrait ? `<img src="${escapeHtml(imageUrl(portrait))}" alt="${escapeHtml(candidate.name)}" width="320" height="400" loading="lazy" decoding="async">` : '<span>Portrait unavailable</span>'}</div>
          <div class="candidate-card-body"><h3>${escapeHtml(candidate.name)}</h3>${candidate.districtSlug ? `<a class="candidate-riding" href="#riding/${escapeHtml(candidate.districtSlug)}">${escapeHtml(candidate.district)}</a>` : `<span class="candidate-riding candidate-unresolved">Riding unconfirmed</span><p class="small-note">Source lists: ${escapeHtml(candidate.reportedDistrict)}.</p>`}
          <span class="candidate-status ${accepted ? 'accepted' : ''}">${accepted ? 'Accepted nomination' : 'Party-announced'}</span>
          <div class="candidate-card-links">${sourceLink(candidate.profileUrl || candidate.sourcePage, 'Profile & photo source')}${sourceLink(candidate.statusSource, 'Nomination source')}</div></div>
        </article>`;
      }).join('')}</div>` : '<p class="candidate-empty-party">No candidates recorded in this snapshot.</p>'}
    </section>`;
  }).join('');
  return `${navigation}<div class="candidate-results-count" role="status">${visible.length} of ${manifest.candidates.length} candidates · Name A–Z</div>${sections || '<div class="empty-state"><strong>No matching candidates</strong>Clear the search or change the selected party or riding.</div>'}<button type="button" class="candidate-top-control candidate-top-floating" data-candidate-top title="Back to the party list"><i data-lucide="arrow-up-right" aria-hidden="true"></i>Top</button>`;
}

export function candidateDirectory(election, manifest, filters, error = '') {
  const heading = `<div class="page-head"><div><p class="eyebrow">2026 provincial election</p><h1>Parties & candidates</h1></div>${manifest ? `<span class="snapshot-pill">Catalogue · ${escapeHtml(new Intl.DateTimeFormat('en-CA', { dateStyle: 'medium' }).format(new Date(manifest.collectedAt)))}</span>` : ''}</div>`;
  if (error) return `${heading}<div class="empty-state"><strong>Candidate catalogue unavailable</strong><p>${escapeHtml(error)}</p><button class="secondary-button" type="button" data-candidate-retry>Retry</button></div>`;
  if (!manifest) return `${heading}<div class="loading-state" role="status">Loading candidates...</div>`;
  const parties = [...election.parties].sort((first, second) => collator.compare(first.ballot, second.ballot));
  return `${heading}<p class="candidate-snapshot-note">${election.parties.length} registered parties · Accepted nominations and party announcements are labelled separately. This is not the final ballot.</p>
    <div class="candidate-toolbar"><label><span>Candidate or riding</span><input id="candidateSearch" type="search" value="${escapeHtml(filters.query)}" placeholder="Search by name or riding" autocomplete="off"></label>
    <label><span>Party</span><select id="candidateParty"><option value="all">All parties (${parties.length})</option>${parties.map(group => `<option value="${escapeHtml(group.id)}" ${filters.partyId === group.id ? 'selected' : ''}>${escapeHtml(group.ballot)} (${manifest.candidates.filter(candidate => candidate.partyId === group.id).length})</option>`).join('')}</select></label>
    <label><span>Riding</span><select id="candidateRiding"><option value="all">All ridings</option>${manifest.candidates.some(candidate => candidate.district === null) ? `<option value="unresolved" ${filters.riding === 'unresolved' ? 'selected' : ''}>Riding unconfirmed</option>` : ''}${[...election.districts].sort(collator.compare).map(name => `<option value="${escapeHtml(name)}" ${filters.riding === name ? 'selected' : ''}>${escapeHtml(name)}</option>`).join('')}</select></label></div>
    <div id="candidateResults">${candidateResults(election, manifest, filters)}</div>`;
}

export function ridingMember(manifest, district, error = '') {
  if (error) return `<p role="alert">${escapeHtml(error)}</p><button type="button" class="secondary-button" data-candidate-retry>Retry</button>`;
  if (!manifest) return '<p class="small-note" role="status">Loading MLA profile...</p>';
  const member = manifest.members?.find(record => record.district === district);
  if (!member) return `<p class="small-note">${manifest.memberSnapshot?.notListedDistricts.includes(district) ? 'The Legislature lists no active member for this riding at dissolution.' : 'No verified MLA profile is included for this riding in this snapshot.'}</p>`;
  const portrait = member.assetIds.map(id => manifest.assets.find(asset => asset.id === id)).find(asset => asset?.kind === 'portrait' && imageUrl(asset));
  const asOf = new Intl.DateTimeFormat('en-CA', { dateStyle: 'medium', timeZone: 'UTC' }).format(new Date(`${manifest.memberSnapshot.asOf}T12:00:00Z`));
  return `<article class="riding-member" data-member-id="${escapeHtml(member.id)}">
    ${portrait ? `<img class="riding-member-photo" src="${escapeHtml(imageUrl(portrait))}" alt="${escapeHtml(member.name)}" width="112" height="140" loading="lazy">` : '<span class="riding-member-photo">Portrait unavailable</span>'}
    <div class="riding-member-info"><h3>${escapeHtml(member.name)}</h3><span>${escapeHtml(member.affiliation)}</span><p class="small-note">At dissolution · ${escapeHtml(asOf)}</p>
    <div class="candidate-card-links">${sourceLink(member.profileUrl, 'MLA profile')}${portrait ? sourceLink(portrait.sourcePage, 'Photo source') : ''}</div>
    ${portrait?.reuse?.licenseUrl ? `<p class="small-note">${escapeHtml(portrait.credit)} ${sourceLink(portrait.reuse.licenseUrl, escapeHtml(portrait.reuse.license))}</p>` : ''}</div>
  </article>`;
}

export function ridingCandidates(election, manifest, district, error = '') {
  if (error) return `<p role="alert">${escapeHtml(error)}</p><button type="button" class="secondary-button" data-candidate-retry>Retry</button>`;
  if (!manifest) return '<p class="small-note" role="status">Loading candidates...</p>';
  const candidates = manifest.candidates.filter(candidate => candidate.district === district).sort((first, second) => collator.compare(first.name, second.name));
  if (!candidates.length) return '<p class="small-note">No candidates recorded for this riding in this snapshot. This is not confirmation that nobody is running.</p>';
  const byId = new Map(manifest.assets.map(asset => [asset.id, asset]));
  return `<div class="riding-candidate-list">${candidates.map(candidate => {
    const group = election.parties.find(party => party.id === candidate.partyId);
    const portrait = candidate.assetIds.map(id => byId.get(id)).find(asset => asset?.kind === 'portrait' && imageUrl(asset));
    const accepted = candidate.status === 'accepted';
    return `<article class="riding-candidate" data-candidate-id="${escapeHtml(candidate.id)}">
      ${portrait ? `<img class="riding-candidate-photo" src="${escapeHtml(imageUrl(portrait))}" alt="${escapeHtml(candidate.name)}" width="68" height="85" loading="lazy">` : '<span class="riding-candidate-photo">Portrait unavailable</span>'}
      <div class="riding-candidate-info"><h3>${escapeHtml(candidate.name)}</h3><span class="riding-candidate-party">${escapeHtml(group?.ballot || candidate.partyId)}</span>
      <span class="candidate-status ${accepted ? 'accepted' : ''}">${accepted ? 'Accepted nomination' : 'Party-announced'}</span>
      <div class="candidate-card-links">${sourceLink(candidate.profileUrl || candidate.sourcePage, 'Profile')}${sourceLink(candidate.statusSource, 'Nomination source')}</div></div>
    </article>`;
  }).join('')}</div>`;
}

const programDate = source => source.publishedOn ? new Intl.DateTimeFormat('en-CA', { dateStyle: 'medium', timeZone: 'UTC' }).format(new Date(`${source.publishedOn}T12:00:00Z`)) : source.electionYear ? `${source.electionYear} material` : 'Publication date not stated';

function programSource(source, locator = '') {
  return `<div class="program-citation">${sourceLink(source.url, escapeHtml(source.title))}<span>${escapeHtml(programDate(source))}</span>${locator ? `<span>${escapeHtml(locator)}</span>` : ''}</div>`;
}

function programQuotation(quote, source) {
  return `<figure class="program-quote" data-quote-id="${escapeHtml(quote.id)}"><span class="program-quote-label">Verbatim excerpt</span><blockquote cite="${escapeHtml(source.url)}"><p>&ldquo;${escapeHtml(quote.text)}&rdquo;</p></blockquote><figcaption><strong>${escapeHtml(quote.speaker)}</strong>${programSource(source, quote.locator || '')}</figcaption></figure>`;
}

export function partyComparison(election, manifest, programs, comparison = { topic: 'housing', partyIds: null }) {
  const parties = [...election.parties].sort((first, second) => collator.compare(first.ballot, second.ballot));
  const byParty = new Map(parties.map(party => [party.id, party]));
  const byAsset = new Map(manifest.assets.map(asset => [asset.id, asset]));
  const bySource = new Map(programs.sources.map(source => [source.id, source]));
  const byProgram = new Map(programs.parties.map(program => [program.id, program]));
  const topic = programs.topics.find(topic => topic.id === comparison.topic) || programs.topics[0];
  const automatic = comparison.partyIds == null;
  const requestedIds = automatic ? parties.filter(party => byProgram.get(party.id)?.quotes.some(quote => quote.topic === topic.id)).map(party => party.id) : comparison.partyIds;
  const selectedIds = parties.filter(party => requestedIds.includes(party.id)).map(party => party.id);
  const selected = selectedIds.map(id => {
    const program = byProgram.get(id);
    const quotes = (program?.quotes || []).filter(quote => quote.topic === topic.id);
    const sourceIds = [...new Set(quotes.map(quote => quote.sourceId))];
    return { party: byParty.get(id), quotes, sourceIds: sourceIds.length ? sourceIds : program?.sourceIds || [] };
  });
  const controls = `<p class="comparison-default-note" id="comparisonDefaultNote">By default, only parties with a recorded programme quotation on this topic are shown. You can choose any party.</p><details class="comparison-picker"><summary>Parties <span>${selectedIds.length} of ${parties.length} selected / ${automatic ? 'Topic defaults' : 'Custom selection'}</span></summary><fieldset aria-describedby="comparisonDefaultNote"><legend>Parties in comparison</legend><div class="comparison-party-options">${parties.map(party => `<label><input id="comparisonParty-${escapeHtml(party.id)}" type="checkbox" data-comparison-party="${escapeHtml(party.id)}" ${selectedIds.includes(party.id) ? 'checked' : ''}><span>${escapeHtml(party.ballot)}</span></label>`).join('')}</div><div class="comparison-picker-actions"><button type="button" id="comparisonDefaults" data-comparison-action="defaults">Use topic defaults</button><button type="button" id="comparisonAll" data-comparison-action="all">Select all</button><button type="button" id="comparisonClear" data-comparison-action="clear">Clear selection</button></div></fieldset></details>`;
  if (!selected.length) return `${controls}<div class="empty-state"><strong>${automatic ? 'No quotations recorded for this topic.' : 'No parties selected'}</strong></div>`;
  const row = (id, label, content) => `<tbody><tr class="comparison-row-title"><th id="comparison-${id}" scope="rowgroup" colspan="${selected.length}"><span>${label}</span></th></tr><tr data-comparison-row="${id}">${selected.map(entry => `<td headers="comparison-party-${escapeHtml(entry.party.id)} comparison-${id}">${content(entry)}</td>`).join('')}</tr></tbody>`;
  return `${controls}<div class="comparison-heading"><h2 id="comparisonHeading">${escapeHtml(topic.label)}</h2><p>${selected.length} ${selected.length === 1 ? 'party' : 'parties'}</p></div><div class="comparison-table-region${selected.length <= 6 ? ' comparison-table-region-fit' : ''}" role="region" aria-labelledby="comparisonHeading" tabindex="0" style="--comparison-columns:${selected.length}"><table class="comparison-table" aria-labelledby="comparisonHeading">
    <thead><tr>${selected.map(entry => `<th id="comparison-party-${escapeHtml(entry.party.id)}" scope="col" data-compare-party="${escapeHtml(entry.party.id)}">${partyLogo(entry.party, manifest, byAsset)}<span class="comparison-party-name">${escapeHtml(entry.party.ballot)}</span><span class="program-quote-count">${entry.quotes.length} ${entry.quotes.length === 1 ? 'quotation' : 'quotations'}</span><button type="button" class="comparison-explore" data-program-explore="${escapeHtml(entry.party.id)}">All excerpts<i data-lucide="arrow-up-right" aria-hidden="true"></i></button></th>`).join('')}</tr></thead>
    ${row('quotes', 'In their own words', entry => entry.quotes.length ? entry.quotes.map(quote => programQuotation(quote, bySource.get(quote.sourceId))).join('') : '<p class="comparison-missing">No quotation recorded for this topic.</p>')}
    ${row('sources', 'Original sources / full text', entry => entry.sourceIds.length ? `<ul class="comparison-sources">${entry.sourceIds.map(id => { const source = bySource.get(id); return `<li>${sourceLink(source.url, escapeHtml(source.title))}<span>${escapeHtml(source.publisher)}</span><span>${escapeHtml(programDate(source))}</span></li>`; }).join('')}</ul>` : '<p class="comparison-missing">No source recorded.</p>')}
  </table></div>`;
}

function programContent(program, programs, filters, partyMatches, open) {
  const byId = new Map(programs.sources.map(source => [source.id, source]));
  const topicNames = new Map(programs.topics.map(topic => [topic.id, topic.label]));
  const query = normalize(filters.query.trim());
  const matches = (item, text) => (filters.topic === 'all' || item.topic === filters.topic) && (!query || partyMatches || normalize(text).includes(query));
  const quotes = program.quotes.filter(quote => matches(quote, `${quote.text} ${quote.speaker} ${topicNames.get(quote.topic)}`));
  const policyGroups = programs.topics.map(topic => ({ ...topic, quotes: quotes.filter(quote => quote.topic === topic.id) })).filter(topic => topic.quotes.length);
  return `<details class="party-program-details" ${open ? 'open' : ''}><summary><span>Verbatim excerpts</span><span>${quotes.length} ${quotes.length === 1 ? 'quotation' : 'quotations'}</span></summary>
    <div class="party-program-body">${policyGroups.length > 1 ? `<nav class="program-topic-index" aria-label="Programme topics">${policyGroups.map(topic => `<button type="button" data-program-jump="program-topic-${escapeHtml(program.id)}-${escapeHtml(topic.id)}">${escapeHtml(topic.label)}</button>`).join('')}</nav>` : ''}
    ${policyGroups.map(topic => `<section class="program-topic" data-program-topic="${escapeHtml(topic.id)}"><h3 id="program-topic-${escapeHtml(program.id)}-${escapeHtml(topic.id)}" tabindex="-1">${escapeHtml(topic.label)}</h3><div>${topic.quotes.map(quote => programQuotation(quote, byId.get(quote.sourceId))).join('')}</div></section>`).join('')}
    ${policyGroups.length ? '' : '<p class="program-empty">No quotation recorded for this selection.</p>'}
    <section class="program-sources"><h3>Original sources / full text</h3>${program.sourceIds.length ? `<ul>${program.sourceIds.map(id => { const source = byId.get(id); return `<li>${sourceLink(source.url, escapeHtml(source.title))}<span>${escapeHtml(source.publisher)} / ${escapeHtml(programDate(source))}</span></li>`; }).join('')}</ul>` : '<p class="program-empty">No source recorded.</p>'}</section></div></details>`;
}

export function partyResults(election, manifest, programs, filters = { partyId: 'all', topic: 'all', query: '' }) {
  const byId = new Map(manifest.assets.map(asset => [asset.id, asset]));
  const programsById = new Map((programs?.parties || []).map(program => [program.id, program]));
  const query = normalize(filters.query.trim());
  const groups = [...election.parties].sort((first, second) => collator.compare(first.ballot, second.ballot)).filter(group => {
    if (filters.partyId !== 'all' && filters.partyId !== group.id) return false;
    const program = programsById.get(group.id);
    const partyMatches = normalize(`${group.name} ${group.ballot}`).includes(query);
    const content = (program?.quotes || []).filter(quote => filters.topic === 'all' || quote.topic === filters.topic);
    if (filters.topic !== 'all' && !content.length) return false;
    return !query || partyMatches || content.some(quote => normalize(`${quote.text} ${quote.speaker}`).includes(query));
  });
  if (!groups.length) return '<div class="empty-state"><strong>No matching quotations</strong></div>';
  const firstProgram = groups.find(group => programsById.get(group.id)?.quotes.length)?.id;
  return `<p class="program-results-count" role="status">${groups.length} of ${election.parties.length} parties</p><div class="party-directory">${groups.map(group => {
    const record = manifest.parties.find(item => item.id === group.id);
    const program = programsById.get(group.id);
    const website = ['unavailable', 'unverified'].includes(record?.websiteStatus) ? null : record?.website;
    const count = manifest.candidates.filter(candidate => candidate.partyId === group.id).length;
    const hasLogo = record?.assetIds.some(id => imageUrl(byId.get(id)));
    return `<section class="party-program-section" data-directory-party="${escapeHtml(group.id)}"><div class="party-directory-row">
      <div class="party-directory-brand">${partyLogo(group, manifest, byId)}${hasLogo ? '' : '<small>Logo unavailable</small>'}</div>
      <div class="party-directory-identity"><h2>${escapeHtml(group.ballot)}</h2>${group.name !== group.ballot ? `<p>${escapeHtml(group.name)}</p>` : ''}<p class="party-directory-leader">Leader in register: ${escapeHtml(group.leader)}</p></div>
      <div class="party-directory-links">${website ? sourceLink(website, `${website.startsWith('http://') ? 'Website (HTTP)' : 'Website'} <i data-lucide="arrow-up-right" aria-hidden="true"></i>`) : `<span class="party-site-unavailable">${record?.websiteStatus === 'unavailable' ? 'Website unavailable' : 'Website not verified'}</span>`}<button type="button" class="party-candidate-link" data-party-candidates="${escapeHtml(group.id)}">${count} ${count === 1 ? 'candidate' : 'candidates'}</button></div>
    </div>${program ? programContent(program, programs, filters, normalize(`${group.name} ${group.ballot}`).includes(query), group.id === firstProgram || filters.partyId !== 'all' || filters.topic !== 'all' || Boolean(query)) : ''}</section>`;
  }).join('')}</div>`;
}

export function partyDirectory(election, manifest, error = '', options = {}) {
  const { programs, filters = { partyId: 'ndp', topic: 'all', query: '' }, programsError = '', view = 'compare', comparison = { topic: 'housing', partyIds: null } } = options;
  const heading = `<div class="page-head"><div><p class="eyebrow">Party positions & original sources</p><h1>Party programmes</h1></div><span class="snapshot-pill">${election.parties.length} registered parties</span></div>`;
  if (error) return `${heading}<div class="empty-state"><strong>Party artwork unavailable</strong><p>${escapeHtml(error)}</p><button type="button" class="secondary-button" data-candidate-retry>Retry</button></div>`;
  if (!manifest) return `${heading}<div class="loading-state" role="status">Loading party directory...</div>`;
  const status = programsError ? `<p class="program-load-status" role="alert">${escapeHtml(programsError)} <button type="button" class="secondary-button" data-program-retry>Retry</button></p>` : programs === undefined ? '<p class="program-load-status" role="status">Loading programme sources...</p>' : !programs ? '<p class="program-load-status">Programme quotations have not been published in this snapshot.</p>' : `<p class="program-review-date">Selected verbatim excerpts from official sources. Full text is linked with each quotation. Sources checked ${escapeHtml(new Intl.DateTimeFormat('en-CA', { dateStyle: 'medium', timeZone: 'America/Vancouver' }).format(new Date(programs.checkedAt)))}.</p>`;
  const compare = view === 'compare';
  const tabs = programs ? `<div class="program-view-tabs" role="tablist" aria-label="Programme views"><button type="button" id="programTabCompare" data-program-view="compare" role="tab" aria-controls="programViewPanel" aria-selected="${compare}" tabindex="${compare ? 0 : -1}">Compare parties</button><button type="button" id="programTabExplore" data-program-view="explore" role="tab" aria-controls="programViewPanel" aria-selected="${!compare}" tabindex="${compare ? -1 : 0}">Explore a party</button></div>` : '';
  const controls = !programs ? '' : compare ? `<fieldset class="comparison-issues"><legend>Issue</legend><div class="comparison-topic-tags">${[...programs.topics].sort((first, second) => collator.compare(first.label, second.label)).map(topic => `<label class="comparison-topic-tag"><input type="radio" name="comparisonTopic" id="comparisonTopic-${escapeHtml(topic.id)}" value="${escapeHtml(topic.id)}" data-comparison-topic ${comparison.topic === topic.id ? 'checked' : ''} aria-controls="partyResults"><span>${escapeHtml(topic.label)}</span></label>`).join('')}</div></fieldset>` : `<div class="program-controls program-explore-controls"><label><span>Party</span><select id="programParty">${[...election.parties].sort((first, second) => collator.compare(first.ballot, second.ballot)).map(party => `<option value="${escapeHtml(party.id)}" ${filters.partyId === party.id ? 'selected' : ''}>${escapeHtml(party.ballot)}</option>`).join('')}</select></label><label><span>Topic</span><select id="programTopic"><option value="all">All topics</option>${programs.topics.map(topic => `<option value="${escapeHtml(topic.id)}" ${filters.topic === topic.id ? 'selected' : ''}>${escapeHtml(topic.label)}</option>`).join('')}</select></label><label><span>Search this programme</span><input id="programSearch" type="search" value="${escapeHtml(filters.query)}" placeholder="Policy or quotation" autocomplete="off"></label></div>`;
  const results = programs ? compare ? partyComparison(election, manifest, programs, comparison) : partyResults(election, manifest, programs, filters) : partyResults(election, manifest, programs);
  return `${heading}${status}${tabs}<div id="programViewPanel" ${programs ? `role="tabpanel" aria-labelledby="${compare ? 'programTabCompare' : 'programTabExplore'}"` : ''}>${controls}<div id="partyResults">${results}</div></div><div class="party-directory-source"><span>Register snapshot: ${escapeHtml(election.partyRegisterChecked || election.snapshotDate)}. Registration is not confirmation of a candidate in every riding.</span>${sourceLink(election.sources.parties, 'Official party register')}</div>`;
}
