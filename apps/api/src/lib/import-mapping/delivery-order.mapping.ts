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
// § Fase 158 (2026-09-24) — `salesOrderDetailId` SEKARANG DI-AUTO-RESOLVE
// server-side (§ `resolveSalesOrderDetailIds`, workers/index.ts), BUKAN
// lagi field pasif "ditunda". Ditemukan dari reverse-engineering legacy
// tool client sendiri (facport.com/FAC Institute, alat yang sedang
// digantikan project ini): mereka WAJIB user cek manual halaman "Sales
// Order Item Check" → VLOOKUP Excel manual (Item No & CLS5/"Week") sebelum
// upload — bukti kuat backend LEGACY-nya cuma pass-through APA ADANYA,
// tidak resolve otomatis. Kita BISA lebih baik: server sendiri panggil
// `GET sales-order/detail.do?number=...`, cocokkan `itemNo` (+`CLS5` kalau
// `itemNo` duplikat dalam 1 SO) ke `id` baris yang benar. Field ini TETAP
// ada di `fieldToAccuratePath` sebagai OPSI MANUAL OVERRIDE (user tetap
// bisa isi sendiri kalau mau, mis. hasil dari tool lama) — auto-resolve
// HANYA jalan kalau kolom ini TIDAK dipetakan/kosong.
//
// § KOREKSI Fase 171 (2026-10-06): asumsi di atas ("Week" = CLS5) KELIRU untuk SO client — label "Week N" ada di Atribut Tambahan 1 / Custom
// Character 1 (`charField1`) baris SO, dan client mengetiknya di kolom DO "Item Notes". Pembeda Item No kembar sekarang = Item Notes DO ↔
// `charField1` SO (CLS5 tetap dicocokkan HANYA bila baris SO punya data CLS5). Lihat `resolveSalesOrderDetailId` di bawah.
//
// § CLS2/CLS5 versi HEADER (posisi Excel SEBELUM "Item No") — dicek
// MENYELURUH ke SEMUA endpoint `save.do` di spec resmi Accurate: TIDAK
// ADA SATU PUN endpoint yang punya Kategori Keuangan level header. TIDAK
// dimasukkan ke `fieldToAccuratePath` sama sekali — tidak ada kandidat
// field Accurate yang plausible, jadi kolom ini kalau ada di Excel user
// cuma tampil "(tidak dipetakan)", aman diabaikan. (Reverse-engineering
// legacy tool mengonfirmasi CLS5 VERSI ITEM dipakai client sebagai label
// "Week N" untuk disambiguasi — BUKAN Kategori Keuangan akuntansi
// sungguhan, tapi tetap dikirim ke field `dataClassification5Name` apa
// adanya, konsisten cara legacy tool memperlakukannya.)
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

// § Fase 171 (2026-10-06) — nilai teks DIBERSIHKAN: spasi/baris baru di ujung dibuang; Item No & No Sales Order juga spasi di dalam (satu baris).
// Temuan dari file contoh client: Item No `"\n9900016"` (baris baru terbawa saat copy dari aplikasi bantu) membuat pencocokan persis ke baris
// Sales Order gagal ("Item tidak ditemukan") dan kode barang salah terkirim ke Accurate. Sel yang hanya berisi spasi/baris baru dianggap kosong.
const SINGLE_LINE_FIELDS = new Set<DeliveryOrderField>(["itemNo", "salesOrderNumber"]);

function cleanValue(field: DeliveryOrderField, raw: unknown): unknown {
  if (typeof raw !== "string") return raw;
  return SINGLE_LINE_FIELDS.has(field) ? raw.replace(/\s+/g, " ").trim() : raw.trim();
}

