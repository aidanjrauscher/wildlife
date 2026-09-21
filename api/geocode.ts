import type { IncomingMessage, ServerResponse } from 'node:http';
import { fetchJson, query, sendJson } from './_shared';
import type { GeocodeResult } from '../src/lib/types';

interface CensusResponse {
  result?: {
    addressMatches?: { coordinates: { x: number; y: number }; matchedAddress: string }[];
  };
}

interface NominatimHit {
  lat: string;
  lon: string;
  display_name: string;
}

function titleCase(s: string): string {
  return s.toLowerCase().replace(/\b([a-z])/g, (c) => c.toUpperCase()).replace(/\b(Nw|Ne|Sw|Se|Dc)\b/g, (c) => c.toUpperCase());
}

async function censusGeocode(q: string): Promise<GeocodeResult | null> {
  const url =
    'https://geocoding.geo.census.gov/geocoder/locations/onelineaddress?' +
    new URLSearchParams({ address: q, benchmark: 'Public_AR_Current', format: 'json' });
  const data = await fetchJson<CensusResponse>(url, {}, 2);
  const hit = data.result?.addressMatches?.[0];
  if (!hit) return null;
  return { lat: hit.coordinates.y, lng: hit.coordinates.x, label: titleCase(hit.matchedAddress), source: 'census' };
}

async function nominatimGeocode(q: string): Promise<GeocodeResult | null> {
  const url =
    'https://nominatim.openstreetmap.org/search?' +
    new URLSearchParams({ q, format: 'jsonv2', countrycodes: 'us', limit: '1' });
  const hits = await fetchJson<NominatimHit[]>(url, {}, 2);
  const hit = hits[0];
  if (!hit) return null;
  return { lat: parseFloat(hit.lat), lng: parseFloat(hit.lon), label: hit.display_name, source: 'nominatim' };
}

/**
 * GET /api/geocode?q=<address>
 * US-only geocoding: US Census Geocoder first (best for street addresses),
 * then Nominatim restricted to the US (handles cities, ZIPs, landmarks).
 */
export default async function handler(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const q = (query(req).get('q') ?? '').trim().slice(0, 200);
  if (q.length < 3) {
    sendJson(res, 400, { error: 'Enter an address, city, or ZIP code.' });
    return;
  }

  let result: GeocodeResult | null = null;
  const errors: string[] = [];

  // A plain ZIP or "City, ST" rarely resolves on the Census address endpoint,
  // so skip it when the query has no house number.
  if (/\d+\s+\S+/.test(q)) {
    try {
      result = await censusGeocode(q);
    } catch (err) {
      errors.push(`census: ${(err as Error).message}`);
    }
  }
  if (!result) {
    try {
      result = await nominatimGeocode(q);
    } catch (err) {
      errors.push(`nominatim: ${(err as Error).message}`);
    }
  }

  if (!result) {
    const status = errors.length === 2 ? 502 : 404;
    sendJson(res, status, {
      error:
        status === 404
          ? 'No US location found for that address. Try adding a city and state, or a ZIP code.'
          : 'Geocoding services are unavailable right now. Please try again shortly.',
      detail: errors,
    });
    return;
  }
  sendJson(res, 200, result, 'public, s-maxage=86400, stale-while-revalidate=604800');
}
