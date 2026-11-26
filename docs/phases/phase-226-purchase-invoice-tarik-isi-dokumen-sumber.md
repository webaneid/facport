# Fase 226 — Faktur Pembelian: tarik isi Penerimaan Barang / PO cukup dengan nomornya

**Status:** Done, dirilis v2.54.0 (2026-11-26); terbukti ke Accurate dev
**Mulai:** 2026-11-26

## Tujuan
Konsep sama dengan Fase 225/198. Prioritas sumber: Receive Item > PO (aturan Accurate). Purchase Requisition di luar scope.

## Scope
- [x] Tahap 0 — uji nyata: bentuk respons, ID baris (`receiveItemDetailId`/`purchaseOrderDetailId`), sisa setelah ditagih sebagian
- [x] Tahap A — kode + tes (perhatikan: append ke faktur existing, pemetaan id baris untuk Batal Import, baris hanya-Beban)
- [x] Tahap B — typecheck, tes, security review, dokumen

## Checklist Sebelum Ditutup
- [x] Typecheck, security review, PROGRESS

## Temuan Tahap 0
- PI dari PO: tanpa `purchaseOrderDetailId` baris kembar tertaut ke baris pertama; dengan ID tepat. Faktur langsung dari PO mengurangi `availableQuantity` PO.
- PI dari Receive Item: `availableQuantity` terbaca, `receiveItemDetailId` tepat, faktur berlebih ditolak Accurate.
- Accurate menolak faktur langsung dari PO yang sudah ada Penerimaan Barang.
- Accurate kadang menolak sesaat setelah transaksi: "Proses perhitungan biaya barang belum selesai".

## Aturan
Nomor Receive Item (menang) atau PO terisi + kolom barang kosong → semua sisa. Isian Excel menang. Tetap wajib: Date, Vendor No, nomor transaksi (Bill No sesuai ketentuan Accurate). Batch berisi baris ini berurutan. Kode: `source-doc-lines.ts` (dipakai bersama Fase 225).

## Security review (inline)
0 Critical/High: tidak ada endpoint baru; nomor dikirim lewat URLSearchParams; batas 500 baris per dokumen.

## Known Limitations
- Tidak bisa ditambahkan ke faktur yang SUDAH ada (append ditolak jelas).
- Bila simpan timeout padahal faktur jadi, Retry tidak mengadopsi otomatis (muncul galat; cek di Accurate).
- Beban (Expense) di PO tidak ikut ditarik.
- Baris manual dengan Item No kembar tetap tertaut ke baris pertama.
- Multi satuan dan upload lewat browser belum diuji.
