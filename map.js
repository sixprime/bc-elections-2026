import { requestLocation } from './location.js';
import { matchDistrict, nearbyDistricts } from './geography.js';
import { searchAddresses, addressQuery } from './address.js';
import { createIcons, LocateFixed, Maximize, Layers, ArrowUpRight, Search, X } from './vendor/icons.js';
import { translate, translateElements, formatNumber, formatPercent } from './i18n.js';
import { currentRoute, routeHref, navigate } from './routes.js';

const maps = new Set();
const featureCache = new Map();
let displayRequest;
let indexRequest;
let deviceLocation;
let locating = false;
let selectedStyle = 'street';
let addressSearchTimer;
let addressRequest;
let addressGeneration = 0;
let addressSuggestions = [];
let activeAddress = -1;
let finderOpener;
let finderReady = false;
let locationNotice;

async function readData(path) {
  const response = await fetch(new URL(`./data/${path}`, import.meta.url));
  if (!response.ok) throw new Error('District data could not be loaded. Please try again.');
  return response.json();
}

function loadDisplay() {
  if (!displayRequest) displayRequest = readData('map/districts-map.geojson').catch(error => { displayRequest = null; throw error; });
  return displayRequest;
}

function loadIndex() {
  if (!indexRequest) indexRequest = readData('map/district-index.json').catch(error => { indexRequest = null; throw error; });
  return indexRequest;
}

function loadFeature(district) {
  if (!featureCache.has(district.slug)) {
    featureCache.set(district.slug, readData(district.path).catch(error => { featureCache.delete(district.slug); throw error; }));
  }
  return featureCache.get(district.slug);
}

export function refreshMapIcons() {
  createIcons({ icons: { LocateFixed, Maximize, Layers, ArrowUpRight, Search, X }, attrs: { 'aria-hidden': 'true', 'stroke-width': 1.8 } });
}

export function refreshMapLanguage() {
  for (const entry of maps) {
    translateElements(entry.shell);
    updateMapContext(entry);
    const legend = entry.shell.querySelector('[data-map-results-legend]');
    if (legend) resultLegend(legend, entry.index.districts, entry.results);
    const count = entry.shell.querySelector('[data-map-count]');
    if (count) count.textContent = translate('{count} ridings', { count: formatNumber(entry.index.districts.length) });
    for (const [selector, message] of [['.leaflet-control-zoom-in', 'Zoom in'], ['.leaflet-control-zoom-out', 'Zoom out']]) {
      const control = entry.surface.querySelector(selector);
      control?.setAttribute('title', translate(message));
      control?.setAttribute('aria-label', translate(message));
    }
    entry.districts?.eachLayer(layer => { if (layer.isTooltipOpen()) layer.getTooltip().update(); });
  }
  if (locationNotice) showLocationStatus(locationNotice.message, locationNotice.district, locationNotice.values);
}

export function disposeMaps(retainedElement) {
  for (const entry of maps) {
    if (retainedElement?.contains(entry.surface)) continue;
    entry.map.stop();
    entry.map.remove();
    maps.delete(entry);
  }
}

export function updateRidingMap(element, slug) {
  const entry = [...maps].find(entry => element.contains(entry.surface));
  if (!entry || entry.selectedSlug === slug) return;
  if (!entry.index.districts.some(district => district.slug === slug)) return;
  entry.districts?.eachLayer(layer => layer.closeTooltip());
  entry.selectedSlug = slug;
  entry.surface.dataset.selectedRiding = slug;
  updateMapContext(entry);
  resetDistrictStyles(entry);
  entry.map.invalidateSize({ pan: false, animate: false });
}

function updateMapContext(entry) {
  const district = entry.index.districts.find(district => district.slug === entry.selectedSlug);
  const title = entry.shell.querySelector('[data-map-title]');
  title.textContent = district?.name || translate('British Columbia');
  if (district) title.lang = 'en-CA';
  else title.removeAttribute('lang');
  entry.surface.setAttribute('aria-label', district ? translate('Map of {riding}', { riding: district.name }) : translate('British Columbia 2024 winning party map'));
}

