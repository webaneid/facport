// § architecture-delivery-order.md — Fase 157. Delivery Order = bukti
// FISIK barang sudah dikirim ke customer, dokumen LANJUTAN dalam rantai
// Sales (Sales Quotation → Sales Order → Delivery Order → Sales Invoice)
// — mirror Receive Item: TIDAK auto-create customer/item (customerNo/
// itemNo dikirim APA ADANYA, Accurate yang validasi eksistensi), TIDAK
// ADA `detailExpense[]`.
//
// § Grouping STANDAR ADR-0011 (by `number`/Trans No, OPSIONAL) — BEDA dari
// Receive Item yang grouping wajib by `receiveNumber`. Delivery Order
// tidak punya kolom setara "nomor surat jalan vendor" di template client.
//
// § `detailSerialNumber[]` — struktur DIKONFIRMASI dari spec resmi
// (`{ serialNumberNo, quantity, expiredDate }`, IDENTIK dengan yang sudah
// dipakai `material-slip.mapping.ts`/`finished-good-slip.mapping.ts`) —
// BUKAN tebakan. Template client cuma 1 serial per baris Item (beda dari
// Slip yang bisa banyak serial via baris lanjutan) — dibangun langsung di
// `buildDetailItemFromRow`, TIDAK lewat helper `collectSerialEntries`
// (helper itu untuk kasus multi-baris-per-item yang tidak berlaku di sini).
//
// § DITUNDA 2026-09-24 (keputusan eksplisit user, § lessons-learned) — 2
// kolom Excel client SENGAJA TIDAK dikirim ke Accurate sampai
// diklarifikasi, walau TETAP dipetakan di sini (kalau nanti diaktifkan
// cuma pindah 1 baris, bukan nulis ulang):
//   1. `salesOrderDetailId` — field API kemungkinan besar (ANALOGI
//      `receiveItemDetailId` yang dikonfirmasi resmi Accurate Support
//      untuk Purchase Invoice←Receive Item), TAPI TIDAK ADA di spec resmi
//      — presisi nama/perilaku field ini WAJIB dikonfirmasi dulu ke
//      Accurate Support. Field ADA di `fieldToAccuratePath` (jadi bisa
//      dipetakan tanpa error di UI), TAPI di-EXCLUDE eksplisit di
//      `buildDetailItemFromRow` (§ `DEFERRED_FIELDS`) — TIDAK ikut payload.
//   2. CLS2/CLS5 versi HEADER (posisi Excel SEBELUM "Item No") — dicek
//      MENYELURUH ke SEMUA endpoint `save.do` di spec resmi Accurate: TIDAK
//      ADA SATU PUN endpoint yang punya Kategori Keuangan level header.
//      TIDAK dimasukkan ke `fieldToAccuratePath` SAMA SEKALI (beda dari
//      poin 1 di atas) — tidak ada kandidat field Accurate yang plausible
//      untuk dijadikan tujuan mapping, jadi kolom ini kalau ada di Excel
//      user cuma akan tampil "(tidak dipetakan)", aman diabaikan.
export const deliveryOrderMapping = {
  requiredFields: ["transDate", "customerNo", "itemNo", "quantity", "itemUnitName"] as const,
  fieldToAccuratePath: {
    transDate: "transDate",
    customerNo: "customerNo",
    number: "number", // nomor transaksi internal Accurate — opsional, kosongkan utk auto-number
    branchName: "branchName",
    description: "description",
    toAddress: "toAddress",
    poNumber: "poNumber",
    // detailItem
    itemNo: "detailItem.itemNo",
    unitPrice: "detailItem.unitPrice",
    quantity: "detailItem.quantity",
    itemUnitName: "detailItem.itemUnitName",
    itemName: "detailItem.detailName",
    itemNotes: "detailItem.detailNotes",
    departmentName: "detailItem.departmentName",
    warehouseName: "detailItem.warehouseName",
    projectNo: "detailItem.projectNo",
    salesOrderNumber: "detailItem.salesOrderNumber",
    salesQuotationNumber: "detailItem.salesQuotationNumber",
    reverseInvoiceNumber: "detailItem.reverseInvoiceNumber",
    // § DITUNDA — lihat komentar atas, di-exclude eksplisit di `DEFERRED_FIELDS`.
    salesOrderDetailId: "detailItem.salesOrderDetailId",
    // Kategori Keuangan level ITEM (posisi Excel SETELAH "Item Reverse Invoice", § komentar atas — AKTIF, beda dari versi header yang tidak dipetakan sama sekali).
    attribut2: "detailItem.dataClassification2Name",
    attribut5: "detailItem.dataClassification5Name",
    // Serial Number — 1 entri per baris Item (§ komentar atas soal struktur).
    serialNum: "detailItem.detailSerialNumber.serialNumberNo",
    serialNumQty: "detailItem.detailSerialNumber.quantity",
    serialNumExpDate: "detailItem.detailSerialNumber.expiredDate",
  } as const,
  defaultColumnMap: {
    "Trans Date": "transDate",
    "Cust No": "customerNo",
    "Trans No": "number",
    "Branch Name": "branchName",
    Description: "description",
    "To Address": "toAddress",
    "PO No": "poNumber",
    "Item No": "itemNo",
    "Item Unit Price": "unitPrice",
    "Item Qty": "quantity",
    "Item Unit Name": "itemUnitName",
    "Item Detail Name": "itemName",
    "Item Notes": "itemNotes",
    "Item Dept": "departmentName",
    "Item Warehouse": "warehouseName",
    "Item Project No": "projectNo",
    "Item Sales Order No": "salesOrderNumber",
    "Sales Order Detail ID": "salesOrderDetailId",
    "Item Sales Quot No": "salesQuotationNumber",
    "Item Reverse Invoice": "reverseInvoiceNumber",
    // § SENGAJA TIDAK ada entry auto-suggest "CLS2"/"CLS5" di sini — Excel client punya "CLS2"/"CLS5"
    // DUA KALI (versi header yang DITUNDA § komentar atas, dan versi item yang aktif), `parseExcelBuffer`
    // (§ excel.ts, fix Fase 147) dedupe jadi "CLS2"/"CLS2_1" berdasar URUTAN KOLOM, bukan makna — auto-suggest
    // berbasis nama TEKS akan asal comot salah satunya (kemungkinan besar versi header yang salah, karena
    // muncul lebih dulu). User WAJIB pilih manual mana yang dimaksud "attribut2"/"attribut5" saat cocokkan
    // kolom, lihat data preview-nya sendiri — lebih aman daripada auto-suggest yang bisa salah diam-diam.
    "Serial Num": "serialNum",
    "Serial Num Qty": "serialNumQty",
    "Serial Num Exp Date": "serialNumExpDate",
  } as Record<string, string>,
};

