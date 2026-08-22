import { Resend } from "resend";
import { env } from "./env";
import { logger } from "./logger";

// § architecture-notifications.md. Wrapper MINIMAL untuk Fase 00 (foundation
// saja) — {to, subject, html} langsung, BELUM pakai React Email template
// (apps/api/src/emails/*.tsx) karena belum ada fitur notifikasi konkret yang
// butuh template nyata. Ganti ke pola `sendEmail({ to, template, data })` +
// renderEmailTemplate() begitu template pertama dibutuhkan (mis. notifikasi
// hasil import batch, Fase 02+).
const resend = env.RESEND_API_KEY ? new Resend(env.RESEND_API_KEY) : null;

export async function sendEmail({
  to,
  subject,
  html,
}: {
  to: string;
  subject: string;
  html: string;
}) {
  if (!resend) {
    // Kosong = disabled, aman untuk dev lokal (§ architecture-observability.md).
    // `html` DIIKUTKAN di log (bukan cuma to/subject) — dev butuh lihat isi
    // link verifikasi email/dst tanpa RESEND_API_KEY asli.
    logger.warn({ to, subject, html }, "RESEND_API_KEY kosong — email TIDAK dikirim (dev no-op)");
    return;
  }
  await resend.emails.send({
    from: env.EMAIL_FROM ?? "noreply@localhost.test",
    to,
    subject,
    html,
  });
}
