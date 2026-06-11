// Update the static result data from API-Football. Intended to run in CI
// (GitHub Actions, see .github/workflows/update-results.yml), which commits any
// changes so Netlify rebuilds. Run locally with:
//
//   API_FOOTBALL_KEY=xxxx node scripts/update-results.mjs
//
// What it does (frugal: ~2 requests/run, free plan is 100/day):
//  - fetches all WK 2026 fixtures, links each to our match (by stored apiId or
//    by kickoff time), fills knockout teams as brackets resolve, and writes the
//    120-minute score (penalty shoot-outs excluded) for finished matches;
//  - fetches the tournament top scorers into scorers.json;
//  - once the final is played, resolves the bonus outcomes (winner, top scorer,
//    most goals scored / conceded) into outcomes.json.
//
// It never marks matches "live" (that is shown client-side via the live
// function) so reruns don't produce noisy commits mid-match.
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import {
  WC_LEAGUE_ID,
  WC_SEASON,
  apiGet,
  resolveTeamId,
  FINISHED_STATUSES,
} from './lib/api-football.mjs';

const DATA = join(dirname(fileURLToPath(import.meta.url)), '..', 'src', 'data');
const read = (name) => JSON.parse(readFileSync(join(DATA, name), 'utf8'));
const writeIfChanged = (name, data) => {
  const next = JSON.stringify(data, null, 2) + '\n';
  const prev = readFileSync(join(DATA, name), 'utf8');
  if (next === prev) return false;
  writeFileSync(join(DATA, name), next);
  return true;
};

const KEY = process.env.API_FOOTBALL_KEY;
const log = (...a) => console.log('[update-results]', ...a);
const TIME_TOLERANCE_MS = 90 * 60 * 1000; // match a fixture to our match if within 90 min

async function main() {
  if (!KEY) {
    console.error('[update-results] API_FOOTBALL_KEY is not set — aborting.');
    process.exit(1);
  }

  const matches = read('matches.json');
  const fixtures = await apiGet('fixtures', { league: WC_LEAGUE_ID, season: WC_SEASON }, KEY, { logFn: log });
  log(`fetched ${fixtures.length} fixtures from API-Football`);

  const byApiId = new Map(matches.filter((m) => m.apiId != null).map((m) => [m.apiId, m]));
  const ms = (iso) => new Date(iso).getTime();

  let linked = 0;
  let scored = 0;
  let teamsFilled = 0;

  for (const fx of fixtures) {
    const apiId = fx.fixture?.id;
    const dateMs = ms(fx.fixture?.date);
    const statusShort = fx.fixture?.status?.short;
    const homeId = resolveTeamId(fx.teams?.home?.name);
    const awayId = resolveTeamId(fx.teams?.away?.name);

    // Find our match: by stored apiId, else by kickoff time (closest within tolerance).
    let match = byApiId.get(apiId);
    if (!match) {
      let best = null;
      let bestDiff = Infinity;
      for (const m of matches) {
        if (m.apiId != null) continue;
        const diff = Math.abs(ms(m.kickoff) - dateMs);
        if (diff > TIME_TOLERANCE_MS) continue;
        // If our match already has teams, require them to match (either orientation).
        if (m.homeTeamId && m.awayTeamId && homeId && awayId) {
          const same = m.homeTeamId === homeId && m.awayTeamId === awayId;
          const swapped = m.homeTeamId === awayId && m.awayTeamId === homeId;
          if (!same && !swapped) continue;
        }
        if (diff < bestDiff) { best = m; bestDiff = diff; }
      }
      match = best;
      if (match) { match.apiId = apiId; byApiId.set(apiId, match); linked++; }
    }
    if (!match) continue;

    // Fill knockout teams as the bracket resolves.
    if (!match.homeTeamId && homeId) { match.homeTeamId = homeId; teamsFilled++; }
    if (!match.awayTeamId && awayId) { match.awayTeamId = awayId; teamsFilled++; }

    // Write the 120-minute score for finished matches (API `goals` excludes the
    // penalty shoot-out and includes extra time — exactly our rule).
    if (FINISHED_STATUSES.has(statusShort) && fx.goals?.home != null && fx.goals?.away != null) {
      const result = { home: fx.goals.home, away: fx.goals.away };
      const changed =
        match.status !== 'finished' ||
        match.result?.home !== result.home ||
        match.result?.away !== result.away;
      match.status = 'finished';
      match.result = result;
      // Remember who won (for the final / bonus), incl. on penalties.
      if (fx.teams?.home?.winner) match.winnerTeamId = match.homeTeamId;
      else if (fx.teams?.away?.winner) match.winnerTeamId = match.awayTeamId;
      if (changed) scored++;
    }
  }

  // --- Top scorers -------------------------------------------------------
  let scorers = read('scorers.json');
  try {
    const top = await apiGet('players/topscorers', { league: WC_LEAGUE_ID, season: WC_SEASON }, KEY, { logFn: log });
    const next = top
      .map((row) => {
        const stat = row.statistics?.[0];
        const goals = stat?.goals?.total ?? 0;
        return { player: row.player?.name ?? '', teamId: resolveTeamId(stat?.team?.name) ?? '', goals };
      })
      .filter((s) => s.player && s.goals > 0)
      .slice(0, 40);
    if (next.length) scorers = next;
    log(`top scorers: ${scorers.length}`);
  } catch (err) {
    log(`top scorers fetch failed (${err.message}) — keeping existing scorers.json`);
  }

  // --- Bonus outcomes (only once the final is played) --------------------
  const outcomes = read('outcomes.json');
  const final = matches.find((m) => m.round === 'final');
  if (final && final.status === 'finished' && final.winnerTeamId) {
    const goalsFor = new Map();
    const goalsAgainst = new Map();
    for (const m of matches) {
      if (m.status !== 'finished' || !m.result || !m.homeTeamId || !m.awayTeamId) continue;
      goalsFor.set(m.homeTeamId, (goalsFor.get(m.homeTeamId) ?? 0) + m.result.home);
      goalsFor.set(m.awayTeamId, (goalsFor.get(m.awayTeamId) ?? 0) + m.result.away);
      goalsAgainst.set(m.homeTeamId, (goalsAgainst.get(m.homeTeamId) ?? 0) + m.result.away);
      goalsAgainst.set(m.awayTeamId, (goalsAgainst.get(m.awayTeamId) ?? 0) + m.result.home);
    }
    const top = (map) => [...map.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? '';
    outcomes.winnerTeamId = final.winnerTeamId;
    outcomes.mostScoredTeamId = top(goalsFor);
    outcomes.mostConcededTeamId = top(goalsAgainst);
    if (scorers[0]?.player) outcomes.topScorer = scorers[0].player;
    log('final played — bonus outcomes resolved');
  }

  // --- Write ------------------------------------------------------------
  const wroteMatches = writeIfChanged('matches.json', matches);
  const wroteScorers = writeIfChanged('scorers.json', scorers);
  const wroteOutcomes = writeIfChanged('outcomes.json', outcomes);

  log(
    `linked ${linked} fixtures, filled ${teamsFilled} knockout teams, ${scored} new/changed results. ` +
      `wrote: matches=${wroteMatches} scorers=${wroteScorers} outcomes=${wroteOutcomes}`,
  );
}

main().catch((err) => {
  console.error('[update-results]', err);
  process.exit(1);
});
