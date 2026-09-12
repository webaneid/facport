# Lessons Learned

> Format tiap entri: tanggal, masalah, root cause, fix, pencegahan.
> Wajib diisi di akhir sesi debugging signifikan — minta Claude nulis di sini
> sebelum menutup sesi.

---

## 2026-09-12 — 4 error lint `react-hooks/set-state-in-effect` numpuk sampai mau rilis v2.0.0 — `lint` tidak pernah di-gate lokal
**Konteks:** Saat CI (`ci.yml`) jalan di PR #58 (release develop→main),
step "Lint" gagal dengan 4 error `react-hooks/set-state-in-effect` di 4
file BERBEDA dari 3 fase berbeda (Fase 109 `pilih-usaha-form.tsx`, Fase
110 `subscribe-form.tsx` & `team-form.tsx`, dan fix admin invoice dari
re-audit sesi ini `admin/invoices/page.tsx`) — semuanya lolos `bun run
typecheck` (yang memang TIDAK cek aturan ini) dan tidak pernah ketahuan
karena **`bun run lint` tidak pernah dijalankan lokal**, cuma jalan di
CI (`ci.yml`) yang sebelumnya juga gagal lebih dulu di step "Start MinIO"
(§ entri di atas) — jadi step Lint yang sebenarnya gagal tidak pernah
sampai dieksekusi sampai bug MinIO itu ketutup duluan.

**Root cause SOP:** `docs/SOP.md` Langkah 3 cuma menyebut `bun run
typecheck`, TIDAK PERNAH menyebut `bun run lint` — jadi skill
`phase-workflow` pun tidak pernah menjalankannya sebagai gate penutup
fase. Lint HANYA jadi gate di CI (`ci.yml`), bukan gate lokal sebelum
fase ditutup.

**Fix kode (3 pola beda, disesuaikan kasusnya):**
1. `pilih-usaha-form.tsx` — baca `localStorage` sekali saat mount: pola
   SUDAH ADA di codebase (`app-shell/sidebar.tsx`,
   `import/arsip/page.tsx`) — pakai `// eslint-disable-next-line
   react-hooks/set-state-in-effect` dengan alasan ("baca external system
   sekali saat mount"), BUKAN lazy `useState` initializer (sempat dicoba,
   dibatalkan — beresiko hydration mismatch karena komponen ini SSR
   sebagai bagian Server Component `page.tsx`, `typeof window` di
   initializer bikin render server vs client pertama beda).
2. `subscribe-form.tsx` — `selectedSeatPlanId` di-derive ULANG dari
   `seatPlans` via effect, padahal `seatPlans` sendiri sudah derived
   (via `useMemo`) dari state yang sama, tanpa sistem eksternal apa pun
   — diubah total jadi "derived value dihitung saat render": state cuma
   simpan override eksplisit user (`selectedSeatPlanIdOverride`),
   `selectedSeatPlan` dihitung tiap render sebagai
   `seatPlans.find(...) ?? seatPlans[0] ?? null` — effect dihapus total.
3. `team-form.tsx` — fetch data awal via fungsi `load()` level-komponen
   dipanggil di effect: pola SAMA PERSIS yang sudah ada di ~15 file lain
   (semua halaman `import/.../page.tsx`, `notifications/page.tsx`, dst)
   — cukup tambah `eslint-disable-next-line` yang sama.
4. `admin/invoices/page.tsx` — effect reset `selectedDataUsahaId`/
   `dataUsahaOptions` SINKRON begitu `selectedUserId` berubah (murni
   derived dari prop yang sama, bukan sinkronisasi sistem eksternal) —
   diubah ke pola resmi React "adjust state during render" (bandingkan
   `selectedUserId` vs state `prevSelectedUserId` yang disimpan, reset
   LANGSUNG di body komponen saat beda, tanpa `useEffect`) — effect-nya
   sendiri disederhanakan jadi CUMA fetch (bagian yang genuinely butuh
   effect, sinkron ke API eksternal).

**Fix proses:** `docs/SOP.md` Langkah 3 diupdate — `bun run lint` sekarang
WAJIB nol error bersamaan dengan `typecheck`, bukan cuma gate CI.

**Pencegahan:** jangan anggap fase "bersih" cuma dari `typecheck` hijau —
`lint` cek kelas bug berbeda (pola hook yang salah, bukan type error) dan
HARUS dijalankan lokal di setiap penutupan fase mulai sekarang, sesuai
SOP yang sudah diupdate.

## 2026-09-12 — Deploy manual v2.0.0 pertama sejak restrukturisasi Data Usaha: 2 gap dokumentasi-vs-realita ditemukan
**Konteks:** Saat akhirnya deploy manual production untuk v2.0.0 (migrasi
besar Data Usaha Fase 106-111, backfill wajib), ketahuan 2 hal yang
SEMUA dokumen (`architecture-deployment.md`, `deployment-server-setup.md`,
`architecture-backup.md`) asumsikan tapi TIDAK PERNAH diverifikasi ke
server nyata:

1. **Path server SEBENARNYA `/opt/facport`, bukan `/opt/app`** seperti
   ditulis di SEMUA dokumen deploy. User konfirmasi langsung dari
   `wasugi@srv1269544:/opt/facport$`.
2. **Backup otomatis untuk facport TIDAK PERNAH disetup di server
   produksi nyata** — `crontab -l` cuma berisi jadwal project LAIN yang
   numpang di VPS sama (`webane-admin`, `jalamandala`/`forbis.id`), tidak
   ada satu baris pun untuk facport. `scripts/backup-db.sh` tidak ada di
   server (cuma ada di git repo, langkah scp-nya tidak pernah dijelaskan
   eksplisit di `deployment-server-setup.md` — cuma `docker-compose.prod.yml`/
   `Caddyfile`/`.env.production.example` yang ada instruksi scp-nya).
   `mc` (MinIO client) juga belum terinstall, `rclone` ADA tapi remote
   `gdrive`-nya belum diverifikasi kepakai untuk project ini.

**Kenapa baru ketahuan sekarang**: ini DEPLOY MANUAL PERTAMA sejak
restrukturisasi besar — sebelumnya tidak pernah ada kebutuhan urgent
untuk benar-benar SSH+verifikasi server nyata sedetail ini (Fase-fase
sebelumnya lebih kecil/tidak butuh migration berisiko).

**Mitigasi SEMENTARA untuk deploy ini**: backup manual sekali via
`pg_dump` langsung (bukan lewat `scripts/backup-db.sh`, karena script-nya
tidak ada di server) — didownload ke komputer lokal user lewat `scp`
supaya tidak cuma nginap di server yang sama.

**WAJIB ditindaklanjuti** (belum dikerjakan saat entri ini ditulis):
- Setup backup otomatis SUNGGUHAN di `/opt/facport` (scp script, install
  `mc`, verifikasi rclone remote, tambah crontab yang benar).
- Update SEMUA path `/opt/app` → `/opt/facport` di 3 file dokumentasi
  (`architecture-deployment.md`, `deployment-server-setup.md`,
  `deployment-new-domain-onboarding.md`) — BELUM dilakukan, jangan lupa.
- `deployment-server-setup.md` tambah langkah scp `scripts/` eksplisit
  (gap yang bikin backup tidak pernah ke-setup dari awal).

**Pencegahan**: dokumentasi server-setup yang ditulis SEBELUM server
sungguhan pernah dites end-to-end itu rencana, bukan fakta — verifikasi
ke server nyata (path, crontab, binary yang terinstall) sebelum
mempercayai dokumennya, terutama untuk hal safety-critical seperti backup.

## 2026-09-12 — CI/CD `Start MinIO` gagal `pull access denied` — docker.io rate-limit anonymous pull, pindah ke quay.io
**Konteks:** Tepat saat mau release v2.0.0 (develop → main), `Deploy Staging`
lalu `ci.yml` di PR #58 gagal berulang (3x, ~20 menit) di step "Start
MinIO" paling awal (sebelum typecheck/test sempat jalan) dengan error
`docker: Error response from daemon: pull access denied for minio/minio,
repository does not exist or may require 'docker login': denied`.

**Root cause:** Bukan masalah kode/workflow kita — `minio/minio` di
`docker.io` kena *anonymous pull rate-limit* di pool IP shared runner
GitHub Actions (Docker Hub sendiri lapor status "fully operational", ini
rate-limit per-IP bukan outage). Step ini sempat sukses di run ~21 jam
sebelumnya dengan image reference yang SAMA — jadi benar-benar soal
limit, bukan image hilang/rename.

**Fix:** Ganti referensi image di 3 workflow (`ci.yml`,
`deploy-staging.yml`, `release.yml`) dari `minio/minio` (docker.io) ke
`quay.io/minio/minio` — ini registry resmi MinIO saat ini (docs MinIO
sendiri sudah mengarahkan ke quay.io, docker.io jadi distribusi lama),
dan request-nya tidak masuk pool anonymous-pull Docker Hub sama sekali.

**Addendum (sama hari) — ternyata juga kena di VPS produksi, bukan cuma CI.**
Saat `docker compose pull` pertama kali untuk deploy v2.0.0 di VPS
produksi (`/opt/facport`, shared dengan project lain), `minio/minio:latest`
gagal dengan error IDENTIK. VPS ini IP-nya dipakai bersama banyak
workload docker lain (beberapa project lain numpang di server yang sama)
— jadi limit anonymous docker.io kena dari sisi server juga, bukan cuma
runner CI. Fix yang SAMA diterapkan ke `docker-compose.prod.yml` DAN
`docker-compose.staging.yml` (`image: quay.io/minio/minio:latest`).
**Konsekuensi praktis**: file compose di server (`/opt/facport/*.yml`)
adalah COPY manual (`scp`), TIDAK auto-update dari git — begitu file ini
berubah di repo, WAJIB di-`scp` ulang ke server supaya fix-nya kepakai,
lihat § runbook deploy. Data volume MinIO (bucket yang sudah ada) TIDAK
terpengaruh sama sekali oleh ganti registry ini — cuma soal dari mana
image-nya ditarik, isi volume persis sama.

**Pencegahan:** Kalau ada step CI yang `docker run` image publik pihak
ketiga dan gagal dengan "pull access denied"/"repository does not exist"
padahal image-nya jelas ada & reference tidak berubah — curigai rate-limit
anonymous docker.io dulu (cek status resmi registry, cek apakah step yang
sama baru sukses beberapa jam sebelumnya dengan reference sama), bukan
langsung asumsi image dihapus. Preferensi: pakai registry resmi
non-docker.io (quay.io/ghcr.io) untuk image yang ditarik SERING dari CI
(tiap push/PR), simpan docker.io cuma untuk pull jarang (mis. production
VPS yang deploy tidak sesering CI).

## 2026-09-12 — Lompatan versi ke `2.0.0`: utang override breaking-change sejak `v1.0.0` (2026-08-22) akhirnya ditutup
**Konteks:** User minta rekomendasi kapan push+release setelah audit
menyeluruh (bersih, 0 Critical/High). Sekalian tanya kenapa versi
"mentok" di `v1.28.0` dan mengusulkan skema penomoran custom (salah paham
— dikoreksi: semver TIDAK PERNAH "rollover" di angka 9 manapun, tiap
segmen MAJOR/MINOR/PATCH cuma naik terus, reset ke 0 HANYA kalau segmen
di atasnya naik).

**Root cause "mentok" di v1.x**: entri 2026-08-22 (di atas, sekarang
ditandai RESOLVED) sudah mencatat override `releaseRules:
[{breaking:true, release:"minor"}]` di `.releaserc.json` **belum sempat
dihapus** pas `v1.0.0` — tapi catatan itu sendiri TIDAK PERNAH ditindak-
lanjuti selama 28 rilis berikutnya (`v1.0.1` → `v1.28.0`). Restrukturisasi
Data Usaha/Seat/Transfer Kepemilikan (Fase 106-111, sesi ini) jadi momen
yang dianggap user cukup fundamental untuk lompat MAJOR — dipakai sebagai
kesempatan sekalian menutup utang lama itu.

**Fix**: override dihapus dari `.releaserc.json` (lihat entri di atas +
`docs/decisions/adr-0002-versioning-strategy.md` § "Update 2026-09-12"),
commit yang menyertai pakai `feat!:` supaya semantic-release deteksi
`1.28.0 → 2.0.0`.

**Pencegahan**: langkah manual yang "cuma perlu dilakukan sekali di masa
depan" (seperti hapus override ini) gampang terlewat kalau tidak ada
pengingat AKTIF (bukan cuma catatan pasif di lessons-learned) — kalau ada
langkah serupa lagi ke depan (mis. kebijakan versioning berubah lagi),
pertimbangkan pengingat yang lebih aktif (mis. komentar di file config
yang bersangkutan, bukan cuma di dokumen terpisah yang harus diingat
untuk dibaca).

---

## 2026-09-12 — Runbook deploy "Full" ditandai "WAJIB kalau ada migration DB" tapi TIDAK PERNAH menyertakan perintah migrate-nya
**Masalah:** Ditemukan saat user minta re-audit menyeluruh sebelum deploy
(bukan lewat insiden nyata) — `docs/architecture/architecture-deployment.md`
§ "Deploy Manual ke Server" varian **Full** diberi label eksplisit "WAJIB
kalau ada migration DB, perubahan worker/job, atau rilis besar", TAPI blok
perintahnya cuma `pull` → `up -d api web worker minio postgres` → `prune`.
Tidak ada satu baris pun yang menjalankan `bun run db:migrate` di dalam
container. Kalau runbook ini diikuti APA ADANYA untuk rilis yang bawa
migration Drizzle baru, container `api` versi baru naik dan jalan dengan
kode BARU di atas skema LAMA — endpoint yang menyentuh kolom/tabel baru
akan error 500 sampai seseorang SADAR dan migrate manual terpisah (tidak
ada langkah eksplisit yang mengingatkan).

**Root cause:** Dockerfile `apps/api` SUDAH diperbaiki (2026-09-06, catatan
komentar di file itu sendiri) untuk menyertakan `drizzle.config.ts`,
`drizzle/`, dan `src/` supaya `bun run db:migrate` BISA dijalankan dari
dalam container production — tapi perbaikan itu cuma menjawab kasus "deploy
pertama kali ke instance BARU, DB kosong" (didokumentasikan di
`docs/deployment-new-domain-onboarding.md`, yang MEMANG punya baris
`docker exec ... bun run db:migrate`). Runbook REDEPLOY RUTIN (dipakai
tiap rilis baru) tidak pernah disatukan dengan pelajaran yang sama — 2
dokumen deploy berkembang terpisah, satu dapat perbaikan, satunya tidak.

**Fix:** Tambah baris `docker compose ... exec api bun run db:migrate` ke
runbook **Full** di `architecture-deployment.md`, persis setelah `up -d`
— pakai `docker compose exec` (bukan `docker exec <nama-container>`
seperti di onboarding doc) supaya tidak bergantung pada nama container
hasil auto-generate Compose yang bisa beda-beda. Ditambah catatan soal
jeda singkat kode-baru-atas-skema-lama antara `up -d` dan migrate selesai
(diterima sebagai risiko kecil untuk migration ADD-only, dicatat sebagai
known limitation untuk migration yang mengubah/hapus kolom).

**Pencegahan:** Kalau ada 2 dokumen runbook yang membahas topik SAMA
(migrasi database saat deploy) di 2 skenario berbeda (fresh install vs
redeploy rutin), audit KEDUANYA sekaligus saat salah satu diperbaiki —
jangan asumsikan pelajaran dari 1 skenario otomatis ke-carry ke skenario
lain yang isi commandnya ditulis terpisah.

---

## 2026-09-11 — Fase 110 (Seat/User Tambahan): 1 fungsi 2 keperluan hampir jadi privilege escalation, dan celah expiry invite di jalur Google
**Masalah 1 (dicegah saat planning, bukan post-mortem):** `accurate.route.ts`
`POST /connect`/`POST /reuse` memakai `getActiveSubscriptionsWithPlans(user.id)`
untuk OTORISASI MUTASI (siapa boleh bikin/timpa koneksi Accurate). Rencana
awal Fase 110 mau menambah akses-via-seat dengan meng-UNION fungsi yang SAMA
ini — kalau jadi dieksekusi begitu, member (yang cuma boleh PAKAI modul)
bisa kirim `subscriptionId` Data Usaha tempat dia numpang seat dan
mengambil-alih/mengubah koneksi Accurate Data Usaha itu.
**Root cause:** 1 fungsi query dipakai untuk 2 keperluan otorisasi yang
BEDA level (mutasi vs akses-tampilan) — kebetulan sama hasilnya SELAMA
belum ada akses-via-seat, jadi tidak kelihatan sebagai desain rapuh sampai
fitur seat mau ditambahkan.
**Fix:** dipecah jadi `getOwnedSubscriptionsWithPlans` (mutasi — checkout,
trial, connect/reuse Accurate) dan `getAccessibleSubscriptionsWithPlans`
(akses/tampilan — union kepemilikan + seat aktif). Detail → ADR-0032.
**Pencegahan:** kalau 1 fungsi query dipakai di lebih dari 1 tempat untuk
alasan otorisasi yang KELIHATANNYA sama tapi levelnya beda (mutasi vs
baca), curigai dulu SEBELUM menambah fitur yang memperluas cakupan
fungsi itu — jangan asumsikan union aman cuma karena hasil lama identik.

**Masalah 2 (ditemukan security-review, diperbaiki sebelum fase ditutup):**
Invite "User Tambahan" berlaku 7 hari (dicek eksplisit via
`inviteTokenExpiresAt` di jalur password, `invites.route.ts`
`findValidInviteByToken`), TAPI jalur Google OAuth auto-link
(`linkGoogleSignupToPendingInvite`, `lib/member-seats.ts`) awalnya cuma
cek `status = 'invited'` + email cocok — TIDAK cek expiry sama sekali.
Invite yang sudah lewat 7 hari tetap bisa diklaim via Google sign-up
selama primary user belum revoke manual, melanggar janji "berlaku 7 hari"
di teks email undangan.
**Fix:** tambah `gt(inviteTokenExpiresAt, now())` ke query yang sama.
**Pencegahan:** kalau ada 2 jalur berbeda (password vs OAuth) untuk
"menyelesaikan" 1 alur sensitif yang sama (invite/verifikasi/reset), audit
KEDUANYA punya guard yang SAMA PERSIS (expiry, status, dst) — jangan cuma
tulis guard lengkap di jalur yang ditulis duluan lalu asumsikan jalur
kedua otomatis konsisten.

---

## 2026-09-11 — `@react-pdf/image` tidak bisa decode webp: gambar company.logo di PDF invoice tampil KOSONG total (kejadian KEDUA, pola sama bukti transfer Fase 94)
**Masalah:** Fase 104 minta header PDF invoice tampilkan logo perusahaan
menggantikan tulisan nama. Setelah kode ditulis (kondisional `logoUrl ?
<Image> : <Text>{name}</Text>`) dan PDF asli digenerate untuk verifikasi
visual, header tampil **kosong total** — bukan logo, bukan nama.

**Root cause:** `settings.company.logo` SELALU disimpan `.webp`
(`admin/branding.route.ts` re-encode paksa via `sharp(...).webp()`,
sejak Fase 12) — tapi `@react-pdf/image` (dipakai `@react-pdf/renderer`)
**tidak bisa decode format webp sama sekali** (cuma PNG/JPEG). `<Image
src={webpUrl}>` gagal DIAM-DIAM (tidak throw, tidak ada gambar rusak
seperti browser — cuma tidak render apa-apa). Karena kode baru
menyembunyikan `<Text>` nama SETIAP KALI `logoUrl` truthy (bukan lagi
tampil berdampingan seperti sebelumnya), kegagalan silent ini jadi
kelihatan sebagai header kosong, bukan sekadar "logo tidak muncul,
nama tetap ada" seperti sebelum perubahan.

**Ini kejadian KEDUA** — masalah identik SUDAH pernah ditemukan &
diperbaiki untuk gambar bukti transfer di Fase 94 (`getProofImageAsPng`,
`lib/order-payment.ts`, convert `.webp` → PNG via `sharp` sebelum
di-embed ke PDF). Tim (dan Claude) tidak langsung ingat pola ini berlaku
ke SEMUA gambar yang masuk PDF, bukan cuma bukti transfer — sampai
verifikasi visual manual (generate PDF asli, baca isinya) menunjukkan
gejalanya.

**Fix:** Fungsi baru `getCompanyLogoAsPng()` (`invoices.route.ts`), pola
SAMA PERSIS `getProofImageAsPng` — `fetch()` URL publik logo, convert ke
PNG via `sharp(buffer).png().toBuffer()`, hasil `Buffer` diteruskan ke
`generateInvoicePdf()` sebagai `logoImage` (bukan lagi string URL).

**Pencegahan:** **Setiap kali ada gambar BARU yang akan di-embed ke PDF
invoice (`invoice-pdf.tsx`) — cek dulu apakah sumbernya bisa berupa
webp** (semua upload branding/proof di project ini SELALU di-re-encode
webp oleh `sharp` di endpoint upload masing-masing, § pola konsisten
project). Kalau ya, WAJIB convert ke PNG/JPEG server-side dulu (pola
`getCompanyLogoAsPng`/`getProofImageAsPng`) SEBELUM diteruskan ke
`@react-pdf/renderer` — jangan asumsikan "sudah jadi URL publik" berarti
aman dipakai langsung di `<Image src={url}>`. Verifikasi PDF SELALU
lewat generate PDF asli + baca isinya (bukan cuma cek `bun test` yang
cuma verifikasi magic bytes `%PDF-`, tidak menjamin konten visual benar).

---

## 2026-09-11 — Header Excel dengan spasi nyempil bikin NILAI KOLOM HILANG diam-diam di SEMUA modul import (dikira awalnya bug Tax Purchase Payment)
**Masalah:** Client retest Purchase Payment (setelah fix PPh Fase 100)
dapat error Accurate: *"Nilai Pembayaran tidak mencukupi untuk
melunasi pembayaran!"* — dilaporkan sebagai kemungkinan bug fitur Tax
yang baru ditambahkan.

**Investigasi:** Query langsung ke `import_batches`/`import_batch_rows`
production (read-only SELECT, dijalankan USER via `docker exec`, bukan
Claude SSH langsung) menunjukkan `raw_data` baris yang gagal punya key
`" Payment "` (spasi di depan DAN belakang), padahal `column_mapping`
batch itu memetakan `"Payment": "chequeAmount"` (tanpa spasi).

**Root cause:** `apps/api/src/lib/excel.ts` § `parseExcelBuffer` —
`headers` (dipakai UI "Cocokkan Kolom" & disimpan sebagai
`columnMapping`) SUDAH di-trim sejak lama (`.trim()`), TAPI key object
`rows` (data aktual tiap baris, dari `XLSX.utils.sheet_to_json`) TIDAK
pernah di-trim — pakai literal header cell Excel apa adanya. Kalau
header Excel client punya spasi nyempil (kejadian nyata di sini),
lookup `rawRow["Payment"]` (trimmed, dari `columnMapping`) di SEMUA
builder payload (7 modul: purchase-invoice, sales-invoice,
vendor-payable-account, purchase-payment, sales-receipt,
journal-voucher, other-payment) GAGAL DIAM-DIAM — balik `undefined`,
biasanya default ke `0`/kosong via pola `Number(x ?? 0)`. Nominal
pembayaran Rp 100.000 di Excel terkirim sebagai Rp 0 ke Accurate —
Accurate BENAR menolak "Nilai Pembayaran tidak mencukupi", karena
memang yang dikirim betulan 0.

**Field Tax/PPh (Fase 99/100) BELUM SEMPAT teruji sama sekali** di
batch ini — error terjadi di validasi saldo pembayaran, SEBELUM
Accurate sempat evaluasi bagian PPh apa pun. Kesimpulan awal (dikira
bug Tax) TERBUKTI SALAH TOTAL.

