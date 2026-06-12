// Shared client for the free, open WK 2026 API at https://worldcup26.ir
// (no API key required). Used by both the GitHub Actions results updater
// (scripts/update-results.mjs) and the Netlify live-scores function
// (netlify/functions/live.mjs).
//
// /get/games returns all 104 matches with: id, home/away_team_id, home/away_score,
// home/away_scorers, group, matchday, local_date ("MM/DD/YYYY HH:mm", venue-local),
// finished ("TRUE"/"FALSE"), time_elapsed ("notstarted"/"live"/"finished"),
// type (group|r32|r16|qf|sf|third|final — same ids as our rounds), and team names
// (home/away_team_name_en) or placeholders (home/away_team_label) for the bracket.

export const API_BASE = 'https://worldcup26.ir';

const norm = (s) =>
  String(s ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z]/g, '');

// English country names the API may use -> our team id (teams.json `id`, which
// equals the iso except for gbeng/gbsct whose iso is gb-eng/gb-sct).
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
  gbsct: ['Scotland'],
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
  cd: ['DR Congo', 'Congo DR', 'Democratic Republic of Congo', 'Democratic Republic of the Congo'],
  uz: ['Uzbekistan'],
  co: ['Colombia'],
  gbeng: ['England'],
  hr: ['Croatia'],
  gh: ['Ghana'],
  pa: ['Panama'],
};

const ISO_BY_NORM = (() => {
  const m = new Map();
  for (const [id, names] of Object.entries(ALIASES)) for (const n of names) m.set(norm(n), id);
  return m;
})();

/** Resolve an English team name to our team id (iso), or null if unknown. */
export function resolveTeamId(name) {
  return ISO_BY_NORM.get(norm(name)) ?? null;
}

/** Match status from a game record. */
export function gameStatus(g) {
  if (g.time_elapsed === 'live') return 'live';
  if (g.finished === 'TRUE' || g.time_elapsed === 'finished') return 'finished';
  return 'scheduled';
}

/** Map raw games to the live-scores payload shape the UI consumes (the live
 *  function and its scheduled refresher both build this). */
export function liveMatchesFromGames(games) {
  return (games ?? [])
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

/** "MM/DD/YYYY HH:mm" -> "YYYY-MM-DD HH:mm" (venue-local wall clock). */
export function wallclockFromLocal(s) {
  const m = String(s ?? '').match(/(\d{2})\/(\d{2})\/(\d{4})\s+(\d{2}):(\d{2})/);
  return m ? `${m[3]}-${m[1]}-${m[2]} ${m[4]}:${m[5]}` : null;
}
/** ISO kickoff (with offset) -> "YYYY-MM-DD HH:mm" wall clock (offset ignored). */
export function wallclockFromKickoff(iso) {
  const m = String(iso ?? '').match(/(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/);
  return m ? `${m[1]}-${m[2]}-${m[3]} ${m[4]}:${m[5]}` : null;
}

/** Tolerant parse of a "home_scorers"/"away_scorers" string into player names. */
export function parseScorers(raw) {
  if (!raw || raw === 'null') return [];
  const inner = String(raw).replace(/^[\s{]+|[\s}]+$/g, '');
  if (!inner) return [];
  return inner
    .split(',')
    .map((tok) =>
      tok
        .replace(/[“”"']/g, '')
        .replace(/\s*\d+(\+\d+)?\s*['’]?\s*$/, '') // drop trailing minute (9', 90+2')
        .trim(),
    )
    .filter(Boolean);
}

/** Fetch JSON with a timeout and one retry. Throws on failure. */
export async function fetchJson(path, { timeoutMs = 12000, retries = 1 } = {}) {
  const url = `${API_BASE}${path}`;
  for (let attempt = 0; ; attempt++) {
    try {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), timeoutMs);
      const res = await fetch(url, { headers: { accept: 'application/json' }, signal: ctrl.signal });
      clearTimeout(t);
      if (!res.ok) throw Object.assign(new Error(`worldcup26 HTTP ${res.status}`), { status: res.status });
      return await res.json();
    } catch (err) {
      if (attempt < retries) {
        await new Promise((r) => setTimeout(r, 1500 * (attempt + 1)));
        continue;
      }
      throw err;
    }
  }
}

/** All 104 matches. */
export async function getGames(opts) {
  const json = await fetchJson('/get/games', opts);
  return json.games ?? [];
}
