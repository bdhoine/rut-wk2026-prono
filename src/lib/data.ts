// Data-access + derived-data layer. Loads the static JSON and exposes typed,
// computed views (rankings, standings, match predictions) used by the pages.
import teamsRaw from '@/data/teams.json';
import groupsRaw from '@/data/groups.json';
import matchesRaw from '@/data/matches.json';
import participantsRaw from '@/data/participants.json';
import predictionsRaw from '@/data/predictions.json';
import outcomesRaw from '@/data/outcomes.json';
import settingsRaw from '@/data/settings.json';
import scorersRaw from '@/data/scorers.json';

import type { BonusOutcomes, BonusPicks, Group, Match, Participant, Prediction, Scorer, Settings, Team } from './types';
import { multiplierFor, rankParticipants, scoreMatch, type MatchScore, type RankRow } from './scoring';
import { byKickoff, dayKey, slugify } from './format';
import { prizeFor } from './prizes';

export const teams = teamsRaw as Team[];
export const groups = groupsRaw as Group[];
export const matches = matchesRaw as Match[];
export const participants = participantsRaw as Participant[];
export const predictions = predictionsRaw as Prediction[];
export const outcomes = outcomesRaw as BonusOutcomes;
export const settings = settingsRaw as Settings;

// The WK API only exposes scorers as free-text per-match strings ("Breel Embolo
// 17' (p)", "D. Bobadilla 7(OG)"), so scorers.json can carry trailing minute /
// penalty annotations, own goals, and the same player split across rows. Clean
// the name (everything from the first digit, plus trailing parentheticals),
// drop own goals (they don't count for a player), and merge by clean name.
const cleanScorerName = (s: string) => s.replace(/\s*\d.*$/, '').replace(/\s*\([^)]*\)\s*$/, '').trim();
const isOwnGoal = (s: string) => /\(\s*og\s*\)/i.test(s);
// The API lists some own goals under the team that benefited (and without an
// "(OG)" marker we can't detect it), so the player ends up on the wrong country.
// Correct the nationality by name here so the flag is right.
const SCORER_TEAM_OVERRIDE: Record<string, string> = { 'Mohamed Hany': 'eg' };
function normalizeScorers(raw: Scorer[]): Scorer[] {
  const byName = new Map<string, Scorer>();
  for (const s of raw) {
    if (isOwnGoal(s.player)) continue;
    const player = cleanScorerName(s.player) || s.player;
    const teamId = SCORER_TEAM_OVERRIDE[player] ?? s.teamId;
    const cur = byName.get(player) ?? { player, teamId, goals: 0 };
    cur.goals += s.goals;
    if (teamId) cur.teamId = teamId;
    byName.set(player, cur);
  }
  return [...byName.values()].sort((a, b) => b.goals - a.goals || a.player.localeCompare(b.player, 'nl'));
}
export const scorers = normalizeScorers(scorersRaw as Scorer[]);

const teamById = new Map(teams.map((t) => [t.id, t]));
const matchById = new Map(matches.map((m) => [m.id, m]));
const participantById = new Map(participants.map((p) => [p.id, p]));

export const getTeam = (id: string | null | undefined): Team | undefined => (id ? teamById.get(id) : undefined);
export const getMatch = (id: string): Match | undefined => matchById.get(id);
export const getParticipant = (id: string): Participant | undefined => participantById.get(id);

/** Display label for a match side, falling back to its placeholder.
 *  `short` is the compact name for narrow viewports. */
export function sideLabel(match: Match, side: 'home' | 'away'): { team?: Team; label: string; short: string } {
  const teamId = side === 'home' ? match.homeTeamId : match.awayTeamId;
  const team = getTeam(teamId);
  if (team) return { team, label: team.name, short: team.shortName ?? team.name };
  const placeholder = side === 'home' ? match.homePlaceholder : match.awayPlaceholder;
  const label = placeholder ?? 'TBD';
  const short = label.replace(/^Winnaar /, 'W. ').replace(/^Verliezer /, 'V. ').replace(/^Beste 3e /, '3e ');
  return { label, short };
}

/** Full ranking table (rules.md §4). */
export function ranking(): RankRow[] {
  return rankParticipants(participants, predictions, matches, outcomes, settings);
}

export function positionOf(participantId: string): RankRow | undefined {
  return ranking().find((r) => r.participantId === participantId);
}

// ---- Ranking timeline & day-to-day movements ----------------------------

export interface DaySnapshot {
  day: string; // YYYY-MM-DD (Belgian time)
  posById: Map<string, number>;
  byId: Map<string, RankRow>;
}

/** The standings as they stood at the end of each calendar day that had at
 *  least one finished match. Each snapshot ranks only the matches finished up
 *  to and including that day (bonus outcomes only resolve at the final, i.e.
 *  the last day, so they don't affect earlier snapshots). */
export function rankingTimeline(): DaySnapshot[] {
  const finished = matches.filter((m) => m.status === 'finished' && m.result);
  const days = [...new Set(finished.map((m) => dayKey(m.kickoff)))].sort();
  return days.map((day) => {
    const upTo = finished.filter((m) => dayKey(m.kickoff) <= day);
    const rank = rankParticipants(participants, predictions, upTo, outcomes, settings);
    return {
      day,
      posById: new Map(rank.map((r) => [r.participantId, r.position])),
      byId: new Map(rank.map((r) => [r.participantId, r])),
    };
  });
}

export interface MovementRow {
  participantId: string;
  name: string;
  prev: number;
  cur: number;
  delta: number; // positions gained (positive = moved up)
  winnerIso: string | null; // the participant's eindwinnaar pick (for the flag)
  winnerName: string | null;
}

export interface DayMovements {
  day: string; // the (newer) calendar day being reported
  prevDay: string; // the day it's compared against
  risers: MovementRow[];
  fallers: MovementRow[];
  winners: MovementRow[]; // entered the top 5
  losers: MovementRow[]; // dropped out of the top 5
}

const TOP_N = 5;

