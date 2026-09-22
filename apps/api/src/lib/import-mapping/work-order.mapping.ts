// § architecture-work-order.md — Fase 147. Work Order (Perintah Kerja, produksi berbasis BOM), panggil `/api/work-order/save.do`.
//
// § BENTUK EXCEL: 1 baris "lebar" = header dokumen + MAKSIMAL 1 entri per section, berdampingan: bahan baku (`detailMaterial[]`), biaya
// produksi (`detailExpense[]`, ITEM/jasa — BUKAN akun GL), tahapan proses (`detailProcess[]`), produk sampingan (`detailExtraFinishGood[]`).
// Section yang diisi baris itu = section yang kolomnya terisi (bukan penanda eksplisit). Dokumen berisi banyak entri = banyak baris dengan
// "Trans No" SAMA (grouping DEFAULT ADR-0011); header cukup diisi di baris PERTAMA (baris berikutnya boleh kosong; bila terisi harus
// sama). "Trans No" kosong = 1 baris = 1 dokumen.
//
// § HEADER DUPLIKAT: Excel client memakai nama kolom SAMA di beberapa section ("Project No" x3, "Process Category Name" x3, "CLS1" x3, dst).
// `parseExcelBuffer` menamai kemunculan ke-2+ "X_1", "X_2" — `defaultColumnMap` di bawah memakai nama hasil dedupe itu, urutan kolom
// client: material → biaya → proses → produk sampingan. Field internal diberi prefiks section (mat*/exp*/proc*/fg*) supaya tidak bentrok.
//
// § TIDAK auto-create item (produk utama tidak punya kolom nama → `findOrCreateItem` tidak bisa; konsisten Fase 138/139/146) dan TIDAK ada
// lookup akun: `itemNo`/`workAccountNo`/`varianceAccountNo` dikirim apa adanya. Yang di-resolve worker: cabang → `branchId` (lookup,
// TIDAK auto-create), PIC → `personInChargeId` (find-or-create), Kategori Keuangan CLS1-3 (auto-create).
// § "Save As Status Type" (approval) SENGAJA tidak dipetakan (keputusan client 2026-09-21).
export const WORK_ORDER_TYPES = ["BILL_OF_MATERIAL", "MANUFACTURE_ORDER", "PRODUCT"] as const;
export type WorkOrderType = (typeof WORK_ORDER_TYPES)[number];

// Istilah client (penjelasan lisan, belum dicocokkan ke isi Excel riil): Kode Produk / Nomor Formula / Nomor Rencana Produksi.
const WORK_ORDER_TYPE_DICTIONARY: Record<string, WorkOrderType> = {
  "kode produk": "PRODUCT",
  produk: "PRODUCT",
  product: "PRODUCT",
  "nomor formula": "BILL_OF_MATERIAL",
  formula: "BILL_OF_MATERIAL",
  bom: "BILL_OF_MATERIAL",
  "bill of material": "BILL_OF_MATERIAL",
  "nomor rencana produksi": "MANUFACTURE_ORDER",
  "rencana produksi": "MANUFACTURE_ORDER",
  "manufacture order": "MANUFACTURE_ORDER",
};

export function resolveWorkOrderType(raw: unknown): WorkOrderType | null {
  if (raw === undefined || raw === null) return null;
  const normalized = String(raw).trim().toLowerCase().replace(/[_\s]+/g, " ");
  if (normalized === "") return null;
  const upper = normalized.toUpperCase().replace(/ /g, "_");
  if ((WORK_ORDER_TYPES as readonly string[]).includes(upper)) return upper as WorkOrderType;
  return WORK_ORDER_TYPE_DICTIONARY[normalized] ?? null;
}

type Kind = "text" | "num" | "int" | "date" | "bool";
type FieldSpec = { field: string; path: string; kind: Kind };
type SectionSpec = { name: string; label: string; array: string; fields: FieldSpec[]; required: string[] };

const CLS_SLOTS = [1, 2, 3] as const;

