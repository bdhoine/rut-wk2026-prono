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
- **[PostHog](https://posthog.com)** for client-side product analytics (loaded via [`src/components/posthog.astro`](./src/components/posthog.astro))
- Data is **static JSON** in the repo; the app computes all scores & rankings at build time

## Pages

| Route | Page |
|-------|------|
| `/` | Home (landing) — hero panel with current speeldag and next match(es), the "Nu live & recent gespeeld" strip (live matches + recently finished only — no scheduled fixtures), your favourites, the **top 10** of the ranking with a button to the full ranking, and two movement cards for the latest calendar day (today vs. yesterday): **Stijgers & dalers** (strongest risers/fallers) and **Top 5 — winnaars & verliezers** (who entered/left the prize spots, with the number of positions moved). Movement rows show each participant's eindwinnaar flag. The hero's next-match panel shows the first fixture that hasn't kicked off yet (a match in progress moves to the live strip and the hero advances), and shows both fixtures when two kick off at the same time |
| `/klassement` | Full ranking — favourites table on top (★, saved in `localStorage`), eindwinnaar flag per row, tap a participant for details, plus a client-side **search box** to filter by name. Live-only (shows in-progress matches if any) and recomputes a provisional ranking from live scores |
| `/deelnemer/[id]` | Participant detail: position, total, bonus picks, predictions per speeldag in collapsible sections (played/current open, future collapsed) + score breakdown. A **Live scores** toggle recomputes the header position/total and the easter-egg trigger from the live provisional standing. Easter eggs once the tournament is under way: an 8-bit money rain with the prize amount for top-5 spots, and an 8-bit dog popping up to laugh at the last-placed player |
| `/wedstrijd/[id]` | Match detail: per-match stats (avg points, exact, correct 1X2, wrong) + predictions grouped by predicted outcome (1/X/2). Each row shows the participant's klassement position and eindwinnaar flag and is fully clickable to the profile; finished matches sort each group by points scored, then by klassement position |
| `/programma` | Upcoming matches, grouped per calendar day |
| `/kalender` | Full fixtures grouped by speeldag (group stage) and knockout round, with sticky day subheadings and prono submission deadlines |
| `/poules` | Group standings (two-column grid on desktop) + best third-placed ranking; qualification highlight only once a group has results. With **live** on, both the group tables and the best-thirds are recomputed client-side including in-progress matches (LivePoules), each live team carrying a green/orange/red win/draw/loss badge |
| `/land/[id]` | Country detail: full schedule + group standings + a **Doelpuntenmakers** table (the team's goal scorers: flag, name, goals) + three "who picked this country" tables (eindwinnaar, meeste doelpunten, meeste tegendoelpunten), each ranked by klassement position and showing first 10 with a "Toon alle" expander |
| `/topschutter/[slug]` | Top-scorer profile (only generated for scorers picked by ≥1 participant): country flag, tournament goal total, and the participants who picked them (with eindwinnaar flag + position). Picks are matched to `scorers.json` best-effort on surname + first initial |
| `/statistieken` | Top scorers (names cleaned + merged, own goals excluded), most goals scored/conceded (unplayed teams hidden behind "Toon alle"), top-10 matches by points and by wrong predictions, **most correct 1X2 predictions per participant** (top 5 + "Toon alle"), popular scorelines, most-picked winner/top scorer (top 5 with a "Toon alle" expander; the top-scorer table shows the player's flag + WK goals). Picked top-scorer names link to their `/topschutter/[slug]` profile |
| `/reglement` | Competition rules, deadlines and prizes |
| `/changelog` | Per-update changelog (blocks newest-first), driven by `src/data/changelog.json` — see `CLAUDE.md` for the per-session upkeep rule |
| any other URL | Branded 404 page ("Buitenspel!") |

Navigation is `Home · Klassement · Wedstrijden ▾ · Statistieken · ⋮` on desktop —
the Wedstrijden dropdown groups Programma, Kalender and Poules, and the ⋮ "Meer"
dropdown holds Reglement and Changelog — and a hamburger drawer on mobile with
the same destinations as a flat list. Home (`/`) is the landing page; Klassement
(`/klassement`) is the full ranking. All game
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

Two integrations keep the app current during the tournament, both backed by
ESPN's public soccer API (FIFA World Cup, league slug `fifa.world`). **No API key
is required.** (The code degrades gracefully when it's temporarily unavailable.)

- **Final results (build-time data).** A GitHub Actions workflow
  ([`.github/workflows/update-results.yml`](./.github/workflows/update-results.yml))
  runs [`scripts/update-results.mjs`](./scripts/update-results.mjs) on a cron. It
  links each fixture to our match (by stored ESPN event id, resolved team pair,
  or — for unresolved knockouts — the bracket-label token, e.g. "2e Groep A" ↔
  "Group A 2nd Place"), writes finished-match scores, fills knockout teams as
  brackets resolve,
  aggregates `scorers.json`, and resolves the bonus `outcomes.json` once the
  final is played. It commits any changes, which triggers a Netlify rebuild. Run
  locally with `npm run results:update`.
- **On-demand result refresh.** The results workflow runs on a ~15-min cron, so
  the committed klassement/results can lag a few minutes behind a match. When a
  live match **ends** (it drops out of the live set the client polls), the client
  (in [`LiveScores.astro`](./src/components/LiveScores.astro)) fires a single
  call to [`netlify/functions/trigger-update.mjs`](./netlify/functions/trigger-update.mjs)
  (`/.netlify/functions/trigger-update`), which `workflow_dispatch`es the results
  workflow so it runs sooner. The function guards against pile-ups: it skips when
  a run is already queued/in_progress or when the last run is younger than 5 min,
  and self-debounces via a Netlify Blob (the workflow's `concurrency` group is a
  second safety net). It needs a GitHub token with `actions:write` on the repo in
  env **`GH_DISPATCH_TOKEN`**; without it the function is a harmless no-op.
- **Live scores (client-side).** A "Live scores" toggle on the home, Programma,
  Kalender and Poules pages fetches the in-progress scores and then auto-refreshes
  every minute while on. On the home page live matches show as cards above the
  recently-finished ones (max 4 total) and the **klassement recomputes
  provisional points live**; on Programma/Kalender the live score overlays the
  match card (badge above the score pill); on Poules the playing countries get a
  pulsing red dot with their live score. The client polls
  [`netlify/functions/live.mjs`](./netlify/functions/live.mjs) (at
  `/.netlify/functions/live`), which fetches ESPN's scoreboard directly (it
  responds in well under a second) and caches the result for ~60 s via a
  module-scope cache plus CDN cache-control headers, so ESPN is hit at most
  about once a minute regardless of traffic. The shared ESPN client/mapper lives
  in [`scripts/lib/espn.mjs`](./scripts/lib/espn.mjs) and is reused by the
  results updater.

> Knockout scores from this source are the score as reported (no separate
> after-120-min / penalty handling); double-check knockout results against
> `docs/rules.md` if needed.

## Development

```bash
npm install
cp .env.example .env   # then fill in the PostHog keys (analytics is a no-op if left blank)
npm run dev      # dev server at http://localhost:4321
npm run build    # production build to dist/
npm run preview  # preview the build
```

### Analytics

Client-side analytics run through **PostHog**, injected once in the shared layout via
[`src/components/posthog.astro`](./src/components/posthog.astro). It reads two
public env vars — `PUBLIC_POSTHOG_PROJECT_TOKEN` and `PUBLIC_POSTHOG_HOST`
(see [`.env.example`](./.env.example)); when unset, `init` is a harmless no-op.
Besides pageviews it captures a handful of business events (profile/match/
team/top-scorer views, favourites, name search, full-ranking click-through, statistics
visits). On Netlify, set the two vars in the site's environment.

Each pageview carries page-level metadata for dashboard breakdowns: a `page_name`
(the human page title, registered as a super property so every event on the page
inherits it), plus page-specific props — `username` on participant pages and
`duel` (`"Land - Land"`) on match pages. Pages feed these to PostHog via the
`analytics` prop on `Layout` (which forwards them to `posthog.astro`).

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

> The repo data uses the **real WK 2026 draw and fixture schedule** (groups, dates, venues, kickoff times). Kickoffs are stored with each venue's UTC offset and shown in Belgium time. The **79 real contestants** and their predictions (full group stage + tournament bonus picks) come from the official Café De Rut prono sheet. Real results are entered as matches are played; matchday 3 and the knockout bracket are still to come.

## Deployment

Connect the repo to Netlify. Build settings are in [`netlify.toml`](./netlify.toml)
(`npm run build` → `dist`). Pushing to the default branch triggers a rebuild.

Environment variables to set on the Netlify site:

- `PUBLIC_POSTHOG_PROJECT_TOKEN` / `PUBLIC_POSTHOG_HOST` — analytics (no-op when unset).
- `GH_DISPATCH_TOKEN` — GitHub token with `actions:write` on this repo, used by
  `trigger-update.mjs` to nudge the results workflow (set as a **secret**, scope
  *functions*). No-op when unset. A fine-grained PAT scoped to this repo with
  *Actions: Read and write* is enough.
