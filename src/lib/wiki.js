import { describe } from './describe';

/**
 * Fetches plain-text lead sections from English Wikipedia for many species at
 * once (20 titles per request, which is the API maximum for extracts).
 * Titles come from iNaturalist's wikipedia_url when present, otherwise the
 * scientific name, which Wikipedia usually redirects to the right article.
 */
const WIKI = 'https://en.wikipedia.org/w/api.php';
const BATCH = 20;
const CONCURRENCY = 3;

const detailCache = new Map();

export function getCachedDetail(id) {
  return detailCache.get(id);
}

function titleFor(sp) {
  if (sp.wikipediaUrl) {
    try {
      const path = new URL(sp.wikipediaUrl).pathname;
      const title = decodeURIComponent(path.replace(/^\/wiki\//, '')).replace(/_/g, ' ');
      if (title) return title;
    } catch {
      /* fall through */
    }
  }
  return sp.name;
}

async function fetchBatch(batch, signal) {
  const titles = batch.map((b) => b.title);
  const params = new URLSearchParams({
    action: 'query',
    prop: 'extracts',
    exintro: '1',
    explaintext: '1',
    exlimit: String(BATCH),
    redirects: '1',
    titles: titles.join('|'),
    format: 'json',
    formatversion: '2',
    origin: '*',
  });
  const resp = await fetch(`${WIKI}?${params}`, { signal });
  if (!resp.ok) throw new Error(`Wikipedia returned ${resp.status}`);
  const data = await resp.json();
  const query = data.query || {};

  // Map requested title -> final title through normalization and redirects.
  const rename = new Map();
  for (const n of query.normalized || []) rename.set(n.from, n.to);
  const redirect = new Map();
  for (const r of query.redirects || []) redirect.set(r.from, r.to);
  const byTitle = new Map();
  for (const p of query.pages || []) byTitle.set(p.title, p);

  const out = new Map();
  for (const { sp, title } of batch) {
    let t = rename.get(title) || title;
    t = redirect.get(t) || t;
    const page = byTitle.get(t);
    const extract = page && !page.missing ? (page.extract || '').trim() : '';
    out.set(sp.id, { summary: extract, wikiTitle: page && !page.missing ? page.title : null, ...describe(extract) });
  }
  return out;
}

/**
 * Load descriptions for all species not already cached. onProgress(done,
 * total) is called after each batch; onBatch(map) delivers new details.
 */
export async function loadDetails(speciesList, { onBatch, onProgress }, signal) {
  const pending = speciesList.filter((sp) => !detailCache.has(sp.id));
  const total = pending.length;
  let done = 0;
  onProgress?.(0, total);
  if (!total) return;

  const batches = [];
  for (let i = 0; i < pending.length; i += BATCH) {
    batches.push(pending.slice(i, i + BATCH).map((sp) => ({ sp, title: titleFor(sp) })));
  }

  let cursor = 0;
  async function worker() {
    while (cursor < batches.length) {
      const batch = batches[cursor++];
      let result;
      try {
        result = await fetchBatch(batch, signal);
      } catch (err) {
        if (err.name === 'AbortError') return;
        // On failure, record empty details so we don't retry forever this session.
        result = new Map(batch.map(({ sp }) => [sp.id, { summary: '', wikiTitle: null, colors: [], sizeCm: null, size: null }]));
      }
      for (const [id, detail] of result) detailCache.set(id, detail);
      done += batch.length;
      onBatch?.(result);
      onProgress?.(done, total);
    }
  }
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, batches.length) }, worker));
}
