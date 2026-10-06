# Fase 170 — Sales Return & Purchase Return: Harga (dan Diskon) dari Faktur Asal

**Status:** In Progress
**Mulai:** 2026-10-06
**Selesai:** —

## Tujuan
`unitPrice` WAJIB di `detailItem` Sales Return dan Purchase Return (spec Accurate), sementara retur lazimnya memakai harga faktur asal. Membuat kolom "Unit Price" boleh kosong akan mengirim 0 (data akuntansi salah) — jadi harga diambil dari FAKTUR ASAL (`invoiceNumber`) di Accurate saat kosong.

## Aturan (diputuskan user 2026-10-06)
- Hanya `returnType` **INVOICE / INVOICE_DP** dengan **Invoice No terisi**. Baris dengan **Unit Price kosong** → harga diambil dari baris faktur dengan **Item No yang sama**; Unit Price terisi → dipakai apa adanya.
- **Diskon baris faktur ikut disalin** (penting): `itemDiscPercent` apa adanya (persen tidak bergantung qty); `itemCashDiscount` (nominal untuk qty PENUH baris faktur) di-pro-rata ke qty retur = nominal ÷ qty faktur × qty retur. Hanya diisi kalau KEDUA kolom diskon di Excel kosong (diskon di Excel = Excel menang).
- `returnType` DELIVERY (Sales Return) / RECEIVE (Purchase Return) / NO_INVOICE: tidak ada harga di dokumen itu → **Unit Price tetap wajib manual**.
- Gagal jelas (tidak pernah kirim 0): barang tidak ada di faktur; barang sama di beberapa baris faktur dengan harga/diskon BERBEDA (ambigu); faktur tidak ketemu/tidak terbaca.
- Purchase Return ikut dalam fase yang sama (infrastruktur sama; `getPurchaseInvoiceDetail` sudah ada). Kolom diskon (`Item Cash Disc`, `Item Disc (%)`) DITAMBAHKAN ke Purchase Return (sebelumnya tidak ada; API mendukung).
- Scope `sales_invoice_view` (Sales Return) dan `purchase_invoice_view` (Purchase Return) WAJIB (kebijakan: perluas scope & OAuth ulang tidak masalah, [[feedback_scope_expansion_and_reoauth_ok]]) — digabung satu putaran dengan `sales_quotation_view` Fase 169.

## Scope
- [ ] Registri endpoint: `GET sales-invoice/detail.do` → `sales_return`; `GET purchase-invoice/detail.do` → `purchase_return`.
- [ ] Pembaca baris faktur by `number` (`accurate-sales-invoice.ts`, `accurate-purchase-invoice.ts`), parse ketat.
- [ ] Inti murni `import-mapping/return-from-invoice.ts` (pilih baris faktur, pro-rata diskon, error ambigu) + wrapper per modul.
- [ ] Mapping SR/PR: `isInvoiceReturnRow`, `missingRequiredFieldsForRow`, isi harga di payload; PR: kolom diskon baru.
- [ ] Worker `processSalesReturnGroup` / `processPurchaseReturnGroup`.
- [ ] Route edit baris & edit massal (SR & PR) memakai `missingRequiredFieldsForRow`.
- [ ] Web: dialog edit, grid edit massal, label dropdown mapping, template guide (SR & PR).
- [ ] Test + dokumentasi.

## Referensi
- `docs/architecture/architecture-sales-return.md`, `architecture-purchase-return.md` § "Fase 170"
- Preseden: Fase 169 (Sales Order ← Sales Quotation), Fase 158 (Delivery Order ← Sales Order)

## Keputusan Kecil Selama Eksekusi
- (diisi saat eksekusi)

## Checklist Sebelum Ditutup (sesuai SOP)
- [ ] Type check nol error (`bun run typecheck`)
- [ ] Security review dijalankan (skill `security-review`)
- [ ] Temuan Critical/High sudah diperbaiki (atau tidak ada temuan)
- [ ] Temuan Medium/Low dicatat di `docs/lessons-learned.md` kalau ditunda
- [ ] `docs/PROGRESS.md` diupdate

## Known Limitations
(isi saat fase Done)

## Ringkasan Hasil (isi pas fase Done)
(isi saat fase Done)
