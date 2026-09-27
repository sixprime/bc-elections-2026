import { requestLocation } from './location.js';
import { matchDistrict, nearbyDistricts } from './geography.js';
import { createIcons, LocateFixed, Maximize, Layers, ArrowUpRight } from './vendor/icons.js';

const maps = new Set();
const featureCache = new Map();
let displayRequest;
let indexRequest;
let deviceLocation;
let locating = false;
let selectedStyle = 'street';
let patternSequence = 0;
const partyStyles = {
  ndp: { color: '#e69f00', pattern: 'horizontal' },
  con: { color: '#0072b2', pattern: 'diagonal' },
  green: { color: '#009e73', pattern: 'dots' }
};

async function readData(path) {
  const response = await fetch(new URL(`./data/prod/${path}`, import.meta.url));
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
  createIcons({ icons: { LocateFixed, Maximize, Layers, ArrowUpRight }, attrs: { 'aria-hidden': 'true', 'stroke-width': 1.8 } });
}

export function disposeMaps() {
  for (const entry of maps) entry.map.remove();
  maps.clear();
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
      color: partyStyles[winner.party]?.color || party?.color || '#77858e',
      pattern: partyStyles[winner.party]?.pattern || 'none',
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
    row.setAttribute('aria-label', `${item.label}: ${item.count} ridings`);
    row.dataset.party = item.partyId;
    row.dataset.pattern = item.pattern || 'none';
    const swatch = document.createElement('i');
    swatch.className = 'map-legend-swatch';
    swatch.style.setProperty('--party', item.color);
    swatch.setAttribute('aria-hidden', 'true');
    const count = document.createElement('b');
    count.textContent = item.count;
    row.append(swatch, textNode(item.label), count);
    return row;
  }));
}

function resultTooltip(name, result) {
  const content = document.createElement('div');
  content.className = 'map-result-tooltip';
  const heading = document.createElement('strong');
  heading.textContent = name;
  content.append(heading);
  if (result) {
    content.append(textNode(result.name), textNode(`${result.label} / ${result.share.toFixed(1)}%`), textNode(`2024 / ${new Intl.NumberFormat('en-CA').format(result.margin)}-vote margin`));
  } else content.append(textNode('2024 result not in this snapshot'));
  return content;
}

function resetDistrictStyles(entry) {
  entry.boundaryHalo?.setStyle({ stroke: entry.showBoundaries });
  entry.districts?.eachLayer(layer => entry.districts.resetStyle(layer));
  entry.patterns?.setStyle({ fillOpacity: entry.showResults ? 0.65 : 0 });
}

