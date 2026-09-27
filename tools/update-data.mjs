import { cp, mkdir, readFile, readdir, rename, rm, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { resolve, sep } from 'node:path';

const root = new URL('../', import.meta.url);
const current = new URL('data/prod/', root);
const staging = new URL('data/staging/', root);
const groups = ['polls', 'election', 'assets', 'map', 'licenses'];
const hash = bytes => createHash('sha256').update(bytes).digest('hex');

function file(base, path) {
  if (!path || path.includes('\\') || path.split('/').includes('..') || path.startsWith('/') || path.includes(':')) throw new Error(`Unsafe data path: ${path}`);
  const absolute = resolve(fileURLToPath(base), path);
  if (!absolute.startsWith(`${resolve(fileURLToPath(base))}${sep}`)) throw new Error(`Path outside snapshot: ${path}`);
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
    headers: { 'User-Agent': 'BCVote2026-DataUpdate/1.0 (+https://sixprime.github.io/bc-elections-2026/)', ...(source.requestBody ? { 'Content-Type': 'application/json' } : {}) },
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
    if (entry.isSymbolicLink()) throw new Error('Snapshot directories must not contain symbolic links.');
    const path = `${prefix}${entry.name}`;
    if (entry.isDirectory()) paths.push(...await files(base, `${path}/`));
    else paths.push(path);
  }
  return paths.sort();
}