/** Keep the strongest movers: at least `min` rows, including everyone tied with
 *  the row at the cut-off (rows must be pre-sorted by movement, strongest first). */
function topMovers(rows: MovementRow[], magnitude: (r: MovementRow) => number, min = 3): MovementRow[] {
  if (rows.length <= min) return rows;
  const cutoff = magnitude(rows[min - 1]);
  return rows.filter((r) => magnitude(r) >= cutoff);
}

/** Day-by-day movement tables (risers/fallers + top-5 in/out), comparing each
 *  calendar day to the previous one. Newest day first. */
export function dayMovements(): DayMovements[] {
  const timeline = rankingTimeline();
  const out: DayMovements[] = [];
  for (let i = 1; i < timeline.length; i++) {
    const prev = timeline[i - 1];
    const cur = timeline[i];
    const moves: MovementRow[] = [];
    for (const [id, curPos] of cur.posById) {
      const prevPos = prev.posById.get(id);
      if (prevPos === undefined) continue;
      const winner = getTeam(getParticipant(id)?.bonus.winnerTeamId);
      moves.push({
        participantId: id,
        name: cur.byId.get(id)!.name,
        prev: prevPos,
        cur: curPos,
        delta: prevPos - curPos,
        winnerIso: winner?.iso ?? null,
        winnerName: winner?.name ?? null,
      });
    }
    const risers = topMovers(
      moves.filter((m) => m.delta > 0).sort((a, b) => b.delta - a.delta || a.cur - b.cur),
      (m) => m.delta,
    );
    const fallers = topMovers(
      moves.filter((m) => m.delta < 0).sort((a, b) => a.delta - b.delta || a.cur - b.cur),
      (m) => -m.delta,
    );
    const winners = moves
      .filter((m) => m.cur <= TOP_N && m.prev > TOP_N)
      .sort((a, b) => a.cur - b.cur);
    const losers = moves
      .filter((m) => m.prev <= TOP_N && m.cur > TOP_N)
      .sort((a, b) => a.cur - b.cur);
    out.push({ day: cur.day, prevDay: prev.day, risers, fallers, winners, losers });
  }
  return out.reverse();
}

/** The most recent day-to-day movement (today vs. the previous day), or null
 *  when fewer than two calendar days have been played. */
export function latestMovements(): DayMovements | null {
  return dayMovements()[0] ?? null;
}

export type FormResult = 'exact' | 'partial' | 'wrong';

/** A participant's last `n` finished matches (chronological), as form results. */
export function participantForm(participantId: string, n = 5): FormResult[] {
  const byMatch = new Map(predictions.filter((p) => p.participantId === participantId).map((p) => [p.matchId, p]));
  const finished = matches
    .filter((m) => m.status === 'finished' && m.result)
    .sort(byKickoff);
  const out: FormResult[] = [];
  for (const m of finished) {
    const s = scoreMatch(byMatch.get(m.id), m, settings);
    if (!s) continue;
    out.push(s.exact ? 'exact' : s.points > 0 ? 'partial' : 'wrong');
  }
  return out.slice(-n);
}

/** Whether a participant can still finish in the money / on the podium / first.
 *  Simple, sound upper bound: this participant scores the maximum on everything
 *  that's left (exact score on every unfinished match + every bonus pick still
 *  possible), while everyone else gains nothing more (worst case for the rest).
 *  Under that assumption `bestPos` is the best place they can still reach. */
export interface Outlook {
  bestPos: number; // best place still reachable under the optimistic assumption
  myMax: number; // this participant's maximum attainable total
  matchMax: number; // points still attainable on unfinished matches
  bonusMax: number; // points still attainable from open bonus picks
  remaining: number; // matchMax + bonusMax
  canMoney: boolean; // top 5
  canPodium: boolean; // top 3
  canWin: boolean; // first
  decided: boolean; // nothing left to win (final played, bonus resolved)
}

export function mathematicalOutlook(participantId: string): Outlook | null {
  const cur = ranking();
  const me = cur.find((r) => r.participantId === participantId);
  if (!me) return null;
  // Max points still attainable on unfinished matches (assume an exact score,
  // incl. knockout matches not predicted yet — an upper bound, so soundly
  // "still possible"). Bonus currently counts 0 for everyone (resolves at the
  // final), so totals are pure match points until then.
  let matchMax = 0;
  for (const m of matches) {
    if (m.status === 'finished' && m.result) continue;
    matchMax += 9 * multiplierFor(m.round, settings);
  }
  // Bonus picks still able to gain points: only those whose outcome isn't known
  // yet AND that can mathematically still come true (bonusPickAlive: the
  // eindwinnaar while the picked country isn't eliminated, the other three
  // while the pick still plays or already shares the lead).
  const eliminated = eliminatedTeamIds();
  const leaders = currentBonusLeaders();
  const p = getParticipant(participantId);
  const undecided = (key: keyof BonusOutcomes) => { const o = outcomes[key]; return o === undefined || o === ''; };
  let possibleBonus = 0;
  if (p) {
    const keys: (keyof BonusPicks)[] = ['winnerTeamId', 'topScorer', 'mostScoredTeamId', 'mostConcededTeamId'];
    for (const key of keys) {
      const v = p.bonus[key];
      if (v && undecided(key as keyof BonusOutcomes) && bonusPickAlive(key, v, eliminated, leaders)) possibleBonus++;
    }
  }
  const bonusMax = possibleBonus * settings.bonusPoints;
  const myMax = me.total + matchMax + bonusMax;
  const above = cur.filter((r) => r.participantId !== participantId && r.total > myMax).length;
  const remaining = matchMax + bonusMax;
  const bestPos = above + 1;
  return {
    bestPos, myMax, matchMax, bonusMax, remaining,
    canMoney: bestPos <= 5, canPodium: bestPos <= 3, canWin: bestPos <= 1,
    decided: remaining === 0,
  };
}