function addPartyPatterns(entry, districts, results) {
  const namespace = 'http://www.w3.org/2000/svg';
  const renderer = L.svg({ pane: 'district-patterns' }).addTo(entry.map);
  const svg = entry.map.getPane('district-patterns').querySelector('svg');
  const definitions = document.createElementNS(namespace, 'defs');
  const prefix = `party-pattern-${++patternSequence}`;
  for (const kind of ['horizontal', 'diagonal', 'dots']) {
    const pattern = document.createElementNS(namespace, 'pattern');
    pattern.setAttribute('id', `${prefix}-${kind}`);
    pattern.setAttribute('patternUnits', 'userSpaceOnUse');
    pattern.setAttribute('width', '10');
    pattern.setAttribute('height', '10');
    for (const outline of [true, false]) {
      const shape = document.createElementNS(namespace, kind === 'dots' ? 'circle' : 'path');
      if (kind === 'dots') {
        shape.setAttribute('cx', '5');
        shape.setAttribute('cy', '5');
        shape.setAttribute('r', outline ? '2.3' : '1.2');
        shape.setAttribute('fill', outline ? '#fff' : '#172f3c');
      } else {
        shape.setAttribute('d', kind === 'horizontal' ? 'M0 5H10' : 'M-2 2L2 -2M0 10L10 0M8 12L12 8');
        shape.setAttribute('stroke', outline ? '#fff' : '#172f3c');
        shape.setAttribute('stroke-width', outline ? '2.6' : '1.1');
        shape.setAttribute('fill', 'none');
      }
      shape.setAttribute('opacity', outline ? '0.6' : '0.8');
      pattern.append(shape);
    }
    definitions.append(pattern);
  }
  svg.prepend(definitions);
  entry.patterns = L.geoJSON(districts, {
    renderer,
    pane: 'district-patterns',
    interactive: false,
    filter: feature => partyStyles[results.get(feature.properties.name)?.partyId],
    style: feature => ({ stroke: false, fillColor: `url(#${prefix}-${results.get(feature.properties.name).pattern})`, fillOpacity: entry.showResults ? 0.65 : 0 })
  }).addTo(entry.map);
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
    entry.caption.textContent = 'OpenStreetMap';
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
    entry.caption.textContent = imagery ? 'Sentinel-2 / 2024 / 10 m imagery' : 'EOX terrain / OpenStreetMap';
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
      entry.caption.textContent = style === 'street' ? 'Map tiles unavailable. Riding selection still works.' : 'Imagery unavailable. Try Streets.';
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
      map.createPane('district-patterns');
      map.getPane('district-patterns').style.zIndex = '395';
      map.getPane('district-patterns').style.pointerEvents = 'none';
      map.createPane('labels');
      map.getPane('labels').style.zIndex = '450';
      map.getPane('labels').style.pointerEvents = 'none';
      map.attributionControl.setPrefix('<a href="https://leafletjs.com/">Leaflet</a>');
      map.attributionControl.addAttribution('Contains information licenced under the <a href="https://www.elections.bc.ca/docs/EBC-Open-Data-Licence.pdf">Elections BC Open Data Licence</a>');
      L.control.zoom({ position: 'bottomright' }).addTo(map);
      L.control.scale({ imperial: false, position: 'bottomleft' }).addTo(map);
      const hasResults = surface.hasAttribute('data-map-results');
      const entry = { map, shell, surface, hasResults, showResults: hasResults, showBoundaries: true, caption: shell.querySelector('[data-map-caption]') };
      const legend = shell.querySelector('[data-map-results-legend]');
      const resultToggle = shell.querySelector('[data-map-results-toggle]');
      if (legend) resultLegend(legend, index.districts, results);
      maps.add(entry);
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
          weight: feature.properties.slug === selectedSlug ? 6 : 4.4,
          opacity: 0.9,
          fill: false
        })
      }).addTo(map);
      const style = feature => {
        const selected = feature.properties.slug === selectedSlug;
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
          layer.bindTooltip(hasResults ? resultTooltip(feature.properties.name, result) : textNode(feature.properties.name), { sticky: true, direction: 'top', className: 'riding-tooltip' });
          layer.on('mouseover', () => layer.setStyle({ stroke: true, weight: 2.8, opacity: 1, fillOpacity: entry.showResults && result ? 0.34 : 0.14, color: '#172f3c' }));
          layer.on('mouseout', () => entry.districts.resetStyle(layer));
          layer.on('click', () => { location.hash = `#riding/${feature.properties.slug}`; });
        }
      }).addTo(map);
      if (hasResults) addPartyPatterns(entry, districts, results);
      boundaryButton.disabled = false;
      if (resultToggle) resultToggle.disabled = false;
      surface.dataset.ready = 'true';
      surface.setAttribute('aria-busy', 'false');
    }
  } catch {
    for (const surface of surfaces) {
      if (!surface.isConnected) continue;
      if (surface.dataset.basemapReady) surface.closest('.map-section').querySelector('[data-map-caption]').textContent = 'Riding boundaries unavailable. The riding search is still available.';
      else surface.textContent = 'The map could not load. The riding search is still available.';
      surface.setAttribute('aria-busy', 'false');
    }
  }
}

function showLocationStatus(message, district) {
  const status = document.getElementById('locationStatus');
  status.hidden = false;
  status.replaceChildren(textNode(message));
  if (district) {
    const link = document.createElement('a');
    link.href = `#riding/${district.properties.slug}`;
    link.textContent = `View ${district.properties.name}`;
    status.append(link);
  }
  const search = document.createElement('a');
  search.href = '#ridings';
  search.textContent = 'Choose another riding';
  status.append(search);
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
      location.hash = '#ridings';
      return;
    }
    showLocationStatus('Checking nearby riding boundaries...');
    const index = await loadIndex();
    const nearby = nearbyDistricts(index, position);
    const features = await Promise.all(nearby.map(loadFeature));
    const result = matchDistrict(features, position);
    if (result.status === 'outside') {
      showLocationStatus('No B.C. riding was found at this location. Search for your home riding instead.');
      return;
    }
    deviceLocation = position;
    const destination = result.status === 'matched' ? `#riding/${result.district.properties.slug}` : '#ridings';
    if (location.hash === destination) {
      for (const entry of maps) drawPosition(entry, true);
    }
    if (result.status === 'matched') {
      showLocationStatus(`${result.district.properties.name} is the riding at your current location. This may not be your home riding.`);
      location.hash = destination;
    } else {
      const accuracy = position.accuracy >= 1000 ? `${(position.accuracy / 1000).toFixed(1)} km` : `${Math.round(position.accuracy)} m`;
      showLocationStatus(`Your location is approximate (+/- ${accuracy}) or near a boundary. Confirm a riding before continuing.`, result.district);
      location.hash = destination;
    }
  } catch (error) {
    showLocationStatus(error.message || 'Location could not be determined. Search for a riding instead.');
  } finally {
    locating = false;
    buttons.forEach(button => { button.disabled = false; button.removeAttribute('aria-busy'); });
  }
}
