// Netlify Function (v2): live WK 2026 scores, proxied from API-Football so the
// API key stays server-side and the request rate is bounded regardless of how
// many visitors are watching.
//
// Caching is layered:
//  - the CDN caches the response for 5 minutes (Netlify-CDN-Cache-Control), so
//    repeated visits in that window never even invoke the function;
//  - a module-scope cache covers warm invocations as a second line of defence;
//  - on an API error / rate-limit (429) we serve the last good payload as
//    `stale`, or an empty `ok:false` result the UI can show gracefully.
//
// The client (Live toggle on /programma) fetches this once when toggled on and
// again on "Ververs" — there is no automatic polling.
import { API_BASE, WC_LEAGUE_ID, WC_SEASON, resolveTeamId } from '../../scripts/lib/api-football.mjs';

// Served at /.netlify/functions/live — the reserved functions namespace, which
// the Astro adapter's catch-all redirect never shadows.

const TTL_MS = 5 * 60 * 1000;
let cache = null; // { ts, payload }

function normalize(fixtures) {
  return fixtures
    .map((fx) => {
      const homeId = resolveTeamId(fx.teams?.home?.name);
      const awayId = resolveTeamId(fx.teams?.away?.name);
      return {
        homeTeamId: homeId,
        awayTeamId: awayId,
        home: fx.teams?.home?.name ?? null,
        away: fx.teams?.away?.name ?? null,
        goalsHome: fx.goals?.home ?? 0,
        goalsAway: fx.goals?.away ?? 0,
        elapsed: fx.fixture?.status?.elapsed ?? null,
        status: fx.fixture?.status?.short ?? null,
      };
    })
    .filter((m) => m.homeTeamId && m.awayTeamId);
}

function json(body, { maxAge = 300 } = {}) {
  return new Response(JSON.stringify(body), {
    headers: {
      'content-type': 'application/json; charset=utf-8',
      // Browser + Netlify CDN caching: the function isn't re-invoked within maxAge.
      'cache-control': `public, max-age=${maxAge}`,
      'netlify-cdn-cache-control': `public, max-age=${maxAge}, stale-while-revalidate=60`,
    },
  });
}

export default async function handler() {
  const key = process.env.API_FOOTBALL_KEY;
  if (!key) {
    return json({ ok: false, error: 'no-key', matches: [] }, { maxAge: 60 });
  }

  // Warm-invocation cache.
  if (cache && Date.now() - cache.ts < TTL_MS) {
    return json({ ...cache.payload, cached: true, ageSeconds: Math.round((Date.now() - cache.ts) / 1000) });
  }

  const url = new URL(`${API_BASE}/fixtures`);
  url.searchParams.set('league', String(WC_LEAGUE_ID));
  url.searchParams.set('season', String(WC_SEASON));
  url.searchParams.set('live', 'all');

  try {
    const res = await fetch(url, { headers: { 'x-apisports-key': key } });
    if (res.status === 429) throw Object.assign(new Error('rate-limit'), { code: 'rate-limit' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const body = await res.json();
    if (body.errors && (Array.isArray(body.errors) ? body.errors.length : Object.keys(body.errors).length)) {
      throw new Error('api-error');
    }
    const payload = { ok: true, updatedAt: new Date().toISOString(), matches: normalize(body.response ?? []) };
    cache = { ts: Date.now(), payload };
    return json(payload);
  } catch (err) {
    // Serve the last good payload if we have one, otherwise a friendly empty result.
    if (cache) {
      return json(
        { ...cache.payload, stale: true, ageSeconds: Math.round((Date.now() - cache.ts) / 1000) },
        { maxAge: 60 },
      );
    }
    const code = err?.code === 'rate-limit' ? 'rate-limit' : 'fetch-failed';
    return json({ ok: false, error: code, matches: [] }, { maxAge: 60 });
  }
}
