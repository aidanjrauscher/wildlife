import type { IncomingMessage, ServerResponse } from 'node:http';
import { INAT, fetchJson, query, sendJson, stripHtml } from './_shared';
import { extractSizeCm } from '../src/lib/text';
import type { SpeciesDetail } from '../src/lib/types';

interface InatTaxaResponse {
  results: {
    id: number;
    wikipedia_summary?: string | null;
    conservation_status?: { status_name?: string; status?: string } | null;
  }[];
}

const MAX_IDS = 30;

/**
 * GET /api/taxa?ids=1,2,3   (up to 30 iNaturalist taxon ids)
 * Returns Wikipedia summaries + parsed sizes, used for descriptive matching.
 */
export default async function handler(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const raw = (query(req).get('ids') ?? '').split(',').map((s) => s.trim()).filter(Boolean);
  const ids = [...new Set(raw.map(Number).filter((n) => Number.isInteger(n) && n > 0))].sort((a, b) => a - b);
  if (ids.length === 0 || ids.length > MAX_IDS) {
    sendJson(res, 400, { error: `ids must contain 1–${MAX_IDS} integer taxon ids` });
    return;
  }
  try {
    const data = await fetchJson<InatTaxaResponse>(`${INAT}/taxa/${ids.join(',')}?locale=en&preferred_place_id=1`);
    const details: Record<number, SpeciesDetail> = {};
    for (const t of data.results) {
      const summary = t.wikipedia_summary ? stripHtml(t.wikipedia_summary) : '';
      const cs = t.conservation_status;
      details[t.id] = {
        id: t.id,
        summary,
        conservationStatus: cs?.status_name ?? cs?.status ?? null,
        sizeCm: extractSizeCm(summary),
      };
    }
    // Taxa we asked for but iNat did not return (inactive ids etc.)
    for (const id of ids) if (!details[id]) details[id] = { id, summary: '', conservationStatus: null, sizeCm: null };
    sendJson(res, 200, details, 'public, s-maxage=604800, stale-while-revalidate=2592000');
  } catch (err) {
    console.error('taxa error', err);
    sendJson(res, 502, { error: `iNaturalist request failed (${(err as Error).message})` });
  }
}
