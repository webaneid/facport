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
  // § security review 2026-09-04 (Medium) — email yang isinya SECRET
  // NYATA (password sementara, dst — beda dari link verifikasi yang
  // nilai kredensialnya nol) WAJIB set ini `true`. Efeknya CUMA di
  // fallback dev-no-op di bawah (`html` TIDAK ikut di-log) — pengiriman
  // sungguhan via Resend TIDAK terpengaruh sama sekali.
  sensitive,
}: {
  to: string;
  subject: string;
  html: string;
  sensitive?: boolean;
}) {
  if (!resend) {
    if (sensitive) {
      // `html` SENGAJA tidak diikutkan — mengandung secret nyata (mis.
      // password sementara user baru), JANGAN pernah masuk log terstruktur
      // (§ architecture-security.md §10 — "JANGAN pernah log password").
      logger.warn({ to, subject }, "RESEND_API_KEY kosong — email SENSITIF tidak dikirim (dev no-op, isi TIDAK di-log)");
    } else {
      // Kosong = disabled, aman untuk dev lokal (§ architecture-observability.md).
      // `html` DIIKUTKAN di log (bukan cuma to/subject) — dev butuh lihat isi
      // link verifikasi email/dst tanpa RESEND_API_KEY asli.
      logger.warn({ to, subject, html }, "RESEND_API_KEY kosong — email TIDAK dikirim (dev no-op)");
    }
    return;
  }
  await resend.emails.send({
    from: env.EMAIL_FROM ?? "noreply@localhost.test",
    to,
    subject,
    html,
  });
}

// § security review 2026-09-04 (Medium) — dipakai sebelum interpolasi
// string user-controlled (mis. nama yang admin input) ke HTML email,
// cegah markup/link palsu disisipkan ke email "resmi" Facport.
export function escapeHtml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}
