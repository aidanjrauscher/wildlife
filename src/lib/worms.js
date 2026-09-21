import { binomial } from './natureserveCore';

/**
 * World Register of Marine Species (WoRMS) habitat flags. Despite the name,
 * WoRMS also holds freshwater and terrestrial taxa when marine_only=false, so
 * it can classify most vertebrates and many invertebrates as marine,
 * brackish, freshwater and/or terrestrial. Maintained by taxonomic editors,
 * not community observers.
 */
const WORMS = 'https://www.marinespecies.org/rest/AphiaRecordsByNames';
const BATCH = 50;
const CONCURRENCY = 3;

const cache = new Map(); // binomial -> record | null

function flag(v) {
  return v === 1 || v === true || v === '1';
}

function normalize(records) {
  if (!Array.isArray(records) || !records.length) return null;
  const rec = records.find((r) => r.status === 'accepted') || records[0];
  return {
    marine: flag(rec.isMarine),
    brackish: flag(rec.isBrackish),
    freshwater: flag(rec.isFreshwater),
    terrestrial: flag(rec.isTerrestrial),
    aphiaId: rec.AphiaID || null,
    valid: rec.valid_name || rec.scientificname || null,
  };
}

async function fetchBatch(names, signal) {
  const params = names.map((n) => `scientificnames%5B%5D=${encodeURIComponent(n)}`).join('&');
  const resp = await fetch(`${WORMS}?${params}&marine_only=false&like=false`, { signal, headers: { accept: 'application/json' } });
  if (resp.status === 204) return names.map(() => null);
  if (!resp.ok) throw new Error(`WoRMS returned ${resp.status}`);
  const data = await resp.json();
  return names.map((_, i) => normalize(data[i]));
}

/**
 * Look up habitat flags for many scientific names. Resolves to a Map of
 * binomial -> record (or null when WoRMS has no entry). onBatch receives each
 * batch's Map as it arrives.
 */
export async function lookupHabitats(scientificNames, { onBatch } = {}, signal) {
  const wanted = [...new Set(scientificNames.map(binomial).filter(Boolean))];
  const pending = wanted.filter((n) => !cache.has(n));
  const batches = [];
  for (let i = 0; i < pending.length; i += BATCH) batches.push(pending.slice(i, i + BATCH));

  let cursor = 0;
  async function worker() {
    while (cursor < batches.length) {
      const batch = batches[cursor++];
      let results;
      try {
        results = await fetchBatch(batch, signal);
      } catch (err) {
        if (err.name === 'AbortError') return;
        results = batch.map(() => null);
      }
      const map = new Map();
      batch.forEach((name, i) => {
        cache.set(name, results[i]);
        map.set(name, results[i]);
      });
      onBatch?.(map);
    }
  }
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, batches.length) }, worker));

  const out = new Map();
  for (const n of wanted) out.set(n, cache.get(n) ?? null);
  return out;
}

export function getCachedHabitat(scientificName) {
  return cache.get(binomial(scientificName));
}
