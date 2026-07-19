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
//  - aggregates goal scorers (from finished events) into scorers.json.
//
// Bonus outcomes are NOT resolved here: the site derives them at build time
// (resolveOutcomes() in src/lib/data.ts, tie-aware) once every match is
// finished; outcomes.json is a manual override only.
//
// It never marks matches "live" (that is shown client-side via the live
// function) so reruns don't produce noisy commits mid-match.
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import {
  getEvents,
  linkMatches,
  eventSides,
  eventStatus,
  scorersFromEvent,
  goalsFromEvent,
  fetchSummary,
  shootoutFromSummary,
  momentumFromSummary,
} from './lib/espn.mjs';

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
      // Winner: prefer ESPN's declared winner (also set after a penalty shootout
      // when the 120-min score is level); otherwise infer from the score.
      if (s.winnerId === m.homeTeamId || s.winnerId === m.awayTeamId) m.winnerTeamId = s.winnerId;
      else if (home > away) m.winnerTeamId = m.homeTeamId;
      else if (away > home) m.winnerTeamId = m.awayTeamId;
      // Per-goal scorers (player, minute, own goal / penalty flags) for the
      // match-card and match-page scorer lines. Entries carry our team ids, so
      // no home/away flip is needed.
      const goals = goalsFromEvent(e);
      if (goals.length) m.goals = goals;
      // Penalty shootout score (knockouts decided on penalties), in our orientation.
      if (s.homeShootout != null && s.awayShootout != null) {
        const prev = m.penalties ?? {};
        m.penalties = flip
          ? { home: s.awayShootout, away: s.homeShootout }
          : { home: s.homeShootout, away: s.awayShootout };
        // Keep the previously enriched kick sequences so the summary fetch
        // below stays a one-off per match.
        if (prev.homeKicks?.length) m.penalties.homeKicks = prev.homeKicks;
        if (prev.awayKicks?.length) m.penalties.awayKicks = prev.awayKicks;
      }
      // Enrich from the summary endpoint (one fetch per match, skipped once
      // both are stored): the per-kick shootout sequence for the detail view
      // and the per-5-minutes momentum curve for the match page.
      const needKicks = !!m.penalties && !(m.penalties.homeKicks?.length && m.penalties.awayKicks?.length);
      const needMomentum = !m.momentum?.values?.length;
      if (needKicks || needMomentum) {
        try {
          const summary = await fetchSummary(e.id, { retries: 2, timeoutMs: 12000 });
          if (needKicks) {
            const kicks = shootoutFromSummary(summary);
            const homeKicks = kicks?.find((k) => k.teamId === m.homeTeamId)?.kicks;
            const awayKicks = kicks?.find((k) => k.teamId === m.awayTeamId)?.kicks;
            if (homeKicks?.length) m.penalties.homeKicks = homeKicks;
            if (awayKicks?.length) m.penalties.awayKicks = awayKicks;
          }
          if (needMomentum) {
            const momentum = momentumFromSummary(summary, m.homeTeamId);
            if (momentum) m.momentum = momentum;
          }
        } catch (err) {
          log(`summary detail fetch failed for ${m.id} (${err.message})`);
        }
      }
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

  // Bonus outcomes are NOT written here: the site resolves them at build time
  // from the committed match/scorer data (resolveOutcomes() in src/lib/data.ts)
  // once every match is finished — tie-aware (a shared lead counts for every
  // pick among the tied leaders), which a single-value write here can't
  // express. outcomes.json stays a manual override only.

  const wM = writeIfChanged('matches.json', matches);
  const wS = writeIfChanged('scorers.json', scorers);
  log(
    `filled ${teamsFilled} knockout teams, ${scored} new/changed results, ${kickoffsFixed} kickoffs synced. ` +
      `wrote: matches=${wM} scorers=${wS}`,
  );
}

main().catch((err) => {
  console.error('[update-results]', err);
  process.exit(1);
});
