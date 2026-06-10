# Rut Prono WK 2026 — Web App Requirements

Requirements for the web application that displays the ranking and predictions of the **Rut Prono World Cup 2026** competition. Scoring and tournament details are defined in [`rules.md`](./rules.md) and [`schedule.md`](./schedule.md).

---

## 1. Goal

A public, read-only web app where participants and visitors can follow the competition: the live **ranking**, each participant's **predictions and scores**, **per-match prediction overviews**, **upcoming matches**, the full **fixtures** list, and **group standings** with **country** detail pages. The frontend is in **Dutch**; it must be **mobile-first** and **deployable on Netlify**.

---

## 2. Technical decisions

| Area | Decision |
|------|----------|
| Framework | **Astro** with **React islands** for interactive components (sortable tables, tabs, detail navigation) |
| Styling / design system | **Tailwind CSS + shadcn/ui** — consistent, accessible, themeable to De Rut branding |
| Data storage | **Static JSON/CSV files committed in the repo**; a git push triggers a Netlify rebuild. No database, no backend service |
| Results & scoring | **Manual entry** of final scores + the 4 bonus outcomes; the **app computes** all per-match points, bonus points, and the ranking from the rules. The data store is the single source of truth |
| Hosting | **Netlify** (static output + Netlify adapter) |
| Flags | SVG flag set (e.g. `flag-icons` / `circle-flags`) keyed by ISO country code |
| Language / locale | Dutch (`nl-BE`); dates/times shown in local Belgian time |

**Implication of static + auto-compute:** updating the standings during the tournament means editing a results file and pushing (Netlify rebuilds). Participant predictions are entered once (from the paper forms) into data files. No in-app editing/admin UI is in scope (see §8).

---

## 3. Data model (conceptual)

Stored as static files; exact file layout to be finalised at scaffold time.

- **Participant**: `id`, `name`, bonus predictions (top scorer, winner, most goals conceded, most goals scored). **Phone numbers are not part of the app data** — they stay with the organisers (WhatsApp group) and never enter the repo.
- **Country / Team**: `id`, ISO code (for flag), Dutch name, group.
- **Group**: `id` (A–L), list of countries.
- **Match**: `id`, round (group / R32 / R16 / QF / SF / 3rd-place / final), matchday (group stage), date/time, venue, home team, away team, status (`scheduled` / `live` / `finished`), result (`homeGoals`, `awayGoals`, after-120-min score for knockouts — penalties ignored per rules).
- **Prediction**: `participantId`, `matchId`, `predHome`, `predAway`. (Late/missing → 0 points per rules.)
- **Bonus outcomes** (tournament-level, filled in as the tournament resolves): actual top scorer, actual winner, actual country with most conceded, actual country with most scored.
- **Scorer**: `player`, `teamId`, `goals` — for the stats page (penalties excluded, extra time included).
- **Tournament settings**: round multipliers, deadlines (from `schedule.md`), prize distribution text.

Knockout matches start with placeholder teams and are filled in as results come in.

Data is stored as JSON in `src/data/`. A deterministic generator
(`scripts/generate-data.mjs`) produces the full demo dataset (48 teams / 12 groups,
104-match calendar, knockout placeholders, 40 dummy contestants + predictions,
scorers); real data is entered by editing the JSON or adapting the generator.

---

## 4. Scoring & ranking (computed)

All computation follows [`rules.md`](./rules.md):

- **Per-match base points**: exact = 9; correct outcome = `max(3, 7 − goalsOff)`; wrong outcome = 0.
- **Round multiplier**: group ×1, R32 ×2, R16 ×3, QF/SF/3rd-place ×4, final ×5.
- **Extra time**: use score after 120 min; ignore penalties.
- **Bonus**: 4 predictions × 30 points, evaluated tournament-wide.
- **Total score** per participant = Σ(base × multiplier) + Σ(bonus). **Late forms** → 0 base points for matches already started at submission time.
- **Ranking** = participants sorted by descending total score.
- **Tie-break (assumption, see §9):** equal totals share the same position (standard competition ranking); secondary display order alphabetical by name.

The app must, for any finished match, be able to **explain how a participant's points were determined** (prediction vs result, outcome match?, goalsOff, base points, multiplier, final points).

---

## 5. Pages & navigation

Primary navigation: **Klassement** · **Komende** · **Kalender** · **Knock-out** · **Poules** · **Stats**. Rendered as a horizontal bar on desktop and a **hamburger menu** on mobile.

### 5.1 Ranking (home / landing page)
- Table with columns: **position**, **name**, **points**.
- Sorted by descending points; ties handled per §4.
- Each row is clickable → **Participant detail** (§5.2).
- Mobile-first table layout.

