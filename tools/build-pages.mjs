import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';
import { candidateDirectory, partyResults, ridingCandidates, ridingMember } from '../candidates.js';
import { candidateRoster, candidateRosterNote } from '../candidate-policy.js';
import { renderPollChart } from '../poll-chart.js';
import { configureRouteBase, routeHref, routePath } from '../routes.js';
import { districtSlug, pageInfo, sitePages, publishedSite } from '../page-info.js';
import { formatDate, formatNumber, formatPercent, setLanguage } from '../i18n.js';

const root = new URL('../', import.meta.url);
const args = process.argv.slice(2);
const check = args.includes('--check');
const option = name => args.includes(name) ? args[args.indexOf(name) + 1] : undefined;
for (let index = 0; index < args.length; index += 1) {
  if (args[index] === '--check') continue;
  if (['--python', '--site-url'].includes(args[index]) && args[index + 1] && !args[index + 1].startsWith('--')) { index += 1; continue; }
  throw new Error('Usage: node tools/build-pages.mjs [--check] [--python executable] [--site-url https://host/path/]');
}
const base = new URL(option('--site-url') || publishedSite);
if (base.protocol !== 'https:' || base.search || base.hash || base.username || base.password) throw new Error('The publishing URL must be HTTPS without credentials, a query or a fragment.');
if (!base.pathname.endsWith('/')) base.pathname += '/';
const readJson = async path => JSON.parse(await readFile(new URL(path, root), 'utf8'));
const [election, polls, manifest, programs, geography, shell] = await Promise.all([
  readJson('data/election.json'), readJson('data/polls.json'), readJson('data/assets/manifest.json'), readJson('data/programs.json'), readJson('data/map/districts-map.geojson'), readFile(new URL('index.html', root), 'utf8')
]);
setLanguage('en', false);
const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]);
const link = (href, label) => `<a href="${escapeHtml(href)}">${escapeHtml(label)}</a>`;
const external = (href, label) => `<a href="${escapeHtml(href)}" target="_blank" rel="noopener noreferrer">${escapeHtml(label)}</a>`;
const partyName = id => election.parties.find(party => party.id === id)?.ballot || polls.historicalParties?.find(party => party.id === id)?.ballot || (id === 'independent' ? 'Independent' : 'Unaffiliated');
const roster = candidateRoster(manifest);
const snapshot = formatDate(manifest.collectedAt, { dateStyle: 'long', timeZone: 'America/Vancouver' });
const heading = page => `<div class="page-head"><div><p class="eyebrow">2026 provincial general election</p><h1>${escapeHtml(page.heading)}</h1><p>${escapeHtml(page.description)}</p></div></div>`;
const candidateNotice = `<p class="candidate-snapshot-note">Candidate records as of ${escapeHtml(snapshot)}. ${escapeHtml(candidateRosterNote(roster.phase))}</p>`;

function resultTable(name) {
  const record = election.featuredDistricts2024[name];
  if (!record) return '';
  const ranked = [...record.votes].sort((first, second) => second.votes - first.votes);
  return `<section class="static-section"><h2>Official 2024 results</h2><p>Historical results, not a 2026 forecast. ${formatNumber(record.validVotes)} valid votes${Number.isFinite(record.turnout) ? `; ${formatPercent(record.turnout, 2)} turnout` : ''}.</p><div class="table-wrap"><table class="data-table"><thead><tr><th scope="col">Candidate in 2024</th><th scope="col">Affiliation in 2024</th><th scope="col">Votes</th><th scope="col">Vote share</th></tr></thead><tbody>${ranked.map(vote => `<tr><th scope="row">${escapeHtml(vote.name)}</th><td>${escapeHtml(partyName(vote.party))}</td><td>${formatNumber(vote.votes)}</td><td>${formatPercent(vote.votes / record.validVotes * 100, 2)}</td></tr>`).join('')}</tbody></table></div><p>${external(record.source || election.sources.districts, 'Elections BC Statement of Votes')}</p></section>`;
}