function extractRowValues(rawRow: Record<string, unknown>, columnMapping: Record<string, string>): Partial<Record<DeliveryOrderField, unknown>> {
  const values: Partial<Record<DeliveryOrderField, unknown>> = {};
  for (const [excelColumn, field] of Object.entries(columnMapping)) {
    if (rawRow[excelColumn] !== undefined && rawRow[excelColumn] !== "") {
      const f = field as DeliveryOrderField;
      const raw = DATE_FIELDS.has(f) ? toAccurateDate(rawRow[excelColumn]) : cleanValue(f, rawRow[excelColumn]);
      if (raw === "") continue;
      values[f] = raw;
    }
  }
  return values;
}

export function buildDeliveryOrderPayload(rawRows: Record<string, unknown>[], columnMapping: Record<string, string>): Record<string, unknown> {
  const headerValues = extractRowValues(rawRows[0] ?? {}, columnMapping);

  const payload: Record<string, unknown> = {};
  for (const [field, accuratePath] of Object.entries(deliveryOrderMapping.fieldToAccuratePath)) {
    if (accuratePath.startsWith("detailItem.")) continue;
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

// § Fase 158, architecture-delivery-order.md § "Auto-resolve Sales Order
// Detail ID" — logic MURNI (tanpa I/O ke Accurate) dipisah di sini
// SUPAYA bisa ditest tanpa mock HTTP (§ konvensi project: lapisan I/O
// accurate-*.ts diverifikasi test call NYATA, bukan mock — lapisan
// keputusan/matching-nya yang ditest unit di sini). Dipanggil dari
// `resolveSalesOrderDetailIds` (workers/index.ts) SETELAH fetch detail
// Sales Order dari Accurate.
export type SalesOrderDetailCandidate = { id: number; itemNo: string; dataClassification5Name: string | null; charField1?: string | null };

// Pembanding tidak peka huruf besar/kecil dan spasi berlebih.
const norm = (value: string) => value.replace(/\s+/g, " ").trim().toLowerCase();

/**
 * Cari `salesOrderDetailId` baris SO untuk 1 baris pengiriman. Item No hanya sekali di SO → langsung. Item No KEMBAR → disaring: CLS5
 * (`week`, hanya kalau baris SO memang punya data CLS5) lalu **Item Notes** DO (`notes`) = **Atribut Tambahan 1 / Custom Character 1** baris SO
 * (`charField1`, label "Week N" milik client — Fase 171; asumsi lama "Week = CLS5" Fase 158 keliru). Sisa ≠ 1 → error jelas, TIDAK menebak.
 */
export function resolveSalesOrderDetailId(
  candidates: SalesOrderDetailCandidate[],
  itemNo: string,
  soNumber: string,
  week: string | undefined,
  notes?: string,
): number {
  const byItemNo = candidates.filter((d) => norm(d.itemNo) === norm(itemNo));

  if (byItemNo.length === 0) {
    throw new Error(`Item "${itemNo}" tidak ditemukan di Sales Order "${soNumber}" — cek kembali No SO atau kode barang.`);
  }
  if (byItemNo.length === 1) return byItemNo[0]!.id;

  const weekGiven = week !== undefined && week.trim() !== "";
  const notesGiven = notes !== undefined && notes.trim() !== "";

  // Label pembeda yang ADA di baris-baris SO itu (Atribut Tambahan 1 / CLS5) — ditampilkan di pesan supaya user tinggal menyalin yang benar.
  const distinct = (values: (string | null | undefined)[]) => [...new Set(values.filter((v): v is string => !!v && v.trim() !== "").map((v) => v.trim()))];
  const labels = distinct(byItemNo.map((d) => d.charField1));
  const cls5Labels = distinct(byItemNo.map((d) => d.dataClassification5Name));
  const labelList = labels.length > 0 ? labels.join(", ") : null;

  if (!weekGiven && !notesGiven) {
    // Pesan untuk user Excel: yang diisi adalah kolom "Item Notes" di file Delivery Order ini (bukan field "Atribut Tambahan 1" yang ada di Accurate).
    const choice = labelList
      ? `Isi kolom "Item Notes" pada baris ini dengan label pembeda baris Sales Order-nya (sama persis dengan Atribut Tambahan 1 / Custom Character 1 di Sales Order). Pilihan yang ada: ${labelList}.`
      : cls5Labels.length > 0
        ? `Isi kolom CLS5 pada baris ini dengan salah satu: ${cls5Labels.join(", ")}.`
        : `Baris-baris Sales Order itu tidak punya label pembeda yang terbaca — isi kolom "Sales Order Detail ID" secara manual.`;
    throw new Error(`Barang "${itemNo}" ada ${byItemNo.length}× di Sales Order "${soNumber}" (kode sama). ${choice}${labelList && cls5Labels.length > 0 ? ` (Alternatif: kolom CLS5, pilihan: ${cls5Labels.join(", ")}.)` : ""}`);
  }

  let pool = byItemNo;
  const used: string[] = [];
  // CLS5 hanya menyaring kalau baris SO ini memang punya data CLS5 (kalau tidak, CLS5 di Excel tidak punya lawan bandingnya — diabaikan, bukan pemblokir).
  if (weekGiven && pool.some((d) => d.dataClassification5Name !== null)) {
    pool = pool.filter((d) => d.dataClassification5Name !== null && norm(d.dataClassification5Name) === norm(week!));
    used.push(`CLS5 "${week!.trim()}"`);
  }
  if (notesGiven && pool.length !== 1) {
    pool = pool.filter((d) => d.charField1 != null && norm(d.charField1) === norm(notes!));
    used.push(`Item Notes "${notes!.trim()}"`);
  }
  if (pool.length !== 1) {
    const given = used.join(" & ") || "isian yang diberikan";
    if (pool.length === 0) {
      throw new Error(
        `Barang "${itemNo}" dengan ${given} tidak ditemukan di Sales Order "${soNumber}". ${labelList ? `Pilihan "Item Notes" yang ada: ${labelList} (huruf besar-kecil tidak masalah, tulisan harus sama).` : "Baris-baris Sales Order itu tidak punya label pembeda yang terbaca — isi kolom \"Sales Order Detail ID\" secara manual."}`,
      );
    }
    throw new Error(
      `Barang "${itemNo}" dengan ${given} cocok dengan ${pool.length} baris di Sales Order "${soNumber}" — masih ambigu (${pool.length} baris cocok): label pembedanya sama di baris-baris itu. Isi kolom "Sales Order Detail ID" secara manual untuk memilih salah satunya.`,
    );
  }
  return pool[0]!.id;
}

/**
 * Isi `salesOrderDetailId` semua baris `payload.detailItem` yang punya `salesOrderNumber` tapi belum punya ID (isi manual tidak ditimpa).
 * `fetchCandidates` disuntikkan (worker: baca Accurate; test: palsu), di-cache per nomor SO. Mengubah `payload.detailItem` di tempat.
 */
export async function resolveSalesOrderDetailIdsInPayload(
  payload: Record<string, unknown>,
  fetchCandidates: (soNumber: string) => Promise<SalesOrderDetailCandidate[]>,
): Promise<void> {
  const items = payload.detailItem as Record<string, unknown>[] | undefined;
  if (!items) return;
  const cache = new Map<string, SalesOrderDetailCandidate[]>();
  for (const item of items) {
    const soNumber = item.salesOrderNumber as string | undefined;
    if (!soNumber) continue;
    if (item.salesOrderDetailId !== undefined) continue; // isi manual, jangan ditimpa
    let candidates = cache.get(soNumber);
    if (!candidates) {
      candidates = await fetchCandidates(soNumber);
      cache.set(soNumber, candidates);
    }
    item.salesOrderDetailId = resolveSalesOrderDetailId(
      candidates,
      String(item.itemNo ?? ""),
      soNumber,
      item.dataClassification5Name as string | undefined,
      item.detailNotes as string | undefined,
    );
  }
}
