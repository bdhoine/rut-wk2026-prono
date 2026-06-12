import * as React from "react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

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

// Prize money per final position (euro). Shown on the klassement with a divider
// after the last paid spot. The official ranking in the WhatsApp group counts.
const PRIZES: Record<number, number> = { 1: 320, 2: 200, 3: 120, 4: 90, 5: 60 };

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

function positionBadge(position: number) {
  const base = "inline-flex h-7 w-7 items-center justify-center rounded-md text-sm font-bold tabular-nums font-display";
  if (position === 1) return <span className={`${base} bg-gradient-to-b from-[#f6d873] to-[#dca21f] text-[#5a3d08] ring-1 ring-[#caa12e]/60 shadow-sm`}>1</span>;
  if (position === 2) return <span className={`${base} bg-gradient-to-b from-zinc-100 to-zinc-300 text-zinc-700 ring-1 ring-zinc-400/50 shadow-sm`}>2</span>;
  if (position === 3) return <span className={`${base} bg-gradient-to-b from-[#e3b27e] to-[#a96a32] text-white ring-1 ring-[#8a531f]/50 shadow-sm`}>3</span>;
  return <span className={`${base} font-semibold text-muted-foreground`}>{position}</span>;
}

type DisplayRow = RankingTableRow & { delta: number };

export default function RankingTable({ rows }: { rows: RankingTableRow[] }) {
  const [favs, setFavs] = React.useState<string[]>([]);
  const [deltas, setDeltas] = React.useState<Record<string, number>>({});

  React.useEffect(() => {
    try {
      const stored = localStorage.getItem(FAV_KEY);
      if (stored) setFavs(JSON.parse(stored));
    } catch { /* ignore */ }
  }, []);

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

  const toggle = (id: string) =>
    setFavs((prev) => {
      const next = prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id];
      try { localStorage.setItem(FAV_KEY, JSON.stringify(next)); } catch { /* ignore */ }
      return next;
    });

  const go = (id: string) => { window.location.href = `/deelnemer/${id}`; };

  const favRows = displayRows.filter((r) => favSet.has(r.participantId));

  const renderTable = (data: DisplayRow[], showPrizeCut = false) => (
    <Table className="table-fixed">
      <TableHeader>
        <TableRow>
          {/* Star col: size-7 button + padding must fit the declared width,
              or table-fixed overflows and shows a scrollbar strip on mobile. */}
          <TableHead className="w-8 px-0.5" />
          <TableHead className="w-8 px-0.5 text-center">#</TableHead>
          <TableHead className="px-1.5">Naam</TableHead>
          <TableHead className="w-14 px-1 text-right">Vorm</TableHead>
          <TableHead className="w-12 px-1.5 text-center" title="Punten">Ptn</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {data.map((row) => {
          const fav = favSet.has(row.participantId);
          const inMoney = showPrizeCut && PRIZES[row.position] != null;
          return (
            <TableRow key={row.participantId} data-clickable="true" onClick={() => go(row.participantId)} className={inMoney ? "bg-gold/10" : undefined}>
              <TableCell className="px-0.5">
                <button
                  type="button"
                  aria-label={fav ? `${row.name} uit favorieten` : `${row.name} als favoriet`}
                  aria-pressed={fav}
                  onClick={(e) => { e.stopPropagation(); toggle(row.participantId); }}
                  className="mx-auto grid size-7 place-items-center rounded-md hover:bg-muted"
                >
                  <Star filled={fav} className="size-[18px]" />
                </button>
              </TableCell>
              <TableCell className="px-0.5 text-center">{positionBadge(row.position)}</TableCell>
              <TableCell className="px-1.5 font-medium">
                <div className="flex min-w-0 items-center gap-1.5">
                  {row.winnerIso && (
                    <span className={`fi fi-${row.winnerIso} shrink-0 rounded-[2px] text-base shadow-sm`} title={row.winnerName ?? undefined} role="img" aria-label={row.winnerName ?? undefined} />
                  )}
                  <span className="truncate">{row.name}</span>
                </div>
              </TableCell>
              <TableCell className="px-1 text-right"><div className="flex justify-end"><FormDots form={row.form} /></div></TableCell>
              <TableCell className="px-1.5 text-center font-bold tabular-nums">
                <div className="flex items-center justify-center gap-1">
                  {row.delta > 0 && (
                    <span className="rounded bg-red-100 px-1 py-0.5 text-[10px] font-semibold tabular-nums text-red-700" title="voorlopige live-punten">+{row.delta}</span>
                  )}
                  <span>{row.total}</span>
                </div>
              </TableCell>
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
        {favRows.length > 0 && <h2 className="mb-2 text-lg font-semibold">Volledig klassement</h2>}
        {hasLive && (
          <p className="mb-2 flex items-center gap-1.5 text-xs text-red-700">
            <span className="size-2 animate-pulse rounded-full bg-red-600" /> Voorlopige stand — inclusief live-wedstrijden
          </p>
        )}
        <div className="rounded-xl border bg-card p-1">{renderTable(displayRows, true)}</div>
      </section>
    </div>
  );
}