function renderStatic(page) {
  if (!page.indexable) return `${heading(page)}<p>${link(routeHref('ridings'), 'Browse ridings')} · ${link(routeHref('province'), 'Province overview')}</p>`;
  if (page.name) return `${heading(page)}<p>${link(routeHref('ridings'), 'All ridings')}</p>${candidateNotice}<section class="static-section"><h2>2026 candidates</h2>${ridingCandidates(election, manifest, page.name)}<p>${external(election.sources.candidates, 'Confirm current nominations with Elections BC')}</p></section><section class="static-section"><h2>MLA at dissolution</h2>${ridingMember(manifest, page.name)}</section>${resultTable(page.name)}<p>${external(election.sources.boundaries, 'Official riding boundaries')}</p>`;
  if (page.route === 'candidates') return `${candidateDirectory(election, manifest, { query: '', partyId: 'all', riding: 'all' })}${candidateNotice}`;
  if (page.route === 'parties') return `${heading(page)}<p>Original English quotations. Sources checked ${escapeHtml(formatDate(programs.checkedAt, { dateStyle: 'long', timeZone: 'America/Vancouver' }))}.</p>${partyResults(election, manifest, programs, { partyId: 'all', topic: 'all', query: '' })}`;
  if (page.route === 'ridings') return `${heading(page)}<ul class="static-riding-index">${[...election.districts].sort((first, second) => first.localeCompare(second, 'en-CA')).map(name => `<li>${link(routeHref(`riding/${districtSlug(name)}`), name)}</li>`).join('')}</ul><p>${external(election.sources.boundaries, 'Elections BC official district boundaries')}</p>`;
  if (page.route === 'polls') return `${heading(page)}${renderPollChart(polls, election)}<section class="static-section"><h2>Original poll releases</h2>${[...polls.releases].sort((first, second) => second.released.localeCompare(first.released)).map(release => `<article class="release"><h3>${escapeHtml(release.pollster)}</h3><p>Released ${escapeHtml(formatDate(release.released, { dateStyle: 'long' }))}. Fieldwork ${escapeHtml(release.fieldStart)} to ${escapeHtml(release.fieldEnd)}. Sample: ${formatNumber(release.sampleTotal)}.</p><p>${Object.entries(release.shares).map(([party, share]) => `${escapeHtml(partyName(party))}: ${formatPercent(share)}`).join(' · ')}</p><p>${escapeHtml(release.method)} · ${escapeHtml(release.basis)}</p><p>${escapeHtml(release.note)}</p>${external(release.source, 'Original release')}${release.tables ? ` · ${external(release.tables, 'Data tables')}` : ''}</article>`).join('')}</section>`;
  if (page.route === 'about') return `${heading(page)}<section class="static-section"><h2>Independent and unofficial</h2><p>BC Election Guide is not affiliated with Elections BC or any political party. Use Elections BC for voting instructions, registration and current filings.</p><h2>Sources and verification</h2><p>Historical results and district boundaries come from Elections BC. Polls link to the original pollsters. Party programmes are shown as exact quotations with attribution and original source links.</p><p>${escapeHtml(candidateRosterNote(roster.phase))}</p><p>Source snapshot: ${escapeHtml(election.snapshotDate)}. Candidate records checked ${escapeHtml(snapshot)}. Past results are not current projections.</p><ul>${Object.entries(election.sources).map(([label, url]) => `<li>${external(url, label)}</li>`).join('')}</ul><h2>Privacy</h2><p>Location access requires permission. Coordinates stay in memory, not local storage or URLs. Address queries go to the BC Address Geocoder; the site does not save address text or coordinates. Map providers receive requests for the viewed area.</p><h2>Contact</h2><p>${link('mailto:contact@bcelectionguide.ca', 'contact@bcelectionguide.ca')}</p></section>`;
  return `${heading(page)}<p>Election day: ${escapeHtml(formatDate(election.electionDate, { dateStyle: 'long' }))}.</p><nav class="static-sections" aria-label="Election guide sections">${[['ridings', 'Find a riding'], ['parties', 'Party programmes'], ['candidates', '2026 candidates'], ['polls', 'Professional polls'], ['about', 'Sources and methodology']].map(([route, label]) => link(routeHref(route), label)).join('')}</nav><section class="static-section"><h2>Official 2024 results</h2><p>Historical context, not a forecast. ${election.districts.length} electoral districts.</p><ul>${election.baseline2024.seats.map(record => `<li>${escapeHtml(partyName(record.id))}: ${record.seats} seats</li>`).join('')}</ul><div class="table-wrap"><table class="data-table"><thead><tr><th scope="col">Affiliation in 2024</th><th scope="col">Popular vote</th></tr></thead><tbody>${election.baseline2024.popularVote.map(record => `<tr><th scope="row">${escapeHtml(record.name || partyName(record.id))}</th><td>${formatPercent(record.share, 2)}</td></tr>`).join('')}</tbody></table></div><p>${external(election.sources.districts, 'Official Statement of Votes')}</p></section>${candidateNotice}`;
}