function drawPosition(entry, center = false) {
  if (!deviceLocation) return;
  entry.positionLayer?.remove();
  const coordinate = [deviceLocation.latitude, deviceLocation.longitude];
  entry.positionLayer = L.layerGroup([
    L.circle(coordinate, { radius: Math.min(deviceLocation.accuracy, 100000), color: '#1574d1', weight: 1, fillOpacity: 0.1, interactive: false }),
    L.circleMarker(coordinate, { radius: 7, color: '#fff', weight: 3, fillColor: '#1574d1', fillOpacity: 1, interactive: false })
  ]).addTo(entry.map);
  if (center) entry.map.setView(coordinate, deviceLocation.accuracy > 1000 ? 10 : 13, { animate: false });
}

function textNode(value) {
  const element = document.createElement('span');
  element.textContent = value;
  return element;
}

function winningResults(election) {
  const results = new Map();
  for (const [district, record] of Object.entries(election?.featuredDistricts2024 || {})) {
    if (!record.votes?.length || !record.validVotes) continue;
    const ranked = [...record.votes].sort((first, second) => second.votes - first.votes);
    const winner = ranked[0];
    const party = election.parties.find(party => party.id === winner.party);
    results.set(district, {
      name: winner.name,
      partyId: winner.party,
      label: party?.ballot || (winner.party === 'independent' ? 'Independent' : 'Unaffiliated'),
      color: party?.color || '#77858e',
      share: winner.votes / record.validVotes * 100,
      margin: winner.votes - (ranked[1]?.votes || 0)
    });
  }
  return results;
}

function resultLegend(element, districts, results) {
  const counts = new Map();
  let missing = 0;
  for (const district of districts) {
    const result = results.get(district.name);
    if (!result) { missing += 1; continue; }
    if (!counts.has(result.partyId)) counts.set(result.partyId, { ...result, count: 0 });
    counts.get(result.partyId).count += 1;
  }
  const items = [...counts.values()].sort((first, second) => second.count - first.count);
  if (missing) items.push({ partyId: 'unavailable', label: 'Not loaded', color: '#77858e', count: missing });
  element.replaceChildren(...items.map(item => {
    const row = document.createElement('span');
    row.className = 'map-legend-item';
    row.setAttribute('role', 'listitem');
    row.setAttribute('aria-label', translate('{party}: {count} ridings', { party: translate(item.label), count: formatNumber(item.count) }));
    row.dataset.party = item.partyId;
    const swatch = document.createElement('i');
    swatch.className = 'map-legend-swatch';
    swatch.style.setProperty('--party', item.color);
    swatch.setAttribute('aria-hidden', 'true');
    const count = document.createElement('b');
    count.textContent = formatNumber(item.count);
    row.append(swatch, textNode(translate(item.label)), count);
    return row;
  }));
}

function resultTooltip(name, result) {
  const content = document.createElement('div');
  content.className = 'map-result-tooltip';
  const heading = document.createElement('strong');
  heading.textContent = name;
  heading.lang = 'en-CA';
  content.append(heading);
  if (result) {
    content.append(textNode(result.name), textNode(`${translate(result.label)} / ${formatPercent(result.share)}`), textNode(translate('2024 / {count}-vote margin', { count: formatNumber(result.margin) })));
  } else content.append(textNode(translate('2024 result not in this snapshot')));
  return content;
}

function resetDistrictStyles(entry) {
  entry.boundaryHalo?.eachLayer(layer => entry.boundaryHalo.resetStyle(layer));
  entry.districts?.eachLayer(layer => entry.districts.resetStyle(layer));
}

function setMapCaption(entry, message) {
  entry.caption.dataset.i18n = message;
  entry.caption.textContent = translate(message);
}

