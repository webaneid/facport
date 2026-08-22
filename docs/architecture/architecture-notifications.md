# Architecture — Notifications (Email)

> WhatsApp tidak dipakai di project ini (checklist Kebutuhan Komponen =
> Tidak) — section WhatsApp di bawah dihapus, cuma Email yang relevan.

## Prinsip Umum
Semua notifikasi keluar (email, WA) **WAJIB lewat queue** (§
`architecture-jobs.md`), tidak pernah dikirim sinkron di request handler —
provider notifikasi bisa lambat/down, dan itu tidak boleh bikin request user
ikut lambat/gagal.

**✅ Email verifikasi akun JUGA lewat queue** (diperbaiki 2026-08-22,
sempat jadi pengecualian sinkron saat draf awal dokumen ini) —
`apps/api/src/lib/auth.ts`, callback `sendVerificationEmail` Better Auth,
sekarang `boss.send(JOBS.SEND_EMAIL, {...})`, bukan panggil `sendEmail()`
langsung. Konsekuensi: signup TIDAK ikut lambat/gagal kalau Resend lagi
lambat/down — worker yang proses pengiriman beneran di belakang layar.
`startQueue()` dipanggil eksplisit di titik enqueue ini juga (idempotent)
supaya test (`app.handle()` langsung, tidak boot `index.ts`) tetap bisa
enqueue tanpa error "Database not opened".

## 1. Email — Tool: Resend
**Kenapa Resend** (bukan SendGrid/Postmark/SMTP manual): DX modern (API
simpel, dashboard jelas), free tier cukup generous untuk skala awal, dan
tidak perlu maintain server SMTP sendiri (self-hosted mail server itu beban
ops besar — reputasi domain/deliverability susah dijaga sendiri, DKIM/SPF/DMARC
salah setup dikit langsung masuk spam).

**Kondisi SEKARANG (bukan target akhir)** — wrapper minimal, `{to, subject,
html}` langsung, TANPA sistem template:
```ts
// apps/api/src/lib/email.ts
import { Resend } from "resend";
import { env } from "./env";

const resend = env.RESEND_API_KEY ? new Resend(env.RESEND_API_KEY) : null;

export async function sendEmail({ to, subject, html }: { to: string; subject: string; html: string }) {
  if (!resend) {
    // RESEND_API_KEY kosong = no-op + log (aman untuk dev lokal, § architecture-observability.md)
    return;
  }
  await resend.emails.send({ from: env.EMAIL_FROM ?? "noreply@localhost.test", to, subject, html });
}
```
Dipilih minimal karena belum ada fitur notifikasi konkret yang butuh
template nyata (baru dipakai untuk email verifikasi akun, HTML-nya
inline langsung di `auth.ts`).

### Template Email — TARGET, BELUM DIBANGUN
Folder `apps/api/src/emails/*.tsx` **BELUM ADA** di kode. Rencana kalau
nanti ada fitur yang butuh template nyata (mis. notifikasi hasil import
batch): pindah ke pola `sendEmail({ to, template, data })` +
`renderEmailTemplate()`, pakai React Email (`@react-email/components`) —
reusable component, bisa preview visual (`bunx react-email dev`), hasil
akhir tetap HTML biasa (kompatibel semua email client). **JANGAN
implementasikan struktur ini sampai template pertama benar-benar
dibutuhkan** — YAGNI, `email.ts` sekarang sudah cukup untuk kebutuhan
saat ini (cuma email verifikasi).

### Env
```
RESEND_API_KEY=
EMAIL_FROM=noreply@namadomain.com
```

## Idempotency & Retry
Notifikasi dikirim lewat job queue (§ `architecture-jobs.md`) yang otomatis
retry kalau gagal — WAJIB pastikan job **idempotent** (kirim ulang job yang
sama tidak boleh double-send ke user), pakai `idempotencyKey` unik per
notifikasi (mis. `"post-published:{postId}:{userId}"`) supaya `pg-boss` tidak
proses job yang sama 2x kalau ada retry/duplikat.

## Referensi
- Semua notifikasi lewat queue → `docs/architecture/architecture-jobs.md`
