# Architecture — Dashboard Pelanggan (App Shell)

> Fondasi UI surface `app` (pelanggan) — dipakai ulang tiap kali modul baru
> (Sales Invoice, Purchase Order, dst) ditambahkan. Baca file ini SEBELUM
> nambah halaman baru di `app/app/(protected)/` supaya konsisten dengan
> pola yang sudah ada, bukan reinvent.

## Kenapa Ada Fase Ini
Sampai Fase 02, halaman `/app` (dashboard pelanggan) masih placeholder.
User minta dashboard profesional/modern/responsive SEKALIGUS jadi fondasi
App Shell (sidebar+layout) yang dipakai ulang modul-modul berikutnya —
supaya tiap modul baru tinggal nambah 1 baris nav, bukan bikin
layout/navigasi sendiri-sendiri.

## Route Group `(protected)` — Wajib untuk Halaman Baru Surface `app`
Semua halaman customer yang BUTUH login (dashboard, import, koneksi
Accurate, dst — hampir semua) masuk `app/app/(protected)/`, BUKAN
langsung di `app/app/`. `login/`, `register/` TETAP di luar (supaya tidak
ikut ke-gate — cegah redirect loop, sama pola dengan `app/admin/(protected)/`).

```
apps/web/app/app/
  login/                 ← DI LUAR (protected)
  register/              ← DI LUAR (protected)
  (protected)/
    layout.tsx             ← role check REAL (§ di bawah) + render <AppShell>
    page.tsx                ← dashboard home
    accurate/page.tsx
    purchase-invoice/import/**       ← Fase 02 + auto-create vendor/item (Fase 05)
    vendor/payable-account/import/** ← Fase 04
    [modul-baru]/**          ← modul berikutnya taruh di sini
```

## Role Check — Layout, Bukan Proxy
Sama prinsip dengan `architecture-domain-routing.md` § "Role Check Admin":
`apps/web/proxy.ts` cuma cek KEBERADAAN cookie (existence-only, TANPA query
DB). Role sebenarnya (`customer`) dicek di `app/app/(protected)/layout.tsx`
(Server Component, `GET /me` forward cookie) — kalau bukan role `customer`,
redirect ke `/login`.

```ts
// apps/web/app/app/(protected)/layout.tsx
const res = await fetch(`${apiUrl}/me`, { headers: { cookie }, cache: "no-store" });
if (!res.ok) redirect("/login");
const me = (await res.json()) as { roles: string[] };
if (!me.roles.includes("customer")) redirect("/login");
return <AppShell user={{ name: me.name, email: me.email }}>{children}</AppShell>;
```

