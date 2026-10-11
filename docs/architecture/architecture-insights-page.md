# Arsitektur — Halaman Insight Admin (Fase 189D)

Halaman `/insight` di panel admin (menu "Insight", izin `insights.view`) — antarmuka FUNGSIONAL untuk 9 kebutuhan data client FAC. Membaca API di `architecture-insights-api.md`; tidak mengubah data (cabut/pindah akses tetap di detail user). Redesain visual = Fase 190.

## Peta tab → API
| Tab (`?tab=`) | Komponen | Endpoint | Butir client |
|---|---|---|---|
| `ringkasan` | `summary-tab.tsx` | `summary` | 1, ringkas semua |
| `pelanggan` | `customers-tab.tsx` (`mode=pelanggan`) + `customer-access-dialog.tsx` | `customers`, `customers/:id/access`, `export/customers` | 1, 4, 8 |
| `fitur` | `features-tab.tsx` | `features`, `features/:key/customers`, `export/feature-users` | 2, 3 |
| `akses` | `customers-tab.tsx` (`mode=akses`, `kind=pemilik`) | `customers`, `customers/:id/access` | 4 |
| `langganan` | `subscriptions-tab.tsx` (Baru / Akan berakhir) | `new`, `expiring`, `export/new`, `export/expiring` | 5, 6 |
| `tren` | `trend-tab.tsx` | `trend`, `tenure`, `export/trend` | 7 |
| `koneksi` | `connection-tab.tsx` | `connection-history`, `export/connection-history` | 9 |

## Konvensi
- `lib/insights.ts` — bagian MURNI (tab, format selisih/persen, kueri/URL ekspor, rentang default, label, `downloadCsv`) + tipe respons. Diuji di `lib/insights.test.ts`.
- `useInsightQuery(key, load)` — satu pengambil data; hasil kueri lama tidak tampil untuk `key` baru.
- Halaman API **0-based** (`page=0` halaman pertama); `Pagination` komponen UI juga 0-based.
- Kolom tabel sedikit (lebar persen, `TruncateText`); detail lewat tombol **Lihat** (dialog).
- WhatsApp/telepon: `waLink`/`telLink` dari nilai E.164 tervalidasi; nomor tak sah → tanpa tautan.
- Ekspor: `fetch` berkredensial → blob; 429 (kuota) / 422 (rentang) jadi toast; tidak ada URL bertoken.
- `?tab=` tidak dipercaya: nilai tak dikenal → `ringkasan`.

## Status
Selesai di kode (Fase 189D); UI **belum dilihat di browser** — verifikasi visual oleh user.
