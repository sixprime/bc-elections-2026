import { translate, formatNumber } from './i18n.js';

const columnChoices = [1, 2, 3, 4, 5, 6];

export function comparisonWindow(count, width, { pinned = 0, index = 0, pinnedIndex = 0, minimumWidth = 200, columns = 0 } = {}) {
  const total = Math.max(0, Math.trunc(count));
  const fitting = Math.max(1, Math.floor(Math.max(0, width) / minimumWidth));
  const capacity = Math.min(total, Number.isInteger(columns) && columns > 0 ? Math.min(columns, fitting) : fitting);
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
  const view = container.querySelector('[data-comparison-view]');
  const region = view?.querySelector('.comparison-table-region');
  if (!region) return () => {};
  const toolbar = view.querySelector('.comparison-navigation');
  const table = region.querySelector('table');
  const headingRow = table.querySelector('thead tr');
  const rows = [headingRow, ...table.querySelectorAll('[data-comparison-row]')];
  const rowList = view.querySelector('[data-comparison-rows]');
  const sections = new Map([...rowList.querySelectorAll('[data-row-compare-party]')].map(section => [section.dataset.rowCompareParty, section]));
  const columns = [...headingRow.children].map((header, index) => ({
    id: header.dataset.compareParty,
    name: header.querySelector('.comparison-party-name').textContent,
    cells: rows.map(row => row.children[index]),
    section: sections.get(header.dataset.compareParty)
  }));
  const count = container.querySelector('[data-comparison-count]');
  const empty = view.querySelector('[data-comparison-empty]');
  const columnsChoice = toolbar.querySelector('[data-comparison-columns]');
  const choices = [...toolbar.querySelectorAll('.comparison-choice')];
  const pinChoice = toolbar.querySelector('.comparison-pin-choice');
  const hideChoice = toolbar.querySelector('.comparison-hide-choice');
  const pins = [...pinChoice.querySelectorAll('[data-comparison-pin]')];
  const hides = [...hideChoice.querySelectorAll('[data-comparison-hide]')];
  const previous = toolbar.querySelector('[data-comparison-move="previous"]');
  const next = toolbar.querySelector('[data-comparison-move="next"]');
  const pinnedNavigation = toolbar.querySelector('.comparison-pin-navigation');
  const pinnedPrevious = toolbar.querySelector('[data-comparison-pin-move="previous"]');
  const pinnedNext = toolbar.querySelector('[data-comparison-pin-move="next"]');
  const pinnedRange = toolbar.querySelector('[data-comparison-pinned-range]');
  const range = toolbar.querySelector('[data-comparison-range]');
  const announcement = view.querySelector('[data-comparison-announcement]');
  const rail = toolbar.querySelector('.comparison-scrollbar');
  const railTrack = rail.firstElementChild;
  const abort = new AbortController();
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
  let geometry;
  let ordered = columns;
  let pinnedCount = 0;
  let lastWidth = 0;
  let animationFrame;
  let announceTimer;
  let pendingIndex = null;
  let synchronizedRailLeft = 0;
  let pointerActive = false;
  let choiceFocusFrame;
  let disposed = false;

  preference.layout = preference.layout === 'rows' ? 'rows' : 'columns';
  preference.columns = columnChoices.includes(Number(preference.columns)) ? Number(preference.columns) : 'auto';
  preference.mode = preference.mode === 'pages' ? 'pages' : 'scroll';
  preference.index = Number.isFinite(preference.index) ? preference.index : 0;
  preference.pinnedIndex = Number.isFinite(preference.pinnedIndex) ? preference.pinnedIndex : 0;
  preference.hiddenIds = Array.isArray(preference.hiddenIds) ? preference.hiddenIds : [];
  preference.pinnedIds = (Array.isArray(preference.pinnedIds) ? preference.pinnedIds : []).filter(id => !preference.hiddenIds.includes(id));

  const measure = width => comparisonWindow(ordered.length, width, { pinned: pinnedCount, index: preference.index, pinnedIndex: preference.pinnedIndex, columns: preference.columns === 'auto' ? 0 : preference.columns });

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
    range.textContent = rangeText();
    view.dataset.moreBefore = String(geometry.start > 0);
    view.dataset.moreAfter = String(geometry.start < geometry.maximumStart);
    if (announce) {
      clearTimeout(announceTimer);
      announceTimer = setTimeout(() => { announcement.textContent = geometry.pinnedMaximumStart ? `${pinnedRangeText()} · ${rangeText()}` : rangeText(); }, 180);
    }
  }

  function orderColumns() {
    const hidden = new Set(preference.hiddenIds);
    const pinned = new Set(preference.pinnedIds);
    const shown = columns.filter(column => !hidden.has(column.id));
    const pinnedColumns = shown.filter(column => pinned.has(column.id));
    ordered = [...pinnedColumns, ...shown.filter(column => !pinned.has(column.id))];
    pinnedCount = pinnedColumns.length;
  }

  function applyParties() {
    const hidden = new Set(preference.hiddenIds);
    const pinned = new Set(preference.pinnedIds);
    const sectionOrder = [...ordered, ...columns.filter(column => hidden.has(column.id))].map(column => column.section);
    if (sectionOrder.some((section, index) => rowList.children[index] !== section)) rowList.append(...sectionOrder);
    for (const column of columns) {
      column.section.hidden = hidden.has(column.id);
      column.section.querySelector('.comparison-pin-marker').hidden = !pinned.has(column.id);
    }
    for (const input of pins) {
      input.checked = pinned.has(input.dataset.comparisonPin);
      input.closest('label').hidden = hidden.has(input.dataset.comparisonPin);
    }
    for (const input of hides) input.checked = hidden.has(input.dataset.comparisonHide);
    pinChoice.querySelector('summary').textContent = translate('Pinned parties ({count})', { count: formatNumber(pinnedCount) });
    hideChoice.querySelector('summary').textContent = translate('Hidden parties ({count})', { count: formatNumber(columns.length - ordered.length) });
    count.textContent = translate(ordered.length === 1 ? '{count} party' : '{count} parties', { count: formatNumber(ordered.length) });
    empty.hidden = ordered.length > 0;
    view.dataset.empty = String(ordered.length === 0);
    view.dataset.layout = preference.layout;
    view.dataset.presentation = preference.mode;
    for (const input of toolbar.querySelectorAll('[data-comparison-layout]')) input.checked = input.value === preference.layout;
    for (const input of toolbar.querySelectorAll('[data-comparison-mode]')) input.checked = input.value === preference.mode;
    columnsChoice.value = String(preference.columns);
  }

  function setPinned(ids) {
    preference.pinnedIds = ids;
    preference.index = 0;
    preference.pinnedIndex = 0;
    pendingIndex = null;
    orderColumns();
    layout(true);
  }

  function setHidden(ids) {
    preference.hiddenIds = ids;
    preference.pinnedIds = preference.pinnedIds.filter(id => !ids.includes(id));
    pendingIndex = null;
    orderColumns();
    layout(true);
  }

  function layout(announce = false) {
    cancelAnimationFrame(animationFrame);
    applyParties();
    const width = region.clientWidth;
    if (!width) return;
    const focused = table.contains(document.activeElement) ? document.activeElement : null;
    geometry = measure(width);
    preference.index = geometry.start;
    preference.pinnedIndex = geometry.pinnedStart;
    const paged = preference.mode === 'pages';
    view.style.setProperty('--comparison-column-width', `${geometry.columnWidth}px`);
    view.style.setProperty('--comparison-pinned-width', `${geometry.pinnedVisible * geometry.columnWidth}px`);
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
      geometry = measure(region.clientWidth);
      if (pendingIndex !== null && Math.abs(region.scrollLeft - pendingIndex * geometry.columnWidth) < 1) pendingIndex = null;
      if (Math.abs(rail.scrollLeft - region.scrollLeft) > 1) {
        rail.scrollLeft = region.scrollLeft;
        synchronizedRailLeft = rail.scrollLeft;
      }
      updateControls(true);
    });
  }

  view.addEventListener('click', event => {
    const pinAction = event.target.closest('[data-comparison-pin-action]');
    if (pinAction) {
      setPinned(pinAction.dataset.comparisonPinAction === 'all' ? ordered.map(column => column.id) : []);
      return;
    }
    const hideAction = event.target.closest('[data-comparison-hide-action]');
    if (hideAction) {
      const fromEmptyState = empty.contains(hideAction);
      setHidden(hideAction.dataset.comparisonHideAction === 'all' ? columns.map(column => column.id) : []);
      if (fromEmptyState) hideChoice.querySelector('summary').focus();
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
    const target = event.target;
    if (target.matches('[data-comparison-pin]')) {
      setPinned(pins.filter(input => input.checked).map(input => input.dataset.comparisonPin));
      return;
    }
    if (target.matches('[data-comparison-hide]')) {
      setHidden(hides.filter(input => input.checked).map(input => input.dataset.comparisonHide));
      return;
    }
    if (target.matches('[data-comparison-layout]')) preference.layout = target.value === 'rows' ? 'rows' : 'columns';
    else if (target.matches('[data-comparison-columns]')) preference.columns = columnChoices.includes(Number(target.value)) ? Number(target.value) : 'auto';
    else if (target.matches('[data-comparison-mode]')) preference.mode = target.value === 'pages' ? 'pages' : 'scroll';
    else return;
    pendingIndex = null;
    layout(true);
  }, { signal: abort.signal });

  function placeChoicePanel(choice) {
    const panel = choice.querySelector('.comparison-choice-panel');
    panel.style.removeProperty('left');
    const bounds = panel.getBoundingClientRect();
    const limit = document.documentElement.clientWidth - 12;
    if (bounds.right > limit) panel.style.left = `${Math.max(limit - bounds.right, 12 - bounds.left)}px`;
  }

  function dismissChoicesOnFocusExit() {
    cancelAnimationFrame(choiceFocusFrame);
    choiceFocusFrame = requestAnimationFrame(() => {
      if (pointerActive) return;
      for (const choice of choices) if (choice.open && !choice.contains(document.activeElement)) choice.open = false;
    });
  }

  function finishChoicePointer() {
    if (!pointerActive) return;
    pointerActive = false;
    dismissChoicesOnFocusExit();
  }

  for (const choice of choices) {
    choice.querySelector('summary').addEventListener('click', event => {
      event.preventDefault();
      const open = !choice.open;
      for (const other of choices) if (other !== choice) other.open = false;
      choice.open = open;
      if (open) placeChoicePanel(choice);
    }, { signal: abort.signal });
    choice.addEventListener('keydown', event => {
      if (event.key !== 'Escape' || !choice.open) return;
      event.preventDefault();
      event.stopPropagation();
      choice.open = false;
      choice.querySelector('summary').focus();
    }, { signal: abort.signal });
    choice.addEventListener('focusout', event => {
      if (!choice.contains(event.relatedTarget)) dismissChoicesOnFocusExit();
    }, { signal: abort.signal });
  }
  document.addEventListener('pointerdown', () => { pointerActive = true; }, { signal: abort.signal });
  document.addEventListener('click', event => {
    for (const choice of choices) if (choice.open && !choice.contains(event.target)) choice.open = false;
  }, { signal: abort.signal });
  document.addEventListener('pointerup', finishChoicePointer, { signal: abort.signal });
  document.addEventListener('pointercancel', finishChoicePointer, { signal: abort.signal });
  window.addEventListener('blur', finishChoicePointer, { signal: abort.signal });

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
  const toolbarObserver = new ResizeObserver(() => view.style.setProperty('--comparison-toolbar-height', `${toolbar.getBoundingClientRect().height}px`));
  observer.observe(region);
  toolbarObserver.observe(toolbar);
  orderColumns();
  layout();

  return () => {
    if (disposed) return;
    disposed = true;
    if (geometry && region.clientWidth && preference.mode === 'scroll') preference.index = Math.min(geometry.maximumStart, Math.max(0, Math.round(region.scrollLeft / geometry.columnWidth)));
    abort.abort();
    observer.disconnect();
    toolbarObserver.disconnect();
    cancelAnimationFrame(animationFrame);
    cancelAnimationFrame(choiceFocusFrame);
    clearTimeout(announceTimer);
  };
}
