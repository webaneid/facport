# Onboarding Domain Baru di VPS Shared (Server Nyata)

> Dokumen ini beda dari `docs/deployment-server-setup.md` — file itu
> nulis skenario "VPS BARU, dedicated, pakai Caddy" (belum pernah benar-benar
> dipakai persis begitu). Dokumen INI nulis apa yang **BENERAN terjadi**
> di server production kita (`wasugi@76.13.18.136`, domain `ane.web.id`)
> per 2026-09-04 — dipakai lagi kapan pun mau nambah domain/instance baru
> ke VPS yang SAMA.

## Realita Server Ini (Baca Dulu Sebelum Mulai)
- **VPS ini SHARED** — bukan didedikasikan buat 1 project. Sudah ada
  beberapa project lain jalan di server yang sama: `jalamandala-*`,
  `tokoambu`, `storage-forbis`, situs di `webane.com`/`admin.webane.com`,
  dst. Tiap project = compose project sendiri (`-p <nama>`), direktori
  sendiri di `/opt/<nama>` (facport pakai `/opt/app`).
- **Reverse proxy SESUNGGUHNYA = nginx yang sudah ada duluan di server**,
  BUKAN Caddy. Service `caddy` di `docker-compose.prod.yml` **TIDAK PERNAH
  dipakai** — network `edge` yang dia butuhkan sengaja tidak pernah
  dibuat, container `caddy` tidak pernah ada di `docker ps` server ini.
  **JANGAN masukkan `caddy` ke command `up -d` apa pun di server ini.**
- Tiap domain/subdomain = 1 file terpisah di `/etc/nginx/sites-available/`
  (di-symlink ke `sites-enabled/`), SSL per-domain via `certbot --nginx`.
- Port host (`127.0.0.1:PORT`) untuk tiap service (`web`/`api`/`minio`,
  dst) **HARUS unik lintas SEMUA project di VPS ini** — port `9000` misalnya
  SUDAH dipakai container minio project lain, ketemu nyata pas provisioning
  fitur branding Fase 12 (2026-09-04).
- `docker-compose.override.yml` (port mapping ke nginx) **cuma ada di
  server, TIDAK di-commit ke repo** — file lokal per-instance.

## Prasyarat
- Akses SSH ke `wasugi@76.13.18.136` dengan hak `sudo`.
- Nama domain baru sudah dibeli & bisa diarahkan A record-nya.
- Tahu port apa saja yang SUDAH dipakai project lain (lihat Langkah 1).

## Langkah 1 — Cek Port yang Sudah Dipakai
**JANGAN tebak port bebas** — cek dulu, lintas SEMUA project:
```bash
docker ps --format "table {{.Names}}\t{{.Ports}}"
```
Catat semua `127.0.0.1:XXXX` yang sudah tampil. Pilih port BARU yang
belum ada di daftar itu untuk `web`/`api`/`minio` instance baru (pola
penomoran yang sudah dipakai facport: `3020`=web, `3021`=api,
`9002`=minio — instance baru pakai angka lain, mis. `3030`/`3031`/`9010`).

## Langkah 2 — Direktori & File Project Baru
```bash
sudo mkdir -p /opt/<nama-project-baru>
sudo chown $USER:$USER /opt/<nama-project-baru>
cd /opt/<nama-project-baru>
```
Copy dari repo (dari komputer lokal):
```bash
scp docker-compose.prod.yml user@76.13.18.136:/opt/<nama-project-baru>/
scp .env.production.example user@76.13.18.136:/opt/<nama-project-baru>/.env.production
```
**JANGAN copy `Caddyfile`** — tidak dipakai di VPS ini (§ "Realita Server Ini").

## Langkah 3 — Isi `.env.production`
Edit `.env.production` di server, isi nilai **BARU dan UNIK** untuk instance
ini (jangan pernah reuse punya `ane.web.id`):
- `DB_USER`/`DB_PASSWORD`/`DB_NAME` — DB terpisah (Postgres SATU container
  per compose project, jadi otomatis terisolasi selama `DB_NAME` beda).
- `MINIO_ACCESS_KEY`/`MINIO_SECRET_KEY` — generate baru, jangan reuse.
- `BETTER_AUTH_SECRET`, `ACCURATE_TOKEN_ENCRYPTION_KEY` — generate baru
  (`openssl rand -base64 32`), JANGAN reuse punya instance lain.
- `NEXT_PUBLIC_API_URL`, `NEXT_PUBLIC_APP_URL`, `WEB_ORIGINS_PROD`,
  `APP_ORIGIN_PROD`, `COOKIE_DOMAIN`, `ACCURATE_REDIRECT_URI` — sesuaikan
  ke domain BARU.
