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
| `/klassement` | Full ranking — favourites table on top (★, saved in `localStorage`), eindwinnaar flag per row, the participant name is a real link (keyboard/screen-reader navigable) and the whole row is clickable, plus a client-side **search box** to filter by name. The **position badge** of prize spots (top 5) is medal-graded (gold/silver/bronze for 1-3, green for 4-5) and reveals the exact prize on hover/tap (tie-aware via `prizeFor`), with a legend below the table. Live-only (shows in-progress matches if any) and recomputes a provisional ranking from live scores |
| `/deelnemer/[id]` | Participant detail: position, total, bonus picks, a **Klassementsverloop** line chart of their position per calendar day (build-time SVG via `RankChart.astro`, shown once ≥2 days of results; capped at the last 10 days, with **tappable dots** that reveal the place on that day and **dashed dividers** marking where a speeldag/round ended), a bottom **Mathematisch kan het nog** block (three Ja/Nee cards — money/podium/win — from `mathematicalOutlook()`: an optimistic upper bound where this participant scores the max on everything left — counting only bonus picks that can mathematically still come true (`bonusPickAlive()`) — and nobody else gains, shown **from the quarter-finals onward**, i.e. once the round of 16 is complete — earlier the bound is too loose to be meaningful), a **Vergelijk** button (deep-links `/vergelijk?a={id}`), predictions per speeldag in collapsible sections (only the section in progress is open — the first not fully played; played and future sections are collapsed, with the last section open once everything is finished so one is always expanded) + score breakdown. A **Live scores** toggle recomputes the header position/total and the easter-egg trigger from the live provisional standing, shows each in-progress match's **provisional points** in its prediction row, and marks everything as live with red cues (red ring on the position badge, red dot before the total, a note under the toggle, a red-boxed points badge per live row, and a red live dot + trend segment on the Klassementsverloop chart). Easter eggs once the tournament is under way: an 8-bit money rain with the prize amount for top-5 spots, and an 8-bit dog popping up to laugh at the last-placed player |
| `/wedstrijd/[id]` | Match detail: hero with the score, the **goal scorers** under it (from `match.goals` via `MatchScorers.astro`, above the penalty-kick rows), per-match stats (avg points, exact, correct 1X2, wrong), a **Momentum** section for finished matches (build-time SVG via `MomentumChart.astro`: one bar per 5 minutes toward home/away from `match.momentum`, dashed half-time/ET dividers, ball markers at each goal on the scoring side) + predictions grouped by predicted outcome (1/X/2). Each row shows the participant's klassement position and eindwinnaar flag and is fully clickable to the profile; finished matches sort each group by points scored, then by klassement position. A prev/next pager (in kickoff order) sits under the hero |
| `/programma` | Upcoming matches, grouped per calendar day |
| `/kalender` | A **knockout bracket** up top (`KnockoutBracket.astro`: build-time two-sided tree — 1/16de finales on the outer edges converging to the Finale + Troostfinale in the centre; flags only (no scores), winner tinted gold, loser dimmed, every box links to its match page; there is no centre column — the Finale (trophy + "Finale" label) and the labelled Troostfinale float over the empty middle, vertically aligned with the top/bottom quarter-final rows (box centres at 25%/75%); the two semi-final stubs meet in the central gap and a gold stem rises to the finale box; connector lines are gold-tinted, 2px, with stubs on every box (no overflow:hidden on the boxes — it would clip them); the tree is derived from the `homePlaceholder`/`awayPlaceholder` wiring and the component renders nothing if that can't be resolved; horizontally scrollable on narrow screens, starting centred on the final; **fully played rounds are hidden by default** (a leading prefix per half, capped so the semi-final column always stays) with a toggle switch centred below the bracket (fixed label “Toon gespeelde rondes”, the switch state = visibility) to reveal the full tree), then every stage (Groepsfase + each knockout round) as a **collapsible `<details>` card** — summary shows the stage name, played count and deadline badge; only the stage in progress (first not fully played) is open, finished and future stages start collapsed (same pattern as the deelnemer speeldag sections) — with day subheadings and matches inside |
| `/poules` | Group standings (two-column grid on desktop, "Groepen") + best third-placed ranking; qualifying rows carry a **✓ next to the rank** (plus the green tint) with a legend, shown only once a group has results. With **live** on, both the group tables and the best-thirds are recomputed client-side including in-progress matches (LivePoules), each live team carrying a green/orange/red win/draw/loss badge (the ✓ updates live too) |
| `/land/[id]` | Country detail: full schedule + group standings (with the qualification ✓ + legend) + a **Doelpuntenmakers** table (the team's goal scorers: tie-aware position number, flag, name, goals) + three "who picked this country" sections (eindwinnaar, meeste doelpunten, meeste tegendoelpunten), each ranked by klassement position with a "Toon alle" expander; **empty sections collapse** to a compact `<details>` row. With **live** on, the Programma cards update in place (the group Stand rows only while the group stage is still being played — once it's complete the standings are final and a live knockout score never decorates them) |
| `/topschutter/[slug]` | Top-scorer profile (only generated for scorers picked by ≥1 participant): country flag (links to `/land/[id]`), a stat strip (goals, **rank among all WK scorers** tie-aware, times picked), the participants who picked them (with eindwinnaar flag + position), and a "← Statistieken" backlink. Picks are matched to `scorers.json` best-effort on surname + first initial |
| `/statistieken` | Top scorers (names cleaned + merged, own goals excluded), most goals scored/conceded (unplayed teams hidden behind "Toon alle"), top-10 matches by points and by wrong predictions, a **Beste vorm** card under the "meeste foute prono's" list (the participant[s] with the highest points total over any 5 consecutive played matches — a carousel when several tie, via `bestForm()` + `BestFormCard.astro`), **most correct 1X2 predictions per participant** (top 5 + "Toon alle"), the **longest run of consecutive correct 1X2 and consecutive exact predictions** (top 10 + "Toon alle", via `longestOutcomeStreak()` / `longestExactStreak()`), popular scorelines, most-picked winner/top scorer, and a **provisional bonus leaderboard** ("voorlopig op koers": per participant a ✓/–/✗ status per bonus pick + provisional bonus points, from `bonusStandings()`; picks that can mathematically no longer win — `bonusPickAlive()` — are marked ✗). Picked top-scorer names link to their `/topschutter/[slug]` profile |
| `/vergelijk` | Compare two participants side by side (selected via two dropdowns or `?a=&b=` for a shareable link): totals, match/bonus split, position, form, exact% / correct-1X2%, the four bonus picks, and a head-to-head over commonly-played matches (who scored more, agreement count) + a per-match prediction diff. Client-rendered from a compact embedded dataset. Has `<LiveScores />`: while a match is live, the "Nog te spelen" rows show the live score and both participants' provisional points |
| `/favorieten` | "Vergelijk favorieten": a top **Klassementsverloop** chart of the favourites' positions over the last 10 game days (client-built SVG in the same style as the stats-page top-5 chart, from `positionTrendAll()` embedded at build time; Y-axis spans the favourites' own position band, max 8 lines — best-placed first — with a "+N meer" note), then the upcoming matches (with known teams, and only those where at least one favourite has a prediction) and, per match, each favourited participant's predicted score. Favourites live in `localStorage`; client-rendered from an embedded dataset of every participant's upcoming predictions. Reached via the CTA shown under the Favorieten block on the home page and `/klassement` (only when favourites exist) |
| `/reglement` | Competition rules, deadlines and prizes (the prize table is rendered from `PRIZES` in `src/lib/prizes.ts` — single source of truth) |
| `/changelog` | Per-update changelog (blocks newest-first), driven by `src/data/changelog.json` — see `CLAUDE.md` for the per-session upkeep rule |
| `/steun` | "Trakteer op een pint" — a client-side **EPC SEPA payment QR** (pick an amount → QR encodes IBAN + amount + mededeling, scannable by Belgian banking apps) + a copyable IBAN, and a tappable **"Trakteer via Bancontact"** button (a Bancontact groepspot link). All details live in `SUPPORT` in `src/lib/links.ts` |
| any other URL | Branded 404 page ("Buitenspel!") |

