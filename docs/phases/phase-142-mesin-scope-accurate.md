# Fase 142 — Mesin Scope Accurate

**Status:** Done
**Mulai:** 2026-09-22
**Selesai:** 2026-09-22

## Tujuan
Scope OAuth diturunkan otomatis dari endpoint yang benar-benar dipanggil, disimpan per
koneksi, dan diverifikasi di satu fungsi — supaya kelas bug "fungsi baru, scope lupa"
(Fase 78, 98) tidak bisa terulang. Rancangan: `docs/architecture/architecture-accurate-scope-engine.md`.
Keputusan: ADR-0036 #4, #7.

## Scope (task)
- [x] T1 Skrip `apps/api/scripts/sync-accurate-scopes.ts` + `lib/accurate-scope-snapshot.json`
- [x] T2 `lib/accurate-endpoint-registry.ts` — deklarasi endpoint per modul (18+ modul) + `extraScopes` beralasan
- [x] T3 `MODULE_ACCURATE_SCOPES`/`scopesForModules` jadi turunan registri; tambah `ALL_ACCURATE_SCOPES`; API publik tetap sama
- [x] T4 Tes CI: pemindai endpoint di sumber, snapshot, guard katalog, regresi ⊇ daftar lama
- [x] T5 Migration Drizzle: `granted_scopes`, `accurate_user_id`, `accurate_user_email` (nullable) di `accurate_connections`; callback OAuth mengisi dari respons token
- [x] T6 `lib/accurate-scope-check.ts` `missingScopes()` + isi malas via `approved-scope.do` untuk baris NULL
- [x] T7 Pasang cek di `/accurate/reuse`, jalur jadwalkan-import, awal worker
- [x] T8 `AccurateScopeError` (parse 403 XML `insufficient_scope`) di `lib/accurate.ts`; worker tampilkan pesan jelas
- [x] T9 Update § 3b `architecture-accurate-integration.md` + baris di Peta Dokumen `CLAUDE.md`
- [x] T10 Tambah `purchase_invoice_delete` ke katalog (E8: aman/sejalan spec)

## Di luar scope (fase lain)
Model 1-koneksi-per-akun & upsert callback (143), UI "Perbarui izin" (144), migrasi customer (145),
refresh aman rotasi (143).

## Keputusan Kecil (diambil saat eksekusi)
- **Otorisasi 1 pintu langsung di fase ini** (pilihan user): `/accurate/connect` selalu meminta `ALL_ACCURATE_SCOPES` (35 scope = 34 lama + `purchase_invoice_delete`), bukan menunggu Fase 143. Tidak memperbaiki koneksi lama yang sudah mati (itu Fase 143-145).
- **`glaccount_view` dipertahankan** lewat `extraScopes` beralasan (tidak ada kode yang memanggil `glaccount/*.do`); scope `*_view` warisan (sales_receipt_view, dst) juga dipertahankan sebagai `legacy(...)`. Tes regresi memakai daftar tulis-tangan lama sebagai fixture: scope boleh bertambah, tidak boleh hilang. Tinjau pembuangan di Fase 143.
- Snapshot spec berisi SEMUA 322 operasi (bukan hanya yang dipakai) → menambah endpoint modul baru cukup mendaftar di registri.
- `granted_scopes` NULL = "belum diketahui" (bukan "kosong"): diisi malas via `approved-scope.do` (timeout 5 dtk); gagal → lolos, 403 runtime tetap ditangkap `AccurateScopeError`. `[]` yang diketahui tetap dianggap kurang.
- Cek pra-jadwal dipasang di 18 route × 2 handler (confirm + retry) secara mekanis sebelum `checkTrialRowBudget`; cek di worker menjadi titik tunggal untuk semua modul.
- `AccurateScopeError` TIDAK memanggil `markConnectionExpired` (koneksi hidup, hanya kurang izin).
- Tes 503 `/accurate/connect` yang bergantung urutan (env `ACCURATE_CLIENT_ID`) diperbaiki agar deterministik.

## Known Limitations
- **UI web belum memetakan `ACCURATE_SCOPE_MISSING`** (409 dari `/accurate/reuse`, confirm & retry import): jatuh ke toast generik ("Gagal ... coba lagi") di ~18 halaman import. Pemetaan pesan + tombol "Perbarui izin" → Fase 144.
- Koneksi customer lama yang sudah mati (69% subscription aktif, P2c Fase 141) TIDAK pulih oleh fase ini; butuh otorisasi ulang (Fase 145).
- Model koneksi masih per subscription (INSERT tiap callback); `accurate_user_id` belum unik → Fase 143.
- Refresh token belum aman rotasi (kunci per koneksi, bedakan `invalid_grant` vs galat sementara) → Fase 143.
- Worker tidak menghentikan batch bila `AccurateScopeError` muncul di tengah baris (tiap baris tercatat dengan pesan jelas); cek awal worker menutup kasus umum.
- Tidak ada tes unit khusus untuk cek scope di worker (jalur dijalankan lewat job pg-boss); logika intinya (`checkConnectionScopes`) teruji terpisah.
- Tes 200-cabang `authorizeUrl` kini benar-benar berjalan (env diisi eksplisit di tes).

## Ringkasan Hasil
Scope OAuth Accurate sekarang diturunkan otomatis dari registri endpoint + snapshot spec resmi, disimpan per koneksi (`granted_scopes`, `accurate_user_id`, `accurate_user_email`, migrasi 0027, aditif), dan diverifikasi oleh satu fungsi (`checkConnectionScopes`) di `/accurate/reuse`, konfirmasi/retry import (18 modul) dan awal worker. Galat 403 `insufficient_scope` dikenali sebagai `AccurateScopeError`. Otorisasi selalu meminta semua scope.
- Typecheck (api + web) bersih; lint web bersih; **1373 tes API lolos** (naik dari 1354).
- Security review: tidak ada kebocoran field kolom baru (respons memilih field eksplisit); temuan Medium (`approved-scope.do` tanpa timeout di jalur request) DIPERBAIKI; temuan Low dicatat di `docs/lessons-learned.md` 2026-09-22 (galat token/refresh menyertakan nilai token di pesan → log/Sentry).
- Pengaman CI terbukti lewat uji mutasi: menghapus `TAX` dari registri `sales_receipt` membuat tes regresi gagal.
