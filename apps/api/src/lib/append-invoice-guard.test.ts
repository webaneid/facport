import { describe, test, expect } from "bun:test";
import { isCoincidentalDuplicateAcrossBatches } from "./append-invoice-guard";

// § Fase 67 — bug produksi nyata: client isi PPN/Atribut Tambahan di
// batch baru yang KEBETULAN item+harga+qty-nya sama persis dengan batch
// test sebelumnya (Trans No sama) — `save.do` di-skip TOTAL (idempotent
// guard retry-safety Fase 08/09 salah sasaran), field baru TIDAK PERNAH
// terkirim ke Accurate, tapi batch tetap dilaporkan "success". Dibuktikan
// nyata: 2 batch beda (`de033564...`, `977775bc...`) hasilkan
// `accurate_transaction_id`/`accurate_detail_item_id` IDENTIK.
describe("isCoincidentalDuplicateAcrossBatches", () => {
  test("match dari BATCH LAIN + tidak ada baris baru -> TRUE (bukan retry, kemungkinan besar batch baru yang kebetulan identik)", () => {
    expect(
      isCoincidentalDuplicateAcrossBatches({ newRowsCount: 0, existingBatchId: "batch-lama", currentBatchId: "batch-baru" }),
    ).toBe(true);
  });

  test("match dari BATCH YANG SAMA + tidak ada baris baru -> FALSE (retry-safety asli, partial completion dalam 1 batch — behavior lama TETAP)", () => {
    expect(
      isCoincidentalDuplicateAcrossBatches({ newRowsCount: 0, existingBatchId: "batch-x", currentBatchId: "batch-x" }),
    ).toBe(false);
  });

  test("ADA baris baru untuk dikirim -> FALSE walau match dari batch lain (ini genuine append, bukan duplikat total)", () => {
    expect(
      isCoincidentalDuplicateAcrossBatches({ newRowsCount: 2, existingBatchId: "batch-lama", currentBatchId: "batch-baru" }),
    ).toBe(false);
  });

  test("ADA baris baru untuk dikirim + batch sama juga FALSE", () => {
    expect(
      isCoincidentalDuplicateAcrossBatches({ newRowsCount: 1, existingBatchId: "batch-x", currentBatchId: "batch-x" }),
    ).toBe(false);
  });
});
