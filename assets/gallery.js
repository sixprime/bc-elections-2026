import { candidateRoster, candidateStatusLabel, candidateRosterNote, atNominationDeadline } from '../candidate-policy.js';
import { translate, translateCount, translateElements, syncLanguageControls, currentLanguage, setLanguage, formatDate, formatNumber } from '../i18n.js';
import { routeHref } from '../routes.js';
import { canPublishAsset } from '../asset-policy.js';

const grid = document.getElementById('assetGrid');
const partyFilter = document.getElementById('assetParty');
const collectionFilter = document.getElementById('assetCollection');
const search = document.getElementById('assetSearch');
const root = new URL('../data/', import.meta.url);
const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]);
const text = (message, values) => escapeHtml(translate(message, values));
const localUrl = path => new URL(path, root).href;
const externalLink = (url, label) => url && /^https:\/\//.test(url) ? `<a href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer">${text(label)}</a>` : '';
let manifest;
let inventoryError = '';

function updateLanguage(announce = false) {
  translateElements();
  syncLanguageControls();
  document.getElementById('assetHome').href = routeHref('ridings', currentLanguage());
  if (manifest) render();
  else if (inventoryError) document.getElementById('inventoryStatus').textContent = translate(inventoryError);
  if (announce) document.getElementById('languageStatus').textContent = translate('Interface language changed to English.');
}

window.addEventListener('languagechange', () => updateLanguage(true));
document.getElementById('siteLanguage').addEventListener('change', event => setLanguage(event.target.value));
updateLanguage();

