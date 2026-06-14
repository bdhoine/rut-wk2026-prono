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
- Run `npm run check` before committing; keep `README.md` and this file current.
