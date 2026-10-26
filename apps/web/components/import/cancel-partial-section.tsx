import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { groupUndeletedDocuments, type CancelResult } from "@/lib/import-cancel-result";

type BatchRowLike = { status: string; accurateTransactionId: string | null; rawData: Record<string, unknown> };

// § Batal Import sebagian — catatan + daftar dokumen yang MASIH ada di Accurate beserta alasannya, SATU komponen untuk
// semua halaman detail batch (PI, SI, 19 modul lain). Tampil hanya untuk batch `cancelled_partial`. `numberOf` = cara
// tiap halaman membaca nomor dokumen dari baris (beda per modul).
export function CancelPartialSection<T extends BatchRowLike>({
  status,
  rows,
  cancelResult,
  numberOf,
}: {
  status: string;
  rows: T[];
  cancelResult: CancelResult | null;
  numberOf: (row: T) => string;
}) {
  if (status !== "cancelled_partial") return null;
  const documents = groupUndeletedDocuments(rows, cancelResult, numberOf);

  return (
    <>
      <p className="rounded-md border border-warning/40 bg-warning-bg px-3 py-2 text-sm text-foreground">
        Sebagian dokumen belum terhapus dari Accurate — biasanya karena sudah dibayar atau dipakai dokumen lain. Batalkan
        dokumen turunannya dulu (mis. Purchase Payment), lalu klik <strong>Batal Import</strong> lagi.
      </p>
      {documents.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Dokumen yang belum terhapus ({documents.length})</CardTitle>
            <CardDescription>
              Dokumen ini masih ada di Accurate. Bereskan penyebabnya, lalu klik Batal Import lagi.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-48">Nomor Transaksi</TableHead>
                  <TableHead className="w-20">Baris</TableHead>
                  <TableHead>Alasan</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {documents.map((doc) => (
                  <TableRow key={doc.id}>
                    <TableCell className="font-medium">{doc.number || `ID Accurate ${doc.id}`}</TableCell>
                    <TableCell>{doc.rowCount}</TableCell>
                    <TableCell className="whitespace-normal text-sm text-muted-foreground">{doc.reason}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </>
  );
}