async function sources() {
  const registry = await json(new URL('data/', root), 'sources.json');
  const polls = await json(current, 'polls.json');
  const assets = await json(current, 'assets/manifest.json');
  const geography = await json(current, 'map/geography.json');
  const result = [...registry.sources];
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

async function stage(group) {
  if (group !== 'all' && !groups.includes(group)) throw new Error(`Choose a group: ${groups.join(', ')}, all`);
  if ((await files(staging)).length) throw new Error('Staging already contains a review. Finish it or run discard --approve first.');
  const selected = (await sources()).filter(source => group === 'all' || source.group === group);
  const provenanceBytes = await optionalRead(file(current, 'provenance.json'));
  const provenance = provenanceBytes ? JSON.parse(provenanceBytes.toString('utf8')) : { sources: {} };
  const baseline = {};
  for (const path of await files(current)) baseline[path] = hash(await readFile(file(current, path)));
  const review = { createdAt: new Date().toISOString(), group, baseline, fetched: [], failures: [], normalization: 'manual-review-required' };
  await saveJson(staging, '_review.json', review);
  const editable = new Set();
  if (['all', 'polls'].includes(group)) editable.add('polls.json');
  if (['all', 'election'].includes(group)) { editable.add('election.json'); editable.add('assets/manifest.json'); }
  if (['all', 'assets'].includes(group)) editable.add('assets/manifest.json');
  for (const path of editable) await save(staging, path, await readFile(file(current, path)));
  for (const source of selected) {
    try {
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
      const previous = await optionalRead(file(current, source.path));
      const original = source.originalPath ? await optionalRead(file(current, source.originalPath)) : null;
      const previousHash = previous ? hash(previous) : original ? hash(original) : provenance.sources[source.id]?.sha256 || null;
      const sha256 = hash(bytes);
      if (sha256 !== previousHash) await save(staging, source.path, bytes);
      review.fetched.push({ ...source, finalUrl: response.url, contentType, fetchedAt: new Date().toISOString(), bytes: bytes.length, sha256, previousSha256: previousHash, changed: previousHash !== sha256 });
      console.log(`${previousHash === sha256 ? 'Unchanged' : 'Staged'}: ${source.id}`);
    } catch (error) {
      review.failures.push({ ...source, error: error.message });
      console.error(`Unavailable: ${source.id}: ${error.message}`);
    }
  }
  await saveJson(staging, '_review.json', review);
  await compare();
  if (review.failures.length) process.exitCode = 1;
}

function recordChanges(before, after, key) {
  const previous = new Map((before || []).map(record => [record[key], record]));
  const next = new Map((after || []).map(record => [record[key], record]));
  return {
    added: [...next.keys()].filter(id => !previous.has(id)),
    changed: [...next.keys()].filter(id => previous.has(id) && JSON.stringify(previous.get(id)) !== JSON.stringify(next.get(id))),
    removed: [...previous.keys()].filter(id => !next.has(id))
  };
}

async function addSource(id, url) {
  if (!/^[a-z0-9-]+$/.test(id || '') || !url?.startsWith('https://')) throw new Error('Use source <lowercase-id> <https-url> for an open staging review.');
  const review = await json(staging, '_review.json');
  if (review.fetched.some(source => source.id === id)) throw new Error(`Source already recorded: ${id}`);
  const registry = await json(new URL('data/', root), 'sources.json');
  const registered = registry.sources.find(source => source.id === id && source.url === url);
  const response = await fetchSource(registered || { url });
  if (!response.ok) throw new Error(`Source download failed: HTTP ${response.status}`);
  const bytes = Buffer.from(await response.arrayBuffer());
  if (!bytes.length || bytes.length > 64 * 1024 * 1024) throw new Error('Source is empty or exceeds 64 MB.');
  const contentType = response.headers.get('content-type') || '';
  const pdf = new URL(url).pathname.endsWith('.pdf');
  if (pdf && !bytes.subarray(0, 5).equals(Buffer.from('%PDF-'))) throw new Error('Expected a PDF, not a replacement page.');
  const group = registered?.group || (groups.includes(review.group) ? review.group : 'polls');
  const path = registered?.path || `sources/${group}/${id}.${pdf ? 'pdf' : 'html.txt'}`;
  if (registered?.requestBody && JSON.parse(bytes.toString('utf8')).errors?.length) throw new Error('The source query returned errors.');
  if (await optionalRead(file(staging, path))) throw new Error(`Staged file already exists: ${path}`);
  await save(staging, path, bytes);
  review.fetched.push({ id, group, url, path, ...(registered?.requestBody ? { method: 'POST', requestBody: registered.requestBody } : {}), finalUrl: response.url, contentType, fetchedAt: new Date().toISOString(), bytes: bytes.length, sha256: hash(bytes), previousSha256: null, changed: true });
  await saveJson(staging, '_review.json', review);
  console.log(`Added source to staging: ${path}. Prod was not changed.`);
}

async function differences() {
  const changes = [];
  const removed = new Set(await reviewRemovals());
  for (const path of (await files(staging)).filter(path => !['_review.json', '_diff.json'].includes(path))) {
    if (removed.has(path)) throw new Error(`A removed file also has a staged replacement: ${path}`);
    const next = await readFile(file(staging, path));
    const previous = await optionalRead(file(current, path));
    if (previous && hash(next) === hash(previous)) continue;
    const change = { path, status: previous ? 'changed' : 'added', beforeBytes: previous?.length || 0, afterBytes: next.length };
    if (['polls.json', 'election.json', 'assets/manifest.json'].includes(path)) {
      const before = previous ? JSON.parse(previous.toString('utf8')) : {};
      const after = JSON.parse(next.toString('utf8'));
      for (const key of ['releases', 'parties', 'candidates', 'members', 'assets']) {
        if (Array.isArray(after[key])) change[key] = recordChanges(before[key], after[key], 'id');
      }
      if (after.featuredDistricts2024) {
        const records = snapshot => Object.entries(snapshot.featuredDistricts2024 || {}).map(([name, result]) => ({ id: name, ...result }));
        change.results2024 = recordChanges(records(before), records(after), 'id');
      }
    }
    changes.push(change);
  }
  for (const path of removed) {
    if (!/^assets\/(originals|web|sources)\//.test(path)) throw new Error(`Not an asset cleanup path: ${path}`);
    const previous = await readFile(file(current, path));
    changes.push({ path, status: 'removed', beforeBytes: previous.length, afterBytes: 0 });
  }
  return changes;
}

async function reviewRemovals() {
  const bytes = await optionalRead(file(staging, '_review.json'));
  const removed = bytes ? JSON.parse(bytes.toString('utf8')).removals || [] : [];
  if (!Array.isArray(removed) || removed.some(path => typeof path !== 'string')) throw new Error('Invalid staged removals.');
  return removed;
}

async function pruneAssets() {
  const review = await json(staging, '_review.json');
  const manifest = await snapshotJson('assets/manifest.json');
  const referenced = new Set(manifest.assets.flatMap(asset => [asset.original?.path, asset.web?.path, `assets/sources/${asset.id}.json`]).filter(Boolean));
  const sourceRecords = new Set(['assets/sources/accepted-candidates.json', 'assets/sources/registered-parties.json']);
  const unused = (await files(current)).filter(path => {
    if (referenced.has(path) || sourceRecords.has(path)) return false;
    return /^assets\/(originals|web)\//.test(path) || /^assets\/sources\/[^/]+\.json$/.test(path);
  });
  for (const path of unused) {
    if (hash(await readFile(file(current, path))) !== review.baseline[path]) throw new Error(`Asset changed since the review began: ${path}`);
    if (await optionalRead(file(staging, path))) throw new Error(`Review the unreferenced staged asset first: ${path}`);
  }
  review.removals = [...new Set([...(review.removals || []), ...unused])].sort();
  await saveJson(staging, '_review.json', review);
  await validate();
  await compare();
}

async function compare() {
  if (!(await optionalRead(file(staging, '_review.json')))) throw new Error('No staged review. Run fetch <group> first.');
  const review = await json(staging, '_review.json');
  const report = { createdAt: new Date().toISOString(), changes: await differences(), sourceFailures: review.failures, notes: 'Raw source changes are not automatically interpreted as new polls, candidates or official results. Review and edit staging JSON before promotion.' };
  await saveJson(staging, '_diff.json', report);
  console.log(JSON.stringify(report, null, 2));
}

async function snapshotJson(path) {
  const staged = await optionalRead(file(staging, path));
  return staged ? JSON.parse(staged.toString('utf8')) : json(current, path);
}

async function validate() {
  const election = await snapshotJson('election.json');
  const polls = await snapshotJson('polls.json');
  const removed = new Set(await reviewRemovals());
  if (!Array.isArray(election.districts) || election.districts.length !== election.districtCount || new Set(election.districts).size !== election.districtCount) throw new Error('District count or identities are invalid.');
  if (!Array.isArray(election.parties) || !election.parties.length) throw new Error('The party register is empty.');
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
  const manifest = await snapshotJson('assets/manifest.json');
  const assetsById = new Map(manifest.assets.map(asset => [asset.id, asset]));
  if (assetsById.size !== manifest.assets.length) throw new Error('Duplicate artwork IDs.');
  const candidateIds = new Set();
  for (const candidate of manifest.candidates) {
    if (!candidate.id || candidateIds.has(candidate.id) || !candidate.name || !partyIds.has(candidate.partyId) || !['accepted', 'party-announced'].includes(candidate.status) || !candidate.statusSource?.startsWith('https://')) throw new Error(`Invalid candidate record: ${candidate.id}`);
    candidateIds.add(candidate.id);
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
      if (asset.kind === 'portrait' && asset.candidateId !== candidate.id) throw new Error(`Portrait belongs to another candidate: ${candidate.id}`);
    }
  }
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
    if (removed.has(`assets/sources/${asset.id}.json`)) throw new Error(`Referenced artwork source is marked for removal: ${asset.id}`);
    for (const record of [asset.original, asset.web].filter(Boolean)) {
      if (removed.has(record.path)) throw new Error(`Referenced artwork is marked for removal: ${record.path}`);
      const bytes = await optionalRead(file(staging, record.path)) || await optionalRead(file(current, record.path));
      if (!bytes || hash(bytes) !== record.sha256) throw new Error(`Asset file and manifest disagree: ${record.path}`);
    }
  }
  const index = await snapshotJson('map/district-index.json');
  const display = await snapshotJson('map/districts-map.geojson');
  if (index.districts.length !== election.districtCount || display.features.length !== election.districtCount) throw new Error('Map and election district counts disagree.');
  for (const district of index.districts) {
    const bytes = await optionalRead(file(staging, district.path)) || await optionalRead(file(current, district.path));
    if (!bytes || hash(bytes) !== district.sha256) throw new Error(`District file and index disagree: ${district.name}`);
  }
}