### 5.2 Participant detail
- **Top:** a prominent header card with the participant's **current position** (medal-coloured for 1/2/3) and **total score**, split into match + bonus points.
- **Bonus predictions** section: the 4 predictions, each showing the pick (with flag where it's a country) and, once resolved, whether it was correct and points awarded.
- **Match list:** all matches grouped by round. Each match card (consistent with the match-card style) shows the **prono as the main boxed score** with the **actual result smaller beneath it**, plus a colour-coded **points badge**. The §4 breakdown appears in a tooltip on hover (desktop) / tap (mobile).

### 5.3 Match detail
- Match header: teams (with **flags**), date/time, venue, round, and the result as **boxed numbers** if finished.
- **List of all participants' predictions for this match, sorted by score** (points earned for that match, descending). For not-yet-played matches, show predictions with no score (default order by current ranking).
- For finished matches, each prediction shows a colour-coded points badge with the §4 breakdown on hover/tap.

### Score boxes & points badge (shared UI)
- Scores render as **boxed numbers** (`[2] – [1]`); an unknown score shows an empty dash, never `0–0`.
- The **points badge** is colour-coded: **red** for 0, **green** when points are scored, a distinct **amber** tint for an exact score (9 base). The explanation text uses correct `goal`/`goals` pluralisation.

### 5.4 Upcoming matches
- List of matches with status `scheduled`, soonest first, with countdown/time, teams (flags), venue, round.
- Each match clickable → **Match detail**.
- Surface the relevant **submission deadline** for the upcoming round (from `schedule.md`).

### 5.5 Fixtures (Kalender)
- Full list of all 104 matches, grouped by round and date.
- Show result where finished; clickable → **Match detail**.

### 5.6 Knock-out schedule
- The knockout rounds (Round of 32 → Round of 16 → quarter-finals → semi-finals → third-place play-off → final) shown as a schedule, grouped by round with dates.
- Matches start as **placeholders** and fill in with teams as group/knockout results are entered. Each clickable → **Match detail**.

### 5.7 Group rankings (Groups)
- The 12 groups (A–L), each as a **standings table**: country (flag + Dutch name), played, W/D/L, goals for/against, goal difference, points.
- Standings computed from finished group-stage results (3/1/0; tie-break GD → goals scored).
- Indicate qualification: top 2 of each group qualify directly.
- **Best third-placed ranking:** a separate cross-group table ranking the 12 third-placed teams (points → GD → goals scored), highlighting the **8 best** that advance to the Round of 32. Shown on the Groups page.
- Each country clickable → **Country detail**.

### 5.8 Country detail
- Country header with **flag** and Dutch name, group.
- **Full schedule** for that country (all its matches, results where played), clickable → Match detail.
- That country's **group standings** table.

### 5.9 Stats
- **Top scorers** ranking (player, country flag, goals).
- **Most goals scored** and **most goals conceded** per team, computed from finished results (penalty shoot-outs excluded, extra time included — see `rules.md`).

---

## 6. UI / UX

- **Mobile-first**, responsive up to desktop; touch-friendly tap targets.
- Consistent components from **shadcn/ui** (tables, tabs, dialog/sheet for details, badges).
- **Flags** everywhere countries appear.
- Dutch copy throughout; clear empty states (e.g. "Nog geen uitslag").
- Fast initial load (Astro static, minimal JS); accessible (semantic tables, keyboard nav, sufficient contrast).
- Clear visual treatment of: correct exact scores, correct outcome, and zero-point predictions.

---

## 7. Non-functional requirements

- **Deployable on Netlify** from the git repo; pushes trigger rebuilds.
- Performance budget suited to mobile networks; lazy-load non-critical JS.
- **No personal data exposed publicly: participant phone numbers are not part of the app data at all** — they never enter the repo or build output, so there is nothing to leak. Only names and predictions are stored.
- Maintainable data files with a documented format so admins can enter predictions/results.

---

## 8. Out of scope (initial version)

- In-app admin / data-entry UI, authentication, user accounts.
- Real-time/live score push (updates arrive via rebuilds on data change).
- Automated results ingestion from a football API (manual entry chosen).
- Payment handling (entry fee is paid in person at De Rut).

---

## 9. Assumptions & open decisions

These were decided by default; flag if you want them changed:

1. **Tie-break in ranking:** equal totals share a position, secondary order alphabetical. *(Alternative: order ties by number of exact scores, or by bonus points.)*
2. **Flag library:** SVG set keyed by ISO code (`flag-icons` or `circle-flags`).
3. **Match detail ordering for unplayed matches:** by current participant ranking (no per-match score exists yet).
4. **Data file format:** all entities are stored as JSON in `src/data/`, generated/refreshed via `scripts/generate-data.mjs`.
5. **Knockout brackets** are filled in progressively as results are entered; until then matches show placeholders (e.g. "Winnaar Groep A").

---

## 10. Build order (suggested)

1. Scaffold Astro + Tailwind + shadcn/ui; Netlify config.
2. Define data files + TypeScript types; load layer.
3. Scoring & ranking engine (pure functions, unit-tested against the `rules.md` examples).
4. Ranking page → Participant detail.
5. Fixtures + Match detail (predictions sorted by score).
6. Upcoming matches.
7. Groups + Country detail, with flags.
8. Polish: mobile nav, empty states, branding, deploy.