export type DeliveryOrderField = keyof typeof deliveryOrderMapping.fieldToAccuratePath;

// § field yang ADA di mapping (bisa dipetakan tanpa error) tapi SENGAJA
// tidak pernah ikut ke payload — lihat komentar besar di atas file.
const DEFERRED_FIELDS = new Set<DeliveryOrderField>(["salesOrderDetailId"]);

const DATE_FIELDS = new Set<DeliveryOrderField>(["transDate", "serialNumExpDate"]);
const EXCEL_EPOCH_UTC_MS = Date.UTC(1899, 11, 30);

function toAccurateDate(value: unknown): unknown {
  let date: Date | null = null;
  if (typeof value === "number") {
    date = new Date(EXCEL_EPOCH_UTC_MS + value * 86400000);
  } else if (value instanceof Date) {
    date = value;
  } else if (typeof value === "string") {
    if (/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(value)) return value;
    const isoMatch = value.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (isoMatch) date = new Date(Date.UTC(Number(isoMatch[1]), Number(isoMatch[2]) - 1, Number(isoMatch[3])));
  }
  if (!date || Number.isNaN(date.getTime())) return value;
  const dd = String(date.getUTCDate()).padStart(2, "0");
  const mm = String(date.getUTCMonth() + 1).padStart(2, "0");
  return `${dd}/${mm}/${date.getUTCFullYear()}`;
}

function extractRowValues(rawRow: Record<string, unknown>, columnMapping: Record<string, string>): Partial<Record<DeliveryOrderField, unknown>> {
  const values: Partial<Record<DeliveryOrderField, unknown>> = {};
  for (const [excelColumn, field] of Object.entries(columnMapping)) {
    if (rawRow[excelColumn] !== undefined && rawRow[excelColumn] !== "") {
      const f = field as DeliveryOrderField;
      const raw = rawRow[excelColumn];
      values[f] = DATE_FIELDS.has(f) ? toAccurateDate(raw) : raw;
    }
  }
  return values;
}

