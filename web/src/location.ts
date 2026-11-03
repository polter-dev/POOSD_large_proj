// The browser's location, for POST /restaurants/nearby only: never stored or sent anywhere else (spec N4).

export type LocationProblem = 'denied' | 'unavailable' | 'unsupported';

export class LocationError extends Error {
  problem: LocationProblem;
  constructor(problem: LocationProblem) {
    super(problem);
    this.problem = problem;
  }
}

export function currentPosition(): Promise<{ lat: number; lng: number }> {
  return new Promise((resolve, reject) => {
    // Missing on old browsers, and on any page not served over HTTPS (or localhost).
    if (!('geolocation' in navigator) || !window.isSecureContext) {
      reject(new LocationError('unsupported'));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (p) => resolve({ lat: p.coords.latitude, lng: p.coords.longitude }),
      (e) => reject(new LocationError(e.code === e.PERMISSION_DENIED ? 'denied' : 'unavailable')),
      // A cached fix up to 5 minutes old is fine for "restaurants within 5 miles".
      { enableHighAccuracy: false, timeout: 15000, maximumAge: 5 * 60 * 1000 },
    );
  });
}