const pages = sitePages(election, base.href);
if (pages.length !== election.districts.length + 6 || new Set(pages.map(page => page.url)).size !== pages.length) throw new Error('Static page routes are not unique.');
const outputPages = [...pages, pageInfo(null, election, base.href)].map(page => {
  const path = page.indexable ? `${routePath(page.route)}index.html` : '404.html';
  const depth = path.split('/').length - 1;
  const prefix = page.indexable ? '../'.repeat(depth) || './' : base.pathname;
  configureRouteBase(prefix);
  const licence = `<p class="small-note">Boundary data contains information licenced under the ${external('https://www.elections.bc.ca/docs/EBC-Open-Data-Licence.pdf', 'Elections BC Open Data Licence')}.</p>`;
  return { ...page, path, prefix, snapshot: `Source snapshot: ${formatDate(election.snapshotDate, { dateStyle: 'long' })}`, electionDay: `Election day: ${formatDate(election.electionDate, { dateStyle: 'long' })}`, content: `<div class="static-content">${renderStatic(page)}${licence}</div>`, links: Object.fromEntries(['province', 'ridings', 'candidates', 'parties', 'polls', 'about'].map(route => [route, routeHref(route)])) };
});

const rendered = spawnSync(option('--python') || process.env.BC_PREVIEW_PYTHON || 'python', [fileURLToPath(new URL('tools/render-pages.py', root))], {
  input: JSON.stringify({ shell: shell.replace(/\r\n/g, '\n'), pages: outputPages, geometry: geography, site: base.href, font: process.env.BC_PREVIEW_FONT || null }),
  encoding: 'utf8', maxBuffer: 64 * 1024 * 1024,
  env: { ...process.env, PYTHONUTF8: '1', PYTHONDONTWRITEBYTECODE: '1' }
});
if (rendered.error || rendered.status !== 0) throw new Error(`Static rendering failed. Python with Pillow is required. ${rendered.error?.message || rendered.stderr}`);
const files = JSON.parse(rendered.stdout);
files.push({ path: 'sitemap.xml', text: `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${pages.map(page => `  <url><loc>${escapeHtml(page.url)}</loc></url>`).join('\n')}\n</urlset>\n` });
files.push({ path: 'robots.txt', text: `User-agent: *\nAllow: /\n\nSitemap: ${new URL('sitemap.xml', base).href}\n` });
const stale = [];
for (const file of files) {
  if (!/^[a-z0-9/.-]+$/.test(file.path) || file.path.includes('..')) throw new Error(`Unsafe output path: ${file.path}`);
  const target = new URL(file.path, root);
  const bytes = file.base64 ? Buffer.from(file.base64, 'base64') : Buffer.from(file.text, 'utf8');
  let existing;
  try { existing = await readFile(target); } catch (error) { if (error.code !== 'ENOENT') throw error; }
  if (existing?.equals(bytes)) continue;
  if (check) stale.push(file.path);
  else { await mkdir(dirname(fileURLToPath(target)), { recursive: true }); await writeFile(target, bytes); }
}
if (stale.length) throw new Error(`Regenerate static pages with node tools/build-pages.mjs. Stale files: ${stale.join(', ')}`);
console.log(`${check ? 'Verified' : 'Generated'} ${pages.length} crawlable pages, one 404 page, ${pages.length} PNG previews, sitemap.xml and robots.txt for ${base.href}`);
