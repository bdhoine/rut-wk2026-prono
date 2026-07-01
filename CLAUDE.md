# Rut Prono WK 2026 — working notes for Claude

Dutch, mobile-first Astro site (static output + React islands, Tailwind v4, Netlify)
showing the ranking and predictions of the Café De Rut WK 2026 prediction game.
See `README.md` for the full architecture, pages, data model, and the live-scores /
results pipeline.

## Changelog — keep it current every session

The site has a public changelog at `/changelog`, driven by `src/data/changelog.json`
(an array of blocks, newest first):

```json
{ "date": "YYYY-MM-DD", "title": "Korte titel", "items": ["Wat er veranderd is, in het Nederlands."] }
```

At the **end of each working session that changes anything user-facing**, add the
session's changes as ONE new block at the top of `src/data/changelog.json`
(or extend the top block if it already has today's date and the same theme):

- Write **user-facing** summaries in Dutch — what changed for a visitor, not the
  technical diff. Group related tweaks into a single readable bullet.
- Skip purely internal changes (refactors, dependency bumps, data result updates)
  unless they change what people see or how they use the site.
- Newest block on top; use the real date (Europe/Brussels).

This is a hard step: treat updating the changelog like updating README.md/CLAUDE.md
before committing.

## Conventions

- Dutch UI copy throughout. Keep team `shortName`s for narrow viewports.
- All data lives in `src/data/*.json` and is the single source of truth; the
  scoring/ranking engine computes everything at build time.
- `/` is the landing page (hero, favourites, **top 10** + button, and the
  `MovementSection` stijgers/dalers block); `/klassement` is the full ranking
  with a client-side name search. Both reuse `RankingTable.tsx`
  (`limit`/`moreHref` for the top-10 preview, `searchable` for the full page).
- Stijgers & dalers is built at build time from `rankingTimeline()` /
  `dayMovements()` in `src/lib/data.ts` (one ranking snapshot per calendar day).
  `rankingTimeline()` also powers the per-participant **Klassementsverloop** chart
  (`RankChart.astro`) on `deelnemer/[id]` — capped at the last 10 days, with
  tappable dots (place per day) and dashed speeldag/round dividers (the page
  computes the boundary days from `matches` and passes them as `markers`).
  Prize money lives in `src/lib/prizes.ts` (`PRIZES` / `prizeFor`) — the single
  source of truth, imported by `/reglement`, the `RankingTable` prize coins, and
  the profile easter-egg. Don't re-type prize amounts anywhere.
- `/vergelijk` compares two participants client-side (two dropdowns + `?a=&b=`
  shareable params) from a compact dataset embedded at build time; it's linked
  from the `Meer` menu and a button on `deelnemer/[id]`. It also has
  `<LiveScores />`: while a match is live the "Nog te spelen" rows show the live
  score + both participants' provisional points (so `?ff-simulate-live=H-A`
  works here too).
- `/favorieten` ("Vergelijk favorieten") lists the upcoming matches (known
  teams, and only those where at least one favourite has a prediction — future
  rounds before their prono deadline are hidden) with each favourited
  participant's predicted score, client-rendered from an embedded dataset of
  everyone's upcoming predictions and filtered to the `rut-wk2026-favorieten`
  localStorage set. It's reached only via the
  `favCompareHref` CTA `RankingTable.tsx` renders under the Favorieten block —
  passed on the home page and `/klassement`, and shown only when there are
  favourites. A top **Klassementsverloop** section (above the match list, which
  gets its own "Volgende wedstrijden" heading) draws the favourites'
  position trend (last 10 game days) as a client-built SVG in the same style as
  the stats-page top-5 chart, from `positionTrendAll()` (`data.ts`, also the
  base of `top5PositionTrend()`) embedded in the same `fav-data` JSON — but with
  the Y-axis spanning the favourites' own position band (not from 1), max 8
  lines (best-placed first, "+N meer" note beyond that).
