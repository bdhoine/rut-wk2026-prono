// Scoring engine — pure functions implementing docs/rules.md.
import type { BonusOutcomes, BonusPicks, Match, Participant, Prediction, RoundId, Score, Settings } from './types';

export type Outcome = 'home' | 'away' | 'draw';

export function outcomeOf(home: number, away: number): Outcome {
  if (home > away) return 'home';
  if (home < away) return 'away';
  return 'draw';
}

export interface MatchScore {
  points: number; // base * multiplier
  basePoints: number;
  multiplier: number;
  exact: boolean;
  outcomeCorrect: boolean;
  goalsOff: number; // sum of absolute per-team differences
  late: boolean;
}

/**
 * Base points for a single match (before the round multiplier), per rules.md §2:
 *  - exact score        -> 9
 *  - correct outcome    -> max(3, 7 - goalsOff)
 *  - wrong outcome      -> 0
 */
export function basePoints(pred: Score, result: Score): { base: number; exact: boolean; outcomeCorrect: boolean; goalsOff: number } {
  const exact = pred.home === result.home && pred.away === result.away;
  const goalsOff = Math.abs(pred.home - result.home) + Math.abs(pred.away - result.away);
  if (exact) return { base: 9, exact: true, outcomeCorrect: true, goalsOff: 0 };
  const outcomeCorrect = outcomeOf(pred.home, pred.away) === outcomeOf(result.home, result.away);
  if (!outcomeCorrect) return { base: 0, exact: false, outcomeCorrect: false, goalsOff };
  return { base: Math.max(3, 7 - goalsOff), exact: false, outcomeCorrect: true, goalsOff };
}

export function multiplierFor(round: RoundId, settings: Settings): number {
  return settings.multipliers[round] ?? 1;
}

/**
 * Full per-match score for a prediction. Returns null when the match has no
 * usable result yet. Late submissions score 0 for already-started matches.
 */
export function scoreMatch(pred: Prediction | undefined, match: Match, settings: Settings): MatchScore | null {
  if (!match.result || match.status !== 'finished') return null;
  const multiplier = multiplierFor(match.round, settings);
  if (!pred || pred.late) {
    return { points: 0, basePoints: 0, multiplier, exact: false, outcomeCorrect: false, goalsOff: 0, late: !!pred?.late || !pred };
  }
  const b = basePoints({ home: pred.home, away: pred.away }, match.result);
  return {
    points: b.base * multiplier,
    basePoints: b.base,
    multiplier,
    exact: b.exact,
    outcomeCorrect: b.outcomeCorrect,
    goalsOff: b.goalsOff,
    late: false,
  };
}

/** Bonus points (rules.md §5): each correct pick is worth settings.bonusPoints.
 *  Tie-aware: an outcome that ended in a shared lead is an array of all tied
 *  leaders, and any pick among them is correct. */
export function bonusBreakdown(picks: BonusPicks, outcomes: BonusOutcomes, settings: Settings) {
  const items: { key: keyof BonusPicks; correct: boolean | null; points: number }[] = [];
  const cmp = (a?: string, b?: string | string[]): boolean | null => {
    if (b === undefined || b === '' || (Array.isArray(b) && b.length === 0)) return null; // outcome not yet known
    return !!a && (Array.isArray(b) ? b.includes(a) : a === b);
  };
  const keys: (keyof BonusPicks)[] = ['topScorer', 'winnerTeamId', 'mostConcededTeamId', 'mostScoredTeamId'];
  let total = 0;
  for (const key of keys) {
    const correct = cmp(picks[key], outcomes[key as keyof BonusOutcomes]);
    const points = correct === true ? settings.bonusPoints : 0;
    total += points;
    items.push({ key, correct, points });
  }
  return { items, total };
}

export interface ParticipantTotals {
  participantId: string;
  matchPoints: number;
  bonusPoints: number;
  total: number;
}

export function participantTotals(
  participant: Participant,
  predictions: Prediction[],
  matches: Match[],
  outcomes: BonusOutcomes,
  settings: Settings,
): ParticipantTotals {
  const predByMatch = new Map(predictions.filter((p) => p.participantId === participant.id).map((p) => [p.matchId, p]));
  let matchPoints = 0;
  for (const match of matches) {
    const s = scoreMatch(predByMatch.get(match.id), match, settings);
    if (s) matchPoints += s.points;
  }
  const bonusPoints = bonusBreakdown(participant.bonus, outcomes, settings).total;
  return { participantId: participant.id, matchPoints, bonusPoints, total: matchPoints + bonusPoints };
}

export interface RankRow extends ParticipantTotals {
  position: number;
  name: string;
}

/**
 * Standard competition ranking: equal totals share a position; ties ordered
 * alphabetically by name (rules.md / requirements §4).
 */
export function rankParticipants(
  participants: Participant[],
  predictions: Prediction[],
  matches: Match[],
  outcomes: BonusOutcomes,
  settings: Settings,
): RankRow[] {
  const totals = participants.map((p) => ({
    ...participantTotals(p, predictions, matches, outcomes, settings),
    name: p.name,
  }));
  totals.sort((a, b) => b.total - a.total || a.name.localeCompare(b.name, 'nl'));
  let position = 0;
  let lastTotal: number | null = null;
  return totals.map((row, i) => {
    if (lastTotal === null || row.total !== lastTotal) {
      position = i + 1;
      lastTotal = row.total;
    }
    return { ...row, position };
  });
}