- `MINIO_PUBLIC_URL` — isi belakangan di Langkah 8 (butuh subdomain media
  sudah siap dulu).

## Langkah 4 — `docker-compose.override.yml` (Port Mapping)
**Pola anti-gagal** — tulis SATU BARIS pakai flow-style YAML (hindari
heredoc/multi-line paste, gampang rusak indentasinya kalau di-copas dari
chat/terminal client tertentu — ketemu nyata 2026-09-04):
```bash
echo 'services: {web: {ports: ["127.0.0.1:PORT_WEB:3000"]}, api: {ports: ["127.0.0.1:PORT_API:3001"]}, minio: {ports: ["127.0.0.1:PORT_MINIO:9000"]}}' > /opt/<nama-project-baru>/docker-compose.override.yml
```
Ganti `PORT_WEB`/`PORT_API`/`PORT_MINIO` dengan port bebas dari Langkah 1.

Validasi SEBELUM lanjut:
```bash
cd /opt/<nama-project-baru>
docker compose -p <nama-project-baru> -f docker-compose.prod.yml -f docker-compose.override.yml --env-file .env.production config
```
Harus keluar YAML lengkap tanpa baris `yaml:`/error.

## Langkah 5 — Jalankan Container (SKIP `caddy`, sebut service eksplisit)
```bash
cd /opt/<nama-project-baru>
export GITHUB_REPO="webaneid/facport"
export IMAGE_TAG="vX.Y.Z"   # versi rilis terbaru, cek git tag/GHCR
echo "GITHUB_REPO=$GITHUB_REPO" > .env.deploy
echo "IMAGE_TAG=$IMAGE_TAG" >> .env.deploy
docker compose -p <nama-project-baru> -f docker-compose.prod.yml --env-file .env.production --env-file .env.deploy pull
docker compose -p <nama-project-baru> -f docker-compose.prod.yml -f docker-compose.override.yml --env-file .env.production --env-file .env.deploy up -d api web worker minio postgres
docker ps --format "table {{.Names}}\t{{.Status}}"
```

## Langkah 6 — Migration + Seed (DB Baru, Kosong)
```bash
docker exec -it <nama-project-baru>-api-1 bun run db:migrate
docker exec -it <nama-project-baru>-api-1 bun run db:seed
```

## Langkah 7 — nginx per Subdomain
Facport butuh 4 subdomain: `app.`, `admin.`, `api.`, dan (kalau pakai fitur
branding logo/favicon) `media.<domain-baru>`. Pola SATU BARIS per file
(hindari heredoc, sama alasan Langkah 4):
```bash
echo 'server { server_name app.<domain-baru>; listen 80; location / { proxy_pass http://127.0.0.1:PORT_WEB; proxy_http_version 1.1; proxy_set_header Upgrade $http_upgrade; proxy_set_header Connection "upgrade"; proxy_set_header Host $host; proxy_set_header X-Real-IP $remote_addr; proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for; proxy_set_header X-Forwarded-Proto $scheme; proxy_cache_bypass $http_upgrade; } }' | sudo tee /etc/nginx/sites-available/app.<domain-baru>
```
Ulangi pola sama untuk `admin.<domain-baru>` (proxy ke `PORT_WEB` juga —
1 aplikasi Next.js yang sama melayani admin+app+landing, dibedakan lewat
Host header, § `architecture-domain-routing.md`), `api.<domain-baru>`
(proxy ke `PORT_API`), dan `media.<domain-baru>` (proxy ke `PORT_MINIO`,
TANPA header `Upgrade`/`Connection` — bukan WebSocket, pola persis
`storage-forbis`).

Aktifkan semua:
```bash
sudo ln -s /etc/nginx/sites-available/app.<domain-baru> /etc/nginx/sites-enabled/
sudo ln -s /etc/nginx/sites-available/admin.<domain-baru> /etc/nginx/sites-enabled/
sudo ln -s /etc/nginx/sites-available/api.<domain-baru> /etc/nginx/sites-enabled/
sudo ln -s /etc/nginx/sites-available/media.<domain-baru> /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
```

## Langkah 8 — DNS
Di provider domain baru, buat A record untuk KEEMPAT subdomain, semua
mengarah ke `76.13.18.136`:
```
app.<domain-baru>     → 76.13.18.136
admin.<domain-baru>   → 76.13.18.136
api.<domain-baru>     → 76.13.18.136
media.<domain-baru>   → 76.13.18.136
```
Tunggu propagasi, cek per domain:
```bash
dig +short app.<domain-baru>
```

