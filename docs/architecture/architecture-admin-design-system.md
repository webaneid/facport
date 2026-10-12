# Arsitektur — Design System Admin "Kompak & tajam" (Fase 190)

Keputusan: `docs/decisions/adr-0046-design-system-admin-kompak.md`. Rencana & status: `docs/phases/phase-190-redesign-ui-admin.md`.

## Mekanisme
- `AppShell` surface `admin` memasang `data-ui="compact"` pada pembungkus terluar. Varian Tailwind `compact:` (`@custom-variant compact (&:where([data-ui="compact"], [data-ui="compact"] *))` di `globals.css`) aktif hanya di dalamnya.
- Primitif UI (`components/ui/*`) menulis kelas dasar (tampilan semua surface) + kelas `compact:` (tampilan admin). Surface pelanggan/landing tidak memasang atribut → tidak berubah.
- Ukuran/jarak ditulis sebagai kelas literal Tailwind (bukan CSS variable) supaya pencarian kode mudah; angka baku di tabel di bawah adalah sumber kebenaran.

## Skala baku (admin)
| Elemen | Dasar (semua surface) | `compact:` (admin) |
|---|---|---|
| Teks dasar | 14px (`text-sm`) | 13px |
| Judul halaman | `text-3xl` bold | `text-xl` semibold |
| Judul kartu | `text-base` | `text-sm` |
| Angka KPI | `text-3xl` | `text-2xl` |
| Kartu | `rounded-2xl`, `p-6` | `rounded-lg`, `p-4` |
| Tombol | `rounded-xl`, `px-3.5 py-2` | `rounded-md`, `px-3 py-1.5`, 13px |
| Input | `rounded-md`, `py-2` | `py-1.5`, 13px |
| Tabel | sel `px-4 py-3`, kepala `py-2` | sel `px-3 py-2` (13px), kepala `py-1.5`, header lengket |
| Lencana | `px-2.5 py-0.5 text-xs` | `px-2 text-[11px]` |
| Konten utama | `p-4 sm:p-6 lg:p-8` | `p-4 sm:p-5` |
| Cangkang panel | `rounded-2xl` | `rounded-xl` |

## Interaksi (admin)
KPI dapat diklik → tab Insight terkait; sparkline tren mini; palet perintah (Ctrl/⌘+K) untuk berpindah halaman; baris tabel bisa difokus keyboard; skeleton saat memuat; keadaan kosong dengan tindakan lanjutan.

## Status
Lihat tabel sub-fase di `phase-190-redesign-ui-admin.md`.
