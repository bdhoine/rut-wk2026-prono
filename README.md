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
| `/` | Klassement (ranking) — hero panel with current speeldag and next match, then the ranking. Favourites table on top (★, saved in `localStorage`), eindwinnaar flag per row, tap a participant for details. A "Nu live & recent gespeeld" strip shows at most 4 cards: every live match on top (via the **Live scores** toggle) filled up with the most recently finished matches (the last 2 always shown), plus a provisional live ranking |
| `/deelnemer/[id]` | Participant detail: position, total, bonus picks, predictions per speeldag in collapsible sections (played/current open, future collapsed) + score breakdown |
| `/wedstrijd/[id]` | Match detail: per-match stats (avg points, exact, correct 1X2, wrong) + all predictions sorted by points |
| `/programma` | Upcoming matches, grouped per calendar day |
| `/kalender` | Full fixtures grouped by speeldag (group stage) and knockout round, with sticky day subheadings and prono submission deadlines |
| `/poules` | Group standings (two-column grid on desktop) + best third-placed ranking; qualification highlight only once a group has results |
| `/land/[id]` | Country detail: full schedule + group standings |
| `/statistieken` | Top scorers, most goals scored/conceded (unplayed teams hidden behind "Toon alle"), top-10 matches by points and by wrong predictions, popular scorelines, most-picked winner/top scorer |
| `/reglement` | Competition rules, deadlines and prizes |
| any other URL | Branded 404 page ("Buitenspel!") |

Navigation is `Klassement · Wedstrijden ▾ · Statistieken` on desktop — the
Wedstrijden dropdown groups Programma, Kalender and Poules — and a hamburger
drawer on mobile mirroring the same grouping. Reglement links from the footer,
and `/klassement` redirects to `/` so every label has a matching URL. All game
lists are ordered by kickoff (planning). Score explanations on the participant
and match pages appear on hovering the points badge (desktop) / tap (mobile);
the badge is colour-coded (red = 0, green = exact, amber = other points).

## Design

The UI follows the **FIFA World Cup 26 brand language**: a black ("ink") + gold
core palette — matching the official trophy emblem — with the multicolor
host-city accents reduced to a 4 px diagonal `brand-stripe` under the header and
above the footer, plus a faint fixed multicolor corner wash behind every page
(`body::before` in `global.css`). Display type is **Archivo** (bold geometric, echoing the FWC26
typeface), body type **Noto Sans** (FIFA's official secondary font). Light, dark
and auto themes (OKLch tokens in [`src/styles/global.css`](./src/styles/global.css)).

Reusable brand utilities (all in `global.css`):
- `.hero-panel` — ink-gradient panel with a gold top edge (home hero, participant/match headers, 404)
- `.qc-decor` — quarter-circle corner ghost, the "26"-emblem square + quarter-circle geometry
- `.bar-cut` — diagonally-cut gold bar used by `SectionHeading.astro`, echoing the FIFA wordmark
- `.animate-rise` — subtle hero entrance, disabled under `prefers-reduced-motion`

Long team names have an optional `shortName` in `teams.json`, used on narrow
viewports and in compact contexts (match cards, standings tables).

## Live scores & automatic results

Two integrations keep the app current during the tournament, both backed by the
free, open [worldcup26.ir](https://worldcup26.ir) WK 2026 API. **No API key is
required.** (It's a community service, so the code degrades gracefully when it's
temporarily unavailable.)

- **Final results (build-time data).** A GitHub Actions workflow
  ([`.github/workflows/update-results.yml`](./.github/workflows/update-results.yml))
  runs [`scripts/update-results.mjs`](./scripts/update-results.mjs) on a cron. It
  links each fixture to our match (by team pair or kickoff wall-clock + round),
  writes finished-match scores, fills knockout teams as brackets resolve,
  aggregates `scorers.json`, and resolves the bonus `outcomes.json` once the
  final is played. It commits any changes, which triggers a Netlify rebuild. Run
  locally with `npm run results:update`.
- **Live scores (client-side).** A "Live scores" toggle on the home, Programma,
  Kalender and Poules pages fetches the in-progress scores and then auto-refreshes
  every minute while on. On the home page live matches show as cards above the
  recently-finished ones (max 4 total) and the **klassement recomputes
  provisional points live**; on Programma/Kalender the live score overlays the
  match card (badge above the score pill); on Poules the playing countries get a
  pulsing red dot with their live score. Requests go through a Netlify Function
  ([`netlify/functions/live.mjs`](./netlify/functions/live.mjs), at
  `/.netlify/functions/live`) that caches 60 seconds (CDN + memory) and serves
  the last good payload on error. The shared client/resolver lives in
  [`scripts/lib/worldcup.mjs`](./scripts/lib/worldcup.mjs).

> Knockout scores from this source are the score as reported (no separate
> after-120-min / penalty handling); double-check knockout results against
> `docs/rules.md` if needed.

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
npm run data:start    # tournament not started: full schedule, no results, only the real contestants' predictions
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
| `teams.json` | Teams: `id`, `iso` (lowercase ISO 3166-1 alpha-2 for flags), Dutch `name`, optional `shortName` (compact display), `group` |
| `groups.json` | Groups A–L → team ids |
| `matches.json` | Matches: round, kickoff, venue, teams (or placeholders), `status`, `result`, plus `apiId` / `winnerTeamId` filled by the results updater |
| `participants.json` | Participants: `id`, `name`, `bonus` picks. **No phone numbers** (kept off the repo by design) |
| `predictions.json` | Per-participant, per-match predicted scores (`late: true` ⇒ 0 points) |
| `outcomes.json` | Actual tournament bonus outcomes (top scorer, winner, most scored/conceded) |
| `scorers.json` | Player goal tallies for the stats page |
| `settings.json` | Round multipliers and bonus points |

### Updating during the tournament

Normally the **GitHub Actions results workflow** (see *Live scores & automatic
results* above) does this automatically. To update by hand instead:

1. Enter final scores on the relevant match in `matches.json` (set `status: "finished"` and `result`). For knockouts, use the **score after 120 min** (penalties are ignored — see `docs/rules.md`).
2. Fill in `homeTeamId` / `awayTeamId` on knockout matches as brackets resolve.
3. Update `scorers.json` and `outcomes.json` as the tournament progresses.
4. Commit & push — Netlify rebuilds and the ranking updates automatically.

> The repo data uses the **real WK 2026 draw and fixture schedule** (groups, dates, venues, kickoff times). Kickoffs are stored with each venue's UTC offset and shown in Belgium time. Matchday 1 & 2 results are **simulated** realistic scorelines (the tournament hasn't been played); matchday 3 and the knockout bracket are still to come. Contestants are **40 fictional entries** plus one real personal entry ("Barry"); predictions for the dummy contestants are simulated with varying skill.

## Deployment

Connect the repo to Netlify. Build settings are in [`netlify.toml`](./netlify.toml)
(`npm run build` → `dist`). Pushing to the default branch triggers a rebuild.
