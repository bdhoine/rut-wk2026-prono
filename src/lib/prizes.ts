// Prize money per final position (euro). The official ranking in the WhatsApp
// group counts; this is shown on the klassement (gold-tinted prize spots) and
// celebrated on a participant's profile when they're in the money.
export const PRIZES: Record<number, number> = { 1: 320, 2: 200, 3: 120, 4: 90, 5: 60 };

/**
 * Prize money per person for a final position, accounting for ties.
 *
 * `tiedCount` people sharing `position` occupy ranks `position` …
 * `position + tiedCount - 1`; the prize money for all of those ranks is pooled
 * and split equally. So e.g. two people tied for 4th split the 4th + 5th money
 * ((90 + 60) / 2 = 75 each) and there is no separate 5th place; three tied for
 * 1st split 1st + 2nd + 3rd, etc. Returns 0 outside the paid spots.
 */
export const prizeFor = (position: number, tiedCount = 1): number => {
  if (tiedCount < 1) return 0;
  let pool = 0;
  for (let p = position; p < position + tiedCount; p++) pool += PRIZES[p] ?? 0;
  return pool / tiedCount;
};
