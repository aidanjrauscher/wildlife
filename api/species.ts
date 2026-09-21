import type { IncomingMessage, ServerResponse } from 'node:http';
import { INAT, fetchJson, num, query, sendJson } from './_shared';
import { GROUP_BY_KEY, RADIUS_KM, isGroupKey } from '../src/lib/groups';
import type { GroupResponse, Species } from '../src/lib/types';

interface InatTaxon {
  id: number;
  name: string;
  preferred_common_name?: string;
  iconic_taxon_name?: string;
  wikipedia_url?: string | null;
  default_photo?: { square_url?: string; medium_url?: string; url?: string; attribution?: string } | null;
}

interface SpeciesCountsResponse {
  total_results: number;
  page: number;
  per_page: number;
  results: { count: number; taxon: InatTaxon }[];
}

const PER_PAGE = 500;
const MAX_PAGES = 4; // 2,000 species per group is plenty for a 10-mile radius

async function fetchAllPages(params: Record<string, string>) {
  const results: SpeciesCountsResponse['results'] = [];
  let total = 0;
  let page = 1;
  for (; page <= MAX_PAGES; page++) {
    const url = `${INAT}/observations/species_counts?` + new URLSearchParams({ ...params, page: String(page), per_page: String(PER_PAGE) });
    const data = await fetchJson<SpeciesCountsResponse>(url);
    total = data.total_results;
    results.push(...data.results);
    if (results.length >= total || data.results.length < PER_PAGE) break;
  }
  return { results, total, truncated: results.length < total };
}

/**
 * GET /api/species?lat=..&lng=..&group=birds[&radius=16.09]
 * Research-grade iNaturalist species observed within the radius, for one
 * animal group, tagged native / introduced / unknown for that location.
 */
export default async function handler(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const q = query(req);
  const lat = num(q.get('lat'));
  const lng = num(q.get('lng'));
  const groupKey = q.get('group');
  const radius = Math.min(Math.max(num(q.get('radius')) ?? RADIUS_KM, 1), 50);

  if (lat == null || lng == null || Math.abs(lat) > 90 || Math.abs(lng) > 180) {
    sendJson(res, 400, { error: 'lat and lng are required' });
    return;
  }
  if (!isGroupKey(groupKey)) {
    sendJson(res, 400, { error: 'unknown group' });
    return;
  }
  const group = GROUP_BY_KEY[groupKey];

  const base: Record<string, string> = {
    lat: lat.toFixed(4),
    lng: lng.toFixed(4),
    radius: String(radius),
    taxon_id: String(group.taxonId),
    quality_grade: 'research',
    verifiable: 'true',
    locale: 'en',
    preferred_place_id: '1', // United States, for English common names
  };
  if (group.withoutTaxonIds.length) base.without_taxon_id = group.withoutTaxonIds.join(',');

  try {
    const [all, native, introduced] = await Promise.all([
      fetchAllPages(base),
      fetchAllPages({ ...base, native: 'true' }),
      fetchAllPages({ ...base, introduced: 'true' }),
    ]);
    const nativeIds = new Set(native.results.map((r) => r.taxon.id));
    const introducedIds = new Set(introduced.results.map((r) => r.taxon.id));

    const species: Species[] = all.results.map(({ count, taxon }) => {
      const p = taxon.default_photo;
      const square = p?.square_url ?? p?.url ?? null;
      return {
        id: taxon.id,
        name: taxon.name,
        common: taxon.preferred_common_name ?? null,
        group: group.key,
        iconic: taxon.iconic_taxon_name ?? null,
        count,
        establishment: introducedIds.has(taxon.id) ? 'introduced' : nativeIds.has(taxon.id) ? 'native' : 'unknown',
        photo: square ? { square, medium: p?.medium_url ?? square.replace('/square.', '/medium.'), attribution: p?.attribution ?? '' } : null,
        wikipediaUrl: taxon.wikipedia_url ?? null,
      };
    });

    const body: GroupResponse = { group: group.key, total: all.total, truncated: all.truncated, species };
    sendJson(res, 200, body, 'public, s-maxage=86400, stale-while-revalidate=2592000');
  } catch (err) {
    console.error('species error', err);
    sendJson(res, 502, { error: `iNaturalist request failed (${(err as Error).message}). Please retry.` });
  }
}
