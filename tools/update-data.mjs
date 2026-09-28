import { mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { homedir } from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { resolve, sep } from 'node:path';

const root = new URL('../', import.meta.url);
const current = new URL('data/', root);
const cachePath = resolve(process.env.BC_VOTE_SOURCE_CACHE || resolve(process.env.LOCALAPPDATA || resolve(homedir(), '.cache'), 'bc-elections-2026', 'source-cache'));
const sourceCache = pathToFileURL(`${cachePath}${sep}`);
const groups = ['polls', 'election', 'programs', 'assets', 'map', 'licenses'];
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const normalizedName = value => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, ' ').trim().toLocaleLowerCase('en-CA');
const candidateId = (partyId, name) => `${partyId}-${normalizedName(name).replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')}`;

function file(base, path) {
  if (!path || path.includes('\\') || path.split('/').includes('..') || path.startsWith('/') || path.includes(':')) throw new Error(`Unsafe data path: ${path}`);
  const absolute = resolve(fileURLToPath(base), path);
  if (!absolute.startsWith(`${resolve(fileURLToPath(base))}${sep}`)) throw new Error(`Path outside data directory: ${path}`);
  return absolute;
}

async function optionalRead(path) {
  try { return await readFile(path); } catch (error) {
    if (error.code === 'ENOENT') return null;
    throw error;
  }
}

async function json(base, path) {
  return JSON.parse(await readFile(file(base, path), 'utf8'));
}

async function save(base, path, bytes) {
  const destination = file(base, path);
  await mkdir(resolve(destination, '..'), { recursive: true });
  await writeFile(destination, bytes);
}

async function saveJson(base, path, value) {
  await save(base, path, `${JSON.stringify(value, null, 2)}\n`);
}

function fetchSource(source) {
  if (source.requestBody && (typeof source.requestBody.query !== 'string' || !/^\s*query\b/.test(source.requestBody.query))) throw new Error('Only registered read-only GraphQL queries are supported.');
  return fetch(source.url, {
    signal: AbortSignal.timeout(60000),
    headers: { 'User-Agent': 'BCElectionGuide-DataUpdate/1.0 (+https://sixprime.github.io/bc-elections-2026/)', ...(source.requestBody ? { 'Content-Type': 'application/json' } : {}) },
    ...(source.requestBody ? { method: 'POST', body: JSON.stringify(source.requestBody) } : {})
  });
}

async function files(base, prefix = '') {
  let entries;
  try { entries = await readdir(new URL(prefix, base), { withFileTypes: true }); } catch (error) {
    if (error.code === 'ENOENT') return [];
    throw error;
  }
  const paths = [];
  for (const entry of entries) {
    if (entry.isSymbolicLink()) throw new Error('Data directories must not contain symbolic links.');
    const path = `${prefix}${entry.name}`;
    if (entry.isDirectory()) paths.push(...await files(base, `${path}/`));
    else paths.push(path);
  }
  return paths.sort();
}

async function sources() {
  const registry = await json(current, 'sources.json');
  const polls = await json(current, 'polls.json');
  const assets = await json(current, 'assets/manifest.json');
  const geography = await json(current, 'map/geography.json');
  const result = [...registry.sources];
  for (const candidate of assets.candidates) {
    if (candidate.statusSourceType !== 'party-release' || result.some(source => source.url === candidate.statusSource)) continue;
    const id = `candidate-release-${hash(Buffer.from(candidate.statusSource)).slice(0, 12)}`;
    result.push({ id, group: 'election', url: candidate.statusSource, path: `sources/election/${id}.html.txt` });
  }
  const programBytes = await optionalRead(file(current, 'programs.json'));
  if (programBytes) {
    for (const source of JSON.parse(programBytes.toString('utf8')).sources) {
      if (result.some(record => record.id === source.id)) continue;
      const suffix = new URL(source.url).pathname.endsWith('.pdf') ? 'pdf' : 'html.txt';
      result.push({ id: source.id, group: 'programs', url: source.url, path: `sources/programs/${source.id}.${suffix}`, allowInsecureHttp: source.allowInsecureHttp === true });
    }
  }
  for (const poll of polls.releases) {
    result.push({ id: poll.id, group: 'polls', url: poll.source, path: `sources/polls/${poll.id}.html.txt` });
    if (poll.tables) result.push({ id: `${poll.id}-tables`, group: 'polls', url: poll.tables, path: `sources/polls/${poll.id}.pdf` });
  }
  for (const asset of assets.assets) {
    const suffix = asset.original.path.slice(asset.original.path.lastIndexOf('.'));
    result.push({ id: asset.id, group: 'assets', url: asset.sourceUrl, path: `sources/assets/originals/${asset.id}${suffix}`, originalPath: asset.original.path, allowInsecureHttp: asset.allowInsecureHttp === true });
  }
  result.push({ id: 'elections-bc-boundaries', group: 'map', url: geography.source, path: 'sources/map/districts.geojson' });
  result.push({ id: 'elections-bc-license', group: 'licenses', url: geography.licenseUrl, path: 'licenses/elections-bc.pdf' });
  return [...new Map(result.map(source => [source.path, source])).values()];
}