export function buildDeliveryOrderPayload(rawRows: Record<string, unknown>[], columnMapping: Record<string, string>): Record<string, unknown> {
  const headerValues = extractRowValues(rawRows[0] ?? {}, columnMapping);

  const payload: Record<string, unknown> = {};
  for (const [field, accuratePath] of Object.entries(deliveryOrderMapping.fieldToAccuratePath)) {
    if (accuratePath.startsWith("detailItem.")) continue;
    if (DEFERRED_FIELDS.has(field as DeliveryOrderField)) continue;
    const value = headerValues[field as DeliveryOrderField];
    if (value !== undefined) payload[accuratePath] = value;
  }

  payload.detailItem = rawRows.map((rawRow) => buildDetailItemFromRow(rawRow, columnMapping));

  return payload;
}

export function buildDetailItemFromRow(rawRow: Record<string, unknown>, columnMapping: Record<string, string>): Record<string, unknown> {
  const rowValues = extractRowValues(rawRow, columnMapping);
  const detailItem: Record<string, unknown> = {};
  for (const [field, accuratePath] of Object.entries(deliveryOrderMapping.fieldToAccuratePath)) {
    if (!accuratePath.startsWith("detailItem.")) continue;
    if (accuratePath.startsWith("detailItem.detailSerialNumber.")) continue; // § dirangkai terpisah di bawah
    if (DEFERRED_FIELDS.has(field as DeliveryOrderField)) continue;
    const value = rowValues[field as DeliveryOrderField];
    if (value !== undefined) detailItem[accuratePath.slice("detailItem.".length)] = value;
  }

  const serialNo = rowValues.serialNum;
  if (serialNo !== undefined) {
    const entry: Record<string, unknown> = { serialNumberNo: String(serialNo) };
    if (rowValues.serialNumQty !== undefined) entry.quantity = Number(rowValues.serialNumQty);
    if (rowValues.serialNumExpDate !== undefined) entry.expiredDate = rowValues.serialNumExpDate;
    detailItem.detailSerialNumber = [entry];
  }

  return detailItem;
}

export type ImportRowRecord = { id: string; rawData: Record<string, unknown> };
export type DeliveryOrderGroup = { groupKey: string | null; groupColumn: string | null; rows: ImportRowRecord[] };

// § grouping standar ADR-0011 by `number` (Trans No), OPSIONAL — kosong = 1 baris = 1 dokumen sendiri.
export function groupDeliveryOrderRows(rows: ImportRowRecord[], columnMapping: Record<string, string>): DeliveryOrderGroup[] {
  const numberColumn = Object.entries(columnMapping).find(([, field]) => field === "number")?.[0] ?? null;
  const groups: DeliveryOrderGroup[] = [];
  const byKey = new Map<string, DeliveryOrderGroup>();

  for (const row of rows) {
    const raw = numberColumn ? row.rawData[numberColumn] : undefined;
    const groupKey = raw === undefined || raw === null || String(raw).trim() === "" ? null : String(raw).trim();
    if (groupKey === null) {
      groups.push({ groupKey: null, groupColumn: null, rows: [row] });
      continue;
    }
    const mapKey = groupKey.toLowerCase();
    let group = byKey.get(mapKey);
    if (!group) {
      group = { groupKey, groupColumn: numberColumn, rows: [] };
      byKey.set(mapKey, group);
      groups.push(group);
    }
    group.rows.push(row);
  }

  return groups;
}

export function validateGroupCustomerConsistency(group: DeliveryOrderGroup, columnMapping: Record<string, string>): string | null {
  const customerNoColumn = Object.entries(columnMapping).find(([, field]) => field === "customerNo")?.[0];
  if (!customerNoColumn) return null;

  const customerNos = new Set(
    group.rows
      .map((row) => row.rawData[customerNoColumn])
      .filter((v) => v !== undefined && v !== null && String(v).trim() !== "")
      .map((v) => String(v).trim()),
  );

  if (customerNos.size <= 1) return null;

  const label = group.groupKey ?? "(tanpa Trans No)";
  return `Trans No "${label}" dipakai untuk customer berbeda-beda (${[...customerNos].join(", ")}) — pastikan semua baris 1 Delivery Order pakai Cust No yang sama.`;
}

export function extractDataClassificationValues(rawRow: Record<string, unknown>, columnMapping: Record<string, string>): { index: number; name: string }[] {
  const result: { index: number; name: string }[] = [];
  for (const index of [2, 5]) {
    const excelColumn = Object.entries(columnMapping).find(([, f]) => f === `attribut${index}`)?.[0];
    const value = excelColumn ? rawRow[excelColumn] : undefined;
    if (value === undefined || value === "") continue;
    const name = String(value).trim();
    if (name !== "") result.push({ index, name });
  }
  return result;
}