function render() {
  document.getElementById('inventoryStatus').textContent = translate('{files} files / {parties} parties / {date}', { files: formatNumber(manifest.assets.length), parties: formatNumber(manifest.parties.length), date: formatDate(manifest.collectedAt, { dateStyle: 'medium', timeZone: 'America/Vancouver' }) });
  const pending = manifest.assets.filter(asset => !canPublishAsset(asset)).length;
  document.getElementById('assetApprovalStatus').textContent = pending ? translate('{count} assets awaiting publication approval', { count: formatNumber(pending) }) : translate('All images enabled');
  const byId = new Map(manifest.assets.map(asset => [asset.id, asset]));
  const parties = new Map(manifest.parties.map(party => [party.id, party.name]));
  parties.set('independent', translate('Independent'));
  parties.set('unaffiliated', translate('Unaffiliated'));
  const collection = collectionFilter.value;
  const query = search.value.trim().toLocaleLowerCase('en-CA');
  const roster = candidateRoster(manifest);
  let entries;
  if (collection === 'portraits') {
    if (roster.phase === 'awaiting-official-list') {
      document.getElementById('assetCount').textContent = translate('Ballot list awaiting verification');
      grid.innerHTML = `<div class="asset-empty" role="status">${candidateRosterNote(roster.phase)}</div>`;
      return;
    }
    entries = roster.candidates.map(candidate => ({
      name: candidate.name, partyId: candidate.partyId, detail: candidate.district,
      status: candidateStatusLabel(candidate, roster.phase),
      source: candidate.profileUrl || candidate.sourcePage,
      statusSource: candidate.statusSource,
      asset: candidate.assetIds.map(id => byId.get(id)).find(asset => asset?.web && canPublishAsset(asset)) || candidate.assetIds.map(id => byId.get(id)).find(asset => asset?.web)
    }));
  } else if (collection === 'members') {
    entries = (manifest.members || []).map(member => ({
      name: member.name,
      partyId: manifest.parties.find(party => party.name === member.affiliation)?.id || 'independent',
      detail: `${member.district} / ${manifest.memberSnapshot.asOf}`,
      status: translate('MLA at dissolution', {}, member.id),
      source: member.profileUrl,
      statusSource: manifest.memberSnapshot.source,
      asset: member.assetIds.map(id => byId.get(id)).find(asset => asset?.web && canPublishAsset(asset)) || member.assetIds.map(id => byId.get(id)).find(asset => asset?.web)
    }));
  } else if (collection === 'gaps') {
    entries = manifest.gaps.map(gap => ({ name: gap.candidate || gap.label || parties.get(gap.partyId) || translate('Source unavailable'), partyId: gap.partyId, detail: gap.reason, source: gap.sourcePage, status: 'Needs follow-up' }));
  } else {
    const kinds = collection === 'press' ? ['press-photo', 'press-kit'] : ['party-logo', 'campaign-wordmark'];
    entries = manifest.assets.filter(asset => kinds.includes(asset.kind)).map(asset => ({ name: asset.label || parties.get(asset.partyId), partyId: asset.partyId, detail: translate(asset.kind.replaceAll('-', ' ')), status: asset.reuse.status.replaceAll('-', ' '), source: asset.sourcePage, asset }));
    if (collection === 'press') {
      entries.push(...manifest.pressKits.map(kit => ({ name: kit.label, partyId: kit.partyId, detail: translate('Publisher download'), status: 'External press kit', source: kit.sourceUrl })));
    }
  }
  const visible = entries.filter(entry => (partyFilter.value === 'all' || entry.partyId === partyFilter.value) && `${entry.name} ${entry.detail} ${parties.get(entry.partyId)}`.toLocaleLowerCase('en-CA').includes(query));
  const countLabels = collection === 'portraits' ? ['{count} candidate', '{count} candidates'] : collection === 'members' ? ['{count} MLA profile', '{count} MLA profiles'] : ['{count} item', '{count} items'];
  document.getElementById('assetCount').textContent = translateCount(visible.length, ...countLabels);
  grid.innerHTML = visible.length ? visible.map(entry => {
    const approved = canPublishAsset(entry.asset);
    const image = approved ? entry.asset?.web : null;
    const imageMarkup = image ? `<img src="${escapeHtml(localUrl(image.path))}" alt="${escapeHtml(entry.name)}" width="${image.width}" height="${image.height}" loading="lazy" decoding="async">` : `<span class="asset-placeholder">${text(entry.asset && !approved ? 'Publication approval pending' : 'No preview')}</span>`;
    const original = approved ? entry.asset?.original : null;
    return `<article class="asset-item">${collection !== 'gaps' ? `<div class="asset-image ${collection === 'branding' ? 'branding' : ''}">${imageMarkup}</div>` : ''}<div class="asset-copy"><p class="asset-party">${escapeHtml(parties.get(entry.partyId))}</p><h2>${escapeHtml(entry.name)}</h2><p${['portraits', 'members', 'gaps'].includes(collection) ? ' lang="en-CA"' : ''}>${escapeHtml(entry.detail)}</p><span class="asset-status">${text(entry.status)}</span>${entry.asset?.reuse?.licenseUrl ? `<p lang="en">${escapeHtml(entry.asset.credit)} ${externalLink(entry.asset.reuse.licenseUrl, entry.asset.reuse.license)}</p>` : ''}<div class="asset-links">${externalLink(entry.source, 'Source')}${entry.statusSource && entry.statusSource !== entry.source ? externalLink(entry.statusSource, 'Status source') : ''}${original ? `<a href="${escapeHtml(localUrl(original.path))}" download>${text('Original')}</a>` : ''}</div></div></article>`;
  }).join('') : `<div class="asset-empty">${text('No matching assets')}</div>`;
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
  if (manifest.members?.some(member => member.affiliation === 'Independent') || manifest.candidates.some(candidate => candidate.partyId === 'independent')) {
    const option = document.createElement('option');
    option.value = 'independent';
    option.textContent = 'Independent';
    option.dataset.i18n = 'Independent';
    partyFilter.append(option);
  }
  if (manifest.candidates.some(candidate => candidate.partyId === 'unaffiliated')) {
    const option = document.createElement('option');
    option.value = 'unaffiliated';
    option.textContent = 'Unaffiliated';
    option.dataset.i18n = 'Unaffiliated';
    partyFilter.append(option);
  }
  delete document.getElementById('inventoryStatus').dataset.i18n;
  updateLanguage();
  atNominationDeadline(manifest, render);
  search.addEventListener('input', render);
  partyFilter.addEventListener('change', render);
  collectionFilter.addEventListener('change', render);
} catch (error) {
  inventoryError = error.message;
  delete document.getElementById('inventoryStatus').dataset.i18n;
  updateLanguage();
}