async function downloadSources(selected) {
  const workspacePath = resolve(fileURLToPath(root));
  if (cachePath.toLowerCase() === workspacePath.toLowerCase() || cachePath.toLowerCase().startsWith(`${workspacePath}${sep}`.toLowerCase())) throw new Error('Keep BC_VOTE_SOURCE_CACHE outside the repository so raw sources are not published.');
  const retrievalBytes = await optionalRead(file(sourceCache, 'retrievals.json'));
  const retrievals = retrievalBytes ? JSON.parse(retrievalBytes.toString('utf8')) : { sources: [], failures: [] };
  const provenanceBytes = await optionalRead(file(current, 'provenance.json'));
  const provenance = provenanceBytes ? JSON.parse(provenanceBytes.toString('utf8')) : { sources: {} };
  const selectedIds = new Set(selected.map(source => source.id));
  retrievals.failures = retrievals.failures.filter(source => !selectedIds.has(source.id));
  let downloaded = 0;
  for (const source of selected) {
    try {
      if (!/^[a-z0-9-]+$/.test(source.id) || !groups.includes(source.group)) throw new Error('Invalid source identity or group.');
      const url = new URL(source.url);
      if (url.username || url.password) throw new Error('Source URLs must not contain credentials.');
      if (!source.url.startsWith('https://') && !(source.allowInsecureHttp && source.url.startsWith('http://'))) throw new Error('Source must use HTTPS unless an HTTP-only source was explicitly reviewed.');
      const response = await fetchSource(source);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const bytes = Buffer.from(await response.arrayBuffer());
      if (!bytes.length || bytes.length > 64 * 1024 * 1024) throw new Error('Source is empty or exceeds 64 MB.');
      const contentType = response.headers.get('content-type') || '';
      if (source.path.endsWith('.pdf') && !bytes.subarray(0, 5).equals(Buffer.from('%PDF-'))) throw new Error('Expected a PDF, not a replacement page.');
      if (/\.(geojson|json)$/.test(source.path)) {
        const value = JSON.parse(bytes.toString('utf8'));
        if (source.requestBody && value.errors?.length) throw new Error('The source query returned errors.');
      }
      if (source.originalPath && contentType.includes('text/html')) throw new Error('Expected artwork, not an HTML error page.');
      const sha256 = hash(bytes);
      const previous = retrievals.sources.find(record => record.id === source.id && record.sha256 === sha256);
      const suffix = source.path.slice(source.path.lastIndexOf('.'));
      const path = previous?.path || `sources/${source.group}/${source.id}/${sha256}${suffix}`;
      await save(sourceCache, path, bytes);
      const record = { ...source, path, finalUrl: response.url, contentType, fetchedAt: new Date().toISOString(), bytes: bytes.length, sha256 };
      retrievals.sources = retrievals.sources.filter(record => record.id !== source.id || record.sha256 !== sha256);
      retrievals.sources.push(record);
      const previousHash = provenance.sources[source.id]?.sha256;
      provenance.sources[source.id] = { url: source.url, finalUrl: response.url, retrievedAt: record.fetchedAt, sha256, contentType, ...(source.requestBody ? { method: 'POST', requestBody: source.requestBody } : {}) };
      downloaded++;
      console.log(`${previousHash === sha256 ? 'Unchanged' : 'Downloaded'}: ${source.id}`);
    } catch (error) {
      retrievals.failures.push({ ...source, error: error.message });
      console.error(`Unavailable: ${source.id}: ${error.message}`);
    }
  }
  await saveJson(sourceCache, 'retrievals.json', retrievals);
  if (downloaded) await saveJson(current, 'provenance.json', provenance);
  console.log(`Source cache: ${cachePath}. Edit data/ directly, run check, and review with git diff. Datasets were not automatically rewritten.`);
  if (retrievals.failures.some(source => selectedIds.has(source.id))) process.exitCode = 1;
}

async function fetchGroup(group) {
  if (group !== 'all' && !groups.includes(group)) throw new Error(`Choose a group: ${groups.join(', ')}, all`);
  await downloadSources((await sources()).filter(source => group === 'all' || source.group === group));
}

async function addSource(id, url, group = 'programs') {
  if (!/^[a-z0-9-]+$/.test(id || '') || !url?.startsWith('https://') || !groups.includes(group)) throw new Error('Use source <lowercase-id> <https-url> [group].');
  const registered = (await sources()).find(source => source.id === id);
  if (registered && registered.url !== url) throw new Error(`Source ID already refers to another URL: ${id}`);
  const suffix = new URL(url).pathname.endsWith('.pdf') ? 'pdf' : 'html.txt';
  await downloadSources([registered || { id, url, group, path: `sources/${group}/${id}.${suffix}` }]);
}

