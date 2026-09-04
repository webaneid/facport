# Fase 14 — Restrukturisasi Inti: Sub-Modul + Koneksi Accurate Reusable

**Status:** Done
**Mulai:** 2026-09-04
**Selesai:** 2026-09-04

## Tujuan
Sebelum lanjut membangun modul ke-3 dst (Purchase Payment, Sales Receipt,
Jurnal Umum), fondasi komersial diperkuat dulu — client jual per
SUB-MODUL (SI/PI/CR/PP/JU masing-masing harga & langganan sendiri), bukan
per grup Penjualan/Pembelian seperti sekarang. Fase ini murni
restrukturisasi struktur data/gating + koneksi Accurate, BELUM invoice/
payment (itu Fase 15-16) — supaya perubahan besar ini bisa diverifikasi
sendiri dulu sebelum ditumpuk fitur lain di atasnya.

Rencana lengkap lintas 5 fase (14-18) → `/Users/webane/.claude/plans/sorted-inventing-volcano.md`
(plan file sesi ini) — ringkasan keputusan didokumentasikan permanen di
ADR-0019 & ADR-0020, bukan cuma di plan file yang sifatnya sementara.

## Scope
### A — Gating per sub-modul
- [x] `apps/api/src/lib/subscription-gate.ts` — `getActiveSubscription` →
      `getActiveSubscriptionsWithPlans` (array, `orderBy(desc(createdAt))`
      supaya deterministik), `moduleAccess` macro cek UNION modules
      lintas subscription aktif
- [x] `apps/api/src/routes/purchase-invoice-import.route.ts` —
      `moduleAccess: "pembelian"` → `"purchase_invoice"` (15 endpoint,
      angka awal di scope meleset — vendor-payable ikut dihitung terpisah)
- [x] `apps/api/src/routes/sales-invoice-import.route.ts` —
      `moduleAccess: "penjualan"` → `"sales_invoice"` (9 endpoint)
- [x] `apps/api/src/routes/vendor-payable-account-import.route.ts` —
      `moduleAccess: "pembelian"` → `"purchase_invoice"` (6 endpoint)
- [x] `apps/api/src/lib/accurate-scopes.ts` — key `MODULE_ACCURATE_SCOPES`
      diganti ke sub-modul (sekalian fix gap Fase 13: `sales_invoice`
      belum ada scope `customer_view`/`customer_save`)
- [x] Migration data: `drizzle/0009_backfill_sub_modul_dan_koneksi_user.sql`
      — `plans.modules` `"pembelian"`→`"purchase_invoice"`,
      `"penjualan"`→`"sales_invoice"`; `accurate_connections.userId`
      dibackfill dari `subscriptions.userId` (join lewat subscriptionId
      lama); `subscriptions.accurateConnectionId` dibackfill dari relasi
      1:1 lama — diverifikasi 0 baris "hilang" (lihat § Migrasi Data)
- [x] `apps/api/src/routes/subscriptions.route.ts` — `GET /me/subscription`
      (singular) → `GET /me/subscriptions` (plural, semua baris aktif)
- [x] `apps/web/components/app-shell/sidebar.tsx`,
      `app/app/(protected)/layout.tsx`, `page.tsx` — filter UNION modul
      dari semua subscription aktif (via `/me/subscriptions` baru)

### B — Plan jadi katalog per-SKU
- [x] `apps/api/src/db/schema/subscription.schema.ts` — `plans.price`
      balik `notNull` (migration backfill `price=0` utk row lama, § Known
      Limitations)
- [x] `apps/api/src/routes/admin/plans.route.ts` — terima `price` +
      `modules` (tuple literal 5 sub-modul, `minItems:1,maxItems:1`)
- [x] `apps/web/app/admin/(protected)/plans/page.tsx` — form pilih SATU
      sub-modul (radio, dikelompokkan per kategori) + field harga

### C — Koneksi Accurate reusable
- [x] `apps/api/src/db/schema/accurate.schema.ts` — `accurate_connections.subscriptionId`
      (unique) → `userId` (FK, tidak unique)
- [x] `apps/api/src/db/schema/subscription.schema.ts` — `subscriptions`
      tambah `accurateConnectionId` (nullable FK)
- [x] `apps/api/src/workers/index.ts` — `getConnectionForBatch()` lookup
      lewat `subscription.accurateConnectionId`, bukan `WHERE subscriptionId`
