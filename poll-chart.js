import { translate, formatDate, formatPercent, formatNumber } from './i18n.js';

const day = 86400000;
const timestamp = value => Date.parse(`${value}T12:00:00Z`);
const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]);
const text = (message, values) => escapeHtml(translate(message, values));
const dateLabel = value => formatDate(new Date(value), { month: 'short', day: 'numeric', year: 'numeric' });

export function pollSeries(polls, { pollster = 'all', months = 6 } = {}) {
  const range = [6, 12, 60, 120].includes(months) ? months : 6;
  const end = timestamp(polls.snapshotDate);
  const start = new Date(end);
  start.setUTCDate(1);
  start.setUTCMonth(start.getUTCMonth() - range);
  const releases = polls.releases.filter(release => {
    const fieldDate = timestamp(release.fieldEnd);
    return fieldDate >= start.getTime() && fieldDate <= end && timestamp(release.released) <= end &&
      (pollster === 'all' || release.pollster === pollster);
  }).sort((first, second) => first.fieldEnd.localeCompare(second.fieldEnd) || first.released.localeCompare(second.released));
  return { releases, start: start.getTime(), end, months: range };
}

function lineSegments(releases, partyId, elections) {
  const segments = [];
  let segment = [];
  for (const release of releases) {
    const previous = segment.at(-1);
    const hasValue = Number.isFinite(release.shares[partyId]);
    const longGap = previous && timestamp(release.fieldEnd) - timestamp(previous.fieldEnd) > 120 * day;
    const electionBreak = previous && elections.some(election => timestamp(election.date) > timestamp(previous.fieldEnd) && timestamp(election.date) <= timestamp(release.fieldEnd));
    if (!hasValue || longGap || electionBreak) {
      if (segment.length > 1) segments.push(segment);
      segment = [];
    }
    if (hasValue) segment.push(release);
  }
  if (segment.length > 1) segments.push(segment);
  return segments;
}

