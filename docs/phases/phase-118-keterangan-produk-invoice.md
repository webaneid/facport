# Fase 118 — Keterangan Produk/Data Usaha/Modul/Sub-Modul di Invoice

**Status:** Done
**Mulai:** 2026-09-14
**Selesai:** 2026-09-14

## Tujuan
Fase 117 menambah dimensi Produk (`productLine`) di data model, tapi TIDAK
ada UI yang menampilkannya (known limitation eksplisit). User minta
ditutup: admin harus bisa lihat jelas di invoice — customer beli **Produk**
apa (Facport/Konverter/AutoProduksi), untuk **Data Usaha** mana, **Modul**
apa (kategori, mis. Penjualan), **Sub-modul** apa (varian konkret, mis.
Sales Invoice) — baik di panel admin (list + detail invoice) MAUPUN di
PDF invoice yang diunduh/dikirim ke customer. Data-nya SUDAH tersimpan di
DB sejak Fase 117 (`orders.dataUsahaId`, `invoiceItems.productLine`/
`moduleKey`) — fase ini MURNI kerja surfacing (query join + tampilan),
TIDAK ada migration/schema baru.

## Scope
- [x] `apps/api/src/lib/module-catalog.ts` — helper `productLineLabel()` +
      cara resolve kategori (Modul) dari `moduleKey`
- [x] `apps/api/src/lib/invoice-helpers.ts` — `groupIdenticalInvoiceItems`
      bawa serta `moduleKey`/`productLine` (bukan cuma label/price)
- [x] `apps/api/src/lib/invoice-pdf.tsx` — tampilkan Data Usaha (1x per
      invoice) + Produk/Modul/Sub-modul (per baris item)
- [x] `apps/api/src/routes/invoices.route.ts` — join `dataUsaha` di
      endpoint PDF (`GET /invoices/:id/pdf`), pakai untuk `dataUsahaName`
- [x] `apps/api/src/routes/admin/invoices.route.ts` — join `dataUsaha` di
      `GET /admin/invoices` (list), attach `dataUsahaId`/`dataUsahaName`
- [x] `apps/web/lib/module-options.ts` — re-export helper resolve label
      Produk/Modul(kategori) dari `module-catalog.ts`
- [x] `apps/web/app/admin/(protected)/invoices/page.tsx` — kolom Data
      Usaha di tabel list, info Produk/Modul/Sub-modul jelas di dialog
      Detail Invoice per baris item

## Referensi
- Architecture doc yang diupdate: `docs/architecture/architecture-invoice.md`
- Fondasi data yang dipakai (TANPA schema baru): `docs/decisions/adr-0033-ekspansi-multi-produk-facport.md`, `docs/architecture/architecture-product-lines.md`

## Keputusan Kecil Selama Eksekusi
- Scope disepakati via `AskUserQuestion`: panel admin (list+detail) DAN
  PDF invoice (dipakai admin maupun customer download) — BUKAN halaman
  daftar invoice customer sendiri (`GET /me/invoices` list HTML, di luar
  scope, tidak diminta eksplisit).
-

## Checklist Sebelum Ditutup (sesuai SOP)
- [x] Type check nol error (`bun run typecheck`) — apps/api & apps/web.
- [x] Security review dijalankan (skill `security-review`).
- [x] Temuan Critical/High sudah diperbaiki (atau tidak ada temuan) — 0 temuan.
- [x] Temuan Medium/Low dicatat di `docs/lessons-learned.md` kalau ditunda
      — tidak ada yang ditunda.
- [x] `docs/PROGRESS.md` diupdate

## Known Limitations
- Halaman daftar invoice customer sendiri (`GET /me/invoices`, halaman HTML
  bukan PDF) TIDAK ikut menampilkan Data Usaha/Produk — sengaja di luar
  scope (dikonfirmasi via `AskUserQuestion`, cuma admin panel + PDF).
- Kalau nanti Konverter/AutoProduksi punya Varian nyata dengan `category`
  berbeda dari 5 kategori Facport sekarang, label "Modul" di invoice akan
  otomatis ikut benar (resolve dari `module-catalog.ts` live) — TIDAK perlu
  perubahan kode tambahan, cukup dicatat sebagai catatan forward-compat.

## Ringkasan Hasil
Menutup known limitation eksplisit Fase 117 ("belum ada UI yang
menampilkan `productLine`"). User awalnya cuma minta "info Produk jelas di
invoice", ternyata setelah digali (`AskUserQuestion`) juga minta Data
Usaha + Modul + Sub-modul sekaligus, DAN scope-nya bukan cuma panel admin
tapi juga PDF invoice yang di-download/dikirim ke customer.

Investigasi awal (baca kode langsung, bukan asumsi) menemukan data yang
dibutuhkan SUDAH tersimpan lengkap sejak Fase 117
(`orders.dataUsahaId`, `invoiceItems.productLine`/`moduleKey`) — gap-nya
murni di lapisan tampilan: `GET /admin/invoices` tidak join ke nama Data
Usaha, dan UI (tabel list, dialog detail, PDF) tidak merender info itu
sama sekali. Fase ini MURNI kerja surfacing — 0 migration/kolom baru.

Perubahan: 2 helper baru di `module-catalog.ts` (`productLineLabel`,
`moduleCategory`) + re-export ke web; `groupIdenticalInvoiceItems` bawa
serta `moduleKey`/`productLine` lewat grouping; join `data_usaha` di 2
endpoint (`GET /invoices/:id/pdf`, `GET /admin/invoices`, keduanya
di-scope dari order yang sudah ownership-verified, tidak ada celah IDOR);
render di admin panel (kolom Data Usaha di tabel + baris Produk·Modul·
Sub-modul di dialog detail) dan PDF (baris "Data Usaha: X" + anak-kalimat
kecil per item).

**Hasil verifikasi**: `bun run typecheck` 0 error, `bun run test` 782
pass/0 fail (1 baru), `bun run lint` 0 error/0 warning, security review 0
temuan. **Verifikasi manual browser (Claude in Chrome) dilakukan
end-to-end** memakai data invoice REAL yang sudah ada di dev DB lokal
(bukan data test buatan) — dikonfirmasi visual: tabel list menampilkan
kolom "DATA USAHA" dengan benar ("FAC Institute"), dialog Detail Invoice
menampilkan "DATA USAHA: FAC Institute" + baris item dengan anak-kalimat
"Facport · Penjualan · Sales Receipt (Customer Receipt)", dan PDF
(didownload via tombol admin) menampilkan persis info yang sama di kedua
lokasi (blok Ditagihkan Kepada + anak-kalimat kecil di bawah item).
