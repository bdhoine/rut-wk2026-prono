// Update the static result data from ESPN's public soccer API (no key needed).
// Intended to run in CI (GitHub Actions, see .github/workflows/update-results.yml),
// which commits any changes so Netlify rebuilds. Run locally with:
//
//   npm run results:update
//
// What it does:
//  - fetches all 104 matches, links each to our match (by stored apiId = ESPN
//    event id, resolved team pair, or knockout bracket-token pair), fills
//    knockout teams as brackets resolve, and writes finished scores;
//  - aggregates goal scorers (from finished events) into scorers.json;
//  - once the final is played, resolves the bonus outcomes (winner, top scorer,
//    most goals scored / conceded) into outcomes.json.
//
// It never marks matches "live" (that is shown client-side via the live
// function) so reruns don't produce noisy commits mid-match.
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { getEvents, linkMatches, eventSides, eventStatus, scorersFromEvent } from './lib/espn.mjs';

const DATA = join(dirname(fileURLToPath(import.meta.url)), '..', 'src', 'data');
const read = (name) => JSON.parse(readFileSync(join(DATA, name), 'utf8'));
const writeIfChanged = (name, data) => {
  const next = JSON.stringify(data, null, 2) + '\n';
  if (next === readFileSync(join(DATA, name), 'utf8')) return false;
  writeFileSync(join(DATA, name), next);
  return true;
};
const log = (...a) => console.log('[update-results]', ...a);

async function main() {
  const matches = read('matches.json');
  // ESPN is fast and reliable, but retry a few times for transient blips.
  const events = await getEvents({ retries: 5, timeoutMs: 15000 });
  log(`fetched ${events.length} matches from ESPN`);

  const { link, unlinked } = linkMatches(matches, events);
  if (unlinked.length) log(`WARNING: ${unlinked.length} matches did not link: ${unlinked.join(', ')}`);

  let teamsFilled = 0;
  let scored = 0;
  let kickoffsFixed = 0;

  for (const m of matches) {
    const e = link.get(m.id);
    if (!e) continue;
    m.apiId = Number(e.id);

    // Keep the kickoff in sync with ESPN. The seed's knockout kickoffs were
    // preliminary (date-only placeholders); FIFA confirms the exact times once
    // the bracket nears. Only rewrite when the instant actually changed so the
    // already-correct group matches don't churn the diff.
    if (e.date && new Date(e.date).getTime() !== new Date(m.kickoff).getTime()) {
      m.kickoff = e.date;
      kickoffsFixed++;
    }

    const s = eventSides(e);
    if (!m.homeTeamId && s.homeId) { m.homeTeamId = s.homeId; teamsFilled++; }
    if (!m.awayTeamId && s.awayId) { m.awayTeamId = s.awayId; teamsFilled++; }

    if (eventStatus(e) === 'finished' && s.homeScore != null && s.awayScore != null && m.homeTeamId && m.awayTeamId) {
      // Map ESPN's home/away scores to our match's orientation.
      const flip = s.homeId === m.awayTeamId && s.awayId === m.homeTeamId;
      const home = flip ? s.awayScore : s.homeScore;
      const away = flip ? s.homeScore : s.awayScore;
      const changed = m.status !== 'finished' || m.result?.home !== home || m.result?.away !== away;
      m.status = 'finished';
      m.result = { home, away };
      if (home > away) m.winnerTeamId = m.homeTeamId;
      else if (away > home) m.winnerTeamId = m.awayTeamId;
      if (changed) scored++;
    }
  }

  // --- Top scorers (aggregated from finished events) ---------------------
  let scorers = read('scorers.json');
  try {
    const tally = new Map(); // player -> { goals, teamId }
    for (const e of events) {
      if (eventStatus(e) !== 'finished') continue; // avoid noisy mid-match commits
      for (const { player, teamId } of scorersFromEvent(e)) {
        const cur = tally.get(player) ?? { goals: 0, teamId: teamId ?? '' };
        cur.goals++;
        if (!cur.teamId && teamId) cur.teamId = teamId;
        tally.set(player, cur);
      }
    }
    // Keep every scorer — no count cap. A cap combined with the alphabetical
    // tiebreak silently drops one-goal scorers whose name sorts late (e.g.
    // Lamine Yamal), so the standing would be missing real goalscorers.
    const next = [...tally.entries()]
      .map(([player, v]) => ({ player, teamId: v.teamId, goals: v.goals }))
      .filter((s) => s.player && s.goals > 0)
      .sort((a, b) => b.goals - a.goals || a.player.localeCompare(b.player, 'nl'));
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
    `filled ${teamsFilled} knockout teams, ${scored} new/changed results, ${kickoffsFixed} kickoffs synced. ` +
      `wrote: matches=${wM} scorers=${wS} outcomes=${wO}`,
  );
}

main().catch((err) => {
  console.error('[update-results]', err);
  process.exit(1);
});