export function renderPollChart(polls, election, options = {}) {
  const { releases, start, end, months } = pollSeries(polls, options);
  const electionDate = timestamp(election.electionDate);
  const chartEnd = Math.max(end, electionDate);
  const left = 46, right = 858, top = 42, bottom = 306;
  const xPosition = time => left + (time - start) / Math.max(chartEnd - start, day) * (right - left);
  const yPosition = value => bottom - value / 60 * (bottom - top);
  const parties = [...election.parties, ...(polls.historicalParties || [])].filter(party => releases.some(release => Number.isFinite(release.shares[party.id])));
  const elections = (polls.electionDates || []).filter(item => timestamp(item.date) >= start && timestamp(item.date) <= end);
  const firms = [...new Set(releases.map(release => release.pollster))].sort();
  const dashes = ['', '8 4', '3 4', '12 4 3 4', '2 3'];
  const ticks = [];
  const tick = new Date(start);
  const yearly = months > 12;
  if (yearly) tick.setUTCFullYear(tick.getUTCFullYear() + 1, 0, 1);
  while (tick.getTime() <= chartEnd) {
    ticks.push({ time: tick.getTime(), label: formatDate(tick, { month: yearly ? undefined : 'short', year: yearly ? 'numeric' : months > 6 ? '2-digit' : undefined }) });
    tick.setUTCMonth(tick.getUTCMonth() + (yearly ? 12 : 1));
  }
  const lines = firms.map((firm, index) => {
    const firmReleases = releases.filter(release => release.pollster === firm);
    return parties.map(party => lineSegments(firmReleases, party.id, elections).map(segment => `<polyline data-poll-series="${escapeHtml(firm)}" points="${segment.map(release => `${xPosition(timestamp(release.fieldEnd))},${yPosition(release.shares[party.id])}`).join(' ')}" fill="none" stroke="${escapeHtml(party.color)}" stroke-width="2.2" stroke-dasharray="${dashes[index % dashes.length]}" opacity=".85"><title>${escapeHtml(firm)} / ${escapeHtml(party.ballot)}</title></polyline>`).join('')).join('');
  }).join('');
  const points = releases.map(release => parties.filter(party => Number.isFinite(release.shares[party.id])).map(party => `<circle cx="${xPosition(timestamp(release.fieldEnd))}" cy="${yPosition(release.shares[party.id])}" r="4" fill="${escapeHtml(party.color)}" stroke="#fff" stroke-width="1.5"><title>${escapeHtml(release.pollster)} / ${dateLabel(timestamp(release.fieldEnd))} / ${escapeHtml(party.ballot)} ${formatPercent(release.shares[party.id])}</title></circle>`).join('')).join('');
  let scenario = '';
  if (options.scenario && electionDate > end) {
    const cutoff = end - polls.summaryWindowDays * day;
    const recent = [...polls.releases].filter(release => timestamp(release.released) >= cutoff && timestamp(release.released) <= end).sort((first, second) => second.released.localeCompare(first.released));
    const newest = [...new Map([...recent].reverse().map(release => [release.pollster, release])).values()];
    scenario = parties.map(party => {
      const shares = newest.map(release => release.shares[party.id]).filter(Number.isFinite);
      if (shares.length < 2) return '';
      const mean = shares.reduce((total, value) => total + value, 0) / shares.length;
      return `<path data-poll-scenario="${escapeHtml(party.id)}" d="M${xPosition(end)} ${yPosition(mean)}H${xPosition(electionDate)}" fill="none" stroke="${escapeHtml(party.color)}" stroke-width="2" stroke-dasharray="5 5"><title>${text('No-change scenario / {party} {share} / not a forecast', { party: party.ballot, share: formatPercent(mean) })}</title></path>`;
    }).join('');
  }
  return `<div class="poll-chart-scroll" tabindex="0" role="region" aria-label="${text(months === 6 ? 'Six-month polling chart' : months === 12 ? 'One-year polling chart' : '{count}-year polling chart', { count: months / 12 })}">
    <svg class="poll-history-chart" viewBox="0 0 900 355" role="img" aria-labelledby="poll-chart-title poll-chart-description">
      <title id="poll-chart-title">${text('B.C. voting intention through {date}', { date: dateLabel(chartEnd) })}</title><desc id="poll-chart-description">${text('Party colours show voting intention. Lines connect observations from the same pollster only. The shaded area is after the source snapshot.')} ${text(options.scenario ? 'Dashed future lines hold the recent average unchanged; they are not a forecast.' : 'No forecast is shown.')}</desc>
      ${electionDate > end ? `<rect x="${xPosition(end)}" y="${top}" width="${right - xPosition(end)}" height="${bottom - top}" fill="#eef2f5"/>${right - xPosition(end) >= 55 ? `<text x="${(xPosition(end) + right) / 2}" y="24" text-anchor="middle" font-size="11" fill="#53697c">${text(options.scenario ? 'Scenario' : 'Future')}</text>` : ''}` : ''}
      ${[0, 10, 20, 30, 40, 50, 60].map(value => `<path d="M${left} ${yPosition(value)}H${right}" stroke="#dce5eb"/><text x="35" y="${yPosition(value) + 4}" text-anchor="end" font-size="11" fill="#53697c">${formatPercent(value,0)}</text>`).join('')}
      ${elections.map(item => `<g data-historical-election="${item.date}"><path d="M${xPosition(timestamp(item.date))} ${top}V${bottom}" stroke="#aab9c4" stroke-dasharray="3 5"/><text x="${xPosition(timestamp(item.date))}" y="27" text-anchor="middle" font-size="10" fill="#607889">${text(item.label)}</text></g>`).join('')}
      ${ticks.map(item => `<text x="${xPosition(item.time)}" y="330" text-anchor="middle" font-size="12" fill="#53697c">${item.label}</text>`).join('')}
      ${lines}${points}${scenario}
      <path d="M${xPosition(end)} ${top}V${bottom}" stroke="#7c8d9b" stroke-dasharray="4 4"/>
      ${electionDate > end ? `<text x="${right}" y="349" text-anchor="end" font-size="11" fill="#274a65">${text('Election / {date}', { date: dateLabel(electionDate) })}</text>` : ''}
      ${!releases.length ? `<text x="450" y="170" text-anchor="middle" font-size="15" fill="#637787">${text('No published polls in this selection')}</text>` : ''}
    </svg></div>
    <div class="chart-legend">${parties.map(party => `<span><i class="party-dot" style="--dot:${escapeHtml(party.color)}"></i><b>${escapeHtml(party.ballot)}</b></span>`).join('')}</div>
    <div class="pollster-legend">${firms.map((firm, index) => `<span><svg viewBox="0 0 30 8" width="30" height="8" aria-hidden="true"><path d="M0 4H30" stroke="currentColor" stroke-width="2" stroke-dasharray="${dashes[index % dashes.length]}"/></svg>${escapeHtml(firm)}</span>`).join('')}</div>
    <p class="poll-chart-note">${text('{count} published releases / {start} to {end}. Lines connect the same pollster, not a fitted polling average. Unreported shares, elections and gaps over 120 days break the lines.', { count: formatNumber(releases.length), start: dateLabel(start), end: dateLabel(end) })} ${months > 12 ? text('This is a selected historical archive, not a complete record of every poll. Historical BC Liberals are labelled separately from BC United and federal Liberals.') : ''}</p>
    ${options.scenario ? `<p class="poll-scenario-note">${text('No-change scenario: the latest two-or-more-pollster mean is held flat to election day. This is an assumption, not a forecast or confidence interval.')}</p>` : ''}`;
}
