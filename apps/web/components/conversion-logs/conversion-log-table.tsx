import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { TruncateText } from "@/components/ui/truncate-text";
import { Badge } from "@/components/ui/badge";
import { moduleLabel } from "@/lib/module-options";
import { formatDate } from "@/lib/utils";

// § Fase 150, ADR-0038 — bentuk 1 baris riwayat konversi (mirror response `GET /me/conversion-logs`,
// § `conversion-logs.route.ts`). BEDA dari `UnifiedImportBatch` (Arsip Import Facport) — TIDAK ada status/aksi
// batalkan/hapus sama sekali (konversi selesai SEKETIKA di browser, tidak ada proses async server yang bisa
// dibatalkan — § keputusan "100% client-side" ADR-0038).
export type ConversionLogRow = {
  id: string;
  moduleKey: string;
  fileName: string;
  rowCount: number;
  createdAt: string;
  convertedByName: string;
  convertedByYou: boolean;
};

export function ConversionLogTable({ logs, timezone }: { logs: ConversionLogRow[]; timezone: string }) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Tanggal</TableHead>
          <TableHead>Varian</TableHead>
          <TableHead>Nama File</TableHead>
          <TableHead className="text-right">Baris</TableHead>
          <TableHead>Dikonversi Oleh</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {logs.map((log) => (
          <TableRow key={log.id}>
            <TableCell className="whitespace-nowrap">{formatDate(log.createdAt, timezone)}</TableCell>
            <TableCell>{moduleLabel(log.moduleKey)}</TableCell>
            <TableCell className="max-w-[220px]">
              <TruncateText>{log.fileName}</TruncateText>
            </TableCell>
            <TableCell className="text-right tabular-nums">{log.rowCount}</TableCell>
            <TableCell>
              {log.convertedByName}
              {log.convertedByYou && (
                <Badge variant="primary" className="ml-2">
                  Anda
                </Badge>
              )}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
