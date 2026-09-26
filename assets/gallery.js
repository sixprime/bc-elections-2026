const grid = document.getElementById('assetGrid');
const partyFilter = document.getElementById('assetParty');
const collectionFilter = document.getElementById('assetCollection');
const search = document.getElementById('assetSearch');
const root = new URL('../data/prod/', import.meta.url);
const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]);
const localUrl = path => new URL(path, root).href;
const externalLink = (url, text) => url && /^https:\/\//.test(url) ? `<a href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer">${text}</a>` : '';
let manifest;

function render() {
  const byId = new Map(manifest.assets.map(asset => [asset.id, asset]));
  const parties = new Map(manifest.parties.map(party => [party.id, party.name]));
  const collection = collectionFilter.value;
  const query = search.value.trim().toLocaleLowerCase('en-CA');
  let entries;
  if (collection === 'portraits') {
    entries = manifest.candidates.map(candidate => ({
      name: candidate.name, partyId: candidate.partyId, detail: candidate.district,
      status: candidate.status === 'accepted' ? 'Accepted nomination' : 'Party-announced',
      source: candidate.profileUrl || candidate.sourcePage,
      statusSource: candidate.statusSource,
      asset: candidate.assetIds.map(id => byId.get(id)).find(asset => asset?.web)
    }));
  } else if (collection === 'gaps') {
    entries = manifest.gaps.map(gap => ({ name: gap.candidate || gap.label || parties.get(gap.partyId) || 'Source unavailable', partyId: gap.partyId, detail: gap.reason, source: gap.sourcePage, status: 'Needs follow-up' }));
  } else {
    const kinds = collection === 'press' ? ['press-photo', 'press-kit'] : ['party-logo', 'campaign-wordmark'];
    entries = manifest.assets.filter(asset => kinds.includes(asset.kind)).map(asset => ({ name: asset.label || parties.get(asset.partyId), partyId: asset.partyId, detail: asset.kind.replaceAll('-', ' '), status: asset.reuse.status.replaceAll('-', ' '), source: asset.sourcePage, asset }));
    if (collection === 'press') {
      entries.push(...manifest.pressKits.map(kit => ({ name: kit.label, partyId: kit.partyId, detail: 'Publisher download', status: 'External press kit', source: kit.sourceUrl })));
    }
  }
  const visible = entries.filter(entry => (partyFilter.value === 'all' || entry.partyId === partyFilter.value) && `${entry.name} ${entry.detail} ${parties.get(entry.partyId)}`.toLocaleLowerCase('en-CA').includes(query));
  document.getElementById('assetCount').textContent = `${visible.length} ${collection === 'portraits' ? 'candidates' : 'items'}`;
  grid.innerHTML = visible.length ? visible.map(entry => {
    const image = entry.asset?.web;
    const imageMarkup = image ? `<img src="${escapeHtml(localUrl(image.path))}" alt="${escapeHtml(entry.name)}" width="${image.width}" height="${image.height}" loading="lazy" decoding="async">` : '<span class="asset-placeholder">No preview</span>';
    const original = entry.asset?.original;
    return `<article class="asset-item">${collection !== 'gaps' ? `<div class="asset-image ${collection === 'branding' ? 'branding' : ''}">${imageMarkup}</div>` : ''}<div class="asset-copy"><p class="asset-party">${escapeHtml(parties.get(entry.partyId))}</p><h2>${escapeHtml(entry.name)}</h2><p>${escapeHtml(entry.detail)}</p><span class="asset-status">${escapeHtml(entry.status)}</span><div class="asset-links">${externalLink(entry.source, 'Source')}${entry.statusSource && entry.statusSource !== entry.source ? externalLink(entry.statusSource, 'Status source') : ''}${original ? `<a href="${escapeHtml(localUrl(original.path))}" download>Original</a>` : ''}</div></div></article>`;
  }).join('') : '<div class="asset-empty">No matching assets</div>';
}

try {
  const response = await fetch(new URL('assets/manifest.json', root));
  if (!response.ok) throw new Error('The asset inventory could not be loaded.');
  manifest = await response.json();
  for (const party of manifest.parties) {
    const option = document.createElement('option');
    option.value = party.id;
    option.textContent = party.name;
    partyFilter.append(option);
  }
  const date = new Intl.DateTimeFormat('en-CA', { dateStyle: 'medium' }).format(new Date(manifest.collectedAt));
  document.getElementById('inventoryStatus').textContent = `${manifest.assets.length} files / ${manifest.parties.length} parties / ${date}`;
  render();
  search.addEventListener('input', render);
  partyFilter.addEventListener('change', render);
  collectionFilter.addEventListener('change', render);
} catch (error) {
  document.getElementById('inventoryStatus').textContent = error.message;
}
