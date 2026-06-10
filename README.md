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
| `/` | Klassement (ranking) — tap a participant for details |
| `/deelnemer/[id]` | Participant detail: position, total, bonus picks, all predictions + score breakdown |
| `/wedstrijd/[id]` | Match detail: all participants' predictions, sorted by points |
| `/komende` | Upcoming matches |
| `/kalender` | Full fixtures, grouped by round |
| `/poules` | Group standings + best third-placed ranking |
| `/land/[id]` | Country detail: full schedule + group standings |
| `/stats` | Top scorers, most goals scored, most goals conceded |

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

> The sample data currently in the repo is **illustrative** (2 groups, a few participants) to demonstrate the app. Replace it with the real data before going live.

## Deployment

Connect the repo to Netlify. Build settings are in [`netlify.toml`](./netlify.toml)
(`npm run build` → `dist`). Pushing to the default branch triggers a rebuild.