/** Best "form": per participant the highest total over any `windowSize`
 *  consecutive finished matches (chronological). Returns ALL participants tied
 *  for the global best window (so the UI can cycle through them), each with the
 *  matches in that window for display. Participants with fewer than `windowSize`
 *  played matches are skipped. */
export interface FormWindowMatch { label: string; pts: number; cls: string }
export interface BestFormRow {
  participantId: string;
  name: string;
  position: number | null;
  winnerIso: string | null;
  winnerName: string | null;
  sum: number;
  window: FormWindowMatch[];
}

export function bestForm(windowSize = 5): BestFormRow[] {
  const finished = matches.filter((m) => m.status === 'finished' && m.result).sort(byKickoff);
  const rank = new Map(ranking().map((r) => [r.participantId, r.position]));
  const rows: BestFormRow[] = [];
  for (const p of participants) {
    const byMatch = new Map(predictions.filter((x) => x.participantId === p.id).map((x) => [x.matchId, x]));
    const seq = finished.map((m) => {
      const s = scoreMatch(byMatch.get(m.id), m, settings);
      const pts = s?.points ?? 0;
      const home = sideLabel(m, 'home');
      const away = sideLabel(m, 'away');
      return {
        label: `${home.short}–${away.short}`,
        pts,
        cls: s?.exact ? 'bg-emerald-500' : pts > 0 ? 'bg-amber-400' : 'bg-red-500',
      };
    });
    if (seq.length < windowSize) continue;
    let bestSum = -1, bestStart = 0;
    for (let i = 0; i + windowSize <= seq.length; i++) {
      const sum = seq.slice(i, i + windowSize).reduce((s, x) => s + x.pts, 0);
      if (sum > bestSum) { bestSum = sum; bestStart = i; }
    }
    const winner = getTeam(p.bonus.winnerTeamId);
    rows.push({
      participantId: p.id,
      name: p.name,
      position: rank.get(p.id) ?? null,
      winnerIso: winner?.iso ?? null,
      winnerName: winner?.name ?? null,
      sum: bestSum,
      window: seq.slice(bestStart, bestStart + windowSize),
    });
  }
  if (!rows.length) return [];
  const max = Math.max(...rows.map((r) => r.sum));
  return rows
    .filter((r) => r.sum === max)
    .sort((a, b) => (a.position ?? Infinity) - (b.position ?? Infinity) || a.name.localeCompare(b.name, 'nl'));
}

/** All of a participant's predictions joined to their match + computed score. */
export interface PredictionRow {
  match: Match;
  prediction?: Prediction;
  score: MatchScore | null;
}

export function predictionsForParticipant(participantId: string): PredictionRow[] {
  const byMatch = new Map(predictions.filter((p) => p.participantId === participantId).map((p) => [p.matchId, p]));
  return matches.map((match) => {
    const prediction = byMatch.get(match.id);
    return { match, prediction, score: scoreMatch(prediction, match, settings) };
  });
}

/** All participants' predictions for one match, sorted by score desc (requirements §5.3). */
export interface MatchPredictionRow {
  participant: Participant;
  prediction?: Prediction;
  score: MatchScore | null;
}

export function predictionsForMatch(matchId: string): MatchPredictionRow[] {
  const match = matchById.get(matchId);
  const byParticipant = new Map(predictions.filter((p) => p.matchId === matchId).map((p) => [p.participantId, p]));
  const rank = new Map(ranking().map((r) => [r.participantId, r.position]));
  const rows: MatchPredictionRow[] = participants.map((participant) => {
    const prediction = byParticipant.get(participant.id);
    return { participant, prediction, score: match ? scoreMatch(prediction, match, settings) : null };
  });
  rows.sort((a, b) => {
    const sa = a.score?.points ?? -1;
    const sb = b.score?.points ?? -1;
    if (sa !== sb) return sb - sa;
    // No score yet -> order by current ranking, then name.
    const ra = rank.get(a.participant.id) ?? 999;
    const rb = rank.get(b.participant.id) ?? 999;
    return ra - rb || a.participant.name.localeCompare(b.participant.name, 'nl');
  });
  return rows;
}

// ---- Group standings ----------------------------------------------------

export interface StandingRow {
  team: Team;
  played: number;
  won: number;
  drawn: number;
  lost: number;
  goalsFor: number;
  goalsAgainst: number;
  goalDiff: number;
  points: number;
  rank: number;
}

export function standingsForGroup(groupId: string): StandingRow[] {
  const group = groups.find((g) => g.id === groupId);
  if (!group) return [];
  const base = new Map<string, Omit<StandingRow, 'rank'>>();
  for (const id of group.teamIds) {
    const team = getTeam(id)!;
    base.set(id, { team, played: 0, won: 0, drawn: 0, lost: 0, goalsFor: 0, goalsAgainst: 0, goalDiff: 0, points: 0 });
  }
  for (const m of matches) {
    if (m.round !== 'group' || m.status !== 'finished' || !m.result) continue;
    if (!m.homeTeamId || !m.awayTeamId) continue;
    const h = base.get(m.homeTeamId);
    const a = base.get(m.awayTeamId);
    if (!h || !a) continue;
    h.played++; a.played++;
    h.goalsFor += m.result.home; h.goalsAgainst += m.result.away;
    a.goalsFor += m.result.away; a.goalsAgainst += m.result.home;
    if (m.result.home > m.result.away) { h.won++; h.points += 3; a.lost++; }
    else if (m.result.home < m.result.away) { a.won++; a.points += 3; h.lost++; }
    else { h.drawn++; a.drawn++; h.points++; a.points++; }
  }
  const rows = [...base.values()].map((r) => ({ ...r, goalDiff: r.goalsFor - r.goalsAgainst }));
  rows.sort((x, y) => y.points - x.points || y.goalDiff - x.goalDiff || y.goalsFor - x.goalsFor || x.team.name.localeCompare(y.team.name, 'nl'));
  return rows.map((r, i) => ({ ...r, rank: i + 1 }));
}

