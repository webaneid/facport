# Fase 17 — Self-Service Checkout UI (Cart Multi-Modul)

**Status:** Done
**Mulai:** 2026-09-05
**Selesai:** 2026-09-05

## Tujuan
Fase 16 (ADR-0022) sudah membangun backend checkout PENUH (`POST
/subscriptions/checkout`, terima cart `{planIds: uuid[]}`) dan halaman
bayar customer (`/app/billing/[orderId]/pay`, pilih metode + upload
bukti) — tapi belum ada UI untuk MEMILIH sub-modul itu sendiri (katalog
publik di landing, dan halaman cart di dashboard). Fase ini
menyambungkan keduanya: katalog publik (landing, checkbox pilih 1+) →
login (bawa pilihan cart) → halaman cart di dashboard → checkout →
redirect ke halaman bayar yang SUDAH ADA. TIDAK membangun ulang backend
checkout atau logic pembayaran apa pun — murni UI penghubung.

Referensi: `docs/phases/phase-16-payment-manual.md` § Known Limitations
("Belum ada UI katalog/cart publik"), `docs/decisions/adr-0022-payment-manual-qris-transfer.md`.

## Scope
- [x] `apps/web/lib/module-options.ts` (baru) — ekstrak `MODULE_OPTIONS`/
      `MODULE_GROUPS`/`moduleLabel()` dari `admin/plans/page.tsx` (dipakai
      3 tempat sekarang: admin plans, landing, subscribe)
- [x] `apps/web/app/admin/(protected)/plans/page.tsx` — pakai
      `module-options.ts` yang di-share (refactor kecil, perilaku sama)
- [x] `apps/web/app/landing/page.tsx` + `apps/web/app/landing/catalog-cart.tsx`
      (baru) — rewrite katalog: pakai komponen UI (`Card`/`Button`/`Badge`)
      bukan HTML polos, checkbox pilih 1+ sub-modul (client component
      terpisah `CatalogCart`), ringkasan total real-time. CTA
      "Berlangganan Sekarang" → link ke
      `${APP_URL}/login?redirect=/subscribe?plans=...`
- [x] `apps/web/app/app/(protected)/subscribe/page.tsx` (baru) — cart
      halaman dashboard (sudah login): baca `?plans=` query (pre-select
      dari landing), fetch `GET /plans` + `GET /me/subscriptions` (disable
      checkbox utk modul yang SUDAH aktif, badge "Sudah Berlangganan",
      cegah error `MODULE_ALREADY_SUBSCRIBED` yang membingungkan), tombol
      "Checkout" → `POST /subscriptions/checkout` → redirect
      `/billing/{orderId}/pay`
- [x] `apps/web/components/app-shell/sidebar.tsx` — nav item baru
      "Berlangganan" (surface app, TANPA moduleKey) → `/subscribe`
- [x] `apps/web/app/app/(protected)/page.tsx` (dashboard) — banner invoice
      `status: "unpaid"`, link langsung ke `/billing/{orderId}/pay` kalau
      cuma 1 invoice belum lunas, ke `/billing` kalau lebih dari 1

## Referensi
- Architecture doc: `docs/architecture/architecture-payment.md`,
  `docs/architecture/architecture-domain-routing.md` (struktur surface)
- ADR: `docs/decisions/adr-0022-payment-manual-qris-transfer.md` (tidak
  ada ADR baru fase ini — murni UI di atas backend yang sudah settle)

## Keputusan Kecil Selama Eksekusi
- **`module-options.ts` diekstrak jadi shared lib** — awalnya di rencana
  cuma disebut "ekstrak", diputuskan sekalian tambah helper `moduleLabel()`
  (dipakai `catalog-cart.tsx` + `subscribe/page.tsx`, pola yang sama
  berulang `MODULE_OPTIONS.find(...)?.label ?? m`).
- **Dashboard banner unpaid invoice — link langsung ke halaman bayar HANYA
  kalau persis 1 invoice belum lunas** (kalau lebih dari 1, arahkan ke
  `/billing` supaya user pilih sendiri) — hindari ambiguitas "invoice
  mana yang dimaksud tombol ini" kalau ada beberapa.
