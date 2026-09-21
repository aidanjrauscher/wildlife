/**
 * Client-side geocoding. Prefers our own /api/geocode function (Census
 * geocoder with Nominatim fallback). If that endpoint is unreachable, for
 * example when the built site is served statically without Vercel functions,
 * it calls Nominatim directly since Nominatim allows browser requests.
 */
const NOMINATIM = 'https://nominatim.openstreetmap.org/search';

export async function geocodeAddress(q, signal) {
  const query = q.trim();
  if (query.length < 3) throw new Error('Enter a fuller address, for example "123 Main St, Austin, TX".');

  let apiUnavailable = false;
  try {
    const resp = await fetch(`/api/geocode?q=${encodeURIComponent(query)}`, { signal });
    if (resp.ok) return await resp.json();
    if (resp.status === 404 || resp.status === 400) {
      const body = await resp.json().catch(() => ({}));
      // A 404 with our JSON body means "no match"; a bare 404 means no function.
      if (body && body.error) throw new Error(body.error);
      apiUnavailable = true;
    } else {
      apiUnavailable = true;
    }
  } catch (err) {
    if (err.name === 'AbortError') throw err;
    if (!apiUnavailable && !(err instanceof TypeError)) throw err;
    apiUnavailable = true;
  }

  const url = `${NOMINATIM}?q=${encodeURIComponent(query)}&format=json&countrycodes=us&limit=1&addressdetails=1`;
  const resp = await fetch(url, { signal, headers: { accept: 'application/json' } });
  if (!resp.ok) throw new Error('Geocoding service is unavailable right now. Please try again.');
  const data = await resp.json();
  const hit = data[0];
  if (!hit) throw new Error('No US location found for that address. Try adding a city and state.');
  return {
    lat: Number(hit.lat),
    lng: Number(hit.lon),
    label: hit.display_name.replace(/, United States$/, ''),
    state: (hit.address?.['ISO3166-2-lvl4'] || '').replace(/^US-/, '') || null,
    source: 'nominatim',
  };
}
