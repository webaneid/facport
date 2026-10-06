# Komponen — SubscriptionPicker (pilih paket langganan)

> Fase 177, ADR-0041. Satu komponen "pilih fitur + periode + lihat tanggal & jam akhir" yang dipakai berulang (admin /users: Tambah User & Kelola Langganan; kandidat dipakai ulang di app pelanggan). Jangan membuat pemilih paket baru — pakai ini.

## Lokasi
- Komponen: `apps/web/components/subscription/subscription-picker.tsx` (controlled, tanpa panggilan API)
- Logika murni (teruji): `apps/web/lib/subscription-picker.ts` — `buildPickerRows`, `filterPickerRows`, `countRowsByFilter`, `selectableKeys`, `previewRow`, `summarizeSelection`, `pruneSelection`
- Aritmetika periode (SATU sumber, sama dengan server): `apps/api/src/lib/subscription-period.ts` (re-export web: `apps/web/lib/subscription-period.ts`)
- Input tanggal+jam WIB: `apps/web/components/ui/date-time-field.tsx`

## Konsep
- **Satu baris = satu FITUR** (modul), bukan satu paket. Paketnya diturunkan dari fitur + **periode** (Bulanan/Tahunan) yang dipilih SEKALI untuk semua — paket termurah pada fitur+periode itu. Seat ("Slot User Tambahan", Produk "Tambah User") = satu baris sendiri.
- Fitur tanpa paket di periode terpilih → "Tidak tersedia untuk periode ..." (checkbox nonaktif, tidak diganti diam-diam); ganti periode melepas pilihan yang tidak punya paket di periode baru (dilakukan komponen sendiri).
- **Filter Produk** (Semua/Facport/Konverter/AutoProduksi/Tambah User, dengan jumlah), pencarian, "Pilih semua (hasil filter)"/"Lepas semua"/"Kosongkan". Nama aksesibel checkbox memuat Produk (nama modul sama di Facport & Konverter).
- **Pratinjau tanggal & jam akhir (WIB, zona perusahaan)** per baris + ringkasan, dihitung dengan fungsi yang SAMA dengan server (`addCalendarPeriod`/`computeRenewalEnd`): baru → tanggal & jam sama bulan/tahun depan; **Perpanjang** (fitur non-trial aktif, `activeByModule`) → dari tanggal berakhir saat ini (jangkar anti-geser); trial aktif → "Menggantikan trial".
- `startsAt`: `exact` (mulai saat disimpan — tampilkan tanggal+jam) atau `on-approval` (mulai saat pembayaran disetujui, mis. invoice — hanya tampilkan aturannya).

## Cara pakai
```tsx
const [interval, setInterval] = useState<SubscriptionInterval>("monthly");
const [keys, setKeys] = useState<Set<string>>(new Set());
<SubscriptionPicker plans={plans} activeByModule={active} interval={interval} onIntervalChange={setInterval}
  selectedKeys={keys} onSelectedKeysChange={setKeys} timeZone={companyTimezone} startsAt="exact" />
// kirim: summarizeSelection(buildPickerRows(plans, { interval, activeByModule }), keys, new Date(), tz).planIds
```
- `plans` = paket aktif (`GET /admin/plans`); `activeByModule` = dari `GET /admin/users/:id/subscriptions` (status active, per Data Usaha tujuan; field `interval/isTrial/periodAnchorAt/periodMonths`).
- Tambah User: `POST /admin/users` (`planIds`, `markAsPaid`). Kelola Langganan: `POST /admin/subscriptions/bulk` (`planIds`, `dataUsahaId?`, `endAt?` override sama untuk semua) — atomik, satu `now`, aturan per paket di `lib/admin-assign.ts` (modul aktif → perpanjang di tempat; selain itu baru).