async function refreshCandidates() {
  const election = await json(current, 'election.json');
  const manifest = await json(current, 'assets/manifest.json');
  const official = await json(current, 'assets/sources/accepted-candidates.json');
  const previousCount = manifest.candidates.length;
  for (const candidate of manifest.candidates) candidate.statusSourceType ||= candidate.status === 'accepted' ? 'elections-bc' : 'party-directory';
  const portraitIds = (name, district) => manifest.members?.find(member => normalizedName(member.name) === normalizedName(name) && member.district === district)?.assetIds || [];
  if (!official.final) {
    const retrievals = await json(sourceCache, 'retrievals.json');
    const registry = await json(current, 'sources.json');
    const feed = registry.sources.find(source => source.id === 'ndp-candidates');
    const source = retrievals.sources.filter(source => source.id === feed?.id && source.url === feed.url).sort((first, second) => second.fetchedAt.localeCompare(first.fetchedAt))[0];
    if (!source) throw new Error('Fetch the registered NDP candidate feed before refreshing candidates.');
    const bytes = await readFile(file(sourceCache, source.path));
    if (hash(bytes) !== source.sha256) throw new Error('Cached candidate feed differs from its retrieval hash.');
    const profiles = Object.values(JSON.parse(bytes.toString('utf8')).profiles || {});
    if (!profiles.length) throw new Error('The current-year candidate feed is empty; existing data was not changed.');
    for (const profile of profiles) {
      if (!profile.fullname || !profile.riding_name) throw new Error('A candidate feed record is missing its name or riding.');
      const district = election.districts.find(name => normalizedName(name) === normalizedName(profile.riding_name));
      if (!district) throw new Error(`Unrecognized candidate riding: ${profile.riding_name}`);
      let candidate = manifest.candidates.find(candidate => candidate.partyId === 'ndp' && normalizedName(candidate.name) === normalizedName(profile.fullname));
      if (!candidate) {
        candidate = { id: candidateId('ndp', profile.fullname), partyId: 'ndp', name: profile.fullname, assetIds: portraitIds(profile.fullname, district) };
        manifest.candidates.push(candidate);
      }
      Object.assign(candidate, { district, districtSlug: district.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, ''), profileUrl: profile.website_link || 'https://www.bcndp.ca/team', sourcePage: 'https://www.bcndp.ca/team', imageUrl: profile.image, dataSource: source.url, dataSourceSha256: source.sha256, checkedAt: source.fetchedAt });
      if (candidate.status !== 'accepted' && candidate.statusSourceType !== 'party-release') Object.assign(candidate, { status: 'party-announced', statusSource: 'https://www.bcndp.ca/team', statusSourceType: 'party-directory' });
    }
  }
  const officialCandidateIds = [];
  for (const record of official.candidates) {
    let candidate = manifest.candidates.find(candidate => normalizedName(candidate.name) === normalizedName(record.name) && candidate.district === record.district);
    if (!candidate) {
      candidate = { id: candidateId(record.partyId, record.name), name: record.name, district: record.district, districtSlug: record.district.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, ''), sourcePage: election.sources.candidates, assetIds: portraitIds(record.name, record.district) };
      manifest.candidates.push(candidate);
    }
    Object.assign(candidate, { partyId: record.partyId, status: 'accepted', statusSource: official.url, statusSourceType: 'elections-bc', statusSourceSha256: official.sha256, checkedAt: official.fetchedAt });
    officialCandidateIds.push(candidate.id);
  }
  if (official.final) {
    for (const candidate of manifest.candidates) {
      if (!officialCandidateIds.includes(candidate.id)) Object.assign(candidate, { status: 'not-on-ballot', statusSource: official.url, statusSourceType: 'elections-bc', statusSourceSha256: official.sha256, checkedAt: official.fetchedAt });
    }
  }
  manifest.collectedAt = new Date().toISOString();
  manifest.scope = 'Elections BC nominations and dated official party announcements, including press releases. Only the verified final Elections BC list determines ballot membership after nominations close.';
  manifest.candidateSnapshot = { electionDate: official.electionDate, nominationDeadline: official.nominationDeadline, officialSource: official.url, officialSourceSha256: official.sha256, officialListCheckedAt: official.fetchedAt, officialListFinal: official.final, officialCandidateIds };
  await validate(manifest);
  await saveJson(current, 'assets/manifest.json', manifest);
  console.log(`Candidate catalogue: ${manifest.candidates.length} records (${manifest.candidates.length - previousCount} added), ${officialCandidateIds.length} Elections BC nominations. Official list is ${official.final ? 'final' : 'provisional'}. Financial-agent and contact fields were not imported.`);
}

async function pruneAssets() {
  await validate();
  const manifest = await json(current, 'assets/manifest.json');
  const referenced = new Set(manifest.assets.flatMap(asset => [asset.original?.path, asset.web?.path, `assets/sources/${asset.id}.json`]).filter(Boolean));
  const sourceRecords = new Set(['assets/sources/accepted-candidates.json', 'assets/sources/registered-parties.json']);
  const unused = (await files(current)).filter(path => {
    if (referenced.has(path) || sourceRecords.has(path)) return false;
    return /^assets\/(originals|web)\//.test(path) || /^assets\/sources\/[^/]+\.json$/.test(path);
  });
  const apply = process.argv.includes('--apply');
  if (apply) for (const path of unused) await rm(file(current, path));
  console.log(JSON.stringify({ unreferenced: unused, removed: apply, note: apply ? 'Review removals with git diff.' : 'No files changed. Use prune-assets --apply to remove these unreferenced files.' }, null, 2));
}