async function promote() {
  if (!process.argv.includes('--approve')) throw new Error('Review staging first, then use promote --approve.');
  const review = await json(staging, '_review.json');
  if (review.failures.length) throw new Error('Resolve or explicitly review source failures in _review.json before promotion.');
  const currentPaths = await files(current);
  if (currentPaths.length !== Object.keys(review.baseline).length) throw new Error('Current data changed since staging began. Start a new review.');
  for (const path of currentPaths) if (hash(await readFile(file(current, path))) !== review.baseline[path]) throw new Error(`Current data changed since staging began: ${path}`);
  await validate();
  const changes = (await differences()).filter(change => !change.path.startsWith('sources/'));
  for (const change of changes) {
    if (!/^(election\.json$|polls\.json$|assets\/|map\/|districts\/|licenses\/)/.test(change.path)) throw new Error(`Not a publishable data path: ${change.path}`);
  }
  const provenanceBytes = await optionalRead(file(current, 'provenance.json'));
  const provenance = provenanceBytes ? JSON.parse(provenanceBytes.toString('utf8')) : { sources: {} };
  for (const source of review.fetched) {
    provenance.sources[source.id] = { url: source.url, finalUrl: source.finalUrl, retrievedAt: source.fetchedAt, sha256: source.sha256, contentType: source.contentType, ...(source.requestBody ? { method: 'POST', requestBody: source.requestBody } : {}) };
  }
  provenance.reviewedAt = new Date().toISOString();
  const next = new URL('data/.next/', root);
  const previous = new URL('data/.previous/', root);
  if ((await files(previous)).length) throw new Error('A previous promotion needs recovery before another can start.');
  const prepared = await files(next);
  if (prepared.length) {
    if (!process.argv.includes('--resume')) throw new Error('A prepared snapshot exists. Use promote --approve --resume to verify and resume it.');
    const expected = new Map(Object.entries(review.baseline));
    for (const change of changes) {
      if (change.status === 'removed') expected.delete(change.path);
      else expected.set(change.path, hash(await readFile(file(staging, change.path))));
    }
    expected.set('provenance.json', null);
    if (prepared.length !== expected.size) throw new Error('Prepared snapshot file set differs from this review.');
    for (const path of prepared) {
      if (!expected.has(path)) throw new Error(`Unexpected prepared file: ${path}`);
      if (path !== 'provenance.json' && hash(await readFile(file(next, path))) !== expected.get(path)) throw new Error(`Prepared snapshot differs from this review: ${path}`);
    }
    const preparedProvenance = await json(next, 'provenance.json');
    if (!Number.isFinite(Date.parse(preparedProvenance.reviewedAt)) || JSON.stringify({ ...preparedProvenance, reviewedAt: null }) !== JSON.stringify({ ...provenance, reviewedAt: null })) throw new Error('Prepared source provenance differs from this review.');
    console.log('Verified the retained prepared snapshot; resuming promotion.');
  } else {
    await cp(current, next, { recursive: true });
    for (const change of changes) {
      if (change.status === 'removed') await rm(file(next, change.path));
      else await save(next, change.path, await readFile(file(staging, change.path)));
    }
    await saveJson(next, 'provenance.json', provenance);
  }
  await rename(current, previous);
  try { await rename(next, current); } catch (error) { await rename(previous, current); throw error; }
  await rm(previous, { recursive: true });
  await rm(staging, { recursive: true });
  console.log(`Promoted ${changes.length} reviewed file changes and source provenance. Raw review downloads were not published. No commit or deployment was performed.`);
}

try {
  const command = process.argv[2] || 'help';
  if (command === 'fetch') await stage(process.argv[3] || 'polls');
  else if (command === 'source') await addSource(process.argv[3], process.argv[4]);
  else if (command === 'prune-assets') await pruneAssets();
  else if (command === 'diff') await compare();
  else if (command === 'promote') await promote();
  else if (command === 'discard') {
    if (!process.argv.includes('--approve')) throw new Error('Use discard --approve to remove only data/staging/.');
    await rm(staging, { recursive: true, force: true });
    console.log('Staging removed. Current data was not changed.');
  } else if (command === 'check') {
    await validate();
    console.log('Prod/staged data references and required fields are consistent.');
  } else if (command === 'help') {
    console.log('node tools/update-data.mjs fetch <polls|election|assets|map|licenses|all>\nnode tools/update-data.mjs source <id> <https-url>\nnode tools/update-data.mjs prune-assets\nnode tools/update-data.mjs diff\nnode tools/update-data.mjs check\nnode tools/update-data.mjs promote --approve\nnode tools/update-data.mjs discard --approve\n\nDownloads and asset removals go to data/staging/. Review the diff before promotion to data/prod/. No npm packages are required.');
  } else throw new Error(`Unknown command: ${command}`);
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
