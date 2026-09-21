import { RADIUS_KM } from './groups';

/**
 * GBIF aggregates museum specimens and institutional surveys alongside
 * iNaturalist. Restricting by basisOfRecord gives counts that do not depend
 * on community observations.
 */
const GBIF = 'https://api.gbif.org/v1';
const INSTITUTIONAL = ['MATERIAL_SAMPLE', 'OCCURRENCE', 'MACHINE_OBSERVATION', 'MATERIAL_CITATION', 'LIVING_SPECIMEN'];

async function count(params, signal) {
  const resp = await fetch(`${GBIF}/occurrence/search?${params}&limit=0`, { signal });
  if (!resp.ok) return null;
  return (await resp.json()).count ?? null;
}

export async function fetchGbifEvidence(scientificName, lat, lng, signal, radiusKm = RADIUS_KM) {
  const match = await fetch(`${GBIF}/species/match?name=${encodeURIComponent(scientificName)}`, { signal }).then((r) => r.json());
  if (!match?.usageKey || match.matchType === 'NONE') return null;
  const key = match.usageKey;
  const near = `taxonKey=${key}&geoDistance=${lat},${lng},${radiusKm}km`;
  const inst = INSTITUTIONAL.map((b) => `basisOfRecord=${b}`).join('&');
  const [specimens, institutional, total] = await Promise.all([
    count(`${near}&basisOfRecord=PRESERVED_SPECIMEN`, signal),
    count(`${near}&${inst}`, signal),
    count(near, signal),
  ]);
  return {
    key,
    specimens,
    institutional,
    total,
    mapUrl: `https://www.gbif.org/occurrence/map?taxon_key=${key}&geo_distance=${lat},${lng},${radiusKm}km`,
    speciesUrl: `https://www.gbif.org/species/${key}`,
  };
}
