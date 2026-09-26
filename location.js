export class LocationError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'LocationError';
    this.code = code;
  }
}

export async function requestLocation({
  geolocation = globalThis.navigator?.geolocation,
  secureContext = globalThis.isSecureContext
} = {}) {
  if (!secureContext) {
    throw new LocationError('insecure', 'Location needs HTTPS. Use the published site on your phone, or search for a riding.');
  }
  if (!geolocation) {
    throw new LocationError('unsupported', 'This browser cannot provide your location. Search for a riding instead.');
  }
  const position = await new Promise((resolve, reject) => {
    geolocation.getCurrentPosition(resolve, error => {
      const reasons = {
        1: ['denied', 'Location permission was denied. Allow it in your browser settings, or search for a riding.'],
        2: ['unavailable', 'Your device could not determine its location. Try again or search for a riding.'],
        3: ['timeout', 'Finding your location took too long. Try again outdoors or search for a riding.']
      };
      const [code, message] = reasons[error.code] || reasons[2];
      reject(new LocationError(code, message));
    }, { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 });
  });
  const { latitude, longitude, accuracy } = position.coords || {};
  if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90 ||
      !Number.isFinite(longitude) || longitude < -180 || longitude > 180 ||
      !Number.isFinite(accuracy) || accuracy < 0) {
    throw new LocationError('invalid', 'Your device returned an invalid location. Try again or search for a riding.');
  }
  return { latitude, longitude, accuracy };
}
