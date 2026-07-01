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

/** One team's scorers as per-player groups of nowrap-safe tokens in scoring
 *  order: [["H. Kane 55'", "67'"], ["J. Bellingham 62' (p)"]]. Own goals get
 *  "(e.d.)". The first token carries the player name with their first minute;
 *  extra minutes are separate tokens, so renderers can nowrap each token (a
 *  name never separates from its first minute) while a hat-trick's minute list
 *  still wraps instead of overflowing a narrow column. */
export function scorerGroups(goals: GoalLike[], teamId: string | null): string[][] {
  const groups: { key: string; player: string; minutes: string[] }[] = [];
  for (const g of goals) {
    if (g.teamId !== teamId) continue;
    const marks = `${g.pen ? ' (p)' : ''}${g.og ? ' (e.d.)' : ''}`;
    const key = `${g.player}|${g.og ? 'og' : ''}`;
    let group = groups.find((x) => x.key === key);
    if (!group) groups.push((group = { key, player: g.player, minutes: [] }));
    group.minutes.push(`${g.minute}${marks}`);
  }
  return groups.map((g) => g.minutes.map((m, i) => (i === 0 ? `${shortPlayer(g.player)} ${m}` : m)));
}

/** `scorerGroups` joined to one plain-text line: "H. Kane 55' 67', J. Bellingham 62' (p)". */
export function scorerLine(goals: GoalLike[], teamId: string | null): string {
  return scorerGroups(goals, teamId)
    .map((g) => g.join(' '))
    .join(', ');
}

/** Flatten `scorerGroups` output to display tokens: each token is one nowrap
 *  unit, with the group-separating comma attached to a group's last token. */
export function scorerTokens(groups: string[][]): string[] {
  return groups.flatMap((g, gi) =>
    g.map((t, ti) => (gi < groups.length - 1 && ti === g.length - 1 ? `${t},` : t)),
  );
}
