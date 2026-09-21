// § architecture-job-costing.md — Fase 139. Job Costing BUKAN 1 transaksi
// API, tapi 2 PANGGILAN BERURUTAN per grup Excel: `job-order/save.do`
// (header + `detailExpense[]` dari kolom Expense No/Name/Amount) DULU,
// baru `material-adjustment/save.do` (realisasi RM dari kolom RM_*/
// Warehouse/Serial/RM_CLS1-3, REFERENSI `jobOrderNumber` dari RESPONS
// panggilan pertama — bukan nilai Excel "No. Job Order" mentah, karena
// Accurate generate nomor otomatis kalau kolom itu dikosongkan). §
// `docs/architecture/architecture-job-costing.md` § "RESOLVED: 2 Endpoint".
//
// § `materialAdjustmentAccountNo` (REQUIRED endpoint kedua) — Excel
// client CUMA punya 1 kolom akun ("Job Account No"). ASUMSI belum
// dikonfirmasi client: nilai yang SAMA dipakai untuk `jobAccountNo`
// (job-order) DAN `materialAdjustmentAccountNo` (material-adjustment).
// WAJIB diverifikasi saat retest client pertama (§ Known Limitations
// phase doc).
//
// § 1 baris Excel bisa isi kolom RM SAJA, Expense SAJA, atau keduanya —
// field dengan prefix beda (`detailItem.`/`detailExpense.`) masuk array
// beda, BUKAN row-type flag terpisah (pola sama `purchase-invoice.mapping.ts`
// `buildPurchaseInvoicePayload`). "No. Job Order" = kunci grouping SEMUA
// baris (pola ADR-0011 standar).
//
// § Nested `detailItem.detailSerialNumber[0]` (material-adjustment) —
// SAMA pola Item Transfer/Inventory Adjustment: 1 baris Excel = maks 1
// entri serial.
//
// § TIDAK auto-create vendor/customer (field tidak diminta client).
// § Koreksi 2026-09-21 (security-auditor): TIDAK auto-create Item juga
// (BEDA dari rencana awal/komentar sebelumnya di sini yang salah) — SAMA
// alasan Inventory Adjustment (Fase 138): Excel client TIDAK punya kolom
// "RM Item Name", padahal `findOrCreateItem` MEWAJIBKAN nama saat bikin
// barang baru. `rmItemNo` dikirim apa adanya ke `material-adjustment`,
// Accurate yang validasi eksistensi. Scope `item_save` TETAP disiapkan di
// `accurate-scopes.ts` untuk kalau fitur ini diimplementasikan nanti.

export const jobCostingMapping = {
  requiredFields: ["transDate", "branchName", "jobAccountNo", "rmItemNo", "rmQty"] as const,
  fieldToAccuratePath: {
    // → job-order/save.do (header)
    transDate: "transDate",
    number: "number", // No. Job Order — opsional, kunci grouping DAN dipakai ulang sebagai jobOrderNumber (dari RESPONS, bukan nilai ini langsung)
    jobAccountNo: "jobAccountNo",
    differenceAccountNo: "differenceAccountNo",
    description: "description",
    branchName: "branchName",
    // → job-order/save.do detailExpense[]
    expenseAccountNo: "detailExpense.accountNo",
    expenseName: "detailExpense.expenseName",
    expenseAmount: "detailExpense.expenseAmount",
    expenseNotes: "detailExpense.expenseNotes",
    // → material-adjustment/save.do detailItem[] (realisasi RM)
    rmItemNo: "detailItem.itemNo",
    rmQty: "detailItem.quantity",
    rmUnit: "detailItem.itemUnitName",
    projectNo: "detailItem.projectNo",
    deptName: "detailItem.departmentName",
    warehouseName: "detailItem.warehouseName",
    rmNotes: "detailItem.detailNotes",
    rmCls1: "detailItem.dataClassification1Name",
    rmCls2: "detailItem.dataClassification2Name",
    rmCls3: "detailItem.dataClassification3Name",
    // → material-adjustment/save.do detailItem[].detailSerialNumber[0] (nested)
    serialNo: "detailItem.detailSerialNumber.serialNumberNo",
    serialQty: "detailItem.detailSerialNumber.quantity",
    serialExpDate: "detailItem.detailSerialNumber.expiredDate",
  } as const,
  // § URUTAN kolom mengikuti PERSIS sheet "Job Costing"
  // (developmen-15-september-2026.xlsx).
  defaultColumnMap: {
    Tanggal: "transDate",
    "No. Job Order": "number",
    "Job Account No": "jobAccountNo",
    "Difference Account No": "differenceAccountNo",
    Keterangan: "description",
    "Nama Cabang": "branchName",
    "RM_Item No": "rmItemNo",
    RM_Qty: "rmQty",
    RM_Unit: "rmUnit",
    "SN - Qty": "serialQty",
    "Serial No": "serialNo",
    "SN - Exp Date": "serialExpDate",
    "Project No": "projectNo",
    "Dept Name": "deptName",
    Warehouse: "warehouseName",
    RM_CLS1: "rmCls1",
    RM_CLS2: "rmCls2",
    RM_CLS3: "rmCls3",
    "Note Penting": "rmNotes",
    "Expense No": "expenseAccountNo",
    "Expense Name": "expenseName",
    "Expense Amount": "expenseAmount",
    Note: "expenseNotes",
  } as Record<string, string>,
};