function committedData(path) {
  const result = spawnSync('git', ['show', `HEAD:data/${path}`], { cwd: root, maxBuffer: 64 * 1024 * 1024, windowsHide: true });
  if (result.error) throw result.error;
  if (result.status === 128) return null;
  if (result.status !== 0) throw new Error(`Could not read Git baseline for ${path}.`);
  return result.stdout;
}

function validatePrograms(programs, election, evidence) {
  const fields = (record, allowed) => record && typeof record === 'object' && Object.keys(record).every(key => allowed.includes(key));
  if (!fields(programs, ['schemaVersion', 'checkedAt', 'sources', 'topics', 'parties']) || programs.schemaVersion !== 2 || !Number.isFinite(Date.parse(programs.checkedAt)) || !Array.isArray(programs.sources) || !Array.isArray(programs.topics) || !Array.isArray(programs.parties)) throw new Error('Invalid quote-only programme dataset.');
  const identifier = value => typeof value === 'string' && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value);
  const digest = value => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
  const normalizeText = text => text.replace(/\s+/gu, ' ').trim();
  const topics = new Set();
  for (const topic of programs.topics) {
    if (!fields(topic, ['id', 'label']) || !identifier(topic.id) || topics.has(topic.id) || !topic.label) throw new Error('Invalid programme topic.');
    topics.add(topic.id);
  }
  const sources = new Map();
  for (const source of programs.sources) {
    if (!fields(source, ['id', 'title', 'publisher', 'url', 'electionYear', 'publishedOn', 'sourceSha256', 'textSha256', 'allowInsecureHttp']) || !identifier(source.id) || sources.has(source.id) || !source.title || !source.publisher || !digest(source.sourceSha256) || !digest(source.textSha256)) throw new Error(`Invalid quotation source: ${source.id}`);
    const url = new URL(source.url);
    if (url.username || url.password || (url.protocol !== 'https:' && !(url.protocol === 'http:' && source.allowInsecureHttp === true))) throw new Error(`Unsafe programme source URL: ${source.id}`);
    if (source.electionYear !== null && (!Number.isInteger(source.electionYear) || source.electionYear < 1900 || source.electionYear > 2100)) throw new Error(`Invalid programme year: ${source.id}`);
    if (source.publishedOn !== null && (!/^\d{4}-\d{2}-\d{2}$/.test(source.publishedOn) || !Number.isFinite(Date.parse(source.publishedOn)) || source.publishedOn > programs.checkedAt.slice(0, 10))) throw new Error(`Invalid programme publication date: ${source.id}`);
    sources.set(source.id, source);
  }
  const sourceText = new Map();
  if (evidence) {
    if (evidence.schemaVersion !== 1 || !Array.isArray(evidence.sources)) throw new Error('Invalid quotation evidence.');
    for (const record of evidence.sources) {
      const source = sources.get(record.id);
      if (!source || sourceText.has(record.id) || record.sourceSha256 !== source.sourceSha256 || typeof record.text !== 'string' || normalizeText(record.text) !== record.text || hash(Buffer.from(record.text)) !== source.textSha256) throw new Error(`Quotation evidence differs from its source: ${record.id}`);
      sourceText.set(record.id, record.text);
    }
  }
  const parties = new Set(election.parties.map(party => party.id));
  const seen = new Set();
  const quotedWords = new Map();
  for (const program of programs.parties) {
    if (!fields(program, ['id', 'sourceIds', 'quotes']) || !parties.has(program.id) || seen.has(program.id) || !Array.isArray(program.sourceIds) || !Array.isArray(program.quotes)) throw new Error(`Invalid quote-only party record: ${program.id}`);
    seen.add(program.id);
    if (new Set(program.sourceIds).size !== program.sourceIds.length || program.sourceIds.some(id => !sources.has(id))) throw new Error(`Missing programme source: ${program.id}`);
    const quoteIds = new Set();
    for (const quote of program.quotes) {
      if (!fields(quote, ['id', 'topic', 'text', 'speaker', 'sourceId', 'locator', 'textSha256']) || !identifier(quote.id) || quoteIds.has(quote.id) || !topics.has(quote.topic) || typeof quote.text !== 'string' || !quote.text || normalizeText(quote.text) !== quote.text || quote.text.split(/\s+/u).length > 45 || !quote.speaker || !program.sourceIds.includes(quote.sourceId)) throw new Error(`Invalid attributed quotation: ${program.id}/${quote.id}`);
      quoteIds.add(quote.id);
      if (hash(Buffer.from(quote.text)) !== quote.textSha256) throw new Error(`Quotation changed without verification: ${program.id}/${quote.id}`);
      if (evidence && !sourceText.get(quote.sourceId)?.includes(quote.text)) throw new Error(`Quotation does not match source text: ${program.id}/${quote.id}`);
      const sourceUrl = new URL(sources.get(quote.sourceId).url);
      sourceUrl.hash = '';
      const count = (quotedWords.get(sourceUrl.href) || 0) + quote.text.split(/\s+/u).length;
      if (count > 200) throw new Error(`Combined quotation limit exceeded: ${quote.sourceId}`);
      quotedWords.set(sourceUrl.href, count);
    }
  }
  if (seen.size !== parties.size) throw new Error('Programme coverage must include every registered party, including source gaps.');
}

