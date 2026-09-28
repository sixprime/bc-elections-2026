import { translate, formatNumber } from './i18n.js';

export function comparisonWindow(count, width, { pinned = 0, index = 0, pinnedIndex = 0, minimumWidth = 200 } = {}) {
  const total = Math.max(0, Math.trunc(count));
  const capacity = Math.min(total, Math.max(1, Math.floor(Math.max(0, width) / minimumWidth)));
  const pinnedCount = Math.min(total, Math.max(0, Math.trunc(pinned)));
  const movingCount = total - pinnedCount;
  const pinnedVisible = Math.min(pinnedCount, Math.max(0, capacity - Number(movingCount > 0)));
  const pinnedMaximumStart = Math.max(0, pinnedCount - pinnedVisible);
  const pinnedStart = Math.min(pinnedMaximumStart, Math.max(0, Math.trunc(pinnedIndex)));
  const visible = capacity - pinnedVisible;
  const maximumStart = Math.max(0, movingCount - visible);
  const start = Math.min(maximumStart, Math.max(0, Math.trunc(index)));
  return {
    capacity,
    pinnedCount,
    pinnedVisible,
    pinnedStart,
    pinnedEnd: Math.min(pinnedCount, pinnedStart + pinnedVisible),
    pinnedMaximumStart,
    movingCount,
    visible,
    start,
    end: Math.min(movingCount, start + visible),
    maximumStart,
    columnWidth: capacity ? Math.max(minimumWidth, width / capacity) : minimumWidth,
    step: Math.max(1, visible - 1)
  };
}

