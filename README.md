# Rut Prono WK 2026

Web app showing the **ranking and predictions** of the De Rut World Cup 2026 prediction competition (*prono*). Dutch frontend, mobile-first, deployable on Netlify.

The competition rules, scoring, and tournament schedule are documented in [`docs/`](./docs):
- [`docs/rules.md`](./docs/rules.md) — scoring & prediction rules
- [`docs/schedule.md`](./docs/schedule.md) — tournament schedule & details
- [`docs/requirements.md`](./docs/requirements.md) — app requirements

## Stack

- **[Astro](https://astro.build)** (static output) with **React islands** for interactive bits
- **Tailwind CSS v4** (via `@tailwindcss/postcss`) + **shadcn/ui** components
- **[flag-icons](https://github.com/lipis/flag-icons)** for country flags
- **Netlify** for hosting (`@astrojs/netlify` adapter)
- Data is **static JSON** in the repo; the app computes all scores & rankings at build time

## Pages

| Route | Page |
|-------|------|
| `/` | Klassement (ranking) — favourites table on top (★, saved in `localStorage`), eindwinnaar flag per row, tap a participant for details |
| `/deelnemer/[id]` | Participant detail: position, total, bonus picks, all predictions (sorted by kickoff) + score breakdown |
| `/wedstrijd/[id]` | Match detail: per-match stats (avg points, exact, correct 1X2, wrong) + all predictions sorted by points |
| `/komende` | Upcoming matches (planning order) |
| `/kalender` | Full fixtures grouped by speeldag (group stage) and knockout round, with prono submission deadlines |
| `/poules` | Group standings + best third-placed ranking |
| `/land/[id]` | Country detail: full schedule + group standings |
| `/stats` | Top scorers, most goals scored/conceded, top-10 matches by points and by wrong predictions |

Navigation is a horizontal bar on desktop and a hamburger menu on mobile. All
game lists are ordered by kickoff (planning). Score explanations on the
participant and match pages appear on hover (desktop) / tap (mobile); the points
badge is colour-coded (red = 0, green = scored, amber = exact).

## Development

```bash
npm install
npm run dev      # dev server at http://localhost:4321
npm run build    # production build to dist/
npm run preview  # preview the build
```

## Data

All data lives in [`src/data/`](./src/data) as JSON and is the single source of truth.
The scoring/ranking engine ([`src/lib/scoring.ts`](./src/lib/scoring.ts)) computes everything from it.

The data is produced by the deterministic generator [`scripts/generate-data.mjs`](./scripts/generate-data.mjs),
which can emit the dataset for any **tournament phase** — switch with one command:

```bash
npm run data:start    # tournament not started: full schedule, no results, only Barry's real predictions
npm run data:md2      # after matchday 2 (MD1+MD2 played; MD3 + knockout to come)
npm run data:groups   # group stage complete (MD1-3 played; Round of 32 teams known)
npm run data:final    # whole tournament played (champion decided, bonus outcomes resolved)
# then: npm run build   (or it's already running under `npm run dev`)
```

It uses the real WK 2026 draw + fixtures; MD1/MD2 use hand-crafted results, while
MD3 and the knockout bracket are simulated from team strengths (winners propagate
through the bracket). Edit the JSON in `src/data/` directly for real data.

| File | Contents |
|------|----------|
| `teams.json` | Teams: `id`, `iso` (lowercase ISO 3166-1 alpha-2 for flags), Dutch `name`, `group` |
| `groups.json` | Groups A–L → team ids |
| `matches.json` | Matches: round, kickoff, venue, teams (or placeholders), `status`, `result` |
| `participants.json` | Participants: `id`, `name`, `bonus` picks. **No phone numbers** (kept off the repo by design) |
| `predictions.json` | Per-participant, per-match predicted scores (`late: true` ⇒ 0 points) |
| `outcomes.json` | Actual tournament bonus outcomes (top scorer, winner, most scored/conceded) |
| `scorers.json` | Player goal tallies for the stats page |
| `settings.json` | Round multipliers and bonus points |

### Updating during the tournament

1. Enter final scores on the relevant match in `matches.json` (set `status: "finished"` and `result`). For knockouts, use the **score after 120 min** (penalties are ignored — see `docs/rules.md`).
2. Fill in `homeTeamId` / `awayTeamId` on knockout matches as brackets resolve.
3. Update `scorers.json` and `outcomes.json` as the tournament progresses.
4. Commit & push — Netlify rebuilds and the ranking updates automatically.

> The repo data uses the **real WK 2026 draw and fixture schedule** (groups, dates, venues, kickoff times). Kickoffs are stored with each venue's UTC offset and shown in Belgium time. Matchday 1 & 2 results are **simulated** realistic scorelines (the tournament hasn't been played); matchday 3 and the knockout bracket are still to come. Contestants are **40 fictional entries** plus one real personal entry ("Barry"); predictions for the dummy contestants are simulated with varying skill.

## Deployment

Connect the repo to Netlify. Build settings are in [`netlify.toml`](./netlify.toml)
(`npm run build` → `dist`). Pushing to the default branch triggers a rebuild.