export type JobCostingField = keyof typeof jobCostingMapping.fieldToAccuratePath;

export type ImportRowRecord = { id: string; rawData: Record<string, unknown> };
export type JobCostingGroup = { groupKey: string | null; groupColumn: string | null; rows: ImportRowRecord[] };

const EXCEL_EPOCH_UTC_MS = Date.UTC(1899, 11, 30);

// § mirror `toAccurateDate` di `inventory-adjustment.mapping.ts`/`item-transfer.mapping.ts`.
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

function columnOf(columnMapping: Record<string, string>, field: string): string | null {
  return Object.entries(columnMapping).find(([, f]) => f === field)?.[0] ?? null;
}

function valueOf(rawRow: Record<string, unknown>, column: string | null): unknown {
  if (!column) return undefined;
  const value = rawRow[column];
  return value === undefined || value === null || value === "" ? undefined : value;
}

export function numberColumnOf(columnMapping: Record<string, string>): string | null {
  return columnOf(columnMapping, "number");
}

function valueOfColumn(row: ImportRowRecord, column: string | null): string | null {
  if (!column) return null;
  const value = row.rawData[column];
  if (value === undefined || value === null) return null;
  const trimmed = String(value).trim();
  return trimmed === "" ? null : trimmed;
}

// § grouping DEFAULT ADR-0011 by "No. Job Order" (`number`, OPSIONAL —
// kosong = 1 baris = 1 dokumen sendiri, konsisten Inventory Adjustment/Other Deposit).
export function groupJobCostingRows(rows: ImportRowRecord[], columnMapping: Record<string, string>): JobCostingGroup[] {
  const numberColumn = numberColumnOf(columnMapping);
  const groups: JobCostingGroup[] = [];
  const byKey = new Map<string, JobCostingGroup>();

  for (const row of rows) {
    const groupKey = valueOfColumn(row, numberColumn);
    if (groupKey === null || numberColumn === null) {
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

// § extractor Kategori Keuangan RM_CLS1-3 — dipakai worker
// `ensureJobCostingDataClassifications` (mirror `extractDataClassificationValues`
// Item Transfer, 3 slot bukan 10 karena Excel client cuma minta RM_CLS1-3).
export function extractDataClassificationValues(
  rawRow: Record<string, unknown>,
  columnMapping: Record<string, string>,
): { index: number; name: string }[] {
  const result: { index: number; name: string }[] = [];
  for (let index = 1; index <= 3; index++) {
    const column = columnOf(columnMapping, `rmCls${index}`);
    const value = valueOf(rawRow, column);
    if (value === undefined) continue;
    const name = String(value).trim();
    if (name !== "") result.push({ index, name });
  }
  return result;
}

// § Payload job-order/save.do — header + detailExpense[] SAJA.
// `detailItem[]` di endpoint ini TIDAK dipakai untuk RM (§ komentar atas),
// dikirim kosong `[]`. Baris tanpa data Expense (kolom "Expense No"
// kosong) TIDAK berkontribusi ke detailExpense[].
export function buildJobOrderPayload(rawRows: Record<string, unknown>[], columnMapping: Record<string, string>): Record<string, unknown> {
  const firstRow = rawRows[0] ?? {};
  const transDateColumn = columnOf(columnMapping, "transDate");
  const numberColumn = numberColumnOf(columnMapping);

  const payload: Record<string, unknown> = {
    transDate: String(toAccurateDate(valueOf(firstRow, transDateColumn)) ?? ""),
    detailItem: [],
    detailExpense: [] as Record<string, unknown>[],
  };

  const number = valueOf(firstRow, numberColumn);
  if (number !== undefined) payload.number = String(number);

  const rootFields = [
    ["jobAccountNo", "jobAccountNo", String],
    ["differenceAccountNo", "differenceAccountNo", String],
    ["description", "description", String],
    ["branchName", "branchName", String],
  ] as const;
  for (const [field, accuratePath, cast] of rootFields) {
    const value = valueOf(firstRow, columnOf(columnMapping, field));
    if (value !== undefined) payload[accuratePath] = cast(value);
  }

  const expenseAccountNoColumn = columnOf(columnMapping, "expenseAccountNo");
  const expenseNameColumn = columnOf(columnMapping, "expenseName");
  const expenseAmountColumn = columnOf(columnMapping, "expenseAmount");
  const expenseNotesColumn = columnOf(columnMapping, "expenseNotes");

  const detailExpense = payload.detailExpense as Record<string, unknown>[];
  for (const rawRow of rawRows) {
    const accountNo = valueOf(rawRow, expenseAccountNoColumn);
    if (accountNo === undefined) continue; // baris ini tidak punya data Expense
    const expense: Record<string, unknown> = { accountNo: String(accountNo) };
    const name = valueOf(rawRow, expenseNameColumn);
    const amount = valueOf(rawRow, expenseAmountColumn);
    const notes = valueOf(rawRow, expenseNotesColumn);
    if (name !== undefined) expense.expenseName = String(name);
    if (amount !== undefined) expense.expenseAmount = Number(amount);
    if (notes !== undefined) expense.expenseNotes = String(notes);
    detailExpense.push(expense);
  }

  return payload;
}

// § Payload material-adjustment/save.do — realisasi RM. `jobOrderNumber`
// TIDAK dibangun di sini (baru diketahui dari RESPONS job-order/save.do,
// diisi caller/worker setelah panggilan pertama sukses). Baris tanpa
// data RM (kolom "RM_Item No" kosong) TIDAK berkontribusi ke detailItem[].
export function buildMaterialAdjustmentDetailItems(rawRows: Record<string, unknown>[], columnMapping: Record<string, string>): Record<string, unknown>[] {
  const rmItemNoColumn = columnOf(columnMapping, "rmItemNo");
  const rmQtyColumn = columnOf(columnMapping, "rmQty");
  const rmUnitColumn = columnOf(columnMapping, "rmUnit");
  const projectNoColumn = columnOf(columnMapping, "projectNo");
  const deptNameColumn = columnOf(columnMapping, "deptName");
  const warehouseNameColumn = columnOf(columnMapping, "warehouseName");
  const rmNotesColumn = columnOf(columnMapping, "rmNotes");
  const serialNoColumn = columnOf(columnMapping, "serialNo");
  const serialQtyColumn = columnOf(columnMapping, "serialQty");
  const serialExpDateColumn = columnOf(columnMapping, "serialExpDate");

  const items: Record<string, unknown>[] = [];
  for (const rawRow of rawRows) {
    const itemNo = valueOf(rawRow, rmItemNoColumn);
    if (itemNo === undefined) continue; // baris ini tidak punya data RM

    const item: Record<string, unknown> = {
      itemNo: String(itemNo),
      quantity: Number(valueOf(rawRow, rmQtyColumn) ?? 0),
    };

    const unit = valueOf(rawRow, rmUnitColumn);
    const projectNo = valueOf(rawRow, projectNoColumn);
    const deptName = valueOf(rawRow, deptNameColumn);
    const warehouseName = valueOf(rawRow, warehouseNameColumn);
    const notes = valueOf(rawRow, rmNotesColumn);
    if (unit !== undefined) item.itemUnitName = String(unit);
    if (projectNo !== undefined) item.projectNo = String(projectNo);
    if (deptName !== undefined) item.departmentName = String(deptName);
    if (warehouseName !== undefined) item.warehouseName = String(warehouseName);
    if (notes !== undefined) item.detailNotes = String(notes);

    for (let index = 1; index <= 3; index++) {
      const column = columnOf(columnMapping, `rmCls${index}`);
      const value = valueOf(rawRow, column);
      if (value !== undefined) item[`dataClassification${index}Name`] = String(value);
    }

    const serialNo = valueOf(rawRow, serialNoColumn);
    const serialQty = valueOf(rawRow, serialQtyColumn);
    const serialExpDate = valueOf(rawRow, serialExpDateColumn);
    if (serialNo !== undefined || serialQty !== undefined || serialExpDate !== undefined) {
      const serial: Record<string, unknown> = {};
      if (serialNo !== undefined) serial.serialNumberNo = String(serialNo);
      if (serialQty !== undefined) serial.quantity = Number(serialQty);
      if (serialExpDate !== undefined) serial.expiredDate = toAccurateDate(serialExpDate);
      item.detailSerialNumber = [serial];
    }

    items.push(item);
  }
  return items;
}
