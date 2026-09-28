export function addressQuery(value) {
  const query = String(value || '').replace(/\s+/g, ' ').trim();
  if (/^[A-Z]\d[A-Z][ -]?\d[A-Z]\d$/i.test(query)) throw new Error('Postal codes are not supported. Enter a street address and city.');
  if (query.length < 3) throw new Error('Enter a street address and city.');
  if (query.length > 200) throw new Error('The address is too long. Enter a street address and city.');
  return query;
}

export function addressMatches(data) {
  if (!Array.isArray(data?.features)) throw new Error('The address service returned an invalid response.');
  const seen = new Set();
  return data.features.flatMap(feature => {
    const properties = feature?.properties;
    const coordinates = feature?.geometry?.coordinates;
    if (feature?.geometry?.type !== 'Point' || !Array.isArray(coordinates) || coordinates.length < 2 || !properties) return [];
    const [longitude, latitude] = coordinates;
    if (!Number.isFinite(longitude) || !Number.isFinite(latitude) || longitude < -180 || longitude > 180 || latitude < -90 || latitude > 90) return [];
    const score = Number(properties.score);
    if (!['CIVIC_NUMBER', 'UNIT', 'SITE'].includes(properties.matchPrecision) || properties.provinceCode !== 'BC' || !Number.isFinite(score) || score < 80 || score > 100 || !properties.civicNumber || properties.siteStatus === 'retired') return [];
    if (typeof properties.fullAddress !== 'string' || !properties.fullAddress.trim() || seen.has(properties.fullAddress)) return [];
    const accuracy = properties.locationPositionalAccuracy === 'high' ? 50 : properties.locationPositionalAccuracy === 'medium' ? 200 : 1500;
    seen.add(properties.fullAddress);
    return [{ address: properties.fullAddress, latitude, longitude, accuracy, approximate: accuracy > 50, descriptor: properties.locationDescriptor || '' }];
  }).slice(0, 5);
}

export async function searchAddresses(value, { autoComplete = true, signal } = {}) {
  const address = addressQuery(value);
  const url = new URL('https://geocoder.api.gov.bc.ca/addresses.json');
  url.search = new URLSearchParams({ addressString: address, autoComplete: String(autoComplete), outputSRS: '4326', maxResults: '5', minScore: '80', interpolation: 'none', locationDescriptor: 'accessPoint', echo: 'false', brief: 'false' });
  const timeout = AbortSignal.timeout(10000);
  let response;
  try {
    response = await fetch(url, { signal: signal ? AbortSignal.any([signal, timeout]) : timeout, credentials: 'omit', referrerPolicy: 'origin', cache: 'no-store' });
  } catch (error) {
    if (signal?.aborted) throw error;
    throw new Error('The address service is unavailable. Try again, use your location, or choose a riding.');
  }
  if (response.status === 429) throw new Error('The address service is busy. Please try again shortly.');
  if (!response.ok) throw new Error('The address service is unavailable. Use your location or choose a riding.');
  let data;
  try { data = await response.json(); } catch { throw new Error('The address service returned an invalid response. Try again or browse ridings.'); }
  return addressMatches(data);
}