function costSection(prefix: string, name: string, label: string, array: string): SectionSpec {
  const f = (suffix: string) => `${prefix}${suffix}`;
  return {
    name,
    label,
    array,
    required: [f("ItemNo"), f("Quantity")],
    fields: [
      { field: f("ItemNo"), path: "itemNo", kind: "text" },
      { field: f("Name"), path: "detailName", kind: "text" },
      { field: f("Quantity"), path: "quantity", kind: "num" },
      { field: f("UnitName"), path: "itemUnitName", kind: "text" },
      { field: f("Notes"), path: "detailNotes", kind: "text" },
      { field: f("ProcessCategory"), path: "processCategoryName", kind: "text" },
      { field: f("StdCost"), path: "standardCost", kind: "num" },
      { field: f("StdCostDate"), path: "standardCostDate", kind: "date" },
      { field: f("TotalStdCost"), path: "totalStandardCost", kind: "num" },
      { field: f("ProjectNo"), path: "projectNo", kind: "text" },
      { field: f("Department"), path: "departmentName", kind: "text" },
      ...CLS_SLOTS.map((n) => ({ field: f(`Cls${n}`), path: `dataClassification${n}Name`, kind: "text" as const })),
    ],
  };
}

const SECTIONS: SectionSpec[] = [
  costSection("mat", "material", "Bahan Baku", "detailMaterial"),
  costSection("exp", "expense", "Biaya Produksi", "detailExpense"),
  {
    name: "process",
    label: "Proses",
    array: "detailProcess",
    required: [],
    fields: [
      { field: "procCategory", path: "processCategoryName", kind: "text" },
      { field: "procSortNo", path: "sortNumber", kind: "int" },
      { field: "procInstruction", path: "instruction", kind: "text" },
      { field: "procSubCon", path: "subCon", kind: "bool" },
    ],
  },
  {
    name: "extraFinishGood",
    label: "Produk Sampingan",
    array: "detailExtraFinishGood",
    // § dikonfirmasi portal developer live 2026-09-21: itemNo, quantity, portion WAJIB per baris.
    required: ["fgItemNo", "fgQuantity", "fgPortion"],
    fields: [
      { field: "fgItemNo", path: "itemNo", kind: "text" },
      { field: "fgItemName", path: "detailName", kind: "text" },
      { field: "fgQuantity", path: "quantity", kind: "num" },
      { field: "fgUnitName", path: "itemUnitName", kind: "text" },
      { field: "fgNotes", path: "detailNotes", kind: "text" },
      { field: "fgPortion", path: "portion", kind: "num" },
      { field: "fgProjectNo", path: "projectNo", kind: "text" },
      { field: "fgDepartment", path: "departmentName", kind: "text" },
      ...CLS_SLOTS.map((n) => ({ field: `fgCls${n}`, path: `dataClassification${n}Name`, kind: "text" as const })),
    ],
  },
];

const HEADER_FIELDS: FieldSpec[] = [
  { field: "transDate", path: "transDate", kind: "date" },
  { field: "startDate", path: "startDate", kind: "date" },
  { field: "endDate", path: "endDate", kind: "date" },
  { field: "number", path: "number", kind: "text" },
  { field: "workAccountNo", path: "workAccountNo", kind: "text" },
  { field: "billOfMaterialNo", path: "billOfMaterialNo", kind: "text" },
  { field: "branchName", path: "branchName", kind: "text" },
  { field: "description", path: "description", kind: "text" },
  { field: "productItemNo", path: "itemNo", kind: "text" },
  { field: "productQuantity", path: "quantity", kind: "num" },
  { field: "productUnitName", path: "itemUnitName", kind: "text" },
  { field: "secondQualityProductNo", path: "secondQualityProductNo", kind: "text" },
  { field: "varianceAccountNo", path: "varianceAccountNo", kind: "text" },
  { field: "manualClosed", path: "manualClosed", kind: "bool" },
  { field: "manualFinalDate", path: "manualFinalDate", kind: "date" },
];

// Field header yang WAJIB berisi (nilai) di baris pertama tiap dokumen; label = nama kolom Excel untuk pesan galat.
export const WORK_ORDER_HEADER_REQUIRED: { field: string; label: string }[] = [
  { field: "transDate", label: "Transaction Date" },
  { field: "startDate", label: "Start Date" },
  { field: "endDate", label: "End Date" },
  { field: "workAccountNo", label: "Work Acc No" },
  { field: "workOrderType", label: "Work Order Type" },
  { field: "billOfMaterialNo", label: "Bill Material no" },
  { field: "branchName", label: "Branch Name" },
  { field: "productItemNo", label: "Product: Item No" },
  { field: "productQuantity", label: "Product: Qty" },
  { field: "varianceAccountNo", label: "Variance Acc No" },
];