- **Landing TIDAK coba deteksi sesi existing** (customer yang kebetulan
  sudah login di app.subdomain) — CTA checkout SELALU lewat `/login`,
  dicatat sebagai Known Limitation sadar, bukan kelupaan.

## Checklist Sebelum Ditutup (sesuai SOP)
- [x] Type check nol error (`bun run typecheck` — apps/api & apps/web)
- [x] Security review dijalankan — di sesi utama (BUKAN subagent, walau
      7 file diubah/dibuat — dipertimbangkan: pure UI konsumsi endpoint
      yang SUDAH diaudit penuh Fase 16, tidak ada surface baru: tidak ada
      endpoint baru, tidak ada logic authorization baru di client, tidak
      ada secret di `NEXT_PUBLIC_*`, tidak ada risiko open-redirect
      (`target` redirect dibangun dari `plan.id` server-sourced, bukan
      input bebas user)
- [x] Temuan Critical/High sudah diperbaiki (atau tidak ada temuan) — 0 temuan
- [x] Temuan Medium/Low dicatat di `docs/lessons-learned.md` kalau ditunda — tidak ada temuan
- [x] `docs/PROGRESS.md` diupdate

## Known Limitations
- **Tidak ada deteksi sesi existing lintas-subdomain** — landing SELALU
  arahkan ke `/login` walau user kebetulan sudah login di app.subdomain
  (browser sama). Edge case jarang, UX sedikit redundant (login ulang),
  bukan bug — di luar scope MVP fase ini.
- **Verifikasi UI browser sungguhan TIDAK dilakukan** (ekstensi Chrome
  tidak tersedia sesi ini, sama seperti Fase 14-16) — katalog landing,
  halaman `/subscribe`, dan banner dashboard belum pernah dilihat
  langsung di browser. Typecheck lintas-package (Eden Treaty, tipe
  request/response `apps/web` diturunkan langsung dari `App` type
  `apps/api`) memberi keyakinan bentuk data cocok, tapi BUKAN pengganti
  verifikasi visual/interaksi nyata.
- **Alur checkout end-to-end (landing → login bawa cart → subscribe →
  checkout → redirect ke halaman bayar) belum diverifikasi manual sama
  sekali** — logic tiap potongan (redirect URL, pre-select dari query,
  guard modul aktif, panggil endpoint checkout) benar secara kode/
  typecheck, tapi alur PENUH lintas 3 halaman belum pernah dicoba
  langsung. Rekomendasi kuat: coba manual sebelum anggap Fase 17 "siap
  pakai customer sungguhan", terutama sebelum lanjut Fase 18.

## Ringkasan Hasil
Katalog publik (landing) dan halaman cart dashboard (`/subscribe`)
sekarang menyambungkan pemilihan sub-modul ke backend checkout yang
sudah dibangun penuh di Fase 16 — TIDAK ada backend baru di fase ini,
murni UI penghubung. Landing direnovasi dari HTML polos jadi komponen UI
konsisten dengan desain sistem (Card/Button/Badge), checkbox pilih 1+
sub-modul dengan ringkasan total real-time; CTA checkout membawa pilihan
cart lewat query `?plans=` ke alur login (memakai mekanisme `?redirect=`
yang SUDAH ADA di `LoginForm`, tidak perlu dibangun baru), mendarat di
`/subscribe` dengan cart ter-prefill. Halaman `/subscribe` menambah
proteksi UX yang checkout endpoint sendiri sudah tegakkan (guard modul
sama 2x, Fase 16 security review) — checkbox modul yang sudah aktif
otomatis nonaktif dengan badge "Sudah Berlangganan", cegah error
membingungkan sebelum sempat terjadi. Dashboard dapat banner reminder
invoice belum dibayar, link langsung ke halaman bayar yang sudah lengkap
(Fase 16). Modul `module-options.ts` diekstrak jadi shared lib (dipakai
3 halaman sekarang). Typecheck 0 error (apps/api & apps/web tidak
terpisah — lintas-package via Eden Treaty), lint 0 error, security
review di sesi utama 0 temuan (pure UI, tidak ada surface baru).
**Verifikasi end-to-end via browser sungguhan BELUM dilakukan** (§ Known
Limitations) — direkomendasikan sebelum Fase 18.
