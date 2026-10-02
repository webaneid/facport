# Fase 165 — Batal Import Generik untuk 19 Modul

**Status:** Done
**Mulai:** 2026-10-02
**Selesai:** 2026-10-02

## Tujuan
User: "undo itu harusnya berlaku untuk semua modul bukan cuma 2 modul...
karena ini sifat deskruktif, maka harus ada notifikasi ketika akan
melakukan itu, popup notifikasi, warning keras bahwa dengan melakukan ini
akan menghapus data baik di local facport maupun di accurate." Generalisasi
"Batal Import" (ADR-0013/0014, sebelumnya cuma purchase_invoice/
sales_invoice) ke 19 modul lain yang TIDAK punya kompleksitas merge
lintas-batch. Job Costing (2 dokumen Accurate berurutan) sengaja ditunda
ke fase terpisah — keputusan bertahap, dikonfirmasi user via AskUserQuestion
("Bertahap, 19 modul simpel dulu").

## Scope
- [x] Riset: konfirmasi merge lintas-batch cuma ada di PI/SI (grep
      `findExisting`/append di seluruh `import-mapping/*.ts` & `workers/index.ts`)
- [x] Riset: konfirmasi SEMUA 19 modul punya `delete.do` pasangan dengan
      kontrak identik (`docs/referencehtml/accurate-openapi.json`)
- [x] `apps/api/src/lib/accurate-generic-delete.ts` — wrapper generic +
      `GENERIC_CANCELLABLE_MODULES`
- [x] Cabang generic baru di job `CANCEL_IMPORT` (`workers/index.ts`),
      logic PI/SI lama TIDAK diubah
- [x] 19 route baru `.post(".../cancel", ...)` — owner-gated SEJAK AWAL
      (`ownsDataUsaha`) + cek status batch + cek scope Accurate
- [x] `accurate-endpoint-registry.ts` — `DELETE {path}/delete.do` × 19 modul
- [x] Fix 16 komentar header route yang stale ("TIDAK ADA Batal Import")
- [x] Dialog frontend generic (`generic-cancel-import-dialog.tsx`) dengan
      warning 2-efek eksplisit (Accurate + Facport)
- [x] Update teks warning dialog PI/SI existing ke format yang sama (konsistensi)
- [x] Wire 19 dispatch block ke `import-batch-table.tsx`
- [x] 57 test baru (3 per modul × 19: owner sukses, member 403, status 409)
- [x] ADR-0040 + architecture doc + phase doc

## Referensi
- Architecture doc: `docs/architecture/architecture-batal-import-generic.md`
- ADR: `docs/decisions/adr-0040-batal-import-generik-19-modul.md`

## Keputusan Kecil Selama Eksekusi
- Job worker: cabang generic di-`return` di awal, BUKAN disisipkan ke
  tengah logic PI/SI — supaya logic PI/SI yang sudah teruji empiris tidak
  berisiko regresi.
- Route cancel baru menambah cek `checkSubscriptionScopes` yang PI/SI
  TIDAK punya di endpoint cancel-nya sendiri — perlu karena scope
  `{module}_delete` ini genuinely BARU untuk 19 modul ini (customer
  existing belum tentu punya), beda dari PI/SI yang scope delete-nya
  sudah ada sejak Fase 09.
- Dialog frontend generic terima `onConfirm` callback (bukan index
  string ke Eden client) supaya type-safety end-to-end tetap utuh — 19
  pemanggilan Eden yang benar-benar typed ditulis di `import-batch-table.tsx`.
- Tambah test ke-3 per modul (`BATCH_NOT_CANCELLABLE`) di luar 2 pola
  PI/SI asli (owner/member) — murah ditambah, menutup jalur yang belum
  pernah dites eksplisit di modul manapun untuk endpoint ini.

## Checklist Sebelum Ditutup (sesuai SOP)
- [x] Type check nol error (`bun run typecheck`) — api & web
- [x] Security review dijalankan — subagent `security-auditor`: 0
      Critical, 0 High, 1 Medium, 2 Low (detail § `docs/lessons-learned.md`
      2026-10-02 "Security review Fase 165")
- [x] Temuan Critical/High sudah diperbaiki (tidak ada temuan kategori ini)
- [x] Temuan Medium/Low dicatat di `docs/lessons-learned.md` — Medium
      (batch Cancel bisa macet diam-diam kalau koneksi Accurate hilang
      persis saat job jalan, PRA-EXISTING bukan regresi) dapat FIX
      PARSIAL (`Sentry.captureMessage` ditambah di titik itu); 2 Low
      diterima apa adanya (konsisten pola legacy PI/SI)
- [x] `docs/PROGRESS.md` diupdate

## Known Limitations
- Job Costing belum punya Cancel (2 dokumen Accurate berurutan, order
  hapus belum diverifikasi empiris) — fase terpisah.
- 23 halaman Riwayat per-modul belum dapat tombol Cancel untuk 19 modul
  ini — cuma tabel gabungan (Arsip Import + Dashboard) untuk sekarang.
- Customer existing (koneksi Accurate dari sebelum fase ini) wajib
  reconnect dulu sebelum bisa pakai Cancel di 19 modul ini (scope baru,
  § architecture doc "Rollout Scope").

## Ringkasan Hasil
19 modul (`sales_receipt`, `purchase_payment`, `journal_voucher`,
`other_payment`, `other_deposit`, `purchase_order`, `receive_item`,
`purchase_return`, `sales_quotation`, `sales_order`, `sales_return`,
`delivery_order`, `item_transfer`, `item_requisition`,
`inventory_adjustment`, `roll_over`, `work_order`, `material_slip`,
`finished_good_slip`) sekarang punya "Batal Import" via 1 fungsi delete
generic + 1 dialog frontend generic, bukan 19× kode duplikat. Typecheck
0 error (api+web), lint bersih, test API 1742→1799 pass (+57, 0 fail),
test web 304 pass (0 fail). Dev DB dibersihkan 2× (sebelum & sesudah full
run) via scratchpad cleanup script.