const fieldToAccuratePath: Record<string, string> = {
  workOrderType: "workOrderType",
  personInChargeName: "personInChargeId", // di-resolve worker (wo-pic), bukan dikirim mentah
  ...Object.fromEntries(HEADER_FIELDS.map((f) => [f.field, f.path])),
  ...Object.fromEntries(SECTIONS.flatMap((s) => s.fields.map((f) => [f.field, `${s.array}.${f.path}`]))),
};

export const workOrderMapping = {
  // § hanya field yang HARUS dipetakan kolomnya; kelengkapan NILAI header dicek per grup di worker (header boleh hanya di baris pertama).
  requiredFields: ["transDate", "startDate", "endDate", "workAccountNo", "workOrderType", "billOfMaterialNo", "branchName", "productItemNo", "productQuantity", "varianceAccountNo"] as const,
  fieldToAccuratePath,
  // § URUTAN mengikuti sheet "Work Order" (developmen-15-september-2026.xlsx). Akhiran _1/_2 = hasil dedupe `parseExcelBuffer` untuk
  // nama kolom berulang (kemunculan ke-2/ke-3: biaya produksi / proses / produk sampingan).
  defaultColumnMap: {
    "Transaction Date": "transDate",
    "Trans No": "number",
    "Work Acc No": "workAccountNo",
    "Work Order Type": "workOrderType",
    "Bill Material no": "billOfMaterialNo",
    "Bill Material No": "billOfMaterialNo",
    "Branch Name": "branchName",
    Description: "description",
    "Product: Item No": "productItemNo",
    "Product: Qty": "productQuantity",
    "Product: Unit Name": "productUnitName",
    "Second Quality Product No": "secondQualityProductNo",
    "Variance Acc No": "varianceAccountNo",
    "Manual Closed": "manualClosed",
    "Manual Final Date": "manualFinalDate",
    "PIC ID": "personInChargeName",
    "Start Date": "startDate",
    "End Date": "endDate",
    // bahan baku
    "Item No": "matItemNo",
    "Item Name": "matName",
    Qty: "matQuantity",
    "Unit Name": "matUnitName",
    "Item Notes": "matNotes",
    "Process Category Name": "matProcessCategory",
    "Standard Cost": "matStdCost",
    "Standard Cost Date": "matStdCostDate",
    "Total Standard Cost": "matTotalStdCost",
    "Project No": "matProjectNo",
    "Department Name": "matDepartment",
    CLS1: "matCls1",
    CLS2: "matCls2",
    CLS3: "matCls3",
    // biaya produksi
    "Expense No": "expItemNo",
    "Expense Name": "expName",
    "Expense Qty": "expQuantity",
    "Expense Unit Name": "expUnitName",
    "Expense Notes": "expNotes",
    "Process Category Name_1": "expProcessCategory",
    "Standard Cost_1": "expStdCost",
    "Standard Cost Date_1": "expStdCostDate",
    "Total Standard Cost_1": "expTotalStdCost",
    "Project No_1": "expProjectNo",
    "Department Name_1": "expDepartment",
    CLS1_1: "expCls1",
    CLS2_1: "expCls2",
    CLS3_1: "expCls3",
    // proses
    "Process Category Name_2": "procCategory",
    "Sort No": "procSortNo",
    Instruction: "procInstruction",
    subCon: "procSubCon",
    // produk sampingan
    "Extra FG: Item No": "fgItemNo",
    "Extra FG: Item Name": "fgItemName",
    "Extra FG: Qty": "fgQuantity",
    "Extra FG: Unit Name": "fgUnitName",
    "Extra FG: Notes": "fgNotes",
    "Extra FG:  Notes": "fgNotes",
    "Extra FG: Portion": "fgPortion",
    "Project No_2": "fgProjectNo",
    Department: "fgDepartment",
    CLS1_2: "fgCls1",
    CLS2_2: "fgCls2",
    CLS3_2: "fgCls3",
  } as Record<string, string>,
};

export type WorkOrderField = string;

export type ImportRowRecord = { id: string; rawData: Record<string, unknown> };
export type WorkOrderGroup = { groupKey: string | null; groupColumn: string | null; rows: ImportRowRecord[] };

const EXCEL_EPOCH_UTC_MS = Date.UTC(1899, 11, 30);

// § mirror `toAccurateDate` modul lain.
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