- [x] `apps/api/src/routes/accurate.route.ts` — ditulis ulang total:
      `GET /accurate/subscriptions` (status per modul), `GET
      /accurate/connections` (daftar koneksi existing user),
      `POST /accurate/connect` (OAuth baru per subscription),
      `POST /accurate/reuse` (assign koneksi existing, TANPA OAuth ulang),
      `GET /accurate/databases` + `POST /accurate/databases/select`
      (per-connection, bukan per-subscription lagi)
- [x] `apps/web/app/app/(protected)/accurate/page.tsx` — rombak jadi
      daftar per subscription/modul, 2 pilihan (reuse existing / connect
      baru), + halaman pilih Data Usaha per-koneksi

## Referensi
- ADR: `docs/decisions/adr-0019-gating-per-sub-modul-dan-katalog-plan.md`,
  `docs/decisions/adr-0020-accurate-connection-reusable-lintas-subscription.md`
- Architecture doc: `docs/architecture/architecture-subscription.md`,
  `docs/architecture/architecture-accurate-integration.md`

## Keputusan Kecil Selama Eksekusi
- **`drizzle-kit generate` butuh TTY untuk prompt rename-detection**
  (rename `accurateConnections.subscriptionId`→`userId`, beda tabel
  referensi & tipe) — gagal di lingkungan non-interactive tool ini. Solusi:
  transisi 2 langkah — tambah `userId` (nullable) BARENG `subscriptionId`
  lama (nullable, tanpa unique) dulu di 1 migration (0008, pure ADD/ALTER,
  tidak ambigu), backfill data (0009), baru migration terpisah (0010) DROP
  `subscriptionId`. Dicatat di `docs/lessons-learned.md` sebagai teknik
  reusable untuk rename kolom lintas-tabel berikutnya.
- **`t.Union(array.map(...))` merusak inferensi tipe Eden Treaty** —
  `admin/plans.route.ts` awalnya build union modul dari
  `SUB_MODULE_KEYS.map((k) => t.Literal(k))`; `.map()` selalu balikin
  array biasa (bukan tuple), dan Eden Treaty salah infer field `modules`
  jadi `File | File[]` di `apps/web` (ketahuan pas `bun run typecheck`
  apps/web, BUKAN apps/api — schema TypeBox-nya sendiri valid). Fix: tulis
  union sebagai tuple literal eksplisit (5 `t.Literal(...)` manual), bukan
  di-generate dari array. Dicatat di lessons-learned — pola `.map()` ke
  `t.Union` HARUS dihindari proyek ini seterusnya.
- Security review (§ di bawah) menemukan 1 Medium + 4 Low — semua
  diperbaiki LANGSUNG di fase ini (bukan ditunda), termasuk 2 test baru
  (`accurate.route.test.ts`) untuk regresi.
- Manual smoke test end-to-end (sign-up→admin role→create plan→customer
  subscribe 2 modul→reuse 1 koneksi Accurate lintas modul) dilakukan lewat
  `curl` langsung ke `localhost:3001` (bukan browser) — ekstensi Chrome
  tidak terhubung di sesi ini, jadi verifikasi visual UI (render form,
  radio button, dst) TIDAK dilakukan, cuma request/response API nyata.

## Checklist Sebelum Ditutup (sesuai SOP)
- [x] Type check nol error (`bun run typecheck` — apps/api & apps/web)
- [x] Security review dijalankan (subagent `security-auditor`, 25 file)
- [x] Temuan Critical/High sudah diperbaiki (atau tidak ada temuan) — 0 Critical/High
- [x] Temuan Medium/Low dicatat di `docs/lessons-learned.md` — SEMUA (1 Medium + 4 Low) langsung diperbaiki di fase ini, bukan cuma dicatat
- [x] `docs/PROGRESS.md` diupdate
- [x] Migration data existing (pembelian→purchase_invoice, penjualan→sales_invoice) diverifikasi tidak ada subscription/plan yang "hilang" akses — lihat § Migrasi Data

## Migrasi Data (Verifikasi)
`drizzle/0009_backfill_sub_modul_dan_koneksi_user.sql` diterapkan ke DB dev
lokal via `bun run db:migrate`, `drizzle/0010_*.sql` (DROP
`subscription_id` + `SET NOT NULL userId`) diterapkan setelahnya tanpa
error constraint (membuktikan tidak ada baris `userId` NULL tersisa saat
`SET NOT NULL` dijalankan).

