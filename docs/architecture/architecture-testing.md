# Architecture — Testing Strategy

> `docs/SOP.md` Langkah 3-4 mewajibkan `bun run test` lolos sebelum fase
> ditutup. Dokumen ini definisikan APA yang wajib di-test dan SEBERAPA DALAM
> — supaya "test" tidak jadi file kosong/placeholder yang cuma bikin gate
> hijau tanpa substansi.

## Prinsip
- Test yang WAJIB ada itu yang melindungi **business logic & security-critical
  path** — bukan coverage number untuk coverage number.
- Kalau ragu apakah sesuatu perlu di-test: tanya "kalau ini rusak diam-diam,
  seberapa parah dampaknya sebelum ketahuan manusia?" Semakin parah/diam-diam
  → semakin wajib di-test.

## apps/api — Wajib Ada Test Untuk
- **Service layer** (`services/*.service.ts`) — unit test, business logic
  murni (tanpa hit DB asli — mock/in-memory).
- **Auth flow** — login (kredensial benar/salah), token expiry, refresh
  token rotation, akses endpoint protected tanpa/dengan token.
- **Validasi schema Elysia** — request dengan payload invalid HARUS ditolak
  (test negatif, bukan cuma test payload valid).
- **Ownership/permission check** — user A tidak boleh akses resource milik
  user B (ini kategori bug yang paling gampang lolos code review manual).
- **Migration** — kalau ada data transform (bukan sekadar tambah kolom),
  test migration di DB sample sebelum di-apply ke production.

## apps/api — Boleh Skip Test Formal (opsional)
- Route handler yang cuma delegasi ke service tanpa logic tambahan (logic-nya
  sudah ke-cover di service test).
- CRUD generik tanpa business rule khusus (masih disarankan smoke test 1x,
  tidak wajib exhaustive).

## apps/web
- Component test (React Testing Library) untuk komponen dengan **logic**
  (form validation, conditional render berdasar state) — bukan komponen
  presentational murni.
- E2E (Playwright, kalau dipakai) untuk **critical user flow** saja: login,
  checkout/submit form utama, bukan semua halaman.

## Mocking
- **DB**: pakai test database terpisah (docker container sementara / testcontainers)
  untuk test yang benar-benar butuh query nyata (mis. constraint unik, cascade
  delete). Untuk unit test service logic murni, mock Drizzle query builder.
- **MinIO**: mock client di unit test. Kalau perlu test upload real, pakai
  MinIO container terpisah di CI (bukan hit MinIO production/dev).
- **JANGAN** mock hal yang justru inti dari yang mau divalidasi (mis. mock
  validasi schema itu sendiri saat testing bahwa validasi menolak payload salah).

## Menjalankan
```bash
bun run test              # semua test, dijalankan CI (ci.yml) & release gate (release.yml)
bun run test --watch      # dev lokal
```

## Kapan Test Dianggap "Cukup" untuk Menutup Fase (checklist SOP Langkah 4)
- [ ] Semua path di atas ("Wajib Ada Test Untuk") ter-cover untuk fitur yang
      dikerjakan di fase ini — bukan seluruh codebase sekaligus.
- [ ] Ada minimal 1 test negatif per endpoint baru (payload invalid / auth gagal /
      ownership gagal) — bukan cuma happy path.
- [ ] Test yang di-skip/pending WAJIB ditulis alasannya di
      `docs/phases/phase-XX-{nama}.md` bagian Known Limitations — bukan
      dibiarkan `.skip()` tanpa catatan.