const TRUE_TEXT_VALUES = new Set(["true", "y", "ya", "yes", "1", "x"]);

function toBool(value: unknown): boolean {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value !== 0;
  return TRUE_TEXT_VALUES.has(String(value).trim().toLowerCase());
}

function columnOf(columnMapping: Record<string, string>, field: string): string | null {
  return Object.entries(columnMapping).find(([, f]) => f === field)?.[0] ?? null;
}

function valueOf(rawRow: Record<string, unknown>, field: string, columnMapping: Record<string, string>): unknown {
  const column = columnOf(columnMapping, field);
  if (!column) return undefined;
  const value = rawRow[column];
  if (value === undefined || value === null) return undefined;
  if (typeof value === "string" && value.trim() === "") return undefined;
  return value;
}

function isNumeric(value: unknown): boolean {
  if (typeof value === "number") return Number.isFinite(value);
  return typeof value === "string" && value.trim() !== "" && Number.isFinite(Number(value.trim()));
}

function convert(value: unknown, kind: Kind): unknown {
  switch (kind) {
    case "text":
      return String(value).trim();
    case "num":
      return Number(value);
    case "int":
      return Math.trunc(Number(value));
    case "date":
      return toAccurateDate(value);
    case "bool":
      return toBool(value);
  }
}

export function numberColumnOf(columnMapping: Record<string, string>): string | null {
  return columnOf(columnMapping, "number");
}

function textOf(row: ImportRowRecord, column: string | null): string | null {
  if (!column) return null;
  const value = row.rawData[column];
  if (value === undefined || value === null) return null;
  const trimmed = String(value).trim();
  return trimmed === "" ? null : trimmed;
}