export function mountComparison(container, preference) {
  const desktop = container.querySelector('[data-comparison-desktop]');
  const region = desktop?.querySelector('.comparison-table-region');
  if (!region) return () => {};
  const toolbar = desktop.querySelector('.comparison-navigation');
  const table = region.querySelector('table');
  const headingRow = table.querySelector('thead tr');
  const headers = [...headingRow.children];
  const rows = [headingRow, ...table.querySelectorAll('[data-comparison-row]')];
  const columns = headers.map((header, index) => ({
    id: header.dataset.compareParty,
    name: header.querySelector('.comparison-party-name').textContent,
    cells: rows.map(row => row.children[index])
  }));
  const previous = desktop.querySelector('[data-comparison-move="previous"]');
  const next = desktop.querySelector('[data-comparison-move="next"]');
  const pinChoice = desktop.querySelector('.comparison-pin-choice');
  const pins = [...pinChoice.querySelectorAll('[data-comparison-pin]')];
  const pinnedNavigation = desktop.querySelector('.comparison-pin-navigation');
  const pinnedPrevious = desktop.querySelector('[data-comparison-pin-move="previous"]');
  const pinnedNext = desktop.querySelector('[data-comparison-pin-move="next"]');
  const pinnedRange = desktop.querySelector('[data-comparison-pinned-range]');
  const range = desktop.querySelector('[data-comparison-range]');
  const announcement = desktop.querySelector('[data-comparison-announcement]');
  const rail = desktop.querySelector('.comparison-scrollbar');
  const railTrack = rail.firstElementChild;
  const abort = new AbortController();
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
  let geometry;
  let ordered = columns;
  let lastWidth = 0;
  let animationFrame;
  let announceTimer;
  let pendingIndex = null;
  let synchronizedRailLeft = 0;
  let pinPointerDown = false;
  let pinFocusFrame;
  let disposed = false;

  preference.mode = preference.mode === 'pages' ? 'pages' : 'scroll';
  preference.index = Number.isFinite(preference.index) ? preference.index : 0;
  preference.pinnedIndex = Number.isFinite(preference.pinnedIndex) ? preference.pinnedIndex : 0;
  preference.pinnedIds = columns.filter(column => preference.pinnedIds?.includes(column.id)).map(column => column.id);

  function rangeText() {
    if (!geometry) return '';
    if (!geometry.movingCount) return translate('All parties pinned');
    const values = { start: formatNumber(geometry.start + 1), end: formatNumber(geometry.end), total: formatNumber(geometry.movingCount) };
    if (geometry.pinnedCount === 1) return translate('{party} pinned · {start}–{end} of {total} other parties', { ...values, party: ordered[0].name });
    if (geometry.pinnedCount) return translate('{count} pinned · {start}–{end} of {total} other parties', { ...values, count: formatNumber(geometry.pinnedCount) });
    return translate('Parties {start}–{end} of {total}', values);
  }

  function pinnedRangeText() {
    if (!geometry?.pinnedCount) return '';
    return translate('Pinned parties {start}–{end} of {total}', { start: formatNumber(geometry.pinnedStart + 1), end: formatNumber(geometry.pinnedEnd), total: formatNumber(geometry.pinnedCount) });
  }

  function updateControls(announce = false) {
    if (!geometry) return;
    previous.setAttribute('aria-disabled', String(geometry.start === 0));
    next.setAttribute('aria-disabled', String(geometry.start === geometry.maximumStart));
    previous.hidden = next.hidden = geometry.movingCount === 0;
    pinnedPrevious.setAttribute('aria-disabled', String(geometry.pinnedStart === 0));
    pinnedNext.setAttribute('aria-disabled', String(geometry.pinnedStart === geometry.pinnedMaximumStart));
    pinnedNavigation.hidden = geometry.pinnedMaximumStart === 0;
    pinnedRange.textContent = pinnedRangeText();
    pinChoice.querySelector('summary').textContent = translate('Pinned parties ({count})', { count: formatNumber(geometry.pinnedCount) });
    for (const input of pins) input.checked = preference.pinnedIds.includes(input.dataset.comparisonPin);
    range.textContent = rangeText();
    desktop.dataset.moreBefore = String(geometry.start > 0);
    desktop.dataset.moreAfter = String(geometry.start < geometry.maximumStart);
    if (announce) {
      clearTimeout(announceTimer);
      announceTimer = setTimeout(() => { announcement.textContent = geometry.pinnedMaximumStart ? `${pinnedRangeText()} · ${rangeText()}` : rangeText(); }, 180);
    }
  }

  function orderColumns() {
    const selected = new Set(preference.pinnedIds);
    ordered = [...columns.filter(column => selected.has(column.id)), ...columns.filter(column => !selected.has(column.id))];
  }

  function setPinned(ids) {
    preference.pinnedIds = ids;
    preference.index = 0;
    preference.pinnedIndex = 0;
    pendingIndex = null;
    orderColumns();
    layout(true);
  }

  function layout(announce = false) {
    const width = region.clientWidth;
    if (!width) return;
    cancelAnimationFrame(animationFrame);
    const focused = table.contains(document.activeElement) ? document.activeElement : null;
    geometry = comparisonWindow(columns.length, width, { pinned: preference.pinnedIds.length, index: preference.index, pinnedIndex: preference.pinnedIndex });
    preference.index = geometry.start;
    preference.pinnedIndex = geometry.pinnedStart;
    const paged = preference.mode === 'pages';
    desktop.dataset.presentation = preference.mode;
    desktop.style.setProperty('--comparison-column-width', `${geometry.columnWidth}px`);
    desktop.style.setProperty('--comparison-pinned-width', `${geometry.pinnedVisible * geometry.columnWidth}px`);
    const pinnedColumns = ordered.slice(geometry.pinnedStart, geometry.pinnedEnd);
    const movingColumns = ordered.slice(geometry.pinnedCount);
    const rendered = [...pinnedColumns, ...(paged ? movingColumns.slice(geometry.start, geometry.end) : movingColumns)];
    for (let rowIndex = 0; rowIndex < rows.length; rowIndex += 1) rows[rowIndex].replaceChildren(...rendered.map(column => column.cells[rowIndex]));
    for (const column of ordered) {
      const pinnedPosition = pinnedColumns.indexOf(column);
      const pinned = pinnedPosition !== -1;
      for (const cell of column.cells) {
        cell.classList.toggle('comparison-pinned', pinned);
        if (pinned) cell.style.setProperty('--comparison-pin-offset', `${pinnedPosition * geometry.columnWidth}px`);
        else cell.style.removeProperty('--comparison-pin-offset');
      }
      const marker = column.cells[0].querySelector('.comparison-pin-marker');
      if (marker) marker.hidden = !pinned;
    }
    const renderedCount = rendered.length;
    region.style.setProperty('--comparison-columns', String(renderedCount));
    const tableWidth = renderedCount * geometry.columnWidth;
    table.style.width = `${tableWidth}px`;
    table.style.minWidth = `${tableWidth}px`;
    for (const title of table.querySelectorAll('.comparison-row-title th')) title.colSpan = renderedCount;
    region.classList.toggle('comparison-table-region-fit', paged || geometry.maximumStart === 0);
    rail.hidden = paged || geometry.maximumStart === 0;
    railTrack.style.width = `${tableWidth}px`;
    region.scrollTo({ left: paged ? 0 : geometry.start * geometry.columnWidth, behavior: 'instant' });
    rail.scrollLeft = region.scrollLeft;
    synchronizedRailLeft = rail.scrollLeft;
    desktop.style.setProperty('--comparison-toolbar-height', `${toolbar.getBoundingClientRect().height}px`);
    for (const input of desktop.querySelectorAll('[data-comparison-mode]')) input.checked = input.value === preference.mode;
    updateControls(announce);
    if (focused) {
      const target = focused.isConnected ? focused : region;
      target.focus({ preventScroll: true });
      if (!paged) target.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'instant' });
    }
  }

  function moveTo(index) {
    if (!geometry || !region.clientWidth) return;
    const destination = Math.min(geometry.maximumStart, Math.max(0, index));
    if (destination === geometry.start && pendingIndex === null) return;
    preference.index = destination;
    if (preference.mode === 'pages') {
      layout(true);
    } else {
      pendingIndex = destination;
      region.scrollTo({ left: destination * geometry.columnWidth, behavior: reducedMotion.matches ? 'instant' : 'smooth' });
    }
  }

  function movePinnedTo(index) {
    if (!geometry || !region.clientWidth) return;
    const destination = Math.min(geometry.pinnedMaximumStart, Math.max(0, index));
    if (destination === geometry.pinnedStart) return;
    preference.pinnedIndex = destination;
    pendingIndex = null;
    layout(true);
  }

  function trackScroll() {
    if (!geometry || !region.clientWidth || preference.mode !== 'scroll') return;
    cancelAnimationFrame(animationFrame);
    animationFrame = requestAnimationFrame(() => {
      preference.index = Math.min(geometry.maximumStart, Math.max(0, Math.round(region.scrollLeft / geometry.columnWidth)));
      geometry = comparisonWindow(columns.length, region.clientWidth, { pinned: preference.pinnedIds.length, index: preference.index, pinnedIndex: preference.pinnedIndex });
      if (pendingIndex !== null && Math.abs(region.scrollLeft - pendingIndex * geometry.columnWidth) < 1) pendingIndex = null;
      if (Math.abs(rail.scrollLeft - region.scrollLeft) > 1) {
        rail.scrollLeft = region.scrollLeft;
        synchronizedRailLeft = rail.scrollLeft;
      }
      updateControls(true);
    });
  }

  toolbar.addEventListener('click', event => {
    const pinAction = event.target.closest('[data-comparison-pin-action]');
    if (pinAction) {
      if (pinAction.dataset.comparisonPinAction === 'all') setPinned(columns.map(column => column.id));
      else if (pinAction.dataset.comparisonPinAction === 'clear') setPinned([]);
      return;
    }
    const pinnedButton = event.target.closest('[data-comparison-pin-move]');
    if (pinnedButton) {
      if (pinnedButton.getAttribute('aria-disabled') === 'true' || !geometry) return;
      movePinnedTo(geometry.pinnedStart + (pinnedButton.dataset.comparisonPinMove === 'next' ? 1 : -1) * geometry.pinnedVisible);
      return;
    }
    const button = event.target.closest('[data-comparison-move]');
    if (!button || button.getAttribute('aria-disabled') === 'true' || !geometry) return;
    const step = preference.mode === 'pages' ? geometry.visible : geometry.step;
    const direction = button.dataset.comparisonMove === 'next' ? 1 : -1;
    moveTo((pendingIndex ?? geometry.start) + direction * step);
  }, { signal: abort.signal });

  toolbar.addEventListener('change', event => {
    if (event.target.matches('[data-comparison-pin]')) {
      setPinned(pins.filter(input => input.checked).map(input => input.dataset.comparisonPin));
      return;
    }
    if (!event.target.matches('[data-comparison-mode]')) return;
    preference.mode = event.target.value;
    pendingIndex = null;
    layout(true);
  }, { signal: abort.signal });

  pinChoice.addEventListener('keydown', event => {
    if (event.key !== 'Escape' || !pinChoice.open) return;
    event.preventDefault();
    event.stopPropagation();
    pinChoice.open = false;
    pinChoice.querySelector('summary').focus();
  }, { signal: abort.signal });

  function dismissPinChoiceOnFocusExit() {
    cancelAnimationFrame(pinFocusFrame);
    pinFocusFrame = requestAnimationFrame(() => {
      if (!pinPointerDown && !pinChoice.contains(document.activeElement)) pinChoice.open = false;
    });
  }

  function finishPinPointer() {
    if (!pinPointerDown) return;
    pinPointerDown = false;
    dismissPinChoiceOnFocusExit();
  }

  pinChoice.addEventListener('focusout', event => {
    if (!pinChoice.contains(event.relatedTarget)) dismissPinChoiceOnFocusExit();
  }, { signal: abort.signal });
  document.addEventListener('pointerdown', event => {
    pinPointerDown = pinChoice.contains(event.target);
    if (pinChoice.open && !pinPointerDown) pinChoice.open = false;
  }, { signal: abort.signal });
  document.addEventListener('pointerup', finishPinPointer, { signal: abort.signal });
  document.addEventListener('pointercancel', finishPinPointer, { signal: abort.signal });
  window.addEventListener('blur', finishPinPointer, { signal: abort.signal });

  region.addEventListener('keydown', event => {
    if (event.target !== region || !geometry || !['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    const pinnedOnly = geometry.movingCount === 0;
    const step = pinnedOnly ? geometry.pinnedVisible : preference.mode === 'pages' ? geometry.visible : 1;
    const position = pinnedOnly ? geometry.pinnedStart : pendingIndex ?? geometry.start;
    const maximumStart = pinnedOnly ? geometry.pinnedMaximumStart : geometry.maximumStart;
    const destination = event.key === 'Home' ? 0 : event.key === 'End' ? maximumStart : position + (event.key === 'ArrowRight' ? step : -step);
    if (pinnedOnly) movePinnedTo(destination);
    else moveTo(destination);
  }, { signal: abort.signal });

  region.addEventListener('scroll', trackScroll, { signal: abort.signal, passive: true });
  region.addEventListener('scrollend', () => { pendingIndex = null; trackScroll(); }, { signal: abort.signal });
  region.addEventListener('wheel', () => { pendingIndex = null; }, { signal: abort.signal, passive: true });
  region.addEventListener('pointerdown', () => { pendingIndex = null; }, { signal: abort.signal, passive: true });
  rail.addEventListener('scroll', () => {
    if (Math.abs(rail.scrollLeft - synchronizedRailLeft) <= 1) return;
    if (preference.mode !== 'scroll' || Math.abs(region.scrollLeft - rail.scrollLeft) <= 1) return;
    pendingIndex = null;
    region.scrollTo({ left: rail.scrollLeft, behavior: 'instant' });
  }, { signal: abort.signal, passive: true });

  const observer = new ResizeObserver(() => {
    const width = region.clientWidth;
    if (!width) { lastWidth = 0; return; }
    if (width === lastWidth) return;
    lastWidth = width;
    pendingIndex = null;
    layout();
  });
  observer.observe(region);
  orderColumns();
  layout();

  return () => {
    if (disposed) return;
    disposed = true;
    if (geometry && region.clientWidth && preference.mode === 'scroll') preference.index = Math.min(geometry.maximumStart, Math.max(0, Math.round(region.scrollLeft / geometry.columnWidth)));
    abort.abort();
    observer.disconnect();
    cancelAnimationFrame(animationFrame);
    cancelAnimationFrame(pinFocusFrame);
    clearTimeout(announceTimer);
  };
}
