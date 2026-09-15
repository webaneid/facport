# Fase 126 — Sidebar App: Grup Produk "Facport" + Flyout Kategori, Fix Popup Admin

**Status:** Done
**Mulai:** 2026-09-15
**Selesai:** 2026-09-15

## Tujuan
Dua permintaan user, dieksekusi bareng karena kecil dan saling terkait
(sama-sama area "Kelola Paket"/navigasi modul):

1. Bug: popup "Tambah Paket" admin tidak bisa di-scroll — form panjang
   (radiogroup semua modul) tumpah keluar viewport, tombol Simpan tidak
   terjangkau, fitur tambah paket jadi TIDAK BISA DIPAKAI.
2. Restrukturisasi sidebar app: grup flat "Import Data" (12 modul sejajar)
   diganti struktur Brand→**Produk** ("Facport")→**Kategori**→**Varian**
   (ADR-0033, Fase 117) — kategori cuma muncul kalau ada minimal 1 Varian
   di dalamnya yang di-subscribe, dari sekarang disiapkan supaya modul
   Inventory/Manufacture (belum digarap) bisa nempel tanpa ubah struktur
   nav lagi nanti.

## Scope
- [x] `apps/web/components/ui/dialog.tsx` — `DialogContent` tambah
      `max-h-[85vh] overflow-y-auto` (komponen shared, bukan cuma halaman Plans).
- [x] `apps/api/src/lib/module-catalog.ts` — kategori diseragamkan ke
      Bahasa Inggris (konsisten nama Varian yang sudah Inggris), tambah
      `MODULE_CATEGORIES` (urutan tetap, termasuk Inventory/Manufacture
      walau 0 Varian hari ini), `vendor_payable_account` (dulu kategori
      "Data Master" sendiri) digabung ke "Purchase".
- [x] `apps/web/lib/module-options.ts` — re-export `MODULE_CATEGORIES`.
- [x] `apps/web/components/app-shell/sidebar.tsx` — grup "Import Data" →
      "Facport" (`productLine: "facport"`), item di-cluster per Kategori
      saat render (`groupItemsByCategory()`), tiap Kategori jadi trigger
      flyout (icon + nama + panah) yang buka panel modul di sebelah kanan.
- [x] `docs/architecture/architecture-product-lines.md` — dokumentasikan
      keputusan di atas + § "Sidebar App — Cluster per Kategori".

## Keputusan Kecil Selama Eksekusi
- **Flyout, bukan sub-header teks** — draft pertama (sub-judul teks statis
  per kategori) ditolak user ("tidak elegan"). Diganti flyout hover/klik
  (Radix `DropdownMenu`, `side="right"`) — pola sama menu app desktop
  (referensi gambar dari user).
- **`modal={false}` di `DropdownMenu`** — default Radix `modal=true`
  mengunci scroll body tiap `open` berubah (nambah/lepas kompensasi lebar
  scrollbar). Karena flyout ini dibuka via HOVER, toggle cepat bikin
  scrollbar goyang TANPA HENTI PERSIS di batas trigger (layout geser →
  mouseleave → nutup → geser balik → mouseenter → buka lagi → loop).
  Ditemukan user ("goyang-goyang... gerak terus"), `modal={false}`
  menghilangkan scroll-lock ini sepenuhnya — juga lebih benar secara UX
  untuk menu navigasi biasa (bukan dialog aksi yang perlu kunci fokus modal).
- **Item flyout pakai `DropdownMenuPrimitive.Item` MENTAH, bukan
  `DropdownMenuItem` yang sudah dibungkus** `components/ui/dropdown-menu.tsx`
  — wrapper itu bawa default `hover:bg-muted` (didesain dialog terang).
  Karena item di-render pakai `asChild` (jadi `<Link>`), Radix `Slot`
  CUMA konkatenasi className parent+child sebagai STRING (bukan
  di-override via `tailwind-merge` — itu cuma jalan DI DALAM 1 komponen,
  bukan lintas batas `Slot`). 2 percobaan pertama (netralkan jadi
  `hover:bg-transparent` di wrapper) TETAP bocor — cuma tukar KELAS mana
  yang menang-kalahnya acak (ditemukan user: "putihnya hilang sama
  sekali"). Fix permanen: pakai primitive TANPA className bawaan sama
  sekali, supaya tidak ada apa pun yang bisa bentrok.
- **Panel flyout = glassmorphism** (`bg-admin-accent-strong/70
  backdrop-blur-xl`), item = chip putih semi-transparan (`bg-white/10` →
  hover `bg-white/40`) — diminta user eksplisit ("biar tambah keren"),
  "secondary" ditafsirkan sebagai tone gelap YANG SAMA dengan rail
  sidebar sendiri (`--admin-accent-strong`), bukan warna baru sembarang.
- **Icon kategori BEDA dari icon Varian di dalamnya** (PiggyBank,
  NotebookText, ShoppingBag, TrendingUp, Warehouse, Factory) — biar
  trigger vs isi flyout gampang dibedakan sekilas, walau kadang 1
  kategori cuma py 1 Varian hari ini.

## Checklist Sebelum Ditutup (sesuai SOP)
- [x] Type check nol error (`bun run typecheck`) — api+web, 0 error
- [x] `bun run lint` — 0 error
- [x] `bun run test` — 1067 pass, 0 fail (sebelum perubahan sidebar/dialog,
      tidak ada file backend yang disentuh fase ini selain rename label
      kategori — tidak ada test yang assert string kategori lama)
- [x] Security review dijalankan — 0 temuan (verifikasi eksplisit: filter
      subscription `navGroupsFor()` TIDAK disentuh, clustering kategori
      murni beroperasi di atas item yang SUDAH difilter, label kategori
      100% konstanta hardcoded)
- [x] Verifikasi visual: dialog fix dikonfirmasi via browser (screenshot
      before/after). Clustering kategori diverifikasi logic-level via
      script langsung (2 skenario: campuran 4 kategori urutan+isi benar,
      "cuma 1 kategori subscribed → yang lain hilang"). Flyout hover/klik
      + styling dikonfirmasi user sendiri di browser lokalnya (screenshot
      dikirim 2x selama iterasi, browser otomasi sesi ini kena kendala
      sesi/cookie terpisah saat coba login sebagai customer test).
- [x] `docs/PROGRESS.md` diupdate

## Known Limitations
- Kategori Inventory & Manufacture SENGAJA 0 Varian — arsitektur (tipe
  data + render clustering) sudah siap, TIDAK menebak nama modul
  sebelum fase build masing-masing (konsisten prinsip ADR-0033).
- Produk Konverter/AutoProduksi belum py grup nav sama sekali — pola yang
  sama (grup `productLine` + `MODULE_CATEGORIES` sendiri) dipakai nanti,
  belum didesain kategorinya (di luar scope, belum ada Varian nyata).

## Ringkasan Hasil
Bug popup "Tambah Paket" (form tumpah tanpa scroll, tombol Simpan tidak
terjangkau) diperbaiki di komponen shared `DialogContent`. Sidebar app
direstruktur dari grup flat 12 modul jadi grup Produk "Facport" dengan
flyout per Kategori (Cash & Bank/General Ledger/Purchase/Sales — Inventory/
Manufacture disiapkan kosong untuk masa depan), kategori Bahasa Inggris
konsisten nama Varian. 3 iterasi styling/interaksi bareng user (sub-header
teks → flyout hover/klik, scrollbar goyang karena Radix modal scroll-lock,
hover item "saru" karena konflik className lewat Radix Slot) — semua
ditemukan lewat feedback screenshot user, diperbaiki sampai user konfirmasi
"sudah bagus".
