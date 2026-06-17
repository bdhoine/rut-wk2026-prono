// Netlify Function (v2): live WK 2026 scores from ESPN's public soccer API.
// No API key is needed.
//
// Served at /.netlify/functions/live — the reserved functions namespace, which
// the Astro adapter's catch-all redirect never shadows.
//
// ESPN's scoreboard responds in well under a second, so — unlike the old slow
// provider — we just fetch it directly per request. A short module-scope cache
// (L1) plus CDN cache-control headers keep ESPN hits down to roughly one per
// minute regardless of traffic, so no scheduled refresher / blob is needed.
import { getEvents, liveMatchesFromEvents, liveWindowDates } from '../../scripts/lib/espn.mjs';

const TTL_MS = 60 * 1000; // serve the cached payload for up to a minute
let mem = null; // { ts, payload }

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

export default async function handler() {
  // L1 hot cache — also shields ESPN from bursts within the TTL.
  if (mem && Date.now() - mem.ts < TTL_MS) {
    return json({ ...mem.payload, cached: true, ageSeconds: ageSeconds(mem.ts) });
  }
  try {
    const events = await getEvents({ dates: liveWindowDates(), timeoutMs: 8000, retries: 1 });
    const payload = { ok: true, updatedAt: new Date().toISOString(), matches: liveMatchesFromEvents(events) };
    mem = { ts: Date.now(), payload };
    return json(payload);
  } catch {
    // Serve the last good payload if we have one, else a soft error.
    if (mem) return json({ ...mem.payload, stale: true, ageSeconds: ageSeconds(mem.ts) });
    return json({ ok: false, error: 'fetch-failed', matches: [] });
  }
}
