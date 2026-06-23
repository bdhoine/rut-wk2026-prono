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
  from the `Meer` menu and a button on `deelnemer/[id]`.
- Provisional bonus status (used on `deelnemer/[id]` and the `/statistieken`
  "voorlopig op koers" board) comes from `bonusStandings()` in `data.ts`
  (`eliminatedTeamIds()` + `currentBonusLeaders()`); bonus outcomes only resolve
  at the final, so this is the meaningful mid-tournament view.
- A bottom **Mathematisch kan het nog** block on `deelnemer/[id]` (money/podium/
  win Ja/Nee) comes from `mathematicalOutlook()` in `data.ts`: a simple sound
  upper bound where the participant scores the max on everything left (9×mult per
  unfinished match + open bonus picks) and nobody else gains — gives `bestPos`.
  Build-time only (not recomputed live). The **Beste vorm** card on `/statistieken`
  (`bestForm()` + `BestFormCard.astro`) and the two **op-een-rij** streak tables
  (`longestOutcomeStreak()` / `longestExactStreak()`) live in the same file.
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
