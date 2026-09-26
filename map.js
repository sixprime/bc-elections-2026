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
  entry.districts?.eachLayer(layer => entry.districts.resetStyle(layer));
  entry.shell.querySelectorAll('[data-map-style]').forEach(button => {
    const active = button.dataset.mapStyle === style;
    button.classList.toggle('selected', active);
    button.setAttribute('aria-pressed', String(active));
  });
}

export async function mountMaps() {
  refreshMapIcons();
  const surfaces = [...document.querySelectorAll('[data-riding-map]')];
  if (!surfaces.length) return;
  try {
    const index = await loadIndex();
    for (const surface of surfaces) {
      if (!surface.isConnected || surface.dataset.basemapReady) continue;
      const shell = surface.closest('.map-section');
      const map = L.map(surface, { preferCanvas: true, minZoom: 4, maxZoom: 18, scrollWheelZoom: true, zoomControl: false, attributionControl: true });
      map.createPane('labels');
      map.getPane('labels').style.zIndex = '450';
      map.getPane('labels').style.pointerEvents = 'none';
      map.attributionControl.setPrefix('<a href="https://leafletjs.com/">Leaflet</a>');
      map.attributionControl.addAttribution('Contains information licenced under the <a href="https://www.elections.bc.ca/docs/EBC-Open-Data-Licence.pdf">Elections BC Open Data Licence</a>');
      L.control.zoom({ position: 'bottomright' }).addTo(map);
      L.control.scale({ imperial: false, position: 'bottomleft' }).addTo(map);
      const entry = { map, shell, surface, caption: shell.querySelector('[data-map-caption]') };
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
        const visible = map.hasLayer(entry.districts);
        if (visible) entry.districts.remove(); else entry.districts.addTo(map);
        event.currentTarget.setAttribute('aria-pressed', String(!visible));
      });
      shell.querySelectorAll('[data-map-style]').forEach(button => button.addEventListener('click', () => {
        selectedStyle = button.dataset.mapStyle;
        setBasemap(entry, selectedStyle);
      }));
      surface.dataset.basemapReady = 'true';
      const districts = await loadDisplay();
      if (!surface.isConnected || !maps.has(entry)) continue;
      const style = feature => ({ color: feature.properties.slug === selectedSlug ? (entry.mode === 'satellite' ? '#f3d14d' : '#1269bd') : (entry.mode === 'satellite' ? '#fff' : '#315971'), weight: feature.properties.slug === selectedSlug ? 3 : 1.3, opacity: 0.85, fillColor: entry.mode === 'satellite' ? '#f3d14d' : '#1269bd', fillOpacity: feature.properties.slug === selectedSlug ? 0.14 : 0.015 });
      entry.districts = L.geoJSON(districts, {
        style,
        onEachFeature(feature, layer) {
          layer.bindTooltip(textNode(feature.properties.name), { sticky: true, direction: 'top', className: 'riding-tooltip' });
          layer.on('mouseover', () => layer.setStyle({ weight: 3, fillOpacity: 0.14, color: entry.mode === 'satellite' ? '#f3d14d' : '#1269bd' }));
          layer.on('mouseout', () => entry.districts.resetStyle(layer));
          layer.on('click', () => { location.hash = `#riding/${feature.properties.slug}`; });
        }
      }).addTo(map);
      boundaryButton.disabled = false;
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