async function validate(candidateManifest) {
  const election = await json(current, 'election.json');
  const polls = await json(current, 'polls.json');
  const candidateDocuments = (await files(current)).filter(path => /candidate[^/]*\.pdf$/i.test(path));
  if (candidateDocuments.length) throw new Error('Raw candidate-list PDFs must remain in the external source cache, not public data.');
  if (!Array.isArray(election.districts) || election.districts.length !== election.districtCount || new Set(election.districts).size !== election.districtCount) throw new Error('District count or identities are invalid.');
  if (!Array.isArray(election.parties) || !election.parties.length) throw new Error('The party register is empty.');
  const programs = await optionalRead(file(current, 'programs.json'));
  if (programs) {
    let evidence;
    const committed = committedData('programs.json');
    if (!committed || !programs.equals(committed) || process.argv.includes('--sources')) {
      const evidenceBytes = await optionalRead(file(sourceCache, 'sources/programs/quotation-evidence.json'));
      if (!evidenceBytes) throw new Error(`Changed programme data requires quotation source evidence in ${cachePath}. Use fetch programs and verify its excerpts before committing.`);
      evidence = JSON.parse(evidenceBytes.toString('utf8'));
      const retrievals = await json(sourceCache, 'retrievals.json');
      if (!Array.isArray(evidence.sources)) throw new Error('Quotation source evidence is missing.');
      for (const record of evidence.sources) {
        const source = retrievals.sources.find(source => source.id === record.id && source.sha256 === record.sourceSha256 && source.path === record.path);
        if (!source || typeof record.path !== 'string' || !record.path.startsWith('sources/programs/') || hash(await readFile(file(sourceCache, record.path))) !== record.sourceSha256) throw new Error(`Original quotation source changed: ${record.id}`);
      }
    }
    validatePrograms(JSON.parse(programs.toString('utf8')), election, evidence);
  }
  const partyIds = new Set([...election.parties.map(party => party.id), 'independent', 'unaffiliated']);
  const results = Object.entries(election.featuredDistricts2024 || {});
  const partyVotes = new Map();
  const seats = new Map();
  let totalVotes = 0;
  let resultCandidates = 0;
  for (const [district, result] of results) {
    if (!election.districts.includes(district) || !Array.isArray(result.votes) || result.votes.length < 2 || !Number.isInteger(result.validVotes) || result.validVotes <= 0) throw new Error(`Invalid 2024 result: ${district}`);
    const names = new Set();
    let districtVotes = 0;
    for (const candidate of result.votes) {
      if (!candidate.name || names.has(candidate.name) || !partyIds.has(candidate.party) || !Number.isInteger(candidate.votes) || candidate.votes < 0) throw new Error(`Invalid 2024 candidate: ${district}`);
      names.add(candidate.name);
      districtVotes += candidate.votes;
      partyVotes.set(candidate.party, (partyVotes.get(candidate.party) || 0) + candidate.votes);
    }
    if (districtVotes !== result.validVotes) throw new Error(`2024 candidate totals disagree: ${district}`);
    const winner = [...result.votes].sort((first, second) => second.votes - first.votes)[0].party;
    seats.set(winner, (seats.get(winner) || 0) + 1);
    totalVotes += districtVotes;
    resultCandidates += result.votes.length;
  }
  if (election.resultsCoverage2024?.complete) {
    if (results.length !== election.districtCount || resultCandidates !== election.resultsCoverage2024.candidates || totalVotes !== election.baseline2024.validVotes) throw new Error('Complete 2024 coverage does not match provincial totals.');
    for (const party of election.baseline2024.popularVote) if (partyVotes.get(party.id) !== party.votes) throw new Error(`2024 party totals disagree: ${party.id}`);
    for (const party of election.baseline2024.seats) if (seats.get(party.id) !== party.seats) throw new Error(`2024 seat totals disagree: ${party.id}`);
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(polls.snapshotDate) || !Number.isFinite(polls.summaryWindowDays) || polls.summaryWindowDays <= 0) throw new Error('Invalid poll snapshot date or summary window.');
  const ids = new Set();
  for (const poll of polls.releases) {
    if (!poll.id || ids.has(poll.id) || !poll.pollster || !poll.source?.startsWith('https://')) throw new Error('A poll has a missing/duplicate ID, pollster or source.');
    ids.add(poll.id);
    for (const field of ['released', 'fieldStart', 'fieldEnd']) if (!/^\d{4}-\d{2}-\d{2}$/.test(poll[field]) || !Number.isFinite(Date.parse(poll[field]))) throw new Error(`Invalid ${field}: ${poll.id}`);
    if (poll.fieldStart > poll.fieldEnd || poll.fieldEnd > poll.released || poll.released > polls.snapshotDate) throw new Error(`Inconsistent poll dates: ${poll.id}`);
    if (!Number.isFinite(poll.sampleTotal) || poll.sampleTotal <= 0) throw new Error(`Invalid sample: ${poll.id}`);
    const shares = Object.values(poll.shares || {});
    if (!shares.length || shares.some(share => !Number.isFinite(share) || share < 0 || share > 100) || shares.reduce((total, share) => total + share, 0) > 101) throw new Error(`Invalid party shares: ${poll.id}`);
  }
  const manifest = candidateManifest || await json(current, 'assets/manifest.json');
  const committedManifestBytes = committedData('assets/manifest.json');
  const committedCandidates = new Map((committedManifestBytes ? JSON.parse(committedManifestBytes.toString('utf8')).candidates : []).map(candidate => [candidate.id, candidate]));
  let candidateRetrievals;
  const verifiedCandidateSources = new Set();
  const assetsById = new Map(manifest.assets.map(asset => [asset.id, asset]));
  if (assetsById.size !== manifest.assets.length) throw new Error('Duplicate artwork IDs.');
  const official = await json(current, 'assets/sources/accepted-candidates.json');
  const allowedFields = (record, fields) => record && typeof record === 'object' && Object.keys(record).every(field => fields.includes(field));
  const officialHost = url => { try { const parsed = new URL(url); return parsed.protocol === 'https:' && !parsed.username && !parsed.password && ['elections.bc.ca', 'www.elections.bc.ca'].includes(parsed.hostname); } catch { return false; } };
  const officialFields = ['schemaVersion', 'electionDate', 'nominationDeadline', 'final', 'url', 'finalUrl', 'fetchedAt', 'sha256', 'candidates'];
  const deadline = Date.parse(official.nominationDeadline);
  const checkedAt = Date.parse(official.fetchedAt);
  if (!allowedFields(official, officialFields) || official.schemaVersion !== 1 || official.electionDate !== election.electionDate || !Number.isFinite(deadline) || !Number.isFinite(checkedAt) || checkedAt > Date.now() || typeof official.final !== 'boolean' || !officialHost(official.url) || !officialHost(official.finalUrl) || !/^[a-f0-9]{64}$/.test(official.sha256) || !Array.isArray(official.candidates) || !official.candidates.length || (official.final && checkedAt < deadline)) throw new Error('Invalid candidate-only Elections BC snapshot.');
  const officialRecords = new Map();
  for (const record of official.candidates) {
    if (!allowedFields(record, ['name', 'district', 'partyId']) || !record.name || !election.districts.includes(record.district) || !partyIds.has(record.partyId)) throw new Error('Official candidate records may contain only name, district and partyId.');
    const key = `${normalizedName(record.name)}|${record.district}`;
    if (officialRecords.has(key)) throw new Error('Duplicate official candidate identity.');
    officialRecords.set(key, record);
  }
  const snapshot = manifest.candidateSnapshot;
  const snapshotFields = ['electionDate', 'nominationDeadline', 'officialSource', 'officialSourceSha256', 'officialListCheckedAt', 'officialListFinal', 'officialCandidateIds'];
  if (!allowedFields(snapshot, snapshotFields) || snapshot.electionDate !== election.electionDate || snapshot.nominationDeadline !== official.nominationDeadline || snapshot.officialSource !== official.url || snapshot.officialSourceSha256 !== official.sha256 || snapshot.officialListCheckedAt !== official.fetchedAt || snapshot.officialListFinal !== official.final || !Array.isArray(snapshot.officialCandidateIds) || new Set(snapshot.officialCandidateIds).size !== official.candidates.length || snapshot.officialCandidateIds.length !== official.candidates.length) throw new Error('Candidate catalogue and official snapshot disagree. Run refresh-candidates after reviewing the official list.');
  const committedOfficial = committedData('assets/sources/accepted-candidates.json');
  const officialChanged = !committedOfficial || committedOfficial.toString('utf8') !== await readFile(file(current, 'assets/sources/accepted-candidates.json'), 'utf8');
  if (officialChanged || process.argv.includes('--sources')) {
    const retrievals = await json(sourceCache, 'retrievals.json');
    const source = retrievals.sources.find(source => source.id === 'elections-bc-candidates' && source.url === official.url && source.sha256 === official.sha256 && source.fetchedAt === official.fetchedAt);
    if (!source || hash(await readFile(file(sourceCache, source.path))) !== official.sha256) throw new Error('The sanitized official candidate list has no matching cached Elections BC source.');
  }
  const candidateFields = new Set(['id', 'partyId', 'name', 'district', 'districtSlug', 'imageUrl', 'profileUrl', 'sourcePage', 'checkedAt', 'status', 'statusSource', 'assetIds', 'districtStatus', 'reportedDistrict', 'districtNote', 'dataSource', 'dataSourceSha256', 'statusSourceSha256', 'statusSourceType', 'announcedOn', 'sourceElectionDate']);
  const candidateIds = new Set();
  const candidateIdentities = new Set();
  for (const candidate of manifest.candidates) {
    if (Object.keys(candidate).some(field => !candidateFields.has(field))) throw new Error(`Candidate record contains an unapproved field: ${candidate.id}. Financial-agent and contact details must not be published.`);
    if (!candidate.id || candidateIds.has(candidate.id) || !candidate.name || !partyIds.has(candidate.partyId) || !['accepted', 'party-announced', 'not-on-ballot'].includes(candidate.status) || !candidate.statusSource?.startsWith('https://') || !['elections-bc', 'party-directory', 'party-release'].includes(candidate.statusSourceType) || !Number.isFinite(Date.parse(candidate.checkedAt))) throw new Error(`Invalid candidate record: ${candidate.id}`);
    candidateIds.add(candidate.id);
    const identity = `${normalizedName(candidate.name)}|${candidate.district}`;
    if (candidateIdentities.has(identity)) throw new Error(`Duplicate candidate identity: ${candidate.name}`);
    candidateIdentities.add(identity);
    if (candidate.status === 'accepted') {
      const record = officialRecords.get(identity);
      if (!record || record.partyId !== candidate.partyId || !snapshot.officialCandidateIds.includes(candidate.id) || candidate.statusSource !== official.url || candidate.statusSourceSha256 !== official.sha256 || candidate.statusSourceType !== 'elections-bc' || candidate.checkedAt !== official.fetchedAt) throw new Error(`Accepted nomination is not backed by the current Elections BC snapshot: ${candidate.id}`);
    } else if (snapshot.officialCandidateIds.includes(candidate.id)) throw new Error(`Official candidate has an inconsistent status: ${candidate.id}`);
    if (candidate.status === 'not-on-ballot' && (!official.final || officialRecords.has(identity) || candidate.statusSource !== official.url || candidate.statusSourceSha256 !== official.sha256 || candidate.statusSourceType !== 'elections-bc')) throw new Error(`Absence from a provisional list is not a final ballot decision: ${candidate.id}`);
    if (candidate.status === 'party-announced') {
      const party = manifest.parties.find(party => party.id === candidate.partyId);
      const host = party?.website ? new URL(party.website).hostname.replace(/^www\./, '') : null;
      const url = new URL(candidate.statusSource);
      if (!host || url.username || url.password || !(url.hostname === host || url.hostname.endsWith(`.${host}`)) || !['party-directory', 'party-release'].includes(candidate.statusSourceType)) throw new Error(`Party announcement must come from that party's official website: ${candidate.id}`);
      if (candidate.statusSourceType === 'party-release') {
        if (!/^\d{4}-\d{2}-\d{2}$/.test(candidate.announcedOn || '') || !Number.isFinite(Date.parse(candidate.announcedOn)) || candidate.sourceElectionDate !== election.electionDate || candidate.announcedOn <= election.baseline2024.date || candidate.announcedOn > candidate.checkedAt.slice(0, 10) || !/^[a-f0-9]{64}$/.test(candidate.statusSourceSha256 || '')) throw new Error(`Party release requires its current-election date and source hash: ${candidate.id}`);
      }
      const sourceUrl = candidate.statusSourceType === 'party-release' ? candidate.statusSource : candidate.dataSource || candidate.statusSource;
      const sourceHash = candidate.statusSourceType === 'party-release' ? candidate.statusSourceSha256 : candidate.dataSourceSha256 || candidate.statusSourceSha256;
      const changed = JSON.stringify(candidate) !== JSON.stringify(committedCandidates.get(candidate.id));
      if (!committedCandidates.has(candidate.id) && !sourceHash) throw new Error(`New party candidate requires a verified source hash: ${candidate.id}`);
      if (sourceHash && (changed || process.argv.includes('--sources'))) {
        const key = `${sourceUrl}|${sourceHash}`;
        if (!verifiedCandidateSources.has(key)) {
          candidateRetrievals ||= await json(sourceCache, 'retrievals.json');
          const record = candidateRetrievals.sources.find(record => record.url === sourceUrl && record.sha256 === sourceHash);
          if (!record || hash(await readFile(file(sourceCache, record.path))) !== sourceHash) throw new Error(`Candidate source evidence is missing or changed: ${candidate.id}`);
          verifiedCandidateSources.add(key);
        }
      }
    }
    if (candidate.district === null) {
      if (candidate.districtSlug !== null || candidate.districtStatus !== 'unresolved' || !candidate.reportedDistrict || !candidate.districtNote || candidate.status === 'accepted') throw new Error(`Unexplained riding assignment: ${candidate.id}`);
    } else {
      if (!election.districts.includes(candidate.district)) throw new Error(`Unknown candidate riding: ${candidate.id}`);
      const slug = candidate.district.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
      if (candidate.districtSlug !== slug) throw new Error(`Candidate riding slug disagrees: ${candidate.id}`);
    }
    if (!Array.isArray(candidate.assetIds) || candidate.assetIds.some(id => !assetsById.has(id))) throw new Error(`Missing candidate artwork: ${candidate.id}`);
    for (const id of candidate.assetIds) {
      const asset = assetsById.get(id);
      const member = asset.memberId ? manifest.members?.find(member => member.id === asset.memberId) : null;
      const sharedPortrait = member && normalizedName(member.name) === normalizedName(candidate.name) && member.assetIds.includes(id);
      if (asset.kind === 'portrait' && asset.candidateId !== candidate.id && !sharedPortrait) throw new Error(`Portrait belongs to another candidate: ${candidate.id}`);
    }
  }
  if (snapshot.officialCandidateIds.some(id => !candidateIds.has(id))) throw new Error('The catalogue omits an official Elections BC candidate.');
  if (manifest.members !== undefined) {
    const snapshot = manifest.memberSnapshot;
    if (!Array.isArray(manifest.members) || !snapshot || !Number.isInteger(snapshot.parliament) || !/^\d{4}-\d{2}-\d{2}$/.test(snapshot.asOf) || !Number.isFinite(Date.parse(snapshot.asOf)) || !snapshot.source?.startsWith('https://') || !Array.isArray(snapshot.notListedDistricts)) throw new Error('Invalid member snapshot.');
    const memberIds = new Set();
    const memberDistricts = new Set();
    for (const member of manifest.members) {
      if (!member.id || memberIds.has(member.id) || !member.name || !member.affiliation || !member.profileUrl?.startsWith('https://') || !member.sourcePage?.startsWith('https://') || !election.districts.includes(member.district) || memberDistricts.has(member.district)) throw new Error(`Invalid member record: ${member.id}`);
      memberIds.add(member.id);
      memberDistricts.add(member.district);
      const slug = member.district.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
      if (member.districtSlug !== slug || !Array.isArray(member.assetIds) || (!member.assetIds.length && !member.portraitNote)) throw new Error(`Incomplete member profile: ${member.id}`);
      for (const id of member.assetIds) {
        const asset = assetsById.get(id);
        if (!asset || asset.kind !== 'portrait' || (asset.memberId && asset.memberId !== member.id)) throw new Error(`Member portrait belongs to another record: ${member.id}`);
      }
    }
    for (const district of snapshot.notListedDistricts) {
      if (!election.districts.includes(district) || memberDistricts.has(district)) throw new Error(`Invalid unlisted member district: ${district}`);
      memberDistricts.add(district);
    }
    if (memberDistricts.size !== election.districtCount) throw new Error('Member snapshot does not account for every riding.');
  }
  for (const asset of manifest.assets) {
    for (const record of [asset.original, asset.web].filter(Boolean)) {
      const bytes = await optionalRead(file(current, record.path));
      if (!bytes || hash(bytes) !== record.sha256) throw new Error(`Asset file and manifest disagree: ${record.path}`);
    }
  }
  const index = await json(current, 'map/district-index.json');
  const display = await json(current, 'map/districts-map.geojson');
  if (index.districts.length !== election.districtCount || display.features.length !== election.districtCount) throw new Error('Map and election district counts disagree.');
  for (const district of index.districts) {
    const bytes = await optionalRead(file(current, district.path));
    if (!bytes || hash(bytes) !== district.sha256) throw new Error(`District file and index disagree: ${district.name}`);
  }
}

