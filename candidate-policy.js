import { translate } from './i18n.js';

export function candidateRoster(manifest, now = Date.now()) {
  const snapshot = manifest?.candidateSnapshot;
  const deadline = Date.parse(snapshot?.nominationDeadline);
  if (!Number.isFinite(deadline) || !Array.isArray(manifest?.candidates)) return { phase: 'awaiting-official-list', candidates: [] };
  if (now < deadline) return { phase: 'nominations-open', candidates: manifest.candidates.filter(candidate => ['accepted', 'party-announced'].includes(candidate.status)) };
  const verifiedAt = Date.parse(snapshot.officialListCheckedAt);
  const final = snapshot.officialListFinal === true && Number.isFinite(verifiedAt) && verifiedAt >= deadline && verifiedAt <= now && /^https:\/\/(?:www\.)?elections\.bc\.ca\//.test(snapshot.officialSource || '') && /^[a-f0-9]{64}$/.test(snapshot.officialSourceSha256 || '') && Array.isArray(snapshot.officialCandidateIds);
  if (!final) return { phase: 'awaiting-official-list', candidates: [] };
  const officialIds = new Set(snapshot.officialCandidateIds);
  const candidates = manifest.candidates.filter(candidate => candidate.status === 'accepted' && officialIds.has(candidate.id) && candidate.statusSourceType === 'elections-bc' && candidate.statusSource === snapshot.officialSource && candidate.statusSourceSha256 === snapshot.officialSourceSha256);
  if (!officialIds.size || officialIds.size !== snapshot.officialCandidateIds.length || candidates.length !== officialIds.size) return { phase: 'awaiting-official-list', candidates: [] };
  return { phase: 'final-ballot', candidates };
}

export function candidateStatusLabel(candidate, phase) {
  if (phase === 'final-ballot') return translate('On the Elections BC ballot');
  return translate(candidate.status === 'accepted' ? 'Accepted nomination' : 'Party-announced');
}

export function candidateRosterNote(phase) {
  if (phase === 'final-ballot') return translate('Final ballot candidates from Elections BC. Party announcements do not override the official list.');
  if (phase === 'awaiting-official-list') return translate('Nominations have closed. The final Elections BC list has not yet been verified in this snapshot. Party announcements are not ballot confirmations.');
  return translate('Until October 3 at 1 p.m. Pacific, accepted nominations and official party announcements, including press releases, are listed separately. This is not the final ballot.');
}

export function atNominationDeadline(manifest, callback) {
  const remaining = Date.parse(manifest?.candidateSnapshot?.nominationDeadline) - Date.now();
  if (remaining > 0 && remaining < 2147483647) return setTimeout(callback, remaining + 1);
  return null;
}
