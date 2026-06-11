// Shared API-Football helpers, used by both the GitHub Actions results updater
// (scripts/update-results.mjs) and the Netlify live-scores function
// (netlify/functions/live.mjs).
//
// API-Football (https://www.api-football.com) — direct api-sports.io host.
// Auth header: x-apisports-key. Free plan = 100 requests/day, so callers must
// be frugal (the updater runs a few times/day; the live function caches 5 min).

export const API_BASE = 'https://v3.football.api-sports.io';
export const WC_LEAGUE_ID = 1; // FIFA World Cup
export const WC_SEASON = 2026;

const norm = (s) =>
  String(s ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z]/g, '');

// Map each of our team ids (== iso in teams.json) to the country names
// API-Football may use (English + common variants). Normalised on lookup.
const ALIASES = {
  mx: ['Mexico'],
  za: ['South Africa'],
  kr: ['South Korea', 'Korea Republic', 'Republic of Korea'],
  cz: ['Czechia', 'Czech Republic'],
  ca: ['Canada'],
  ba: ['Bosnia and Herzegovina', 'Bosnia & Herzegovina', 'Bosnia'],
  qa: ['Qatar'],
  ch: ['Switzerland'],
  br: ['Brazil'],
  ma: ['Morocco'],
  ht: ['Haiti'],
  'gb-sct': ['Scotland'],
  us: ['USA', 'United States', 'United States of America'],
  py: ['Paraguay'],
  au: ['Australia'],
  tr: ['Turkey', 'Turkiye', 'Türkiye'],
  de: ['Germany'],
  cw: ['Curacao', 'Curaçao'],
  ci: ['Ivory Coast', "Cote d'Ivoire", "Côte d'Ivoire"],
  ec: ['Ecuador'],
  nl: ['Netherlands', 'Holland'],
  jp: ['Japan'],
  se: ['Sweden'],
  tn: ['Tunisia'],
  be: ['Belgium'],
  eg: ['Egypt'],
  ir: ['Iran', 'IR Iran'],
  nz: ['New Zealand'],
  es: ['Spain'],
  cv: ['Cape Verde', 'Cabo Verde', 'Cape Verde Islands'],
  sa: ['Saudi Arabia'],
  uy: ['Uruguay'],
  fr: ['France'],
  sn: ['Senegal'],
  iq: ['Iraq'],
  no: ['Norway'],
  ar: ['Argentina'],
  dz: ['Algeria'],
  at: ['Austria'],
  jo: ['Jordan'],
  pt: ['Portugal'],
  cd: ['DR Congo', 'Congo DR', 'Democratic Republic of Congo', 'Congo Democratic Republic'],
  uz: ['Uzbekistan'],
  co: ['Colombia'],
  'gb-eng': ['England'],
  hr: ['Croatia'],
  gh: ['Ghana'],
  pa: ['Panama'],
};

const ISO_BY_NORM = (() => {
  const m = new Map();
  for (const [iso, names] of Object.entries(ALIASES)) {
    for (const n of names) m.set(norm(n), iso);
  }
  return m;
})();

/** Resolve an API-Football team name to our team id (iso), or null if unknown. */
export function resolveTeamId(apiName) {
  return ISO_BY_NORM.get(norm(apiName)) ?? null;
}

/** Statuses API-Football reports for an in-play match. */
export const LIVE_STATUSES = new Set(['1H', 'HT', '2H', 'ET', 'BT', 'P', 'SUSP', 'INT', 'LIVE']);
/** Statuses meaning the match is over (regular time or after extra time / pens). */
export const FINISHED_STATUSES = new Set(['FT', 'AET', 'PEN']);

/**
 * GET an API-Football endpoint. Returns the parsed `response` array.
 * Retries once on HTTP 429 (rate limit). Throws on other failures.
 * Logs remaining daily quota when the header is present (logFn optional).
 */
export async function apiGet(path, params, key, { logFn = () => {}, retries = 1 } = {}) {
  if (!key) throw new Error('Missing API-Football key (API_FOOTBALL_KEY).');
  const url = new URL(`${API_BASE}/${path}`);
  for (const [k, v] of Object.entries(params ?? {})) url.searchParams.set(k, String(v));

  for (let attempt = 0; ; attempt++) {
    const res = await fetch(url, { headers: { 'x-apisports-key': key } });
    const remaining = res.headers.get('x-ratelimit-requests-remaining');
    if (remaining != null) logFn(`quota remaining today: ${remaining}`);

    if (res.status === 429) {
      if (attempt < retries) {
        const wait = 2000 * (attempt + 1);
        logFn(`rate limited (429), retrying in ${wait}ms`);
        await new Promise((r) => setTimeout(r, wait));
        continue;
      }
      throw Object.assign(new Error('API-Football rate limit (429)'), { status: 429 });
    }
    if (!res.ok) throw Object.assign(new Error(`API-Football HTTP ${res.status}`), { status: res.status });

    const json = await res.json();
    // API-Football returns errors in a 200 body under `errors`.
    if (json.errors && (Array.isArray(json.errors) ? json.errors.length : Object.keys(json.errors).length)) {
      throw new Error(`API-Football error: ${JSON.stringify(json.errors)}`);
    }
    return json.response ?? [];
  }
}
