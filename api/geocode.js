/**
 * Vercel serverless function: geocode a US address.
 *
 * Tries the US Census Bureau geocoder first (free, no key, US-only, but it
 * does not send CORS headers, hence this proxy). If Census finds no match
 * (e.g. the query is just a city, ZIP or landmark) it falls back to
 * Nominatim (OpenStreetMap) restricted to the United States.
 *
 * GET /api/geocode?q=<address>  ->  { lat, lng, label, source }
 */

const USER_AGENT = 'NearbyWildlife/0.1 (Vite + Vercel app)';
const CENSUS = 'https://geocoding.geo.census.gov/geocoder/locations/onelineaddress';
const NOMINATIM = 'https://nominatim.openstreetmap.org/search';

function sendJson(res, status, body, cacheControl = 'no-store') {
  res.statusCode = status;
  res.setHeader('content-type', 'application/json; charset=utf-8');
  res.setHeader('cache-control', cacheControl);
  res.end(JSON.stringify(body));
}

async function fetchJson(url) {
  const resp = await fetch(url, {
    headers: { accept: 'application/json', 'user-agent': USER_AGENT },
    signal: AbortSignal.timeout(10_000),
  });
  if (!resp.ok) throw new Error(`${resp.status} from ${new URL(url).host}`);
  return resp.json();
}

async function geocodeCensus(q) {
  const url = `${CENSUS}?address=${encodeURIComponent(q)}&benchmark=Public_AR_Current&format=json`;
  const data = await fetchJson(url);
  const match = data?.result?.addressMatches?.[0];
  if (!match) return null;
  return {
    lat: match.coordinates.y,
    lng: match.coordinates.x,
    label: titleCase(match.matchedAddress),
    state: match.addressComponents?.state || null,
    source: 'census',
  };
}

async function geocodeNominatim(q) {
  const url = `${NOMINATIM}?q=${encodeURIComponent(q)}&format=json&countrycodes=us&limit=1&addressdetails=1`;
  const data = await fetchJson(url);
  const hit = Array.isArray(data) ? data[0] : null;
  if (!hit) return null;
  return {
    lat: Number(hit.lat),
    lng: Number(hit.lon),
    label: hit.display_name.replace(/, United States$/, ''),
    state: (hit.address?.['ISO3166-2-lvl4'] || '').replace(/^US-/, '') || null,
    source: 'nominatim',
  };
}

function titleCase(s) {
  return s.toLowerCase().replace(/\b([a-z])/g, (m) => m.toUpperCase()).replace(/\b(Nw|Ne|Sw|Se|Ny|Dc)\b/g, (m) => m.toUpperCase())
    .replace(/, ([A-Za-z]{2}), /, (m, st) => `, ${st.toUpperCase()}, `);
}

export default async function handler(req, res) {
  const q = new URL(req.url ?? '/', 'http://localhost').searchParams.get('q')?.trim() ?? '';
  if (q.length < 3 || q.length > 200) {
    return sendJson(res, 400, { error: 'Enter an address (3-200 characters).' });
  }

  const errors = [];
  for (const fn of [geocodeCensus, geocodeNominatim]) {
    try {
      const result = await fn(q);
      if (result) return sendJson(res, 200, result, 'public, s-maxage=86400, stale-while-revalidate=604800');
    } catch (err) {
      errors.push(err instanceof Error ? err.message : String(err));
    }
  }

  if (errors.length === 2) {
    return sendJson(res, 502, { error: 'Geocoding services are unavailable right now. Please try again.', detail: errors });
  }
  return sendJson(res, 404, { error: 'No US location found for that address. Try adding a city and state.' });
}