**Pelajaran penting**: gejala yang dilaporkan client ("error di fitur
X yang baru saya coba") TIDAK SELALU berarti bug ada di fitur X itu —
WAJIB verifikasi ke DATA MENTAH (raw_data/error_message baris yang
gagal) sebelum menyimpulkan root cause dari deskripsi error semata,
apalagi kalau fitur yang dicurigai baru saja di-deploy (bias "yang
baru diubah pasti yang salah" bisa menyesatkan). Query production
langsung (read-only, dijalankan user) terbukti membongkar kesalahan
asumsi ini dalam sekali investigasi.

**Fix**: `docs/phases/phase-102-fix-trim-header-excel.md` —
`parseExcelBuffer` sekarang trim key `rows` juga, konsisten dengan
`headers`. Fix di SATU tempat (fungsi shared), bukan per-modul.

**Pencegahan**: kalau ada fungsi shared yang punya 2 representasi data
dari sumber yang sama (di sini: `headers` vs `rows`, dua-duanya dari
Excel yang sama), WAJIB pakai transformasi (trim, normalize, dst) yang
KONSISTEN di kedua representasi — jangan cuma satu sisi yang
"dibersihkan". Test unit untuk fungsi parsing shared seperti ini
(`excel.test.ts`, baru dibuat Fase 102) SEHARUSNYA sudah ada dari awal
modul ini dibuat, bukan baru ditambah setelah bug nyata ditemukan.

---

## 2026-09-11 — Cell Excel bertipe Tanggal asli terkirim sebagai angka serial mentah ke Accurate ("Invalid field value for field dateFieldN") — Other Payment & Journal Voucher
**Masalah:** Client retest import Other Payment, input tanggal di kolom
"Atribut Tanggal 1"/"Atribut Tanggal 2", dapat error Accurate: *"Invalid
field value for field dateField2."; "Invalid field value for field
dateField1."*. Screenshot client tunjukkan kolom itu berisi tanggal
yang tampak normal ("10/09/2026"), rata KANAN di Excel (ciri khas cell
bertipe Tanggal/Angka asli, beda dari teks yang rata kiri).

**Root cause:** `parseExcelBuffer` (`apps/api/src/lib/excel.ts`) baca
workbook via `XLSX.read()`/`sheet_to_json()` TANPA opsi `cellDates` —
perilaku default SheetJS: cell yang BENERAN bertipe Tanggal (bukan
teks) dibaca sebagai **angka serial Excel** (epoch 1899-12-30, mis.
46274), BUKAN string "DD/MM/YYYY". `other-payment.mapping.ts` (modul
baru Fase 96) cuma `String()` polos nilai kolom tanggal sebelum kirim
ke Accurate — angka serial itu jadi literal `"46274"` yang DITOLAK
Accurate. **Ditemukan JUGA bug yang SAMA di `journal-voucher.mapping.ts`
(`transDate`) lewat audit proaktif** — belum pernah dilaporkan client
untuk modul itu, kemungkinan besar karena client kebetulan selalu
mengisi tanggal JV sebagai teks (bukan cell Tanggal asli), BUKAN karena
kodenya benar.

**Pelajaran penting**: 4 mapping file LAIN (`purchase-invoice`,
`sales-invoice`, `purchase-payment`, `sales-receipt`) SUDAH punya
fungsi `toAccurateDate()`/`DATE_FIELDS` (konversi serial→DD/MM/YYYY)
sejak lama — TAPI 2 modul yang dibangun BELAKANGAN (`journal-voucher`
Fase 35/50, `other-payment` Fase 96) TIDAK mewarisi mekanisme ini sama
sekali, karena strukturnya di-mirror dari SATU SAMA LAIN (JV↔OP), bukan
dari modul yang PUNYA fix ini. **Ini POLA KETIGA "gap menular lewat
mirroring"** di project ini (setelah Fase 78 vendor scope, Fase 98
Kategori Keuangan) — kalau modul BARU di-mirror dari modul yang
KEBETULAN juga belum punya suatu fix, gap itu ikut ter-copy. Mitigasi
untuk modul mapping baru ke depan: SELALU cek juga field tanggal di
mapping file LAIN yang SUDAH established (bukan cuma modul yang
paling mirip strukturnya) sebelum menganggap `String()` polos aman
untuk field tanggal apa pun.

**Fix**: `toAccurateDate()` (copy PERSIS dari `sales-receipt.mapping.ts`)
ditambahkan ke `other-payment.mapping.ts` (untuk `transDate`,
`attributTanggal1`/`2` → `dateField1`/`2`) DAN `journal-voucher.mapping.ts`
(untuk `transDate`). Detail → `docs/phases/phase-101-fix-tanggal-excel-serial.md`.

**Pencegahan**: kalau menambah modul mapping BARU dengan field
bertipe tanggal, WAJIB pakai `toAccurateDate()` (extract ke util
shared kalau ada modul kelima yang butuh — belum dilakukan sekarang,
4 salinan identik sudah ada, § keputusan "3 baris mirip lebih baik
dari abstraksi prematur" TAPI ini sudah lewat ambang wajar, pertimbangkan
ekstraksi kalau ada modul ke-6/7 yang butuh lagi).

---

## 2026-09-10 — Field `dataClassificationNName` ditambahkan ke Journal Voucher (Fase 95) tanpa mirror auto-create-nya (Fase 98)
**Masalah:** Client retest import Jurnal Umum dapat error Accurate
"Kategori Keuangan 1 tidak ditemukan atau sudah dihapus".

**Root cause:** Fase 95 menambah field `attribut1`-`attribut10`
(`dataClassification1-10Name`) ke Journal Voucher dengan meniru NAMA
field yang sudah ada di Sales Invoice — tapi Sales Invoice (Fase 68)
dan Purchase Invoice (Fase 75) punya mekanisme AUTO-CREATE
(`findOrCreateDataClassification`) karena field ini BUKAN teks bebas:
nilainya wajib sudah ada sebagai master data "Kategori Keuangan" di
Accurate, kalau belum ada Accurate menolak. Saat Fase 95 menyalin NAMA
field-nya, mekanisme pendukungnya (auto-create call di worker + scope
OAuth `data_classification_view`/`_save`) TIDAK ikut disalin.

**Pelajaran umum**: ini POLA KEDUA yang sama persis di project ini
(pertama: Fase 78, `vendor_view`/`vendor_save` hilang dari scope
`purchase_invoice` meski `findOrCreateVendor` dipanggil unconditional
di situ). **Kalau menambah field baru yang field API Accurate-nya SAMA
PERSIS dengan field yang sudah ada di modul LAIN, WAJIB cek apakah
modul lain itu punya mekanisme pendukung khusus untuk field tersebut
(auto-create, scope OAuth tambahan, validasi existence) — bukan cuma
menyalin nama field ke `fieldToAccuratePath` lalu menganggap selesai.**
Field API yang namanya sama (`dataClassificationNName`,
`vendor_view`/`_save`, dst) hampir selalu berarti PERILAKU Accurate-nya
juga sama, termasuk precondition-nya.

**Fix:** § Fase 98, `docs/phases/phase-98-fix-autocreate-kategori-keuangan-jurnal-umum.md`
dan `docs/architecture/architecture-journal-voucher.md` § "Fase 98".

**Pencegahan:** sebelum menutup fase yang menambah field baru dengan
nama `fieldToAccuratePath` yang SUDAH dipakai modul lain, grep dulu
field API itu di seluruh `apps/api/src/lib/accurate-*.ts` dan
`workers/index.ts` — kalau ada fungsi `findOrCreate*`/`ensure*` yang
menyebut field itu di modul lain, modul baru HARUS mirror fungsi yang
sama, bukan cuma field mapping-nya.

---

## 2026-09-10 — Upload Jurnal Umum client gagal: tabrakan nama kolom Excel antara 2 format yang hidup berdampingan
**Masalah:** Client kirim template final Jurnal Umum
(`CLIENT_template-jurnal-umum-v2.xlsx`, 26 kolom) dengan nama kolom
"Nominal Debit"/"Nominal Kredit". Upload file ini GAGAL dengan error
"lineDebitAmount dan lineCreditAmount wajib", padahal secara sekilas
kolomnya "jelas" sudah ada.

**Root cause:** Modul Journal Voucher waktu itu punya 2 format yang
hidup berdampingan dalam 1 `defaultColumnMap` flat — Opsi A (format
lebar, Fase 35) dan Opsi B (format panjang/grouping N-akun, Fase 50).
Opsi A SUDAH memakai label "Nominal Debit"/"Nominal Kredit" untuk field
`debitAmount`/`creditAmount`-nya sendiri. Saat client upload file
dengan kolom berlabel sama tapi MAKSUD beda (field Opsi B
`lineDebitAmount`/`lineCreditAmount`), auto-suggestion salah mapping ke
field Opsi A — field Opsi B yang sebenarnya dibutuhkan
(`lineAccountNo`/`lineDebitAmount`/`lineCreditAmount`) tidak termapping
sama sekali, padahal `journalNumber` ("Transaction Number") tetap
termapping dengan benar sehingga `formatOf()` tetap mendeteksi format
"tall" (Opsi B) — kombinasi inilah yang menghasilkan persis pesan error
yang dilaporkan user.

**Pelajaran umum (bukan cuma soal Jurnal Umum)**: sebuah `Record<string,
string>` flat TIDAK BISA merepresentasikan "nama kolom Excel X berarti
field berbeda di format A vs format B" — ini bukan bug implementasi,
tapi keterbatasan STRUKTURAL desain yang mengizinkan 2 format hidup
berdampingan dengan nama label yang sama-sama ingin dipakai. Kalau ada
modul LAIN di masa depan yang perlu mendukung multi-format serupa,
JANGAN pakai label Excel yang sama untuk field berbeda di 2 format
tersebut — pilih salah satu: (a) label Excel yang beda per format, atau
(b) kalau satu format memang cuma dipakai di masa early/belum ada
customer produksi nyata, pertimbangkan pensiunkan format itu daripada
menjaga 2 format demi "fleksibilitas" yang ternyata tidak pernah
dipakai client.

**Fix:** Opsi A dipensiunkan total (konfirmasi eksplisit user) — § Fase
97, `docs/phases/phase-97-pensiun-opsi-a-jurnal-umum.md` dan
`docs/architecture/architecture-journal-voucher.md` § "Fase 97" untuk
detail penuh.

**Pencegahan:** kalau suatu saat modul ini (atau modul lain) butuh
nambah format alternatif lagi, JANGAN reuse nama kolom Excel yang sudah
dipakai format existing untuk field yang maknanya berbeda — cek dulu
`defaultColumnMap` existing sebelum menetapkan label kolom baru.

---

## 2026-09-10 — Audit Jurnal Umum: field `journalNumber` dikirim ke grouping tapi dibuang sebelum sampai ke Accurate `number`
**Masalah:** Audit menyeluruh (arsitektur vs kode, diminta user tanpa
laporan bug spesifik) menemukan `buildJournalVoucherPayloadTall`
(`apps/api/src/lib/import-mapping/journal-voucher.mapping.ts`, Opsi B/
format panjang) tidak pernah menulis `payload.number` dari
`journalNumber` — field WAJIB yang jadi kunci grouping baris ("Transaction
Number") dan komentar kode SENDIRI sudah bilang harus jadi Accurate
`number`.

**Root cause:** Fungsi ini dibangun (Fase 50) dengan meniru pola
`buildSalesReceiptPayload`/`buildPurchasePaymentPayload` (grouping +
validasi balance), TAPI baris `if (headerValues.X !== undefined) payload.number = String(headerValues.X);`
yang ADA di kedua modul saudara itu (`paymentNumber`/`receiptNumber`)
TERLEWAT saat ditulis di sini — tidak ada error/warning apa pun karena
`number` di payload memang opsional bagi Accurate (auto-number kalau
kosong), jadi transaksi tetap "sukses" tanpa ada tanda kegagalan.

**Kenapa lolos tanpa ketahuan sebelumnya:** `journal-voucher.mapping.test.ts`
tidak pernah assert field `payload.number` sama sekali (test cuma cek
`transDate`/`detailJournalVoucher`/`description`) — gap test coverage
persis menyembunyikan gap kode.

**Fix:** tambah penulisan `payload.number` di akhir
`buildJournalVoucherPayloadTall` + 2 test baru yang assert field ini
terisi (Opsi B normal) dan `undefined` (grup singleton tanpa
`journalNumber`). Detail lengkap 2 temuan lain dari audit yang sama
(field Opsi B tidak bisa di-mapping manual di UI web; dialog edit
per-baris tidak tall-aware) → `docs/architecture/architecture-journal-voucher.md`
§ "3 Bug/Gap Ditemukan & Diperbaiki".

**Pencegahan:** kalau modul baru mengadaptasi pola grouping dari modul
lain (copy logic Sales Receipt/Purchase Payment ke modul baru), WAJIB
cross-check line-by-line SETIAP field yang ada di modul sumber ikut
ada di modul baru — jangan asumsikan "logic-nya mirip jadi pasti
lengkap". Test yang assert SEMUA field top-level payload (bukan cuma
field yang "kelihatan penting") akan menangkap regresi seperti ini
lebih awal.

---

## 2026-09-10 — Claude start `bun run dev` baru tanpa cek proses existing dulu — bentrok port dengan dev server user yang sudah jalan berhari-hari
**Masalah:** Saat verifikasi manual Fase 96 (modul Other Payment) via
browser, Claude langsung jalankan `bun run dev` (api+web+worker) di
background TANPA cek dulu apakah ada proses dev yang sudah jalan. Web
langsung gagal (`EADDRINUSE :::6209` — ada `next dev` milik user yang
sudah jalan 4+ hari), TAPI api "berhasil" listen di port 3001 yang
TERNYATA SUDAH DIPAKAI proses `bun run --watch src/index.ts` milik user
juga (running 1+ hari) — macOS/Bun mengizinkan 2 proses listen di port
yang sama tanpa error (SO_REUSEPORT-like behavior), jadi TIDAK ada
sinyal error yang jelas untuk kasus api, cuma ketahuan lewat `lsof`
manual.

**Root cause:** Asumsi keliru bahwa "start dev server untuk testing"
selalu aman di working directory manapun — TIDAK memperhitungkan bahwa
sesi Claude Code yang sangat panjang (multi-hari) sering punya proses
dev BACKGROUND yang sudah berjalan lama (dari sesi sebelumnya atau
terminal lain milik user), dan `bun run dev` tidak selalu gagal jelas
kalau port bentrok.

**Fix:** Begitu ketahuan (lewat `ps`/`lsof`), Claude LANGSUNG cari
process tree yang PERSIS baru di-spawn sendiri (bukan asal `pkill`) dan
kill HANYA node-node itu, verifikasi proses existing milik user tetap
sehat (`curl` masing-masing port). Untuk verifikasi selanjutnya, pakai
proses `next dev`/`--watch` yang SUDAH JALAN itu langsung (hot-reload
otomatis pick up perubahan file baru) — TIDAK perlu start instance baru
sama sekali.

**Pencegahan**: SEBELUM menjalankan `bun run dev`/`npm run dev`/dsb
untuk keperluan testing manual, WAJIB cek dulu apakah port yang
relevan (6209 web, 3001 api) sudah dipakai (`lsof -i :PORT` atau
`curl -s -o /dev/null -w "%{http_code}" http://localhost:PORT/`) — kalau
sudah ada proses yang merespons, PAKAI itu langsung (Next.js dev server
& `bun --watch` sama-sama hot-reload), JANGAN start instance kedua.
Kalau proses membunuh diperlukan setelah salah start, identifikasi PID
tree yang PERSIS baru display-timestamp-nya cocok dengan command yang
baru dijalankan (`ps -eo pid,ppid,etime,command`), JANGAN kill berdasar
nama proses generik yang bisa cocok ke proses lama milik user.

---

## 2026-09-10 — Fix PPh23 Sales Receipt (Fase 99) di-mirror SPECULATIVE ke Purchase Payment (Fase 100) — belum dikonfirmasi resmi untuk endpoint itu
**Konteks**: setelah Fase 99 (lihat entri di bawah) menutup gap PPh23
Sales Receipt berdasarkan jawaban TERTULIS RESMI Accurate Support, user
minta fix yang sama diterapkan ke Purchase Payment (struktur field PPh
identik: `detailInvoice[].paidPph`/`pphNumber`). Jawaban Accurate
Support itu SPESIFIK untuk `sales-receipt/save.do` — TIDAK ada
pertanyaan/konfirmasi terpisah untuk `purchase-payment/save.do`.

**Keputusan**: user pilih (via AskUserQuestion, 3 opsi: terapkan
speculative / tanya Support dulu / skip) untuk TETAP menerapkan fix
yang sama SEKARANG, bukan menunggu konfirmasi tertulis terpisah. Ini
BEDA dari disiplin yang biasa dipegang project ini untuk investigasi
PPh23 spesifik ("JANGAN ubah kode berdasarkan tebakan, tunggu jawaban
resmi") — kali ini user SADAR menerima risiko demi kecepatan, karena
2 endpoint ini historically SANGAT mirip strukturnya.

**Pelajaran**: kalau user secara eksplisit memilih opsi "speculative/
belum terverifikasi" padahal project punya riwayat disiplin ketat soal
hal ini, JANGAN diam-diam downgrade kepastian itu jadi "sudah fix" di
dokumentasi — tandai SECARA KONSISTEN di semua tempat (komentar kode,
architecture doc, PROGRESS.md, phase doc) sebagai "speculative/belum
dikonfirmasi", supaya siapa pun yang baca nanti (termasuk sesi Claude
lain) tidak salah kira field ini se-tervalidasi field yang sudah
dikonfirmasi test call/support resmi. Endpoint yang "kelihatan mirror"
TIDAK SELALU berperilaku sama persis (riwayat project: saga Sales
Invoice Fase 71-73) — speculative fix HARUS punya jalur fail-safe yang
jelas (disini: `try/catch` generik di `workers/index.ts` yang sudah
ada, bikin kegagalan VISIBLE lewat `errorMessage`, bukan silent) supaya
risiko yang diterima tetap TERUKUR.

**Detail**: `docs/phases/phase-100-mirror-fix-pph-purchase-payment.md`.

---

## 2026-09-10 — PPh23 di Sales Receipt: `paidPph`/`pphAmount`/`detailTax` dikirim tapi diam-diam diabaikan Accurate — ✅ RESOLVED (§ Fase 99)
**Masalah:** Client laporan import Sales Receipt untuk faktur yang kena
PPh23 (item "Jasa Cleaning Service", sudah di-set Kena PPh23 = "Jasa
Kebersihan" di Data Master Barang & Jasa) — status batch import "sukses"
(receipt beneran ke-create di Accurate), TAPI potongan PPh-nya TIDAK
PERNAH benar-benar tersimpan di transaksi Accurate-nya. Field terkait
(`detailInvoice[].paidPph`, `pphNumber`) sudah diimplementasi sejak Fase
85 (2026-09-10, sebelumnya di sesi yang sama) — TAPI phase doc Fase 85
SUDAH mencatat eksplisit "belum diverifikasi test call nyata", dan baru
sekarang benar-benar dites ke Accurate sungguhan.

**Investigasi (4 test call langsung ke `sales-receipt/save.do`, company
demo "Retail Demo", via script sekali-pakai
`apps/api/src/scripts/debug-sales-receipt-pph.ts` — HAPUS setelah gap
ini resolved)**, hasil KONSISTEN di semua percobaan:

| Field dikirim | Nilai dikirim | Nilai balik dari Accurate |
|---|---|---|
| `paidPph` | `true` | selalu `false` |
| `pphAmount` (BARU, dicoba speculative — field ini TIDAK ADA di 18 field asli Fase 85) | `4000` | selalu `0.000000` |
| `detailTax: [{taxId}]` (BARU, speculative — TIDAK ADA di spec OpenAPI resmi, cuma disebut lisan oleh support Accurate tanpa konteks endpoint) | `[{taxId: 1800}]` | root `detailTax` tetap `[]` |
| `pphNumber` | `"TEST-005"` | **berhasil tersimpan** persis (satu-satunya field yang "nyambung") |

Response `s: true` (HTTP 200) — Accurate TIDAK menolak/error apa pun,
field-nya diam-diam diabaikan. Dikonfirmasi juga: faktur uji
(`SI.2026.09.00007`) memang benar sudah kena PPh23 di level item
(`tax3Amount: 4000.000000` ikut muncul di response `detailInvoice[0].invoice`),
jadi bukan salah setting item — murni field pembayaran (`sales-receipt/save.do`)
yang tidak diproses.

**Root cause:** BELUM DIKETAHUI PASTI — kemungkinan field `paidPph`/`pphAmount`
di endpoint ini bersifat read-only/hasil komputasi (bukan input yang bisa
di-set via API), atau ada endpoint/urutan call terpisah yang dibutuhkan.
Petunjuk dari UI manual Accurate: catatan *"PPh yang dipotong dibayarkan
melalui menu Kas & Bank - Pembayaran - Ambil - PPh Pembelian"* — indikasi
kuat butuh transaksi KEDUA (terpisah dari `sales-receipt/save.do`) untuk
benar-benar mencatat potongan PPh-nya, bukan cuma flag boolean di payload
yang sama.

**Status:** ~~Pertanyaan lengkap ... MENUNGGU JAWABAN~~ **RESOLVED
2026-09-10 (Fase 99).** Jawaban resmi Accurate Support: `detailTax[]`
ada di ROOT request (SIBLING `detailInvoice`, BUKAN nested di
dalamnya seperti dicoba speculative di atas), tiap elemen punya
`detailInvoiceNo` (penghubung ke baris faktur), `taxAmount` (nominal
PPh — ternyata WAJIB diisi manual, bukan read-only seperti disimpulkan
Fase 85), `taxId` (angka id internal, resolve lewat
`findTaxByIdentifier` yang sudah ada sejak Fase 86). `paidPph`/
`pphNumber` di `detailInvoice[]` TIDAK perlu diubah — keduanya sudah
benar dari awal, masalahnya HANYA `detailTax` yang salah struktur.

**Pelajaran**: "lisan oleh support Accurate tanpa konteks endpoint
jelas" (baris tabel `detailTax` di atas) memang TIDAK BOLEH langsung
dipercaya tanpa konfirmasi tertulis — percobaan speculative di atas
(nested di `detailInvoice`) SALAH justru karena menebak strukturnya
sendiri tanpa tahu detail. Begitu jawaban TERTULIS RESMI datang (via
email/tiket, bukan lisan), strukturnya eksplisit dan langsung bisa
diimplementasikan tanpa tebak-tebak lagi — beda dari percobaan
speculative yang HARUS nebak bentuk field sendiri.

**Fix**: `docs/phases/phase-99-fix-pph23-sales-receipt.md`,
`docs/architecture/architecture-sales-receipt.md` § "GAP DITUTUP (Fase
99)". Script debug `apps/api/src/scripts/debug-sales-receipt-pph.ts`
SUDAH dihapus (investigasi closed). **Belum diverifikasi test call
nyata** — fix berdasar jawaban tertulis resmi, disarankan client
retest 1x setelah deploy untuk konfirmasi akhir.

---

## 2026-09-10 — Guard "faktur existing" cuma percaya DB lokal, tidak pernah verifikasi ke Accurate sungguhan — upload gagal terus kalau faktur dihapus manual di Accurate
**Masalah:** Client hapus faktur langsung di Accurate (bukan lewat
Facport) karena salah input, lalu upload ulang dengan Trans No yang
sama — SELALU gagal, padahal seharusnya dibuatkan faktur baru.

**Root cause:** `appendToExistingPurchaseInvoice`/`appendToExistingSalesInvoice`
(`workers/index.ts`, ADR-0012) menentukan "apakah faktur ini sudah
pernah dibuat" HANYA dari catatan `import_batch_rows` status "sukses"
di DB lokal — begitu ketemu record lama, LANGSUNG diasumsikan faktur
itu MASIH ADA di Accurate, tanpa pernah verifikasi ulang ke Accurate
sungguhan. Kalau user hapus faktur itu manual di Accurate, DB lokal
tetap bilang "sukses" selamanya (tidak ada mekanisme sinkronisasi
balik), jadi retry berikutnya SELALU coba "tambah ke faktur yang sudah
tidak ada" dan gagal.

**Temuan tambahan (test call nyata)**: `detail.do` pada id transaksi
yang sudah dihapus balas **HTTP 200** (BUKAN 404!) dengan body
`{"s":false,"d":["Faktur Penjualan tidak tepat"]}` — kalau cuma cek
`res.status`/`res.ok`, kondisi ini TIDAK KETAHUAN sama sekali (kode
sudah lolos `res.ok` check, packing envelope `s:false` yang bawa
pesannya).

**Fix:** `getPurchaseInvoiceDetail`/`getSalesInvoiceDetail` (verifikasi
state faktur existing) dibungkus try/catch — kalau errornya mengandung
pesan "tidak tepat" (`isAccurateRecordNotFound`, `lib/accurate.ts`),
fallback ke jalur CREATE biasa alih-alih gagalkan baris. Diterapkan ke
KEDUA modul (Sales Invoice DAN Purchase Invoice) sekaligus, walau
client cuma laporin untuk satu, karena strukturnya identik.

**Pencegahan:** **DB lokal Facport adalah CACHE hasil transaksi masa
lalu, BUKAN sumber kebenaran soal state Accurate saat ini** — kapan pun
kode mau mengasumsikan sesuatu "masih berlaku" di Accurate berdasar
catatan lokal (existing invoice, existing customer/vendor, dst), WAJIB
verifikasi ulang ke Accurate sungguhan sebelum bertindak, dan WAJIB
tangani kasus "ternyata sudah tidak ada/berubah" secara eksplisit —
jangan biarkan exception generik dari situ menggagalkan seluruh alur.
Ingat juga: Accurate SERING balas `s:false` dengan HTTP 200 untuk
kegagalan logis (§ `architecture-accurate-integration.md`) — `res.ok`
TIDAK CUKUP untuk deteksi kondisi spesifik, harus baca isi `d`/pesannya.

---

## 2026-09-09 — ADR-0026 tidak sengaja hapus scope `vendor_view`/`vendor_save` yang dibutuhkan fitur LAIN — semua subscriber Purchase Invoice (tanpa Akun Hutang Pemasok) 403 sejak deploy
**Masalah:** Client retest Purchase Invoice (setelah koneksi Accurate-nya
AKTIF & scope Fase 75 sudah termasuk) — SEMUA baris gagal di grup
manapun dengan `Accurate API gagal: HTTP 403`, persis di baris PERTAMA
tiap grup.

**Root cause:** ADR-0026 (commit `1bc9256`, "Import Akun Hutang Pemasok"
jadi sub-modul berbayar terpisah) memindahkan scope `vendor_view`/
`vendor_save` SEPENUHNYA dari daftar scope `purchase_invoice` ke
`vendor_payable_account` — dengan asumsi 2 scope itu CUMA dipakai fitur
"Import Akun Hutang Pemasok" (`vendor-payable-account-import.route.ts`).
Asumsi itu KELIRU: `findOrCreateVendor` (Fase 05, `accurate-vendor.ts`)
— fitur auto-create/lookup vendor yang dipanggil **UNCONDITIONAL** di
`processPurchaseInvoiceGroup` untuk SETIAP grup import Faktur Pembelian
(fitur INTI Purchase Invoice, TIDAK ADA hubungannya dengan Akun Hutang
Pemasok) — JUGA butuh scope yang SAMA (`vendor/list.do` buat cek
existing, `vendor/save.do` buat auto-create). Sejak commit itu deploy,
SEMUA subscriber Purchase Invoice yang TIDAK JUGA subscribe Akun Hutang
Pemasok kehilangan scope ini diam-diam — importnya SELALU gagal 403 di
lookup vendor paling awal, baru ketahuan sekarang (client sudah lama
tidak retest Purchase Invoice sejak deploy itu).

**Fix:** `vendor_view`/`vendor_save` DIKEMBALIKAN ke daftar scope
`purchase_invoice` (`accurate-scopes.ts`, Fase 78) — TETAP juga ada di
`vendor_payable_account` (2 modul sama-sama butuh scope Accurate yang
sama, untuk 2 fitur BERBEDA — bukan dipindah lagi). Test regresi
ditambah (`accurate-scopes.test.ts`) supaya scope ini tidak "kepindah"
tanpa sadar lagi. Koneksi Purchase Invoice yang SUDAH ada WAJIB
disconnect+reconnect setelah fix ini deploy.

**Pencegahan:** **Sebelum memindahkan/menghapus scope dari 1 modul ke
modul lain, `grep` SEMUA pemanggil endpoint Accurate terkait dulu**
(bukan cuma cek endpoint yang jadi TUJUAN perubahan) — 1 scope Accurate
bisa dipakai lebih dari 1 fitur/endpoint kode kita, walau secara bisnis
fitur-fitur itu dijual sebagai produk terpisah. ADR yang mengubah scope
WAJIB eksplisit cantumkan HASIL grep itu di bagian "Konsekuensi", bukan
cuma asumsi dari nama fitur.

---

## 2026-09-09 — "Minimal runbook" (skip restart worker) SALAH untuk perubahan file mapping — bikin investigasi 1+ hari sia-sia
**Masalah:** Deploy v1.19.0 (Fase 73, field Atribut Tambahan level ITEM)
pakai runbook Minimal (restart `api`+`web` saja) — dengan alasan
perubahannya "cuma mapping/template, bukan logic worker". SETELAH itu,
client retest berkali-kali (5+ percobaan, eliminasi 5 hipotesis:
aktivasi field, "Pilihan"/predefined choices, tabrakan nama field
header-vs-item, slot yang belum dikonfigurasi, bahkan manual entry di
Accurate dites segala) — SEMUA gagal menampilkan data padahal API
selalu balas sukses. Baru ketahuan setelah setup environment LOCAL
terpisah (Accurate app OAuth baru, reconnect, dsb — makan waktu
signifikan) dan test yang SAMA PERSIS berhasil di situ.

**Root cause:** `apps/api/src/lib/import-mapping/sales-invoice.mapping.ts`
(file yang diubah Fase 73) di-import LANGSUNG oleh `workers/index.ts` —
worker jalan sebagai **container Docker TERPISAH** dengan **image
sendiri**. Restart `api`+`web` TIDAK menyentuh container `worker` sama
sekali — dia tetap jalan pakai image LAMA (v1.18.2) yang belum kenal
field baru (`attributItemKarakter1` dkk). `column_mapping` tersimpan
benar di DB (API sudah versi baru, dropdown-nya ada), tapi saat WORKER
membangun payload ke Accurate, field yang tidak dikenal di versi
lamanya itu diam-diam TIDAK PERNAH masuk ke payload — bukan error,
cuma hilang. Baris tetap `success` karena field wajib lain tetap valid.

**Fix:** Restart manual `facport-worker-1` ke image yang sama
(`v1.19.0`) — retest langsung berhasil, TANPA perubahan kode apa pun
(kode sudah benar sejak awal).

**Pencegahan:** **"Minimal runbook" (skip restart worker) HANYA boleh
dipakai kalau perubahan BENAR-BENAR TIDAK menyentuh file yang di-import
`workers/index.ts`** — cek dengan `grep` import path sebelum
memutuskan, JANGAN menilai dari "kategori" perubahan ("cuma
mapping/data" TERASA aman tapi TIDAK berarti worker tidak
memakainya). Kalau ragu SAMA SEKALI, default ke Full runbook (restart
semua service termasuk worker) — biaya restart worker itu murah
(hitungan detik), sementara biaya salah asumsi ini adalah 1+ hari
investigasi buntu yang menyalahkan Accurate/konfigurasi client padahal
akar masalahnya di proses deploy kita sendiri.

---

## 2026-09-09 — Spec Accurate TIDAK LENGKAP untuk SELURUH keluarga fitur "Atribut Tambahan", bukan cuma 1 field terisolasi — pertanyaan ke Support harus sespesifik mungkin
**Masalah:** Investigasi Fase 67-73 (lintas 2 hari) berulang kali salah
simpul soal field "Atribut Tambahan" Sales Invoice: sempat dikira
`charField`/`numericField`/`dateField` cuma level HEADER (Fase 64),
sempat dikira "ITEM: CUSTOM CHARACTER" = sinonim Kategori Keuangan
(Fase 69, SALAH), sempat dikira field itu TIDAK ADA SAMA SEKALI setelah
jawaban PERTAMA Accurate Support (Fase 71) — baru KETEMU field yang
BENAR setelah pertanyaan KEDUA yang SPESIFIK ("Atribut Tambahan pada
DETAIL ITEM di transaksi Sales Invoice", Fase 73): ternyata
`charField`/`numericField`/`dateField` PUNYA VERSI ITEM-LEVEL JUGA
(15 slot Karakter, beda dari 10 slot di level header), field API SAMA
tapi lokasi payload beda (root vs nested `detailItem`).

**Root cause:** `accurate-openapi.json` (spec resmi yang jadi acuan
sejak awal project) TIDAK LENGKAP untuk **SELURUH keluarga fitur**
Atribut Tambahan — bukan cuma 1 field yang kebetulan lupa
didokumentasikan (dugaan awal tiap kali ketemu kasus baru), tapi
POLA BERULANG: charField header (Fase 64), charField item (Fase 73)
— dua-duanya SAMA SEKALI tidak ada di spec, cuma dataClassificationNName
("Kategori Keuangan") yang terdokumentasi resmi. Pertanyaan PERTAMA ke
Accurate Support (Fase 71) juga TERBUKTI tidak cukup — jawabannya benar
tapi tidak lengkap karena pertanyaannya sendiri tidak menyebut level
(header vs item vs expense) secara eksplisit, jadi Support cuma jawab
apa yang secara harfiah ditanyakan.

**Fix:** Field item-level charField/numericField/dateField
diimplementasikan (Fase 73) — 27 field baru
(`attributItemKarakter1-15`/`Angka1-10`/`Tanggal1-2`), kolom Excel
"ITEM: CUSTOM CHARACTER/NUMBER/DATE" dikembalikan dengan field API yang
BENAR kali ini (bukan salah kirim ke Kategori Keuangan seperti Fase 69).

**Pencegahan:** (1) Untuk fitur "Atribut Tambahan"/custom-field apa pun
di Accurate, ASUMSIKAN spec TIDAK LENGKAP sejak awal (bukan baru curiga
setelah ketemu masalah) — field seperti ini SERING tidak terdokumentasi
resmi. (2) Kalau tanya ke Accurate Support soal field API, SPESIFIKKAN
level/konteks secara eksplisit dalam pertanyaan ("level header/faktur"
vs "level item/detail" vs "level expense") — jangan tanya generik
"field apa untuk Atribut Tambahan", karena jawabannya cuma akan
menjawab APA YANG DITANYAKAN, bukan mengungkap SELURUH variasi yang
ada. (3) Kalau client punya file Excel/screenshot ASLI yang menyebut
suatu kolom/field spesifik dan itu TIDAK cocok dengan pemahaman kita
saat ini, JANGAN buru-buru simpulkan "itu sinonim" atau "itu tidak
ada" — anggap itu sebagai petunjuk kuat field tersebut BENAR-BENAR ADA
tapi belum ditemukan cara memetakannya, sampai ada bukti definitif
(test nyata / balasan Support yang SPESIFIK) yang membuktikan
sebaliknya.

---

## 2026-09-08 — Salah asumsi 2 field API berbeda itu "sinonim", padahal client cuma pakai istilah sendiri untuk field yang SUDAH ADA
**Masalah:** Client verifikasi field Atribut Tambahan item-level
(Kategori Keuangan) berhasil, lalu tunjukkan kolom Excel kita
"ITEM:CUSTOM CHARACTER N" tidak cocok istilah Accurate — DIASUMSIKAN
(Fase 69) itu SINONIM untuk "Kategori Keuangan", langsung diganti nama
kolomnya tanpa verifikasi lebih lanjut. Ternyata KELIRU: client tunjukkan
file Excel mereka sendiri yang highlight "ITEM: CUSTOM CHARACTER 1-10"
sebagai kolom TERPISAH dari "Kategori Keuangan" (ada di kolom lain di
file yang sama) — sempat memicu dugaan ada field API KETIGA yang belum
teridentifikasi (mirip kasus `charField` dulu), sampai akhirnya
dikonfirmasi via balasan resmi Accurate Support: field yang tersedia
CUMA 2 kelompok (`charField`/`numericField`/`dateField` level faktur,
`dataClassificationNName` level item/expense) — TIDAK ADA field ketiga.
"ITEM: CUSTOM CHARACTER" TERNYATA cuma istilah client sendiri untuk
salah satu dari 2 field yang SUDAH kita implementasi — bukan field baru,
murni beda persepsi/istilah.

**Root cause:** Ketika 2 label kolom kelihatan "berhubungan" (sama-sama
bahas "custom field"/"atribut tambahan"), terlalu cepat disimpulkan
sebagai sinonim TANPA verifikasi independen (screenshot Accurate,
konfirmasi Support) — padahal istilah yang MIRIP secara bahasa bisa
merujuk ke 2 KONSEP TEKNIS BERBEDA, atau sebaliknya (seperti kasus ini)
1 konsep yang SAMA cuma disebut client dengan istilah yang beda dari
istilah resmi Accurate.

**Fix:** Sinonim salah dihapus (Fase 71) SEBELUM sempat di-deploy ke
production (untung ditahan dulu, § feedback user "jgn push dulu" jadi
penyelamat di sini) — kalau sempat live, user lain yang pakai nama
kolom lama "ITEM:CUSTOM CHARACTER N" akan SALAH KIRIM data ke Kategori
Keuangan tanpa error apa pun (silent data mismatch).

**Pencegahan:** Sebelum menyimpulkan "kolom A itu sinonim kolom B" (rename
massal, gabung field), verifikasi ke SUMBER RESMI dulu (screenshot
konfigurasi Accurate langsung, atau tanya Accurate Support seperti tiket
#357901) — JANGAN cukup dari kemiripan nama/istilah client saja. Kalau
ternyata ada 2 sebutan yang mirip untuk hal yang KELIHATANNYA sama,
TANYAKAN dulu ke client: "apakah nilai ini harus SAMA untuk seluruh
transaksi, atau BOLEH beda per baris?" — jawaban itu langsung
membedakan field level HEADER (charField) vs level ITEM
(dataClassificationNName) tanpa perlu tebak-tebakan istilah.

---

## 2026-09-08 — Atribut Tambahan item-level (`dataClassificationNName`) BUKAN teks bebas, wajib referensi master data existing
**Masalah:** Client retest Sales Invoice (Trans No baru, setelah fix
Fase 67) dapat error dari Accurate: `Kategori Keuangan TES 1 tidak
ditemukan atau sudah dihapus`. Sempat tidak jelas field mana yang
dimaksud karena istilah "Kategori Keuangan" tidak muncul di kode/dokumen
kita sama sekali.

**Root cause:** "Kategori Keuangan" adalah LABEL RESMI Accurate untuk
endpoint `/api/data-classification` (dikonfirmasi di `accurate-openapi.json`
baris 62-63) — PERSIS fitur "Atribut Tambahan" item-level
(`detailItem.dataClassificationNName`) yang diimplementasi Fase 55/61.
Field ini diasumsikan teks bebas (mirip field Character biasa) sejak
awal — TERNYATA Accurate memvalidasinya sebagai REFERENSI ke master
data "Kategori Keuangan" yang sudah ada, bukan string sembarang. Nilai
apa pun yang belum pernah dibuat di Accurate akan ditolak dengan pesan
ini.

**Fix (Fase 68):** Karena aplikasi belum publish (masih testing internal
tim client), diimplementasi auto-create (`findOrCreateDataClassification`,
`accurate-data-classification.ts`) — mirror pola auto-create Customer
(Fase 13)/Item (Fase 05): cek dulu via `/api/data-classification/list.do`
(filter `index`+`keywords`, index HARUS cocok slot attributN 1-10),
kalau belum ada baru `save.do` untuk membuatnya. Butuh scope OAuth baru
(`data_classification_view`/`_save`) — koneksi existing wajib
reconnect.

**Pencegahan:** Kalau Accurate menolak dengan pesan generik yang
menyebut ISTILAH BAHASA INDONESIA yang tidak ada di kode/dokumen kita
(bukan nama field API), JANGAN asumsikan itu typo/istilah baru — cari
dulu istilah itu di `accurate-openapi.json` (field `description`,
biasanya berupa terjemahan Indonesia dari endpoint/field resmi) SEBELUM
menyimpulkan ini bug baru yang tidak diketahui. Juga: field custom
Accurate yang KELIHATANNYA seperti "text bebas" (dataClassification,
kemungkinan customField lain) TIDAK BOLEH diasumsikan begitu tanpa cek
apakah field itu sebenarnya REFERENSI ke suatu master data — cek dulu
apakah ada endpoint list/save terpisah untuk "master data" bernama
sama sebelum asumsi.

---

## 2026-09-08 — Guard idempotent "Retry Cerdas" (ADR-0012) salah anggap upload baru sebagai retry, data baru silent tidak terkirim
**Masalah:** Client testing Atribut Tambahan Sales Invoice (Fase 64)
lapor PPN & Atribut Tambahan "belum bisa terbaca" di Accurate, padahal
kode sudah diverifikasi benar (Fase 64-66). Simulasi payload dari data
production TERBUKTI benar. Query historis membuktikan 2 batch BERBEDA
(`de033564-...` 11:34, `977775bc-...` 11:44) hasilkan
`accurate_transaction_id`/`accurate_detail_item_id` yang **identik** —
artinya `save.do` (panggilan yang bawa field baru) TIDAK PERNAH
dieksekusi untuk batch kedua, tapi baris tetap dilaporkan "success".

**Root cause:** Mekanisme "Retry Cerdas" (ADR-0012, Fase 08/09,
`appendToExistingPurchaseInvoice`/`appendToExistingSalesInvoice`) skip
`save.do` TOTAL kalau semua item baris grup (itemNo+unitPrice+quantity)
sudah match dengan faktur existing — didesain untuk retry-safety (cegah
duplikat item kalau tombol Retry diklik berkali-kali PADA BATCH YANG
SAMA). Tapi kriteria match-nya TIDAK membedakan "retry batch yang sama"
vs "upload baru yang KEBETULAN Trans No + item + harga + qty-nya identik
dengan batch test sebelumnya" (skenario wajar: client re-upload file
template yang sama setelah nambah kolom baru) — keduanya sama-sama
`newRows.length === 0`, jadi diperlakukan sama (silent success), padahal
maksudnya beda total.

**Fix:** `findExistingAccurateInvoiceId`/`findExistingAccurateSalesInvoiceId`
sekarang ikut kembalikan `batchId` sumber match. Fungsi murni baru
`isCoincidentalDuplicateAcrossBatches` (`apps/api/src/lib/append-invoice-guard.ts`)
membedakan: match di batch SAMA + tidak ada baris baru → tetap silent
success (retry-safety asli, TIDAK berubah); match di batch LAIN + tidak
ada baris baru → reject dengan pesan error jelas (row jadi `failed`).
Diterapkan konsisten ke Sales Invoice DAN Purchase Invoice (mirror 1:1
sejak ADR-0012, bug yang sama pasti ada di keduanya). Detail keputusan →
`docs/decisions/adr-0031-batasi-idempotent-guard-append-invoice-ke-batch-sama.md`.

**Pencegahan:** Kalau bikin guard "idempotent/skip kalau sudah pernah
diproses", JANGAN cuma cek "apakah hasilnya sama" — cek juga "apakah
konteks pemanggilan ini SAMA dengan konteks yang menghasilkan data itu
sebelumnya" (di sini: batch yang sama). Kesamaan HASIL tidak selalu
berarti ini PERCOBAAN ULANG dari proses yang sama; bisa juga kebetulan
input baru yang identik dengan input lama — dan silent-success untuk
kasus kedua itu berbahaya karena user tidak tahu data barunya tidak
pernah benar-benar terkirim. Kalau ragu, tolak dengan pesan jelas —
JANGAN silent-succeed.

---

## 2026-09-08 — Field boolean/persen dikirim salah tipe JSON ke Accurate, pesan error generik tidak menyebut penyebab sebenarnya
**Masalah:** Client laporkan: isi kolom Diskon (%) dan kolom Pajak
(Taxable/PPN/PPnBM/PPh23) di Excel Sales Invoice → import gagal dengan
pesan "Faktur Penjualan tidak tepat" (generik, tidak jelas kolom mana
yang salah). Hapus kolom itu → import berhasil.

**Root cause:** `accurate-openapi.json` mewajibkan `taxable`/
`inclusiveTax`/`reverseInvoice`/`useTax1-3` bertipe JSON `boolean`
MURNI, dan `cashDiscPercent`/`itemDiscPercent` bertipe `string` (BUKAN
`number`, beda dari `cashDiscount`/`itemCashDiscount` yang justru wajib
`number`). Kode kita (`extractRowValues` di `sales-invoice.mapping.ts`
DAN `purchase-invoice.mapping.ts`, mirror 1:1) TIDAK melakukan konversi
tipe sama sekali — nilai mentah dari SheetJS (string "TRUE" untuk
boolean, number untuk persen) diteruskan APA ADANYA ke payload JSON.
Accurate menolak dengan pesan CATCH-ALL yang tidak menyebut field
spesifik — masalah tipe data jadi sangat sulit didiagnosis dari sisi
user (mereka cuma tahu "kalau kolom ini diisi, gagal", tanpa tahu KENAPA).

**Fix:** `toAccurateBoolean()` (terima variasi teks truthy: true/y/yes/
1/ya, case-insensitive) untuk field boolean; `String()` paksa untuk
field persen. Diterapkan di KEDUA modul yang punya field ini (Sales
Invoice & Purchase Invoice — dicek 4 modul lain, tidak ada field
serupa).

**Pencegahan:** Kalau membangun payload JSON untuk API pihak ketiga
dari data Excel (yang SELALU longgar tipe — semua bisa jadi string),
JANGAN asumsikan "field ini kelihatannya boolean/number jadi pasti
sudah tipe yang benar setelah parsing Excel" — SELALU cek tipe JSON
yang benar-benar diwajibkan di spec resmi API tujuan, dan TULIS konversi
eksplisit untuk SETIAP field yang tipenya BUKAN string biasa (boolean,
number presisi khusus, string-yang-terlihat-seperti-number seperti
`cashDiscPercent` di sini). Kalau ada BEBERAPA modul yang mirror pola
mapping yang sama (§ komentar "mirror 1:1" di kode), bug tipe data di
satu modul KEMUNGKINAN BESAR ada juga di modul lain — cek semua modul
yang share pola sama sebelum menganggap fix di 1 tempat sudah cukup.

---

## 2026-09-08 — Spec API vendor pihak ketiga (`accurate-openapi.json`) TIDAK LENGKAP, jangan dijadikan satu-satunya sumber kebenaran untuk "field ini tidak ada"
**Masalah:** Fase 61 menyimpulkan "Atribut Tambahan level header/faktur
Sales Invoice TIDAK ADA field custom apa pun di API Accurate" — riset
dilakukan dengan scan MENYELURUH `accurate-openapi.json` (0 kemunculan
field custom di top-level payload SEMUA 30+ endpoint transaksi).
Kesimpulan ini DIBAWA ke client sebagai "tidak bisa secara teknis".
Client kemudian forward email resmi Accurate Support (tiket #357901)
yang MENGONFIRMASI field itu ADA (`charField1-10`, `numericField1-10`,
`dateField1-2`) dan BERFUNGSI, lengkap dengan contoh body JSON nyata.

**Root cause:** Spec OpenAPI yang disimpan di
`docs/referencehtml/accurate-openapi.json` adalah SALINAN yang
TERNYATA TIDAK LENGKAP — field ini nyata ada di API produksi Accurate,
cuma tidak terdokumentasi di file spec yang kita punya. Bukan
kesalahan LOGIKA riset (scan-nya sendiri sudah benar & menyeluruh),
tapi kesalahan ASUMSI bahwa dokumen spec = kebenaran mutlak & lengkap.

**Fix:** Field `charField1-10`/`numericField1-10`/`dateField1-2`
ditambahkan ke mapping (Fase 64) berdasarkan email resmi vendor,
BUKAN spec. Diperkuat bukti independen (Excel asli client punya
jumlah kolom custom level header yang PERSIS cocok).

**Pencegahan:** Kalau kesimpulan "fitur X tidak didukung API" HANYA
berdasarkan 1 dokumen spec (openapi.json, dst) — SEBELUM menyampaikan
itu sebagai kebenaran final ke user/client, cek dulu apakah ada sinyal
lain yang BERTENTANGAN (client sudah pakai fitur itu di UI vendor,
ATAU ada channel official support yang bisa ditanya). Kalau ada sinyal
kuat yang kontradiktif, SARANKAN verifikasi ke vendor/support resmi
dulu sebelum menutup permintaan sebagai "keterbatasan platform" —
jangan berhenti di "spec bilang tidak ada" begitu saja, terutama untuk
API vendor pihak ketiga yang dokumentasinya bisa kadaluarsa/tidak
lengkap tanpa pemberitahuan.

---

## 2026-09-08 — UI konfirmasi mapping import (dropdown pilihan field) TIDAK OTOMATIS ikut update saat field baru ditambah ke backend
**Masalah:** Fase 55 menambah 10 field baru (`attribut1-10`, Atribut
Tambahan) ke `sales-invoice.mapping.ts` (backend) — TAPI dropdown
pilihan field di UI konfirmasi mapping
(`apps/web/app/app/(protected)/sales-invoice/import/page.tsx`,
konstanta `ACCURATE_FIELDS`) TIDAK PERNAH ditambah field yang sama.
Akibat: field itu sudah didukung backend 100%, tapi client TIDAK BISA
memetakannya sama sekali via UI — opsinya tidak ada di dropdown.
Ketemu 3 fase kemudian (Fase 65) lewat evaluasi client, bukan lewat
review kode saat Fase 55 ditutup.

**Root cause:** `ACCURATE_FIELDS` adalah daftar STATIS yang di-maintain
MANUAL, terpisah dari `salesInvoiceMapping.fieldToAccuratePath`
(backend) — tidak ada mekanisme yang memaksa keduanya tetap sinkron
kalau field baru ditambah di satu sisi saja.

**Fix:** 32 entri ditambahkan ke `ACCURATE_FIELDS` (attribut1-10 dari
Fase 55 yang terlewat + field baru Fase 64).

**Pencegahan:** Setiap kali menambah field baru ke
`fieldToAccuratePath` (`sales-invoice.mapping.ts` atau mapping modul
manapun), WAJIB cek juga apakah ada daftar dropdown/pilihan field
di FRONTEND (`ACCURATE_FIELDS` atau setara di modul lain) yang perlu
ditambah field yang sama — 2 lokasi ini TIDAK share satu sumber
kebenaran, jadi harus diupdate manual bersamaan, JANGAN anggap
"backend sudah dukung" berarti otomatis bisa dipakai dari UI.

---

## 2026-09-08 — `databaseHooks.user.create.after` (Better Auth) fires untuk SEMUA metode pembuatan user, termasuk panggilan server-side `auth.api.X()`
**Masalah:** Menambah Google OAuth login (Fase 62), butuh assign role
"customer" ke user baru dari Google (jalur ini belum ke-cover mekanisme
lama yang cuma jalan untuk HTTP `/api/auth/sign-up/email`). Ditambah
`databaseHooks.user.create.after` di `lib/auth.ts` — TERNYATA hook ini
fires untuk SEMUA metode pembuatan user Better Auth, BUKAN cuma
self-service: `auth.api.signUpEmail()` yang dipanggil LANGSUNG
server-side dari `admin/users.route.ts`/`admin/staff.route.ts` (buat
provisioning admin/staff) JUGA memicu hook yang sama. Akibat: akun
admin/staff baru ikut ditandai role "customer", merusak invariant
`userCount` (Fase 59, "Pengguna" cuma hitung role customer). Ditangkap
OTOMATIS oleh test integrasi Fase 59 sebelum sempat dianggap selesai.

**Root cause:** `databaseHooks` beroperasi di level DATABASE ADAPTER
(setiap kali Better Auth benar-benar membuat baris `user`), BUKAN level
HTTP routing — jadi TIDAK PEDULI apakah pembuatan user dipicu request
HTTP asli atau panggilan fungsi `auth.api.X()` langsung dalam proses
yang sama (server-to-server). `context.path` yang diterima hook JUGA
SAMA PERSIS untuk kedua cara pemanggilan (endpoint internal yang sama),
jadi TIDAK BISA dipakai membedakan "self-service" vs "admin-provisioned"
untuk endpoint yang sama-sama email/password.

**Fix:** Filter hook berdasarkan `context.path` KHUSUS untuk path yang
SECARA STRUKTURAL tidak mungkin dipakai jalur lain (`/callback/:id`,
path generik SEMUA social-provider OAuth callback — tidak ada
"OAuth admin-provisioned" di codebase ini). Untuk email/password, TETAP
andalkan intercept HTTP-level yang sudah ada (`app.ts`), yang justru
BENAR karena panggilan server-side literal TIDAK PERNAH melewati
routing HTTP Elysia sama sekali.

**Pencegahan:** Sebelum pakai `databaseHooks`/hook level-adapter
manapun di Better Auth (atau library serupa) untuk logic yang harus
BEDA per "cara" resource dibuat (self-service vs admin-provisioned,
publik vs internal), WAJIB cek apakah hook itu benar-benar bisa
membedakan sumber panggilan — kalau tidak bisa (kasus di sini:
`context.path` sama untuk keduanya), filter berdasarkan sesuatu yang
STRUKTURAL BEDA (path endpoint yang secara desain cuma dipakai 1 jalur,
seperti OAuth callback di sini), BUKAN asumsi "hook ini pasti cuma
untuk kasus yang saya maksud".

---

## 2026-09-08 — Card "Pengguna" dashboard admin ikut hitung akun admin/staff (COUNT tanpa filter role)
**Masalah:** `GET /admin/stats` (dipakai card "Pengguna" di `/admin`)
menghitung `count()` polos dari tabel `user`, TANPA filter role sama
sekali — akun admin/staff ikut dianggap "pengguna" (harusnya cuma role
`customer`). Ditemukan saat user minta redesign dashboard (Fase 59), BUKAN
laporan bug langsung — bug lama, baru ketahuan waktu re-audit endpoint
lama untuk fitur baru.

**Root cause:** `db.select({ userCount: count() }).from(user)` — tidak
ada JOIN/filter role apa pun sejak endpoint ini dibuat (Fase 10). Pola
fix yang BENAR sudah ada di endpoint lain sejak awal
(`admin/users.route.ts`, subquery `userRoles`+`roles` WHERE `name =
'customer'`) — endpoint stats ini yang lupa ikut pola itu, kelas bug SAMA
dengan `new Map(rows.map(r => [r.userId, r]))` yang ditemukan hari yang
sama (§ entri lain tanggal ini) — 2 endpoint BEDA, gejala beda, tapi
akar masalah sama: **fitur baru (role customer eksplisit) tidak otomatis
menjalar ke SEMUA endpoint lama yang implisit mengasumsikan "semua user
= customer"**.

**Fix:** Ganti jadi subquery JOIN `userRoles`+`roles` (REUSE fungsi yang
sama semangatnya dengan `admin/users.route.ts`), difaktorkan jadi
`getCustomerIdsSubquery()` di `stats.route.ts`.

**Pencegahan:** Begitu sebuah project punya KONSEP role/tipe akun yang
jelas (di sini: `customer` vs `admin`/`staff`), SETIAP query `count()`/
`select` dari tabel `user` yang TIDAK secara eksplisit filter role WAJIB
dicurigai — apakah ini benar-benar bermaksud "semua akun tanpa
pandang bulu" (jarang, biasanya cuma internal ops) atau "pengguna
produk" (paling sering, dan yang paling sering salah asumsi). Kalau
project ini nambah endpoint admin BARU yang query tabel `user`, grep
dulu apakah butuh filter role customer sebelum menganggap `count()`
polos sudah benar.

---

## 2026-09-08 — Link notifikasi admin double-prefix `/admin/admin/...` (404) karena href tidak ikut konvensi bare-path proxy
**Masalah:** User laporkan link notifikasi di admin
(`https://admin.facinstitute.id/admin/orders`) salah, seharusnya
`.../orders`. Bukan cuma kosmetik — link itu sebenarnya 404 kalau
diklik.

**Root cause:** `apps/web/proxy.ts` rewrite SEMUA request subdomain
admin/app jadi `/${surface}${pathname}` (mis. request browser ke
`/orders` di-rewrite jadi `/admin/orders` secara internal untuk resolve
folder route Next.js). Konsekuensinya: SEMUA href yang ditulis di kode
WAJIB bare path (`/orders`, `/announcements`, `/`), TIDAK BOLEH sudah
menyertakan prefix surface — proxy yang nambahin. `lib/notification-routes.ts`
(Fase 45/46) lupa konvensi ini, 3 return value untuk surface admin
sudah include `/admin` manual → double-prefix `/admin/admin/orders`
begitu di-rewrite, TIDAK ADA folder route itu.

**Fix:** Hapus prefix manual, konsisten dengan sidebar admin
(`app-shell/sidebar.tsx` → `href: "/orders"` bare) yang dari awal sudah
benar.

**Pencegahan:** Kalau ada middleware/proxy yang REWRITE path secara
otomatis berdasar subdomain/context (pola "1 sumber kebenaran nambah
prefix di 1 tempat"), SEMUA kode lain yang generate href/URL untuk
konteks itu WAJIB diverifikasi TIDAK ikut menambahkan prefix yang sama
secara manual — grep utility function yang mengembalikan path string
(bukan cuma komponen JSX `<Link>`) untuk cek konsistensi, jangan cuma
review komponen yang paling sering dilihat (sidebar nav di sini sudah
benar sejak awal, tapi util terpisah yang jarang disentuh — dipakai
notifikasi — luput).

---

## 2026-09-08 — `new Map(rows.map((r) => [key, r]))` diam-diam buang duplikat key (kolom "Langganan Aktif" `/admin/users` cuma tampil 1 dari beberapa)
**Masalah:** User laporkan 2 klien production yang sebelumnya
berlangganan SEMUA modul sekarang cuma tampil 1 modul di kolom
"Langganan Aktif" laman `/admin/users`. Sempat dikira data hilang di
database — ternyata bukan.

**Root cause:** `GET /admin/users` (`admin/users.route.ts`) bangun peta
subscription-per-user dengan `new Map(subRows.map((s) => [s.userId, s]))`.
Kalau 1 `userId` muncul lebih dari sekali di `subRows` (user punya >1
subscription `active` sekaligus — jadi kondisi NORMAL sejak Fase 53
multi-tier per modul), `Map` cuma simpan entry TERAKHIR, sisanya
ke-overwrite diam-diam TANPA error/warning apa pun. Response field
`activeSubscription` didesain singular (nullable) sejak awal (Fase 10,
sebelum multi-tier ada), jadi bug ini laten sampai ada customer real
dengan >1 modul aktif.

**Fix:** Ganti jadi `Map<userId, subscription[]>` (accumulate, bukan
overwrite), response field jadi `activeSubscriptions` (array). Frontend
render semua badge, bukan 1.

**Pencegahan:** `new Map(array.map(x => [x.someKey, x]))` HANYA aman
kalau `someKey` dijamin unik di `array` itu — begitu ada kemungkinan 1
key punya banyak baris (relasi one-to-many, bukan one-to-one), pola ini
membuang data diam-diam tanpa exception. Kalau relasinya bisa
one-to-many (apalagi kalau desain sebelumnya cuma didasarkan asumsi
"biasanya 1 aktif" yang berubah seiring fitur baru), pakai
`Map<key, T[]>` (accumulate via spread/push) sejak awal, bukan tunggu
sampai kejadian di production. Waspadai KHUSUS kode yang ditulis waktu
suatu relasi memang masih 1:1 lalu jadi 1:N setelah fitur baru (di sini:
Fase 53 multi-tier bikin "1 modul aktif per user" jadi "banyak modul
aktif per user") — endpoint listing/agregasi lama yang mengasumsikan
1:1 TIDAK otomatis ikut disesuaikan cuma karena fitur baru lolos
typecheck & test-nya sendiri.

---

## 2026-09-08 — Batch import "failed" tapi baris-barisnya kosong tanpa error message (gagal-dini sebelum loop per-baris)
**Masalah:** User temukan batch production nyata
(`379b65d8-90e4-4f29-8abb-70af74ddff74`) — status batch `"failed"`
(sudah `completed_at`), tapi kedua baris di dalamnya masih `"pending"`
tanpa `errorMessage` sama sekali. Admin lihat kolom "ID Transaksi
Accurate / Error" kosong total, tidak tahu penyebab gagal.

**Root cause:** Job `IMPORT_TO_ACCURATE` (`workers/index.ts`) punya 2
titik "gagal dini" SEBELUM loop per-baris mulai (koneksi Accurate
belum ada, atau `openAccurateSession()` gagal) — di titik ini cuma
`importBatches.status` yang di-set `"failed"`, baris-barisnya TIDAK
PERNAH disentuh. Ini bug SISTEMIK — kode ini SHARED, dieksekusi SEBELUM
percabangan per modul, jadi berpotensi kena SEMUA 6 modul import, bukan
cuma modul tempat ditemukan (Purchase Invoice).

**Fix:** Helper `failAllPendingRows(batchId, errorMessage)` dipanggil
di kedua titik gagal-dini, update SEMUA baris `pending`/`failed` di
batch itu dengan error message actionable. Ditaruh SEBELUM percabangan
per modul supaya otomatis berlaku ke ke-6 modul sekaligus.

**Pencegahan:** Kalau ada proses BATCH (bukan cuma per-baris) yang bisa
gagal di LEVEL BATCH sebelum baris-barisnya sempat diproses — WAJIB
tetap propagasikan alasan kegagalan itu ke level BARIS juga (bukan
cuma level batch), kalau UI yang dilihat user itu tabel per-baris
(bukan status batch). "Update status parent" TIDAK OTOMATIS berarti
"user tahu kenapa" kalau child records (baris) yang jadi sumber
informasi utama di UI dibiarkan kosong. Cek SEMUA early-return/exit
path sebuah job batch, bukan cuma jalur "happy path" per-baris yang
biasanya sudah dapat perhatian lebih waktu development.

---

## 2026-09-07 — Subscription trial LAMA tidak pernah ditutup saat upgrade ke paket asli (bug laten sejak Fase 43)
**Masalah:** Trial (Fase 43) sengaja didesain TIDAK memblokir checkout
paket asli untuk modul yang sama (`activeModules` di guard checkout
cuma hitung subscription NON-trial) — tapi arah sebaliknya tidak pernah
diurus: begitu admin confirm pembayaran paket asli, subscription trial
LAMA untuk modul yang sama dibiarkan tetap `status: "active"`. User
jadi punya 2 subscription "active" bersamaan untuk 1 modul (trial +
asli) — konsumer yang beda (`getActiveSubscriptionsWithPlans` pakai
`orderBy(desc(createdAt))` lalu `.find()` ambil pertama; `/subscribe`
`activeModuleMap` pakai `for...of` + `Map.set()` yang efeknya kebalik,
row PALING AWAL diproses menang kalau ada duplikat) bisa kasih jawaban
BEDA soal modul yang sama — user bisa lihat badge "Sedang Trial" padahal
sudah bayar.

**Fix:** `admin/orders.route.ts` (confirm) dan `admin/subscriptions.route.ts`
(assign manual) sekarang tutup (`status: "cancelled"`) SEMUA subscription
aktif lain untuk modul yang sama SEBELUM insert subscription baru —
invariant "1 modul aktif = 1 subscription" jadi benar-benar dijaga oleh
kode, bukan cuma best-effort lewat urutan query di beberapa tempat.

**Pencegahan:** Kalau ada fitur "downgrade-tapi-tidak-blokir" serupa
(status A tidak menghalangi upgrade ke status B) — WAJIB cek juga ARAH
SEBALIKNYA: begitu B tercipta, apakah A ditutup? "Tidak saling blokir"
BUKAN berarti "boleh koeksis selamanya tanpa transisi" — kalau ada
invariant "cuma 1 yang aktif", tegakkan di titik PENCIPTAAN record baru
(bukan cuma di titik pembacaan lewat urutan query), supaya tidak
order-dependent di banyak tempat berbeda.

---

## 2026-09-07 — Deploy production PERTAMA: 3 bug infrastruktur baru ketahuan karena jalur-jalur ini belum pernah benar-benar dieksekusi
**Masalah:** Deploy production pertama kali ke domain asli (`facinstitute.id`,
instance baru terpisah dari demo `ane.web.id`) langsung kena 3 bug beruntun,
semuanya bug LAMA yang baru "teruji" sekarang:
1. **CI**: `ci.yml`/`release.yml`/`deploy-staging.yml` set env var MINIO_*
   tanpa server MinIO beneran (tidak ada `services:`/container) — 3 test
   upload bukti transfer selalu gagal (500) begitu benar-benar dijalankan.
   Baru ketahuan karena test itu baru di-unskip beberapa hari sebelumnya.
2. **Docker `apps/api`**: `pdfkit` (dependency fitur invoice PDF, Fase 15)
   di-bundle `bun build` ke `dist/index.js` — Node subpath import
   (`#standard-fonts/*` di package.json pdfkit sendiri) cuma resolve benar
   relatif ke package.json ASLI, gagal total begitu dibundle ke file lain.
   Container crash-loop. Baru ketahuan karena fitur PDF baru pertama kali
   di-build jadi image Docker di rilis ini.
3. **Docker `apps/api`**: image production cuma copy `dist/`+`node_modules`+
   `package.json` — TIDAK menyertakan `drizzle.config.ts`, folder migration
   `drizzle/`, atau `src/` asli (dibutuhkan `db:seed` yang jalan dari
   source, bukan dist). `db:migrate`/`db:seed` gagal total di container
   yang sudah jalan. Baru ketahuan karena baru kali ini ada yang migrate
   DB KOSONG dari dalam image production ini.

**Root cause umum:** ketiga bug ini SUDAH ADA sejak lama (bug #2/#3 sejak
fitur PDF/pertama kali Dockerfile ditulis, bug #1 sejak test-nya di-unskip)
tapi tidak pernah ketahuan karena CI/redeploy rutin sebelumnya tidak pernah
benar-benar exercise jalur itu (test upload di-skip, fitur PDF belum ada
saat image terakhir di-build, tidak pernah ada instance BARU dengan DB
kosong yang di-migrate dari dalam container production).

**Fix:** § detail lengkap di `docs/phases/phase-52-perbaikan-deploy-production-pertama.md`.
Rilis `v1.13.0` → `v1.13.1` → `v1.13.2` (2 hotfix beruntun).

**Pencegahan:** Kalau nambah dependency baru yang PERNAH dipakai library
lain dengan Node subpath imports (`#foo` di package.json), ATAU nambah
command baru yang jalan dari `src/` (bukan `dist/`) di dalam container
production — WAJIB coba build+jalankan image Docker-nya SUNGGUHAN sebelum
anggap selesai, jangan cuma percaya `bun run typecheck`/`bun run test`
lokal (keduanya jalan dari source lengkap, tidak exercise apa yang
BENERAN ke-copy ke image final). Pola sama seperti entri 2026-08-27
("`deploy.yml` belum pernah jalan sejak v1.0.0") — CI hijau BUKAN bukti
Docker image-nya benar, cuma bukti source code-nya benar.

## 2026-09-07 — Admin-provisioned user WAJIB `email_verified=true` manual, lupa = "Email atau password salah" yang menyesatkan
**Masalah:** Bootstrap akun Super Admin pertama di instance production baru
via script one-off (`auth.api.signUpEmail()`, jalur resmi Better Auth) —
login gagal terus dengan pesan generik "Email atau password salah" (403),
padahal password sudah benar dan sudah di-reset ulang. Root cause: lupa
langkah `db.update(userTable).set({emailVerified: true})` setelah
`signUpEmail()` — `requireEmailVerification: true` di Better Auth menolak
SEMUA sign-in akun belum verifikasi, tapi pesan error di frontend generik
("Email atau password salah") sehingga user (dan Claude) awalnya curiga
ke password/cookie/CORS, bukan status verifikasi.

**Fix:** `UPDATE "user" SET email_verified = true WHERE email = '...'`
manual (sekali saja, per akun admin-provisioned).

**Pencegahan:** Kalau bikin user LEWAT `auth.api.signUpEmail()` di luar
jalur `admin/users.route.ts`/`admin/staff.route.ts` yang sudah ada (mis.
script bootstrap one-off), WAJIB ikut copy langkah `emailVerified: true`
juga — jangan asumsikan "signUpEmail sudah cukup". Kalau ketemu error
login generik yang tidak masuk akal (password sudah benar tapi tetap
gagal), cek `email_verified` di DB SEBELUM curiga ke hal lain (cookie
domain, CORS, rate limit) — cek paling cepat & paling murah duluan.

---

## 2026-09-06 — Asumsi kunci grouping Excel ("PO Number") ternyata SELALU KOSONG di data asli — verifikasi ke OpenAPI spec resmi TIDAK CUKUP
**Masalah:** User minta cek apakah modul import Facport sudah "follow up"
file Excel contoh kompetitor di `docs/referencehtml/`. Dibandingkan
langsung (bukan cuma baca header kolom, tapi ISI datanya): Sales Invoice
grouping multi-item pakai kolom "PO Number" — di data ASLI kompetitor
(833 baris nyata) **PO Number 100% KOSONG**, padahal **52% faktur (77/149)
itu multi-item** (sampai 58 baris/faktur). Tiap baris kebaca "faktur
sendiri-sendiri", TANPA error — faktur 58-item bisa pecah jadi 58 faktur
terpisah di Accurate, diam-diam salah. Sales Receipt malah SAMA SEKALI
tidak dukung grouping, padahal 100% (137/137) struk penerimaan
kompetitor multi-faktur.

**Root cause:** Desain awal (Fase 13/34) sudah diverifikasi ketat ke
`accurate-openapi.json` (field/tipe/required BENAR sesuai spec resmi) —
tapi verifikasi itu cuma menjawab "apakah field ini VALID di Accurate",
BUKAN "apakah field/kolom ini REALISTIS TERISI di praktik nyata
customer". "PO Number" valid secara skema, tapi ternyata jarang/tidak
pernah dipakai bisnis riil untuk penjualan retail — sementara "Trans No"
(nomor transaksi sendiri, field `number`) justru SELALU diisi customer
karena mereka assign nomor sendiri (bukan pakai auto-number Accurate).

**Fix:** § Fase 49 — `groupSalesInvoiceRows` digeneralisasi (prioritas
"Trans No", fallback "PO Number", fallback akhir 1-baris-1-faktur — TIDAK
ada regresi). Sales Receipt dapat grouping baru dari nol (`receiptNumber`
→ Accurate `number`), SEDERHANA tanpa retry-cerdas-lintas-batch (karena
"Batal Import" sengaja tidak didukung modul itu).

**Pencegahan:** untuk modul import BARU (atau audit modul lama) — spec
API resmi menjawab "field apa yang VALID", tapi TIDAK menjawab "kolom
mana yang REALISTIS TERISI". Kalau ada sample data nyata (kompetitor,
customer, atau template industri) — WAJIB dicek ISI datanya (persentase
kosong/terisi per kolom kandidat kunci grouping), bukan cuma nama
kolomnya. Purchase Payment & Journal Voucher punya gap serupa
(ditemukan di audit yang sama, § plan Fase 49), BELUM diperbaiki —
prioritaskan kalau ada waktu.

---

## 2026-09-06 — Self-register TIDAK PERNAH dapat role "customer" — login "gagal diam-diam" & tidak muncul di admin
**Masalah:** User daftar akun baru (`wasugi@gmail.com`) lewat `/register`
publik. Setelah email di-verify manual (RESEND_API_KEY belum
dikonfigurasi, verifikasi email belum bisa terkirim), user tetap tidak
bisa login (dilempar balik ke `/login` tanpa pesan error) DAN akunnya
tidak muncul sama sekali di halaman admin Pengguna.

**Root cause:** alur self-service (`RegisterForm` → `authClient.signUp.email`
→ Better Auth `POST /api/auth/sign-up/email`) **tidak pernah insert baris
`user_roles`** — beda dari alur admin-provisioned (`admin/users.route.ts`
baris ~168-171, `admin/staff.route.ts` baris ~84) yang eksplisit assign
role SETELAH `auth.api.signUpEmail()`. Dua akibat gabungan:
1. `GET /admin/users` (`admin/users.route.ts` baris ~55-62) filter STRICT
   ke user yang punya role "customer" (`inArray(userTable.id,
   customerIds)`) — user tanpa role tidak pernah lolos filter, hilang
   total dari listing.
2. `apps/web/app/app/(protected)/layout.tsx` baris ~20 cek
   `me.roles.includes("customer")` dan `redirect("/login")` kalau kosong
   — dari sisi user, auth SUKSES (cookie sesi ke-set) tapi langsung
   dilempar balik ke halaman login TANPA pesan error apa pun, kelihatan
   persis seperti "login gagal".

**Fix:** intercept `POST /api/auth/sign-up/email` di `apps/api/src/app.ts`
(pola SAMA PERSIS intercept disabled-account-check di sign-in yang sudah
ada) — setelah `auth.handler(request)` sukses, baca `response.clone()`
buat ambil `user.id`, lalu assign role "customer" (`onConflictDoNothing`).
**Sengaja BUKAN `databaseHooks.user.create.after`** (dicoba dulu, DITOLAK
oleh test) — hook itu jalan untuk SEMUA jalur `auth.api.signUpEmail()`
termasuk akun admin/staff-provisioned, bikin akun staff/admin ikut
kebagian role "customer" (melanggar separasi role di
`architecture-user-roles.md`, ketahuan dari 3 test gagal:
`admin/staff.route.test.ts` × 2, `admin/users.route.test.ts` × 1).
Intercept di route HTTP path spesifik AMAN karena `admin/users.route.ts`/
`admin/staff.route.ts` manggil `auth.api.signUpEmail()` sebagai
**server-side function call langsung** (bukan request HTTP ke path itu),
jadi tidak pernah menyentuh intercept ini sama sekali.
Regression test ditambah di `app.test.ts` ("role customer otomatis") —
sengaja set `x-real-ip` unik supaya tidak numpuk ke bucket rate-limit
`/api/auth` bersama test lain (§ pelajaran turunan: bucket rate-limit
`"unknown"` di test suite sudah HAMPIR PENUH oleh test yang tidak kirim
IP — 1 request tambahan tanpa IP unik langsung bikin test LAIN yang
jalan setelahnya kena 429, false failure yang kelihatan tidak related).
Backfill manual untuk akun yang sudah kena bug (`user_roles` insert
langsung by SQL, 1 akun terdampak di DB dev).

**Pencegahan:** kalau nanti ada jalur signup BARU (mis. OAuth
social login), WAJIB cek ulang apakah perlu role default juga — role
assignment TIDAK otomatis dari Better Auth core, harus eksplisit di tiap
titik masuk (admin-provisioned SUDAH benar, self-service BARU
diperbaiki di sini).

---

## 2026-09-06 — Audit timezone menyeluruh: 2 bug FATAL ditemukan, setting `company.timezone` ternyata tidak pernah dipakai
**Masalah:** User minta audit ("berlangganan tidak benar terhitung-nya
hanya karena timezone, kalau salah ini, fatal"). Ditemukan setting
`company.timezone` (ada sejak Fase 00/01) **TIDAK PERNAH benar-benar
dipakai** di kode manapun — `formatDate()` hardcode `"Asia/Jakarta"`
literal, murni decorative.

**Bug #1 (FATAL) — `endAt` subscription admin-manual salah ~7 jam:**
`admin/users/page.tsx` (`POST`/`PATCH /admin/subscriptions`) kirim
`new Date(dateInputValue).toISOString()` dari `<input type="date">` —
JS mem-parse string tanggal-saja ("2026-12-31") sebagai **UTC MIDNIGHT**,
bukan akhir hari di Asia/Jakarta (UTC+7). Admin pilih "31 Desember"
bermaksud "berlaku SAMPAI akhir hari itu", tapi subscription tersimpan
expired mulai jam 07:00 WIB tanggal itu JUGA — masa aktif TERAKHIR
terpotong ~17 jam tanpa admin sadar.

**Bug #2 (FATAL) — `todayAccurateDate()` pakai local server time:**
`apps/api/src/lib/accurate-vendor.ts` — `now.getDate()`/`getMonth()`/
`getFullYear()` baca timezone PROSES SERVER, bukan timezone perusahaan.
Di production (container `postgres:16-alpine`/`oven/bun` tanpa `TZ`
eksplisit, default OS-nya UTC), jendela 00:00–06:59 WIB (=17:00–23:59
UTC hari sebelumnya) bikin `transDate` auto-create vendor/customer
tercatat SALAH 1 HARI di pembukuan Accurate customer, SETIAP HARI,
tanpa terkecuali, selama jendela itu.

**Root cause bersama:** kedua bug BUKAN soal penyimpanan DB (semua
kolom sudah `timestamptz`/UTC dengan benar) — soal titik KONVERSI:
(a) input tanggal-saja dari user butuh tahu timezone perusahaan untuk
diinterpretasikan dengan benar sebelum jadi instant UTC, dan (b) "hari
ini" untuk keperluan bisnis harus dihitung dari timezone perusahaan,
bukan UTC atau local server time. Kode lain yang SUDAH BENAR
(`toAccurateDate()` untuk parse tanggal Excel, kalkulasi `endAt` self-
service via aritmetika milidetik, job `EXPIRE_SUBSCRIPTIONS`) jadi bukti
pola yang benar itu SUDAH ADA di codebase — cuma tidak diterapkan
konsisten di 2 titik ini.

**Fix:** `apps/api/src/lib/company-timezone.ts` (baru,
`getCompanyTimezone()`), `apps/web/lib/timezone.ts` (baru,
`endOfDayInTimezone`/`middayInTimezone`, native `Intl.DateTimeFormat`,
TANPA dependency baru), `CompanyTimezoneProvider` (Context, root layout)
+ wire ulang 16 titik `formatDate()`. Detail lengkap →
`docs/decisions/adr-0028-timezone-aware-date-handling.md`,
`docs/phases/phase-44-audit-timezone.md`.

**Pencegahan:** SETIAP kali ada `<input type="date">` yang hasilnya
dikirim ke backend sebagai instant (bukan string tanggal apa adanya) —
WAJIB lewat `lib/timezone.ts` (`endOfDayInTimezone`/`middayInTimezone`),
TIDAK PERNAH `new Date(dateOnlyString)` langsung. Kalau ada logic "hari
ini menurut kalender bisnis" di backend — WAJIB pakai
`company-timezone.ts` `getCompanyTimezone()` + `Intl.DateTimeFormat`,
TIDAK PERNAH local Date getters (`getDate()`/`getMonth()`/`getHours()`
dkk, semua itu baca timezone PROSES, bukan timezone bisnis).

---

## 2026-09-06 — Fase 43 (trial) awalnya salah asumsi "semua paket otomatis bisa trial"
**Masalah:** Implementasi pertama Fase 43 (sistem trial) membuat SEMUA
paket otomatis punya jalur "Coba Gratis" begitu fitur dirilis — tidak
ada kontrol admin sama sekali. User koreksi: "kalau otomatis aktif
semua tidak seru, admin tidak punya otoritas terhadap paketnya" — admin
harus bisa memilih PER PAKET mana yang boleh ditrial, bukan flag
global/otomatis untuk semua.

**Root cause:** Instruksi awal user ("saya ingin semua paket punya
fitur trial") dibaca terlalu literal sebagai "semua paket AKTIF trial
sekarang", padahal maksudnya "semua paket harus PUNYA KEMUNGKINAN
ditrial" — kontrol aktivasinya tetap harus di tangan admin per paket,
konsisten dengan pola `isActive` (paket juga tidak otomatis aktif tanpa
admin yang menentukan).

**Fix:** Tambah kolom `plans.trialEligible` (boolean, default `false`).
Admin toggle eksplisit "Bisa Dicoba Gratis (Trial)" di form buat/edit
paket (`admin/plans/page.tsx`). `POST /subscriptions/trial` menolak
(`TRIAL_NOT_AVAILABLE_FOR_PLAN`) kalau `plan.trialEligible` false — guard
DI SERVER, bukan cuma sembunyikan tombol di frontend. § detail lengkap
`docs/architecture/architecture-subscription.md` § "Trial (Batas Baris)".

**Pencegahan:** Kalau user minta "semua X punya fitur Y" pada entity
yang punya konsep aktif/nonaktif (paket, user, dst.) — WAJIB tanya/
asumsikan default AMAN (nonaktif, admin yang mengaktifkan), bukan
langsung nyalakan semua entity sekaligus tanpa kontrol, KECUALI user
eksplisit bilang "otomatis untuk semua".

---

## 2026-09-06 — Batas baris trial (Fase 43) TIDAK row-lock — TOCTOU teoretis kalau 2 batch dikonfirmasi bersamaan
**Masalah/keputusan:** `checkTrialRowBudget()` (`apps/api/src/lib/trial.ts`)
dipanggil di 12 titik (`:batchId/confirm`+`:batchId/retry` × 6 modul)
SEBELUM `boss.send(JOBS.IMPORT_TO_ACCURATE, ...)`, TAPI tidak dibungkus
row-lock/transaction seperti checkout (`POST /subscriptions/checkout`
row-lock `user` FOR UPDATE, § architecture-subscription.md § "Trial
(Batas Baris)"). Kalau customer trial mengonfirmasi 2 batch BERSAMAAN
(2 tab), keduanya bisa lolos cek kuota secara independen lalu gabungan
keduanya melebihi `trial.maxRows` — race TOCTOU (time-of-check to
time-of-use).

**Kenapa DITERIMA tanpa fix sekarang:** confirm/retry endpoint ini
SUDAH TIDAK row-lock terhadap double-submit biasa SEBELUM Fase 43 juga
(keterbatasan pre-existing, bukan regresi baru) — menambah row-lock
KHUSUS untuk trial butuh restrukturisasi endpoint yang dipakai SEMUA
subscription (trial maupun bukan), di luar scope Fase 43. Dampaknya pun
kerugian bisnis kecil (beberapa baris ekstra trial gratis), BUKAN celah
keamanan/data breach — tidak ada akses data user lain, tidak ada bypass
auth/ownership.

**Kalau nanti mau diperketat:** tambahkan row-lock (`SELECT ... FOR
UPDATE`) pada baris `subscriptions` yang bersangkutan di dalam
`checkTrialRowBudget()`, dibungkus 1 transaction bareng
`db.update(importBatches)...` di endpoint pemanggilnya — pola sama
persis row-lock `user` di checkout.

---

## 2026-09-06 — QRIS dinamis gagal simpan (400) walau payload EMV valid — whitespace copy-paste
**Masalah:** User laporkan simpan QRIS di `/admin/settings` gagal —
"payload emv tidak muncul, qris tidak tersimpan", pesan generik "Gagal
menyimpan pengaturan", console: `PUT /settings 400 (Bad Request)`.

**Root cause:** `isValidQrisPayload()` (`apps/api/src/lib/qris-emv.ts`)
pakai regex `$`-anchored (`/6304[0-9A-Fa-f]{4}$/`) TANPA toleransi
whitespace — payload EMV yang disalin dari alat scan/decode QR
eksternal ke `<Textarea>` (`settings/page.tsx`) HAMPIR SELALU ikut bawa
newline/spasi di awal/akhir (kebiasaan copy-paste umum). Payload yang
SEBENARNYA valid jadi ditolak, dan pesan error di frontend TIDAK
menangani kode `INVALID_QRIS_ACCOUNTS` secara spesifik (jatuh ke
fallback generik) — admin tidak dapat petunjuk sama sekali kenapa gagal.

**Fix:**
1. Backend (`settings.route.ts`): `isValidQrisAccounts()` validasi versi
   `.trim()` dari `emvPayload`; `normalizeQrisAccounts()` (baru) trim
   SEBELUM disimpan — nilai yang lolos validasi = persis nilai yang
   tersimpan.
2. Frontend: trim + cek struktural yang SAMA (mirror, bukan import) di
   client SEBELUM submit — admin dapat feedback SPESIFIK ("Payload EMV
   untuk QRIS \"X\" tidak valid...") instan tanpa perlu round-trip
   server. Tambah handling eksplisit `INVALID_QRIS_ACCOUNTS`/
   `INVALID_BANK_ACCOUNTS` di error branch (sebelumnya jatuh ke fallback
   generik "Gagal menyimpan pengaturan" — sama sekali tidak actionable).

**Pencegahan:** Field mana pun yang menerima data disalin-tempel dari
sumber eksternal (bukan diketik manual) WAJIB di-trim sebelum validasi
struktural APA PUN yang pakai anchor `^`/`$` — whitespace tersembunyi
dari clipboard adalah sumber bug yang sangat umum, TIDAK terlihat di
UI (Textarea tidak menampilkan newline/spasi trailing secara jelas).
Kalau nambah validasi client-side yang MIRROR backend, selalu sertakan
kode error spesifik dari server juga di frontend (jangan biarkan
fallback generik jadi satu-satunya jalur) — supaya kalau validasi
client kelewat sesuatu, pesan dari server tetap actionable.

**Test regresi**: `settings.route.test.ts` — payload dengan whitespace
sekarang tersimpan TRIM (200), payload BENERAN invalid tetap ditolak
(400 + `qrisId` spesifik).

**Bug KEDUA, ketemu SEGERA setelah fix di atas dari testing user**: fix
pertama nambah `.trim()` LANGSUNG ke `a.emvPayload` (`handleSave`,
`settings/page.tsx`) — TAPI entri QRIS `isDynamic: false` (statis, tidak
butuh payload EMV) TIDAK PERNAH dijamin punya field `emvPayload` sama
sekali di data lama/tersimpan (bentuknya `{id, name, imageUrl,
isDynamic}` saja, field opsional yang hilang, BUKAN string kosong) —
`undefined.trim()` → `TypeError` runtime, bikin halaman `/admin/settings`
CRASH TOTAL saat coba simpan (bukan lagi 400 API, tapi client exception).

**Root cause dikonfirmasi PERSIS**: `orders.route.test.ts`/
`public/orders.route.test.ts` MENULIS fixture `{id: "qris-static-1",
name: "QRIS Statis", imageUrl: "https://example.test/qris-public.png",
isDynamic: false}` (TANPA `emvPayload`) ke row SETTINGS GLOBAL
`company.qrisAccounts` tiap kali test itu jalan (untuk uji jalur
konsumsi QRIS statis di `orders.route.ts`), lalu TIDAK cleanup — persis
pola "test tulis row settings GLOBAL, tidak restore" yang sudah dicatat
2× sebelumnya hari ini (`data.manualInputSecondsPerRow`, Fase 40/41).
`https://example.test/qris-public.png` adalah domain reserved-for-testing
(RFC 2606) — bukti kuat ini fixture test, BUKAN data asli user yang
kebetulan sempat terhapus salah sasaran sebelumnya di sesi yang sama.

**Fix KEDUA**: normalisasi SETIAP entri `qrisAccounts` SAAT LOAD dari
server (bukan cuma saat save) — tiap field WAJIB (`id`/`name`/
`imageUrl`/`isDynamic`/`emvPayload`) diberi default eksplisit kalau
hilang, supaya `form.qrisAccounts` di state React SELALU cocok 100%
dengan tipe `QrisAccount` (tidak ada field opsional tersembunyi). Plus
defense-in-depth `(a.emvPayload ?? "").trim()` di `handleSave`.

**Pencegahan DIPERKUAT**: kalau baca data eksternal (API response) ke
state yang tipenya "semua field wajib ada", JANGAN cuma `as Type[]`
(type assertion TIDAK memvalidasi apa pun saat runtime) — normalisasi
dengan default eksplisit per-field SAAT LOAD, bukan berasumsi shape-nya
selalu lengkap. Ini kelas bug yang SAMA dengan alasan `t.Unknown()` di
`settings.route.ts` butuh validasi manual (§ komentar di file itu) —
skema key-value fleksibel = TIDAK ADA jaminan struktur dari database/
migration, cuma dari kode yang menulisnya (dan kode lama/test bisa
menulis versi field yang lebih sempit dari tipe frontend saat ini).

---

## 2026-09-06 — Card "Langganan" dashboard tampilkan raw key modul (`purchase_payment`) bukan label manusia — FIXED
**Masalah:** User laporkan card "Langganan" di dashboard `app.` tampil
"Modul: purchase_payment" dkk — key database mentah, bukan label
("Purchase Payment").

**Root cause:** `apps/web/app/app/(protected)/page.tsx` baris
`Modul: {row.plan.modules.join(", ")}` join array modul LANGSUNG tanpa
lewat `moduleLabel()` (`lib/module-options.ts`) — helper yang SUDAH
dipakai konsisten di 5 tempat lain (subscribe page, catalog-cart admin
invoices, admin users list & detail). Baris ini kelewat saat helper itu
diperkenalkan Fase 17, tidak pernah di-backfill.

**Fix:** `row.plan.modules.map(moduleLabel).join(", ")`.

**Update sama hari — ketemu 2 lokasi LAGI**: user minta verifikasi
model koneksi Accurate (1 subscription/modul = 1 Data Usaha, reusable
lintas modul) sekaligus cek UI-nya — investigasi itu menemukan bug
SAMA PERSIS di `apps/web/app/app/(protected)/accurate/page.tsx`, 3
baris (`<CardDescription>Modul: {row.moduleKey ?? "-"}</CardDescription>`)
render `moduleKey` mentah (`plan.modules[0]` dari
`accurate.route.ts:61`) tanpa lewat `moduleLabel()`. Fix sama:
`row.moduleKey ? moduleLabel(row.moduleKey) : "-"`. Sapuan lanjutan
(`grep -rn "moduleKey"` lintas `apps/web`) mengonfirmasi SEMUA
pemakaian `moduleKey` lain sudah aman (type def, filtering logic, atau
sudah dipasangkan field `.label` terpisah yang memang dirender — bukan
`moduleKey` mentah).

**Pencegahan:** Sapuan cepat (`grep -rn "modules\.join\|modules\.map"`
dan `grep -rn "moduleKey"`) mengonfirmasi cakupan penuh. Pola sama
dengan bug admin batch-view di atas: helper/pola baru diperkenalkan
tapi tidak di-audit ulang ke SEMUA tempat existing yang seharusnya
ikut pakai. Kalau nanti nambah field key-based baru (module/status/
role/dst), WAJIB langsung cek: ini akan dirender ke user, dan kalau
ya, apa sudah ada helper label-nya, dan sudah dipakai di SEMUA titik
render, bukan cuma titik yang baru ditulis.

---

## 2026-09-06 — Audit konsistensi 6 modul: shared admin view TIDAK ikut update saat modul baru ditambah — FIXED (semua temuan sekarang RESOLVED, § update di bawah)

> **Update sore 2026-09-06**: temuan gap besar di bawah (paritas fitur
> Riwayat/Edit Baris/Hapus) SUDAH diselesaikan — Fase 36-39 membangun
> fitur itu untuk keempat modul yang tadinya kosong (Vendor Payable
> Account, Purchase Payment, Sales Receipt, Jurnal Umum). Detail →
> `docs/phases/phase-36-riwayat-vendor-payable-account.md` s/d
> `docs/phases/phase-39-riwayat-journal-voucher.md`,
> `docs/PROGRESS.md` § Update 2026-09-06 (Fase 36-39). Isi asli entri
> ini (root cause bug admin batch-view) dipertahankan apa adanya di
> bawah sebagai referensi historis.
**Masalah:** User minta evaluasi menyeluruh 6 modul import (Purchase
Invoice, Sales Invoice, Vendor Payable Account, Purchase Payment, Sales
Receipt, Jurnal Umum) — konsistensi, integrasi admin, retensi data,
gap/bug antara dokumentasi arsitektur vs kode. Ditemukan
`admin/import-batches/[batchId]/page.tsx` (Fase 30, dibangun SEBELUM
Purchase Payment/Sales Receipt/Jurnal Umum ada) hardcode render cabang
`{batch.module === "..."}` cuma untuk 3 modul lama — 3 modul baru (Fase
33-35) TIDAK PERNAH dapat cabang render, walau BACKEND-nya
(`admin/import-batches.route.ts`) sudah generik sejak awal. Admin yang
buka detail batch salah satu dari 3 modul baru cuma lihat header +
ringkasan, TANPA tabel per-baris sama sekali — persis kasus yang Fase
30 seharusnya cegah ("admin tahu apa yang error saat ditelepon").

**Root cause:** Halaman ini SENGAJA replikasi tampilan PER-MODUL
(bukan 1 komponen generik, keputusan sadar Fase 30 supaya tampilan
match versi customer persis) — trade-off-nya: kalau ada modul baru,
WAJIB diingat manual untuk tambah cabang render di sini juga. Tidak ada
mekanisme yang otomatis "memaksa" developer (atau Claude) ingat
melakukan ini saat membangun modul baru.

**Fix:** Tambah `PurchasePaymentView`/`SalesReceiptView`/
`JournalVoucherView` (mirror persis `VendorPayableAccountView` — ketiga
modul baru itu sama-sama tanpa grouping kolom) + 3 entri `MODULE_TITLE`.

**Pencegahan:** Kalau bikin modul import baru lagi, checklist tempat
yang WAJIB disentuh (selain route/worker/mapping/sidebar/frontend
sendiri): `admin/import-batches/[batchId]/page.tsx` (render cabang
read-only admin). **Temuan LAIN dari audit yang sama (belum di-fix,
scope lebih besar, menunggu prioritas user):** Vendor Payable Account/
Purchase Payment/Sales Receipt/Jurnal Umum TIDAK PUNYA halaman
"Riwayat" self-service, card "Import Terakhir" di dashboard, maupun
"Edit Baris" — SEMUA fitur itu cuma ada di Purchase Invoice/Sales
Invoice. Lihat `docs/PROGRESS.md` § Update 2026-09-06 untuk detail
lengkap.

---

## 2026-09-05 — MinIO lokal `.env` salah port+password — RESOLVED (sebelumnya dicatat "Known Limitation", ternyata cuma salah config)
**Masalah:** User melaporkan upload bukti transfer di halaman pembayaran
publik gagal — `PATCH /public/orders/:id/proof` balas 500. Root cause
`ECONNREFUSED` ke MinIO.

**Root cause SEBENARNYA (bukan yang diasumsikan sebelumnya):**
`apps/api/.env` di mesin ini berisi `MINIO_PORT=9002` dan
`MINIO_SECRET_KEY=minioadmin`, TIDAK cocok dengan instance MinIO native
homebrew yang benar-benar jalan (`/opt/homebrew/bin/minio server
~/minio-data --console-address :9001`, PID terverifikasi lewat `ps eww`)
— instance itu listen di port **9000** (default, sama dengan
`.env.example` & `docker-compose.dev.yml`) dengan
`MINIO_ROOT_PASSWORD=minioadmin123` (BUKAN `minioadmin` polos). 2 nilai
`.env` ini kemungkinan besar peninggalan draft config lama yang tidak
pernah disinkronkan ulang ke instance MinIO yang benar-benar dipakai.

Entri lama di `orders.route.test.ts`/`public/orders.route.test.ts`
(2026-09-04, security review Fase 16/27) SUDAH mendiagnosis separuh soal
ini dengan benar (`S3Error SignatureDoesNotMatch`, koneksi berhasil tapi
kredensial salah) — TAPI disimpulkan sebagai "infra belum dibereskan",
test di-`test.skip()`, dan tidak pernah benar-benar diperbaiki. Ternyata
password yang benar ada di environment variable proses MinIO itu sendiri
sepanjang waktu (`ps eww -p <pid>` — bukan misteri infra, cuma belum
dicek sampai ke sana).

**Fix:**
1. `apps/api/.env`: `MINIO_PORT` 9002→9000, `MINIO_PUBLIC_URL` mengikuti,
   `MINIO_SECRET_KEY` `minioadmin`→`minioadmin123`.
2. Restart proses `bun run dev` (apps/api) — `bun --watch` TIDAK
   otomatis reload nilai `.env` yang sudah termuat ke `process.env` saat
   startup pertama, restart manual proses tetap wajib walau file di
   dalam watch glob.
3. Un-skip 3 test yang sebelumnya `test.skip()` (2 di
   `orders.route.test.ts`, 1 di `public/orders.route.test.ts`) — semua
   PASS sekarang. Test suite: 170 pass/3 skip → **173 pass/0 skip**.

**Verifikasi:** `curl -X PATCH .../public/orders/:id/proof` end-to-end
manual (200, `orders.status` → `submitted`, `proof_url` terisi) SEBELUM
menjalankan test suite otomatis, supaya perbaikan dikonfirmasi nyata
lebih dulu, bukan cuma "test hijau".

**Pencegahan:** Kalau ketemu lagi gejala mirip ("test di-skip karena gap
infra lokal", "MinIO SignatureDoesNotMatch/ECONNREFUSED") — JANGAN
langsung asumsikan itu keterbatasan lingkungan yang harus diterima.
Cek DULU env var proses yang benar-benar jalan (`ps eww -p <pid> | grep
MINIO`) sebelum menyimpulkan "belum dibereskan" — kemungkinan besar cuma
`.env` yang perlu disamakan, bukan infra yang perlu dibangun ulang.

---

## 2026-09-05 — Rate limiter `x-forwarded-for` bisa dilewati bebas oleh client (High, security review Fase 27)
**Konteks:** Fase 27 menambah endpoint publik TANPA login sama sekali
(`/public/orders/*`, link pembayaran invoice — § ADR-0025) yang eksplisit
mengandalkan `rateLimitPlugin` (`lib/rate-limit.ts`) sebagai mitigasi
utama abuse (spam upload gambar, brute-force). Security review (subagent
`security-auditor`) menemukan rate limiter itu SENDIRI (dipakai juga di
`/api/auth` sejak awal) punya celah yang baru terasa serius sekarang ada
endpoint tulis publik di baliknya.

**Masalah:** `getClientIp()` (dulu inline di `onRequest`) pakai
`request.headers.get("x-forwarded-for")` MENTAH sebagai kunci bucket
rate-limit. Header ini BISA DISET BEBAS oleh client mana pun (browser
`fetch`, `curl -H`) — dan nginx (§ `docs/deployment-new-domain-onboarding.md`)
cuma **menambahkan** (`$proxy_add_x_forwarded_for`) IP asli ke header
yang sudah ada, BUKAN menimpanya. Penyerang cukup kirim nilai acak
berbeda tiap request → selalu dapat bucket rate-limit baru → limit
efektif TIDAK PERNAH terpicu untuk IP asli yang sama.

**Fix:** Pakai `x-real-ip` sebagai sumber utama — nginx config yang sama
SELALU `proxy_set_header X-Real-IP $remote_addr` (DITIMPA nginx tiap
request, client TIDAK BISA override header ini lewat request masuk).
`x-forwarded-for` dipertahankan cuma sebagai fallback dev lokal (tidak
ada nginx di depan). `apps/api/src/lib/rate-limit.ts`.

**Pencegahan:** Kalau bikin rate-limiter/apa pun yang "identitas
client"-nya dari HTTP header — WAJIB pakai header yang DITIMPA reverse
proxy tepercaya (`X-Real-IP`), BUKAN header yang cuma DITAMBAHKAN
(`X-Forwarded-For` tanpa parsing hop-paling-kanan-tepercaya). Ini jenis
bug yang "kelihatan benar" dan lolos review selama endpoint di
baliknya butuh auth (attacker sudah harus login duluan, rate-limit
cuma lapis kedua) — begitu ada endpoint PUBLIK tanpa auth di belakang
rate-limiter yang sama, celah yang sama jadi jauh lebih berarti. Cek
ulang SEMUA pemakaian rate-limiter existing kalau nanti nambah endpoint
publik baru lagi.

---

## 2026-09-05 — Bug produksi (ditemukan user pasca-Fase 21): tabel di halaman admin/app perlu scroll horizontal walau layar desktop lebar
**Konteks:** Fase 21 (Rollout Konsistensi Admin) closed dengan
"verifikasi visual browser TIDAK BISA dilakukan" (ekstensi Chrome tidak
terhubung sesi itu) — bug ini persis jenis yang lolos karena itu, ketahuan
dari laporan user langsung setelah cek manual di browser sungguhan.

**Masalah:** Halaman listing (`admin/plans`, `admin/users`, `admin/orders`,
`billing`, 2 halaman riwayat import, 3 halaman detail batch) semua
dibungkus `<div className="mx-auto flex max-w-4xl ...">` (atau
`max-w-5xl`/`max-w-3xl`) — pola yang sudah ada sejak Fase 02-18, TIDAK
diperkenalkan Fase 19-21. `components/ui/table.tsx` (§ ADR-0004) sengaja
punya `overflow-x-auto` + `whitespace-nowrap` di tiap sel supaya tabel
lebar tidak merusak layout — TAPI itu artinya kalau kontainer pembungkus
dibuat sempit (896px/`max-w-4xl`) padahal tabelnya punya 6-7 kolom,
scrollbar horizontal MUNCUL TERUS walau layar desktop asli jauh lebih
lebar (`<main>` di `AppShell` sudah cukup lega, cuma dibatasi lagi oleh
wrapper halaman itu sendiri). User: "table-nya banyak yang tertutup...
ada scroll bahkan ketika di desktop."

**Root cause:** 2 kelas halaman (form vs listing) dibungkus pola
kontainer yang SAMA (`mx-auto max-w-Nxl`) padahal kebutuhan lebarnya
beda total — form 1-kolom memang enak dibaca sempit, tabel banyak-kolom
butuh ruang. Dashboard admin/app (`(protected)/page.tsx`) KEBETULAN
sudah benar (tidak pernah pakai `mx-auto max-w-*` sejak awal) — makanya
inkonsistensi ini terasa jelas begitu user pindah dari dashboard (lega)
ke halaman Users/Plans/Orders (sempit).

**Fix:** Semua halaman yang KONTENnya tabel/listing (bukan form)
dilepas `mx-auto max-w-Nxl`-nya, diganti `flex flex-col gap-6` polos
(sama seperti dashboard) — tabel jadi pakai lebar penuh `<main>`.
Halaman yang KONTENnya form/kartu (Settings, Profile, upload Excel,
halaman bayar, koneksi Accurate, subscribe cart) SENGAJA TIDAK diubah —
lebar sempit di sana justru benar (baris teks panjang di form 1-kolom
lebar penuh malah susah dibaca).

**Pencegahan:** Kalau bikin halaman baru — tanya dulu "ini form atau
listing?" SEBELUM pasang `max-w-Nxl`. Form/detail 1-kolom → boleh
`max-w-2xl`/`max-w-3xl`. Listing/tabel (apalagi kalau pakai `DataTable`
atau >4 kolom) → JANGAN dibatasi `max-w`, biarkan penuh seperti
dashboard. `Table` primitif memang sengaja scroll-safe (`overflow-x-auto`)
untuk kasus viewport SUNGGUHAN sempit (mobile) — bukan alasan untuk
sengaja mempersempit container di desktop juga.

---

## 2026-09-05 — `@tanstack/react-table` yang terinstall (v9.1.2) API-nya BEDA TOTAL dari v8, bukan cuma minor bump
**Konteks:** Fase 19 (Admin Design System — Fondasi) akhirnya benar-benar
memakai `@tanstack/react-table` (dependency sejak ADR-0004, sebelumnya
terpasang tapi 0 pemakaian nyata di seluruh `apps/web`). Saat menulis
`components/ui/data-table.tsx`, kode berpola v8 (`useReactTable({data,
columns, getCoreRowModel: getCoreRowModel()})`) — pola paling umum di
training data/dokumentasi lama — **tidak jalan sama sekali** di versi
yang ter-install.

**Root cause:** Versi ter-install adalah v9.1.2, rilis dengan API
REACTIVE STORE yang didesain ulang total: `useReactTable` diganti
`useTable`, opsi `getCoreRowModel()`/`getSortedRowModel()` diganti
registrasi eksplisit lewat `tableFeatures({ rowSortingFeature,
sortedRowModel: createSortedRowModel(), ... })`, dan tabel WAJIB
dibangun dari 1 objek `features` yang SAMA dipakai `createColumnHelper`
maupun `useTable` (kalau beda referensi, tipe tidak nyambung). Ada
compat layer `useLegacyTable` (`import ... from
"@tanstack/react-table/legacy"`) yang meniru API v8, TAPI ditandai
`@deprecated` oleh library itu sendiri ("compatibility layer for
migrating from v8... use `useTable` instead").

**Fix:** `data-table.tsx` dibangun native di atas API v9 (`useTable`,
`tableFeatures`, `rowSortingFeature`+`createSortedRowModel()`,
`rowPaginationFeature`+`createPaginatedRowModel()`) — BUKAN pakai shim
deprecated, supaya komponen yang baru dibuat tidak langsung menumpuk
utang teknis. Ketahuan API sebenarnya BUKAN dari command `npm info`/
changelog manual, tapi dari file `node_modules/@tanstack/{react-table,
table-core}/skills/*/SKILL.md` — package ini SENGAJA men-ship dokumentasi
format "skill" untuk coding agent (metadata `library_version`, contoh
kode benar/salah eksplisit) karena penulisnya tahu training data akan
selalu bias ke v8. Skill relevan: `getting-started`, `table-features`,
`sorting`, `pagination`, `typescript`, `migrate-v8-to-v9`.

**Pencegahan:** Kalau library JS/TS versi barunya jauh lebih baru dari
yang diingat training data (terutama major version yang baru rilis),
JANGAN langsung tulis kode dari memori — cek dulu
`node_modules/<package>/skills/*/SKILL.md` kalau ada (semakin banyak
library modern 2026 mulai ship ini), atau minimal baca
`dist/*.d.ts` yang benar-benar ter-install sebelum menulis kode yang
memakainya. Ini kelas bug yang KELIHATAN benar secara sintaks/analogi
tapi gagal total di runtime/typecheck begitu dicoba.

---

## 2026-09-05 — Audit doc-vs-code pra-browser-testing Fase 14-18: 1 open redirect + 1 gap transaction ditemukan & diperbaiki
**Konteks:** Sebelum mulai verifikasi browser sungguhan untuk Fase 14-18,
diaudit ulang seluruh dokumentasi (architecture-subscription.md,
architecture-payment.md, architecture-invoice.md, phase doc 14-18) vs kode
yang benar-benar terimplementasi — bukan cuma dipercaya dari ringkasan
fase sebelumnya. Mayoritas cocok persis; 2 gap nyata ditemukan & langsung
diperbaiki (bukan cuma dicatat):

**1. Open redirect di `login-form.tsx`** — `router.push(searchParams.get("redirect")
|| "/")` menerima nilai `redirect` MENTAH dari query string publik TANPA
validasi. Sejak Fase 17, param ini dipakai jalur PUBLIK (landing →
`/login?redirect=/subscribe?plans=...`, § `catalog-cart.tsx`) — link
phishing `/login?redirect=https://evil.com` bisa arahkan user KELUAR
aplikasi tepat setelah login sukses. Gap ini sudah ada sejak Fase 01
(bukan diperkenalkan Fase 14-18), tapi baru jadi risiko nyata setelah
exposed lewat CTA publik landing. Fix: `getSafeRedirect()` helper —
TOLAK redirect yang tidak diawali `/` tunggal (blokir URL absolute
`http(s)://` DAN protocol-relative `//evil.com`, browser anggap ini
absolute juga), fallback `/`.
**Pencegahan:** setiap kali query param dipakai sebagai navigation
target (redirect, next, returnUrl, dst), WAJIB whitelist bentuk (path
relatif SATU-slash saja), JANGAN percaya string mentah dari URL.

**2. `generateInvoiceNumber()` tidak jalan di dalam transaction pembungkusnya**
— fungsi ini selalu pakai `db` modul-level, bukan `tx` yang diterima
`createInvoiceAndOrder(tx, ...)` (satu-satunya caller, dipanggil dari
DALAM `db.transaction()` di checkout & admin/users "Kirim Invoice").
`architecture-payment.md` § "Nomor Invoice" mendokumentasikan fungsi ini
seolah jalan di scope transaction yang sama — kode tidak cocok. Efek
praktis: kalau transaction pembungkus rollback SETELAH nomor
dialokasikan, nomor invoice itu "terbakar"/hilang permanen (gap
penomoran, BUKAN duplikat — `ON CONFLICT DO UPDATE ... RETURNING` tetap
atomic di koneksi manapun). Fix: `generateInvoiceNumber(tx?, now?)` —
parameter `tx` opsional (default `db`), `invoice-order.ts` sekarang oper
`tx`-nya sendiri.
**Pencegahan:** helper yang SELALU dipanggil dari dalam
`db.transaction()` (grep caller-nya dulu) harus terima `tx` sebagai
parameter, bukan diam-diam pakai `db` modul-level — pola `type Tx =
Parameters<Parameters<typeof db.transaction>[0]>[0]` (sudah dipakai
`invoice-order.ts`/`manual-subscription.ts`) harus konsisten dipakai di
SEMUA helper baru yang punya kebutuhan sama.

Juga diperbaiki (cosmetic, bukan bug fungsional): tipe generic
`boss.work<{...}>` untuk job `SEND_EMAIL` di `workers/index.ts` tidak
mendeklarasikan field `sensitive` (ada di runtime lewat `boss.send(...,
{sensitive: true})`, cuma hilang dari anotasi tipe) — ditambahkan supaya
tipe tidak menyesatkan pembaca berikutnya.

Typecheck 0 error, test suite 151 pass/2 skip/0 fail setelah semua fix
(tidak berubah dari sebelum audit — perubahan murni internal, tidak ada
kontrak API yang berubah).

## 2026-09-05 — Security review Fase 18 (Onboarding Admin): 1 High + 2 Medium diperbaiki langsung
**Konteks:** Subagent `security-auditor` review Fase 18 (`POST
/admin/users` diperluas terima `planIds`/`markAsPaid`, helper baru
`lib/invoice-order.ts`/`lib/manual-subscription.ts`, email selamat
datang otomatis). Ringkasan lengkap →
`docs/phases/phase-18-onboarding-admin.md` § "Ringkasan Hasil". Fokus
audit (mutual exclusivity 2 jalur hasil akhir, validasi plan sebelum
create user, ekstraksi `createInvoiceAndOrder` tidak melemahkan apa pun
dari versi checkout asli) semua **lolos** — 0 Critical.

**Sudah diperbaiki (High):**
- `markAsPaid: true` di `POST /admin/users` (`admin/users.route.ts`)
  MELAKUKAN PERSIS aksi yang sama dengan `POST /admin/subscriptions`
  (aktivasi subscription langsung, bypass payment) — tapi endpoint LAMA
  itu sengaja digerbangi permission TERPISAH `subscriptions.manage` (§
  ADR-0016), sedangkan endpoint baru ini cuma digerbangi `users.manage`.
  Role custom yang punya `users.manage` TAPI TIDAK `subscriptions.manage`
  (skenario realistis di RBAC dinamis project ini — mis. "staf
  onboarding" yang cuma boleh bikin akun, bukan urus billing) bisa
  memotong boundary otorisasi yang sudah didesain di endpoint lama. Fix:
  cek eksplisit `userHasPermission(user.id, "subscriptions.manage")`
  SEBELUM cabang `markAsPaid` dijalankan (dan sebelum user dibuat sama
  sekali, cegah user "setengah jalan") — 2 test regresi baru (role
  terbatas ditolak 403, admin biasa tetap jalan normal).

**Sudah diperbaiki (Medium):**
- HTML injection di email selamat datang — `body.name` (free-text admin
  input, TANPA batasan karakter) diinterpolasi mentah ke HTML email yang
  dikirim ke user baru. Admin (termasuk akun admin yang dibajak) bisa
  sisipkan markup/link palsu ke email "resmi" Facport. Fix: `escapeHtml()`
  helper baru (`lib/email.ts`), diterapkan ke `body.name` dan nama plan.
- Password sementara PLAINTEXT bisa ke-log via `lib/email.ts` fallback
  dev-no-op (`RESEND_API_KEY` kosong → seluruh `html` di-log, pola lama
  yang SENGAJA begitu supaya dev bisa lihat link verifikasi tanpa
  Resend asli — tapi email Fase 18 ini beda, isinya SECRET NYATA bukan
  link tanpa nilai). Fix: `sendEmail()` dapat parameter `sensitive?:
  boolean` — kalau `true`, fallback dev-no-op TIDAK ikutkan `html` di
  log (cuma `to`/`subject`). Email verifikasi (nilai kredensial nol)
  TETAP pakai jalur lama (tidak di-set `sensitive`), supaya kegunaan
  debug link verifikasi di dev tidak hilang.

**Ditunda ke technical debt (dicatat sesuai SOP):**
- Permission `subscriptions.manage`/`users.manage` di data role
  PRODUCTION perlu dicek manual — apakah memang ada role yang split
  seperti skenario di atas (kalau tidak ada, temuan High di atas murni
  defense-in-depth preventif, bukan celah aktif sekarang) — pola sama
  technical debt Fase 12/15/16.
- Apakah `RESEND_API_KEY` SELALU terisi di production sekarang (kalau
  ya, fix logging password murni preventif config-drift masa depan).

---

## 2026-09-04 — Security review Fase 16 (Payment Manual): 1 High + 3 Medium diperbaiki langsung, 2 Low diterima/dicatat
**Konteks:** Subagent `security-auditor` review Fase 16 (checkout cart,
skema `orders` payment manual, QRIS EMV builder, upload bukti, konfirmasi
admin dengan row-lock). Ringkasan lengkap →
`docs/phases/phase-16-payment-manual.md` § "Ringkasan Hasil". Fokus audit
(row-lock confirm/reject, ownership order, validasi account ref, privasi
bucket bukti, alur reject→resubmit, matematika aktivasi multi-item) semua
**lolos** kecuali 1 High — 0 Critical.

**Sudah diperbaiki (High):**
- `POST /subscriptions/checkout` (`subscriptions.route.ts`) — guard "cegah
  beli modul sama 2x" SEBELUMNYA cuma cek subscription AKTIF, TIDAK
  melihat invoice/order lain yang masih `pending`/`submitted` untuk modul
  yang sama (subscription baru tercipta SETELAH admin confirm, jadi 2
  checkout modul sama sebelum bayar SAMA SEKALI lolos guard lama). Fix:
  seluruh alur checkout dibungkus `db.transaction()` + row lock pada
  baris `user` (serialisasi checkout SAMA user, bukan lintas user), guard
  diperluas cek invoice/order non-terminal juga — test baru
  (`subscriptions.route.test.ts`) reproduksi skenario "2 tab checkout
  modul sama sebelum bayar".

**Sudah diperbaiki (Medium):**
- `buildDynamicQris()` (`qris-emv.ts`) — payload EMV admin TANPA Tag 53
  MAUPUN Tag 54 (malformed/salah salin) sebelumnya lolos TANPA nominal
  ter-inject sama sekali, QR tetap ditandai "dinamis" tapi nominal tidak
  pernah dikunci — customer diam-diam disuruh ketik manual TANPA tahu
  itu (kode unik jadi tidak ikut ke-transfer). Fix: throw eksplisit kalau
  `hasTag54` masih `false` setelah parsing (caller sudah punya try/catch →
  502).
- `company.bankAccounts`/`company.qrisAccounts` disimpan lewat `PUT
  /settings` generik TANPA validasi bentuk — value cacat bisa lolos
  disimpan admin lalu baru meledak (500) saat CUSTOMER coba bayar. Fix:
  validasi runtime eksplisit di `settings.route.ts` (pola sama
  `retentionItem`), termasuk panggil `isValidQrisPayload()` yang
  sebelumnya didefinisikan tapi TIDAK PERNAH dipanggil di mana pun — plus
  defense-in-depth `Array.isArray` check di `orders.route.ts`
  `getPaymentSettings()`.
- `GET /orders/:id` (`orders.route.ts`) — sebelumnya spread SELURUH row
  `orders`/`invoices` ke customer, termasuk `proofUrl` (MinIO object key
  privat) dan `confirmedBy`/`rejectedBy` (user ID admin) — melanggar
  spirit ADR-0022 ("proofUrl HANYA boleh ditukar presigned URL server-
  side admin-only"). Fix: response di-`pick` eksplisit ke field yang
  memang dibutuhkan customer saja.

**Sudah diperbaiki (Low):**
- Frontend `pay/page.tsx` render kosong tanpa pesan kalau admin hapus
  rekening bank yang sedang direferensikan order in-flight (jalur QRIS
  sudah menangani ini via `QRIS_ACCOUNT_NOT_FOUND`, jalur bank transfer
  belum) — ditambah fallback pesan jelas.

**Ditunda ke technical debt (dicatat sesuai SOP):**
- Object MinIO lama TIDAK dihapus saat customer upload ulang bukti
  setelah ditolak (numpuk file "yatim" di bucket privat) — bukan celah
  keamanan (bucket tetap privat), murni storage housekeeping, ditunda
  sampai jadi masalah cost nyata.
- Belum ada job yang mentransisikan order/invoice ke status `"expired"`
  otomatis setelah lewat `dueDate` — kolom & status sudah disiapkan di
  skema, implementasinya sengaja ditunda (di luar scope "verifikasi
  konsep manual payment jalan end-to-end").
- Permission `orders.manage` di data role PRODUCTION perlu dicek manual
  supaya cuma di-assign ke admin/super-admin (pola sama technical debt
  Fase 12/15).

**Catatan tambahan (bug ditemukan pas nulis test, BUKAN temuan
security-auditor):** helper test `seedPaymentSettings()`
(`orders.route.test.ts`) sempat pakai `onConflictDoUpdate({set: {value:
settings.value}})` — self-reference ke kolom LAMA (no-op saat conflict),
BUG YANG SAMA PERSIS pernah ketemu di script manual test Fase 15. Efeknya
di sini: test file lain (`settings.route.test.ts`) yang JUGA menulis key
global `company.bankAccounts`/`company.qrisAccounts` bisa "menang" duluan
tergantung urutan eksekusi, bikin test lain gagal intermiten
(`ACCOUNT_NOT_FOUND` padahal seed harusnya jalan). Fix: set value LITERAL
per-key (2 pemanggilan terpisah, bukan 1 `.values([...])` array).
**Pencegahan:** `onConflictDoUpdate` HARUS selalu set value dari variabel
LOKAL/literal, JANGAN PERNAH `column: table.column` (self-reference) —
pola ini sudah 2x ketemu di sesi berbeda, jadikan checklist review kalau
lihat `onConflictDoUpdate` baru.

---

## 2026-09-04 — Security review Fase 15 (Invoice + PDF): 0 Critical/High/Medium, 3 Low (diterima sebagai technical debt)
**Konteks:** Subagent `security-auditor` review Fase 15 (skema
`invoices`/`invoiceItems`, PDF generator `@react-pdf/renderer`, endpoint
`GET /me/invoices`, `GET /invoices/:id/pdf`, `GET /admin/invoices`).
Ringkasan lengkap → `docs/phases/phase-15-invoice-profesional.md` §
"Ringkasan Hasil". Fokus audit (ownership check PDF endpoint, isolasi
data lintas-user, remote image fetch di PDF, header injection nomor
invoice, konsistensi permission key) semua **lolos** — 0 Critical/High/Medium.

**Sudah diperbaiki (kualitas kode, bukan security, tapi ditemukan pas
review yang sama):**
- Logic agregasi `invoiceItems` per invoice ter-duplikasi identik antara
  `invoices.route.ts` dan `admin/invoices.route.ts` — diekstrak ke
  `apps/api/src/lib/invoice-helpers.ts` (`attachInvoiceItems`), dipakai
  kedua route.

**Diterima sebagai technical debt (Low, TIDAK diperbaiki — alasan
eksplisit di tiap poin):**
- **Timing side-channel** di `GET /invoices/:id/pdf`
  (`invoices.route.ts`): query `userHasPermission()` (3-table JOIN) cuma
  jalan di cabang `invoice.userId !== user.id`, bikin response time beda
  terukur antara "invoice tidak ada" vs "invoice ada tapi bukan milik &
  bukan admin" — keduanya sama-sama 404, tapi timing beda bisa jadi oracle
  keberadaan invoice ID. **Diterima**: `params.id` WAJIB `format:"uuid"`
  (128-bit entropy) — brute-force ID praktis mustahil terlepas dari
  oracle timing ini, fix (selalu jalankan query permission tanpa
  short-circuit) menambah 1 query per request tanpa manfaat praktis nyata.
- **Field `company.taxId`/`phone`/`email`/`bankAccount` tanpa `maxLength`**
  di skema key-value `settings` (`value: t.Unknown()`, pola lama sejak
  Fase 00) — value sangat panjang bisa overflow layout footer PDF.
  **Diterima**: endpoint sudah admin-only (`permission: "settings.update"`),
  cuma memperluas blast-radius trade-off desain yang sudah diterima
  sebelumnya (skema key-value fleksibel), bukan celah baru untuk user
  biasa.
- **`<a href target="_blank">` unduh PDF invoice** (`billing/page.tsx`) —
  di production, link ini navigasi top-level LINTAS SUBDOMAIN
  (`app.<domain>` → `api.<domain>`). **Belum diverifikasi manual di
  production** apakah cookie sesi Better Auth (`sameSite:"lax"` +
  `crossSubDomainCookies`, § `lib/auth.ts`) benar-benar terkirim di
  navigasi ini — SECARA TEORI harus jalan (`SameSite=Lax` mengizinkan
  cookie di navigasi top-level GET lintas-subdomain SELAMA subdomain
  masih 1 "site"/eTLD+1 yang sama, yang mana `crossSubDomainCookies` di
  production memang men-scope cookie ke domain induk bersama) — TAPI
  ini murni penalaran dari kode, BUKAN pengamatan langsung. **Cek manual
  di staging/production sebelum menganggap tombol "Unduh PDF" pasti
  jalan** — kalau ternyata gagal (401), ini bug FUNGSIONAL bukan
  security, root cause paling mungkin `SameSite` provider/browser lebih
  ketat dari yang diasumsikan.

---

## 2026-09-04 — `t.Union(array.map(t.Literal))` merusak inferensi tipe Eden Treaty (jadi `File | File[]`)
**Masalah:** `admin/plans.route.ts` (Fase 14) build union modul dari
`SUB_MODULE_KEYS.map((k) => t.Literal(k))` (`SUB_MODULE_KEYS` array
`as const` 5 elemen). Schema TypeBox-nya SENDIRI valid (`typeof
planBody.static` di apps/api resolve benar ke union literal) — tapi
`bun run typecheck` di **apps/web** gagal dengan error yang sangat
menyesatkan: field `modules` diklaim bertipe `File | File[]`, bukan union
string literal. Awalnya dikira bug tidak berhubungan (device upload?),
butuh isolasi manual (`Parameters<typeof api.admin.plans.post>[0]`) untuk
ketemu bahwa masalahnya justru di route API, bukan di halaman React yang
error-nya muncul.

**Root cause:** `Array.prototype.map()` SELALU balikin tipe `U[]` (array
biasa), BUKAN tuple — walau sumbernya array `as const`. `t.Union<T extends
TSchema[]>` TypeBox butuh T berupa TUPLE literal supaya bisa resolve tipe
tiap elemen individual; diberi array generik (bukan tuple), sesuatu di
pipeline type-generation Eden Treaty (`UnwrapRoute`/`MergeSchema`) salah
resolve ke fallback yang kebetulan sama seperti representasi internal File
upload — kemunculan `File` di error TIDAK ada hubungan literal dengan
upload sama sekali, murni fallback tipe yang salah.

**Fix:** Tulis union sebagai TUPLE literal eksplisit — daftar
`t.Literal(...)` satu-satu di dalam `t.Union([...])`, JANGAN
di-generate dari `.map()` atas array manapun (termasuk yang `as const`).

**Pencegahan:** Kalau butuh union literal dari daftar string yang sudah
ada sebagai array/const di proyek ini, JANGAN pakai
`arr.map(t.Literal)` untuk isi `t.Union()` — tulis literal manual. Kalau
`bun run typecheck` di **apps/web** gagal dengan tipe body Eden Treaty
yang aneh (terutama nyebut `File`) padahal route API-nya kelihatan benar,
curigai pola `.map()` di schema TypeBox route yang bersangkutan duluan,
sebelum curiga ke kode React.

---

## 2026-09-04 — Security review Fase 14 (Fondasi Langganan): 1 Medium + 4 Low, semua diperbaiki langsung
**Konteks:** Subagent `security-auditor` review Fase 14 (restrukturisasi
gating per sub-modul + koneksi Accurate reusable lintas subscription, 25
file dibaca). Ringkasan lengkap → `docs/phases/phase-14-fondasi-langganan.md`
§ "Ringkasan Hasil". Fokus audit (ownership `/accurate/reuse`, isolasi
data lintas-user, TOCTOU `moduleAccess`, token handling, validasi
`plans.route.ts`) semua **lolos** — 0 Critical/High.

**Sudah diperbaiki (Medium):**
- `POST /accurate/databases/select` (`accurate.route.ts`) bisa dipanggil
  ulang untuk connection yang `accurateDbId`-nya SUDAH terisi, diam-diam
  mengganti Data Usaha — karena Fase 14 bikin 1 connection bisa dipakai
  BARENG beberapa subscription, ini ikut memindahkan tujuan import
  subscription LAIN yang share koneksi itu tanpa user sadar. Fix: tolak
  400 `DATABASE_ALREADY_SELECTED` kalau `accurateDbId` sudah ada — ganti
  Data Usaha WAJIB lewat koneksi baru (connect ulang), bukan endpoint ini.

**Sudah diperbaiki (Low):**
- `getOwnedConnection()` tidak filter `status:"active"` — connection
  `expired`/`revoked` tetap bisa di-`reuse`/dipilih Data Usaha-nya (assign
  sukses di DB, baru gagal belakangan pas worker pakai token invalid).
  Fix: tambah filter status di query.
- `getActiveSubscriptionsWithPlans()` tidak `ORDER BY` — kalau user
  (secara tidak seharusnya, tidak dijaga unique constraint) punya 2
  subscription aktif utk modul yang sama, `.find()` di `moduleAccess`
  macro bisa pilih baris yang tidak deterministik antar request. Fix:
  `orderBy(desc(subscriptions.createdAt))`, konsisten ambil yang terbaru.
- `alias` di `POST /accurate/databases/select` tanpa `maxLength` (kolom DB
  varchar(255)) — alias kepanjangan bikin Postgres error mentah, ketangkep
  jadi 502 `ACCURATE_REQUEST_FAILED` yang menyesatkan (nyalahin Accurate
  API padahal masalah validasi lokal). Fix: `t.String({maxLength:255})`.
- Komentar stale di `sales-invoice-import.route.ts` masih nyebut
  `moduleAccess: "penjualan"` (taksonomi lama sebelum Fase 14) padahal
  kode sudah benar pakai `"sales_invoice"` — diupdate.

**Ditunda ke technical debt (dicatat sesuai SOP, § Known Limitations
phase-14 doc):**
- Race condition sangat sempit di `POST /accurate/connect` (2 request
  paralel subscriptionId sama) bisa nyisain 1 `accurate_connections` row
  "yatim" — bukan celah keamanan, butuh unique constraint/row lock kalau
  data trafik production nanti nunjukkin ini nyata terjadi.
- Invariant "1 modul aktif = 1 subscription" belum dijaga unique
  constraint DB — gate sudah konsisten (fix di atas), tapi endpoint
  checkout Fase 16-17 WAJIB cegah user beli modul yang sama 2x dari awal.

**Catatan tambahan (data-integrity, ditemukan saat verifikasi migrasi,
BUKAN temuan security-auditor):** backfill `drizzle/0009_*.sql` (Fase 14)
cuma menyasar `plans.modules` array SATU elemen persis
(`["pembelian"]`/`["penjualan"]`) — 1 plan test lama (inactive, 0
subscription referensi, dari era Fase 00/10) dengan `modules:
["pembelian","penjualan"]` (2 elemen gabungan) lolos, ketahuan pas
verifikasi manual pasca-migration (bukan diasumsikan beres). Dihapus
manual setelah dikonfirmasi 0 subscription referensi. **Pencegahan:**
kalau bikin backfill migration untuk field array/jsonb, WAJIB cek juga
kombinasi/variasi nilai historis yang mungkin ada (bukan cuma bentuk
"bersih" 1 elemen) — query verifikasi count SETELAH migration diterapkan,
jangan cuma percaya migration "kelihatan benar" dari SQL-nya saja.

---

## 2026-09-04 — Security review Fase 13 (Sales Invoice): 1 Medium diperbaiki — query "Batal Import" belum di-scope per module
**Konteks:** Subagent `security-auditor` review Fase 13 (Sales Invoice,
mirror 1:1 Purchase Invoice). Ringkasan lengkap →
`docs/phases/phase-13-sales-invoice.md` § "Ringkasan Hasil".

**Sudah diperbaiki (Medium):**
- Query `allRowsForInvoice` di job `CANCEL_IMPORT` (`workers/index.ts`,
  Fase 09/ADR-0013) cek "apakah faktur Accurate ini 100% milik batch yang
  mau di-cancel" HANYA filter by `subscriptionId` + `accurateTransactionId`
  + `status`, TANPA filter `module`. Begitu ada 2 modul (`purchase_invoice`
  dan `sales_invoice`, sejak Fase 13) yang sama-sama isi
  `accurateTransactionId` dengan ID internal Accurate, dan Accurate kasih
  ID per-jenis-transaksi secara TERPISAH (PI dan SI masing-masing punya
  ruang ID sendiri), teorinya bisa collision (PI #42 dan SI #42 sama-sama
  ada). Query ini akan salah anggap keduanya "faktur yang sama". Dampak
  SELALU ke arah aman (over-blocking — batch yang seharusnya boleh
  di-cancel malah diblokir), BUKAN ke arah hapus faktur yang salah — tapi
  tetap bug fungsional nyata. Kode SEJENIS untuk retry cerdas
  (`findExistingAccurateInvoiceId`/`findExistingAccurateSalesInvoiceId`)
  SUDAH benar di-scope per module dari awal — celah ini murni ketinggalan
  di 1 tempat saat mirroring. Fix: tambah `eq(importBatches.module,
  batch.module)` ke query itu.

**Pencegahan:** kalau nanti modul transaksi baru lagi (Purchase Payment,
Sales/Customer Receipt, Jurnal Umum) juga isi `accurateTransactionId` di
`import_batch_rows`, PASTIKAN semua query yang JOIN `importBatchRows` ↔
`importBatches` dan match by `accurateTransactionId` LINTAS-BATCH ikut
di-filter `module` juga — bukan cuma yang baru ditulis Fase itu, tapi
JUGA cek ulang kode LAMA yang mungkin implisit mengasumsikan "cuma ada 1
modul yang pernah pakai kolom ini" (assumption yang jadi tidak valid lagi
begitu modul kedua ditambahkan).

---

## 2026-09-04 — Deploy production nyata Fase 12: dokumen arsitektur asumsi Caddy TIDAK cocok realita (nginx shared VPS)
**Masalah:** Saat pandu user deploy manual fitur logo/favicon (butuh
subdomain baru `media.ane.web.id` + akses publik ke MinIO), instruksi awal
saya (tambah host ke `Caddyfile`, restart Caddy) SALAH TOTAL untuk server
nyata — user bingung "kok DNS setup lagi, kan tinggal update mesin aja".

**Root cause:** `docs/architecture/architecture-deployment.md` &
`Caddyfile` mendeskripsikan skenario "VPS dedicated, Caddy sebagai
reverse proxy tunggal" — TAPI server production nyata (`wasugi@76.13.18.136`,
`ane.web.id`) ternyata:
1. **SHARED** — banyak project lain jalan di VPS yang sama (`jalamandala-*`,
   `tokoambu`, `storage-forbis`, situs `webane.com`), bukan didedikasikan
   buat facport saja.
2. **Reverse proxy sesungguhnya nginx yang sudah ada duluan di server**,
   BUKAN Caddy — service `caddy` di `docker-compose.prod.yml` TIDAK
   PERNAH dipakai nyata (network `edge` yang dia butuhkan sengaja tidak
   pernah dibuat di server ini).
3. Port host untuk tiap service HARUS dicek dulu lintas SEMUA project di
   VPS — port `9000` (default MinIO) ternyata SUDAH dipakai container
   minio project lain, ketemu pas coba expose MinIO facport ke nginx.

Dokumen ini sendiri (di bagian lain, § "Deploy Manual ke Server") SEBENARNYA
sudah mencatat fakta nginx-vs-Caddy ini (dari insiden 2026-08-31) — tapi
karena saya baca bagian AWAL dokumen dulu (yang masih narasi Caddy) tanpa
scroll ke bagian bawah yang punya fakta real, saya kasih instruksi salah
ke user.

**Fix:** Dokumen baru `docs/deployment-new-domain-onboarding.md` — runbook
LENGKAP untuk onboarding domain baru ke VPS shared ini, ditulis dari
langkah yang BENERAN dieksekusi & diverifikasi end-to-end (DNS → port
mapping MinIO → nginx per-subdomain → certbot → deploy image → verifikasi).
`docs/deployment-server-setup.md` & `docs/architecture/architecture-deployment.md`
ditambah warning eksplisit di bagian ATAS (bukan cuma di tengah/bawah)
supaya tidak terulang salah baca urutan.

**Insiden turunan saat eksekusi (dicatat juga di runbook baru)**:
copy-paste multi-line YAML (`docker-compose.override.yml`) dari chat ke
terminal SSH user berulang kali rusak indentasinya (2 spasi ekstra ke-inject
entah dari mana), dan 2 heredoc dengan delimiter sama yang di-paste
berdekatan sempat tercampur jadi 1 file corrupt. **Fix**: tulis config
sebagai flow-style YAML SATU BARIS (`services: {web: {...}}`) dan nginx
config SATU BARIS juga (`server { ... }`) — nginx/YAML flow-style sama-sama
tidak sensitif newline, jadi aman dari masalah reformat paste apa pun.

**Pencegahan:**
1. Kalau baca dokumen arsitektur/deployment yang panjang, SELALU cek
   apakah ada bagian "status real"/"catatan" di tengah/akhir dokumen yang
   mengoreksi bagian awal — jangan asumsikan bagian pertama yang dibaca
   sudah cukup, terutama untuk dokumen yang ditulis bertahap lintas fase.
2. Untuk instruksi copy-paste ke terminal SSH user (bukan dieksekusi
   sendiri oleh Claude Code), SELALU pakai format satu-baris kalau
   sintaksnya memungkinkan (YAML flow-style, nginx tanpa newline) —
   JANGAN andalkan heredoc/multi-line paste tetap utuh, banyak
   kombinasi client-terminal yang mengubah whitespace saat paste.

---

## 2026-09-04 — Push pertama ke `develop`: 2 bug lagi di `deploy-staging.yml` (lanjutan entri `ci.yml` di bawah)
**Konteks:** Setelah 3 bug `ci.yml` (entri di bawah) diperbaiki dan PR #23
merge ke `develop`, `deploy-staging.yml` (trigger `push: develop` — SAMA
SEKALI belum pernah jalan sebelumnya karena branch `develop` baru ada)
gagal lagi 2x dengan penyebab berbeda:
1. **Job `build-and-push` gagal di step `Test (gate)`** — sama persis
   kelas masalah dengan `ci.yml`: job ini jalankan `bun run typecheck` +
   `bun run test` TANPA `services.postgres` maupun `env:` block sama
   sekali (beda dari `ci.yml`/`release.yml` yang sudah benar). Fix: copy
   block `services`+`env`+step migrate/seed dari `ci.yml` apa adanya.
2. **Job `build-and-push` gagal push image ke GHCR** — `denied:
   installation not allowed to Write organization package`.
   `deploy-staging.yml` TIDAK punya `permissions:` block sama sekali
   (GITHUB_TOKEN default read-only untuk packages di org ini), beda dari
   `deploy.yml` yang sudah punya `permissions: { contents: read, packages:
   write }`. Fix: tambah block yang sama.

Setelah kedua fix di atas, `build-and-push` **sukses** (image
`api:staging`/`web:staging` nyata ada di GHCR). Job `deploy-to-server`
TETAP gagal `error: missing server host` — ini **EXPECTED**, bukan bug
baru (secret `SERVER_HOST`/`SERVER_USER`/`SERVER_SSH_KEY` memang belum
diisi, konsisten dengan status `deploy.yml` yang sudah didokumentasikan
di `architecture-deployment.md`).

**Root cause sama dengan entri `ci.yml` di bawah**: `develop` branch tidak
pernah ada sebelum sesi ini, jadi trigger `push: develop` untuk
`deploy-staging.yml` juga baru pertama kali benar-benar dieksekusi.
`deploy-staging.yml` ternyata di-copy dari pola `ci.yml`/`deploy.yml` TAPI
tidak lengkap menyalin bagian env/permissions-nya.

**Pencegahan**: sama seperti pencegahan di entri `ci.yml` — kalau ada
field wajib baru di `env.ts`, update SEMUA tempat yang jalankan
`bun run test`/`typecheck` (`ci.yml`, `release.yml`, `deploy-staging.yml`).
Pertimbangkan ekstrak env block ini jadi 1 file YAML anchor/reusable
workflow supaya tidak perlu disalin manual ke 3 tempat lagi ke depannya.

---

## 2026-09-04 — PR pertama repo ini: 3 bug `ci.yml` yang sudah lama laten, tidak pernah ketahuan karena selalu commit langsung ke `main`
**Masalah:** Saat buka PR #23 (branch `feat/admin-expiry-and-branding` →
`develop`, branch `develop` itu sendiri BARU dibuat di PR ini — sebelumnya
tidak ada branch `develop` sama sekali di repo), `ci.yml` gagal 3 kali
berturut-turut dengan penyebab BERBEDA tiap kali:
1. **Lint gagal** — `react-hooks/set-state-in-effect`/`react-hooks/immutability`
   (rule dari `eslint-plugin-react-hooks` v7, sudah lama ke-lock di
   `bun.lock`) menolak pola fetch-on-mount standar (`load()` dipanggil
   langsung di body `useEffect`) di 5 file LAMA yang sudah ada sebelum PR
   ini — diverifikasi dengan `bun run lint` langsung di `origin/main`
   (branch belum disentuh), errornya SAMA PERSIS.
2. **Job `db:seed` gagal** — env var baru `MINIO_PUBLIC_URL` (ditambah ke
   `apps/api/src/lib/env.ts` di Fase 12) lupa ditambahkan ke blok `env:`
   di `ci.yml`/`release.yml`, jadi `env.ts` reject saat boot job seed.
3. **Gitleaks gagal** — `actions/checkout@v4` di `ci.yml` TANPA
   `fetch-depth: 0` (default shallow, depth 1), bikin
   `gitleaks/gitleaks-action@v2` gagal `fatal: ambiguous argument
   'base^..head': unknown revision` saat coba diff base..head commit PR.
   `release.yml` SUDAH benar (`fetch-depth: 0` sudah ada), `ci.yml` belum
   — kemungkinan besar karena trigger `pull_request` di `ci.yml` memang
   belum pernah benar-benar dieksekusi sebelumnya.

**Root cause tunggal di balik ketiganya**: repo ini praktiknya SELALU
commit langsung ke `main` sejak awal (riwayat commit tidak pernah lewat
PR) — jadi trigger `on: pull_request` di `ci.yml` secara harfiah baru
pertama kali jalan sungguhan di PR #23 ini. Bug #1 sudah laten dari
dependency bump manapun yang terakhir mengunci `eslint-plugin-react-hooks`
v7 ke `bun.lock`; bug #2 & #3 murni gap konfigurasi `ci.yml` yang tidak
pernah "kena test" sampai sekarang.

**Fix**: (1) tandai eksplisit tiap `load()`-di-effect sebagai fetch data
awal yang disengaja (`eslint-disable-next-line` + komentar alasan, BUKAN
refactor pola-nya — di luar scope Fase 11/12), plus reorder
`loadDatabases()` di `accurate/page.tsx` yang dipanggil sebelum
dideklarasikan; (2) tambah `MINIO_PUBLIC_URL` ke `env:` `ci.yml` &
`release.yml`; (3) tambah `fetch-depth: 0` ke step checkout `ci.yml`.

**Pencegahan**: kalau nanti nambah env var WAJIB baru di `apps/api/src/lib/env.ts`,
WAJIB ikut update `env:` block di `ci.yml` DAN `release.yml` di commit
yang sama — checklist ini belum ada enforcement otomatis (technical debt:
pertimbangkan test yang assert semua key `envSchema` ada di kedua workflow
file). Juga: sekarang `develop` branch sudah ada dan dipakai — pastikan
alur PR→develop dipakai konsisten ke depannya (bukan balik commit langsung
ke `main`), supaya `ci.yml` terus "kena tes" dan gap serupa ketahuan lebih
awal, bukan menumpuk lagi.

---

## 2026-09-04 — Security review Fase 12 (Logo/Favicon Branding): 1 Medium diperbaiki, 1 Low dicatat sebagai technical debt
**Konteks:** Subagent `security-auditor` review fitur upload logo/favicon
company (bucket public MinIO baru, § ADR-0017). Ringkasan lengkap →
`docs/phases/phase-12-logo-favicon-branding.md` § "Ringkasan Hasil".

**Sudah diperbaiki (Medium):**
- `PUT /settings` generik (`value: t.Unknown()` untuk key apa pun) bisa
  dipakai buat menimpa `company.logo`/`company.favicon` dengan value bebas
  (bukan URL, bentuk object salah, dst), bypass pipeline upload+re-encode
  sharp di `branding.route.ts` — padahal `GET /settings/public` (tanpa
  auth) meng-echo value itu apa adanya ke `<img src>`/favicon metadata di
  SEMUA surface. Fix: `PUT /settings` sekarang blokir eksplisit 2 key ini
  (`BRANDING_ONLY_KEYS` di `settings.route.ts`), return 400
  `USE_BRANDING_UPLOAD_ENDPOINT` — satu-satunya jalur tulis tetap lewat
  endpoint upload yang sudah benar.

**Ditunda ke technical debt (Low):**
- Tidak bisa diverifikasi dari kode saja apakah permission
  `settings.update` di data PRODUCTION cuma di-assign ke role
  admin/super-admin (RBAC project ini dinamis, custom role bisa dibuat
  admin). Kalau di-assign terlalu longgar ke role staf level bawah,
  dampak dari kelas masalah di atas (siapa pun yang bisa ubah aset
  branding publik) jadi lebih luas. **Aksi:** cek manual data role/permission
  production, bukan perbaikan kode.

---

## 2026-09-02 — Retry Cerdas (Fase 08) cuma cocokkan "Bill No", bukan "Trans No" — typo 1 karakter bikin CREATE nabrak faktur existing
**Masalah:** User laporan (production) error Accurate `"Sudah ada data
lain dengan No Form # Faktur Pembelian \"PI01001050\""` muncul lagi di
batch baru, padahal Fase 08 (ADR-0012, "Retry Cerdas") sudah seharusnya
menangani kasus faktur duplikat dengan append, bukan create ulang.

**Investigasi** (query read-only langsung ke Postgres production via SSH,
dengan izin user — akses SSH+DB production kena block otomatis oleh
permission classifier Auto Mode saat dicoba tanpa sepengetahuan user
eksplisit di percakapan, jadi query dijalankan USER sendiri lewat command
yang disiapkan): batch gagal (`3299a0cd-...`) dibandingkan `raw_data`-nya
row-per-row dengan 2 batch sukses sebelumnya (`4d906f3a-...`,
`5b284ab6-...`, sama-sama `accurate_transaction_id: 800`):
- Kolom **"Bill No"** (`billNumber`) di batch baru: `"PI010010501"` — ada
  1 digit "1" nyempil di belakang, BEDA dari `"PI01001050"` yang dipakai
  2 batch sukses sebelumnya.
- Kolom **"Trans No"** (`number` — field NOMOR FORM Accurate sendiri,
  BEDA dari Bill No yang cuma referensi vendor) di batch baru: TETAP
  `"PI01001050"`, sama persis dengan faktur #800 yang sudah ada.

**Root cause:** `findExistingAccurateInvoiceId` (`workers/index.ts:124-146`,
Fase 08) cuma mencocokkan lintas-batch berdasarkan **Bill No** (case-
insensitive + trim). Karena Bill No batch baru sudah beda (typo), fungsi
ini TIDAK menemukan faktur existing → worker jatuh ke jalur CREATE biasa.
CREATE ini mengirim field `number` (Trans No) `"PI01001050"` ke Accurate
— yang SUDAH dipakai faktur #800 — dan Accurate menolaknya sebagai
duplikat No Form. Ini BUKAN bug regresi Fase 08 (mekanismenya bekerja
persis seperti didesain — dikonfirmasi 2 batch sebelumnya berhasil
append lewat jalur yang sama), tapi juga bukan sekadar "user salah ketik
biasa": kombinasi 2 field independen (Bill No dipakai untuk deteksi
duplikat, Trans No dipakai untuk nomor form aktual) bikin 1 typo di SATU
kolom menghasilkan pesan error yang MENYEBUTKAN kolom LAIN (Trans No),
sehingga user tidak langsung tahu kolom mana yang harus dicek.

**Fix diterapkan:** BUKAN mengubah logic worker (matching Bill No tetap
by design — itu identitas dokumen vendor, `number`/Trans No memang
dimaksud auto-generate/opsional per ADR-0011). Sebagai gantinya,
dialog Edit Baris (`edit-row-dialog.tsx`) diperjelas: kolom wajib
ditandai `*` + highlight merah per-kolom kalau kosong, auto-scroll ke
notifikasi error saat simpan gagal — supaya user setidaknya bisa
melihat & membandingkan nilai Bill No/Trans No dengan lebih jelas saat
memperbaiki baris gagal. Data batch ini sendiri diperbaiki manual oleh
user via dialog Edit (bukan lewat query DB).

**Pencegahan / ide lanjutan (belum dieksekusi, dicatat sebagai
technical debt)**: kalau kasus ini terulang, pertimbangkan salah satu —
(a) validasi tambahan pre-flight: sebelum CREATE, cek apakah `number`
(Trans No) yang akan dikirim SUDAH dipakai transaksi lain (butuh 1 query
`list.do` Accurate tambahan per grup, biaya rate-limit vs UX), atau (b)
kalau `number` diisi user (bukan dikosongkan utk auto-number) DAN Bill No
tidak match apa pun di riwayat lokal, tampilkan warning non-blocking di
UI konfirmasi mapping "N baris mengisi Trans No manual — pastikan belum
pernah dipakai". TIDAK dipilih sekarang karena user cuma minta perbaikan
observability/UX form edit, bukan minta fix mekanisme deteksi duplikat.

---

## 2026-09-01 — Tombol "Retry baris gagal" hilang begitu SEMUA baris gagal sudah diedit (status jadi "pending", bukan "failed")
**Masalah:** User laporan (production): edit baris gagal via dialog Edit
Baris (fitur 2026-08-28) tersimpan sukses (toast muncul, status baris di
tabel berubah jadi "Menunggu"), TAPI tombol **"Retry baris gagal"** di
kartu Ringkasan tiba-tiba hilang — user jadi tidak tahu cara lanjut
mengirim baris yang sudah diperbaiki itu ke Accurate.

**Root cause:** `[batchId]/page.tsx` menampilkan tombol Retry HANYA
berdasarkan `summary.failed > 0` (`page.tsx:155`, sebelum fix). Endpoint
`PUT .../rows/:rowId` (edit baris) SENGAJA me-reset status baris yang
diedit dari `failed` → `pending` (bukan balik ke `failed`) — supaya
worker/retry memprosesnya sebagai baris baru, bukan baris yang masih
"error". Begitu baris terakhir yang `failed` diedit, `summary.failed`
turun ke 0 → kondisi tombol jadi `false` → tombol hilang, padahal ada
baris `pending` yang worker (`workers/index.ts:402-407`, query row
`pending` ATAU `failed`) sebenarnya siap proses kalau saja job-nya
di-trigger. Icon Edit (pensil) juga ikut hilang di baris itu (syaratnya
`row.status === "failed"`), jadi user benar-benar tidak punya aksi apa
pun di UI untuk baris yang nyangkut di status "Menunggu" ini.

**Fix:** kondisi tombol diubah jadi
`(summary.failed > 0 || summary.pending > 0) && !isProcessing && batch.columnMapping`
(`page.tsx:155`). Guard `batch.columnMapping` WAJIB ditambahkan —
tanpanya, tombol bisa salah muncul kalau user navigasi langsung ke URL
batch yang statusnya masih `mapping_pending` (baru upload, belum
konfirmasi mapping kolom, SEMUA baris default `pending` bukan karena
diedit) — klik Retry di kondisi itu akan mengirim job dengan
`columnMapping: null` ke worker (regresi baru, endpoint `/retry` sendiri
tidak validasi ini). Dikonfirmasi lewat riset: user TIDAK bisa sampai ke
halaman ini dengan mapping kosong lewat alur tombol normal (redirect
cuma terjadi SETELAH `/confirm` sukses), tapi navigasi manual/back-button
ke `batchId` yang baru diupload tetap kemungkinan nyata.

**Pencegahan:** kalau nambah kondisi tampil/sembunyi tombol yang
tergantung status agregat (`summary.*`), CEK SEMUA state transition yang
bisa mengubah status row/batch — termasuk transition yang "tidak
lazim" (bukan cuma create→success/failed, tapi juga edit→pending, retry
manual, dst). Kondisi yang cuma benar untuk 1 alur normal (misal "abis
diproses sekali") gampang salah untuk state MENENGAH (baris pernah gagal,
diperbaiki, belum di-retry ulang) yang secara desain memang valid tapi
jarang dites manual. Deploy: `v1.10.5`.

---

## 2026-08-31 — Eden Treaty `parseDate` DEFAULT-nya `true`: field tanggal di dialog Edit baris rusak lagi walau fix 2026-08-28 sudah live
**Masalah:** User laporan (production): dialog "Edit Baris Gagal" (Purchase
Invoice import) — setelah edit lalu klik "Simpan Perubahan", perubahan
TIDAK benar-benar tersimpan/berfungsi. Direproduksi lokal (Postgres dev,
data batch `processing` dengan row `failed` peninggalan E2E test): field
"Tanggal" tampil sebagai `Wed Aug 19 2026 07:00:00 GMT+0700 (Western
Indonesia Time)` — BUKAN format DD/MM/YYYY yang seharusnya dihasilkan
`toDisplayDate()` (fix commit `75cbff2`, 2026-08-28). Klik Simpan tetap
`200 OK` (PUT sukses, row pindah status `pending`) — tapi nilai rusak itu
ikut ke-save balik ke `rawData`, jadi retry ke Accurate gagal lagi dengan
error tanggal, membuat "edit tidak tersimpan" walau secara teknis endpoint
berhasil.

**Root cause:** `apps/web/lib/api-client.ts` bikin client Eden Treaty
TANPA opsi `parseDate` — default library-nya (`@elysia/eden` treaty2)
adalah `parseDate: true` untuk SEMUA response JSON, bukan cuma field yang
route-nya declare `t.Date()`. Treaty pasang `JSON.parse` REVIVER yang cek
regex broad terhadap SETIAP nilai string di response (ISO 8601 DAN format
umum `DD/MM/YYYY` ikut match) — kalau cocok, otomatis diubah jadi objek
`Date` SEBELUM kode aplikasi sempat baca. `rawData` (hasil parse Excel,
sudah dinormalisasi dialog Edit ke `DD/MM/YYYY` di sisi tampil) berisi
persis nilai yang match regex ini. `edit-row-dialog.tsx` `toDisplayDate()`
cuma cek `typeof value === "number"`/`"string"` — Date object lolos kedua
cek itu, jatuh ke `String(dateObj)` yang menghasilkan format
`Date.toString()` JS, bukan string yang dikenali `toAccurateDate()` di
worker. Fix 2026-08-28 menormalisasi nilai SAAT dialog dibuka, tapi tidak
menyadari nilai itu sudah "dirusak" Eden SEBELUM sempat sampai ke fungsi
normalisasi — beda sumber corruption dari yang diperbaiki sebelumnya
(dulu: `String()` polos di kode sendiri; sekarang: konversi implisit di
HTTP client layer, di LUAR kontrol langsung kode fitur ini).

**Fix:** `treaty<App>(baseURL, { fetch: {...}, parseDate: false })` —
nonaktifkan GLOBAL. Diverifikasi aman: satu-satunya tempat lain yang baca
field tanggal dari response (`createdAt`/`completedAt` dst di beberapa
halaman listing) sudah lewat `formatDate(value: string | Date)`
(`lib/utils.ts`) yang eksplisit `new Date(value)` — jalan sama baik dikirim
`string` maupun `Date`. Tidak ada kode lain yang assume nilai tanggal dari
API SUDAH berupa objek `Date` (`.getTime()`/`instanceof Date`/dst — dicek
lewat grep, nihil).

**Pencegahan:** Kalau pakai library client yang punya "smart"
serialization/deserialization implisit (auto-parse Date, auto-parse
angka, dst berdasarkan REGEX terhadap NILAI, bukan skema eksplisit per-
field), WAJIB baca opsi konfigurasinya dan pertimbangkan matikan kalau
project menyimpan data mentah (rawData/JSON bebas bentuk) yang KEBETULAN
bisa match pola itu — regex "kelihatan seperti tanggal" gampang overlap
dengan data domain lain (di sini: field tanggal hasil normalisasi kita
sendiri). Kalau menutup bug "silent corruption" versi sebelumnya (fix
tampilan/normalisasi di satu titik), verifikasi ulang path data
LENGKAP dari response mentah sampai ke titik pakai — jangan asumsikan
`typeof` value di kode aplikasi sama dengan tipe JSON asli di wire,
kalau ada HTTP client library di antaranya yang bisa transform diam-diam.

---

## 2026-08-28 — Dialog Edit baris: tanggal (serial Excel) ke-`String()` mentah, silent-corrupt kalau tersimpan ulang
**Masalah:** User laporan tampilan tanggal di dialog Edit (fitur "Edit
Baris Gagal", § PROGRESS.md) "bentuknya aneh" — field "Tanggal"
menampilkan angka mentah (mis. `46261`) alih-alih tanggal terbaca.

**Root cause:** `rawData` per baris disimpan APA ADANYA dari hasil parse
Excel (`lib/excel.ts`, apps/api) — kolom tanggal biasanya berupa ANGKA
SERIAL Excel mentah (`XLSX.utils.sheet_to_json` tanpa `cellDates:true`),
BUKAN string tanggal. Normalisasi ke format Accurate (DD/MM/YYYY) cuma
terjadi SEKALI, di worker (`toAccurateDate()`,
`purchase-invoice.mapping.ts`), pas payload dikirim ke Accurate — TIDAK
PERNAH terjadi di titik lain. Dialog Edit (`edit-row-dialog.tsx`) yang
baru dibuat cuma `String(rawData[col])` polos ke semua kolom tanpa
pengecualian.

**Dampak LEBIH SERIUS dari sekadar tampilan**: kalau user save row TANPA
sentuh field tanggal sama sekali, angka serial (number, mis. `46261`)
ikut ke-`String()`-kan jadi TEKS (`"46261"`) saat disimpan balik ke
`rawData`. `toAccurateDate()` di worker cuma mengenali serial Excel kalau
`typeof value === "number"` — begitu sudah jadi string `"46261"`, TIDAK
match regex DD/MM/YYYY maupun ISO, jatuh ke `return value` apa adanya —
Accurate menerima literal teks "46261" sebagai tanggal dan pasti
menolaknya. Tanggal rusak DIAM-DIAM, bukan cuma soal tampilan kosmetik.

**Fix:** `edit-row-dialog.tsx` sekarang deteksi kolom mana yang termasuk
field tanggal (`transDate`/`taxDate`/`shipDate`, via `columnMapping`),
normalisasi ke DD/MM/YYYY SAAT dialog dibuka (replika PERSIS algoritma
`toAccurateDate` backend — serial→date, ISO→DD/MM/YYYY, DD/MM/YYYY tetap
apa adanya), dan SELALU simpan balik sebagai string DD/MM/YYYY —
terlepas user sentuh field itu atau tidak.

**Pencegahan:** Kalau ada logic NORMALISASI/PARSING nilai (bukan cuma
tampil apa adanya) di SATU sisi (backend), dan sisi LAIN (frontend, atau
titik masuk data manapun) ikut MEMBACA/MENULIS ULANG nilai mentah yang
sama, WAJIB replikasi normalisasi yang SAMA di kedua sisi — jangan
asumsikan nilai "cuma ditampilkan ulang" tanpa transformasi aman
dilakukan begitu saja, terutama untuk tipe data yang punya BANYAK bentuk
representasi berbeda (tanggal: serial number/ISO string/DD-MM-YYYY
string/Date object) tapi cuma SATU bentuk yang valid buat sistem hilir
(Accurate).

---

## 2026-08-28 — Next.js RSC: referensi komponen icon di prop Server→Client Component bikin 500 total
**Masalah:** Refactor `AppShell`/`Sidebar`/`Topbar` (Fase 10, supaya bisa
dipakai ulang surface admin+customer) bikin dashboard app.ane.web.id DAN
admin.ane.web.id 500 total setelah deploy. Browser: `Uncaught Error:
Minified React error #441`. Log server: `Error: Functions cannot be
passed directly to Client Components unless you explicitly expose it by
marking it with "use server"` — payload error menunjukkan bentuk objek
`{$$typeof, render, displayName}`, persis struktur internal komponen
`lucide-react` (dibangun via `React.forwardRef`).

**Root cause:** `navItems` (array berisi `{href, label, icon:
LucideIcon}`) sebelumnya didefinisikan LANGSUNG di file "use client"
(`sidebar.tsx`), aman. Refactor memindahkan definisinya ke Server
Component (`layout.tsx`) supaya bisa beda per surface, lalu dioper
sebagai PROP ke `<AppShell navItems={...}>` (Client Component). Next.js
App Router (React Server Components) TIDAK mengizinkan referensi
fungsi/komponen (termasuk komponen icon) dilewatkan sebagai DATA PROP
dari Server ke Client Component — cuma boleh sebagai `children`/JSX yang
SUDAH di-render di sisi server. Ini KELAS BUG BERBEDA dari temuan
sebelumnya hari ini (export non-komponen dari file "use client" diimpor
Server Component, § entri "CANCELLABLE_BATCH_STATUS" — itu arah
CLIENT→SERVER; ini arah SERVER→CLIENT, aturan RSC yang beda lagi).

**Fix:** Server Component (`layout.tsx`) cuma oper STRING murni
(`surface: "app" | "admin"`, aman diserialisasi apa pun). `Sidebar`/
`Topbar` (sudah "use client") lookup daftar nav-nya SENDIRI secara
internal berdasar `surface` — komponen icon tidak PERNAH menyeberangi
boundary Server→Client sebagai data, cuma dipakai di dalam JSX yang
di-render Client Component itu sendiri.

**Pencegahan:** Kalau sebuah value BERISI referensi komponen/fungsi React
(bukan primitif: string/number/boolean/plain object/array berisi
primitif), JANGAN pernah dioper sebagai prop dari Server Component ke
Client Component — cuma boleh: (1) didefinisikan/dipakai SEPENUHNYA di
sisi client (termasuk lookup dari key/id yang dioper sebagai string), atau
(2) sudah di-render jadi JSX SEBELUM masuk prop `children`. Test SEMUA
halaman yang dipengaruhi refactor shared-component (bukan cuma yang
sedang dikerjakan) sebelum deploy — refactor ini menyentuh 2 surface
sekaligus (admin+customer), cuma admin yang sempat ditest manual sebelum
deploy, customer (`app/app/`) baru ketahuan rusak lewat laporan user.

---

## 2026-08-28 — Accurate `save.do` TIDAK bisa hapus 1 `detailItem` via omit (upsert-only, bukan full-replace)
**Masalah:** Fase 09 ("Batal Import") desain awal (ADR-0013) berasumsi
faktur gabungan lintas-batch bisa "disusutkan" — kirim ulang `detailItem[]`
via `save.do` mode update, cuma berisi item yang mau DIPERTAHANKAN (via
`id`), berharap item yang DI-OMIT otomatis terhapus. Asumsi ini diturunkan
dari catatan ADR-0012 ("detailItem di-REPLACE, bukan merge") — TAPI
ADR-0012 cuma pernah menguji arah TAMBAH item, tidak pernah arah BUANG.

**Root cause:** Verifikasi nyata Fase 09 membuktikan asumsi ini SALAH.
Test 1 (langsung buang 1 dari 2 item baru dibuat): `save.do` balas
`s:false`, error "kalkulasi biaya barang belum selesai" — awalnya disangka
cuma isu timing. Test 2 (SAMA persis, tapi tunggu 45 detik dulu): `save.do`
balas `s:true` ("berhasil disimpan") TANPA error — tapi `detail.do` fresh
sesudahnya menunjukkan KEDUA item (termasuk yang di-omit) MASIH ADA.
Kesimpulan: `detailItem[]` di `save.do` mode update bersifat **upsert-only**
— item yang direferensikan tetap/diupdate, item baru (tanpa `id`)
ditambahkan, tapi item yang TIDAK disertakan TETAP DIPERTAHANKAN (bukan
dihapus). Tidak ada endpoint/field alternatif untuk hapus 1 baris item
(`delete.do` cuma hapus FAKTUR UTUH, bukan per-item).

**Dampak yang SEMPAT terjadi**: sebelum ketemu, kode Fase 09 (`workers/index.ts`)
sempat memanggil `save.do` dengan `detailItem[]` parsial dan MENANDAI
baris sebagai `cancelled` begitu respons `s:true` diterima — padahal
faktur Accurate TIDAK BERUBAH sama sekali. Ini kelas bug BERBAHAYA: sistem
melaporkan sukses padahal data akuntansi asli TIDAK terhapus, user bisa
percaya sesuatu sudah dibatalkan padahal masih ada. Ketemu & diperbaiki
SAAT verifikasi nyata sebelum fase ditutup — TIDAK sempat ke production.

**Fix:** ADR-0014 (koreksi ADR-0013) — hapus total mekanisme "susutkan"
dari kode, ganti jadi BLOKIR (faktur gabungan lintas-batch tidak bisa
di-auto-cancel sama sekali, sama seperti kasus "baris tanpa tracking id").

**Pencegahan:** Kesimpulan dari test skenario A ("X berhasil dengan
payload P") TIDAK BOLEH digeneralisasi ke skenario B yang cuma "mirip"
(P dengan 1 elemen dihapus) tanpa diuji ulang secara terpisah — arah
operasi (tambah vs buang) bisa punya semantik API yang BEDA TOTAL walau
sama-sama lewat endpoint & field yang sama. Selalu uji tiap ARAH operasi
secara eksplisit, jangan asumsikan simetris. Kalau hasil test `s:true`
tanpa error, TETAP verifikasi ulang via fetch independent (`detail.do`
fresh) sebelum percaya sistem benar-benar melakukan yang diminta — respons
sukses dari `save.do` cuma berarti "request diterima & diproses", BUKAN
jaminan hasil akhirnya sesuai ekspektasi caller.

---

## 2026-08-28 — CI auto-deploy (`deploy-to-server`) TIDAK PERNAH benar-benar jalan sejak awal — secret SSH kosong
**Masalah:** Ketemu saat verifikasi nyata Fase 08 — push ke `main` selalu
menghasilkan Release sukses + `build-and-push` sukses (image ke GHCR), tapi
job `deploy-to-server` (SSH ke VPS, `docker compose pull && up -d`) SELALU
gagal dengan `error: missing server host` dari `appleboy/ssh-action`.
Karena `build-and-push` selalu sukses dan overall run summary GitHub
kadang tampil ambigu, ini tidak ketahuan sampai sengaja dicek satu-satu
step-nya. Setiap "deploy" yang benar-benar sampai ke server `ane.web.id`
sepanjang project ini (Fase 02 s.d. 08) **dilakukan MANUAL lewat SSH
langsung**, BUKAN lewat pipeline CI — pipeline-nya cuma push image ke GHCR
lalu berhenti.

**Root cause:** `gh secret list` di repo `webaneid/facport` mengembalikan
KOSONG — secret `SERVER_HOST`/`SERVER_USER`/`SERVER_SSH_KEY` yang dibaca
`.github/workflows/deploy.yml` job `deploy-to-server` tidak pernah diisi
sejak repo dibuat. Komentar di `deploy.yml` sendiri SUDAH mengantisipasi
ini ("Kalau secrets ... belum diisi ... step ini gagal — TIDAK apa-apa,
image di job sebelumnya tetap sudah ter-push ke GHCR") tapi tidak ada
alert/notifikasi yang bikin ini kepergok lebih awal — kelas bug yang SAMA
dengan 2 temuan sebelumnya (`deploy.yml` tidak ke-trigger 2026-08-26,
service `worker` tidak pernah ada di compose 2026-08-28): sesuatu yang
"ada di kode/config tapi belum pernah benar-benar tervalidasi jalan di
lingkungan nyata" luput karena setiap langkah SEBELUMNYA (release,
build-and-push) selalu sukses dan terlihat cukup meyakinkan.

**Fix (saat ini):** BELUM diisi (butuh keputusan user — isi secret GitHub
Actions perlu private key SSH server, sengaja tidak dilakukan sepihak).
Workaround yang dipakai tiap kali fase baru butuh deploy nyata: manual
`ssh wasugi@76.13.18.136`, `docker compose -f docker-compose.prod.yml -f
docker-compose.override.yml --env-file .env.production --env-file
.env.deploy pull/up -d` dengan `IMAGE_TAG` versi yang baru dirilis (lihat
`git tag`/commit `chore(release): x.x.x`).

**Insiden turunan saat workaround manual (2026-08-28)**: `docker compose
up -d` PERTAMA dijalankan cuma dengan `-f docker-compose.prod.yml` (lupa
`-f docker-compose.override.yml`) — Compose HANYA auto-merge
`docker-compose.override.yml` kalau nama file compose utama default
(`docker-compose.yml`), begitu `-f` dipakai eksplisit, override HARUS
ikut di-`-f` eksplisit juga, TIDAK otomatis. Akibatnya container `web`/`api`
naik TANPA port mapping ke `127.0.0.1:3020`/`3021` sama sekali (`docker
port` kosong), nginx dapat 502 selama beberapa menit sampai ketahuan &
diperbaiki (`ss -tlnp` konfirmasi tidak ada yang listen di port itu).

**Pencegahan:**
1. Isi secret `SERVER_HOST`/`SERVER_USER`/`SERVER_SSH_KEY` di GitHub
   Actions kalau auto-deploy CI memang mau benar-benar dipakai — perlu
   keputusan eksplisit user dulu (generate/pilih SSH key mana yang dipakai
   khusus deploy, idealnya BUKAN key personal yang sama dipakai login
   manual).
2. SELALU pakai kedua `-f` file (`docker-compose.prod.yml` DAN
   `docker-compose.override.yml`) untuk SEMUA operasi `docker compose`
   manual di server ini — pertimbangkan bikin alias/script kecil di server
   (`/opt/app/deploy.sh`) yang membungkus command lengkap supaya tidak
   ketinggalan flag lagi.
3. Setelah deploy manual apa pun, WAJIB curl `127.0.0.1:3020`/`3021` DAN
   domain publik sebelum menganggap deploy selesai — jangan cuma percaya
   `docker ps` status "healthy" (healthcheck internal container bisa OK
   walau port EXTERNAL tidak ke-mapping sama sekali).
4. **(2026-08-31)** `docker compose ... up -d` TANPA nama service eksplisit
   di VPS ini akan GAGAL total dengan `network edge declared as external,
   but could not be found` — `docker-compose.prod.yml` punya service
   `caddy` yang butuh network eksternal `edge` (§ baris `networks: [internal,
   edge]`, dibuat manual via `docker network create edge`, untuk skenario
   Caddy di-share dengan staging). VPS ini TIDAK pakai Caddy sama sekali
   (nginx existing yang pegang port 80/443, lihat komentar
   `docker-compose.override.yml`), network `edge` sengaja TIDAK PERNAH
   dibuat di sini, dan container `caddy` TIDAK PERNAH ada di `docker ps`
   VPS ini — tapi Compose tetap validasi SELURUH network di top-level
   `networks:` config walau service yang dituju (`caddy`) tidak diminta.
   **Command yang benar** (skip `caddy`, sebutkan service eksplisit):
   `docker compose -f docker-compose.prod.yml -f docker-compose.override.yml
   --env-file .env.production --env-file .env.deploy up -d api web worker
   minio postgres`. Bare `up -d` (tanpa daftar service) akan SELALU gagal
   di VPS ini sampai kapan pun, bukan error transient.

---

## 2026-08-28 — Service `worker` (pg-boss) TIDAK PERNAH ada di `docker-compose.prod.yml`/`.staging.yml`
**Masalah:** Batch import Faktur Pembelian permanen nyangkut status
"processing" di server `ane.web.id` — halaman detail batch
(`.../purchase-invoice/import/<batchId>`) "tidak masuk" (user report).
Baris-barisnya juga tidak pernah berubah dari `pending`.

**Root cause:** `apps/api` punya DUA entry point terpisah SENGAJA —
`src/index.ts` (server HTTP, `.listen()`) dan `src/workers/index.ts`
(proses worker pg-boss terpisah, konsumsi job `IMPORT_TO_ACCURATE`/
`SEND_EMAIL`/dst — lihat `apps/api/CLAUDE.md`). `docker-compose.prod.yml`
DAN `docker-compose.staging.yml` dari commit pertama project cuma punya
service `api` (jalanin `dist/index.js`) — **tidak pernah ada service yang
menjalankan `dist/worker.js` sama sekali**. Setiap `boss.send(...)` yang
di-enqueue dari route (upload/confirm/retry) numpuk di tabel
`pgboss.job` selamanya, tidak ada consumer.

Ini KELAS BUG YANG SAMA dengan temuan sebelumnya soal `deploy.yml` tidak
pernah jalan (`docs/lessons-learned.md` entri 2026-08-27) — sesuatu yang
"ada di kode/config tapi belum pernah benar-benar dijalankan di
lingkungan nyata" luput dari deteksi karena tidak ada test/CI yang
menyentuh proses worker sebagai container terpisah (test lokal jalanin
worker langsung via `bun run dev:worker`/`bun run src/workers/index.ts`,
bukan lewat compose file production).

**Fix:**
1. `apps/api/package.json` — script baru `build:worker` (bundle
   `src/workers/index.ts` terpisah dari `src/index.ts`, `--external sharp`
   sama seperti build API server).
2. `apps/api/Dockerfile` — builder stage jalankan `build:worker` juga,
   `dist/worker.js` ikut ke-copy ke image production (image API dan
   worker SAMA, cuma command override).
3. `docker-compose.prod.yml` & `.staging.yml` — service baru `worker`,
   `command: ["bun", "run", "dist/worker.js"]`.
4. **Stopgap darurat** (sebelum image baru selesai build lewat CI):
   `docker cp` source `apps/api/src` ke container `api` yang sudah jalan,
   eksekusi `bun run src/workers/index.ts` langsung (Bun bisa jalankan
   `.ts` tanpa build step) via `docker exec -d` — job yang nyangkut
   langsung ke-proses begitu worker sementara ini nyala (pg-boss job
   persisten di Postgres, worker yang telat nyala tetap kepick-up job
   lama). Diganti proses resmi (container `worker` sungguhan) begitu
   image baru selesai di-deploy.

**Pencegahan:** Kalau project lain dari template ini juga punya proses
worker terpisah (`workers/index.ts` atau sejenis), JANGAN asumsikan
`docker-compose.prod.yml` otomatis include service untuk itu cuma karena
`api`/`web` sudah ada — cek eksplisit `docker compose config --services`
mencakup SEMUA proses yang didefinisikan di `package.json`
(`start`/`start:worker`/dst), bukan cuma yang jelas-jelas terima HTTP
request.

---

## 2026-08-27 — `deploy.yml` belum PERNAH jalan sejak v1.0.0: 6 bug ketemu & diperbaiki berurutan (persiapan demo domain sementara)
**Masalah:** User minta setup subdomain sementara (`ane.web.id`) buat
presentasi besok + panduan `docker pull` di VPS baru. Sebelum kasih
instruksi pull, dicek `gh run list --workflow=deploy.yml` — **NOL run,
dari v1.0.0 sampai v1.0.2** (padahal `architecture-deployment.md` sudah
klaim "pipeline release terverifikasi jalan"). Itu klaim soal
`release.yml` doang (bikin GitHub Release) — `deploy.yml` (build+push
image ke GHCR) ternyata nol kali pernah jalan sejak project mulai. Kalau
ini kelewat, instruksi "pull di server" besok akan gagal total karena
image-nya memang belum pernah ada.

**6 bug, ketemu satu-satu lewat build+run image NYATA (bukan cuma baca
kode) — pola sama seperti entri 2026-08-22, debugging berlapis:**

1. **`deploy.yml` trigger `release: published` TIDAK PERNAH nyala.**
   Root cause: `release.yml` bikin GitHub Release pakai `GITHUB_TOKEN`
   bawaan (`bunx semantic-release`) — GitHub Actions SENGAJA tidak
   memicu workflow lain untuk event yang dibuat `GITHUB_TOKEN` (anti-loop).
   Fix: ganti trigger ke `workflow_run` (dipicu selesainya run
   `release.yml` itu sendiri) + `workflow_dispatch` buat manual.
2. **`resolve-tag` job salah bandingkan SHA, build selalu di-skip.**
   `github.event.workflow_run.head_sha` = commit SEBELUM semantic-release
   nambah commit `chore(release): x.x.x` (yang beneran ditag) — selalu
   mismatch. Fix: checkout tip `main` TERBARU, cek `git describe --tags
   --exact-match HEAD` langsung, bukan bandingkan SHA manual.
3. **Dockerfile (api & web) copy `bun.lockb`** (format binary lama),
   padahal repo pakai `bun.lock` (format teks, default Bun sekarang) —
   `bun install --frozen-lockfile` gagal "not found". Fix: ganti nama
   file di kedua Dockerfile.
4. **`apps/api/package.json` belum pernah punya script `"build"`**
   (selama ini cuma `bun run src/index.ts` langsung, tanpa build step),
   padahal Dockerfile expect `dist/index.js`. Fix: tambah
   `"build": "bun build ./src/index.ts --outdir ./dist --target bun
   --external sharp"` — `sharp` WAJIB `--external`, native binding-nya
   rusak kalau ikut di-bundle jadi satu file (diverifikasi: tanpa itu,
   warm-start throw "Could not load sharp module").
5. **`apps/web/tsconfig.json` (dan `apps/api/tsconfig.json`) extends
   `"../../tsconfig.json"` (root)** tapi Dockerfile keduanya cuma copy
   `package.json`+`bun.lock`, bukan `tsconfig.json` root — Turbopack
   build gagal "extends ... doesn't resolve correctly". Fix: tambahkan
   `tsconfig.json` ke `COPY` di kedua Dockerfile.
6. **`lib/api-client.ts` (Eden Treaty) `import type { App } from
   "../../api/src/index"`** — type-only import lintas-workspace ini
   BUTUH source+dependency `apps/api` ada di builder image supaya
   type-check `next build` bisa resolve, padahal Dockerfile web cuma
   copy `apps/web` sendiri. Fix: copy `apps/api/package.json` (sebelum
   install) DAN source `apps/api` juga ke builder stage — stage
   production tetap TIDAK kebawa (cuma hasil build).
7. **Bug produk (bukan infra CI), ketemu pas `next build` beneran
   jalan pertama kali:** `useSearchParams()` di `LoginForm` (dipakai
   admin/login & app/login) belum di-`Suspense`, bikin `next build`
   GAGAL KERAS saat prerender (`/admin/login`) — beda dari dev server
   yang cuma warning. Fix: bungkus `LoginFormInner` dengan `<Suspense>`
   di `login-form.tsx` sendiri (satu tempat, semua consumer otomatis benar).
8. **Stage production `apps/web/Dockerfile` pakai `output: "standalone"`
   + jalan via `bun run` — DUA masalah sekaligus, ketemu pas image
   di-*run* beneran (bukan cuma build sukses):**
   (a) Next 16 (Turbopack) server bundle CRASH di runtime Bun:
   `"Expected CommonJS module to have a function wrapper... bug in Bun"`.
   (b) `output: "standalone"` nge-trace ulang `node_modules` dari
   struktur isolated-store `bun install` (`node_modules/.bun/...` +
   symlink) dan hasilnya GAK LENGKAP (`MODULE_NOT_FOUND`) — gap yang
   sama baik dijalankan Bun maupun Node. Fix: hapus `output:standalone`,
   base image production ganti ke `node:22-slim`, jalan
   `node node_modules/.bin/next start` pakai `node_modules` ASLI (full,
   bukan hasil trace) — struktur nested `/repo/apps/web` WAJIB
   dipertahankan (symlink `apps/web/node_modules/*` nunjuk relatif ke
   `../../../node_modules/.bun/...`). `apps/web/public/` juga ternyata
   belum pernah ada di repo — ditambah `.gitkeep`.

**Cara verifikasi yang KRITIKAL (beda dari sesi 2026-08-22 — kali ini
sampai run container-nya, bukan cuma build sukses):** build `next build`
lokal dulu tiap kali sebelum push ulang (hemat 3-4 menit round-trip CI
per percobaan), DAN untuk bug #8 — simulasikan PERSIS susunan file yang
di-`COPY` Dockerfile ke direktori terpisah lokal, jalankan
`node node_modules/.bin/next start` dari situ, `curl` beneran ke server-nya
(termasuk `curl -H "Host: admin.localhost"` buat mastiin proxy
surface-detection ikut kepakai) — "image ke-build" TIDAK SAMA DENGAN
"image bisa jalan", baru ketahuan setelah run beneran.

**Hasil akhir:** `v1.0.10` — `build-and-push` sukses penuh (API + web,
image ada di GHCR). `deploy-to-server` gagal (expected — secrets
`SERVER_HOST`/`SERVER_USER`/`SERVER_SSH_KEY` belum diisi, auto-deploy ke
VPS belum di-setup, first deploy tetap manual sesuai
`docs/deployment-server-setup.md`).

**Pencegahan:** `architecture-deployment.md` § status "pipeline
terverifikasi" cuma soal `release.yml` — JANGAN generalisasi ke seluruh
pipeline (`deploy.yml`) tanpa cek `gh run list --workflow=deploy.yml`
punya run sukses beneran. Kalau bikin workflow dua-tahap
(release → deploy via `release: published`) dan release dibuat lewat
`GITHUB_TOKEN` bawaan di workflow LAIN, WAJIB pakai `workflow_run` (atau
PAT), bukan event `release published` — ini bukan kasus spesifik project
ini, semua setup semantic-release + deploy terpisah kena masalah yang
sama. Juga: `bun install` versi sekarang default isolated-store
(`node_modules/.bun/...`), BUKAN hoisted-flat kayak npm/yarn classic —
kalau nanti coba `output: "standalone"` Next.js lagi di monorepo Bun,
verifikasi ulang dari nol (mungkin sudah diperbaiki di versi Next/Bun
lebih baru), jangan asumsikan otomatis kompatibel.

---

## 2026-08-22 — Push pertama project: 5 bug CI/CD ketemu & diperbaiki berurutan (release.yml gagal 4x sebelum sukses)
**Masalah:** Repo git baru di-init & push PERTAMA KALI sesi ini (sebelumnya
"No commits yet" sejak awal project walau kode sudah sampai Fase 05).
Begitu di-push ke `main`, workflow `release.yml` (jalan otomatis tiap push
ke `main`) gagal **4 kali berturut-turut**, tiap kali error beda — karena
`ci.yml`/`release.yml` memang belum PERNAH benar-benar dijalankan sejak
project-init bikin file-nya (cuma ada sebagai config, tidak pernah dites).

**5 bug yang ketemu, satu per satu, tiap kali diperbaiki muncul bug
berikutnya (proses debugging BERLAPIS, bukan 1x langsung ketauan semua):**

1. **Migration Drizzle ke-`.gitignore` total sejak awal** (`apps/api/drizzle/`)
   — kontradiksi sama `architecture-database.md` sendiri yang bilang wajib
   ikut commit. CI checkout fresh tidak punya migration sama sekali buat
   bikin skema database. Fix: hapus baris itu dari `.gitignore`, commit
   4 file migration + 5 file `meta/` yang selama ini "hilang".
2. **Test suite gagal — `env.ts` validation error** (banyak field required
   kosong). Root cause: `ci.yml`/`release.yml` belum punya `services:
   postgres:` ATAU env var apa pun buat testnya. Fix: tambah service
   Postgres (image `postgres:16`, health check) + `env:` block isi nilai
   DUMMY (bukan secret production — Postgres service fresh tiap run,
   tidak pernah persist) buat semua field required `env.ts`.
3. **8 test gagal — `TypeError: undefined is not an object (evaluating
   'customerRole.id')`.** Root cause: migration cuma bikin STRUKTUR tabel
   kosong, role `admin`/`customer` (dari `db:seed.ts`) belum pernah
   di-insert di database CI yang fresh — lolos di lokal karena dev DB
   sudah lama di-seed manual. Fix: tambah step `bun run --cwd apps/api
   db:seed` SETELAH migrate, SEBELUM test.
4. **`semantic-release` error `Cannot find module '@semantic-release/changelog'`.**
   Root cause: `.releaserc.json` udah konfigurasi plugin itu (+ `git`,
   `github`, `commit-analyzer`, `release-notes-generator`), tapi package-nya
   SENDIRI tidak pernah di-`bun add` — `bunx semantic-release` cuma
   resolve package inti-nya, bukan plugin yang disebut di config. Fix:
   `bun add -D semantic-release @semantic-release/{commit-analyzer,
   release-notes-generator,changelog,git,github}`.
5. **`generateNotes` gagal: "conventional-changelog-writer@9 or newer"
   diminta, padahal versi lain di tree masih v8.** Root cause: `bun add`
   pertama nginstall `conventional-changelog-conventionalcommits@latest`
   (v10), yang butuh writer v9+ — tapi `@semantic-release/release-notes-generator@14.1.1`
   bawa writer v8 sendiri, bentrok. Fix: pin eksplisit ke `^7`
   (`bun add -D conventional-changelog-conventionalcommits@^7`).

**Cara verifikasi tiap fix** (pola dipakai konsisten tiap iterasi): (a)
`bunx semantic-release --dry-run --no-ci` LOKAL dulu sebelum push ulang
(hemat 1-2 menit round-trip CI per percobaan), (b) `gh run view <id>
--log-failed` buat baca log GitHub Actions LANGSUNG dari terminal (tidak
perlu buka browser), (c) `Monitor` tool (poll `gh run view --json
status,conclusion` tiap 15 detik) buat nunggu hasil run tanpa nge-block
kerjaan lain.

**Hasil akhir:** `v1.0.0` lalu `v1.0.1` (Akun Hutang existing-vendor fix)
sukses terbit otomatis lewat pipeline penuh — bukan cuma "kelihatannya
ada", beneran dibuktikan jalan end-to-end 2x berturut-turut.

**Pencegahan:** Kalau ada project lain yang juga baru pertama kali di-push
(config CI/CD dari template belum pernah dites), JANGAN asumsikan
`ci.yml`/`release.yml` otomatis jalan mulus cuma karena file-nya ada —
selalu treat sebagai "belum diverifikasi" sampai ada run nyata yang
sukses. 5 bug di atas SEMUA kelas masalah generik (test butuh DB nyata,
migration harus ikut commit, semantic-release plugin harus explicit
dependency) — kemungkinan besar muncul lagi di project lain dari template
yang sama kalau tidak dicek dari awal.

---

## 2026-08-20 — 3 "kegagalan" testing Fase 05 yang ternyata bukan bug produk
**Masalah:** Verifikasi browser fitur auto-create vendor/item (Fase 05)
sempat munculkan 3 error yang kelihatan seperti bug: field "Satuan Barang"
dianggap kepanjangan, batch macet di `processing`, `No Faktur # harus diisi`.

**Root cause (SEMUA bug test, BUKAN bug produk):**
1. Skrip test Playwright nyusun Excel pakai 2 array terpisah (`headers`/`row`)
   ditulis manual — nambah 1 kolom di tengah `headers` tapi nilainya cuma
   ditambah di ujung `row` → semua kolom sesudahnya ketuker geser 1 posisi.
2. Worker (`bun run dev:worker`) di-hot-reload SAAT job masih diproses →
   proses restart di tengah jalan, update status batch di akhir loop tidak
   sempat jalan → batch nyangkut permanen di `processing`.
3. Skrip test lupa isi kolom "Bill No" — akun Accurate "Retail Demo" punya
   setting `useBillNumber: true` yang mewajibkannya (field sudah ada sejak
   Fase 02).

**Fix:** Bukan fix kode — dikonfirmasi lewat test terisolasi (panggil fungsi
Accurate langsung, tanpa UI/worker) yang semua sukses, membuktikan logic
benar; baru dicari beda test terisolasi vs test UI.

**Pencegahan:**
- Susun data Excel test pakai 1 OBJECT (`{kolom: nilai}`), bukan 2 array
  paralel — hilangkan kelas bug "kolom bergeser".
- Jangan edit source file yang lagi diproses worker hot-reload saat job
  masih jalan.
- Error Accurate yang terasa aneh (mis. "field kepanjangan" padahal
  pendek) → cek dulu RAW DATA tersimpan (`raw_data`/`column_mapping` di
  `import_batch_rows`) sebelum menyalahkan logic pemetaan.
- `branchName`/`billNumber` gampang lupa disertakan saat susun data test
  manual — sudah ada di mapping sejak Fase 02.

---

## 2026-08-19 — Tombol Upload "tidak berfungsi": validasi react-hook-form gagal diam-diam karena `formState.errors` tidak dirender
**Masalah:** User lapor "tombol import blm bisa digunakan" di halaman
`purchase-invoice/import`. Diverifikasi lewat Playwright: klik "Upload"
TANPA pilih file dulu → tidak ada error yang tampil, tidak ada navigasi,
tombol kelihatan seperti "tidak ngapa-ngapain" dari sudut pandang user.
**Root cause:** Form pakai `useForm` + `zodResolver` dengan validasi
`file` wajib (`.refine(...)`), tapi kode cuma destructure
`formState: { isSubmitting }` — TIDAK destructure `errors`, jadi pesan
error Zod ("Pilih 1 file Excel (.xlsx)") tidak pernah dirender ke DOM.
Submit gagal validasi secara SILENT — user tidak dapat feedback sama
sekali kenapa tombol "tidak jalan".
**Fix:** `apps/web/app/app/(protected)/purchase-invoice/import/page.tsx`
— destructure `errors: uploadErrors` dari `formState`, render
`{uploadErrors.file && <p className="text-sm text-destructive">{uploadErrors.file.message}</p>}`
persis di bawah `<input type="file">`. Diverifikasi ulang via Playwright:
error sekarang tampil, tidak ada navigasi (perilaku benar).
**Pencegahan:** SETIAP form `react-hook-form` di project ini WAJIB
destructure DAN render `formState.errors` untuk field yang punya validasi
(resolver Zod atau `register(...,{required...})`) — kalau tidak, kegagalan
validasi client-side jadi tak terlihat sama sekali oleh user (beda dari
error server yang biasanya sudah ke-catch lewat `setError`/toast). Cek
pola ini juga di form BARU manapun yang ditambah modul berikutnya
(Sales Invoice, dst) — jangan cuma dicontoh dari form yang sudah ada
tanpa dicek errors-nya benar dirender.

---

## 2026-08-19 — Overflow horizontal di mobile: flex item butuh `min-w-0` eksplisit, `overflow-x-auto` di tabel SAJA tidak cukup
**Masalah:** Fase 03 (Dashboard Pelanggan) — verifikasi Playwright di
breakpoint mobile (390px) nemuin `document.documentElement.scrollWidth >
clientWidth` (overflow horizontal SELURUH HALAMAN), padahal komponen
`Table` sudah dibungkus `<div className="overflow-x-auto">`.
**Root cause:** Struktur App Shell: `<div className="flex min-h-screen">`
(sidebar + kolom kanan) → kolom kanan `<div className="flex flex-1
flex-col">` (Topbar + `<main>`) → konten halaman (Card berisi Table dengan
sel `whitespace-nowrap`, lebar intrinsik > viewport mobile). Flex item
DEFAULT-nya `min-width: auto` (BUKAN `0`) — artinya flex item TIDAK BOLEH
menyusut lebih kecil dari lebar konten intrinsiknya, kecuali diberi
`min-width: 0` eksplisit. Karena kolom kanan (`flex flex-1 flex-col`) dan
`<main>` di dalamnya adalah flex item tanpa `min-w-0`, lebar intrinsik
tabel "menular" ke ATAS lewat rantai flex, mendorong SELURUH kolom (dan
akhirnya seluruh halaman) keluar viewport — `overflow-x-auto` pada Table
sendiri jadi tidak relevan karena parent-nya sendiri sudah lebih lebar
dari viewport.
**Fix:** Tambah `min-w-0` di `apps/web/components/app-shell/app-shell.tsx`
pada DUA level: kolom kanan (`flex min-w-0 flex-1 flex-col`) DAN `<main>`
(`min-w-0 flex-1 p-4...`). Diverifikasi ulang lewat Playwright — overflow
hilang di semua breakpoint (desktop/tablet/mobile), tabel tetap bisa
scroll horizontal SENDIRI di dalam card-nya (perilaku yang diinginkan).
**Pencegahan:** Kapan pun ada elemen dengan lebar intrinsik besar (tabel
`whitespace-nowrap`, kode/pre block, dst) diletakkan di DALAM struktur
flex/grid berlapis, WAJIB `min-w-0` di SETIAP level flex/grid ANTARA
elemen lebar itu dan viewport — bukan cuma di elemen yang punya
`overflow-x-auto` itu sendiri. Verifikasi responsive WAJIB pakai
`document.documentElement.scrollWidth <= clientWidth` di browser
sungguhan (Playwright) per breakpoint — server-render/curl tidak bisa
mendeteksi ini sama sekali (murni bug layout CSS, tidak ada bedanya di
HTML mentah).

---

## 2026-08-19 — `open-db.do` response TIDAK ikut pola envelope generik `{s, d: T}` Accurate
**Masalah:** Ditemukan lewat test call NYATA (Fase 02, Milestone 7) — script
ad-hoc panggil `openAccurateSession()` lalu akses `.session` untuk fetch
data vendor, crash `TypeError: undefined is not an object (evaluating
'session.session')`.
**Root cause:** `lib/accurate.ts`'s `openDatabase()` awalnya pakai
`parseAccurateEnvelope<AccurateSession>(res)` (parser generik yang return
`body.d`) — asumsi ini didasarkan pada contoh response publik
(accurate.id/api-integration/api-example/) yang menampilkan
`{s, session, host, dataVersion, licenseEnd}` TANPA field `d` sama sekali.
Response ASLI dari `open-db.do` TERNYATA punya field `d` juga
(`["Proses Berhasil Dilakukan"]` — pesan status, bukan payload), dan
`session`/`host`/`dataVersion`/`licenseEnd` semuanya SIBLING dari `d` di
level atas body, bukan nested di dalamnya — beda dari pola `{s, d: T}` yang
konsisten dipakai endpoint LAIN (`db-list.do` taruh payload beneran di `d`).
Halaman contoh publik yang jadi sumber verifikasi sebelumnya rupanya contoh
yang disederhanakan/tidak lengkap.
**Fix:** `openDatabase()` di `lib/accurate.ts` diubah untuk parse manual
dari body top-level (`body.session`, `body.host`, dst), TIDAK lagi lewat
`parseAccurateEnvelope`. Diverifikasi ulang lewat call nyata — `session`
dan `host` sekarang terbaca benar.
**Pencegahan:** Halaman dokumentasi publik/contoh pihak ketiga itu BAGUS
buat titik awal, tapi TIDAK bisa dianggap 100% merepresentasikan response
asli — WAJIB tetap divalidasi lewat minimal SATU test call sungguhan
sebelum kode yang bergantung pada bentuk response itu dianggap final,
apalagi kalau field seperti `d` (yang polanya konsisten di endpoint lain)
ternyata hilang dari contoh. Ini juga alasan kenapa "Milestone 7 — Validasi
End-to-End Nyata" tetap wajib ada di tiap fase yang integrasi ke API pihak
ketiga, bukan sekadar formalitas checklist.

---

## 2026-08-19 — Login gagal di browser sungguhan: 2 bug cookie independen
**Masalah:** Login "berhasil" (tidak ada error di form) tapi langsung
dilempar balik ke `/login`. Ada 2 root cause TERPISAH, harus diperbaiki
dua-duanya.

**Root cause #1 — panggilan lintas-situs**: `apps/web` (`app.localhost:6209`)
manggil `apps/api` (`localhost:3001`, host beda) langsung dari browser.
`.localhost` bukan domain terdaftar asli — browser modern anggap **tiap
subdomain `*.localhost` situs sendiri-sendiri** (beda dari production,
`app.facport.com`/`api.facport.com` satu situs asli), jadi semua panggilan
`web`→`api` di dev selalu "lintas-situs".

**Root cause #2 — `Domain=.localhost` ditolak diam-diam**: ketemu SETELAH
#1 diperbaiki (login masih gagal walau sudah same-origin lewat proxy).
`advanced.crossSubDomainCookies` set atribut `Domain=.localhost` di cookie
— browser memperlakukan `localhost` sebagai **public suffix** (sama alasan
`Domain=.com` ditolak), jadi cookie tidak pernah tersimpan, TANPA warning
apa pun. Dibuktikan via Playwright: hapus `Domain` attribute → login sukses.

**3 percobaan fix yang salah arah** (semua untuk #1, dicatat supaya tidak
diulang): (a) `sameSite:"none"`+`secure:true` — Firefox/Chrome tetap
mempartisi storage cookie lintas-situs; (b) `partitioned:true` (CHIPS) —
cookie tersimpan tapi TIDAK PERNAH ikut terkirim di navigasi top-level;
(c) `next.config.ts` `rewrites()` untuk proxy — arah benar tapi
`rewrites()` bawaan Next.js TIDAK meneruskan header `Set-Cookie`
lintas-origin.

**Fix final:**
1. `apps/web/app/api-proxy/[...path]/route.ts` — Route Handler manual
   (bukan `rewrites()`) forward request server-to-server, salin SEMUA
   `Set-Cookie` via `backendRes.headers.getSetCookie()` (bukan
   `new Headers()`, itu bisa gabung jadi 1 string tidak valid).
   `apps/web/proxy.ts` WAJIB skip guard-login untuk `/api-proxy/*`.
2. `lib/api-client.ts`/`lib/auth-client.ts` — di browser + bukan
   production, base URL jadi `${window.location.origin}/api-proxy` (Eden)
   dan `.../api-proxy/api/auth` (Better Auth, `/api/auth` wajib manual).
   SSR/production tetap `NEXT_PUBLIC_API_URL` absolute.
3. `apps/api/src/lib/auth.ts` — `crossSubDomainCookies.enabled` jadi
   `NODE_ENV === "production"` saja, `defaultCookieAttributes` override
   dihapus total (balik default Better Auth).

**Konsekuensi:** sesi login di dev TIDAK share antar `app.localhost`/
`admin.localhost` (production bisa, domain asli mendukung `Domain`
attribute) — batasan environment, bukan bug.

**Pencegahan:**
1. Test API lewat `app.handle()`/curl TIDAK CUKUP validasi perilaku cookie
   browser (`SameSite`, public-suffix rejection, partitioning) — semua itu
   cuma ditegakkan browser sungguhan.
2. Debugging masalah browser-spesifik macet setelah 1-2 percobaan manual →
   pakai Playwright (`bunx`, tidak perlu install manual) untuk bukti pasti,
   bisa ungkap root cause kedua yang tersembunyi di balik yang pertama.
3. `*.localhost` punya DUA keterbatasan terpisah dari production: (a) tiap
   subdomain = situs beda (SameSite/cross-site), (b) `Domain=.localhost`
   ditolak public-suffix (cross-subdomain sharing) — gejala cookie/session
   aneh di dev tapi tidak di production, curigai keduanya.
4. Proxy dev yang perlu meneruskan `Set-Cookie` → Route Handler manual
   dengan `response.headers.getSetCookie()`, JANGAN `rewrites()`.

---

## 2026-08-19 — Security review Fase 02: 0 Critical, 1 High (diperbaiki), 2 Medium (diperbaiki), 4 Low (diperbaiki)
**Konteks:** Subagent `security-auditor` diaudit terhadap kode Fase 02
(import Purchase Invoice dari Excel ke Accurate). Semua temuan diperbaiki
SAMA SESI (bukan ditunda), diverifikasi ulang typecheck+test+1 test call
nyata ke Accurate setelah patch.
- **High**: dependency `xlsx@0.18.5` (versi terakhir yang di-publish ke npm
  registry — SheetJS berhenti publish ke npm) punya 2 CVE publik
  (CVE-2023-30533 prototype pollution, CVE-2024-22363 ReDoS), diproses
  langsung terhadap file upload user tidak tepercaya. **Fix**: pindah ke
  build resmi terpatch dari CDN SheetJS sendiri
  (`xlsx@https://cdn.sheetjs.com/xlsx-0.20.3/xlsx-0.20.3.tgz`, DUA CVE
  sudah fixed di versi ini) — bukan fork pihak ketiga, tetap sumber resmi
  SheetJS, cuma bukan lewat npm registry (mereka memang publish begitu
  sejak versi itu).
- **Medium**: `parseExcelBuffer()` tidak dibungkus try/catch (file corrupt/
  bukan Excel asli lolos ke `onError` generik 500, bukan 400 jelas) — fix:
  try/catch → `400 INVALID_EXCEL_FILE`. Tidak ada batas jumlah baris
  (potensi zip-bomb/resource-exhaustion dari `.xlsx` yang didekompresi) —
  fix: `MAX_ROWS = 5000`.
- **Low** (semua diperbaiki): `batchId` path param tidak divalidasi format
  UUID (fix: `t.String({format:"uuid"})` di 3 endpoint) — `columnMapping`
  value tidak divalidasi terhadap field internal yang valid (fix: tolak
  eksplisit `400 INVALID_MAPPING_FIELD` alih-alih diam-diam diabaikan) —
  tidak ada test regresi ownership cross-subscription (fix: tambah test,
  2 user asli, verifikasi 404 bukan bocor data) — nama file upload tidak
  di-truncate ke batas kolom `varchar(255)` (fix: `.slice(0,255)`).
**Area yang sudah baik** (dicatat biar tidak diverifikasi ulang tanpa
alasan): dual-gate `permission`+`moduleAccess` konsisten di SEMUA endpoint,
ownership check batch konsisten, token Accurate tidak pernah ter-log,
`AccurateApiError` tidak bocorkan detail internal, frontend tidak pakai
`dangerouslySetInnerHTML`.
**Pencegahan**: Kalau nanti nambah dependency parsing file dari user
(image, PDF, CSV, dst), CEK DULU apakah packagenya masih aktif di-publish
ke npm registry — beberapa proyek besar (SheetJS termasuk) pindah
distribusi ke CDN sendiri karena alasan lisensi/monetisasi, dan versi npm
yang "terlihat terbaru" bisa jadi sudah lama tidak dapat patch keamanan.

---

## 2026-08-19 — `boss.send()` gagal "Database not opened" — pg-boss WAJIB `start()` di proses `apps/api` juga, bukan cuma worker
**Masalah:** Test end-to-end pertama `POST /purchase-invoice/import/:batchId/confirm`
(yang manggil `boss.send(JOBS.IMPORT_TO_ACCURATE, ...)`) crash 500
`AssertionError: Database not opened. Call open() before executing SQL.`
dari internal pg-boss.
**Root cause:** `lib/queue.ts` cuma bikin instance `boss` (`new PgBoss(...)`)
— `.start()` + `.createQueue()` (lewat helper `startQueue()`) HANYA
dipanggil di `workers/index.ts`. `apps/api/src/index.ts` (proses HTTP
server) TIDAK PERNAH memanggil `startQueue()` — dia cuma import `boss` dan
langsung pakai `.send()`. Ini gap yang ADA SEJAK Fase 00 (queue infra
dibikin) tapi baru ketahuan sekarang karena Fase 02 adalah FITUR PERTAMA
yang benar-benar `boss.send()` dari route HTTP (Fase 00/01 cuma pakai
`boss.schedule()`+`boss.work()` di sisi worker, tidak ada yang enqueue dari
request handler).
**Fix:** `apps/api/src/index.ts` tambah `await startQueue();` SEBELUM
`app.listen()`. `boss` instance sama (singleton dari `lib/queue.ts`)
dipakai proses `api` DAN `worker`, tapi tiap proses harus `start()`
masing-masing di process-nya sendiri.
**Pencegahan:** Kalau nanti ada fitur baru yang PERTAMA KALI enqueue job
dari route/service (bukan cuma dari worker itu sendiri), WAJIB cek
`index.ts` sudah start queue — jangan asumsikan `boss` instance yang
di-import otomatis siap pakai di proses manapun cuma karena worker sudah
jalan (dua proses terpisah, dua kali `start()` diperlukan).

---

## 2026-08-19 — Excel date input HARUS dinormalisasi ke DD/MM/YYYY sebelum dikirim ke Accurate
**Masalah:** Test end-to-end pertama gagal di worker:
`"Invalid field value for field \"transDate\"."` — padahal test call manual
sebelumnya (dengan tanggal ditulis literal `"19/08/2026"`) sukses.
**Root cause:** File Excel test ditulis dengan tanggal `"2026-08-19"`
(format ISO-ish) — `buildPurchaseInvoicePayload()` meneruskan nilai apa
adanya dari Excel tanpa normalisasi format. Accurate secara ketat cuma
terima `DD/MM/YYYY` untuk field tanggal (`transDate`, `taxDate`,
`shipDate`), TIDAK toleran ke format lain — dan Excel sendiri bisa
menyimpan tanggal dalam berbagai bentuk (serial number, `Date` object,
string berbagai format) tergantung cara user isi cell-nya.
**Fix:** `purchase-invoice.mapping.ts` tambah `toAccurateDate()` — deteksi
& konversi serial number Excel (basis epoch 30 Des 1899), `Date` object,
dan string ISO (`YYYY-MM-DD...`) ke `DD/MM/YYYY`; string yang sudah
`DD/MM/YYYY` dibiarkan. Diterapkan otomatis ke field `transDate`/`taxDate`/
`shipDate` di `buildPurchaseInvoicePayload()`. 3 unit test baru + retest
end-to-end nyata: baris yang tadinya gagal sekarang `success` dengan
`accurateTransactionId` asli.
**Pencegahan:** Field TANGGAL APAPUN yang dikirim ke Accurate (modul
manapun ke depannya) WAJIB lewat normalisasi format serupa — jangan asumsi
Accurate fleksibel soal format tanggal, dan jangan asumsi Excel selalu
kasih string yang sudah rapi.

---

## 2026-08-19 — `save.do` taruh record hasil di field `r`, BUKAN `d` (beda lagi dari pola envelope umum)
**Masalah:** Test call NYATA `purchase-invoice/save.do` (Fase 02, Milestone
7) sukses buat faktur (`"Faktur Pembelian \"PI.2026.08.00003\" berhasil
disimpan"`), tapi `savePurchaseInvoice()` yang pakai `parseAccurateEnvelope`
generik (return `body.d`) mengembalikan array pesan status
(`["Faktur Pembelian ... berhasil disimpan"]`), BUKAN objek
`{id, number}` yang dibutuhkan untuk `accurateTransactionId`.
**Root cause:** Endpoint SAVE/mutasi (beda dari endpoint list/query seperti
`db-list.do`) taruh record hasil di field TERPISAH bernama **`r`**, bukan
`d` — `d` di endpoint save cuma pesan status. Body asli:
`{"r": {...faktur lengkap, id: 102300, number: "PI.2026.08.00003", ...puluhan
field lain...}, "s": true, "d": ["Faktur Pembelian ... berhasil disimpan"]}`.
Ini pola KETIGA yang beda-beda dari Accurate untuk hal yang sama (envelope
`{s,d}` biasa, `open-db.do` dengan session/host di top-level, sekarang
`save.do` dengan hasil di `r`) — TIDAK ADA cara menebak polanya tanpa test
call nyata per jenis endpoint.
**Fix:** Tambah `parseAccurateSaveEnvelope<T>()` di `lib/accurate.ts`
(parse `body.r`, bukan `body.d`) khusus dipakai endpoint save/mutasi.
`accurate-purchase-invoice.ts` diupdate pakai fungsi ini. Diverifikasi
ulang — `result.id`/`result.number` sekarang kebaca benar.
**Pencegahan:** **JANGAN ASUMSIKAN pola envelope Accurate KONSISTEN
lintas-jenis-endpoint** (list vs save vs auth-related seperti
`open-db.do`) — tiap KATEGORI endpoint baru (bukan cuma tiap modul) WAJIB
divalidasi lewat MINIMAL SATU test call nyata sebelum kode yang mem-parse
response-nya dianggap final. ATURAN PRAKTIS untuk modul berikutnya (Sales
Invoice, Purchase Order, dst): endpoint `list.do`/`detail.do`/`db-*.do` →
coba `parseAccurateEnvelope` (pola `d`) dulu; endpoint `save.do`/
`bulk-save.do` → langsung coba `parseAccurateSaveEnvelope` (pola `r`)
duluan, JANGAN asumsikan `d` bekerja untuk endpoint save.

---

## 2026-08-19 — `env.APP_ORIGIN_PROD ?? fallback` gagal fallback karena `.env` isi string kosong, bukan unset
**Masalah:** Ditemukan lewat test OAuth Accurate end-to-end SUNGGUHAN
(kredensial `ACCURATE_CLIENT_ID`/`SECRET` asli, browser real user) — setelah
token exchange sukses, browser di-redirect ke `http://localhost:3001/accurate?connected=true`
(404, salah) padahal seharusnya ke `http://app.localhost:6209/accurate?connected=true`.
**Root cause:** `apps/api/src/routes/accurate.route.ts` pakai
`env.APP_ORIGIN_PROD ?? "http://app.localhost:6209"` untuk fallback origin
dev. `.env` punya baris `APP_ORIGIN_PROD=` (key ada, value string kosong —
pola umum untuk env var opsional yang belum diisi) → `process.env.APP_ORIGIN_PROD`
jadi `""`, BUKAN `undefined`. Operator `??` cuma fallback untuk
`null`/`undefined`, TIDAK untuk string kosong — jadi `"" ?? fallback`
menghasilkan `""`, bukan fallback-nya. Redirect target jadi
`"" + "/accurate?connected=true"` = `/accurate?connected=true` (relatif),
browser resolve relatif ke origin request saat itu (`localhost:3001`,
tempat callback route live) → 404.
**Fix:** Ganti `??` jadi `||` (treat string kosong sebagai falsy juga) —
`env.APP_ORIGIN_PROD || "http://app.localhost:6209"`. Diverifikasi via
`GET /accurate/oauth/callback?error=access_denied` → `Location` header
sekarang benar `http://app.localhost:6209/accurate?error=access_denied`.
**Pencegahan:** Untuk env var opsional dari `.env` yang punya default
runtime, JANGAN pakai `??` kalau ada kemungkinan `.env` set key-nya jadi
string kosong (bukan dihapus/comment-out) — pakai `||`, atau cek eksplisit
`(value && value.length > 0) ? value : fallback`. `lib/env.ts`'s
`webOriginsProd` helper SUDAH pakai pola truthy-check yang benar
(`env.WEB_ORIGINS_PROD ? ... : []`) — jadikan itu acuan, bukan `??`, untuk
kasus serupa ke depannya. Cek juga kalau ada `env.XXX_PROD ??` lain
sebelum menutup fase manapun yang nyentuh env fallback baru.

---

## 2026-08-19 — Security review Fase 01: 0 Critical/High, 3 Medium (semua diperbaiki), 3 Low (semua diperbaiki)
**Konteks:** Subagent `security-auditor` diaudit terhadap kode Fase 01
(fondasi produk: routing 3-surface, langganan, admin, OAuth Accurate).
Fase 01 TIDAK mengulangi kelas bug "route lupa guard" dari Fase 00 — semua
route baru punya guard eksplisit. Ringkasan lengkap ada di
`docs/phases/phase-01-fondasi-produk.md` § "Ringkasan Hasil".

**Semua Medium diperbaiki:**
- `proxy.ts` (apps/web) cuma cek keberadaan session cookie untuk surface
  admin, BUKAN role — karena `crossSubDomainCookies` bikin cookie customer
  biasa juga valid di `admin.facport.com`. Fix: endpoint baru `GET /me`
  (apps/api, return roles) + `app/admin/(protected)/layout.tsx` (Server
  Component) yang cek role SEBENARNYA sebelum render — `/admin/login`
  sengaja di LUAR route group `(protected)` biar tidak kena gate (cegah
  redirect loop). Diverifikasi manual: customer dengan cookie session valid
  TETAP diblokir dari `/admin/*` walau proxy meloloskannya.
- Self-registration tidak mewajibkan verifikasi email (session langsung
  aktif tanpa bukti kepemilikan email), kontradiksi dengan
  `architecture-subscription.md` yang eksplisit sebut alur ini. Fix:
  `requireEmailVerification: true` + `sendVerificationEmail` di
  `lib/auth.ts`. Admin-provisioned user DIKECUALIKAN (`emailVerified: true`
  di-set manual setelah `signUpEmail()`) — admin yang vouch, bukan email.
- Temp password admin-provisioned tidak pernah expire/wajib diganti —
  DITERIMA sebagai known limitation (bukan diperbaiki penuh), dicatat
  eksplisit di phase doc — force-change-di-login-pertama perlu kolom
  `mustChangePassword` + gate tambahan, scope-nya cukup besar untuk
  ditunda ke fase berikutnya, bukan blocker Fase 01.

**Semua Low diperbaiki:**
- `WEB_ORIGIN_PROD` (singular) cuma cover 1 dari 3 subdomain produksi →
  `WEB_ORIGINS_PROD` (dipisah koma, semua surface) + `APP_ORIGIN_PROD`
  (khusus redirect target OAuth callback, kebutuhan beda).
- `oauth-state.ts` DAN `rate-limit.ts` (sama-sama in-memory Map) tidak
  pernah membersihkan entry yang expired tapi tidak pernah dipakai (memory
  leak lambat) → `setInterval` cleanup tiap 5 menit di keduanya, `.unref()`
  supaya tidak menahan proses shutdown.
- `ACCURATE_TOKEN_ENCRYPTION_KEY` minLength 16 → 32 (key derivation scrypt
  lebih kuat dengan secret masukan lebih panjang).

**Ketemu sendiri pas fixing (bukan dari audit)**: `lib/rate-limit.ts` masih
pakai pola lama `{data: null, error: {code}}` (lolos dari sweep ADR-0010
sebelumnya karena bukan di folder `routes/`) — diperbaiki jadi bare `{code}`
sekalian.

**Pencegahan:** Kalau nambah field baru yang mengubah precondition user
lama (mis. `requireEmailVerification` di tengah jalan), CEK user test/seed
yang sudah ada — akun `admin@facport.test`/`customer@facport.test` dari
Fase 00 sempat ke-lock out karena `emailVerified=false` (dibuat sebelum
field ini di-enforce). Fix manual via SQL untuk akun test, tapi di
production butuh strategi migrasi eksplisit (backfill `emailVerified=true`
untuk user existing sebelum enable, ATAU terima bahwa mereka perlu re-verify).

---

## 2026-08-19 — Elysia `onError` memaksa 500 untuk SEMUA error non-NOT_FOUND, termasuk VALIDATION
**Masalah:** `app.ts` awal punya `set.status = code === "NOT_FOUND" ? 404 : 500;`
di `.onError()` — ini menimpa status yang SUDAH benar diset Elysia sendiri
untuk error `VALIDATION`/`PARSE` (seharusnya 422/400), jadi SEMUA request
dengan body/query tidak valid balik 500 alih-alih 400/422, di SETIAP route,
bukan cuma satu tempat.
**Root cause:** Nulis default `set.status = ... : 500` tanpa cek dulu status
apa yang Elysia sudah tetapkan untuk tiap `code` — asumsi "semua error
selain NOT_FOUND itu internal server error" salah, VALIDATION/PARSE itu
client error (400/422), bukan server error.
**Fix:** `onError` sekarang cabang eksplisit: VALIDATION/PARSE return body
tanpa override status (biarkan status Elysia asli), NOT_FOUND→404, sisanya
(genuinely unknown)→500 + Sentry.
**Pencegahan:** Ketemu sendiri pas nulis test negatif untuk
`POST /media/upload` (upload file tipe salah, expect ~400, malah dapat 500).
Kalau nulis `onError` custom di project lain, WAJIB cek dulu `code` apa saja
yang bisa muncul dari Elysia dan status default-nya masing-masing, jangan
kasih 1 angka default untuk semua kecuali satu.

---

## 2026-08-19 — Security review Fase 00: 1 Critical, 3 High ditemukan & diperbaiki; beberapa Medium/Low ditunda
**Konteks:** Subagent `security-auditor` diaudit terhadap kode Fase 00
(fondasi teknis, apps/api + apps/web). Ringkasan lengkap ada di
`docs/phases/phase-00-fondasi.md` § "Ringkasan Hasil".

**Sudah diperbaiki (Critical/High, WAJIB per SOP):**
- **Critical**: `GET /settings` tanpa guard sama sekali — bocorin semua row
  settings ke siapa pun tanpa login. Fix: tambah macro `auth: true` (lihat
  `lib/permission.ts`), plus test regresi.
- **High**: Endpoint Better Auth (`/api/auth/*`) tidak ada rate limiting,
  padahal `architecture-security.md` §7 mewajibkannya. Fix: `lib/rate-limit.ts`
  custom (in-memory sliding window) — package `elysia-rate-limit` di npm
  butuh Elysia ≥2.0 yang belum stabil untuk project ini.
- **High**: Guard permission itu opt-in per route (harus eksplisit dipasang),
  tidak ada mekanisme yang memaksa route baru declare guard-nya. Fix
  langsung: perbaiki route yang kelupaan + tambah test 401 untuk tiap
  endpoint protected. **Belum diimplementasi** (technical debt, lihat di
  bawah): mekanisme enforcement otomatis (lint rule/test yang enumerasi
  semua route dan gagal kalau ada yang tanpa guard eksplisit).

**Ditunda ke technical debt (Medium/Low, dicatat sesuai SOP):**
- Belum ada mekanisme OTOMATIS yang mencegah route baru lupa pasang
  `auth`/`permission` (di atas cuma fix manual + test manual per route yang
  sudah ada) — pertimbangkan lint rule custom atau test yang enumerasi
  `app.routes` dan assert tiap route punya salah satu macro, sebelum jumlah
  route bertambah banyak di Fase 01+.
- ~~Kebijakan serving MinIO (presigned URL vs bucket public-read) belum
  diputuskan~~ — **RESOLVED SEBAGIAN Fase 12 (2026-09-04), ADR-0017**: untuk
  kategori aset branding publik (logo/favicon company), dipakai bucket
  kedua `facport-public` (public-read) + host Caddy baru `media.<domain>`.
  Untuk kategori media PRIVAT (`POST /media/upload` → `facport-media`),
  gap ini **TETAP TERBUKA** — `storageKey` mentah masih dikembalikan,
  belum ada proxy/presign. Lihat § `architecture-storage.md` "Gap RESOLVED
  SEBAGIAN".
- `bun audit`/dependency scanning belum diverifikasi jalan di CI (infra,
  bukan kode — `.github/workflows/ci.yml` sudah ada langkahnya, tinggal
  pastikan benar-benar jalan pas PR pertama nanti).
- Password hashing pakai scrypt (default Better Auth), bukan Argon2id
  seperti disebut `architecture-security.md` §4 — didokumentasikan sebagai
  deviasi yang DITERIMA (bukan bug), lihat update di file itu.

**Catatan tambahan (bukan temuan security, tapi ketemu pas baca file yang
sama)**: subagent audit menandai satu blok teks di `apps/web/CLAUDE.md`
(mulai `<!-- BEGIN:nextjs-agent-rules -->`) sebagai KEMUNGKINAN prompt
injection karena isinya menyuruh baca dokumentasi tertentu. **Ini bukan
injection** — ini fitur asli Next.js 16 (`next dev` otomatis nambah blok
"agent rules" ke file `CLAUDE.md` terdekat, ada opsi `agentRules: false` di
`next.config` buat matiin). Sudah diverifikasi langsung: blok itu muncul
persis saat `bun run dev` pertama kali dijalankan di `apps/web` sesi ini,
bukan disisipkan dari sumber luar. Dicatat di sini supaya sesi berikutnya
tidak kaget/panik kalau lihat blok yang sama lagi setelah `next dev` jalan.

---

## 2026-09-05 — `usePermissions()` fetch `/me` sekali per mount, tidak refresh kalau role berubah live
**Masalah (Low, dari security-auditor Fase 26):** `PermissionsProvider`
(`apps/web/lib/use-permissions.tsx`) fetch `GET /me` SEKALI saat mount —
kalau admin lain mengubah role/permission user yang sedang login di tab
lain, `<Can>`/nav filter di tab yang masih terbuka tidak ikut update
sampai reload/login ulang. Backend tetap jadi penjaga sesungguhnya (403
kalau tetap diklik), jadi ini bukan celah keamanan, cuma UX stale-hint.
**Keputusan:** DITERIMA sebagai trade-off desain (fetch sekali per sesi,
bukan polling) — biaya refetch berkala/on-focus dianggap tidak sepadan
untuk skenario yang jarang terjadi (role admin yang sedang login diubah
paksa admin lain, real-time, di sesi yang sama).

**Masalah kedua (Low, sama laporan):** Nav item "Dashboard" tidak
permission-gated walau kontennya (`admin/(protected)/page.tsx`) fetch 2
data yang masing-masing digerbangi permission berbeda (`users.manage`
untuk stats, `audit.view` untuk audit log terbaru). Admin tanpa kedua
permission itu melihat dashboard dengan angka `"-"` semua — bukan error,
cuma placeholder kosong yang bisa membingungkan.
**Keputusan:** DITERIMA — kosmetik, bukan celah keamanan (fetch
server-side, backend tetap menolak diam-diam via `if (!res.ok) return
null`). Item "Dashboard" sengaja TIDAK diberi `permission` di nav karena
halaman itu sendiri tetap valid diakses (render partial), beda dari
kasus split-permission `subscriptions.manage`/`invoices.manage` yang
memang perlu disembunyikan total (fix di UI Fase 26 untuk
`ManageSubscriptionDialog` dan `searchUsers` di `CreateInvoiceDialog`).

---

## 2026-08-22 — Override breaking-change di `.releaserc.json` MASIH aktif walau sudah rilis v1.0.0
**Masalah:** `semantic-release` otomatis menetapkan rilis PERTAMA sebagai
`v1.0.0` (perilaku default-nya, bukan proses manual "loncat ke 1.0.0" yang
dijelaskan di `adr-0002-versioning-strategy.md`) — jadi override
`releaseRules: [{breaking:true, release:"minor"}]` di `.releaserc.json`
**belum sempat dihapus**, padahal app sekarang sudah `v1.0.1`. Kalau ada
commit `feat!:`/`BREAKING CHANGE:` sekarang, tetap dianggap MINOR bukan
MAJOR — melanggar ekspektasi semver untuk konsumen API.
**Pencegahan:** Sebelum commit breaking change berikutnya, hapus override
`releaseRules` itu dari `.releaserc.json` (lihat langkah 2 di
`docs/decisions/adr-0002-versioning-strategy.md`).

**✅ RESOLVED 2026-09-12** — override akhirnya dihapus (bukan pas `v1.0.0`
dulu, telat ~28 rilis) bersamaan lompatan manual ke `v2.0.0`. Lihat entri
2026-09-12 di atas & `docs/decisions/adr-0002-versioning-strategy.md` §
"Update 2026-09-12".

---

<!-- Tambahkan entri baru di atas, urut dari terbaru ke terlama -->