/** Cross-group ranking of the third-placed teams; top 8 advance (requirements §5.6). */
export function bestThirdPlaced(): (StandingRow & { group: string; qualifies: boolean })[] {
  const thirds = groups
    .map((g) => {
      const s = standingsForGroup(g.id);
      const third = s[2];
      return third ? { ...third, group: g.id } : null;
    })
    .filter(Boolean) as (StandingRow & { group: string })[];
  thirds.sort((x, y) => y.points - x.points || y.goalDiff - x.goalDiff || y.goalsFor - x.goalsFor || x.team.name.localeCompare(y.team.name, 'nl'));
  return thirds.map((t, i) => ({ ...t, qualifies: i < 8 }));
}

/** Teams that can no longer win the tournament: knockout losers, plus group
 *  non-qualifiers once the whole group stage is finished. */
export function eliminatedTeamIds(): Set<string> {
  const out = new Set<string>();
  for (const m of matches) {
    if (m.round === 'group' || m.status !== 'finished' || !m.result || !m.homeTeamId || !m.awayTeamId) continue;
    const winner = m.winnerTeamId
      ?? (m.result.home > m.result.away ? m.homeTeamId : m.result.away > m.result.home ? m.awayTeamId : null);
    if (winner) out.add(winner === m.homeTeamId ? m.awayTeamId : m.homeTeamId);
  }
  const groupMatches = matches.filter((m) => m.round === 'group');
  if (groupMatches.length > 0 && groupMatches.every((m) => m.status === 'finished')) {
    const qualified = new Set<string>();
    for (const g of groups) {
      const s = standingsForGroup(g.id);
      if (s[0]) qualified.add(s[0].team.id);
      if (s[1]) qualified.add(s[1].team.id);
    }
    for (const t of bestThirdPlaced()) if (t.qualifies) qualified.add(t.team.id);
    for (const t of teams) if (!qualified.has(t.id)) out.add(t.id);
  }
  return out;
}

/** Current (provisional) bonus leaders, used to flag whether a bonus pick is on
 *  track. Returns ALL tied leaders (e.g. two teams level on most goals), so a
 *  pick that shares the lead still counts as provisionally correct. Empty arrays
 *  when nothing is decided yet. */
export function currentBonusLeaders(): { topScorer: string[]; mostScoredTeamId: string[]; mostConcededTeamId: string[] } {
  const sc = topScorers();
  const ms = mostGoalsScored();
  const mc = mostGoalsConceded();
  const topGoals = sc[0]?.goals ?? 0;
  const maxScored = ms[0]?.scored ?? 0;
  const maxConceded = mc[0]?.conceded ?? 0;
  return {
    topScorer: topGoals > 0 ? sc.filter((s) => s.goals === topGoals).map((s) => s.player) : [],
    mostScoredTeamId: maxScored > 0 ? ms.filter((t) => t.scored === maxScored).map((t) => t.team.id) : [],
    mostConcededTeamId: maxConceded > 0 ? mc.filter((t) => t.conceded === maxConceded).map((t) => t.team.id) : [],
  };
}

/** Can a bonus pick mathematically still score points? The eindwinnaar only
 *  while the picked team isn't eliminated; the other three while the picked
 *  player/country either still plays (can add goals/tegengoals) or already
 *  shares the lead (nobody is forced to pass them). Pass precomputed
 *  eliminated/leaders when calling in a loop. */
export function bonusPickAlive(
  key: keyof BonusPicks,
  value: string,
  eliminated: Set<string> = eliminatedTeamIds(),
  leaders: ReturnType<typeof currentBonusLeaders> = currentBonusLeaders(),
): boolean {
  if (key === 'winnerTeamId') return !eliminated.has(value);
  if (key === 'topScorer') {
    if (leaders.topScorer.includes(value)) return true;
    const team = scorerInfo(value).team;
    return !team || !eliminated.has(team.id);
  }
  const lead = key === 'mostScoredTeamId' ? leaders.mostScoredTeamId : leaders.mostConcededTeamId;
  return lead.includes(value) || !eliminated.has(value);
}

export type BonusStatus = 'good' | 'open' | 'bad';
export interface BonusPickCell {
  iso: string | null; // flag of the picked country (or the top scorer's country)
  label: string; // team / player name, for the title tooltip
  status: BonusStatus | null;
}
export interface BonusStandingRow {
  participantId: string;
  name: string;
  position: number;
  total: number;
  winnerIso: string | null; // eindwinnaar pick, for the name-column flag
  winnerName: string | null;
  cells: Record<keyof BonusPicks, BonusPickCell>;
  provGood: number; // bonus picks currently leading (provisionally correct)
  possible: number; // picks not yet impossible (still alive)
  provPoints: number; // provGood * bonusPoints
}

/** Provisional bonus standings: per participant, the live status of each of
 *  their four bonus picks (good = currently leading, open = still possible, bad
 *  = no longer possible), the picked country/player (with flag) and a
 *  "voorlopige bonus" score. Bonus outcomes are only decided at the final, so
 *  this is the meaningful mid-tournament view. Mirrors the per-pick logic on the
 *  participant profile. */
