import { GROUPS, RADIUS_KM, EXTENDED_RADIUS_KM, OFFSHORE_GROUP_KEYS, GROUP_BY_KEY } from './groups';

const INAT = 'https://api.inaturalist.org/v1';
const PER_PAGE = 500;
const MAX_PAGES = 3;

/** Small in-memory cache keyed by rounded location + options. */
const cache = new Map();

function cacheKey(lat, lng, nativeOnly, group, radiusKm) {
  return `${lat.toFixed(3)},${lng.toFixed(3)},${nativeOnly ? 'native' : 'all'},${group},${radiusKm}`;
}

function normalizeSpecies(row, groupKey) {
  const t = row.taxon;
  const photo = t.default_photo
    ? {
        square: t.default_photo.square_url || t.default_photo.url,
        medium: t.default_photo.medium_url || t.default_photo.url,
        attribution: t.default_photo.attribution || '',
      }
    : null;
  return {
    id: t.id,
    name: t.name,
    common: t.preferred_common_name || null,
    group: groupKey,
    iconic: t.iconic_taxon_name || null,
    rank: t.rank,
    count: row.count,
    photo,
    wikipediaUrl: t.wikipedia_url || null,
    inatUrl: `https://www.inaturalist.org/taxa/${t.id}`,
  };
}

/**
 * Fetch every species in one group observed (research grade) within the
 * search radius. Results are ordered by observation count, most first.
 */
export async function fetchGroupSpecies(group, { lat, lng, nativeOnly, radiusKm = RADIUS_KM }, signal) {
  const key = cacheKey(lat, lng, nativeOnly, group.key, radiusKm);
  if (cache.has(key)) return cache.get(key);

  const species = [];
  let total = 0;
  for (let page = 1; page <= MAX_PAGES; page++) {
    const params = new URLSearchParams({
      lat: String(lat),
      lng: String(lng),
      radius: String(radiusKm),
      taxon_id: String(group.taxonId),
      quality_grade: 'research',
      hrank: 'species',
      per_page: String(PER_PAGE),
      page: String(page),
      locale: 'en',
    });
    if (group.withoutTaxonIds.length) params.set('without_taxon_id', group.withoutTaxonIds.join(','));
    if (nativeOnly) params.set('native', 'true');

    const resp = await fetch(`${INAT}/observations/species_counts?${params}`, {
      signal,
      headers: { accept: 'application/json' },
    });
    if (resp.status === 429) throw new Error('iNaturalist is rate limiting requests. Wait a moment and try again.');
    if (!resp.ok) throw new Error(`iNaturalist returned ${resp.status} while loading ${group.label.toLowerCase()}.`);
    const data = await resp.json();
    total = data.total_results;
    for (const row of data.results) species.push(normalizeSpecies(row, group.key));
    if (data.results.length < PER_PAGE) break;
  }

  const result = { group: group.key, total, truncated: species.length < total, species };
  cache.set(key, result);
  return result;
}

/**
 * Load all groups concurrently, calling onGroup as each finishes so the UI
 * can render progressively.
 */
export async function fetchAllSpecies(location, onGroup, signal) {
  const results = await Promise.allSettled(
    GROUPS.map(async (group) => {
      const res = await fetchGroupSpecies(group, location, signal);
      onGroup(res);
      return res;
    }),
  );
  const failures = results.filter((r) => r.status === 'rejected').map((r) => r.reason);
  if (failures.some((e) => e?.name === 'AbortError')) return { failures: [] };
  return { failures };
}

/** Marine taxa that never occur in fresh water: echinoderms (47549) and cephalopods (47459). */
const COASTAL_INDICATOR_TAXA = '47549,47459';
const COASTAL_MIN_SPECIES = 3;

/** True when the extended radius reaches the sea, judged by marine-only taxa observed within it. */
export async function isCoastal({ lat, lng }, signal) {
  const params = new URLSearchParams({
    lat: String(lat),
    lng: String(lng),
    radius: String(EXTENDED_RADIUS_KM),
    taxon_id: COASTAL_INDICATOR_TAXA,
    quality_grade: 'research',
    per_page: '0',
  });
  const resp = await fetch(`${INAT}/observations/species_counts?${params}`, { signal });
  if (!resp.ok) throw new Error(`iNaturalist returned ${resp.status} during the coastal check.`);
  return ((await resp.json()).total_results || 0) >= COASTAL_MIN_SPECIES;
}

/**
 * Species observed within the extended radius but not within the base
 * radius, for the groups that can be marine. The caller decides which of
 * these are actually marine (via WoRMS).
 */
export async function fetchOffshoreCandidates(location, baseIds, signal) {
  const results = await Promise.allSettled(
    OFFSHORE_GROUP_KEYS.map((key) => fetchGroupSpecies(GROUP_BY_KEY[key], { ...location, radiusKm: EXTENDED_RADIUS_KM }, signal)),
  );
  const out = [];
  for (const r of results) {
    if (r.status !== 'fulfilled') continue;
    for (const sp of r.value.species) if (!baseIds.has(sp.id)) out.push(sp);
  }
  return out;
}