function setBasemap(entry, style) {
  entry.basemap?.remove();
  entry.mode = style;
  const tileOptions = { maxZoom: 18, crossOrigin: true, updateWhenIdle: true, keepBuffer: 1 };
  const eox = 'https://tiles.maps.eox.at/wmts/1.0.0/';
  const terrainCredit = 'Data &copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors and others; rendering &copy; <a href="https://maps.eox.at/">EOX</a>';
  let layers;
  if (style === 'street') {
    layers = [L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      ...tileOptions, maxNativeZoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
    })];
    setMapCaption(entry, 'OpenStreetMap');
  } else {
    const imagery = style === 'satellite';
    const base = imagery ? 's2cloudless-2024_3857' : 'terrain-light_3857';
    const overlay = imagery ? 'overlay_base_bright_3857' : 'overlay_base_3857';
    layers = [
      L.tileLayer(`${eox}${base}/default/g/{z}/{y}/{x}.jpg`, {
        ...tileOptions, maxNativeZoom: 13,
        attribution: imagery ? '<a href="https://cloudless.eox.at/">Sentinel-2 cloudless</a> &copy; <a href="https://maps.eox.at/">EOX</a> (2024), contains modified Copernicus Sentinel data (2024)' : terrainCredit
      }),
      L.tileLayer(`${eox}${overlay}/default/g/{z}/{y}/{x}.png`, {
        ...tileOptions, maxNativeZoom: 13, pane: 'labels', attribution: terrainCredit
      })
    ];
    setMapCaption(entry, imagery ? 'Sentinel-2 / 2024 / 10 m imagery' : 'EOX terrain / OpenStreetMap');
  }
  entry.surface.dataset.basemap = style;
  delete entry.surface.dataset.tilesReady;
  let loaded = 0;
  let failed = 0;
  layers[0].on('tileload', () => {
    if (entry.mode !== style) return;
    loaded += 1;
    entry.surface.dataset.tilesReady = String(loaded);
  });
  layers[0].on('tileerror', () => {
    if (entry.mode !== style) return;
    failed += 1;
    if (failed >= 3 && loaded === 0) {
      setMapCaption(entry, style === 'street' ? 'Map tiles unavailable. Riding selection still works.' : 'Imagery unavailable. Try Streets.');
    }
  });
  entry.basemap = L.layerGroup(layers).addTo(entry.map);
  resetDistrictStyles(entry);
  entry.shell.querySelectorAll('[data-map-style]').forEach(button => {
    const active = button.dataset.mapStyle === style;
    button.classList.toggle('selected', active);
    button.setAttribute('aria-pressed', String(active));
  });
}

