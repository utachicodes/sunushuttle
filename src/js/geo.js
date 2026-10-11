// Route-progress math. Distances are small enough (a city shuttle line) that
// an equirectangular projection into local meters is accurate and much
// cheaper than full geodesic math.

const EARTH_RADIUS_M = 6371000;

function toMeters(point, originLat) {
  const latRad = (originLat * Math.PI) / 180;
  const x = (point.lng * Math.PI) / 180 * Math.cos(latRad) * EARTH_RADIUS_M;
  const y = (point.lat * Math.PI) / 180 * EARTH_RADIUS_M;
  return { x, y };
}

export function haversineMeters(a, b) {
  const lat1 = (a.lat * Math.PI) / 180;
  const lat2 = (b.lat * Math.PI) / 180;
  const dLat = lat2 - lat1;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.sqrt(h));
}

function closestPointOnSegment(p, a, b) {
  const abx = b.x - a.x;
  const aby = b.y - a.y;
  const lenSq = abx * abx + aby * aby;
  const t = lenSq === 0 ? 0 : Math.max(0, Math.min(1, ((p.x - a.x) * abx + (p.y - a.y) * aby) / lenSq));
  return { x: a.x + t * abx, y: a.y + t * aby, t };
}

function distance(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

/**
 * Projects a bus position onto the route polyline defined by `stops` and
 * returns how far along the route (in meters from the first stop) it sits.
 * Finds the closest segment rather than assuming forward motion, so a brief
 * GPS wobble backward does not throw off the estimate.
 */
export function distanceAlongRoute(busPoint, stops) {
  if (stops.length < 2) return 0;
  const originLat = stops[0].lat;
  const busM = toMeters(busPoint, originLat);
  const stopsM = stops.map((s) => toMeters(s, originLat));

  const cumulative = [0];
  for (let i = 1; i < stopsM.length; i++) {
    cumulative.push(cumulative[i - 1] + distance(stopsM[i - 1], stopsM[i]));
  }

  let best = { distance: Infinity, along: 0 };
  for (let i = 0; i < stopsM.length - 1; i++) {
    const closest = closestPointOnSegment(busM, stopsM[i], stopsM[i + 1]);
    const d = distance(busM, closest);
    if (d < best.distance) {
      const along = cumulative[i] + closest.t * (cumulative[i + 1] - cumulative[i]);
      best = { distance: d, along };
    }
  }
  return best.along;
}

export function cumulativeStopDistances(stops) {
  const out = [0];
  for (let i = 1; i < stops.length; i++) {
    out.push(out[i - 1] + haversineMeters(stops[i - 1], stops[i]));
  }
  return out;
}

const MIN_CRUISE_KMH = 15;

/**
 * Estimated minutes to reach `stopIndex`, or null if the bus already passed it.
 */
export function etaMinutes(busPoint, stops, stopIndex, speedKmh) {
  const along = distanceAlongRoute(busPoint, stops);
  const stopDistances = cumulativeStopDistances(stops);
  const remaining = stopDistances[stopIndex] - along;
  if (remaining < -40) return null; // comfortably past the stop
  if (remaining < 250) return 0;
  const effectiveSpeed = Math.max(speedKmh, MIN_CRUISE_KMH);
  return Math.max(1, Math.round(remaining / 1000 / effectiveSpeed * 60));
}

export function routeFraction(busPoint, stops) {
  const stopDistances = cumulativeStopDistances(stops);
  const total = stopDistances[stopDistances.length - 1];
  if (!total) return 0;
  return Math.min(1, Math.max(0, distanceAlongRoute(busPoint, stops) / total));
}