export function bonusStandings(): BonusStandingRow[] {
  const eliminated = eliminatedTeamIds();
  const leaders = currentBonusLeaders();
  const rankMap = new Map(ranking().map((r) => [r.participantId, r]));
  const keys: (keyof BonusPicks)[] = ['winnerTeamId', 'topScorer', 'mostScoredTeamId', 'mostConcededTeamId'];
  const statusFor = (key: keyof BonusPicks, value?: string): BonusStatus | null => {
    if (!value) return null;
    if (key === 'winnerTeamId') return eliminated.has(value) ? 'bad' : 'open';
    const lead = key === 'topScorer' ? leaders.topScorer
      : key === 'mostScoredTeamId' ? leaders.mostScoredTeamId
      : leaders.mostConcededTeamId;
    if (!lead.length) return 'open';
    if (lead.includes(value)) return 'good';
    return bonusPickAlive(key, value, eliminated, leaders) ? 'open' : 'bad';
  };
  const cellFor = (key: keyof BonusPicks, value?: string): BonusPickCell => {
    const status = statusFor(key, value);
    if (!value) return { iso: null, label: '—', status };
    if (key === 'topScorer') {
      const info = scorerInfo(value);
      return { iso: info.team?.iso ?? null, label: value, status };
    }
    const team = getTeam(value);
    return { iso: team?.iso ?? null, label: team?.name ?? value, status };
  };
  return participants
    .map((p) => {
      const r = rankMap.get(p.id);
      const cells = {} as Record<keyof BonusPicks, BonusPickCell>;
      let provGood = 0;
      let possible = 0;
      for (const k of keys) {
        const cell = cellFor(k, p.bonus[k]);
        cells[k] = cell;
        if (cell.status === 'good') provGood++;
        if (cell.status !== 'bad') possible++;
      }
      const winner = getTeam(p.bonus.winnerTeamId);
      return {
        participantId: p.id,
        name: p.name,
        position: r?.position ?? 999,
        total: r?.total ?? 0,
        winnerIso: winner?.iso ?? null,
        winnerName: winner?.name ?? null,
        cells,
        provGood,
        possible,
        provPoints: provGood * settings.bonusPoints,
      };
    })
    .sort((a, b) => b.provGood - a.provGood || b.possible - a.possible || a.position - b.position || a.name.localeCompare(b.name, 'nl'));
}

export function matchesForTeam(teamId: string): Match[] {
  return matches
    .filter((m) => m.homeTeamId === teamId || m.awayTeamId === teamId)
    .sort(byKickoff);
}

export function upcomingMatches(): Match[] {
  return matches
    .filter((m) => m.status !== 'finished')
    .sort(byKickoff);
}

// ---- Tournament stats ---------------------------------------------------

export function topScorers(): (Scorer & { team?: Team })[] {
  return [...scorers]
    .sort((a, b) => b.goals - a.goals || a.player.localeCompare(b.player, 'nl'))
    .map((s) => ({ ...s, team: getTeam(s.teamId) }));
}

/** Goal scorers for one team (determined from match data), most goals first. */
export function goalscorersForTeam(teamId: string): Scorer[] {
  return scorers.filter((s) => s.teamId === teamId);
}

export interface TeamGoalStat {
  team: Team;
  scored: number;
  conceded: number;
  played: number;
}

/** Goals scored/conceded per team from finished matches (penalties excluded, since results are 120-min scores). */
export function teamGoalStats(): TeamGoalStat[] {
  const acc = new Map<string, TeamGoalStat>();
  for (const t of teams) acc.set(t.id, { team: t, scored: 0, conceded: 0, played: 0 });
  for (const m of matches) {
    if (m.status !== 'finished' || !m.result || !m.homeTeamId || !m.awayTeamId) continue;
    const h = acc.get(m.homeTeamId);
    const a = acc.get(m.awayTeamId);
    if (h) { h.scored += m.result.home; h.conceded += m.result.away; h.played++; }
    if (a) { a.scored += m.result.away; a.conceded += m.result.home; a.played++; }
  }
  return [...acc.values()];
}

// Teams that already played rank above unplayed ones at equal goals, so the
// stats tables aren't dominated by alphabetical all-zero rows early on.
export const mostGoalsScored = () => [...teamGoalStats()].sort((a, b) => b.scored - a.scored || b.played - a.played || a.team.name.localeCompare(b.team.name, 'nl'));
export const mostGoalsConceded = () => [...teamGoalStats()].sort((a, b) => b.conceded - a.conceded || b.played - a.played || a.team.name.localeCompare(b.team.name, 'nl'));

// Per-finished-match aggregate of all participants' scores.
export interface MatchPointStat {
  match: Match;
  total: number;
  avg: number;
  wrong: number;
  exact: number;
  n: number;
}

export function matchPointStats(): MatchPointStat[] {
  const out: MatchPointStat[] = [];
  for (const m of matches) {
    if (m.status !== 'finished' || !m.result) continue;
    const byPart = new Map(predictions.filter((p) => p.matchId === m.id).map((p) => [p.participantId, p]));
    let total = 0, wrong = 0, exact = 0, n = 0;
    for (const part of participants) {
      const s = scoreMatch(byPart.get(part.id), m, settings);
      if (!s) continue;
      n++; total += s.points;
      if (s.points === 0) wrong++;
      if (s.exact) exact++;
    }
    out.push({ match: m, total, avg: n ? total / n : 0, wrong, exact, n });
  }
  return out;
}

export const topMatchesByPoints = (limit = 10) =>
  [...matchPointStats()].sort((a, b) => b.avg - a.avg || b.exact - a.exact).slice(0, limit);

export const topMatchesByWrong = (limit = 10) =>
  [...matchPointStats()].sort((a, b) => b.wrong - a.wrong || a.avg - b.avg).slice(0, limit);