export async function mountMaps(election) {
  refreshMapIcons();
  const surfaces = [...document.querySelectorAll('[data-riding-map]')];
  if (!surfaces.length) return;
  try {
    const index = await loadIndex();
    const results = winningResults(election);
    for (const surface of surfaces) {
      if (!surface.isConnected || surface.dataset.basemapReady) continue;
      const shell = surface.closest('.map-section');
      const map = L.map(surface, { preferCanvas: true, minZoom: 4, maxZoom: 18, scrollWheelZoom: true, zoomControl: false, attributionControl: true });
      map.createPane('district-halos');
      map.getPane('district-halos').style.zIndex = '390';
      map.getPane('district-halos').style.pointerEvents = 'none';
      map.createPane('labels');
      map.getPane('labels').style.zIndex = '450';
      map.getPane('labels').style.pointerEvents = 'none';
      map.attributionControl.setPrefix('<a href="https://leafletjs.com/">Leaflet</a>');
      map.attributionControl.addAttribution('Contains information licenced under the <a href="https://www.elections.bc.ca/docs/EBC-Open-Data-Licence.pdf">Elections BC Open Data Licence</a>');
      L.control.zoom({ position: 'bottomright', zoomInTitle: translate('Zoom in'), zoomOutTitle: translate('Zoom out') }).addTo(map);
      L.control.scale({ imperial: false, position: 'bottomleft' }).addTo(map);
      const hasResults = surface.hasAttribute('data-map-results');
      const entry = { map, shell, surface, index, results, selectedSlug: surface.dataset.selectedRiding, hasResults, showResults: hasResults, showBoundaries: true, caption: shell.querySelector('[data-map-caption]') };
      surface.querySelector('.leaflet-control-attribution').lang = 'en';
      const legend = shell.querySelector('[data-map-results-legend]');
      const resultToggle = shell.querySelector('[data-map-results-toggle]');
      if (legend) resultLegend(legend, index.districts, results);
      maps.add(entry);
      updateMapContext(entry);
      setBasemap(entry, selectedStyle);
      const selectedSlug = surface.dataset.selectedRiding;
      const bounds = coordinates => [[coordinates[1], coordinates[0]], [coordinates[3], coordinates[2]]];
      const wholeProvince = bounds(index.bbox);
      const selected = index.districts.find(district => district.slug === selectedSlug);
      map.fitBounds(selected ? bounds(selected.bbox) : wholeProvince, { padding: [24, 24], maxZoom: selected ? 13 : 7, animate: false });
      if (deviceLocation) drawPosition(entry, !selectedSlug);
      shell.querySelector('[data-map-reset]').addEventListener('click', () => map.fitBounds(wholeProvince, { padding: [24, 24] }));
      const boundaryButton = shell.querySelector('[data-map-boundaries]');
      boundaryButton.disabled = true;
      boundaryButton.addEventListener('click', event => {
        entry.showBoundaries = !entry.showBoundaries;
        if (!entry.hasResults) {
          if (entry.showBoundaries) entry.districts.addTo(map); else entry.districts.remove();
        }
        resetDistrictStyles(entry);
        event.currentTarget.setAttribute('aria-pressed', String(entry.showBoundaries));
      });
      resultToggle?.addEventListener('change', () => {
        entry.showResults = resultToggle.checked;
        legend.classList.toggle('inactive', !entry.showResults);
        resetDistrictStyles(entry);
      });
      shell.querySelectorAll('[data-map-style]').forEach(button => button.addEventListener('click', () => {
        selectedStyle = button.dataset.mapStyle;
        setBasemap(entry, selectedStyle);
      }));
      surface.dataset.basemapReady = 'true';
      const districts = await loadDisplay();
      if (!surface.isConnected || !maps.has(entry)) continue;
      entry.boundaryHalo = L.geoJSON(districts, {
        pane: 'district-halos',
        interactive: false,
        style: feature => ({
          stroke: entry.showBoundaries,
          color: '#fff',
          weight: feature.properties.slug === entry.selectedSlug ? 6 : 4.4,
          opacity: 0.9,
          fill: false
        })
      }).addTo(map);
      const style = feature => {
        const selected = feature.properties.slug === entry.selectedSlug;
        const result = entry.showResults ? results.get(feature.properties.name) : null;
        return {
          stroke: !entry.hasResults || entry.showBoundaries,
          color: selected ? '#1269bd' : '#263e4a',
          weight: selected ? 3 : 1.6,
          opacity: 0.95,
          fillColor: result?.color || (entry.showResults ? '#77858e' : entry.mode === 'satellite' ? '#f3d14d' : '#1269bd'),
          fillOpacity: result ? 0.24 : entry.showResults ? 0.06 : selected ? 0.14 : 0.015
        };
      };
      entry.districts = L.geoJSON(districts, {
        style,
        onEachFeature(feature, layer) {
          const result = results.get(feature.properties.name);
          layer.bindTooltip(() => hasResults ? resultTooltip(feature.properties.name, result) : textNode(feature.properties.name), { sticky: true, direction: 'top', className: 'riding-tooltip' });
          layer.on('mouseover', () => layer.setStyle({ stroke: true, weight: 2.8, opacity: 1, fillOpacity: entry.showResults && result ? 0.34 : 0.14, color: '#172f3c' }));
          layer.on('mouseout', () => entry.districts.resetStyle(layer));
          layer.on('click', () => navigate(`riding/${feature.properties.slug}`));
        }
      }).addTo(map);
      boundaryButton.disabled = false;
      if (resultToggle) resultToggle.disabled = false;
      surface.dataset.ready = 'true';
      surface.setAttribute('aria-busy', 'false');
    }
  } catch {
    for (const surface of surfaces) {
      if (!surface.isConnected) continue;
      const target = surface.dataset.basemapReady ? surface.closest('.map-section').querySelector('[data-map-caption]') : surface;
      const message = surface.dataset.basemapReady ? 'Riding boundaries unavailable. The riding search is still available.' : 'The map could not load. The riding search is still available.';
      target.dataset.i18n = message;
      target.textContent = translate(message);
      surface.setAttribute('aria-busy', 'false');
    }
  }
}

function showLocationStatus(message, district, values = {}) {
  locationNotice = { message, district, values };
  const status = document.getElementById('locationStatus');
  status.hidden = false;
  status.replaceChildren(textNode(translate(message, values)));
  if (district) {
    const link = document.createElement('a');
    link.href = routeHref(`riding/${district.properties.slug}`);
    link.textContent = translate('View {riding}', { riding: district.properties.name });
    status.append(link);
  }
  const search = document.createElement('a');
  search.href = routeHref('ridings');
  search.textContent = translate('Choose another riding');
  status.append(search);
}

async function districtAtPosition(position) {
  const index = await loadIndex();
  const features = await Promise.all(nearbyDistricts(index, position).map(loadFeature));
  return matchDistrict(features, position);
}