### WK Recap

An Instagram-story-style overlay (`src/components/Recap.tsx`, mounted globally
via `RecapOverlay.astro` in `Layout.astro`, so it works on **any** page) that
walks through tournament stats (matches played, goals), the topschutter, the
champion (once the final is played), the longest/most 1X2 and exact-score
streaks (reusing the same `src/lib/data.ts` helpers as `/statistieken`), and a
climb through the klassement top 5 ending on a confetti/fireworks finale for
whoever is #1 (tie-aware throughout — shared positions show every name). Each
slide has a tappable progress bar (left third = previous, right two-thirds =
next), auto-advances, and can be held to pause. Opens via the `?ff-recap=1`
query flag (mirrors `?ff-simulate-live`) or a "Bekijk je WK Recap opnieuw"
button that appears under the home hero once `localStorage`
(`rut-wk2026-recap-seen`) shows it's been seen.

Navigation is `Home · Klassement · Wedstrijden ▾ · Statistieken · ⋮` on desktop —
the Wedstrijden dropdown groups Programma, Kalender and Poules, and the ⋮ "Meer"
dropdown holds Reglement, Changelog and a "Trakteer op een pint" link — and a
hamburger drawer on mobile with the same destinations as a flat list (the pint link
included). The pint link also sits in the footer; all point to `/steun`. Home (`/`) is the landing page; Klassement
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

