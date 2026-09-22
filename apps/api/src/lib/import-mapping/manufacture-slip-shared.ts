// § architecture-material-slip.md & architecture-finished-good-slip.md (Fase 148/149) — "Keputusan Desain (lanjutan)".
// Grouping 2-LEVEL dipakai BERSAMA Material Slip dan Finished Good Slip, ditemukan dari data produksi RIIL client
// 2026-09-22 (BUKAN dugaan): dalam 1 dokumen ("Trans No"), 1 barang bisa punya BANYAK nomor seri yang ditulis di
// BARIS EXCEL TERPISAH (bukan 1 baris = 1 serial seperti Roll Over) — DAN dalam 1 dokumen bisa ada BEBERAPA barang
// berbeda (dikonfirmasi Material Slip: 2 baris "Trans No" sama, "Item No" beda). Sinyal baris "item baru" vs baris
// "lanjutan serial": baris item punya field `quantity` (Qty barang) TERISI; baris lanjutan TIDAK (cuma field serial
// yang terisi). Baris item BOLEH JUGA membawa serial-nya sendiri sekaligus (dikonfirmasi contoh Material Slip: 1
// baris = itemNo+quantity+serialNo bersamaan) — serial dikumpulkan dari baris item ITU SENDIRI + semua baris
// lanjutan setelahnya, sampai baris item baru berikutnya.
export type SlipRowRecord = { id: string; rawData: Record<string, unknown> };
export type SlipItemGroup = { itemRow: SlipRowRecord; serialRows: SlipRowRecord[] };
export type SlipDocGroup = { groupKey: string | null; groupColumn: string | null; rows: SlipRowRecord[]; items: SlipItemGroup[] };

function columnOf(columnMapping: Record<string, string>, field: string): string | null {
  return Object.entries(columnMapping).find(([, f]) => f === field)?.[0] ?? null;
}

export function slipValueOf(rawRow: Record<string, unknown>, field: string, columnMapping: Record<string, string>): unknown {
  const column = columnOf(columnMapping, field);
  if (!column) return undefined;
  const value = rawRow[column];
  if (value === undefined || value === null) return undefined;
  if (typeof value === "string" && value.trim() === "") return undefined;
  return value;
}

function slipTextOf(row: SlipRowRecord, column: string | null): string | null {
  if (!column) return null;
  const value = row.rawData[column];
  if (value === undefined || value === null) return null;
  const trimmed = String(value).trim();
  return trimmed === "" ? null : trimmed;
}

/** Field internal SELALU sama di kedua modul: `number` (Trans No, grouping DEFAULT ADR-0011), `quantity` (penanda baris item), `serialNo`. */
function splitIntoItems(rows: SlipRowRecord[], columnMapping: Record<string, string>): SlipItemGroup[] {
  const items: SlipItemGroup[] = [];
  let current: SlipItemGroup | null = null;
  for (const row of rows) {
    const hasQuantity = slipValueOf(row.rawData, "quantity", columnMapping) !== undefined;
    const hasSerial = slipValueOf(row.rawData, "serialNo", columnMapping) !== undefined;
    if (hasQuantity || !current) {
      current = { itemRow: row, serialRows: [] };
      items.push(current);
    } else if (hasSerial) {
      current.serialRows.push(row);
    } else {
      // § baris tanpa quantity DAN tanpa serial di tengah dokumen (data tidak terduga) — jangan diam-diam dibuang,
      // jadikan item tersendiri supaya validasi baris (itemNo/quantity kosong) yang menolaknya dengan pesan jelas.
      current = { itemRow: row, serialRows: [] };
      items.push(current);
    }
  }
  return items;
}

/** Grouping 2-level: by "Trans No" (opsional, kosong = 1 baris = 1 dokumen), lalu pecah tiap grup jadi barang-barang. */
export function groupSlipDocuments(rows: SlipRowRecord[], columnMapping: Record<string, string>): SlipDocGroup[] {
  const numberColumn = columnOf(columnMapping, "number");
  const docs: SlipDocGroup[] = [];
  const byKey = new Map<string, SlipDocGroup>();
  for (const row of rows) {
    const groupKey = slipTextOf(row, numberColumn);
    if (groupKey === null || numberColumn === null) {
      docs.push({ groupKey: null, groupColumn: null, rows: [row], items: [] });
      continue;
    }
    const mapKey = groupKey.toLowerCase();
    let doc = byKey.get(mapKey);
    if (!doc) {
      doc = { groupKey, groupColumn: numberColumn, rows: [], items: [] };
      byKey.set(mapKey, doc);
      docs.push(doc);
    }
    doc.rows.push(row);
  }
  for (const doc of docs) doc.items = splitIntoItems(doc.rows, columnMapping);
  return docs;
}

/** Entri `detailSerialNumber[]` satu barang: dikumpulkan dari baris item ITU SENDIRI (kalau ada serial-nya sendiri) + semua baris lanjutan. */
export function collectSerialEntries(item: SlipItemGroup, columnMapping: Record<string, string>, toAccurateDate: (v: unknown) => unknown): Record<string, unknown>[] {
  const out: Record<string, unknown>[] = [];
  for (const row of [item.itemRow, ...item.serialRows]) {
    const serialNo = slipValueOf(row.rawData, "serialNo", columnMapping);
    if (serialNo === undefined) continue;
    const entry: Record<string, unknown> = { serialNumberNo: String(serialNo) };
    const qty = slipValueOf(row.rawData, "serialQty", columnMapping);
    if (qty !== undefined) entry.quantity = Number(qty);
    const exp = slipValueOf(row.rawData, "serialExpDate", columnMapping);
    if (exp !== undefined) entry.expiredDate = toAccurateDate(exp);
    out.push(entry);
  }
  return out;
}
