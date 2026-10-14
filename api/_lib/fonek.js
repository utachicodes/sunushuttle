// Client for a self-hosted fonek (github.com/lodjim/fonek) backend: it
// tracks BLE tags over Apple's Find My network and reports are slow (minutes
// to hours), so this is only ever used as a backup locator, never the live
// feed. Optional: both env vars unset simply disables the fallback.
const CACHE_MS = 60_000;

let cache = { at: 0, locations: [] };

/** Latest known location of every fonek device, cached briefly so a burst of
 * requests for /api/fallback doesn't turn into a burst of calls to fonek. */
export async function fetchFonekLocations() {
  const baseUrl = process.env.FONEK_BASE_URL;
  const apiKey = process.env.FONEK_API_KEY;
  if (!baseUrl || !apiKey) return [];

  if (Date.now() - cache.at < CACHE_MS) return cache.locations;

  try {
    const res = await fetch(`${baseUrl.replace(/\/+$/, '')}/api/public/locations`, {
      headers: { Authorization: `Bearer ${apiKey}` },
    });
    if (!res.ok) return cache.locations;
    const locations = await res.json();
    cache = { at: Date.now(), locations: Array.isArray(locations) ? locations : [] };
    return cache.locations;
  } catch {
    return cache.locations;
  }
}
