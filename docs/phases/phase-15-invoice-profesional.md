# Fase 15 — Invoice Profesional (Skema + PDF)

**Status:** Done
**Mulai:** 2026-09-04
**Selesai:** 2026-09-04

## Tujuan
Sebelum payment gateway (Fase 16) dan cart checkout UI (Fase 17), butuh
representasi dokumen invoice profesional yang sesungguhnya (nomor invoice,
bill-to, line item per sub-modul, due date, PDF) — bukan cuma catatan
`orders` internal seperti sekarang. Fase ini murni skema + PDF generator +
endpoint baca; BELUM ada jalur normal yang membuat invoice (checkout
sungguhan = Fase 16-17) — diverifikasi pakai data yang di-insert manual
(test/script), bukan alur user nyata.

Rencana lengkap lintas 5 fase (14-18) → `/Users/webane/.claude/plans/sorted-inventing-volcano.md`.

## Scope
- [x] `apps/api/src/db/schema/invoice.schema.ts` (baru) — table `invoices`
      + `invoiceItems`, lihat `architecture-invoice.md` § Skema Database
- [x] `apps/api/src/db/schema/subscription.schema.ts` — tambah kolom
      `invoiceItemId` (nullable FK)
- [x] `apps/api/src/db/schema/index.ts` — re-export `invoice.schema.ts`
- [x] Migration Drizzle (`0011_big_dragon_man.sql`) untuk kedua perubahan
      skema di atas — 2 tabel baru + 1 kolom baru, ADD-only, tidak butuh
      teknik 2-langkah seperti Fase 14 (bukan rename kolom)
- [x] `apps/api/package.json` — dependency `@react-pdf/renderer` + `react`
      (+ `@types/react` dev), `apps/api/tsconfig.json` — `jsx: react-jsx`
- [x] `apps/api/src/lib/invoice-pdf.tsx` (baru) — generator PDF via
      `renderToBuffer`, layout: header (logo + INVOICE/nomor/tanggal),
      bill-to, tabel item, subtotal/total, footer instruksi pembayaran
- [x] `apps/api/src/lib/invoice-number.ts` (baru) — generate nomor
      `INV/YYYY/MM/0001` per bulan, diverifikasi via query nyata ke DB dev
- [x] `apps/api/src/routes/invoices.route.ts` (baru) — `GET /me/invoices`,
      `GET /invoices/:id/pdf` (ownership ganda: milik sendiri ATAU admin)
- [x] `apps/api/src/routes/admin/invoices.route.ts` (baru) — `GET
      /admin/invoices`, permission `invoices.view` (ditambah ke
      `ADMIN_PERMISSION_KEYS` di `db/seed.ts`, seed ulang dijalankan)
- [x] `apps/api/src/lib/permission.ts` — export `userHasPermission` (dipakai
      cek admin-or-owner di `invoices.route.ts`)
- [x] `apps/api/src/lib/invoice-helpers.ts` (baru, TIDAK di rencana awal —
      ditambah pasca security review untuk hilangkan duplikasi logic
      agregasi item antara 2 route invoice, § Keputusan Kecil)
- [x] `apps/api/src/routes/settings.route.ts` — TIDAK ADA perubahan kode
      (sesuai rencana, key-value fleksibel sudah cukup), 4 key baru group
      `billing` dipakai dari sini
- [x] `apps/web/app/admin/(protected)/settings/page.tsx` — tambah field
      `company.taxId`, `company.phone`, `company.email`,
      `company.bankAccount` ke form (Card baru "Info Penagihan (Invoice)")
- [x] `apps/web/app/app/(protected)/billing/page.tsx` (baru) — riwayat
      invoice + tombol download PDF + badge status
- [x] `apps/web/components/app-shell/sidebar.tsx` — tambah item "Tagihan"
      (surface app, TANPA `moduleKey` — selalu tampil, bukan gated per
      sub-modul)
- [x] `apps/web/lib/api-client.ts` — export `apiBaseUrl` (rename dari
      const private `baseURL`, TIDAK di rencana awal — dibutuhkan supaya
      link unduh PDF di `billing/page.tsx` pakai base URL yang SAMA PERSIS
      dengan Eden client, tanpa duplikasi logic proxy dev/prod)
- [x] Test: `invoices.route.test.ts` + `admin/invoices.route.test.ts`,
      insert invoice+items langsung ke DB lalu verifikasi `GET
      /me/invoices`, `GET /invoices/:id/pdf` (ownership + isi PDF
      SUNGGUHAN divalidasi magic-bytes `%PDF-`), `GET /admin/invoices` —
      BUKAN test alur checkout (belum ada, Fase 16-17)

## Referensi
- ADR: `docs/decisions/adr-0021-invoice-schema-dan-pdf-generator.md`
- Architecture doc: `docs/architecture/architecture-invoice.md`,
  `docs/architecture/architecture-subscription.md`,
  `docs/architecture/architecture-settings.md`

## Keputusan Kecil Selama Eksekusi
- **JSX di apps/api**: `t.Union(SUB_MODULE_KEYS.map(...))` pattern DIHINDARI
  di sini (belajar dari bug Fase 14, § `docs/lessons-learned.md`
  2026-09-04) — tidak relevan langsung ke Fase 15, tapi jadi alasan
  `apps/api/tsconfig.json` `jsx: react-jsx` ditambah dengan komentar
  eksplisit "SATU-SATUNYA pemakai" supaya jelas cakupannya sempit.
- **PDF logo pakai `<Image src={url}>` react-pdf FETCH URL langsung** —
  tidak perlu proxy/buffer manual di kode Facport (MinIO public bucket,
  ADR-0017), react-pdf yang urus fetch-nya sendiri.
