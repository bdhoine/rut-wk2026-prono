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

import type { BonusOutcomes, Group, Match, Participant, Prediction, Scorer, Settings, Team } from './types';
import { rankParticipants, scoreMatch, type MatchScore, type RankRow } from './scoring';

export const teams = teamsRaw as Team[];
export const groups = groupsRaw as Group[];
export const matches = matchesRaw as Match[];
export const participants = participantsRaw as Participant[];
export const predictions = predictionsRaw as Prediction[];
export const outcomes = outcomesRaw as BonusOutcomes;
export const settings = settingsRaw as Settings;
export const scorers = scorersRaw as Scorer[];

const teamById = new Map(teams.map((t) => [t.id, t]));
const matchById = new Map(matches.map((m) => [m.id, m]));
const participantById = new Map(participants.map((p) => [p.id, p]));

export const getTeam = (id: string | null | undefined): Team | undefined => (id ? teamById.get(id) : undefined);
export const getMatch = (id: string): Match | undefined => matchById.get(id);
export const getParticipant = (id: string): Participant | undefined => participantById.get(id);

/** Display label for a match side, falling back to its placeholder. */
export function sideLabel(match: Match, side: 'home' | 'away'): { team?: Team; label: string } {
  const teamId = side === 'home' ? match.homeTeamId : match.awayTeamId;
  const team = getTeam(teamId);
  if (team) return { team, label: team.name };
  const placeholder = side === 'home' ? match.homePlaceholder : match.awayPlaceholder;
  return { label: placeholder ?? 'TBD' };
}

/** Full ranking table (rules.md §4). */
export function ranking(): RankRow[] {
  return rankParticipants(participants, predictions, matches, outcomes, settings);
}

export function positionOf(participantId: string): RankRow | undefined {
  return ranking().find((r) => r.participantId === participantId);
}

export type FormResult = 'exact' | 'partial' | 'wrong';

/** A participant's last `n` finished matches (chronological), as form results. */
export function participantForm(participantId: string, n = 5): FormResult[] {
  const byMatch = new Map(predictions.filter((p) => p.participantId === participantId).map((p) => [p.matchId, p]));
  const finished = matches
    .filter((m) => m.status === 'finished' && m.result)
    .sort((a, b) => a.kickoff.localeCompare(b.kickoff));
  const out: FormResult[] = [];
  for (const m of finished) {
    const s = scoreMatch(byMatch.get(m.id), m, settings);
    if (!s) continue;
    out.push(s.exact ? 'exact' : s.points > 0 ? 'partial' : 'wrong');
  }
  return out.slice(-n);
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

export function matchesForTeam(teamId: string): Match[] {
  return matches
    .filter((m) => m.homeTeamId === teamId || m.awayTeamId === teamId)
    .sort((a, b) => a.kickoff.localeCompare(b.kickoff));
}

export function upcomingMatches(): Match[] {
  return matches
    .filter((m) => m.status !== 'finished')
    .sort((a, b) => a.kickoff.localeCompare(b.kickoff));
}

// ---- Tournament stats ---------------------------------------------------

export function topScorers(): (Scorer & { team?: Team })[] {
  return [...scorers]
    .sort((a, b) => b.goals - a.goals || a.player.localeCompare(b.player, 'nl'))
    .map((s) => ({ ...s, team: getTeam(s.teamId) }));
}

export interface TeamGoalStat {
  team: Team;
  scored: number;
  conceded: number;
}

/** Goals scored/conceded per team from finished matches (penalties excluded, since results are 120-min scores). */
export function teamGoalStats(): TeamGoalStat[] {
  const acc = new Map<string, TeamGoalStat>();
  for (const t of teams) acc.set(t.id, { team: t, scored: 0, conceded: 0 });
  for (const m of matches) {
    if (m.status !== 'finished' || !m.result || !m.homeTeamId || !m.awayTeamId) continue;
    const h = acc.get(m.homeTeamId);
    const a = acc.get(m.awayTeamId);
    if (h) { h.scored += m.result.home; h.conceded += m.result.away; }
    if (a) { a.scored += m.result.away; a.conceded += m.result.home; }
  }
  return [...acc.values()];
}

export const mostGoalsScored = () => [...teamGoalStats()].sort((a, b) => b.scored - a.scored || a.team.name.localeCompare(b.team.name, 'nl'));
export const mostGoalsConceded = () => [...teamGoalStats()].sort((a, b) => b.conceded - a.conceded || a.team.name.localeCompare(b.team.name, 'nl'));

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

/** Most-picked top scorer across all participants. */
export function topChosenTopScorers(limit = 5): { player: string; team?: Team; count: number }[] {
  const counts = new Map<string, number>();
  for (const p of participants) {
    const s = p.bonus.topScorer;
    if (s) counts.set(s, (counts.get(s) ?? 0) + 1);
  }
  const teamOf = (player: string) => {
    const sc = scorers.find((s) => s.player === player);
    return sc ? getTeam(sc.teamId) : undefined;
  };
  return [...counts.entries()]
    .map(([player, count]) => ({ player, team: teamOf(player), count }))
    .sort((a, b) => b.count - a.count || a.player.localeCompare(b.player, 'nl'))
    .slice(0, limit);
}

/** Overall average points scored per (participant, finished match). */
export function averageMatchPoints(): number {
  const stats = matchPointStats();
  const total = stats.reduce((s, m) => s + m.total, 0);
  const count = stats.reduce((s, m) => s + m.n, 0);
  return count ? total / count : 0;
}
