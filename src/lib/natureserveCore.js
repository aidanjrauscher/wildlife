/**
 * NatureServe Explorer state species lists. Shared by the Vercel function
 * (api/natureserve.js, which adds edge caching) and the browser fallback.
 *
 * NatureServe is maintained by the network of state natural heritage
 * programs, not by community observers, so it serves as an independent
 * cross-reference for whether a species is actually known from a state.
 */
export const NS_API = 'https://explorer.natureserve.org/api/data/speciesSearch';
export const NS_SITE = 'https://explorer.natureserve.org';
const PAGE_SIZE = 100;

/** Taxonomic classes queried for each app group. Fish and invertebrate coverage is partial; bird lists cover breeding/resident species only. */
export const GROUP_CLASSES = {
  mammals: ['Mammalia'],
  birds: ['Aves'],
  reptiles: ['Reptilia', 'Chelonia', 'Crocodylia'], // NatureServe files turtles and crocodilians as their own classes
  amphibians: ['Amphibia'],
  fish: ['Actinopterygii', 'Petromyzontida', 'Chondrichthyes'],
  invertebrates: ['Gastropoda', 'Bivalvia', 'Malacostraca', 'Arachnida'],
};

export function binomial(name) {
  return String(name || '')
    .toLowerCase()
    .replace(/\s+(ssp|subsp|var|f)\.?\s+/g, ' ')
    .split(/\s+/)
    .filter((w) => w && w !== '×')
    .slice(0, 2)
    .join(' ');
}

async function fetchPage(state, cls, page, signal) {
  const body = {
    criteriaType: 'species',
    locationCriteria: [{ paramType: 'subnation', subnation: state, nation: 'US' }],
    speciesTaxonomyCriteria: [{ paramType: 'scientificTaxonomy', level: 'CLASS', scientificTaxonomy: cls, kingdom: 'Animalia' }],
    pagingOptions: { page, recordsPerPage: PAGE_SIZE },
  };
  const resp = await fetch(NS_API, {
    method: 'POST',
    headers: { 'content-type': 'application/json', accept: 'application/json' },
    body: JSON.stringify(body),
    signal,
  });
  if (!resp.ok) throw new Error(`NatureServe returned ${resp.status}`);
  return resp.json();
}

/**
 * Fetch every species of the given classes recorded in a state and collapse
 * subspecies rows into one record per binomial.
 * Returns [{ name, common, native, exotic, srank, grank, synonyms, url }].
 */
export async function fetchStateSpecies(state, classes, signal) {
  const byName = new Map();
  for (const cls of classes) {
    let page = 0;
    let totalPages = 1;
    while (page < totalPages) {
      const data = await fetchPage(state, cls, page, signal);
      totalPages = data.resultsSummary?.totalPages ?? 1;
      for (const r of data.results || []) {
        const sub = (r.nations || []).flatMap((n) => n.subnations || []).find((s) => s.subnationCode === state);
        if (!sub) continue;
        const key = binomial(r.scientificName);
        const isSubspecies = r.scientificName.trim().split(/\s+/).length > 2;
        const rec = byName.get(key) || {
          name: key,
          common: null,
          native: false,
          exotic: false,
          srank: null,
          grank: r.roundedGRank || null,
          synonyms: [],
          url: null,
        };
        rec.native = rec.native || sub.native === true;
        rec.exotic = rec.exotic || sub.exotic === true;
        if (!isSubspecies || !rec.common) {
          rec.common = r.primaryCommonName || rec.common;
          rec.srank = sub.roundedSRank || rec.srank;
          rec.url = r.nsxUrl ? `${NS_SITE}${r.nsxUrl}` : rec.url;
          if (!isSubspecies) rec.grank = r.roundedGRank || rec.grank;
        }
        for (const s of r.speciesGlobal?.synonyms || []) {
          const b = binomial(s);
          if (b && b !== key && !rec.synonyms.includes(b)) rec.synonyms.push(b);
        }
        byName.set(key, rec);
      }
      page += 1;
    }
  }
  return Array.from(byName.values());
}
