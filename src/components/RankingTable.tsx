import * as React from "react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { PRIZES, prizeFor } from "@/lib/prizes";

export interface RankingTableRow {
  position: number;
  participantId: string;
  name: string;
  total: number;
  matchPoints: number;
  bonusPoints: number;
  winnerIso: string | null;
  winnerName: string | null;
  form: string[];
}

const FAV_KEY = "rut-wk2026-favorieten";
const TUT_KEY = "rut-wk2026-fav-tutorial"; // "1" once the favourites tutorial is seen/skipped

const capture = (event: string, props?: Record<string, unknown>) =>
  (window as unknown as { posthog?: { capture: (e: string, p?: Record<string, unknown>) => void } }).posthog?.capture(event, props);

const normalize = (s: string) => s.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();

const FORM_COLOR: Record<string, string> = {
  exact: "bg-emerald-500",
  partial: "bg-amber-400",
  wrong: "bg-red-500",
};
const FORM_TITLE: Record<string, string> = {
  exact: "Exacte uitslag",
  partial: "Juiste 1X2",
  wrong: "Fout",
};

function FormDots({ form }: { form: string[] }) {
  if (!form?.length) return <span className="text-muted-foreground">–</span>;
  return (
    <span className="inline-flex items-center gap-0.5">
      {form.map((r, i) => (
        <span key={i} title={FORM_TITLE[r]} className={`size-2 rounded-full ${FORM_COLOR[r] ?? "bg-muted"}`} />
      ))}
    </span>
  );
}

function Star({ filled, className = "size-5" }: { filled: boolean; className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      strokeWidth={1.8}
      strokeLinejoin="round"
      className={`${className} ${filled ? "fill-amber-400 stroke-amber-500" : "fill-transparent stroke-zinc-400"}`}
      aria-hidden="true"
    >
      <path d="M11.48 3.5a.6.6 0 0 1 1.04 0l2.34 4.74 5.23.76a.6.6 0 0 1 .33 1.02l-3.78 3.69.89 5.21a.6.6 0 0 1-.87.63L12 17.9l-4.68 2.46a.6.6 0 0 1-.87-.63l.9-5.21-3.79-3.69a.6.6 0 0 1 .33-1.02l5.23-.76L11.48 3.5z" />
    </svg>
  );
}

const fmtEuro = (n: number) => (Number.isInteger(n) ? `€${n}` : `€${n.toFixed(2).replace(".", ",")}`);

// Position badge tones. 1/2/3 are the medals; prize spots 4–5 get a money-green
// badge. The prize spots reuse this same "stand" badge (no separate marker) and
// carry the prize-amount tooltip.
const BADGE_BASE = "inline-flex h-7 w-7 items-center justify-center rounded-md text-sm font-bold tabular-nums font-display";
const BADGE_TONE: Record<number, string> = {
  1: "bg-gradient-to-b from-[#f6d873] to-[#dca21f] text-[#5a3d08] ring-1 ring-[#caa12e]/60 shadow-sm",
  2: "bg-gradient-to-b from-zinc-100 to-zinc-300 text-zinc-700 ring-1 ring-zinc-400/50 shadow-sm",
  3: "bg-gradient-to-b from-[#e3b27e] to-[#a96a32] text-white ring-1 ring-[#8a531f]/50 shadow-sm",
};
// 4th/5th are prize spots too but with different (lower) amounts — a neutral
// badge, not a colour that implies a tier of its own. The exact amount is in the tooltip.
const BADGE_TONE_LOW = "bg-muted text-foreground ring-1 ring-border shadow-sm";

function positionBadge(position: number) {
  return <span className={`${BADGE_BASE} ${BADGE_TONE[position] ?? "font-semibold text-muted-foreground"}`}>{position}</span>;
}

