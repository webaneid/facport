# Fase 46 — Customer Care (Profil CS + WhatsApp Rotator + Analitik)

**Status:** Done
**Mulai:** 2026-09-06
**Selesai:** 2026-09-06

## Tujuan
User minta fitur Customer Care: profil CS (foto, nomor WhatsApp, nama,
posisi) ditampilkan ke customer di laman app lewat floating widget,
dengan WhatsApp rotator (klik dihitung, gantian antar-CS), jam kerja
yang membuat CS otomatis online/offline (timezone-aware), tombol admin
"matikan hari ini" (auto reset besok), dan analitik jumlah customer
yang sudah dilayani.

Rencana lengkap (riset, skema, API, 4-batch eksekusi) ada di plan file
Plan Mode sesi ini — diringkas ke sini poin pentingnya.

## Scope

### Batch A — Fondasi: Schema + CRUD Agent + Upload Foto
- [x] Migration: `customer_care_agents`, `customer_care_clicks`
- [x] Seed permission `customer_care.manage`
- [x] `lib/customer-care.ts` (`isWithinWorkHours`, `isAgentOnline`, `pickNextAgent`)
- [x] `admin/customer-care.route.ts` — CRUD agent + upload foto
- [x] Admin page: list agent + dialog tambah/edit + upload foto

### Batch B — Jam Kerja + Toggle Off Hari Ini
- [x] Settings jam kerja (GET/PUT) + dialog popup di admin page
- [x] Endpoint `offline-today`/`online-now` + tombol di list agent

### Batch C — Rotator + Widget Customer
- [x] `GET /me/customer-care/next`, `POST /me/customer-care/click`
- [x] `CustomerCareWidget` + pasang di `app/(protected)/layout.tsx`

### Batch D — Analitik
- [x] `GET /admin/customer-care/analytics` (today/week/month)
- [x] Tampilkan di admin page (StatCard + kolom per-agent)

## Referensi
- Plan mode file (riset lengkap, skema): `/Users/webane/.claude/plans/sorted-inventing-volcano.md`
- Architecture doc: `docs/architecture/architecture-customer-care.md` (baru)

## Keputusan Kecil Selama Eksekusi
- Upload foto CS mirror persis `admin/branding.route.ts` `POST /logo`
  (resize webp, bucket publik) — BUKAN Media Library modal (foto 1-per-agent,
  tidak butuh reuse/search lintas fitur).
- Jam kerja disimpan sebagai menit-dari-tengah-malam (integer), BUKAN
  string "HH:MM" — lebih gampang dibandingkan numerik.
- "Off hari ini" pakai kolom `manuallyOfflineUntil` (timestamp, diisi
  endOfDay company timezone) — auto-online lagi begitu lewat tengah
  malam TANPA job/cron, tinggal dibandingkan `> now()`.
- Nomor WhatsApp TIDAK di-expose di `GET /me/customer-care/next` (cuma
  nama/posisi/foto) — nomor baru dikembalikan di response `POST /click`,
  mengurangi permukaan scraping nomor WA.

## Checklist Sebelum Ditutup (sesuai SOP)
- [x] Type check nol error (`bun run typecheck`, api+web) — 0 error
- [x] Security review dijalankan (inline) — 0 temuan Critical/High
- [x] Temuan Critical/High sudah diperbaiki — tidak ada
- [x] Temuan Medium/Low dicatat — 1 temuan Low (§ Known Limitations)
- [x] `docs/PROGRESS.md` diupdate

## Known Limitations
- `POST /me/customer-care/click` tidak rate-limited/de-duplicated —
  customer yang klik berkali-kali sedikit mempengaruhi keadilan rotasi
  hari itu (analitik "customer unik" TIDAK terpengaruh, itu `COUNT
  DISTINCT`). Risiko rendah, diterima untuk sekarang — detail di
  `docs/architecture/architecture-customer-care.md` § Known Limitations.
- Verifikasi visual browser TIDAK dilakukan (ekstensi Chrome tidak
  disambungkan sesi ini) — diverifikasi lewat typecheck penuh (api+web),
  lint 0 error, test suite penuh (35 test baru, termasuk round-trip
  timezone dan rotasi).

## Ringkasan Hasil
Fitur Customer Care lengkap: profil CS (foto, nama, posisi, WhatsApp)
dikelola admin lewat `/admin/customer-care` (CRUD + upload foto + jam
kerja popup + toggle "Off Hari Ini" per-agent + analitik "dilayani hari
ini"), ditampilkan ke customer lewat floating widget di SEMUA halaman
app. Rotasi WhatsApp otomatis (pilih agent online dengan klik paling
sedikit hari ini) dan status online DIHITUNG (bukan disimpan) dari jam
kerja + toggle manual — SEMUANYA timezone-aware (reuse infrastruktur
Fase 44/ADR-0028), termasuk "off hari ini" yang auto-reset besok tanpa
job/cron (`manuallyOfflineUntil` dibandingkan langsung ke `now()`).

Nomor WhatsApp sengaja tidak pernah di-expose sampai titik klik
(`GET /next` cuma balikin identitas visual), dan klik itu sendiri
DIVALIDASI ULANG server-side (agent yang diklaim client harus masih
online SEKARANG) — cegah bypass rotasi lewat manipulasi client.

Typecheck 0 error (api+web). Test suite `apps/api` **352 pass / 0 fail**
(35 baru: `lib/customer-care.test.ts`, `lib/company-timezone.test.ts`,
`routes/admin/customer-care.route.test.ts`,
`routes/customer-care.route.test.ts`). Lint 0 error. Security review
inline: 0 temuan Critical/High, 1 temuan Low (klik tidak rate-limited,
diterima sebagai known limitation).