/** Most-picked eindwinnaar across all participants. */
export function topChosenWinners(limit = 5): { team: Team; count: number }[] {
  const counts = new Map<string, number>();
  for (const p of participants) {
    const id = p.bonus.winnerTeamId;
    if (id) counts.set(id, (counts.get(id) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([id, count]) => ({ team: getTeam(id), count }))
    .filter((x): x is { team: Team; count: number } => !!x.team)
    .sort((a, b) => b.count - a.count || a.team.name.localeCompare(b.team.name, 'nl'))
    .slice(0, limit);
}

// Free-text topschutter picks use full names ("Kylian Mbappé") while scorers.json
// stores abbreviated names ("K. Mbappé") and sometimes one row per goal with
// annotations ("K. Havertz 45+5(p)"). Match best-effort on normalized surname +
// first initial, summing goals across all matching rows.
const cleanName = (s: string) =>
  s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
    .replace(/\([^)]*\)/g, ' ').replace(/[0-9+]/g, ' ').replace(/[^a-z.\s]/g, ' ')
    .replace(/\s+/g, ' ').trim();
const nameTokens = (s: string) => cleanName(s).split(' ').filter(Boolean);
const surnameOf = (s: string) => { const t = nameTokens(s); return t.length ? t[t.length - 1].replace(/\.$/, '') : ''; };
const firstInitialOf = (s: string) => { const t = nameTokens(s); return t.length && t[0] ? t[0][0] : ''; };

// Country per picked top scorer, looked up once and kept static. The scorers
// data only knows a player's team once they've scored, so this gives the flag
// for picks who haven't scored yet. Goals stay dynamic (from scorers.json).
const PLAYER_TEAM: Record<string, string> = {
  'Mikel Oyarzabal': 'es', 'Lamine Yamal': 'es', 'Ferran Torres': 'es',
  'Harry Kane': 'gbeng', 'Bukayo Saka': 'gbeng',
  'Kylian Mbappé': 'fr', 'Ousmane Dembélé': 'fr', 'Michael Olise': 'fr',
  'Lionel Messi': 'ar', 'Julián Álvarez': 'ar',
  'Erling Haaland': 'no',
  'Romelu Lukaku': 'be', 'Kevin De Bruyne': 'be',
  'Raphinha': 'br', 'Vinícius Júnior': 'br',
  'Cristiano Ronaldo': 'pt',
};

/** Resolve a free-text top-scorer pick to its team and total tournament goals.
 *  Team comes from the scored-goals data when available, else the static map. */
export function scorerInfo(player: string): { team?: Team; goals: number } {
  const sn = surnameOf(player);
  const fi = firstInitialOf(player);
  const rows = scorers.filter((s) => s.player === player || (sn && surnameOf(s.player) === sn && firstInitialOf(s.player) === fi));
  const goals = rows.reduce((sum, s) => sum + s.goals, 0);
  const team = (rows.length ? getTeam(rows[0].teamId) : undefined) ?? getTeam(PLAYER_TEAM[player]);
  return { team, goals };
}

/** Most-picked top scorer across all participants, with the player's resolved
 *  team and tournament goals. */
export function topChosenTopScorers(limit = 5): { player: string; team?: Team; goals: number; count: number }[] {
  const counts = new Map<string, number>();
  for (const p of participants) {
    const s = p.bonus.topScorer;
    if (s) counts.set(s, (counts.get(s) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([player, count]) => {
      const info = scorerInfo(player);
      return { player, team: info.team, goals: info.goals, count };
    })
    .sort((a, b) => b.count - a.count || a.player.localeCompare(b.player, 'nl'))
    .slice(0, limit);
}

// ---- Bonus-pick "who picked this" views ---------------------------------

/** A participant who made a particular bonus pick, joined to their ranking. */
export interface PickerRow {
  participantId: string;
  name: string;
  position: number;
  total: number;
  winnerIso: string | null; // the participant's own eindwinnaar pick (for the flag column)
  winnerName: string | null;
}

/** Participants matching a bonus predicate, joined to their current ranking and
 *  sorted by klassement position (then name). */
function pickers(matchesPick: (p: Participant) => boolean): PickerRow[] {
  const rank = new Map(ranking().map((r) => [r.participantId, r]));
  return participants
    .filter(matchesPick)
    .map((p) => {
      const r = rank.get(p.id);
      const winner = getTeam(p.bonus.winnerTeamId);
      return {
        participantId: p.id,
        name: p.name,
        position: r?.position ?? 999,
        total: r?.total ?? 0,
        winnerIso: winner?.iso ?? null,
        winnerName: winner?.name ?? null,
      };
    })
    .sort((a, b) => a.position - b.position || a.name.localeCompare(b.name, 'nl'));
}

/** Participants who picked `teamId` as eindwinnaar. */
export const winnerPickers = (teamId: string) => pickers((p) => p.bonus.winnerTeamId === teamId);
/** Participants who picked `teamId` for 'meeste doelpunten'. */
export const mostScoredPickers = (teamId: string) => pickers((p) => p.bonus.mostScoredTeamId === teamId);
/** Participants who picked `teamId` for 'meeste tegendoelpunten'. */
export const mostConcededPickers = (teamId: string) => pickers((p) => p.bonus.mostConcededTeamId === teamId);
/** Participants who picked `player` as topschutter. */
export const topScorerPickers = (player: string) => pickers((p) => p.bonus.topScorer === player);

/** Every top scorer picked by at least one participant, with team, tournament
 *  goals and a URL slug. Sorted by how often they were picked. */
export function pickedTopScorers(): { player: string; slug: string; team?: Team; goals: number; count: number }[] {
  const counts = new Map<string, number>();
  for (const p of participants) {
    const s = p.bonus.topScorer;
    if (s) counts.set(s, (counts.get(s) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([player, count]) => {
      const info = scorerInfo(player);
      return { player, slug: slugify(player), team: info.team, goals: info.goals, count };
    })
    .sort((a, b) => b.count - a.count || a.player.localeCompare(b.player, 'nl'));
}

/** Resolve a picked-top-scorer slug back to its entry (for the profile route). */
export function pickedTopScorerBySlug(slug: string) {
  return pickedTopScorers().find((s) => s.slug === slug);
}

/** Slugs of the top scorers picked by at least one participant (for linking). */
export function pickedTopScorerSlugs(): Map<string, string> {
  return new Map(pickedTopScorers().map((s) => [s.player, s.slug]));
}

/** Participants ranked by the number of correct 1X2 (winner/draw) predictions on
 *  finished matches. Late/missing predictions don't count. */
type PredictionStatRow = { participantId: string; name: string; correct: number; played: number; position: number | null; winnerIso: string | null; winnerName: string | null; ongoing?: boolean };

/** Rank participants by how many of their (non-late) predictions on played
 *  matches satisfy `pick` — most first, then by current klassement position. */
function topPredictionStat(pick: (s: ReturnType<typeof scoreMatch>) => boolean): PredictionStatRow[] {
  const finishedMatches = matches.filter((m) => m.status === 'finished' && m.result);
  const rank = new Map(ranking().map((r) => [r.participantId, r.position]));
  return participants
    .map((p) => {
      const byMatch = new Map(predictions.filter((x) => x.participantId === p.id).map((x) => [x.matchId, x]));
      let correct = 0;
      let played = 0;
      for (const m of finishedMatches) {
        const pred = byMatch.get(m.id);
        if (!pred || pred.late) continue;
        played++;
        if (pick(scoreMatch(pred, m, settings))) correct++;
      }
      const winner = getTeam(p.bonus.winnerTeamId);
      return { participantId: p.id, name: p.name, correct, played, position: rank.get(p.id) ?? null, winnerIso: winner?.iso ?? null, winnerName: winner?.name ?? null };
    })
    // Most correct first, then by current klassement position (best first).
    .sort((a, b) => b.correct - a.correct || (a.position ?? Infinity) - (b.position ?? Infinity) || a.name.localeCompare(b.name, 'nl'));
}

/** Participants by number of correct 1X2 predictions (right winner/draw). */
export function topCorrectOutcomes(): PredictionStatRow[] {
  return topPredictionStat((s) => !!s?.outcomeCorrect);
}

/** Participants by number of fully-correct (exact-score) predictions. */
export function topExactScores(): PredictionStatRow[] {
  return topPredictionStat((s) => !!s?.exact);
}

/** Rank participants by their LONGEST run of consecutive finished matches that
 *  all satisfy `pick` (in kickoff order). A late/missing/failing prediction
 *  breaks the run. `correct` carries the best streak length; `ongoing` is true
 *  when that best run is still live — it reaches the latest finished match and
 *  hasn't been broken, so it can still grow. */
function topStreakStat(pick: (s: ReturnType<typeof scoreMatch>) => boolean): PredictionStatRow[] {
  const finishedMatches = matches.filter((m) => m.status === 'finished' && m.result).sort(byKickoff);
  const rank = new Map(ranking().map((r) => [r.participantId, r.position]));
  return participants
    .map((p) => {
      const byMatch = new Map(predictions.filter((x) => x.participantId === p.id).map((x) => [x.matchId, x]));
      let best = 0, run = 0, played = 0;
      for (const m of finishedMatches) {
        played++;
        const pred = byMatch.get(m.id);
        const ok = !!pred && !pred.late && pick(scoreMatch(pred, m, settings));
        if (ok) { run++; if (run > best) best = run; } else { run = 0; }
      }
      const winner = getTeam(p.bonus.winnerTeamId);
      return { participantId: p.id, name: p.name, correct: best, played, position: rank.get(p.id) ?? null, winnerIso: winner?.iso ?? null, winnerName: winner?.name ?? null, ongoing: best > 0 && run === best };
    })
    .sort((a, b) => b.correct - a.correct || (a.position ?? Infinity) - (b.position ?? Infinity) || a.name.localeCompare(b.name, 'nl'));
}

/** Participants by longest run of consecutive correct 1X2 predictions. */
export function longestOutcomeStreak(): PredictionStatRow[] {
  return topStreakStat((s) => !!s?.outcomeCorrect);
}

/** Participants by longest run of consecutive exact-score predictions. */
export function longestExactStreak(): PredictionStatRow[] {
  return topStreakStat((s) => !!s?.exact);
}

/** How often each participant stood first / last in the klassement, counted
 *  after every finished match (in kickoff order): one cumulative standing per
 *  match, tallying everyone at position 1 ("eerste") and everyone at the last
 *  position ("laatste"). Ties share a position, so co-leaders / co-last all
 *  count. `correct` carries the tally; `played` is the number of standings
 *  considered. Returned ready for the op-een-rij-style tables (no streak/flame).
 */
export function matchPositionExtremes(): { first: PredictionStatRow[]; last: PredictionStatRow[] } {
  const finished = matches.filter((m) => m.status === 'finished' && m.result).sort(byKickoff);
  const firstC = new Map<string, number>();
  const lastC = new Map<string, number>();
  const upTo: Match[] = [];
  for (const m of finished) {
    upTo.push(m);
    const rank = rankParticipants(participants, predictions, upTo, outcomes, settings);
    let maxPos = 0;
    for (const r of rank) if (r.position > maxPos) maxPos = r.position;
    for (const r of rank) {
      if (r.position === 1) firstC.set(r.participantId, (firstC.get(r.participantId) ?? 0) + 1);
      if (r.position === maxPos) lastC.set(r.participantId, (lastC.get(r.participantId) ?? 0) + 1);
    }
  }
  const curRank = new Map(ranking().map((r) => [r.participantId, r.position]));
  const played = finished.length;
  const build = (counts: Map<string, number>): PredictionStatRow[] =>
    participants
      .map((p) => {
        const winner = getTeam(p.bonus.winnerTeamId);
        return {
          participantId: p.id,
          name: p.name,
          correct: counts.get(p.id) ?? 0,
          played,
          position: curRank.get(p.id) ?? null,
          winnerIso: winner?.iso ?? null,
          winnerName: winner?.name ?? null,
        };
      })
      .sort((a, b) => b.correct - a.correct || (a.position ?? Infinity) - (b.position ?? Infinity) || a.name.localeCompare(b.name, 'nl'));
  return { first: build(firstC), last: build(lastC) };
}

export interface PositionTrendSeries {
  participantId: string;
  name: string;
  days: { day: string; position: number }[];
}

/** Compact position trend of ALL participants over the last `maxDays` game
 *  days, ordered by current position — the embeddable dataset behind the
 *  client-rendered favourites chart on /favorieten (which filters it to the
 *  visitor's localStorage favourites) and the source for top5PositionTrend. */
export interface PositionTrendData {
  days: string[];
  p: { id: string; name: string; pos: number[] }[];
}

export function positionTrendAll(maxDays = 10): PositionTrendData {
  const timeline = rankingTimeline();
  if (timeline.length === 0) return { days: [], p: [] };
  const slice = timeline.slice(-maxDays);
  const latest = timeline[timeline.length - 1];
  return {
    days: slice.map((s) => s.day),
    p: participants
      .map((x) => ({
        id: x.id,
        name: x.name,
        pos: slice.map((snap) => snap.posById.get(x.id) ?? latest.posById.get(x.id) ?? 0),
      }))
      .sort((a, b) => a.pos[a.pos.length - 1] - b.pos[b.pos.length - 1]),
  };
}

/** Position trend of the current top-5 over the last `maxDays` game days. */
export function top5PositionTrend(maxDays = 10): PositionTrendSeries[] {
  const { days, p } = positionTrendAll(maxDays);
  return p.slice(0, 5).map((s) => ({
    participantId: s.id,
    name: s.name,
    days: days.map((day, i) => ({ day, position: s.pos[i] })),
  }));
}

// ---- Recap (Instagram-story-style season recap) -------------------------

const RECAP_NAME_CAP = 4; // names shown per tied leader before "+N anderen"

/** A participant name plus their eindwinnaar pick (flag shown before the name). */
export interface RecapName { name: string; winnerIso: string | null }

interface NameGroup { names: RecapName[]; moreCount: number }

function nameGroup(names: RecapName[], cap = RECAP_NAME_CAP): NameGroup {
  return { names: names.slice(0, cap), moreCount: Math.max(0, names.length - cap) };
}

export interface RecapStatLeader extends NameGroup { value: number }

/** Tied leaders (a positive top value) from a topStreakStat/topPredictionStat
 *  row list, or null when nothing has been played yet. */
function statLeader(rows: PredictionStatRow[]): RecapStatLeader | null {
  const top = rows[0]?.correct ?? 0;
  if (top <= 0) return null;
  return {
    ...nameGroup(rows.filter((r) => r.correct === top).map((r) => ({ name: r.name, winnerIso: r.winnerIso }))),
    value: top,
  };
}

export interface RecapStanding extends NameGroup {
  position: number;
  total: number;
  prize: number;
}

export interface RecapTopScorer {
  players: { player: string; teamName: string | null; teamIso: string | null }[]; // all tied leaders
  goals: number;
}

export interface RecapChampion {
  teamName: string;
  teamIso: string;
}

export interface RecapData {
  matchesPlayed: number;
  matchesTotal: number;
  goalsTotal: number;
  teamIsos: string[]; // all participating countries (flag wall on the matches slide)
  topScorer: RecapTopScorer | null;
  champion: RecapChampion | null;
  longestOutcomeStreak: RecapStatLeader | null;
  mostCorrectOutcomes: RecapStatLeader | null;
  longestExactStreak: RecapStatLeader | null;
  // Klassement positions 1..5 (skipping ranks a tie jumps over), climb order:
  // 5th first, 1st (the finale) last. Every participant sharing a position is
  // included.
  standings: RecapStanding[];
}

/** Everything the Instagram-story-style recap needs, computed once at build
 *  time. Reuses the existing stats/streak/ranking helpers so the numbers stay
 *  identical to the ones shown on /statistieken and /klassement. */
export function recapData(): RecapData {
  const finished = matches.filter((m) => m.status === 'finished' && m.result);
  const goalsTotal = finished.reduce((sum, m) => sum + m.result!.home + m.result!.away, 0);

  const scorerList = topScorers();
  const topGoals = scorerList[0]?.goals ?? 0;
  const topScorerLeaders = topGoals > 0 ? scorerList.filter((s) => s.goals === topGoals) : [];
  const topScorer: RecapTopScorer | null = topScorerLeaders.length
    ? {
        players: topScorerLeaders.map((s) => ({
          player: s.player,
          teamName: s.team?.name ?? null,
          teamIso: s.team?.iso ?? null,
        })),
        goals: topGoals,
      }
    : null;

  const finalMatch = matches.find((m) => m.round === 'final');
  let champion: RecapChampion | null = null;
  if (finalMatch?.status === 'finished' && finalMatch.result) {
    const winnerId = finalMatch.winnerTeamId
      ?? (finalMatch.result.home > finalMatch.result.away ? finalMatch.homeTeamId
        : finalMatch.result.away > finalMatch.result.home ? finalMatch.awayTeamId : null);
    const team = getTeam(winnerId);
    if (team) champion = { teamName: team.name, teamIso: team.iso };
  }

  const byPosition = new Map<number, RankRow[]>();
  for (const r of ranking()) {
    if (r.position > 5) continue;
    const arr = byPosition.get(r.position);
    if (arr) arr.push(r); else byPosition.set(r.position, [r]);
  }
  const standings: RecapStanding[] = [...byPosition.entries()]
    .sort((a, b) => b[0] - a[0]) // descending: build suspense toward 1st
    .map(([position, rows]) => ({
      position,
      total: rows[0].total,
      prize: prizeFor(position, rows.length),
      ...nameGroup(rows.map((r) => ({
        name: r.name,
        winnerIso: getTeam(getParticipant(r.participantId)?.bonus.winnerTeamId)?.iso ?? null,
      }))),
    }));

  return {
    matchesPlayed: finished.length,
    matchesTotal: matches.length,
    goalsTotal,
    teamIsos: teams.map((t) => t.iso),
    topScorer,
    champion,
    longestOutcomeStreak: statLeader(longestOutcomeStreak()),
    mostCorrectOutcomes: statLeader(topCorrectOutcomes()),
    longestExactStreak: statLeader(longestExactStreak()),
    standings,
  };
}

/** Most-predicted scorelines across all participants' predictions. */
export function popularScorelines(limit = 8): { home: number; away: number; count: number }[] {
  const counts = new Map<string, number>();
  for (const p of predictions) {
    const key = `${p.home}-${p.away}`;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([key, count]) => {
      const [home, away] = key.split('-').map(Number);
      return { home, away, count };
    })
    .sort((a, b) => b.count - a.count || a.home + a.away - (b.home + b.away))
    .slice(0, limit);
}