function clearAddressSuggestions() {
  addressSuggestions = [];
  activeAddress = -1;
  document.getElementById('addressSuggestions').replaceChildren();
  document.getElementById('addressSuggestions').hidden = true;
  const input = document.getElementById('addressSearch');
  input.setAttribute('aria-expanded', 'false');
  input.removeAttribute('aria-activedescendant');
}

function cancelAddressSearch() {
  clearTimeout(addressSearchTimer);
  addressRequest?.abort();
  addressRequest = null;
  addressGeneration += 1;
}

function closeRidingFinder() {
  cancelAddressSearch();
  clearAddressSuggestions();
  const dialog = document.getElementById('ridingFinder');
  document.getElementById('addressSearchForm').reset();
  document.getElementById('addressSearchStatus').textContent = '';
  document.getElementById('addressSearch').removeAttribute('aria-busy');
  document.getElementById('addressRidingResult').replaceChildren();
  document.getElementById('addressRidingResult').hidden = true;
  dialog.close();
  if (finderOpener?.isConnected) finderOpener.focus({ preventScroll: true });
}

function highlightAddress(index) {
  activeAddress = index;
  const input = document.getElementById('addressSearch');
  document.querySelectorAll('#addressSuggestions [role="option"]').forEach((option, position) => option.setAttribute('aria-selected', String(position === index)));
  if (index < 0) input.removeAttribute('aria-activedescendant');
  else {
    const option = document.getElementById(`addressOption${index}`);
    input.setAttribute('aria-activedescendant', option.id);
    option.scrollIntoView({ block: 'nearest', behavior: 'instant' });
  }
}

async function chooseAddress(index) {
  const address = addressSuggestions[index];
  if (!address) return;
  cancelAddressSearch();
  const generation = addressGeneration;
  document.getElementById('addressSearch').value = address.address;
  clearAddressSuggestions();
  const status = document.getElementById('addressSearchStatus');
  status.textContent = translate('Checking riding boundaries...');
  const panel = document.getElementById('addressRidingResult');
  panel.replaceChildren();
  panel.hidden = true;
  try {
    const result = await districtAtPosition(address);
    if (generation !== addressGeneration || !document.getElementById('ridingFinder').open) return;
    status.textContent = '';
    panel.hidden = false;
    const choices = result.alternatives || (result.district ? [result.district] : []);
    const description = document.createElement('p');
    description.textContent = translate(!choices.length ? 'No B.C. riding could be matched to this address. Confirm the address with Elections BC.' : address.approximate || result.status !== 'matched' ? 'Approximate location or nearby riding boundary. Confirm your riding with Elections BC.' : 'Riding for this address. This is not an official voter assignment.');
    panel.append(description);
    for (const district of choices) {
      const link = document.createElement('a');
      link.className = 'secondary-button';
      link.href = routeHref(`riding/${district.properties.slug}`);
      link.textContent = district.properties.name;
      link.lang = 'en-CA';
      link.addEventListener('click', closeRidingFinder);
      panel.append(link);
    }
  } catch {
    if (generation === addressGeneration) status.textContent = translate('Riding boundaries could not be checked. Try again or browse ridings.');
  }
}

async function updateAddressSuggestions(autoComplete) {
  cancelAddressSearch();
  const generation = addressGeneration;
  const input = document.getElementById('addressSearch');
  const status = document.getElementById('addressSearchStatus');
  const query = input.value;
  clearAddressSuggestions();
  document.getElementById('addressRidingResult').hidden = true;
  document.getElementById('addressRidingResult').replaceChildren();
  try {
    addressQuery(query);
    addressRequest = new AbortController();
    input.setAttribute('aria-busy', 'true');
    status.textContent = translate('Searching addresses...');
    const matches = await searchAddresses(query, { autoComplete, signal: addressRequest.signal });
    if (generation !== addressGeneration || !document.getElementById('ridingFinder').open) return;
    addressSuggestions = matches;
    const list = document.getElementById('addressSuggestions');
    matches.forEach((match, index) => {
      const item = document.createElement('li');
      item.id = `addressOption${index}`;
      item.setAttribute('role', 'option');
      item.setAttribute('aria-selected', 'false');
      item.textContent = match.address;
      item.lang = 'en-CA';
      item.addEventListener('pointerdown', event => event.preventDefault());
      item.addEventListener('click', () => chooseAddress(index));
      list.append(item);
    });
    list.hidden = matches.length === 0;
    input.setAttribute('aria-expanded', String(matches.length > 0));
    status.textContent = matches.length ? translate(matches.length === 1 ? '{count} matching address' : '{count} matching addresses', { count: formatNumber(matches.length) }) : translate('No street address matched. Check the street number and city, or browse ridings.');
  } catch (error) {
    if (generation === addressGeneration) status.textContent = translate(error.message || 'Address search is unavailable. Try again or browse ridings.');
  } finally {
    if (generation === addressGeneration) input.removeAttribute('aria-busy');
  }
}

