# Architecture — Mesin Scope Accurate

> Fase 142. Keputusan dasar: `docs/decisions/adr-0036-koneksi-accurate-per-akun-dan-mesin-scope.md`
> (Decision #4, #7). Bukti perilaku Accurate: `docs/phases/phase-141-*.md`.

## Masalah yang diselesaikan
Scope OAuth per modul ditulis TANGAN di `lib/accurate-scopes.ts` (`MODULE_ACCURATE_SCOPES`),
terpisah dari kode yang benar-benar memanggil endpoint Accurate. Akibatnya sudah 2×
terjadi 403 di production karena fungsi/field baru ditambahkan tanpa scope-nya
(Fase 78 `vendor_*`, Fase 98 `data_classification_*`), dan tidak ada satu tempat pun yang
tahu scope apa yang sebenarnya diberikan ke sebuah koneksi (`accurate_connections`
tidak menyimpan scope; respons token dibuang).

## Fakta Accurate yang dipakai (terbukti Fase 141)
- Respons token memuat `scope` (spasi-terpisah) dan `user{id,email,name}`;
  `approved-scope.do` mengembalikan daftar yang identik.
- Scope kurang → HTTP 403, body XML `<InsufficientScopeException>` dengan
  `<error>insufficient_scope</error>` dan `<scope>nama_scope</scope>` (BUKAN envelope `{s,d}`).
- Runtime tidak selalu menegakkan scope spec (`purchase-invoice/delete.do`), jadi 403
  runtime adalah sumber kebenaran; spec hanya dasar turunan.
- Spec publik (tanpa login): `https://account.accurate.id/open-api/json.do`; tiap operasi
  punya `security: [{default: [scope,...]}]`.

## Tiga lapisan
### 1. Deklarasi — SATU registri endpoint
`lib/accurate-endpoint-registry.ts`: per modul (key `module-catalog.ts`), daftar endpoint
Accurate yang dipanggil, format `"purchase-invoice/save.do"` (+ method bila bukan POST,
mis. `DELETE purchase-invoice/delete.do`). Ditambah `extraScopes` per modul bila ada scope
yang perlu tapi tak terlihat sebagai endpoint langsung — WAJIB disertai alasan tertulis.
Baseline `item_view` tetap.

`lib/accurate-scope-snapshot.json`: peta `"METHOD resource/action.do" → scope[]`, dibuat
skrip `apps/api/scripts/sync-accurate-scopes.ts` dari spec publik (jalankan manual saat
menambah modul; hasil di-commit supaya build tidak bergantung jaringan).

`MODULE_ACCURATE_SCOPES`/`scopesForModules` (API publik yang sama, dipakai
`routes/accurate.route.ts`) menjadi TURUNAN registri+snapshot, bukan tulis tangan.
Tambahan: `ALL_ACCURATE_SCOPES` (gabungan katalog, untuk model 1-otorisasi ADR-0036).

### 2. Simpan — apa yang benar-benar diberikan
Migration Drizzle: `accurate_connections` + `granted_scopes text[]` (nullable),
`accurate_user_id varchar` (nullable; UNIK parsial sejak Fase 143), `accurate_user_email`
(nullable). Callback OAuth mengisi dari respons token. Baris lama = NULL ("belum
diketahui") → diisi malas lewat `approved-scope.do` saat pertama diperiksa; TIDAK pernah
memblokir hanya karena NULL.

### 3. Verifikasi — SATU fungsi
`missingScopes(connection, moduleKey): string[]` (`lib/accurate-scope-check.ts`) = scope
modul − `granted_scopes`. Dipakai di: `/accurate/reuse`, sebelum import dijadwalkan (jalur
upload/confirm tiap modul), awal worker (sebelum `openAccurateSession`), dan status koneksi
untuk UI ("Perbarui izin" — UI sendiri di Fase 144). Kode error baku
`ACCURATE_SCOPE_MISSING` + daftar `missing`.
Deteksi runtime: `parseAccurateEnvelope` mengenali 403 `insufficient_scope`, mem-parse
`<scope>` dari XML, melempar `AccurateScopeError` (bukan galat "non-JSON" seperti sekarang);
worker menandai baris/batch dengan pesan jelas, bukan `expired`.

## Pengaman CI (tes)
1. Setiap literal `"/accurate/api/<res>/<act>.do"` di `lib/**` dan `workers/**` HARUS
   terdaftar di registri ≥1 modul (memindai sumber) — mencegah kelas bug Fase 78/98.
2. Setiap endpoint registri ada di snapshot; setiap scope turunan ada di snapshot.
3. Kunci registri ⊆ Varian Produk `facport` di `module-catalog.ts` (guard Fase 117 tetap).
4. Regresi: scope turunan tiap modul ⊇ daftar tulis-tangan lama (disimpan sebagai fixture
   tes) — perubahan boleh MENAMBAH, tidak boleh menghilangkan diam-diam.

## Yang sengaja tidak dikerjakan di Fase 142 — SUDAH DIKERJAKAN sesudahnya
- Model koneksi 1-per-akun, upsert callback, unik `accurate_user_id`, pointer Data Usaha → **Fase 143** (ADR-0037).
- UI "Perbarui izin" → **Fase 144** (`update_permissions` di mesin status gerbang, `architecture-accurate-connect-gate.md`).
- Migrasi customer → **Fase 145**, dengan keputusan PUTUS TOTAL (tanpa carry-over; ADR-0037 #11, rilis `v2.7.0`).
- Refresh token aman rotasi (ADR-0036 #5) → **Fase 143** (`lib/accurate-token.ts`).

## Checklist modul baru (masuk § 3b `architecture-accurate-integration.md`)
Deklarasikan endpoint di registri; jalankan `sync-accurate-scopes` bila endpoint baru belum
ada di snapshot; tes CI harus hijau. DILARANG membuat alur otorisasi/reconnect baru.


## Perubahan 2026-09-22 — `glaccount_view` dibuang
Diminta 8 modul (warisan katalog lama) tetapi tidak ada kode yang memanggil `glaccount/*.do`; dibuang dari registri dan fixture regresi tes. Efek: pelanggan melihat satu izin lebih sedikit; karena ini mengubah scope yang diminta, pelanggan lama akan diminta "Perbarui Izin" sekali saat rilis berikutnya (bersamaan dengan scope baru Work Order/Roll Over). Kalau nanti butuh lookup akun, daftarkan `GET glaccount/list.do` di modul terkait.