- Goal scorers live per match in `matches.json` (`goals`: player, minute,
  `og`/`pen` flags; `teamId` is the side the goal counts for — own goals carry
  the benefiting team, both in the scoreboard details and the summary
  commentary). `MatchScorers.astro` renders the muted scorer line (home right-
  aligned · ⚽ · away left-aligned; formatting helpers in `src/lib/scorers.ts`,
  shared with the LiveScores client bundle) on non-compact `MatchCard`s and — as
  the `hero` variant — under the score on `wedstrijd/[id]` (compact
  kalender/programma cards deliberately skip it). Live matches get the same line
  from the live function payload (`scorers` via `goalsFromEvent()` in
  `espn.mjs`); `?ff-simulate-live` fabricates "Testspeler" scorers so it stays
  testable.
- The **Momentum** section on `wedstrijd/[id]` (finished matches only) renders
  `match.momentum` — computed by the results updater from ESPN's summary
  play-by-play (goals/shots/corners weighted per 5-minute bucket, + = home; one
  summary fetch per match, skipped once `momentum` and the shootout kicks are
  stored) — via `MomentumChart.astro`: bars around a centre line, dashed
  half-time/ET dividers, ball markers per goal on the scoring side. It is
  build-time only (no live recompute).
- Provisional bonus status (used on `deelnemer/[id]` and the `/statistieken`
  "voorlopig op koers" board) comes from `bonusStandings()` in `data.ts`
  (`eliminatedTeamIds()` + `currentBonusLeaders()`); bonus outcomes only resolve
  at the final, so this is the meaningful mid-tournament view.
- A bottom **Mathematisch kan het nog** block on `deelnemer/[id]` (money/podium/
  win Ja/Nee) comes from `mathematicalOutlook()` in `data.ts`: a simple sound
  upper bound where the participant scores the max on everything left (9×mult per
  unfinished match + open bonus picks) and nobody else gains — gives `bestPos`.
  Build-time only (not recomputed live) and shown **from the quarter-finals
  onward** (gated on the round of 16 being complete; earlier the bound is too
  loose — everyone is trivially "Ja"). The **Beste vorm** card on `/statistieken`
  (`bestForm()` + `BestFormCard.astro`) and the two **op-een-rij** streak tables
  (`longestOutcomeStreak()` / `longestExactStreak()`) live in the same file. Each
  streak row carries an `ongoing` flag (the record run is still live — it reaches
  the latest finished match); the `/statistieken` tables render a `Flame.astro`
  icon (amber, hover tooltip) for those rows in the right-aligned **Aantal**
  column, with a legend under each table. Two more **op-een-rij-style** tables
  (no flame) come from `matchPositionExtremes()` in the same file — **Vaakst
  eerste** / **Vaakst laatste**: it walks one cumulative standing per finished
  match (kickoff order) and tallies everyone at position 1 and at the last
  position (ties count for all). The **Klassementsverloop top 5** chart
  (`top5PositionTrend()` + `PositionTrendChart.astro`) draws lines + dots only —
  no per-line end labels.
- UI vocabulary is fixed: **Groepen** (not poule/poulestand; route stays
  `/poules`) and **Klassement** (not "Stand"/"Top 10"). Qualifying standings rows
  carry a ✓ after the country name, and prize spots use a colour-graded **position
  badge** (with a prize-amount tooltip) — both non-colour cues, each with a legend.
