# Fase 158 — Delivery Order: Auto-Resolve Sales Order Detail ID Server-Side

**Status:** Done
**Mulai:** 2026-09-24
**Selesai:** 2026-09-24

## Tujuan
Fase 157 menunda pengiriman kolom "Sales Order Detail ID" ke Accurate
karena field-nya tidak terdokumentasi resmi. Reverse-engineering legacy
tool client sendiri (facport.com, FAC Institute — alat yang sedang
digantikan project ini) menemukan alur manual mereka (cek halaman "Sales
Order Item Check" → VLOOKUP Excel manual, ItemNo+CLS5/"Week" sebagai kunci)
— fase ini menggantinya dengan **resolusi otomatis di server**, jadi user
Facport TIDAK PERNAH perlu tahu apa itu "Sales Order Detail ID" sama sekali.

## Scope
- [x] `apps/api/src/lib/accurate-sales-order.ts` — `getSalesOrderDetailByNumber` (GET `sales-order/detail.do`)
- [x] `apps/api/src/lib/import-mapping/delivery-order.mapping.ts` — `resolveSalesOrderDetailId` (pure matching logic) + hapus mekanisme `DEFERRED_FIELDS` (tidak dipakai lagi)
- [x] `apps/api/src/workers/index.ts` — `resolveSalesOrderDetailIds` (orchestrator: dedupe fetch per SO, panggil sebelum `saveDeliveryOrder`)
- [x] `apps/api/src/lib/accurate-endpoint-registry.ts` — tambah `GET sales-order/detail.do` ke entry `delivery_order`
- [x] Frontend: update label combobox + hint (`salesOrderDetailId` bukan lagi "BELUM AKTIF", jadi "opsional — auto")
- [x] **Verifikasi test call NYATA** ke `sales-order/detail.do` (Data Usaha "Webane Indonesia", db "Retail Demo", akun `kurikulum.fac@gmail.com`) — pakai SO nyata `SO-IDR-01` (2 baris `itemNo` duplikat) untuk konfirmasi struktur respons
- [x] Test: 5 test baru untuk `resolveSalesOrderDetailId` (unik/duplikat/week cocok/week tidak diisi/week tidak cocok) + update 1 test lama yang perilakunya berubah
- [x] Typecheck + lint + test penuh
- [x] Security review ringan
- [x] `docs/architecture/architecture-delivery-order.md` diupdate
- [x] `docs/lessons-learned.md` — catat temuan legacy tool + hasil verifikasi

## Referensi
- Architecture doc: `docs/architecture/architecture-delivery-order.md` § "Fase 158"
- Phase sebelumnya: `docs/phases/phase-157-delivery-order.md`
- Pola normalisasi respons: `accurate-purchase-invoice.ts` § `getPurchaseInvoiceDetail` (ADR-0012)

## Keputusan Kecil Selama Eksekusi
- **Logic matching dipisah jadi pure function** (`resolveSalesOrderDetailId`
  di `delivery-order.mapping.ts`, bukan langsung di `workers/index.ts`) —
  supaya bisa ditest tanpa mock HTTP, konsisten konvensi project (I/O ke
  Accurate diverifikasi test call nyata, logic keputusan murni ditest unit).
- **`salesOrderDetailId` TETAP bisa diisi manual** (override) — kalau
  auto-resolve gagal/ambigu ATAU user sudah punya data dari tool lama,
  isi manual tetap dihormati (auto-resolve SKIP kalau field sudah terisi).
- **Disambiguasi WAJIB tepat 1 kandidat, kalau tidak LEMPAR ERROR** —
  tidak pernah "lewatkan diam-diam tanpa Detail ID" (itu justru bug yang
  mau dicegah). Konsisten filosofi "aman, bukan tebak" (ADR-0013).
- **Scope SENGAJA cuma Delivery Order** (keputusan eksplisit user: "focus
  ke DO dulu ajah") — pola yang sama (fetch detail dokumen sumber, cocokkan
  itemNo+disambiguator, auto-resolve) BISA di-copy ke Purchase Invoice←
  Receive Item (paling siap, `receiveItemDetailId` sudah dikonfirmasi
  Accurate Support) begitu Delivery Order terbukti jalan di production —
  TIDAK dikerjakan bersamaan fase ini.

## Checklist Sebelum Ditutup (sesuai SOP)
- [x] Type check nol error (`bun run typecheck`)
- [x] Security review dijalankan (skill `security-review`)
- [x] Temuan Critical/High — tidak ada.
- [x] Temuan Medium/Low — tidak ada.
- [x] `docs/PROGRESS.md` diupdate

## Known Limitations
- **Bentuk `dataClassification5` saat CLS5 benar-benar terisi belum ada
  data uji** — semua Sales Order di database "Retail Demo" yang dites
  (`SO-IDR-01`, `SO001`, `SO.2026.09.00001`, `SO.2016.12.00003`, dst)
  punya `dataClassification5: null`. Struktur objek `{id, name}` DIASUMSIKAN
  dari konsistensi pola field relasi lain di respons yang sama (`item`,
  `tax1`, `warehouse`), BUKAN dikonfirmasi langsung dengan data terisi.
  Kalau nanti resolusi CLS5 gagal di production, cek dulu bentuk field ini.
- **CLS2/CLS5 versi header** — masih menunggu klarifikasi client, belum
  ada kandidat field Accurate.
- **6 relasi lintas-dokumen lain** dengan potensi bug serupa — technical
  debt, di luar scope fase ini per keputusan eksplisit user.

## Ringkasan Hasil
Fitur auto-resolve `Sales Order Detail ID` selesai dibangun & diverifikasi
dengan test call NYATA ke Accurate (bukan tebakan) — ditemukan via
reverse-engineering legacy tool client sendiri yang ternyata cuma
pass-through manual (bukti: user WAJIB VLOOKUP Excel sebelum upload).
Facport sekarang resolve otomatis: `itemNo` unik di SO → langsung ambil ID
barisnya; `itemNo` duplikat → cocokkan juga CLS5 (label "Week N" ala
client), atau lempar error jelas kalau tidak bisa dipastikan. Struktur
respons `sales-order/detail.do` (`detailItem[].id` per-baris, `item.no`
nested) terverifikasi via 2 Sales Order nyata dengan `itemNo` duplikat
(`SO-IDR-01`: id 102300/102301, `SO001`: id 101950/101951). Typecheck 0
error, lint bersih, test API 1658 pass (+5)/0 fail, test web 268 pass/0
fail. Security review: 0 Critical/High/Medium. Scope sengaja dibatasi
Delivery Order saja — pola ini siap di-copy ke Purchase Invoice←Receive
Item setelah production membuktikan fitur ini jalan baik.
