# Fase 130 — Tampilkan Expiry Aktual (Admin User-Detail + /subscribe Customer)

**Status:** Done
**Mulai:** 2026-09-17
**Selesai:** 2026-09-17

## Tujuan
Bagian 2.1 & 2.2 dari audit Part 2 (permintaan user 2026-09-17). Data
`startAt`/`endAt` subscription sudah ada di database dan sebagian sudah
di-return backend, tapi TIDAK ditampilkan di 2 tempat yang admin/customer
sebenarnya butuh lihat: halaman detail user admin, dan halaman
`/subscribe` customer sendiri (yang cuma tampilkan harga+durasi katalog,
bukan tanggal subscription AKTUAL yang dia punya).

Juga menutup audit "apakah 1 Data Usaha bisa punya >1 subscription aktif
untuk modul yang sama" — jawaban: tidak, dicegah di level aplikasi
(checkout/trial/admin manual-create semua auto-cancel subscription lama
untuk modul+Data Usaha yang sama). Tidak ada perubahan kode untuk ini,
cuma didokumentasikan formal di architecture doc (lihat § Referensi).

## Scope
- [x] `apps/api/src/routes/admin/user-subscriptions.route.ts` — tambah
      `startAt` + `durationDays` (join `plans`) ke response.
- [x] `apps/web/app/admin/(protected)/users/[id]/page.tsx` — kolom baru
      "Durasi"/"Berlaku Sampai" di tabel subscription per Data Usaha.
- [x] `apps/web/components/subscribe/subscribe-form.tsx` — tangkap
      `startAt`/`endAt` per modul ke state baru, thread ke bawah.
- [x] `apps/web/components/subscribe/product-catalog-section.tsx`,
      `category-card.tsx` — thread-through prop baru.
- [x] `apps/web/components/subscribe/module-pricing-panel.tsx` — render
      tanggal mulai/berakhir subscription aktual saat modul aktif.

## Referensi
- Architecture doc: `docs/architecture/architecture-subscription.md`
- Plan lengkap (3 fase, 130-132): `/Users/webane/.claude/plans/polymorphic-dazzling-engelbart.md`

## Keputusan Kecil Selama Eksekusi
- Type `SubscriptionInfo` (`{startAt, endAt}`) ditaruh di
  `module-pricing-panel.tsx` (bukan file terpisah) — sejalan dengan
  `Plan` yang sudah di situ, 1 file jadi "home" tipe shared fitur
  accordion pricing ini.
- Audit duplikasi subscription TIDAK menghasilkan perubahan kode
  (lihat § architecture-subscription.md "Audit — 1 Modul Bisa >1
  Subscription Aktif") — keputusan didokumentasikan formal di sana,
  bukan cuma dijawab di chat.

## Checklist Sebelum Ditutup (sesuai SOP)
- [x] Type check nol error (`bun run typecheck`) — api+web, 0 error
- [x] `bun run lint` — 0 error
- [x] `bun run test` (apps/api) — 1105 pass, 0 fail (tidak ada logic
      baru, cuma tambah field ke select+response yang sudah ada)
- [x] Security review dijalankan — 0 temuan (field baru bukan data
      sensitif, endpoint admin sudah permission+scope-gated existing,
      filter Data Usaha di `/subscribe` sudah benar sebelum map baru
      dibangun)
- [x] `docs/PROGRESS.md` diupdate

## Known Limitations
- Verifikasi visual browser BERHASIL untuk sisi customer (`/subscribe`,
  Data Usaha "FAC Institute" — tanggal "Mulai 14 Sep 2026, 12.42 —
  Berakhir 9 Sep 2027, 12.42" tampil benar, cocok dengan dashboard).
  Sisi ADMIN (`admin/users/[id]`) TIDAK terverifikasi visual — kredensial
  login admin yang tersimpan di browser dev environment ini sudah stale
  ("Email atau password salah"), bukan quirk yang sudah didokumentasikan
  sebelumnya (§ memory `feedback_browser_verification_env_quirks.md`),
  jadi tidak dipaksakan coba-coba password lain. Verifikasi diganti kode
  review — kolom baru pakai fungsi `formatDate`/`formatDuration` yang
  IDENTIK dengan yang baru saja dikonfirmasi benar di sisi customer,
  diterapkan ke penambahan field backend yang typecheck+test hijau.

## Ringkasan Hasil
Admin (`admin/users/[id]`) dan customer (`/subscribe`) sekarang
menampilkan tanggal mulai/berakhir subscription AKTUAL (bukan cuma info
katalog plan) — data `startAt`/`endAt` sebenarnya sudah ada di DB sejak
lama, murni kerja surfacing, tidak ada endpoint/logic baru. Audit
duplikasi subscription per modul+Data Usaha ditutup dengan kesimpulan
"aman via mitigasi aplikasi, sengaja belum di-hard-constraint DB" —
didokumentasikan permanen di architecture doc.
