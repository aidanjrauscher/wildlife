import { fetchStateSpecies, GROUP_CLASSES, binomial, NS_API, NS_SITE } from './natureserveCore';
import { GROUPS } from './groups';

/**
 * Verification statuses:
 *   native       NatureServe lists the species as native in the state
 *   introduced   listed as exotic / introduced in the state
 *   present      listed in the state without a native or exotic flag
 *   undocumented mammal, reptile or amphibian not on the state's list at all (likely escaped pet, vagrant or misidentification)
 *   visitor      bird not on the state's list; NatureServe tracks breeding/resident birds, so this usually means a migrant, winter visitor or vagrant
 *   unverified   fish or invertebrate not on the list; NatureServe's coverage of those groups is incomplete, so absence means little
 */
export const STATUS_META = {
  native: { label: 'Native', short: 'Native', color: 'bg-emerald-600 text-white', icon: '✓' },
  introduced: { label: 'Introduced', short: 'Introduced', color: 'bg-amber-500 text-white', icon: '!' },
  present: { label: 'Recorded in state', short: 'Recorded', color: 'bg-sky-600 text-white', icon: '•' },
  undocumented: { label: 'Not documented in state', short: 'Not documented', color: 'bg-rose-600 text-white', icon: '?' },
  visitor: { label: 'Migrant or vagrant', short: 'Migrant/vagrant', color: 'bg-indigo-500 text-white', icon: '↗' },
  unverified: { label: 'Not verifiable', short: 'Unverified', color: 'bg-stone-400 text-white', icon: '–' },
};

export const SRANK_LABELS = {
  S1: 'Critically imperiled in state',
  S2: 'Imperiled in state',
  S3: 'Vulnerable in state',
  S4: 'Apparently secure in state',
  S5: 'Secure in state',
  SH: 'Possibly extirpated from state',
  SX: 'Presumed extirpated from state',
  SNA: 'Rank not applicable (usually introduced or accidental)',
  SNR: 'Not yet ranked in state',
  SU: 'Unrankable in state',
};

export function describeSRank(srank) {
  if (!srank) return null;
  const base = srank.replace(/[BNM]$/, '').split(/[?]/)[0];
  const label = SRANK_LABELS[base] || SRANK_LABELS[base.slice(0, 2)] || null;
  const season = /B$/.test(srank) ? ' (breeding)' : /N$/.test(srank) ? ' (non-breeding)' : /M$/.test(srank) ? ' (migrant)' : '';
  return label ? `${srank}: ${label}${season}` : srank;
}

const listCache = new Map(); // `${state}:${group}` -> Promise<index>

function buildIndex(species) {
  const index = new Map();
  for (const rec of species) {
    index.set(rec.name, rec);
    for (const syn of rec.synonyms) if (!index.has(syn)) index.set(syn, rec);
  }
  return index;
}

async function loadViaApi(state, group, signal) {
  const resp = await fetch(`/api/natureserve?state=${state}&group=${group}`, { signal, headers: { accept: 'application/json' } });
  const ct = resp.headers.get('content-type') || '';
  if (!resp.ok || !ct.includes('application/json')) throw new Error(`api ${resp.status}`);
  return (await resp.json()).species;
}

/**
 * Load (and cache) one state's list for one group, via our API with a direct
 * fallback. The cached promise is deliberately not tied to any caller's abort
 * signal, so a search that is cancelled part-way cannot poison the cache for
 * the next one; callers check their own signal after awaiting.
 */
export function loadStateGroup(state, group) {
  const key = `${state}:${group}`;
  if (!listCache.has(key)) {
    const p = (async () => {
      try {
        return buildIndex(await loadViaApi(state, group, AbortSignal.timeout(30_000)));
      } catch {
        return buildIndex(await fetchStateSpecies(state, GROUP_CLASSES[group], AbortSignal.timeout(60_000)));
      }
    })();
    p.catch(() => listCache.delete(key));
    listCache.set(key, p);
  }
  return listCache.get(key);
}

/** Load all groups for a state, calling onGroup(groupKey, index) as each arrives unless the signal has been aborted. */
export async function loadState(state, onGroup, signal) {
  const results = await Promise.allSettled(
    GROUPS.map(async (g) => {
      const index = await loadStateGroup(state, g.key);
      if (!signal?.aborted) onGroup(g.key, index);
      return index;
    }),
  );
  return results.filter((r) => r.status === 'rejected').map((r) => r.reason);
}

/** Look up one species in a loaded index. Returns { status, record } or null if the index is not loaded. */
export function verify(species, index) {
  if (!index) return null;
  const rec = index.get(binomial(species.name));
  if (rec) {
    const status = rec.exotic && !rec.native ? 'introduced' : rec.native ? 'native' : 'present';
    return { status, record: rec };
  }
  if (species.group === 'birds') return { status: 'visitor', record: null };
  if (species.group === 'fish' || species.group === 'invertebrates') return { status: 'unverified', record: null };
  return { status: 'undocumented', record: null };
}

const distributionCache = new Map();

/**
 * Full NatureServe distribution for one species: status and rank in every US
 * state and Canadian province where it is recorded. Used for the range map.
 */
export function fetchDistribution(scientificName) {
  const key = binomial(scientificName);
  if (!distributionCache.has(key)) {
    const p = (async () => {
      const resp = await fetch(NS_API, {
        method: 'POST',
        headers: { 'content-type': 'application/json', accept: 'application/json' },
        body: JSON.stringify({
          criteriaType: 'species',
          textCriteria: [{ paramType: 'quickSearch', searchToken: key }],
          pagingOptions: { page: 0, recordsPerPage: 20 },
        }),
        signal: AbortSignal.timeout(20_000),
      });
      if (!resp.ok) throw new Error(`NatureServe returned ${resp.status}`);
      const data = await resp.json();
      const rows = (data.results || []).filter((r) => binomial(r.scientificName) === key);
      if (!rows.length) return null;
      // Prefer the species-level record; fold subspecies records into it.
      rows.sort((a, b) => a.scientificName.split(/\s+/).length - b.scientificName.split(/\s+/).length);
      const main = rows[0];
      const states = {};
      const provinces = {};
      for (const r of rows) {
        for (const n of r.nations || []) {
          const target = n.nationCode === 'US' ? states : n.nationCode === 'CA' ? provinces : null;
          if (!target) continue;
          for (const sub of n.subnations || []) {
            const cur = target[sub.subnationCode] || { srank: null, native: false, exotic: false };
            cur.native = cur.native || sub.native === true;
            cur.exotic = cur.exotic || sub.exotic === true;
            if (r === main || !cur.srank) cur.srank = sub.roundedSRank || cur.srank;
            target[sub.subnationCode] = cur;
          }
        }
      }
      return {
        name: main.scientificName,
        common: main.primaryCommonName || null,
        grank: main.roundedGRank || null,
        url: main.nsxUrl ? `${NS_SITE}${main.nsxUrl}` : null,
        states,
        provinces,
      };
    })();
    p.catch(() => distributionCache.delete(key));
    distributionCache.set(key, p);
  }
  return distributionCache.get(key);
}

/** Map-coloring category for one state's entry. */
export function stateCategory(entry) {
  if (!entry) return 'absent';
  const base = (entry.srank || '').replace(/[BNM?]/g, '');
  if (base === 'SX' || base === 'SH') return 'extirpated';
  if (entry.exotic && !entry.native) return 'introduced';
  if (entry.native) return 'native';
  return 'present';
}
