// Formatting for goal-scorer lines (match cards, match-page hero, live
// overlay). Shared between build-time components and the LiveScores client
// bundle, so keep it dependency-free.

export interface GoalLike {
  player: string;
  teamId: string;
  minute: string; // ESPN display clock, e.g. "62'" or "90'+4'"
  og?: boolean;
  pen?: boolean;
}

/** "Ladislav Krejcí" -> "L. Krejcí" (ESPN's own short form); single-word names
 *  pass through unchanged. */
export function shortPlayer(name: string): string {
  const parts = String(name).trim().split(/\s+/);
  return parts.length > 1 ? `${parts[0][0]}. ${parts.slice(1).join(' ')}` : name;
}

/** One team's scorers as compact text, goals grouped per player in scoring
 *  order: "H. Kane 55' 67', J. Bellingham 62' (p)". Own goals get "(e.d.)". */
export function scorerLine(goals: GoalLike[], teamId: string | null): string {
  const groups: { key: string; player: string; minutes: string[] }[] = [];
  for (const g of goals) {
    if (g.teamId !== teamId) continue;
    const marks = `${g.pen ? ' (p)' : ''}${g.og ? ' (e.d.)' : ''}`;
    const key = `${g.player}|${g.og ? 'og' : ''}`;
    let group = groups.find((x) => x.key === key);
    if (!group) groups.push((group = { key, player: g.player, minutes: [] }));
    group.minutes.push(`${g.minute}${marks}`);
  }
  return groups.map((g) => `${shortPlayer(g.player)} ${g.minutes.join(' ')}`).join(', ');
}