- Client-side analytics use **PostHog**, loaded once in `Layout.astro` via
  `src/components/posthog.astro` (reads `PUBLIC_POSTHOG_PROJECT_TOKEN` /
  `PUBLIC_POSTHOG_HOST`; a no-op when unset). Analytics load on the **production**
  deploy only: `posthog.astro` gates on Netlify's `process.env.CONTEXT ===
  'production'` (preview/branch deploys + local dev get no events); set
  `PUBLIC_POSTHOG_FORCE=true` to force-enable locally. A few pages and `RankingTable.tsx`
  fire named `posthog.capture(...)` events — keep those calls null-safe (`?.`).
  `posthog.astro` disables the auto pageview, registers `page_name` (the title)
  as a super property, and fires `$pageview` with per-page props. Pages pass
  those props via `Layout`'s `analytics` prop (e.g. `{ username }` on
  `deelnemer/[id]`, `{ duel }` on `wedstrijd/[id]`) — never register page-specific
  values as super properties or they leak onto later pages.
- On-demand result refresh: `netlify/functions/trigger-update.mjs` can
  `workflow_dispatch` the results workflow so the committed klassement/results
  refresh sooner than the ~15-min cron. `LiveScores.astro` calls it once only
  when a live match just **ended** (dropped from the polled live set) — not
  continuously during the match window; the function self-guards (skips if a run
  is active or <5 min old, plus a Netlify Blob debounce). Needs
  env `GH_DISPATCH_TOKEN` (`actions:write`); no-op without it. See `README.md`.
- Simulating live for QA: append `?ff-simulate-live=H-A` (e.g. `=2-1`) to any page
  with `<LiveScores />`. It fakes a live score on the **next planned match**,
  auto-enables live, skips the API fetch and any results-refresh nudge, and tags
  the badge with "sim" — the easiest way to test the live overlay off-tournament.
- `astro.config.mjs` forces `react`, `react-dom` and `scheduler` into one
  `react-vendor` Vite chunk (`build.rollupOptions.output.manualChunks`). Don't
  remove this: otherwise react-dom (which **sets** React's hooks dispatcher
  `ReactSharedInternals.H`) and React core (which **reads** it on every hook)
  split into separate chunks, and a deploy/cache skew that mixes chunk instances
  makes an island's first `useState` read a null dispatcher
  (`null is not an object (evaluating 'f.H.useState')`).
- Run `npm run check` before committing; keep `README.md` and this file current.
- Commit and push directly to `master` — no feature branch / PR for this repo
  (the results bot and the owner both commit straight to `master`).

## Testing before committing

Always validate user-facing changes hands-on before committing — a green
`npm run check` is not enough:

1. **Start from fresh, production-like data.** Sync the live result data so you
   test what users actually see: `git fetch && git merge --ff-only origin/master`
   (the results bot commits `src/data/*.json` continuously; a stale local
   checkout shows wrong/empty states — e.g. already-played matches still
   `scheduled`, or an empty "next match" hero).
2. **Test the changed feature functionally and visually**, in a real browser
   (use the agent-browser skill), on **both mobile and desktop** widths — the UI
   is mobile-first with `sm:`/`md:` breakpoints, so check both. Confirm it does
   what it should and looks right.
3. **Check the console** — no errors on the pages you touched.
4. **Check for visual issues** — layout, overflow/scroll, truncation, dark mode.
5. **Test live states with the simulate flag.** Most of the year there is no
   real live match, so the live overlay / recompute can't be exercised against
   real data. Whenever your change touches anything live-related — the live
   toggle, the overlay on match cards, the home "Nu live" strip, the provisional
   klassement/poules/land recompute, the easter-egg trigger — **append
   `?ff-simulate-live=H-A`** (e.g. `?ff-simulate-live=2-1`) to the page in the
   browser. It fakes a live score on the next planned match, auto-enables live,
   and bypasses the API (see the convention bullet above and `README.md`).
   - Confirm: live badge/score appears (tagged "sim"), the recompute reacts
     (klassement order, poules/land standings, provisional bonus), the console
     is clean, and removing the param reverts cleanly.
   - Vary the score (a win, a draw `1-1`, a loss for the favourite) so you cover
     points/position changes, not just one outcome.
6. **Smoke-test the core features** afterwards: `/` (home), `/klassement` (+name
   search), `/kalender`, `/poules`, a `/deelnemer/[id]`, a `/wedstrijd/[id]` and
   a `/land/[id]` page — a quick visual + console check on each.

Only once all of the above is clean: run `npm run check`, update the changelog
and docs, and commit.
