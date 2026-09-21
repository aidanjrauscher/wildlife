/**
 * Vercel serverless function: NatureServe state species list for one animal
 * group, cached at the edge for a week since heritage-program data changes
 * slowly. Proxying keeps ~17 upstream requests per state from being repeated
 * by every visitor.
 *
 * GET /api/natureserve?state=PA&group=reptiles
 */
import { fetchStateSpecies, GROUP_CLASSES } from '../src/lib/natureserveCore.js';

const STATES = new Set('AL AK AZ AR CA CO CT DE DC FL GA HI ID IL IN IA KS KY LA ME MD MA MI MN MS MO MT NE NV NH NJ NM NY NC ND OH OK OR PA RI SC SD TN TX UT VT VA WA WV WI WY'.split(' '));

function sendJson(res, status, body, cacheControl = 'no-store') {
  res.statusCode = status;
  res.setHeader('content-type', 'application/json; charset=utf-8');
  res.setHeader('cache-control', cacheControl);
  res.end(JSON.stringify(body));
}

export default async function handler(req, res) {
  const params = new URL(req.url ?? '/', 'http://localhost').searchParams;
  const state = (params.get('state') || '').toUpperCase();
  const group = params.get('group') || '';
  if (!STATES.has(state)) return sendJson(res, 400, { error: 'Invalid state code.' });
  if (!GROUP_CLASSES[group]) return sendJson(res, 400, { error: 'Invalid group.' });
  try {
    const species = await fetchStateSpecies(state, GROUP_CLASSES[group], AbortSignal.timeout(25_000));
    return sendJson(res, 200, { state, group, count: species.length, species }, 'public, s-maxage=604800, stale-while-revalidate=2592000');
  } catch (err) {
    return sendJson(res, 502, { error: `NatureServe is unavailable: ${err.message}` });
  }
}