// § grouping DEFAULT ADR-0011 by "Trans No" (`number`, OPSIONAL — kosong = 1 baris = 1 dokumen).
export function groupWorkOrderRows(rows: ImportRowRecord[], columnMapping: Record<string, string>): WorkOrderGroup[] {
  const numberColumn = numberColumnOf(columnMapping);
  const groups: WorkOrderGroup[] = [];
  const byKey = new Map<string, WorkOrderGroup>();
  for (const row of rows) {
    const groupKey = textOf(row, numberColumn);
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

/** Section yang "tersentuh" baris ini = ada kolom section itu yang terisi (dipetakan & tidak kosong). */
function touchedFields(rawRow: Record<string, unknown>, section: SectionSpec, columnMapping: Record<string, string>): FieldSpec[] {
  return section.fields.filter((f) => valueOf(rawRow, f.field, columnMapping) !== undefined);
}

/**
 * Validasi SATU baris (bukan header): tipe dikenali (bila kolomnya terisi) + tiap section yang tersentuh lengkap field wajibnya dan
 * angka-angkanya numerik. Mengembalikan field internal bermasalah (kosong = valid).
 */
export function workOrderRowError(rawRow: Record<string, unknown>, columnMapping: Record<string, string>): string[] {
  const problems = new Set<string>();
  const typeRaw = valueOf(rawRow, "workOrderType", columnMapping);
  if (typeRaw !== undefined && resolveWorkOrderType(typeRaw) === null) problems.add("workOrderType");

  for (const section of SECTIONS) {
    const touched = touchedFields(rawRow, section, columnMapping);
    if (touched.length === 0) continue;
    for (const field of section.required) {
      if (valueOf(rawRow, field, columnMapping) === undefined) problems.add(field);
    }
    for (const spec of touched) {
      if ((spec.kind === "num" || spec.kind === "int") && !isNumeric(valueOf(rawRow, spec.field, columnMapping))) problems.add(spec.field);
    }
  }
  for (const spec of HEADER_FIELDS) {
    if (spec.kind !== "num") continue;
    const value = valueOf(rawRow, spec.field, columnMapping);
    if (value !== undefined && !isNumeric(value)) problems.add(spec.field);
  }
  return [...problems];
}

/**
 * Kelengkapan header SATU dokumen dari baris PERTAMA grup. Mengembalikan label kolom Excel yang kosong/tidak valid
 * (Work Order Type juga harus dikenali).
 */
export function workOrderHeaderMissing(firstRow: Record<string, unknown>, columnMapping: Record<string, string>): string[] {
  return WORK_ORDER_HEADER_REQUIRED.filter(({ field }) => {
    const value = valueOf(firstRow, field, columnMapping);
    if (value === undefined) return true;
    return field === "workOrderType" && resolveWorkOrderType(value) === null;
  }).map(({ label }) => label);
}

/**
 * Konsistensi header antar-baris SATU grup: baris berikutnya boleh mengosongkan header, tapi bila mengisi, nilainya HARUS sama dengan
 * baris pertama — kalau tidak, dokumen yang berbeda tergabung diam-diam. Mengembalikan pesan galat atau null.
 */
export function validateGroupConsistency(group: WorkOrderGroup, columnMapping: Record<string, string>): string | null {
  const first = group.rows[0];
  if (!first) return null;
  const guarded: [string, string][] = [
    ["workOrderType", "Work Order Type"],
    ["billOfMaterialNo", "Bill Material no"],
    ["productItemNo", "Product: Item No"],
    ["branchName", "Branch Name"],
  ];
  const normalize = (rawRow: Record<string, unknown>, field: string) => {
    const value = valueOf(rawRow, field, columnMapping);
    if (value === undefined) return null;
    return field === "workOrderType" ? (resolveWorkOrderType(value) ?? String(value).trim().toLowerCase()) : String(value).trim().toLowerCase();
  };
  for (const row of group.rows.slice(1)) {
    for (const [field, label] of guarded) {
      const firstValue = normalize(first.rawData, field);
      const value = normalize(row.rawData, field);
      if (value !== null && value !== firstValue) {
        return `${label} tidak konsisten dalam satu Trans No (baris ${row.id}) — baris berikutnya boleh dikosongkan, tapi kalau diisi harus sama dengan baris pertama.`;
      }
    }
  }
  return null;
}

/** Entri satu section dari satu baris, atau null bila baris itu tidak menyentuh section tsb. */
function buildSectionEntry(rawRow: Record<string, unknown>, section: SectionSpec, columnMapping: Record<string, string>): Record<string, unknown> | null {
  const touched = touchedFields(rawRow, section, columnMapping);
  if (touched.length === 0) return null;
  const entry: Record<string, unknown> = {};
  for (const spec of touched) entry[spec.path] = convert(valueOf(rawRow, spec.field, columnMapping), spec.kind);
  return entry;
}

// § 1 grup = 1 Work Order. Header dari baris PERTAMA; 4 array SELALU dikirim (kosong bila tidak ada entri) — `branchId` &
// `personInChargeId` ditambahkan worker setelah lookup Accurate.
export function buildWorkOrderPayload(rawRows: Record<string, unknown>[], columnMapping: Record<string, string>): Record<string, unknown> {
  const first = rawRows[0] ?? {};
  const type = resolveWorkOrderType(valueOf(first, "workOrderType", columnMapping));
  const payload: Record<string, unknown> = { workOrderType: type ?? "" };
  for (const spec of HEADER_FIELDS) {
    const value = valueOf(first, spec.field, columnMapping);
    if (value !== undefined) payload[spec.path] = convert(value, spec.kind);
  }
  for (const section of SECTIONS) {
    payload[section.array] = rawRows
      .map((row) => buildSectionEntry(row, section, columnMapping))
      .filter((entry): entry is Record<string, unknown> => entry !== null);
  }
  return payload;
}

/** Nama PIC dari baris pertama (kolom "PIC ID"), atau null. Nilai numerik murni dianggap ID PIC Accurate langsung (lihat worker). */
export function extractPersonInCharge(firstRow: Record<string, unknown>, columnMapping: Record<string, string>): string | null {
  const value = valueOf(firstRow, "personInChargeName", columnMapping);
  if (value === undefined) return null;
  const text = String(value).trim();
  return text === "" ? null : text;
}

/** Nilai Kategori Keuangan (slot 1-3) satu baris dari SEMUA section — dipakai `ensureWorkOrderDataClassifications` (worker). */
export function extractDataClassificationValues(rawRow: Record<string, unknown>, columnMapping: Record<string, string>): { index: number; name: string }[] {
  const result: { index: number; name: string }[] = [];
  for (const section of SECTIONS) {
    for (const n of CLS_SLOTS) {
      const field = section.fields.find((f) => f.path === `dataClassification${n}Name`);
      if (!field) continue;
      const value = valueOf(rawRow, field.field, columnMapping);
      if (value === undefined) continue;
      const name = String(value).trim();
      if (name !== "") result.push({ index: n, name });
    }
  }
  return result;
}
