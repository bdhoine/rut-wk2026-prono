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
  Prize money lives in `src/lib/prizes.ts` (`PRIZES` / `prizeFor`).
- Client-side analytics use **PostHog**, loaded once in `Layout.astro` via
  `src/components/posthog.astro` (reads `PUBLIC_POSTHOG_PROJECT_TOKEN` /
  `PUBLIC_POSTHOG_HOST`; a no-op when unset). A few pages and `RankingTable.tsx`
  fire named `posthog.capture(...)` events — keep those calls null-safe (`?.`).
  `posthog.astro` disables the auto pageview, registers `page_name` (the title)
  as a super property, and fires `$pageview` with per-page props. Pages pass
  those props via `Layout`'s `analytics` prop (e.g. `{ username }` on
  `deelnemer/[id]`, `{ duel }` on `wedstrijd/[id]`) — never register page-specific
  values as super properties or they leak onto later pages.
- On-demand result refresh: `netlify/functions/trigger-update.mjs` can
  `workflow_dispatch` the results workflow so the committed klassement/results
  refresh sooner than the ~15-min cron. `LiveScores.astro` calls it (debounced
  per tab) only while a match is in its window; the function self-guards
  (skips if a run is active or <5 min old, plus a Netlify Blob debounce). Needs
  env `GH_DISPATCH_TOKEN` (`actions:write`); no-op without it. See `README.md`.
- Run `npm run check` before committing; keep `README.md` and this file current.

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
5. **Smoke-test the core features** afterwards: `/` (home), `/klassement` (+name
   search), `/kalender`, `/poules`, a `/deelnemer/[id]`, a `/wedstrijd/[id]` and
   a `/land/[id]` page — a quick visual + console check on each.

Only once all of the above is clean: run `npm run check`, update the changelog
and docs, and commit.
