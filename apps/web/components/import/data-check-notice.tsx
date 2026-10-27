import { Alert } from "@/components/ui/alert";

// § Fase 211 lapis 3, ADR-0052 — "Pemeriksaan Data" di langkah Cocokkan Kolom (generik lintas modul; data dari respons unggah API `dataCheck`).
// Hanya MELAPORKAN: yang dirapikan otomatis (info) dan karakter mencurigakan yang TIDAK diubah (peringatan). Tidak ada apa-apa → tidak render.
export type DataCheck = {
  cleanedCells: number;
  normalizedKeyCells: number;
  warnings: { column: string; kind: "non_ascii"; count: number; rows: number[]; example: string }[];
};

const nf = (n: number) => n.toLocaleString("id-ID");

export function DataCheckNotice({ dataCheck }: { dataCheck?: DataCheck }) {
  if (!dataCheck) return null;
  const { cleanedCells, normalizedKeyCells, warnings } = dataCheck;
  if (cleanedCells === 0 && normalizedKeyCells === 0 && warnings.length === 0) return null;

  return (
    <div className="mb-4 flex flex-col gap-2" data-testid="data-check-notice">
      {(cleanedCells > 0 || normalizedKeyCells > 0) && (
        <Alert variant="default">
          <p className="font-medium text-foreground">Data dirapikan otomatis</p>
          <p>
            {cleanedCells > 0 && <>{nf(cleanedCells)} sel dibersihkan dari spasi/karakter tak terlihat (hasil salin-tempel). </>}
            {normalizedKeyCells > 0 && <>{nf(normalizedKeyCells)} sel kode/nama master dirapikan (spasi ganda atau huruf lebar penuh). </>}
            Isi yang terlihat tidak diubah.
          </p>
        </Alert>
      )}
      {warnings.length > 0 && (
        <Alert variant="warning">
          <p className="font-medium">Periksa karakter tidak biasa sebelum import</p>
          <ul className="mt-1 list-disc space-y-1 pl-4">
            {warnings.map((w) => (
              <li key={w.column} className="break-words">
                Kolom <strong>{w.column}</strong>: {nf(w.count)} sel berisi karakter non-ASCII (baris {w.rows.join(", ")}
                {w.count > w.rows.length ? ", …" : ""}). Contoh: {w.example}
              </li>
            ))}
          </ul>
          <p className="mt-1">
            Karakter ini <strong>tidak diubah otomatis</strong>. Kalau Accurate menyimpan nomor/nama dengan karakter biasa (mis. tanda hubung &ldquo;-&rdquo; atau huruf Latin),
            perbaiki dulu di file Excel agar cocok persis.
          </p>
        </Alert>
      )}
    </div>
  );
}
