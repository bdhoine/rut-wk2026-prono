// Prize money per final position (euro). The official ranking in the WhatsApp
// group counts; this is shown on the klassement (gold-tinted prize spots) and
// celebrated on a participant's profile when they're in the money.
export const PRIZES: Record<number, number> = { 1: 320, 2: 200, 3: 120, 4: 90, 5: 60 };

/** Prize money for a final position, or 0 if it's outside the paid spots. */
export const prizeFor = (position: number): number => PRIZES[position] ?? 0;
