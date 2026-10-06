# Fase 171 — Delivery Order: Sales Order Detail ID Otomatis via Atribut Tambahan 1 (Week) + Bersihkan Sel

**Status:** Done
**Mulai:** 2026-10-06
**Selesai:** 2026-10-06

## Latar & Temuan
Fase 158 membuat Facport mencari `salesOrderDetailId` otomatis, dan membedakan Item No kembar dalam 1 SO lewat **CLS5** (asumsi dari bongkar alat lama client). Client (2026-10-06) menjelaskan: label "Week 1/2" pada SO ada di **Atribut Tambahan 1 / Custom Character 1** (`charField1`) baris SO, BUKAN CLS5. Akibatnya resolver Fase 158 tidak pernah cocok untuk data client, dan client terpaksa VLOOKUP manual (kunci `SO & Description` di sheet bantu, hasilnya diketik ke kolom "Sales Order Detail ID"). File contoh (`Sample_Format_DO_v8`): Week diketik di kolom DO **Item Notes**; Item No punya karakter baris baru di depan (`"\\n9900016"`) yang membuat pencocokan persis gagal.

## Tujuan
Client cukup MENGOSONGKAN "Sales Order Detail ID" — Facport mencocokkan Item No + Week ke baris SO sendiri, tanpa VLOOKUP/aplikasi bantu/kolom kunci.

## Aturan
- Item No hanya sekali di SO → langsung dipakai (seperti sekarang).
- Item No kembar → disaring: CLS5 (kalau terisi, perilaku lama, dicocokkan ke CLS5 SO) lalu **Item Notes DO = `charField1` SO** (tanpa beda huruf besar-kecil & spasi berlebih). Sisa ≠ 1 → gagal jelas.
- Sel dibersihkan: spasi/baris baru di ujung semua nilai teks; Item No & No SO juga spasi di dalam (mis. `"\\n9900016"` → `"9900016"`).
- ~~Dua baris DO yang menunjuk baris SO yang sama ditolak~~ — DIBATALKAN saat eksekusi: pengiriman sebagian dari baris SO yang sama (mis. 2 gudang berbeda dalam 1 DO) bisa sah; pengaman itu akan memblokir kasus valid.
- Logika dipindah ke fungsi murni yang menerima `fetchCandidates` (testable); worker memakainya (sebelumnya ada 2 salinan aturan: inline di worker + fungsi murni).
- Tidak butuh scope baru (`GET sales-order/detail.do` sudah terdaftar untuk `delivery_order`). `delivery-order/save.do` tidak punya `charField*`, jadi Week hanya kunci pencarian, tidak dikirim.

## Scope
- [x] `accurate-sales-order.ts` — baca `charField1` baris SO.
- [x] `delivery-order.mapping.ts` — bersihkan sel; resolver murni baru (Item No + CLS5 + Item Notes↔charField1), guard detail ganda, `resolveDetailIdsInPayload`.
- [x] Worker memakai fungsi murni (hapus salinan inline).
- [x] Template guide DO (Item Notes, Sales Order Detail ID).
- [x] Test (termasuk data client) + dokumentasi (`architecture-delivery-order.md`, koreksi asumsi CLS5).

## Known Limitations
- **Nama field BACA `charField1` di respons `sales-order/detail.do` belum diverifikasi** (diasumsikan sama dengan nama field tulis, string datar). Kalau Accurate mengembalikan nama/bentuk lain, semua baris kembar gagal dengan pesan "tidak ditemukan" (aman, tidak menebak) — verifikasi dengan respons asli SO `SOTES_EKA01`.
- Pembeda hanya Item Notes↔`charField1` (dan CLS5 bila SO memakainya). Baris SO kembar dengan Week sama → "ambigu" (client harus beri pembeda lain atau isi ID manual).
- Kolom "Sales Order Detail ID" manual tetap bisa dipakai (override, tidak ditimpa).
- Item Notes DO ikut terkirim sebagai catatan baris DO seperti biasa (selain jadi kunci pencarian).

## Ringkasan Hasil
Delivery Order kini mencocokkan baris Sales Order sendiri untuk Item No kembar lewat Item Notes (= Atribut Tambahan 1/"Week" baris SO), sehingga client tidak perlu lagi VLOOKUP manual/aplikasi bantu — cukup kosongkan "Sales Order Detail ID". Sel dibersihkan (mis. Item No berawalan baris baru dari copy-paste). Aturan pencocokan jadi satu fungsi murni yang dipakai worker (salinan inline dihapus). Asumsi lama Fase 158 (Week = CLS5) dikoreksi di kode & dokumen. Typecheck 0 error; 6 test baru (data client). Tanpa scope baru.
