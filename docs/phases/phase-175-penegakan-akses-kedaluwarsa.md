# Fase 175 — Penegakan akses tepat di waktu akhir

**Status:** Done · **Mulai:** 2026-10-07 · **Selesai:** 2026-10-07 · ADR-0041

## Tujuan
Akses fitur berhenti TEPAT di `end_at` (tidak menunggu job harian), job kedaluwarsa & pengingat memakai jadwal yang tepat, dan Data Usaha tetap bisa diakses saat fitur kedaluwarsa.

## Scope
- [x] Gerbang (`subscription-gate.ts`): `getOwnedSubscriptionsWithPlans` & `getAccessibleSubscriptionsWithPlans` menambah `end_at IS NULL OR end_at > now`
- [x] `EXPIRE_SUBSCRIPTIONS` tiap 10 menit (dulu harian 01:00 UTC) — notifikasi/email berakhir tepat waktu
- [x] `NOTIFY_EXPIRING_SOON` jam 09:00 di zona perusahaan (`tz` pg-boss; dulu 00:00 UTC)
- [x] `lib/job-schedules.ts` (jadwal satu tempat) + tes
- [x] Tes: status `active` tetapi `end_at` lewat → 403; 1 menit lagi → 200; `end_at` NULL tetap berlaku; Data Usaha tetap bisa diakses saat fitur kedaluwarsa
- [ ] DITUNDA (butuh keputusan): akses MEMBER lewat seat saat langganan seat kedaluwarsa (lihat Temuan)

## Keputusan Kecil Selama Eksekusi
- `end_at` NULL pada baris aktif dianggap berlaku — data lama tanpa tanggal akhir tidak memutus akses siapa pun.
- Pembaca lain `status = 'active'` (statistik admin, daftar, pengumuman) TIDAK diubah: bukan pemberi akses, dan job 10 menit membuat selisihnya ≤ 10 menit.
- Pengingat tetap dihitung per `daysLeft` kontinu (H-7/H-3/H-1; trial H-3/H-1) dan dijalankan sekali sehari 09:00 zona perusahaan; hanya jamnya yang berubah. Zona dibaca saat worker menjadwalkan (ganti zona di setting → restart worker).

## Temuan (pra-ada, BUKAN dikerjakan di fase ini)
`member_seats.status = 'active'` (member yang menempati slot) memberi akses ke Data Usaha pemilik TANPA melihat langganan seat (`seat_addon`) yang menopang slot itu. Dokumen mengatakan "expiry slot otomatis ikut expiry subscription seat", tetapi job kedaluwarsa hanya membalik status langganan — tidak menyentuh `member_seats`, dan gerbang member hanya cek `member_seats.status`. Artinya member tetap punya akses setelah seat-nya habis. Menutupnya akan MEMUTUS akses member yang seat-nya sudah lewat di production → perlu keputusan pemilik + hitung dampak (SQL read-only) sebelum dikerjakan.

## Ringkasan Hasil
Gerbang mengecek `end_at` langsung; job 10 menit & pengingat 09:00 zona perusahaan; 3 tes gerbang baru + 1 tes jadwal. Suite API penuh: 2003 lulus, 0 gagal. Typecheck bersih.

## Known Limitations
- Seat/member (Temuan di atas) belum ditegakkan. Belum dilihat di browser; migrasi 0042 + perilaku baru belum di production.

## Checklist Sebelum Ditutup (sesuai SOP)
- [x] Type check nol error
- [x] Security review (manual: perubahan HANYA mempersempit akses; tanpa endpoint baru; query tetap parameterized Drizzle)
- [x] Temuan Medium/Low dicatat bila ditunda (Temuan seat di atas)
- [x] `docs/PROGRESS.md` diupdate
