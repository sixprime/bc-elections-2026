import { booleanPointInPolygon, pointToLineDistance } from './vendor/geometry.js';

export function nearbyDistricts(index, { latitude, longitude, accuracy }) {
  const latitudeRadius = Math.max(accuracy, 10) / 110574;
  const longitudeRadius = Math.max(accuracy, 10) / (111320 * Math.max(Math.cos(latitude * Math.PI / 180), 0.01));
  return index.districts.filter(district => {
    const [west, south, east, north] = district.bbox;
    return longitude + longitudeRadius >= west && longitude - longitudeRadius <= east &&
      latitude + latitudeRadius >= south && latitude - latitudeRadius <= north;
  });
}

export function matchDistrict(features, { latitude, longitude, accuracy }) {
  const coordinate = [longitude, latitude];
  const matches = features.filter(feature => booleanPointInPolygon(coordinate, feature));
  if (!matches.length) return { status: 'outside', district: null };
  if (matches.length > 1) return { status: 'ambiguous', district: null, alternatives: matches };
  const district = matches[0];
  const rings = district.geometry.type === 'Polygon' ? district.geometry.coordinates : district.geometry.coordinates.flat();
  const distanceToBoundary = Math.min(...rings.map(coordinates => pointToLineDistance(coordinate, {
    type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates }
  }, { units: 'meters' })));
  const status = accuracy > 1000 || accuracy + 5 >= distanceToBoundary ? 'approximate' : 'matched';
  return { status, district, distanceToBoundary };
}
