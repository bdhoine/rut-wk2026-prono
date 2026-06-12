// Dutch display helpers.
import type { MatchScore } from './scoring';

const dateFmt = new Intl.DateTimeFormat('nl-BE', {
  weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Brussels',
});
const dayFmt = new Intl.DateTimeFormat('nl-BE', {
  weekday: 'long', day: 'numeric', month: 'long', timeZone: 'Europe/Brussels',
});

const timeFmt = new Intl.DateTimeFormat('nl-BE', {
  hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Brussels',
});

export const formatKickoff = (iso: string) => dateFmt.format(new Date(iso));
export const formatDay = (iso: string) => dayFmt.format(new Date(iso));
export const formatTime = (iso: string) => timeFmt.format(new Date(iso));

/** Human-readable Dutch explanation of how a match score was determined (rules.md §2/§3). */
export function explainScore(s: MatchScore): string {
  let base: string;
  if (s.late) base = 'Te laat of niet ingevuld → 0 basispunten';
  else if (!s.outcomeCorrect) base = 'Verkeerde uitslag → 0 punten';
  else if (s.exact) base = 'Exacte uitslag → 9 basispunten';
  else {
    const raw = 7 - s.goalsOff;
    const noun = s.goalsOff === 1 ? 'goal' : 'goals';
    base = raw < 3
      ? `Juiste winnaar, ${s.goalsOff} ${noun} ernaast → 7 − ${s.goalsOff} = ${raw}, minimum 3 basispunten`
      : `Juiste winnaar, ${s.goalsOff} ${noun} ernaast → 7 − ${s.goalsOff} = ${s.basePoints} basispunten`;
  }
  if (s.multiplier > 1 && s.basePoints > 0) {
    return `${base} × ${s.multiplier} = ${s.points} punten`;
  }
  return s.points === s.basePoints ? base : `${base} → ${s.points} punten`;
}
