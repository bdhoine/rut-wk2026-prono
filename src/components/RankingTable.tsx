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
  const base = "inline-flex h-7 w-7 items-center justify-center rounded-md text-sm font-semibold tabular-nums";
  if (position === 1) return <span className={`${base} bg-[oklch(0.78_0.15_85)] text-black`}>1</span>;
  if (position === 2) return <span className={`${base} bg-muted text-foreground`}>2</span>;
  if (position === 3) return <span className={`${base} bg-[oklch(0.62_0.12_55)] text-white`}>3</span>;
  return <span className={`${base} text-muted-foreground`}>{position}</span>;
}

export default function RankingTable({ rows }: { rows: RankingTableRow[] }) {
  const [favs, setFavs] = React.useState<string[]>([]);

  React.useEffect(() => {
    try {
      const stored = localStorage.getItem(FAV_KEY);
      if (stored) setFavs(JSON.parse(stored));
    } catch { /* ignore */ }
  }, []);

  const favSet = React.useMemo(() => new Set(favs), [favs]);

  const toggle = (id: string) =>
    setFavs((prev) => {
      const next = prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id];
      try { localStorage.setItem(FAV_KEY, JSON.stringify(next)); } catch { /* ignore */ }
      return next;
    });

  const go = (id: string) => { window.location.href = `/deelnemer/${id}`; };

  const favRows = rows.filter((r) => favSet.has(r.participantId));

  const renderTable = (data: RankingTableRow[]) => (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead className="w-10" />
          <TableHead className="w-10 text-center">#</TableHead>
          <TableHead>Naam</TableHead>
          <TableHead className="text-right">Vorm</TableHead>
          <TableHead className="w-16 text-right">Punten</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {data.map((row) => {
          const fav = favSet.has(row.participantId);
          return (
            <TableRow key={row.participantId} data-clickable="true" onClick={() => go(row.participantId)}>
              <TableCell>
                <button
                  type="button"
                  aria-label={fav ? `${row.name} uit favorieten` : `${row.name} als favoriet`}
                  aria-pressed={fav}
                  onClick={(e) => { e.stopPropagation(); toggle(row.participantId); }}
                  className="grid size-8 place-items-center rounded-md hover:bg-muted"
                >
                  <Star filled={fav} />
                </button>
              </TableCell>
              <TableCell className="text-center">{positionBadge(row.position)}</TableCell>
              <TableCell className="font-medium">
                <div className="flex min-w-0 items-center gap-2">
                  {row.winnerIso && (
                    <span className={`fi fi-${row.winnerIso} shrink-0 rounded-[2px] text-base shadow-sm`} title={row.winnerName ?? undefined} role="img" aria-label={row.winnerName ?? undefined} />
                  )}
                  <span className="truncate">{row.name}</span>
                </div>
              </TableCell>
              <TableCell className="text-right"><div className="flex justify-end"><FormDots form={row.form} /></div></TableCell>
              <TableCell className="text-right font-bold tabular-nums">{row.total}</TableCell>
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
        <div className="rounded-xl border bg-card p-1">{renderTable(rows)}</div>
      </section>
    </div>
  );
}