## Langkah 9 — SSL (Certbot)
Setelah DNS resolve, bisa sekaligus untuk semua subdomain:
```bash
sudo certbot --nginx -d app.<domain-baru> -d admin.<domain-baru> -d api.<domain-baru> -d media.<domain-baru>
```

## Langkah 10 — Lengkapi `MINIO_PUBLIC_URL` & Restart
```bash
echo 'MINIO_PUBLIC_URL=https://media.<domain-baru>' | sudo tee -a /opt/<nama-project-baru>/.env.production
cd /opt/<nama-project-baru>
docker compose -p <nama-project-baru> -f docker-compose.prod.yml -f docker-compose.override.yml --env-file .env.production --env-file .env.deploy up -d api web
```

## Langkah 11 — Verifikasi (Wajib)
```bash
curl -I https://app.<domain-baru>
curl -I https://api.<domain-baru>/health
curl -I https://media.<domain-baru>
docker ps --format "table {{.Names}}\t{{.Status}}"
```
Lalu buka `https://admin.<domain-baru>` di browser sungguhan, login,
coba upload logo/favicon, coba fitur import — jangan cuma percaya status
`healthy` (healthcheck internal container bisa OK walau port EXTERNAL
tidak ke-mapping, § `docs/lessons-learned.md` 2026-08-28).

## Kalau Cuma Ganti Domain (BUKAN Instance Baru)
Kalau maksudnya cuma pindah domain untuk container yang SAMA yang sudah
jalan (data/DB tetap dipakai, bukan mulai dari nol) — TIDAK perlu Langkah
1-6 (port/container/DB tetap), cukup:
1. Update `NEXT_PUBLIC_API_URL`/`NEXT_PUBLIC_APP_URL`/`WEB_ORIGINS_PROD`/
   `APP_ORIGIN_PROD`/`COOKIE_DOMAIN`/`ACCURATE_REDIRECT_URI` di
   `.env.production` ke domain baru.
2. Buat nginx server block BARU untuk domain baru (Langkah 7) yang proxy
   ke PORT YANG SAMA seperti domain lama (jangan ubah port).
3. DNS + certbot untuk domain baru (Langkah 8-9).
4. Restart `api`+`web` supaya baca `.env.production` yang baru (Langkah 10,
   command terakhir).
5. **Redirect Accurate OAuth** perlu diupdate juga di Accurate Developer
   Portal (`ACCURATE_REDIRECT_URI` baru harus didaftarkan ulang di sana),
   kalau tidak, koneksi Accurate existing customer bisa putus.
6. Domain LAMA boleh dimatikan (hapus nginx config + DNS) setelah
   dipastikan semua traffic sudah pindah, JANGAN buru-buru sebelum
   verifikasi domain baru 100% jalan.

## Gotcha yang Ketemu Nyata (Baca Sebelum Copy-Paste)
- **Copy-paste multi-line (heredoc/nano) dari chat ke terminal SSH
  gampang rusak** — indentasi YAML bisa ke-inject 2 spasi ekstra, atau 2
  heredoc dengan delimiter sama yang di-paste berdekatan bisa tercampur.
  **Solusi**: tulis config sebagai SATU BARIS (flow-style YAML untuk
  compose, single-line untuk nginx `server {...}`) dan jalankan
  command SATU PER SATU, tunggu prompt kembali sebelum lanjut.
- **`docker compose ... up -d` TANPA daftar service eksplisit SELALU
  GAGAL** di VPS ini (`network edge declared as external, but could not
  be found`) — service `caddy` butuh network yang sengaja tidak pernah
  dibuat. SELALU sebutkan service eksplisit, skip `caddy`.
- **SELALU sertakan KEDUA `-f`** (`docker-compose.prod.yml` DAN
  `docker-compose.override.yml`) di command `up -d` — Compose cuma
  auto-merge override kalau nama file compose utama default
  (`docker-compose.yml`), begitu `-f` dipakai eksplisit, override HARUS
  ikut disebut eksplisit juga.
- **Cek port bentrok LINTAS PROJECT dulu** (Langkah 1) — VPS ini shared,
  port yang "kelihatan aman" bisa saja sudah dipakai project lain.
- Output `docker compose config` menampilkan SEMUA secret dalam plaintext
  (password DB, MinIO keys, dst) — hati-hati sebelum paste ke mana pun.

## Referensi
- Kondisi server nyata & histori gotcha lengkap → `docs/lessons-learned.md`
  (cari entri tanggal 2026-08-27, 2026-08-28, 2026-08-31, 2026-09-04)
- Skenario VPS baru/dedicated (Caddy, belum pernah dipakai persis) →
  `docs/deployment-server-setup.md`
- Arsitektur deploy umum (registry, versioning, dua jalur staging/prod) →
  `docs/architecture/architecture-deployment.md`
