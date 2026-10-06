# Fase 171 — Delivery Order: Sales Order Detail ID Otomatis via Atribut Tambahan 1 (Week) + Bersihkan Sel

**Status:** In Progress
**Mulai:** 2026-10-06
**Selesai:** —

## Latar & Temuan
Fase 158 membuat Facport mencari `salesOrderDetailId` otomatis, dan membedakan Item No kembar dalam 1 SO lewat **CLS5** (asumsi dari bongkar alat lama client). Client (2026-10-06) menjelaskan: label "Week 1/2" pada SO ada di **Atribut Tambahan 1 / Custom Character 1** (`charField1`) baris SO, BUKAN CLS5. Akibatnya resolver Fase 158 tidak pernah cocok untuk data client, dan client terpaksa VLOOKUP manual (kunci `SO & Description` di sheet bantu, hasilnya diketik ke kolom "Sales Order Detail ID"). File contoh (`Sample_Format_DO_v8`): Week diketik di kolom DO **Item Notes**; Item No punya karakter baris baru di depan (`"\\n9900016"`) yang membuat pencocokan persis gagal.

## Tujuan
Client cukup MENGOSONGKAN "Sales Order Detail ID" — Facport mencocokkan Item No + Week ke baris SO sendiri, tanpa VLOOKUP/aplikasi bantu/kolom kunci.

## Aturan
- Item No hanya sekali di SO → langsung dipakai (seperti sekarang).
- Item No kembar → disaring: CLS5 (kalau terisi, perilaku lama, dicocokkan ke CLS5 SO) lalu **Item Notes DO = `charField1` SO** (tanpa beda huruf besar-kecil & spasi berlebih). Sisa ≠ 1 → gagal jelas.
- Sel dibersihkan: spasi/baris baru di ujung semua nilai teks; Item No & No SO juga spasi di dalam (mis. `"\\n9900016"` → `"9900016"`).
- Dua baris DO yang menunjuk baris SO yang SAMA → ditolak (1 baris SO tidak boleh ditarik dua kali).
- Logika dipindah ke fungsi murni yang menerima `fetchCandidates` (testable); worker memakainya (sebelumnya ada 2 salinan aturan: inline di worker + fungsi murni).
- Tidak butuh scope baru (`GET sales-order/detail.do` sudah terdaftar untuk `delivery_order`). `delivery-order/save.do` tidak punya `charField*`, jadi Week hanya kunci pencarian, tidak dikirim.

## Scope
- [ ] `accurate-sales-order.ts` — baca `charField1` baris SO.
- [ ] `delivery-order.mapping.ts` — bersihkan sel; resolver murni baru (Item No + CLS5 + Item Notes↔charField1), guard detail ganda, `resolveDetailIdsInPayload`.
- [ ] Worker memakai fungsi murni (hapus salinan inline).
- [ ] Template guide DO (Item Notes, Sales Order Detail ID).
- [ ] Test (termasuk data client) + dokumentasi (`architecture-delivery-order.md`, koreksi asumsi CLS5).

## Known Limitations
(isi saat Done)

## Ringkasan Hasil
(isi saat Done)
