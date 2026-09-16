# Fase 131 — Durasi & Tanggal di Invoice (PDF + Dialog Admin)

**Status:** Done
**Mulai:** 2026-09-17
**Selesai:** 2026-09-17

## Tujuan
Bagian 2.3 dari audit Part 2 (permintaan user 2026-09-17). Invoice (PDF
`GET /invoices/:id/pdf`, dialog "Detail Invoice" admin) sama sekali tidak
menampilkan durasi paket atau tanggal mulai/berakhir subscription — cuma
label+harga. User eksplisit minta ini "jelas tertera di invoice, baik
invoice user maupun admin" (satu generator PDF yang sama dipakai kedua
sisi, jadi 1 perbaikan menutup keduanya).

## Scope
- [x] Migration `0026_smart_johnny_storm.sql` — `invoice_items.duration_days
      integer NOT NULL` (ADD COLUMN nullable → UPDATE...FROM plans backfill
      → SET NOT NULL), dijalankan sukses di dev DB.
- [x] `apps/api/src/lib/invoice-order.ts` — snapshot `durationDays` saat
      invoice dibuat, `PlanRow` type diperluas.
- [x] `apps/api/src/lib/invoice-helpers.ts` — fungsi baru
      `attachSubscriptionDates()` (live join `subscriptions` via
      `invoiceItemId`), `groupIdenticalInvoiceItems` bawa `durationDays` +
      `subscriptionStartAt`/`subscriptionEndAt` lewat grouping.
- [x] `apps/api/src/routes/invoices.route.ts` (`GET /invoices/:id/pdf`) —
      pakai `attachSubscriptionDates` sebelum `groupIdenticalInvoiceItems`.
- [x] `apps/api/src/routes/admin/invoices.route.ts` (`GET /admin/invoices`)
      — batch `attachSubscriptionDates` lintas semua invoice di list
      (bukan N+1), regroup per invoiceId.
- [x] `apps/api/src/lib/invoice-pdf.tsx` — render "Durasi: X · Berlaku:
      Y – Z" (atau "menunggu pembayaran") per item.
- [x] `apps/web/app/admin/(protected)/invoices/page.tsx` (dialog) — render
      info yang sama, RAW per-item (bukan grouped).
- [x] Test — `invoice-helpers.test.ts` (fixture + 1 test baru khusus
      subscription dates), 5 file test lain diupdate (fixture
      `insert(invoiceItems)` butuh `durationDays` sekarang NOT NULL).

## Referensi
- Architecture doc: `docs/architecture/architecture-invoice.md`
- Plan lengkap (3 fase, 130-132): `/Users/webane/.claude/plans/polymorphic-dazzling-engelbart.md`

## Keputusan Kecil Selama Eksekusi
- Migration hasil `drizzle-kit generate` awalnya `ADD COLUMN ... NOT NULL`
  polos (akan gagal di tabel yang sudah ada isinya) — di-edit manual jadi
  3 langkah (nullable → backfill UPDATE...FROM plans → SET NOT NULL),
  pola sama backfill kolom NOT NULL lain di project ini.
- `attachSubscriptionDates()` TIDAK melakukan filter ownership sendiri
  (by design — ownership harus SUDAH benar di pemanggil). Diverifikasi
  eksplisit saat security review: `invoices.route.ts` cuma oper item dari
  1 invoice yang sudah lolos ownership check, `admin/invoices.route.ts`
  memang endpoint admin-only lintas-user (`invoices.view`).
- `groupIdenticalInvoiceItems` ambil `subscriptionStartAt`/`subscriptionEndAt`
  dari baris PERTAMA tiap grup (bukan validasi semua baris identik) —
  aman karena N baris seat_addon 1 checkout dikonfirmasi bersamaan.

## Checklist Sebelum Ditutup (sesuai SOP)
- [x] Type check nol error (`bun run typecheck`) — api+web, 0 error
- [x] `bun run lint` — 0 error
- [x] `bun run test` (apps/api) — 1106 pass, 0 fail (1 test baru)
- [x] Security review dijalankan — 0 temuan (ownership sudah benar di
      kedua pemanggil, migration backfill aman karena `plans` tidak
      pernah hard-delete — DELETE endpoint-nya soft `isActive:false`)
- [x] `docs/PROGRESS.md` diupdate

## Known Limitations
- Verifikasi visual: PDF invoice customer BERHASIL diverifikasi langsung
  (fetch `GET /invoices/:id/pdf` via browser, render "Durasi: 1 Tahun ·
  Berlaku: 14 September 2026 – 09 September 2027" persis sesuai
  subscription aktual). Dialog "Detail Invoice" ADMIN tidak terverifikasi
  visual (kredensial login admin dev environment stale, sama known
  limitation Fase 130) — diganti code review, pola rendering IDENTIK
  dengan yang sudah dikonfirmasi benar di PDF (`formatDate`/`formatDuration`
  yang sama, field API yang sama).

## Ringkasan Hasil
Invoice (PDF, dipakai SAMA oleh customer & admin lewat 1 generator) dan
dialog "Detail Invoice" admin sekarang menampilkan durasi paket +
tanggal berlaku aktual per item. Durasi di-snapshot (konsisten prinsip
`label`/`price`), tanggal di-live-join ke `subscriptions` (supaya
otomatis reflect perpanjangan admin). Migration baru
(`invoice_items.duration_days`) sudah di-backfill & diverifikasi di dev DB.
