// Shared client for ESPN's public soccer API (no key required), scoped to the
// FIFA World Cup (league slug `fifa.world`). Replaces the old worldcup26.ir
// client. Used by the results updater (scripts/update-results.mjs) and the
// Netlify live-scores function (netlify/functions/live*.mjs).
//
// The scoreboard endpoint returns, per event:
//  - id, date (UTC ISO)
//  - status.type: state ("pre" | "in" | "post"), name ("STATUS_HALFTIME" …),
//    completed; plus status.displayClock ("63'", "45'+6'") and status.period
//  - competitions[0].competitors[]: team.displayName / team.id, score, homeAway
//  - competitions[0].details[]: scoring plays (scoringPlay, ownGoal,
//    penaltyKick, clock.displayValue, team.id, athletesInvolved[].displayName)
//
// One scoreboard request with a date range returns all 104 matches.

export const LEAGUE = 'fifa.world';
export const SCOREBOARD = `https://site.api.espn.com/apis/site/v2/sports/soccer/${LEAGUE}/scoreboard`;
// Full WK 2026 window (kickoffs 11 Jun – 19 Jul) — pulls every match at once.
export const TOURNAMENT_DATES = '20260611-20260719';

const norm = (s) =>
  String(s ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z]/g, '');

// English country names ESPN may use -> our team id (teams.json `id`, which
// equals the iso except for gbeng/gbsct whose iso is gb-eng/gb-sct).
const ALIASES = {
  mx: ['Mexico'],
  za: ['South Africa'],
  kr: ['South Korea', 'Korea Republic', 'Republic of Korea'],
  cz: ['Czechia', 'Czech Republic'],
  ca: ['Canada'],
  ba: ['Bosnia and Herzegovina', 'Bosnia & Herzegovina', 'Bosnia-Herzegovina', 'Bosnia'],
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

/** Resolve an English team name to our team id (iso), or null if unknown
 *  (e.g. a bracket placeholder like "Group A Winner"). */
export function resolveTeamId(name) {
  return ISO_BY_NORM.get(norm(name)) ?? null;
}

/** home/away competitor + the competition object of an event. */
function sides(e) {
  const comp = e?.competitions?.[0] ?? {};
  const cs = comp.competitors ?? [];
  const home = cs.find((c) => c.homeAway === 'home') ?? cs[0];
  const away = cs.find((c) => c.homeAway === 'away') ?? cs[1];
  return { comp, home, away };
}

/** Match status from an event. */
export function eventStatus(e) {
  const t = e?.status?.type ?? {};
  if (t.state === 'in') return 'live';
  if (t.state === 'post' || t.completed) return 'finished';
  return 'scheduled';
}

/** { homeName, awayName, homeId, awayId, homeScore, awayScore, homeShootout,
 *  awayShootout, winnerId } for an event; ids are null for unresolved bracket
 *  placeholders, scores null when absent. `homeShootout`/`awayShootout` are the
 *  penalty-shootout goals (only when a knockout is decided on penalties);
 *  `winnerId` is ESPN's declared winner (set even when the 120-min score is
 *  level, i.e. after penalties). */
export function eventSides(e) {
  const { home, away } = sides(e);
  const num = (v) => { const n = parseInt(v, 10); return Number.isFinite(n) ? n : null; };
  const winner = home?.winner ? home : away?.winner ? away : null;
  return {
    homeName: home?.team?.displayName ?? null,
    awayName: away?.team?.displayName ?? null,
    homeId: resolveTeamId(home?.team?.displayName),
    awayId: resolveTeamId(away?.team?.displayName),
    homeScore: num(home?.score),
    awayScore: num(away?.score),
    homeShootout: typeof home?.shootoutScore === 'number' ? home.shootoutScore : null,
    awayShootout: typeof away?.shootoutScore === 'number' ? away.shootoutScore : null,
    winnerId: winner ? resolveTeamId(winner.team?.displayName) : null,
  };
}

/** Map live events to the payload shape the UI consumes (live function + its
 *  scheduled refresher both build this). Only matches with both teams resolved. */
export function liveMatchesFromEvents(events) {
  return (events ?? [])
    .filter((e) => eventStatus(e) === 'live')
    .map((e) => {
      const { home, away } = sides(e);
      const ht = /HALFTIME/i.test(e?.status?.type?.name ?? '');
      const clock = String(e?.status?.displayClock ?? '').replace(/'\s*$/, ''); // UI re-adds the '
      return {
        homeTeamId: resolveTeamId(home?.team?.displayName),
        awayTeamId: resolveTeamId(away?.team?.displayName),
        home: home?.team?.displayName ?? null,
        away: away?.team?.displayName ?? null,
        goalsHome: parseInt(home?.score, 10) || 0,
        goalsAway: parseInt(away?.score, 10) || 0,
        elapsed: ht ? null : clock || null,
        status: ht ? 'HT' : 'LIVE',
        scorers: goalsFromEvent(e),
      };
    })
    .filter((m) => m.homeTeamId && m.awayTeamId);
}

/** Per-goal events of a match as [{ player, teamId, minute, og?, pen? }] in
 *  scoring order, shootout kicks excluded. Own goals are kept (flagged `og`);
 *  ESPN attributes them to the team the goal counts FOR (verified: an own goal
 *  by a Morocco player carries Haiti's team id), so `teamId` is always the
 *  side the goal belongs to on the scoreboard. Used for the match-card /
 *  match-page scorer lines (committed via matches.json and in the live payload). */
export function goalsFromEvent(e) {
  const { comp } = sides(e);
  const ourByEspnId = new Map();
  for (const c of comp.competitors ?? []) ourByEspnId.set(String(c.team?.id), resolveTeamId(c.team?.displayName));
  const out = [];
  for (const p of comp.details ?? []) {
    if (!p.scoringPlay || p.shootout) continue;
    const player = (p.athletesInvolved ?? [])[0]?.displayName;
    const teamId = ourByEspnId.get(String(p.team?.id));
    if (!player || !teamId) continue;
    const goal = {
      player,
      teamId,
      minute: p.clock?.displayValue ?? '',
      order: typeof p.clock?.value === 'number' ? p.clock.value : 0,
    };
    if (p.ownGoal) goal.og = true;
    if (p.penaltyKick) goal.pen = true;
    out.push(goal);
  }
  // clock.value is continuous across periods (2nd half continues past 2700s),
  // so a plain sort restores scoring order; drop the helper key afterwards.
  return out.sort((a, b) => a.order - b.order).map(({ order, ...g }) => g);
}

/** Goal scorers of an event as [{ player, teamId }], own goals excluded (they
 *  aren't the player's tally) — used to aggregate top scorers. */
export function scorersFromEvent(e) {
  const { comp } = sides(e);
  const ourByEspnId = new Map();
  for (const c of comp.competitors ?? []) ourByEspnId.set(String(c.team?.id), resolveTeamId(c.team?.displayName));
  const out = [];
  for (const p of comp.details ?? []) {
    if (!p.scoringPlay || p.ownGoal || p.shootout) continue; // skip own goals + shootout
    const name = (p.athletesInvolved ?? [])[0]?.displayName;
    if (name) out.push({ player: name, teamId: ourByEspnId.get(String(p.team?.id)) ?? '' });
  }
  return out;
}

// --- Knockout bracket linking -------------------------------------------
// A canonical token for a knockout source, so our matches.json placeholders and
// ESPN's competitor labels link without depending on (mismatching) dates.
//   group winner   1A      group 2nd   2A      best third  3:ABCDF
//   R32 N winner   W:r32:N    R16 N winner W:r16:N
//   QF  N winner   W:qf:N     SF  N winner W:sf:N   SF N loser L:sf:N
const UPPER_LETTERS = (s) => (String(s).match(/[A-L]/g) ?? []).sort().join('');

/** ESPN competitor label -> token (null for a real, resolved team). */
export function espnSlotToken(label) {
  const s = String(label ?? '');
  let m;
  if ((m = s.match(/^Group ([A-L]) Winner$/i))) return `1${m[1].toUpperCase()}`;
  if ((m = s.match(/^Group ([A-L]) 2nd Place$/i))) return `2${m[1].toUpperCase()}`;
  if (/^Third Place Group/i.test(s)) return `3:${UPPER_LETTERS(s.replace(/^Third Place Group/i, ''))}`;
  if ((m = s.match(/^Round of 32 (\d+) Winner$/i))) return `W:r32:${m[1]}`;
  if ((m = s.match(/^Round of 16 (\d+) Winner$/i))) return `W:r16:${m[1]}`;
  if ((m = s.match(/^Quarterfinal (\d+) Winner$/i))) return `W:qf:${m[1]}`;
  if ((m = s.match(/^Semifinal (\d+) Winner$/i))) return `W:sf:${m[1]}`;
  if ((m = s.match(/^Semifinal (\d+) Loser$/i))) return `L:sf:${m[1]}`;
  return null;
}

/** Our matches.json placeholder -> the same token. */
export function ourSlotToken(label) {
  const s = String(label ?? '');
  let m;
  if ((m = s.match(/^Winnaar Groep ([A-L])$/i))) return `1${m[1].toUpperCase()}`;
  if ((m = s.match(/^2e Groep ([A-L])$/i))) return `2${m[1].toUpperCase()}`;
  if (/^Beste 3e/i.test(s)) return `3:${UPPER_LETTERS(s.match(/\(([^)]+)\)/)?.[1] ?? '')}`;
  if ((m = s.match(/^Winnaar R32-(\d+)$/i))) return `W:r32:${m[1]}`;
  if ((m = s.match(/^Winnaar 1\/8 (\d+)$/i))) return `W:r16:${m[1]}`; // 1/8 finale = round of 16
  if ((m = s.match(/^Winnaar KF (\d+)$/i))) return `W:qf:${m[1]}`; // KF = kwartfinale
  if ((m = s.match(/^Winnaar HF (\d+)$/i))) return `W:sf:${m[1]}`; // HF = halve finale
  if ((m = s.match(/^Verliezer HF (\d+)$/i))) return `L:sf:${m[1]}`;
  return null;
}

/** Order-insensitive key for a (home, away) source pair; null if incomplete. */
export function slotPairKey(a, b) {
  return a && b ? [a, b].sort().join('|') : null;
}

// --- Fetching ------------------------------------------------------------

/** YYYYMMDD (UTC) for a Date. */
export function ymd(d) {
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getUTCFullYear()}${p(d.getUTCMonth() + 1)}${p(d.getUTCDate())}`;
}

/** A small ±1 day window around now, for the live poller. */
export function liveWindowDates(now = Date.now()) {
  const day = 86_400_000;
  return `${ymd(new Date(now - day))}-${ymd(new Date(now + day))}`;
}

/** Fetch JSON with a timeout and retries. Throws on failure. */
async function fetchJson(url, { timeoutMs = 12000, retries = 1 } = {}) {
  for (let attempt = 0; ; attempt++) {
    try {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), timeoutMs);
      const res = await fetch(url, { headers: { accept: 'application/json' }, signal: ctrl.signal });
      clearTimeout(t);
      if (!res.ok) throw Object.assign(new Error(`ESPN HTTP ${res.status}`), { status: res.status });
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

/** All scoreboard events for a date range (default: the whole tournament). */
export async function getEvents({ dates = TOURNAMENT_DATES, timeoutMs, retries } = {}) {
  const json = await fetchJson(`${SCOREBOARD}?dates=${dates}&limit=300`, { timeoutMs, retries });
  return json.events ?? [];
}

const SUMMARY = `https://site.api.espn.com/apis/site/v2/sports/soccer/${LEAGUE}/summary`;

/** Full summary payload for an event — carries the shootout kicks and the
 *  play-by-play commentary the scoreboard lacks. One fetch serves both
 *  `shootoutFromSummary` and `momentumFromSummary`. */
export async function fetchSummary(eventId, opts = {}) {
  return fetchJson(`${SUMMARY}?event=${eventId}`, opts);
}

/** Penalty-shootout kicks from a summary payload. Returns
 *  `[{ teamId, kicks: boolean[] }]` (kicks in shot order, true = scored), or
 *  null when there's no shootout. */
export function shootoutFromSummary(json) {
  const arr = json?.shootout;
  if (!Array.isArray(arr) || arr.length < 2) return null;
  return arr.map((t) => ({
    teamId: resolveTeamId(t.team),
    kicks: [...(t.shots ?? [])].sort((a, b) => (a.shotNumber ?? 0) - (b.shotNumber ?? 0)).map((s) => !!s.didScore),
  }));
}

// TV-style momentum: weight of each commentary play type toward the acting
// team's pressure. Goals dominate, attempts count by how threatening they were.
const MOMENTUM_WEIGHTS = [
  [/^(own )?goal\b|^penalty - scored/i, 6], // "Goal", "Goal - Header/Volley/Free-kick", "Own Goal", "Penalty - Scored"
  [/shot on target/i, 3],
  [/shot blocked/i, 2],
  [/shot off target/i, 1],
  [/corner awarded/i, 1],
];
// End of each period in 5-minute buckets: 45' → 9, 90' → 18, 105' → 21, 120' → 24.
const PERIOD_END_BUCKET = { 1: 9, 2: 18, 3: 21, 4: 24 };

/** Momentum per 5 minutes from a summary payload's commentary, signed toward
 *  the given home side (+ = home pressure, − = away). Returns
 *  `{ bucketMin: 5, values: number[] }` (18 buckets, 24 with extra time), or
 *  null when the commentary is missing or has no weighable plays. */
export function momentumFromSummary(json, homeTeamId) {
  const plays = (json?.commentary ?? []).map((c) => c?.play).filter(Boolean);
  let maxPeriod = 2;
  const scored = [];
  for (const p of plays) {
    const typeText = p?.type?.text ?? '';
    const weight = MOMENTUM_WEIGHTS.find(([re]) => re.test(typeText))?.[1];
    if (!weight) continue;
    const teamId = resolveTeamId(p?.team?.displayName);
    if (!teamId) continue;
    const period = p?.period?.number ?? 1;
    if (period > 4) continue; // shootout "period" carries no momentum
    const seconds = typeof p?.clock?.value === 'number' ? p.clock.value : null;
    if (seconds == null) continue;
    // Own goals need no flip: like the scoreboard details, the commentary
    // attributes them to the team the goal counts FOR (verified: "Own Goal by
    // Aymen Hussein, Iraq" carries team = Norway).
    const forHome = teamId === homeTeamId;
    // clock.value caps at the period's regulation end (45'+4' → 2700s), so
    // stoppage-time plays clamp into the period's last bucket.
    const bucket = Math.min(Math.floor(seconds / 300), (PERIOD_END_BUCKET[period] ?? 18) - 1);
    scored.push({ bucket, delta: forHome ? weight : -weight });
    if (period > maxPeriod) maxPeriod = period;
  }
  if (!scored.length) return null;
  // Extra time always runs to 120' — pad to 24 buckets even when the last ET
  // half had no weighable play.
  const values = new Array(PERIOD_END_BUCKET[maxPeriod > 2 ? 4 : 2]).fill(0);
  for (const { bucket, delta } of scored) values[Math.min(bucket, values.length - 1)] += delta;
  return { bucketMin: 5, values };
}

/** Link our matches.json entries to ESPN events. Each match resolves via, in
 *  order: its stored apiId (ESPN event id), the resolved team pair (group +
 *  played knockouts), or the knockout bracket-token pair (unresolved
 *  knockouts). Returns { link: Map<matchId, event>, unlinked: matchId[] }. */
export function linkMatches(matches, events) {
  const byId = new Map(events.map((e) => [String(e.id), e]));
  const used = new Set();
  const link = new Map();
  const unlinked = [];
  for (const m of matches) {
    let e = null;
    if (m.apiId != null) {
      const c = byId.get(String(m.apiId));
      if (c && !used.has(c.id)) e = c;
    }
    if (!e && m.homeTeamId && m.awayTeamId) {
      e =
        events.find((x) => {
          if (used.has(x.id)) return false;
          const s = eventSides(x);
          return (
            (s.homeId === m.homeTeamId && s.awayId === m.awayTeamId) ||
            (s.homeId === m.awayTeamId && s.awayId === m.homeTeamId)
          );
        }) ?? null;
    }
    if (!e) {
      const want = slotPairKey(ourSlotToken(m.homePlaceholder), ourSlotToken(m.awayPlaceholder));
      if (want) {
        e =
          events.find((x) => {
            if (used.has(x.id)) return false;
            const s = eventSides(x);
            return slotPairKey(espnSlotToken(s.homeName), espnSlotToken(s.awayName)) === want;
          }) ?? null;
      }
    }
    if (e) {
      used.add(e.id);
      link.set(m.id, e);
    } else {
      unlinked.push(m.id);
    }
  }
  return { link, unlinked };
}
