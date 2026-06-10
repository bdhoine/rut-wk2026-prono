import * as React from "react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";

export interface RankingTableRow {
  position: number;
  participantId: string;
  name: string;
  total: number;
  matchPoints: number;
  bonusPoints: number;
}

type SortKey = "position" | "name" | "total";

function positionBadge(position: number) {
  if (position === 1) return <Badge className="bg-[oklch(0.78_0.15_85)] text-black">1</Badge>;
  if (position === 2) return <Badge variant="muted">2</Badge>;
  if (position === 3) return <Badge className="bg-[oklch(0.62_0.12_55)] text-white">3</Badge>;
  return <span className="text-muted-foreground tabular-nums">{position}</span>;
}

export default function RankingTable({ rows }: { rows: RankingTableRow[] }) {
  const [sort, setSort] = React.useState<SortKey>("position");

  const sorted = React.useMemo(() => {
    const copy = [...rows];
    if (sort === "name") copy.sort((a, b) => a.name.localeCompare(b.name, "nl"));
    else if (sort === "total") copy.sort((a, b) => b.total - a.total || a.name.localeCompare(b.name, "nl"));
    else copy.sort((a, b) => a.position - b.position || a.name.localeCompare(b.name, "nl"));
    return copy;
  }, [rows, sort]);

  const go = (id: string) => {
    window.location.href = `/deelnemer/${id}`;
  };

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead className="w-12 cursor-pointer select-none" onClick={() => setSort("position")}>#</TableHead>
          <TableHead className="cursor-pointer select-none" onClick={() => setSort("name")}>Naam</TableHead>
          <TableHead className="w-20 text-right cursor-pointer select-none" onClick={() => setSort("total")}>Punten</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {sorted.map((row) => (
          <TableRow key={row.participantId} data-clickable="true" onClick={() => go(row.participantId)}>
            <TableCell>{positionBadge(row.position)}</TableCell>
            <TableCell className="font-medium">{row.name}</TableCell>
            <TableCell className="text-right font-bold tabular-nums">{row.total}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