Verifikasi query manual SETELAH kedua migration (dijalankan ulang,
BUKAN cuma diasumsikan) menemukan 1 baris stale yang lolos backfill: plan
test lama `"Paket Test Admin (updated)"` (`isActive:false`, dari era
Fase 00/10, 0 subscription referensi) dengan `modules:
["pembelian","penjualan"]` — backfill 0009 cuma menyasar array SATU
elemen persis (`["pembelian"]`/`["penjualan"]`), array 2-elemen gabungan
ini tidak match kondisi manapun. Dihapus manual (bukan diedit — murni
sampah test data, dikonfirmasi 0 subscription referensi id-nya sebelum
dihapus). Re-verifikasi setelah itu: 0 plan dengan taksonomi lama, 0 plan
dengan `modules.length != 1`, 0 `accurate_connections.userId` NULL.

## Known Limitations
- **`plans.price` di-backfill `0` (bukan harga asli) untuk plan lama** yang
  dibuat semasa ADR-0015 berlaku ("Facport sementara tanpa harga") — admin
  WAJIB isi ulang harga sungguhan lewat `/admin/plans` manual untuk plan
  lama manapun yang masih dipakai. Plan baru yang dibuat SETELAH fase ini
  wajib isi harga saat create (`price` sekarang `notNull` di schema &
  validasi Elysia).
- **Race condition sangat sempit di `POST /accurate/connect`** (2 request
  paralel untuk `subscriptionId` yang sama, sebelum salah satu selesai
  OAuth) — secara teori bisa menyisakan 1 `accurate_connections` row
  "yatim" (tidak terpakai subscription manapun karena kalah race
  `db.update`). Bukan celah keamanan (tetap 1 user, tetap 1 tujuan
  koneksi), belum di-guard (butuh unique constraint/row lock) — ditunda
  sampai ada data trafik production nyata yang menunjukkan ini benar-benar
  terjadi.
- **Invariant "1 modul aktif = 1 subscription" TIDAK dijaga unique
  constraint DB** — kalau user (lewat bug di fase checkout mendatang,
  Fase 16-17) somehow bisa checkout modul yang sama 2x, `moduleAccess`
  gate akan konsisten pakai yang PALING BARU (`orderBy(desc(createdAt))`,
  fix security review), tapi 2 subscription itu tetap ada di DB — perlu
  guard eksplisit di endpoint checkout Fase 16-17 supaya skenario ini
  dicegah dari awal, bukan cuma ditangani gate-nya.
- **UI belum diverifikasi visual di browser** (lihat § Keputusan Kecil) —
  request/response API sudah diverifikasi nyata via `curl`, tapi rendering
  komponen React (radio group grouping, dialog reuse-connection,
  select-database flow) belum pernah benar-benar dilihat di browser sesi
  ini. Rekomendasi: user coba manual sebelum lanjut Fase 15, terutama
  halaman `/admin/plans` dan `/accurate`.

## Ringkasan Hasil
Restrukturisasi fondasi langganan selesai penuh sesuai rencana (scope A+B+C):
gating akses modul sekarang per SUB-MODUL (5 modul: sales_invoice,
purchase_invoice, sales_receipt, purchase_payment, journal_voucher) bukan
grup top-level, 1 user bisa punya banyak subscription aktif sekaligus (1
per sub-modul), `plans` jadi katalog 1-SKU-per-sub-modul dengan harga wajib,
dan koneksi Accurate Online sekarang milik USER (bukan subscription) —
reusable lintas subscription/modul yang connect ke Data Usaha yang sama,
mencegah Accurate men-charge customer sebagai "aplikasi terpisah" untuk
company yang sebenarnya sama. Backend: 6 endpoint Accurate ditulis ulang
total, 3 route import disesuaikan taksonomi modul baru, migration data
3-tahap (ADD dual-column → backfill → DROP kolom lama) berhasil diterapkan
tanpa kehilangan data existing. Frontend: sidebar/dashboard/plans-admin/
accurate-page semua disesuaikan ke model multi-subscription. Typecheck 0
error (apps/api & apps/web), 95/95 test pass, security review 0
Critical/High (1 Medium + 4 Low, semua diperbaiki langsung + 2 test
regresi baru). Fondasi ini WAJIB ada sebelum Fase 15 (Invoice) & Fase 16
(Payment Gateway Ipaymu) — keduanya butuh granularitas per-sub-modul untuk
hitung harga cart multi-modul dengan benar.