**Motion layer** (`global.css` + a small IntersectionObserver script in
`Layout.astro`): below-the-fold blocks fade/slide in on scroll (`.reveal`), and
the build-time SVG charts animate on first sight — chart wrappers carry
`data-animate`; lines marked `.chart-line` (real length via `--len`) draw in,
`.chart-dot` elements pop in staggered, and MomentumChart bars (`.bar-h`/`.bar-a`)
grow from the centre line. All motion classes are **added by JS only** (nothing
is hidden without JS) and everything is disabled under `prefers-reduced-motion`.
Extras: klassement rows enter staggered (`.row-rise`), the hero panel gets a
one-time light sweep, and the participant-page points total counts up on load.

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
  brackets resolve, syncs each match's `kickoff` to ESPN's confirmed time (the
  seed's knockout kickoffs were preliminary placeholders),
  stores each finished match's **per-goal scorers** (`goals`: player, minute,
  own-goal/penalty flags, from the scoreboard's details) and — via one summary
  fetch per match, skipped once stored — its **momentum curve** (`momentum`:
  a signed value per 5 minutes derived from the play-by-play commentary: goals,
  shots and corners weighted toward the acting side) plus the penalty-shootout
  kick sequences, aggregates `scorers.json`, and resolves the bonus
  `outcomes.json` once the final is played. It commits any changes, which
  triggers a Netlify rebuild. Run locally with `npm run results:update`.
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
  Kalender, Poules and country (Land) pages fetches the in-progress scores and then
  auto-refreshes every minute while on. On the home page live matches show as cards
  above the recently-finished ones (max 4 total) and the **klassement recomputes
  provisional points live**; on Programma/Kalender the live score overlays the
  match card (badge above the score pill); on Poules the playing countries get a
  pulsing red dot with their live score. On a `/land/[id]` page the same overlay
  patches the Programma match cards and the group Stand rows in place (no extra
  card on top); the Stand-row decoration stops for good once every group match
  is played (`data-group-done`, build-time) — group standings are final then and
  a live knockout score doesn't belong on them. The live payload also carries the match's **goal scorers**
  (`scorers`, from the scoreboard's per-goal details), which the client renders
  as a muted scorer line at the foot of live cards, non-compact overlay cards and
  the match-detail hero (class `.live-scorers`, cleaned up when live turns off;
  compact kalender/programma cards skip it). The client polls
  [`netlify/functions/live.mjs`](./netlify/functions/live.mjs) (at
  `/.netlify/functions/live`), which fetches ESPN's scoreboard directly (it
  responds in well under a second) and caches the result for ~60 s via a
  module-scope cache plus CDN cache-control headers, so ESPN is hit at most
  about once a minute regardless of traffic. The shared ESPN client/mapper lives
  in [`scripts/lib/espn.mjs`](./scripts/lib/espn.mjs) and is reused by the
  results updater.
  - **Dev/QA flag `?ff-simulate-live=H-A`.** Append e.g. `?ff-simulate-live=2-1`
    to any page that renders `<LiveScores />` to fake a live score for the **next
    planned match** (the earliest not-yet-finished fixture). It auto-enables live,
    bypasses the `/.netlify/functions/live` fetch entirely, never nudges a results
    refresh, and tags the badge/status with "sim" — so the overlay (and the
    home-page provisional klassement recompute) can be tested without a real live
    match. It fabricates one "Testspeler" scorer per simulated goal so the live
    scorer line can be exercised too. Accepts `H-A`, `H–A` or `H:A`.

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
Analytics only load on the **production deploy**: `posthog.astro` checks Netlify's
`CONTEXT` build var and enables PostHog only when `CONTEXT === 'production'`, so
local dev, deploy-previews and branch-deploys never send events. Set
`PUBLIC_POSTHOG_FORCE=true` to force-enable it locally while testing.
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
| `matches.json` | Matches: round, kickoff, venue, teams (or placeholders), `status`, `result`, plus `apiId` / `winnerTeamId` / `penalties` (shootout score, home/away) / `goals` (per-goal scorers: `player`, `teamId` — the side the goal counts for, so own goals carry the benefiting team — `minute`, optional `og`/`pen`) / `momentum` (`{ bucketMin, values }`: signed pressure per 5 minutes, + = home; 18 buckets, 24 with extra time) filled by the results updater. Penalty-decided knockouts keep the 120-min `result` for scoring but set `penalties` + `winnerTeamId`, shown as "Na strafschoppen 3–4 · X gaat door" / "n.s. 3–4" |
| `participants.json` | Participants: `id`, `name`, `bonus` picks. **No phone numbers** (kept off the repo by design) |
| `predictions.json` | Per-participant, per-match predicted scores (`late: true` ⇒ 0 points) |
| `outcomes.json` | Actual tournament bonus outcomes (top scorer, winner, most scored/conceded) |
| `scorers.json` | Player goal tallies for the stats page |
| `settings.json` | Round multipliers and bonus points |

### Updating during the tournament

Normally the **GitHub Actions results workflow** (see *Live scores & automatic
results* above) does this automatically. To update by hand instead:

1. Enter final scores on the relevant match in `matches.json` (set `status: "finished"` and `result`). For knockouts, use the **score after 120 min** (penalties don't count for scoring — see `docs/rules.md`); when decided on penalties, also set `winnerTeamId` and `penalties` ({home, away} shootout goals) so the UI shows who advanced. The results updater fills these from ESPN automatically.
2. Fill in `homeTeamId` / `awayTeamId` on knockout matches as brackets resolve.
3. Update `scorers.json` and `outcomes.json` as the tournament progresses.
4. Commit & push — Netlify rebuilds and the ranking updates automatically.

> The repo data uses the **real WK 2026 draw and fixture schedule** (groups, dates, venues, kickoff times). Kickoffs are stored as ISO instants (group matches with each venue's UTC offset, knockout matches in UTC as synced from ESPN) and always shown in Belgium time. The **79 real contestants** and their predictions (full group stage + tournament bonus picks) come from the official Café De Rut prono sheet. Real results are entered as matches are played; matchday 3 and the knockout bracket are still to come.

## Deployment

Connect the repo to Netlify. Build settings are in [`netlify.toml`](./netlify.toml)
(`npm run build` → `dist`). Pushing to the default branch triggers a rebuild.

Environment variables to set on the Netlify site:

- `PUBLIC_POSTHOG_PROJECT_TOKEN` / `PUBLIC_POSTHOG_HOST` — analytics (no-op when unset).
- `GH_DISPATCH_TOKEN` — GitHub token with `actions:write` on this repo, used by
  `trigger-update.mjs` to nudge the results workflow (set as a **secret**, scope
  *functions*). No-op when unset. A fine-grained PAT scoped to this repo with
  *Actions: Read and write* is enough.