export function openRidingFinder(opener) {
  const dialog = document.getElementById('ridingFinder');
  const input = document.getElementById('addressSearch');
  if (!finderReady) {
    finderReady = true;
    dialog.querySelector('[data-close-riding-finder]').addEventListener('click', closeRidingFinder);
    dialog.querySelector('[data-choose-riding]').addEventListener('click', closeRidingFinder);
    dialog.querySelector('[data-use-device-location]').addEventListener('click', () => { closeRidingFinder(); findMyRiding(); });
    dialog.addEventListener('cancel', event => { event.preventDefault(); closeRidingFinder(); });
    document.getElementById('addressSearchForm').addEventListener('submit', event => { event.preventDefault(); updateAddressSuggestions(false); });
    input.addEventListener('input', () => {
      cancelAddressSearch();
      clearAddressSuggestions();
      input.removeAttribute('aria-busy');
      document.getElementById('addressRidingResult').hidden = true;
      document.getElementById('addressRidingResult').replaceChildren();
      document.getElementById('addressSearchStatus').textContent = '';
      if (input.value.trim().length >= 3) addressSearchTimer = setTimeout(() => updateAddressSuggestions(true), 350);
    });
    input.addEventListener('keydown', event => {
      if (event.key === 'Escape' && addressSuggestions.length) {
        event.preventDefault();
        event.stopPropagation();
        clearAddressSuggestions();
        return;
      }
      if (['ArrowDown', 'ArrowUp'].includes(event.key) && addressSuggestions.length) {
        event.preventDefault();
        const next = activeAddress < 0 ? event.key === 'ArrowDown' ? 0 : addressSuggestions.length - 1 : (activeAddress + (event.key === 'ArrowDown' ? 1 : -1) + addressSuggestions.length) % addressSuggestions.length;
        highlightAddress(next);
      } else if (event.key === 'Enter' && activeAddress >= 0) {
        event.preventDefault();
        chooseAddress(activeAddress);
      }
    });
    window.addEventListener('routechange', () => { if (dialog.open) closeRidingFinder(); });
  }
  finderOpener = opener || document.activeElement;
  if (!dialog.open) dialog.showModal();
  input.focus();
}

export async function findMyRiding() {
  if (locating) return;
  locating = true;
  const buttons = [...document.querySelectorAll('[data-find-riding]')];
  buttons.forEach(button => { button.disabled = true; button.setAttribute('aria-busy', 'true'); });
  showLocationStatus('Finding your location...');
  try {
    const position = await requestLocation();
    if (position.accuracy > 50000) {
      showLocationStatus('Your device location is too broad to identify a riding. Search for your home riding instead.');
      navigate('ridings');
      return;
    }
    showLocationStatus('Checking nearby riding boundaries...');
    const result = await districtAtPosition(position);
    if (result.status === 'outside') {
      showLocationStatus('No B.C. riding was found at this location. Search for your home riding instead.');
      return;
    }
    deviceLocation = position;
    const destination = result.status === 'matched' ? `riding/${result.district.properties.slug}` : 'ridings';
    if (currentRoute() === destination) {
      for (const entry of maps) drawPosition(entry, true);
    }
    if (result.status === 'matched') {
      showLocationStatus('{riding} is the riding at your current location. This may not be your home riding.', undefined, { riding: result.district.properties.name });
      navigate(destination);
    } else {
      const accuracy = position.accuracy >= 1000 ? `${formatNumber(position.accuracy / 1000, { maximumFractionDigits: 1 })} km` : `${formatNumber(Math.round(position.accuracy))} m`;
      showLocationStatus('Your location is approximate (+/- {accuracy}) or near a boundary. Confirm a riding before continuing.', result.district, { accuracy });
      navigate(destination);
    }
  } catch (error) {
    showLocationStatus(error.message || 'Location could not be determined. Search for a riding instead.');
  } finally {
    locating = false;
    buttons.forEach(button => { button.disabled = false; button.removeAttribute('aria-busy'); });
  }
}
