// § Batal Import sebagian (`cancelled_partial`) — dokumen yang MASIH ada di Accurate beserta alasannya.
// Dipakai SEMUA halaman detail batch yang punya Batal Import (PI, SI, 19 modul lain). Murni (tanpa React)
// supaya bisa dites langsung. Bentuk `CancelResult` = isi `audit_logs.changes` dari worker CANCEL_IMPORT.
export type CancelResult = {
  deleted: string[];
  blocked: string[];
  failed: string[];
  failedReasons?: Record<string, string>;
};

type BatchRowLike = { status: string; accurateTransactionId: string | null; rawData: Record<string, unknown> };

export type UndeletedDocument = { id: string; number: string; rowCount: number; reason: string };

export function describeUndeletedReason(documentId: string, result: CancelResult | null): string {
  if (result?.blocked.includes(documentId)) {
    return "Faktur ini juga dipakai batch import lain, jadi tidak dihapus otomatis. Hapus manual di Accurate bila perlu.";
  }
  const accurateMessage = result?.failedReasons?.[documentId];
  if (accurateMessage) return `Accurate menolak menghapus: ${accurateMessage}`;
  if (result?.failed.includes(documentId)) {
    return "Accurate menolak menghapus (alasan tidak tercatat — kemungkinan sudah dibayar atau dipakai dokumen lain).";
  }
  return "Belum terhapus.";
}

// Baris yang terhapus sudah `cancelled`; yang MASIH `success` + punya id Accurate = dokumennya masih ada.
// Dikelompokkan per dokumen (1 dokumen bisa banyak baris Excel). `numberOf` = cara tiap halaman membaca nomor dokumen.
export function groupUndeletedDocuments<T extends BatchRowLike>(
  rows: T[],
  result: CancelResult | null,
  numberOf: (row: T) => string,
): UndeletedDocument[] {
  const groups = new Map<string, { id: string; number: string; rowCount: number }>();
  for (const row of rows) {
    if (row.status !== "success" || !row.accurateTransactionId) continue;
    const id = row.accurateTransactionId;
    const entry = groups.get(id) ?? { id, number: numberOf(row), rowCount: 0 };
    entry.rowCount += 1;
    groups.set(id, entry);
  }
  return [...groups.values()].map((doc) => ({ ...doc, reason: describeUndeletedReason(doc.id, result) }));
}

// Nomor dokumen halaman generik: kolom Excel yang dipetakan ke field internal `number` (sama di 19 modul).
export function numberColumnOf(columnMapping: Record<string, string> | null): string | null {
  if (!columnMapping) return null;
  return Object.entries(columnMapping).find(([, field]) => field === "number")?.[0] ?? null;
}

export function documentNumberOf(row: { rawData: Record<string, unknown> }, numberColumn: string | null): string {
  if (!numberColumn) return "";
  const value = row.rawData[numberColumn];
  return value === undefined || value === null ? "" : String(value).trim();
}
