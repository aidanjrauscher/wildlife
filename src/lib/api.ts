import type { GeocodeResult, GroupKey, GroupResponse, SpeciesDetail } from './types';

export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}

async function getJson<T>(url: string, signal?: AbortSignal): Promise<T> {
  const resp = await fetch(url, { signal });
  const body = (await resp.json().catch(() => ({}))) as { error?: string } & T;
  if (!resp.ok) throw new ApiError(body.error ?? `Request failed (${resp.status})`, resp.status);
  return body;
}

export function geocode(q: string, signal?: AbortSignal): Promise<GeocodeResult> {
  return getJson<GeocodeResult>(`/api/geocode?${new URLSearchParams({ q })}`, signal);
}

/** Coordinates are rounded to ~100 m so nearby searches share the CDN cache. */
export function fetchGroup(group: GroupKey, lat: number, lng: number, signal?: AbortSignal): Promise<GroupResponse> {
  const params = new URLSearchParams({ group, lat: lat.toFixed(3), lng: lng.toFixed(3) });
  return getJson<GroupResponse>(`/api/species?${params}`, signal);
}

export function fetchTaxa(ids: number[], signal?: AbortSignal): Promise<Record<number, SpeciesDetail>> {
  const sorted = [...ids].sort((a, b) => a - b);
  return getJson<Record<number, SpeciesDetail>>(`/api/taxa?ids=${sorted.join(',')}`, signal);
}
