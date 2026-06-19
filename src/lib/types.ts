// Domain types for the Rut Prono WK 2026 app. See docs/rules.md and docs/requirements.md.

export type RoundId = 'group' | 'r32' | 'r16' | 'qf' | 'sf' | 'third' | 'final';
export type MatchStatus = 'scheduled' | 'live' | 'finished';

export interface Team {
  id: string; // short slug, e.g. 'mex'
  iso: string; // ISO 3166-1 alpha-2 (lowercase) for flags, e.g. 'mx'
  name: string; // Dutch name
  shortName?: string; // compact Dutch name for narrow viewports, e.g. 'VS'
  group: string; // 'A'..'L'
}

export interface Group {
  id: string; // 'A'..'L'
  teamIds: string[];
}

export interface Score {
  home: number;
  away: number;
}

export interface Match {
  id: string;
  round: RoundId;
  matchday?: 1 | 2 | 3; // group stage only
  kickoff: string; // ISO datetime (local Belgian time assumed in display)
  venue: string;
  // Either concrete teams or placeholders (knockout brackets fill in progressively).
  homeTeamId: string | null;
  awayTeamId: string | null;
  homePlaceholder?: string; // e.g. 'Winnaar Groep A'
  awayPlaceholder?: string; // e.g. '2e Groep B'
  status: MatchStatus;
  result?: Score; // score after 120 min for knockouts; penalties ignored
  apiId?: number; // API-Football fixture id, set by scripts/update-results.mjs
  winnerTeamId?: string; // knockout winner (incl. on penalties), set by the updater
}

export interface BonusPicks {
  topScorer?: string; // free-text player name
  winnerTeamId?: string;
  mostConcededTeamId?: string;
  mostScoredTeamId?: string;
}

export interface Participant {
  id: string;
  name: string;
  bonus: BonusPicks;
  // Phone numbers are intentionally NOT part of the data (see docs/requirements.md).
}

export interface Prediction {
  participantId: string;
  matchId: string;
  home: number;
  away: number;
  late?: boolean; // submitted after the match started -> 0 points
}

export interface BonusOutcomes {
  topScorer?: string;
  winnerTeamId?: string;
  mostConcededTeamId?: string;
  mostScoredTeamId?: string;
}

export interface Settings {
  multipliers: Record<RoundId, number>;
  bonusPoints: number; // points per correct bonus prediction
}

export interface Scorer {
  player: string;
  teamId: string;
  goals: number; // tournament goals; penalties (shoot-out) excluded, extra time included
}

export const ROUND_LABELS: Record<RoundId, string> = {
  group: 'Groepsfase',
  r32: '1/16de finales',
  r16: '1/8ste finales',
  qf: 'Kwartfinales',
  sf: 'Halve finales',
  third: 'Troostfinale',
  final: 'Finale',
};

export const ROUND_ORDER: RoundId[] = ['group', 'r32', 'r16', 'qf', 'sf', 'third', 'final'];

// Prono submission deadlines per round (local Belgian time), from docs/schedule.md.
// All group-stage predictions are due before the tournament starts; each knockout
// round has its own deadline ~1 hour before the round's first match.
export const ROUND_DEADLINES: Record<RoundId, string> = {
  group: '2026-06-11T20:00:00+02:00',
  r32: '2026-06-28T20:00:00+02:00',
  r16: '2026-07-04T18:00:00+02:00',
  qf: '2026-07-09T21:00:00+02:00',
  sf: '2026-07-14T20:00:00+02:00',
  third: '2026-07-18T22:00:00+02:00',
  final: '2026-07-18T22:00:00+02:00',
};
