// Netlify Function (v2): live WK 2026 scores from the free worldcup26.ir API.
// No API key is needed.
//
// Served at /.netlify/functions/live — the reserved functions namespace, which
// the Astro adapter's catch-all redirect never shadows.
//
// The upstream API is slow (10-16s to respond), which exceeds Netlify's ~10s
// synchronous-function limit, so we never fetch it in the request path on a
// warm cache. Instead the scheduled function live-refresh.mjs polls it in the
// background and writes the latest payload to a Netlify Blob; this endpoint
// just reads that blob and returns it (fast). The blob read is also mirrored
// into a module-scope cache (L1) for hot invocations.
//
// Fallback: if the blob is missing (right after a deploy, before the scheduler
// has run, or in local dev where the scheduler doesn't fire) we do a direct
// fetch with a generous timeout. On a deployed warm cache this path is never
// taken, so the slow upstream can't make the endpoint exceed the function limit.
import { getStore } from '@netlify/blobs';
import { getGames, liveMatchesFromGames } from '../../scripts/lib/worldcup.mjs';

const TTL_MS = 60 * 1000; // a blob younger than this is "fresh"
const STORE = 'live-scores';
const KEY = 'latest';
let mem = null; // L1: { ts, payload }

function json(body, { maxAge = 60 } = {}) {
  return new Response(JSON.stringify(body), {
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': `public, max-age=${maxAge}`,
      'netlify-cdn-cache-control': `public, max-age=${maxAge}, stale-while-revalidate=30`,
    },
  });
}

const ageSeconds = (ts) => Math.round((Date.now() - ts) / 1000);

async function readBlob() {
  try {
    return await getStore(STORE).get(KEY, { type: 'json' });
  } catch {
    return null;
  }
}

async function writeBlob(entry) {
  try {
    await getStore(STORE).setJSON(KEY, entry);
  } catch {
    /* blobs unavailable (e.g. some local setups) — fine, L1 still serves */
  }
}

export default async function handler() {
  // L1 hot cache.
  if (mem && Date.now() - mem.ts < TTL_MS) {
    return json({ ...mem.payload, cached: true, ageSeconds: ageSeconds(mem.ts) });
  }

  // L2: the blob kept warm by the scheduled refresher.
  const blob = await readBlob();
  if (blob?.payload) {
    mem = blob;
    const fresh = Date.now() - blob.ts < TTL_MS;
    return json({ ...blob.payload, [fresh ? 'cached' : 'stale']: true, ageSeconds: ageSeconds(blob.ts) });
  }

  // Cold start / local dev: no blob yet. Fetch directly with a generous
  // timeout (only reachable when there's no warm cache to fall back on).
  try {
    const games = await getGames({ timeoutMs: 24000, retries: 0 });
    const payload = { ok: true, updatedAt: new Date().toISOString(), matches: liveMatchesFromGames(games) };
    mem = { ts: Date.now(), payload };
    await writeBlob(mem);
    return json(payload);
  } catch {
    return json({ ok: false, error: 'fetch-failed', matches: [] });
  }
}
