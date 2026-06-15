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

// Sortable calendar-day key (YYYY-MM-DD) in Belgian time.
const dayKeyFmt = new Intl.DateTimeFormat('en-CA', {
  year: 'numeric', month: '2-digit', day: '2-digit', timeZone: 'Europe/Brussels',
});

export const formatKickoff = (iso: string) => dateFmt.format(new Date(iso));
export const formatDay = (iso: string) => dayFmt.format(new Date(iso));
export const formatTime = (iso: string) => timeFmt.format(new Date(iso));

/** Sortable Belgian-time calendar day, e.g. '2026-06-14', for grouping by day. */
export const dayKey = (iso: string) => dayKeyFmt.format(new Date(iso));
/** Human-readable Dutch label for a 'YYYY-MM-DD' day key (noon avoids TZ rollover). */
export const formatDayKey = (key: string) => dayFmt.format(new Date(`${key}T12:00:00+02:00`));

/** URL-safe slug from free text (diacritics stripped), e.g. for player-name routes. */
export const slugify = (s: string) =>
  s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');

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
