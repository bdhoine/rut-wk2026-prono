// Update the static result data from the free WK 2026 API (worldcup26.ir).
// Intended to run in CI (GitHub Actions, see .github/workflows/update-results.yml),
// which commits any changes so Netlify rebuilds. Run locally with:
//
//   npm run results:update      (no API key needed)
//
// What it does:
//  - fetches all 104 matches, links each to our match (by stored apiId, team
//    pair, or kickoff wall-clock + round), fills knockout teams as brackets
//    resolve, and writes finished scores;
//  - aggregates goal scorers into scorers.json;
//  - once the final is played, resolves the bonus outcomes (winner, top scorer,
//    most goals scored / conceded) into outcomes.json.
//
// It never marks matches "live" (that is shown client-side via the live
// function) so reruns don't produce noisy commits mid-match.
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import {
  getGames,
  resolveTeamId,
  gameStatus,
  parseScorers,
  wallclockFromLocal,
  wallclockFromKickoff,
} from './lib/worldcup.mjs';

const DATA = join(dirname(fileURLToPath(import.meta.url)), '..', 'src', 'data');
const read = (name) => JSON.parse(readFileSync(join(DATA, name), 'utf8'));
const writeIfChanged = (name, data) => {
  const next = JSON.stringify(data, null, 2) + '\n';
  if (next === readFileSync(join(DATA, name), 'utf8')) return false;
  writeFileSync(join(DATA, name), next);
  return true;
};
const log = (...a) => console.log('[update-results]', ...a);
const ids = (g) => ({ home: resolveTeamId(g.home_team_name_en), away: resolveTeamId(g.away_team_name_en) });

async function main() {
  const matches = read('matches.json');
  // The free API is occasionally flaky (transient 500s) — retry a few times.
  const games = await getGames({ retries: 5, timeoutMs: 15000 });
  log(`fetched ${games.length} matches from worldcup26.ir`);

  const gById = new Map(games.map((g) => [String(g.id), g]));
  const used = new Set();
  let linked = 0;
  let scored = 0;
  let teamsFilled = 0;

  for (const m of matches) {
    let g = m.apiId != null ? gById.get(String(m.apiId)) : null;

    // Link by team pair (group + resolved knockout).
    if (!g && m.homeTeamId && m.awayTeamId) {
      g = games.find((x) => {
        if (used.has(x.id)) return false;
        const { home, away } = ids(x);
        return (
          (home === m.homeTeamId && away === m.awayTeamId) ||
          (home === m.awayTeamId && away === m.homeTeamId)
        );
      });
    }
    // Otherwise by kickoff wall-clock + round (knockout before teams are known).
    if (!g) {
      const wc = wallclockFromKickoff(m.kickoff);
      const cands = games.filter(
        (x) => !used.has(x.id) && x.type === m.round && wallclockFromLocal(x.local_date) === wc,
      );
      if (cands.length === 1) g = cands[0];
    }
    if (!g) continue;

    used.add(g.id);
    if (m.apiId == null) { m.apiId = Number(g.id); linked++; }

    const { home: hId, away: aId } = ids(g);
    if (!m.homeTeamId && hId) { m.homeTeamId = hId; teamsFilled++; }
    if (!m.awayTeamId && aId) { m.awayTeamId = aId; teamsFilled++; }

    if (gameStatus(g) === 'finished') {
      const home = parseInt(g.home_score, 10);
      const away = parseInt(g.away_score, 10);
      if (Number.isFinite(home) && Number.isFinite(away)) {
        const changed = m.status !== 'finished' || m.result?.home !== home || m.result?.away !== away;
        m.status = 'finished';
        m.result = { home, away };
        if (home > away) m.winnerTeamId = m.homeTeamId;
        else if (away > home) m.winnerTeamId = m.awayTeamId;
        if (changed) scored++;
      }
    }
  }

  // --- Top scorers (aggregated from goal lists) --------------------------
  let scorers = read('scorers.json');
  try {
    const tally = new Map(); // player -> { goals, teamId }
    for (const g of games) {
      const { home: hId, away: aId } = ids(g);
      for (const name of parseScorers(g.home_scorers)) {
        const cur = tally.get(name) ?? { goals: 0, teamId: hId ?? '' };
        cur.goals++; tally.set(name, cur);
      }
      for (const name of parseScorers(g.away_scorers)) {
        const cur = tally.get(name) ?? { goals: 0, teamId: aId ?? '' };
        cur.goals++; tally.set(name, cur);
      }
    }
    const next = [...tally.entries()]
      .map(([player, v]) => ({ player, teamId: v.teamId, goals: v.goals }))
      .filter((s) => s.player && s.goals > 0)
      .sort((a, b) => b.goals - a.goals || a.player.localeCompare(b.player, 'nl'))
      .slice(0, 40);
    if (next.length) scorers = next;
    log(`top scorers: ${scorers.length}`);
  } catch (err) {
    log(`scorer aggregation failed (${err.message}) — keeping existing scorers.json`);
  }

  // --- Bonus outcomes (only once the final is played) --------------------
  const outcomes = read('outcomes.json');
  const final = matches.find((m) => m.round === 'final');
  if (final && final.status === 'finished' && final.winnerTeamId) {
    const gf = new Map();
    const ga = new Map();
    for (const m of matches) {
      if (m.status !== 'finished' || !m.result || !m.homeTeamId || !m.awayTeamId) continue;
      gf.set(m.homeTeamId, (gf.get(m.homeTeamId) ?? 0) + m.result.home);
      gf.set(m.awayTeamId, (gf.get(m.awayTeamId) ?? 0) + m.result.away);
      ga.set(m.homeTeamId, (ga.get(m.homeTeamId) ?? 0) + m.result.away);
      ga.set(m.awayTeamId, (ga.get(m.awayTeamId) ?? 0) + m.result.home);
    }
    const top = (map) => [...map.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? '';
    outcomes.winnerTeamId = final.winnerTeamId;
    outcomes.mostScoredTeamId = top(gf);
    outcomes.mostConcededTeamId = top(ga);
    if (scorers[0]?.player) outcomes.topScorer = scorers[0].player;
    log('final played — bonus outcomes resolved');
  }

  const wM = writeIfChanged('matches.json', matches);
  const wS = writeIfChanged('scorers.json', scorers);
  const wO = writeIfChanged('outcomes.json', outcomes);
  log(
    `linked ${linked} new, filled ${teamsFilled} knockout teams, ${scored} new/changed results. ` +
      `wrote: matches=${wM} scorers=${wS} outcomes=${wO}`,
  );
}

main().catch((err) => {
  console.error('[update-results]', err);
  process.exit(1);
});