try {
  const command = process.argv[2] || 'help';
  if (command === 'fetch') await fetchGroup(process.argv[3] || 'polls');
  else if (command === 'source') await addSource(process.argv[3], process.argv[4], process.argv[5]);
  else if (command === 'refresh-candidates') await refreshCandidates();
  else if (command === 'prune-assets') await pruneAssets();
  else if (command === 'cache') console.log(cachePath);
  else if (command === 'check') {
    await validate();
    console.log('Data references, source-backed quotations, required fields and file hashes are consistent.');
  } else if (command === 'help') {
    console.log('node tools/update-data.mjs fetch <polls|election|programs|assets|map|licenses|all>\nnode tools/update-data.mjs source <id> <https-url> [group]\nnode tools/update-data.mjs refresh-candidates\nnode tools/update-data.mjs check [--sources]\nnode tools/update-data.mjs prune-assets [--apply]\nnode tools/update-data.mjs cache\n\nEdit data/ directly and review with git diff. Downloads stay in a local source cache outside the repository; BC_VOTE_SOURCE_CACHE can override its location. Changed programme data requires cached quotation evidence. Fetch updates retrieval metadata but never rewrites datasets automatically. refresh-candidates merges the cached 2026 NDP feed and the reviewed candidate-only Elections BC snapshot; other official party sources are reviewed directly. No npm packages, commit or deployment steps are run.');
  } else throw new Error(`Unknown command: ${command}`);
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
