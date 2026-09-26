const collator = new Intl.Collator('en-CA', { sensitivity: 'base', numeric: true });
const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]);
const normalize = value => String(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('en-CA');
const sourceLink = (url, label) => /^https?:\/\//.test(url || '') ? `<a href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer">${label}</a>` : '';
const imageUrl = asset => asset?.web?.path?.startsWith('assets/') && !asset.web.path.includes('..') ? new URL(`./data/prod/${asset.web.path}`, import.meta.url).href : '';

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
      (filters.riding === 'all' || candidate.district === filters.riding) &&
      normalize(`${candidate.name} ${candidate.district} ${group.ballot}`).includes(query);
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
          <div class="candidate-card-body"><h3>${escapeHtml(candidate.name)}</h3><a class="candidate-riding" href="#riding/${escapeHtml(candidate.districtSlug)}">${escapeHtml(candidate.district)}</a>
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
    <label><span>Riding</span><select id="candidateRiding"><option value="all">All ridings</option>${[...election.districts].sort(collator.compare).map(name => `<option value="${escapeHtml(name)}" ${filters.riding === name ? 'selected' : ''}>${escapeHtml(name)}</option>`).join('')}</select></label></div>
    <div id="candidateResults">${candidateResults(election, manifest, filters)}</div>`;
}

export function partyDirectory(election, manifest, error = '') {
  const heading = `<div class="page-head"><div><p class="eyebrow">Elections BC register</p><h1>Political parties</h1></div><span class="snapshot-pill">${election.parties.length} registered parties</span></div>`;
  if (error) return `${heading}<div class="empty-state"><strong>Party artwork unavailable</strong><p>${escapeHtml(error)}</p><button type="button" class="secondary-button" data-candidate-retry>Retry</button></div>`;
  if (!manifest) return `${heading}<div class="loading-state" role="status">Loading party directory...</div>`;
  const byId = new Map(manifest.assets.map(asset => [asset.id, asset]));
  const groups = [...election.parties].sort((first, second) => collator.compare(first.ballot, second.ballot));
  return `${heading}<div class="party-directory">${groups.map(group => {
    const record = manifest.parties.find(item => item.id === group.id);
    const website = ['unavailable', 'unverified'].includes(record?.websiteStatus) ? null : record?.website;
    const count = manifest.candidates.filter(candidate => candidate.partyId === group.id).length;
    const hasLogo = record?.assetIds.some(id => imageUrl(byId.get(id)));
    return `<article class="party-directory-row" data-directory-party="${escapeHtml(group.id)}">
      <div class="party-directory-brand">${partyLogo(group, manifest, byId)}${hasLogo ? '' : '<small>Logo unavailable</small>'}</div>
      <div class="party-directory-identity"><h2>${escapeHtml(group.ballot)}</h2>${group.name !== group.ballot ? `<p>${escapeHtml(group.name)}</p>` : ''}<p class="party-directory-leader">Leader in register: ${escapeHtml(group.leader)}</p></div>
      <div class="party-directory-links">${website ? sourceLink(website, `${website.startsWith('http://') ? 'Website (HTTP)' : 'Website'} <i data-lucide="arrow-up-right" aria-hidden="true"></i>`) : `<span class="party-site-unavailable">${record?.websiteStatus === 'unavailable' ? 'Website unavailable' : 'Website not verified'}</span>`}<button type="button" class="party-candidate-link" data-party-candidates="${escapeHtml(group.id)}">${count} ${count === 1 ? 'candidate' : 'candidates'}</button></div>
    </article>`;
  }).join('')}</div><div class="party-directory-source"><span>Register snapshot: ${escapeHtml(election.partyRegisterChecked || election.snapshotDate)}. Registration is not confirmation of a candidate in every riding.</span>${sourceLink(election.sources.parties, 'Official party register')}</div>`;
}