- **`apps/web/lib/api-client.ts` — `baseURL` di-export jadi `apiBaseUrl`**
  (bukan bikin fungsi/util terpisah) — link unduh PDF (bukan lewat Eden,
  Eden fetch wrapper JSON-oriented, tidak cocok untuk stream binary PDF)
  butuh base URL yang SAMA PERSIS logic-nya (proxy dev vs origin prod),
  export const yang sudah ada lebih sederhana dari duplikasi logic.
- **`invoice-helpers.ts` diekstrak PASCA security review** (bukan
  direncanakan di awal) — auditor temukan duplikasi logic agregasi item
  antara `invoices.route.ts` dan `admin/invoices.route.ts`, diperbaiki
  langsung karena murah & jelas manfaatnya.

## Checklist Sebelum Ditutup (sesuai SOP)
- [x] Type check nol error (`bun run typecheck` — apps/api & apps/web)
- [x] Security review dijalankan (subagent `security-auditor`, ~16 file)
- [x] Temuan Critical/High sudah diperbaiki (atau tidak ada temuan) — 0 Critical/High/Medium
- [x] Temuan Medium/Low dicatat di `docs/lessons-learned.md` kalau ditunda — 3 Low, 1 diperbaiki langsung (duplikasi kode), 2 diterima sebagai debt (alasan eksplisit di lessons-learned)
- [x] `docs/PROGRESS.md` diupdate
- [x] PDF diverifikasi bisa dibuka — diverifikasi 2x: (1) unit test cek
      magic bytes `%PDF-`, (2) manual test end-to-end (`curl` → file
      disimpan ke disk → `file` command konfirmasi "PDF document, version
      1.3, 1 pages" → teks diekstrak `pypdf` di venv terisolasi,
      konfirmasi SEMUA data (company, bill-to, 2 line item, subtotal/
      total, footer instruksi pembayaran) tampil benar di dokumen nyata

## Known Limitations
- **Belum ada jalur normal bikin invoice** — checkout (Fase 17) dan payment
  gateway (Fase 16) belum ada, jadi `INSERT INTO invoices` cuma lewat
  test/script manual di fase ini.
- **Generate nomor invoice via `COUNT` sederhana, rawan race condition di
  bawah beban concurrent** — lihat `architecture-invoice.md` § "Nomor
  Invoice". Aman untuk fase ini (belum ada trafik nyata), WAJIB direvisit
  Fase 16-17 kalau checkout beneran dipakai banyak user bersamaan.
- PDF **tidak di-cache/simpan** — di-generate ulang tiap request (§
  ADR-0021, keputusan sadar bukan kelupaan).
- **Link unduh PDF di `billing/page.tsx` BELUM diverifikasi manual di
  production** — navigasi top-level lintas-subdomain (`app.<domain>` →
  `api.<domain>`), secara teori aman (`SameSite=Lax` + `crossSubDomainCookies`)
  tapi belum diamati langsung. Cek manual sebelum menganggap tombol
  "Unduh PDF" pasti berfungsi di production — detail penalaran lengkap →
  `docs/lessons-learned.md` 2026-09-04.
- **3 temuan Low security review** — 1 diperbaiki (duplikasi kode), 2
  diterima sebagai debt (timing side-channel dengan mitigasi UUID entropy,
  `maxLength` field settings billing) — detail lengkap +alasan penerimaan
  → `docs/lessons-learned.md` 2026-09-04.
- **Verifikasi UI browser sungguhan TIDAK dilakukan** (ekstensi Chrome
  tidak terhubung sesi ini, sama seperti Fase 14) — halaman
  `/app/billing` dan Card baru di `/admin/settings` belum pernah dilihat
  langsung di browser, cuma diverifikasi lewat data API nyata (`curl`) +
  typecheck yang memastikan bentuk data cocok dengan tipe yang dipakai
  komponen React.
- **Belum di-commit/push** — kode Fase 14 DAN Fase 15 masih di working
  tree branch `feat/subscription-foundation`, belum ada commit/push/PR
  sama sekali sampai penutupan fase ini. Ditemukan & dikonfirmasi ke user
  saat penutupan Fase 15 (bukan kelupaan yang lolos tanpa disadari).

## Ringkasan Hasil
Invoice profesional (skema + PDF) selesai penuh sesuai rencana: tabel
`invoices`/`invoiceItems` (snapshot harga/label, immutable begitu
dibuat), PDF generator server-side murni via `@react-pdf/renderer`
(SATU-SATUNYA pemakai JSX di apps/api), endpoint baca
(`GET /me/invoices`, `GET /invoices/:id/pdf` ownership ganda milik-sendiri-
atau-admin, `GET /admin/invoices`), halaman `/app/billing` (riwayat +
unduh PDF), 4 field company settings baru group `billing` di halaman
admin settings. Typecheck 0 error (apps/api & apps/web), 105/105 test API
pass (10 test baru), security review 0 Critical/High/Medium (3 Low: 1
diperbaiki langsung — ekstrak `invoice-helpers.ts` — 2 diterima sebagai
debt beralasan). PDF diverifikasi ASLI (bukan cuma header/status code)
lewat ekstraksi teks nyata — semua data (company, bill-to, item, total,
footer) tampil benar. Fase ini murni fondasi baca+dokumen; jalur yang
BENAR-BENAR membuat invoice (checkout) baru ada di Fase 16 (payment
gateway Ipaymu) dan Fase 17 (cart checkout UI) — keduanya WAJIB
diverifikasi manual terhadap perilaku Ipaymu sungguhan sebelum dianggap
solid (sama seperti pola verifikasi Accurate API di fase-fase sebelumnya).
