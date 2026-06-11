// Netlify Function (v2): live WK 2026 scores from the free worldcup26.ir API.
// No API key is needed; this proxy mainly adds a short cache and a stable shape.
//
// Served at /.netlify/functions/live — the reserved functions namespace, which
// the Astro adapter's catch-all redirect never shadows.
//
// Caching (60s): the CDN caches the response (Netlify-CDN-Cache-Control) so most
// hits never invoke the function, and a module-scope cache covers warm
// invocations. On an upstream error we serve the last good payload as `stale`,
// or an empty `ok:false` result the UI shows gracefully.
import { getGames, resolveTeamId, gameStatus } from '../../scripts/lib/worldcup.mjs';

const TTL_MS = 60 * 1000;
let cache = null; // { ts, payload }

function liveMatches(games) {
  return games
    .filter((g) => gameStatus(g) === 'live')
    .map((g) => ({
      homeTeamId: resolveTeamId(g.home_team_name_en),
      awayTeamId: resolveTeamId(g.away_team_name_en),
      home: g.home_team_name_en ?? null,
      away: g.away_team_name_en ?? null,
      goalsHome: parseInt(g.home_score, 10) || 0,
      goalsAway: parseInt(g.away_score, 10) || 0,
      elapsed: null, // worldcup26 reports status only, not the minute
      status: 'LIVE',
    }))
    .filter((m) => m.homeTeamId && m.awayTeamId);
}

function json(body, { maxAge = 60 } = {}) {
  return new Response(JSON.stringify(body), {
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': `public, max-age=${maxAge}`,
      'netlify-cdn-cache-control': `public, max-age=${maxAge}, stale-while-revalidate=30`,
    },
  });
}

export default async function handler() {
  if (cache && Date.now() - cache.ts < TTL_MS) {
    return json({ ...cache.payload, cached: true, ageSeconds: Math.round((Date.now() - cache.ts) / 1000) });
  }
  try {
    const games = await getGames({ timeoutMs: 8000, retries: 0 });
    const payload = { ok: true, updatedAt: new Date().toISOString(), matches: liveMatches(games) };
    cache = { ts: Date.now(), payload };
    return json(payload);
  } catch {
    if (cache) {
      return json({ ...cache.payload, stale: true, ageSeconds: Math.round((Date.now() - cache.ts) / 1000) });
    }
    return json({ ok: false, error: 'fetch-failed', matches: [] });
  }
}
