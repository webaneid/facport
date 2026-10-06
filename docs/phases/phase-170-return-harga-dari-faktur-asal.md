# Fase 170 — Sales Return & Purchase Return: Harga (dan Diskon) dari Faktur Asal

**Status:** Done
**Mulai:** 2026-10-06
**Selesai:** 2026-10-06

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
- [x] Registri endpoint: `GET sales-invoice/detail.do` → `sales_return`; `GET purchase-invoice/detail.do` → `purchase_return`.
- [x] Pembaca baris faktur by `number` (`accurate-sales-invoice.ts`, `accurate-purchase-invoice.ts`), parse ketat.
- [x] Inti murni `import-mapping/return-from-invoice.ts` (pilih baris faktur, pro-rata diskon, error ambigu) + wrapper per modul.
- [x] Mapping SR/PR: `isInvoiceReturnRow`, `missingRequiredFieldsForRow`, isi harga di payload; PR: kolom diskon baru.
- [x] Worker `processSalesReturnGroup` / `processPurchaseReturnGroup`.
- [x] Route edit baris & edit massal (SR & PR) memakai `missingRequiredFieldsForRow`.
- [x] Web: dialog edit, grid edit massal, label dropdown mapping, template guide (SR & PR).
- [x] Test + dokumentasi.

## Referensi
- `docs/architecture/architecture-sales-return.md`, `architecture-purchase-return.md` § "Fase 170"
- Preseden: Fase 169 (Sales Order ← Sales Quotation), Fase 158 (Delivery Order ← Sales Order)

## Keputusan Kecil Selama Eksekusi
- Nama kolom diskon Purchase Return mengikuti keluarga Return (`Item Cash Discount`, `Item Cash Disc Percent`, sama dengan Sales Return); nama Purchase Invoice (`Item Cash Disc`, `Item Disc (%)`) diterima sebagai alias.
- Pro-rata diskon nominal memakai qty faktur per baris yang cocok: nominal ÷ qty faktur × qty retur, dibulatkan 6 desimal.
- Ambigu = beberapa baris faktur ber-Item No sama dengan kombinasi (harga, diskon persen, nominal per unit) BERBEDA → gagal; kombinasi sama (mis. barang sama di 2 baris dengan harga & diskon sama) aman.
- Aturan "Unit Price kosong boleh" dinilai per BARIS memakai Return Type & Invoice No baris itu sendiri di sisi UI/edit; di worker memakai header grup (`payload.returnType`/`payload.invoiceNumber`).

## Checklist Sebelum Ditutup (sesuai SOP)
- [x] Type check nol error (`bun run typecheck`)
- [x] Security review dijalankan (skill `security-review`)
- [x] Temuan Critical/High sudah diperbaiki (atau tidak ada temuan)
- [x] Temuan Medium/Low dicatat di `docs/lessons-learned.md` kalau ditunda
- [x] `docs/PROGRESS.md` diupdate

## Known Limitations
- **Bentuk respons `sales-invoice/detail.do` / `purchase-invoice/detail.do` untuk diskon baris BELUM diverifikasi dengan respons asli.** `item.no`, `unitPrice`, `quantity` sudah dipakai di produksi (fitur "tambah ke faktur"), tapi `itemDiscPercent`/`itemCashDiscount` di respons baca belum pernah dilihat (kemungkinan nama sama dengan save.do, bisa juga objek/string lain). Parser KETAT untuk kode barang/harga/qty; diskon yang tak terbaca dianggap tanpa diskon (bukan error) — retest dengan faktur berdiskon sebelum dipakai customer.
- Harga & diskon dihitung dari BARIS faktur; pajak baris (`useTax1..3`), gudang, departemen, atribut tidak disalin (tetap dari Excel).
- Penautan faktur memakai kode barang saja: barang yang sama di beberapa baris faktur dengan harga/diskon berbeda → gagal (tidak menebak).
- Tidak memvalidasi qty retur ≤ qty faktur (Accurate yang menolak).
- `DELIVERY` (Sales Return), `RECEIVE` (Purchase Return), `NO_INVOICE`: Unit Price wajib manual (dokumen asal tak punya harga yang dipakai).
- Scope `sales_invoice_view` & `purchase_invoice_view` WAJIB: customer Sales/Purchase Return yang sudah terhubung diminta "Perbarui izin" (otorisasi ulang mematikan token lama — jangan saat ada import berjalan). Digabung dengan `sales_quotation_view` (Fase 169) dalam satu putaran.

## Ringkasan Hasil
Sales Return dan Purchase Return kini mengambil Unit Price (dan diskon baris) dari faktur asal bila kolom Unit Price dikosongkan pada Return Type INVOICE/INVOICE_DP dengan Invoice No terisi; Unit Price terisi = Excel menang; tipe lain wajib manual; kasus tak pasti (barang tak ada di faktur / ambigu) gagal jelas, tidak pernah 0. Purchase Return mendapat kolom diskon baris baru. Inti murni dipakai bersama (`import-mapping/return-from-invoice.ts`), validasi "wajib" per baris di API dan UI memakai fungsi yang sama. Typecheck 0 error; test baru: 12 (inti), 4 (route edit SR/PR), 3 (mapping PR). Security review: 0 temuan (pola Fase 169, batas 1.000 baris faktur).
