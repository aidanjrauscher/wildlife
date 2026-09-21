/**
 * Address autocomplete via Photon (photon.komoot.io), an OpenStreetMap-based
 * geocoder that permits browser autocomplete use. Results are limited to a
 * bounding box around the US (including Alaska and Hawaii) and filtered to
 * countrycode US.
 */
import { toStateCode } from './states';

const PHOTON = 'https://photon.komoot.io/api/';
const US_BBOX = '-180,18,-66,72';

function labelFor(p) {
  const street = [p.housenumber, p.street].filter(Boolean).join(' ');
  const parts = [];
  if (p.name && p.name !== street && p.name !== p.city) parts.push(p.name);
  if (street && street !== p.name) parts.push(street);
  if (p.city && p.city !== p.name) parts.push(p.city);
  else if (p.county && !p.city) parts.push(p.county);
  const region = [p.state, p.postcode].filter(Boolean).join(' ');
  if (region) parts.push(region);
  return parts.join(', ');
}

export async function suggestAddresses(q, signal) {
  const params = new URLSearchParams({ q, limit: '8', lang: 'en', bbox: US_BBOX });
  const resp = await fetch(`${PHOTON}?${params}`, { signal });
  if (!resp.ok) return [];
  const data = await resp.json();
  const seen = new Set();
  const out = [];
  for (const f of data.features || []) {
    const p = f.properties || {};
    if (p.countrycode !== 'US') continue;
    const label = labelFor(p);
    if (!label || seen.has(label)) continue;
    seen.add(label);
    const [lng, lat] = f.geometry.coordinates;
    out.push({ label, lat, lng, state: toStateCode(p.state), kind: p.osm_value || p.type || '' });
    if (out.length >= 6) break;
  }
  return out;
}
