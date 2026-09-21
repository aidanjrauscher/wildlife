import { RADIUS_KM } from './groups';

const INAT = 'https://api.inaturalist.org/v1';

/** iNaturalist "Life Stage" controlled term (id 1) and the values we show. */
export const LIFE_STAGES = [
  { key: 'adult', label: 'Adult', valueId: 2 },
  { key: 'juvenile', label: 'Juvenile', valueId: 8 },
  { key: 'larva', label: 'Larva / Tadpole', valueId: 6 },
  { key: 'nymph', label: 'Nymph', valueId: 5 },
  { key: 'egg', label: 'Egg', valueId: 7 },
];

const CLASS_TO_GROUP = { Mammalia: 'mammals', Aves: 'birds', Reptilia: 'reptiles', Amphibia: 'amphibians', Actinopterygii: 'fish' };

export function groupForTaxon(t) {
  if (t.iconic_taxon_name && CLASS_TO_GROUP[t.iconic_taxon_name]) return CLASS_TO_GROUP[t.iconic_taxon_name];
  const ids = t.ancestor_ids || [];
  if (ids.includes(355675)) return 'fish'; // vertebrate but not a tetrapod class
  return 'invertebrates';
}

function photoSizes(url) {
  return {
    square: url,
    medium: url.replace(/\/square\./, '/medium.'),
    large: url.replace(/\/square\./, '/large.'),
    original: url.replace(/\/square\./, '/original.'),
  };
}

export async function fetchTaxon(id, signal) {
  const resp = await fetch(`${INAT}/taxa/${id}?locale=en`, { signal, headers: { accept: 'application/json' } });
  if (!resp.ok) throw new Error(`iNaturalist returned ${resp.status} for this species.`);
  const t = (await resp.json()).results?.[0];
  if (!t) throw new Error('Species not found on iNaturalist.');
  return {
    id: t.id,
    name: t.name,
    common: t.preferred_common_name || null,
    rank: t.rank,
    iconic: t.iconic_taxon_name || null,
    group: groupForTaxon(t),
    wikipediaUrl: t.wikipedia_url || null,
    inatUrl: `https://www.inaturalist.org/taxa/${t.id}`,
    observationsCount: t.observations_count || 0,
    conservationStatus: t.conservation_status?.status_name || null,
    ancestors: (t.ancestors || [])
      .filter((a) => ['class', 'order', 'family', 'genus'].includes(a.rank))
      .map((a) => ({ rank: a.rank, name: a.name, common: a.preferred_common_name || null })),
    photos: (t.taxon_photos || [])
      .filter((tp) => tp.photo?.url)
      .map((tp) => ({
        id: tp.photo.id,
        ...photoSizes(tp.photo.url),
        attribution: tp.photo.attribution || '',
        license: tp.photo.license_code || null,
      })),
  };
}

/** Nearby research-grade observation count for a taxon. */
export async function fetchNearbyCount(id, lat, lng, signal, radiusKm = RADIUS_KM) {
  const params = new URLSearchParams({
    taxon_id: String(id),
    lat: String(lat),
    lng: String(lng),
    radius: String(radiusKm),
    quality_grade: 'research',
    per_page: '0',
  });
  const resp = await fetch(`${INAT}/observations?${params}`, { signal });
  if (!resp.ok) return null;
  return (await resp.json()).total_results ?? null;
}

/**
 * Observation photos annotated with a life stage, so adults and juveniles
 * can be compared. Returns { adult: [...], juvenile: [...], ... } with only
 * stages that have photos.
 */
export async function fetchLifeStagePhotos(id, signal, perStage = 8) {
  const results = await Promise.all(
    LIFE_STAGES.map(async (stage) => {
      const params = new URLSearchParams({
        taxon_id: String(id),
        term_id: '1',
        term_value_id: String(stage.valueId),
        photos: 'true',
        quality_grade: 'research',
        per_page: String(perStage),
        order_by: 'votes',
        order: 'desc',
      });
      try {
        const resp = await fetch(`${INAT}/observations?${params}`, { signal });
        if (!resp.ok) return [stage.key, []];
        const data = await resp.json();
        const photos = [];
        for (const o of data.results || []) {
          const p = o.photos?.[0];
          if (!p?.url) continue;
          photos.push({
            id: p.id,
            ...photoSizes(p.url),
            attribution: p.attribution || '',
            license: p.license_code || null,
            observationUrl: `https://www.inaturalist.org/observations/${o.id}`,
            place: o.place_guess || '',
            date: o.observed_on || '',
          });
        }
        return [stage.key, photos];
      } catch (err) {
        if (err.name === 'AbortError') throw err;
        return [stage.key, []];
      }
    }),
  );
  return Object.fromEntries(results.filter(([, photos]) => photos.length));
}