// Prize spot: the standings badge itself, as a button with a hover/tap tooltip
// showing the (tie-aware) prize money.
function PrizeBadge({ position, amount, open, onToggle }: { position: number; amount: string; open: boolean; onToggle: () => void }) {
  const tone = BADGE_TONE[position] ?? BADGE_TONE_LOW;
  return (
    <span className="group/coin relative inline-flex">
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); onToggle(); }}
        aria-label={`${position}e plaats — prijzengeld ${amount}`}
        className={`${BADGE_BASE} ${tone} focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold/70`}
      >{position}</button>
      <span
        role="tooltip"
        className={`pointer-events-none absolute bottom-full left-1/2 z-30 mb-1.5 -translate-x-1/2 whitespace-nowrap rounded-md bg-popover px-2 py-1 text-xs font-semibold text-popover-foreground shadow-md ring-1 ring-border group-hover/coin:block ${open ? "block" : "hidden"}`}
      >{amount}</span>
    </span>
  );
}

type DisplayRow = RankingTableRow & { delta: number };

export default function RankingTable({
  rows,
  limit,
  moreHref,
  searchable = false,
}: {
  rows: RankingTableRow[];
  limit?: number;
  moreHref?: string;
  searchable?: boolean;
}) {
  const [favs, setFavs] = React.useState<string[]>([]);
  const [deltas, setDeltas] = React.useState<Record<string, number>>({});
  const [query, setQuery] = React.useState("");
  const [openCoin, setOpenCoin] = React.useState<string | null>(null);
  const searchTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  // Favourites onboarding tutorial.
  const [tut, setTut] = React.useState<null | "intro" | "spotlight">(null);
  const [bubble, setBubble] = React.useState<{ top: number; left: number } | null>(null);
  const firstStarRef = React.useRef<HTMLButtonElement | null>(null);
  const introRef = React.useRef<HTMLDivElement | null>(null);

  React.useEffect(() => {
    try {
      const stored = localStorage.getItem(FAV_KEY);
      if (stored) setFavs(JSON.parse(stored));
    } catch { /* ignore */ }
  }, []);

  const dismissTutorial = React.useCallback((reason: string) => {
    try { localStorage.setItem(TUT_KEY, "1"); } catch { /* ignore */ }
    setTut(null);
    capture("favorite_tutorial_dismissed", { reason });
  }, []);

  // First-run tutorial: show only for visitors with no favourites who haven't
  // seen/skipped it yet (same flag across home + klassement).
  React.useEffect(() => {
    try {
      const hasFav = JSON.parse(localStorage.getItem(FAV_KEY) || "[]").length > 0;
      if (hasFav || localStorage.getItem(TUT_KEY)) return;
    } catch { return; }
    const t = setTimeout(() => { setTut("intro"); capture("favorite_tutorial_shown"); }, 700);
    return () => clearTimeout(t);
  }, []);

  // Completed the moment they add their first favourite.
  React.useEffect(() => {
    if (tut && favs.length > 0) dismissTutorial("added");
  }, [favs, tut, dismissTutorial]);

  // Escape closes the intro.
  React.useEffect(() => {
    if (tut !== "intro") return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") dismissTutorial("escape"); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [tut, dismissTutorial]);

  // Trap focus inside the intro dialog and move focus into it on open.
  React.useEffect(() => {
    if (tut !== "intro") return;
    const root = introRef.current;
    if (!root) return;
    const focusables = () =>
      Array.from(root.querySelectorAll<HTMLElement>('button, [href], input, [tabindex]:not([tabindex="-1"])'))
        .filter((el) => !el.hasAttribute("disabled"));
    focusables()[0]?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Tab") return;
      const f = focusables();
      if (!f.length) return;
      const first = f[0];
      const last = f[f.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    };
    root.addEventListener("keydown", onKey);
    return () => root.removeEventListener("keydown", onKey);
  }, [tut]);

  // Position the spotlight bubble next to the first star (keep it in sync on
  // scroll/resize while the spotlight is active).
  React.useEffect(() => {
    if (tut !== "spotlight") { setBubble(null); return; }
    const place = () => {
      const el = firstStarRef.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      const left = Math.min(Math.max(12, r.left - 8), window.innerWidth - 252);
      setBubble({ top: r.bottom + 10, left });
    };
    firstStarRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
    const t = setTimeout(place, 350);
    window.addEventListener("scroll", place, { passive: true });
    window.addEventListener("resize", place);
    return () => { clearTimeout(t); window.removeEventListener("scroll", place); window.removeEventListener("resize", place); };
  }, [tut]);

  // Live provisional points from in-progress matches (dispatched by LiveScores).
  React.useEffect(() => {
    const apply = (d: Record<string, number> | undefined) => setDeltas(d && Object.keys(d).length ? d : {});
    apply((window as unknown as { __rutLiveDeltas?: Record<string, number> }).__rutLiveDeltas);
    const onLive = (e: Event) => apply((e as CustomEvent).detail?.deltas);
    window.addEventListener("rut:live-ranking", onLive);
    return () => window.removeEventListener("rut:live-ranking", onLive);
  }, []);

  const hasLive = Object.keys(deltas).length > 0;

  // Recompute totals + standard-competition positions when live deltas are active.
  const displayRows = React.useMemo<DisplayRow[]>(() => {
    if (!hasLive) return rows.map((r) => ({ ...r, delta: 0 }));
    const adjusted = rows
      .map((r) => ({ ...r, delta: deltas[r.participantId] || 0, total: r.total + (deltas[r.participantId] || 0) }))
      .sort((a, b) => b.total - a.total || a.name.localeCompare(b.name, "nl"));
    let position = 0;
    let lastTotal: number | null = null;
    return adjusted.map((row, i) => {
      if (lastTotal === null || row.total !== lastTotal) { position = i + 1; lastTotal = row.total; }
      return { ...row, position };
    });
  }, [rows, deltas, hasLive]);

  const favSet = React.useMemo(() => new Set(favs), [favs]);

  // How many participants share each position (standard-competition ties), so a
  // shared prize spot shows the pooled-and-split amount via prizeFor().
  const tiedAt = React.useMemo(() => {
    const m: Record<number, number> = {};
    for (const r of displayRows) m[r.position] = (m[r.position] ?? 0) + 1;
    return m;
  }, [displayRows]);

  // A tap-opened coin tooltip closes on the next outside click.
  React.useEffect(() => {
    if (!openCoin) return;
    const close = () => setOpenCoin(null);
    window.addEventListener("click", close);
    return () => window.removeEventListener("click", close);
  }, [openCoin]);

  const toggle = (id: string) =>
    setFavs((prev) => {
      const adding = !prev.includes(id);
      const next = adding ? [...prev, id] : prev.filter((x) => x !== id);
      try { localStorage.setItem(FAV_KEY, JSON.stringify(next)); } catch { /* ignore */ }
      const row = rows.find((r) => r.participantId === id);
      const ph = (window as unknown as { posthog?: { capture: (e: string, p?: Record<string, unknown>) => void } }).posthog;
      ph?.capture(adding ? "favorite_added" : "favorite_removed", {
        participant_id: id,
        participant_name: row?.name,
        participant_position: row?.position,
      });
      return next;
    });

  const go = (id: string) => { window.location.href = `/deelnemer/${id}`; };

  const favRows = displayRows.filter((r) => favSet.has(r.participantId));

  const q = normalize(query.trim());
  const searching = searchable && q.length > 0;
  const mainRows = searching
    ? displayRows.filter((r) => normalize(r.name).includes(q))
    : limit != null
      ? displayRows.slice(0, limit)
      : displayRows;
  // No "Top 10"/"Stand" heading here — the page's own SectionHeading names the
  // ranking ("Klassement"). Only label the full list when favourites split it off.
  const mainHeading = limit == null && favRows.length > 0 ? "Volledig klassement" : null;
  const showPrizeLegend = mainRows.some((r) => PRIZES[r.position] != null);

  const renderTable = (data: DisplayRow[], showPrizeCut = false, spotlight = false) => (
    <Table className="table-fixed">
      <TableHeader>
        <TableRow>
          {/* Star col: size-7 button + padding must fit the declared width,
              or table-fixed overflows and shows a scrollbar strip on mobile. */}
          <TableHead className="w-8 px-0.5" />
          <TableHead className="w-8 px-0.5 text-center">#</TableHead>
          <TableHead className="px-1.5">Naam</TableHead>
          <TableHead className="w-14 px-1 text-right">Vorm</TableHead>
          {hasLive && <TableHead className="w-10 px-0.5 text-right" aria-label="Live punten" />}
          <TableHead className="w-12 px-1.5 text-center" title="Punten">Ptn</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {data.map((row, i) => {
          const fav = favSet.has(row.participantId);
          const inMoney = showPrizeCut && PRIZES[row.position] != null;
          const spot = spotlight && i === 0;
          return (
            <TableRow key={row.participantId} data-clickable="true" onClick={() => go(row.participantId)} className={inMoney ? "bg-emerald-500/10 hover:bg-emerald-500/15" : undefined}>
              <TableCell className="px-0.5">
                <button
                  type="button"
                  ref={spot ? firstStarRef : undefined}
                  aria-label={fav ? `${row.name} uit favorieten` : `${row.name} als favoriet`}
                  aria-pressed={fav}
                  onClick={(e) => { e.stopPropagation(); toggle(row.participantId); }}
                  className={`mx-auto grid size-7 place-items-center rounded-md hover:bg-muted${spot && tut === "spotlight" ? " animate-pulse ring-2 ring-amber-400 ring-offset-1" : ""}`}
                >
                  <Star filled={fav} className="size-[18px]" />
                </button>
              </TableCell>
              <TableCell className="px-0.5 text-center">
                {inMoney ? (
                  <PrizeBadge
                    position={row.position}
                    amount={fmtEuro(prizeFor(row.position, tiedAt[row.position] ?? 1))}
                    open={openCoin === row.participantId}
                    onToggle={() => setOpenCoin((cur) => (cur === row.participantId ? null : row.participantId))}
                  />
                ) : positionBadge(row.position)}
              </TableCell>
              <TableCell className="px-1.5 font-medium">
                <div className="flex min-w-0 items-center gap-1.5">
                  {row.winnerIso && (
                    <span className={`fi fi-${row.winnerIso} shrink-0 rounded-[2px] text-base shadow-sm`} title={row.winnerName ?? undefined} role="img" aria-label={row.winnerName ?? undefined} />
                  )}
                  <a
                    href={`/deelnemer/${row.participantId}`}
                    onClick={(e) => e.stopPropagation()}
                    className="truncate rounded-sm hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold/60"
                  >
                    {row.name}
                  </a>
                </div>
              </TableCell>
              <TableCell className="px-1 text-right"><div className="flex justify-end"><FormDots form={row.form} /></div></TableCell>
              {hasLive && (
                <TableCell className="px-0.5 text-right">
                  {row.delta > 0 && (
                    <span className="rounded bg-red-100 px-1 py-0.5 text-[10px] font-semibold tabular-nums text-red-700" title="voorlopige live-punten">+{row.delta}</span>
                  )}
                </TableCell>
              )}
              <TableCell className="px-1.5 text-center font-bold tabular-nums">{row.total}</TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );

  return (
    <div className="space-y-6">
      {favRows.length > 0 && (
        <section>
          <h2 className="mb-2 flex items-center gap-2 text-lg font-semibold">
            <Star filled className="size-5" /> Favorieten
          </h2>
          <div className="rounded-xl border bg-card p-1">{renderTable(favRows)}</div>
        </section>
      )}
      <section>
        {mainHeading && (
          <h2 className={limit != null ? "mb-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground" : "mb-2 text-lg font-semibold"}>{mainHeading}</h2>
        )}
        {hasLive && (
          <p className="mb-2 flex items-center gap-1.5 text-xs text-red-700">
            <span className="size-2 animate-pulse rounded-full bg-red-600" /> Voorlopige stand — inclusief live-wedstrijden
          </p>
        )}
        {searchable && (
          <div className="relative mb-2">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true">
              <circle cx="11" cy="11" r="7" /><path d="m21 21-4.3-4.3" />
            </svg>
            <input
              type="search"
              value={query}
              onChange={(e) => {
                const val = e.target.value;
                setQuery(val);
                if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
                if (val.trim()) {
                  searchTimerRef.current = setTimeout(() => {
                    const ph = (window as unknown as { posthog?: { capture: (e: string, p?: Record<string, unknown>) => void } }).posthog;
                    ph?.capture("participant_searched", { query: val.trim() });
                  }, 600);
                }
              }}
              placeholder="Zoek op naam…"
              aria-label="Zoek op naam"
              className="w-full rounded-lg border bg-card py-2 pl-8 pr-8 text-base focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold/60 sm:text-sm"
            />
            {query && (
              <button
                type="button"
                onClick={() => setQuery("")}
                aria-label="Zoekopdracht wissen"
                className="absolute right-1.5 top-1/2 grid size-6 -translate-y-1/2 place-items-center rounded-md text-muted-foreground hover:bg-muted"
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" className="size-4"><path d="M6 6l12 12M18 6 6 18" /></svg>
              </button>
            )}
          </div>
        )}
        {searching && mainRows.length === 0 ? (
          <p className="rounded-xl border bg-card px-4 py-6 text-center text-sm text-muted-foreground">Geen deelnemer gevonden voor “{query.trim()}”.</p>
        ) : (
          <div className="rounded-xl border bg-card p-1">{renderTable(mainRows, true, true)}</div>
        )}
        {showPrizeLegend && !(searching && mainRows.length === 0) && (
          <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 px-1 text-xs text-muted-foreground">
            <span className="font-medium text-foreground">Prijzengeld</span>
            <span className="inline-flex items-center gap-1"><span className={`size-3.5 rounded ${BADGE_TONE[1]}`} aria-hidden="true" />1e</span>
            <span className="inline-flex items-center gap-1"><span className={`size-3.5 rounded ${BADGE_TONE[2]}`} aria-hidden="true" />2e</span>
            <span className="inline-flex items-center gap-1"><span className={`size-3.5 rounded ${BADGE_TONE[3]}`} aria-hidden="true" />3e</span>
            <span className="inline-flex items-center gap-1"><span className={`size-3.5 rounded ${BADGE_TONE_LOW}`} aria-hidden="true" />4e–5e</span>
            <span className="text-muted-foreground">tik op de plaats voor het bedrag</span>
          </div>
        )}
        {limit != null && moreHref && !searching && (
          <a
            href={moreHref}
            onClick={() => {
              const ph = (window as unknown as { posthog?: { capture: (e: string) => void } }).posthog;
              ph?.capture("full_ranking_viewed");
            }}
            className="mt-3 flex items-center justify-center gap-1.5 rounded-lg border bg-card px-4 py-2.5 text-sm font-semibold transition-colors hover:bg-muted"
          >
            Volledig klassement
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="size-4"><path d="M5 12h14M13 6l6 6-6 6" /></svg>
          </a>
        )}
      </section>

      {tut === "intro" && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="fav-tut-title"
          onClick={() => dismissTutorial("backdrop")}
        >
          <div ref={introRef} className="w-full max-w-sm rounded-2xl border bg-card p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="mb-2 flex items-center gap-2">
              <Star filled className="size-6" />
              <h2 id="fav-tut-title" className="text-lg font-bold">Volg je favorieten</h2>
            </div>
            <p className="text-sm text-muted-foreground">
              Tik op de <span className="font-medium text-foreground">ster</span> naast een deelnemer om die te volgen. Je favorieten verschijnen dan in een apart <span className="font-medium text-foreground">Favorieten</span>-blok bovenaan — zowel op de homepagina als op het klassement — zodat je ze snel terugvindt.
            </p>
            <div className="mt-4 flex items-center justify-end gap-2">
              <button type="button" onClick={() => dismissTutorial("skip")} className="rounded-lg px-3 py-2 text-sm font-medium text-muted-foreground hover:bg-muted">Overslaan</button>
              <button type="button" onClick={() => setTut("spotlight")} className="rounded-lg bg-gold px-4 py-2 text-sm font-semibold text-gold-foreground transition-[filter] hover:brightness-95">Toon me hoe</button>
            </div>
          </div>
        </div>
      )}

      {tut === "spotlight" && bubble && (
        <div className="fixed z-50 w-60 rounded-xl border bg-card p-3 shadow-xl" style={{ top: bubble.top, left: bubble.left }} role="dialog" aria-label="Tutorial">
          <p className="text-sm">Tik hier op de <span className="font-medium">ster</span> <Star filled className="inline size-4 align-text-bottom" /> om deze deelnemer te volgen.</p>
          <div className="mt-2 flex justify-end">
            <button type="button" onClick={() => dismissTutorial("skip")} className="rounded-md px-2.5 py-1.5 text-xs font-medium text-muted-foreground hover:bg-muted">Overslaan</button>
          </div>
        </div>
      )}
    </div>
  );
}