## Server Component Fetch — WAJIB Forward Cookie Manual
`lib/api-client.ts` (Eden, `credentials:"include"`) cuma efektif di
BROWSER — TIDAK ADA artinya di Server Component (tidak ada cookie jar
browser di server). Endpoint yang butuh auth, dipanggil dari Server
Component, WAJIB pakai raw `fetch()` + header `cookie` manual (contoh:
`app/app/(protected)/page.tsx`'s `fetchJson()` helper). JANGAN pakai `api`
(Eden) di Server Component untuk endpoint yang butuh login — akan selalu
401 karena cookie tidak ke-forward otomatis.

## Nambah Nav Item untuk Modul Baru
SATU sumber kebenaran: `apps/web/components/app-shell/sidebar.tsx`, array
`NAV_ITEMS` (diekspor). Tambah 1 objek `{ href, label, icon }` — otomatis
muncul di sidebar desktop DAN drawer mobile (list nav-nya sama, dirender
dua kali lewat komponen `NavList` internal) **DAN** otomatis jadi judul
halaman di Topbar (`components/app-shell/topbar.tsx`, fungsi
`currentPageLabel()` — cari nav item yang `href`-nya jadi AWALAN
pathname, jadi halaman turunan seperti `/purchase-invoice/import/[batchId]`
tetap dapat judul dari induknya). JANGAN duplikasi daftar nav/judul ke
tempat lain — 1 array, 2 pemakai.

## Komponen UI (`components/ui/`)
Semua komponen custom (BUKAN pakai library component library eksternal
utuh), pola konsisten: `cn()` (`lib/utils.ts`) buat gabung className,
Radix primitive untuk yang perlu accessibility/keyboard-nav (Dialog,
DropdownMenu, Avatar, Popover), plain Tailwind untuk yang statis
(Card, Badge, Table, Skeleton).

| Komponen | Kapan Dipakai |
|---|---|
| `Card`/`CardHeader`/`CardTitle`/`CardDescription`/`CardContent` | Blok konten dashboard (1 Card = 1 topik: Langganan, Koneksi, dst) |
| `Badge` (variant: `default`\|`primary`\|`success`\|`warning`\|`destructive`) | Status singkat (Aktif/Kadaluarsa, Sukses/Gagal/Memproses) |
| `Table`/`TableHeader`/`TableBody`/`TableRow`/`TableHead`/`TableCell` | Listing data — SELALU sudah bungkus `overflow-x-auto` sendiri (§ "Responsive" di bawah), dipakai bareng `@tanstack/react-table` (ADR-0004) kalau butuh sorting/pagination |
| `DropdownMenu`* | Menu klik (user menu topbar) |
| `Avatar`/`AvatarFallback` | Inisial user (belum ada upload foto — § Known Limitations) |
| `Skeleton` | Loading placeholder (dipakai gantiin "Memuat..." polos) |
| `buttonVariants(variant, className)` (dari `button.tsx`) | Styling tombol di elemen NON-`<button>` (mis. `<Link>`) — hindari nested-`<button>` invalid HTML, TANPA perlu dependency `@radix-ui/react-slot`/`asChild` |
| `FileDropzone` (`ui/file-dropzone.tsx`) | Upload file Excel di halaman import (klik ATAU drag-drop, dipakai `Controller` react-hook-form) — GANTI `<input type="file">` native, dipakai Purchase Invoice import (Fase 02) & Vendor Akun Hutang import (Fase 04). Pakai ini untuk SEMUA upload file baru, jangan balik ke input native (§ lessons-learned.md — input native bikin user bingung "tombol mana yang diklik") |
| `EmptyState` (`ui/empty-state.tsx`) | Pengganti teks polos ("Belum ada data", "Belum Terhubung") — ikon besar (lucide, bulat `bg-primary-50`) + judul + deskripsi opsional + aksi opsional. Dipakai di card Dashboard (Langganan/Koneksi Accurate/Import Terakhir) & halaman Koneksi Accurate. **Pakai ini untuk SEMUA state kosong baru**, jangan balik ke `<p className="text-sm text-muted-foreground">` polos (§ perbaikan UI 2026-08-22 — kesan "asal jadi tanpa design" sebelumnya banyak berasal dari empty state selevel 1 baris teks) |

## Token Desain (`app/globals.css`)
Nama SEMANTIK (`--color-primary-*`, `--color-background`, `--color-muted`,
`--color-success`, dst), BUKAN hardcode nama warna Tailwind (`indigo-600`)
langsung di komponen. Alasan: dark mode (DITUNDA, § Known Limitations)
nanti tinggal override token di sini, bukan cari-ganti tiap file komponen.
Palet primary = skala indigo standar (keputusan user — profesional, umum
dipakai produk SaaS B2B finance/accounting).

**Shadow** (`--shadow-card`, `--shadow-elevated`) — dipakai lewat
`shadow-[var(--shadow-card)]` di `Card`/`Button` — GANTI `shadow-sm`
bawaan Tailwind yang nyaris tidak kelihatan (kesan flat/tanpa-elevasi).
`--shadow-elevated` (lebih kuat) khusus buat elemen yang perlu "mengambang"
di atas background, mis. card login/register.

**Background body** — wash gradient halus (`--color-primary-50` →
`--color-muted`, `background-attachment: fixed`), BUKAN putih polos —
mengisi ruang kosong di bawah konten card supaya halaman tidak terasa
"berhenti di tengah", sekaligus bikin card putih di atasnya kontras
(kelihatan elevated, bukan menyatu sama background).

Font: Inter via `next/font/google` (self-host otomatis oleh Next.js, TIDAK
ada request runtime ke Google Fonts) — di-load di `app/layout.tsx` root,
BUKAN per-halaman.

## Responsive — Aturan Wajib
1. **Tabel lebar**: WAJIB `overflow-x-auto` pada wrapper-nya sendiri (sudah
   bawaan komponen `Table`), TAPI itu SAJA TIDAK CUKUP — parent flex/grid
   container-nya WAJIB `min-w-0`. Tanpa `min-w-0`, flex item defaultnya
   `min-width: auto` (bukan `0`), jadi konten lebar (tabel `whitespace-nowrap`)
   mendorong SELURUH kolom/halaman keluar viewport di mobile alih-alih
   di-scroll lokal — bug nyata ketemu & diperbaiki di Fase 03 (§
   `docs/lessons-learned.md` 2026-08-19), sudah di-fix permanen di
   `components/app-shell/app-shell.tsx` (`min-w-0` di kolom kanan + `<main>`).
   **Halaman/komponen baru yang nambah flex/grid container BARU di dalam
   App Shell WAJIB cek ulang aturan ini** — `min-w-0` tidak otomatis
   menurun ke container baru.
2. Sidebar desktop (`lg:` ke atas, ≥1024px) selalu tampil; di bawah itu
   disembunyikan (`hidden lg:flex`), diganti drawer (Radix Dialog
   primitive langsung, posisi custom slide-in-kiri — BUKAN komponen
   `ui/dialog.tsx` yang di-styling modal-tengah, dependency yang sama
   cuma styling beda).
3. Verifikasi WAJIB pakai browser sungguhan (Playwright — `bunx playwright
   install chromium`, sudah terinstall di environment ini) di MINIMAL 3
   breakpoint (desktop ~1440px, tablet ~768px, mobile ~390px), cek
   `document.documentElement.scrollWidth <= clientWidth` di tiap breakpoint
   — server-render/curl TIDAK CUKUP untuk verifikasi responsive.

## Notifikasi (Toast)
`sonner` — `<Toaster />` di-mount SEKALI di `app/layout.tsx` root (bukan
per-halaman). Panggil `toast.success(...)`/`toast.error(...)` dari
Client Component mana pun, tidak perlu import ulang `<Toaster />`.

## Referensi
- Rasional keputusan desain (light-mode-dulu, palet indigo) → phase doc
  `docs/phases/phase-03-dashboard-pelanggan.md` § "Keputusan Kecil"
- Role check pattern (dicontoh dari sini) → `docs/architecture/architecture-domain-routing.md`
- Komponen standar & alasan pemilihan tool → `docs/decisions/adr-0004-ui-component-standards.md`
