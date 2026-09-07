import type { ReactNode } from "react";
import { FileSpreadsheet } from "lucide-react";

// § Redesain login/register/forgot-password/reset-password (2026-09-07,
// feedback user: "belum bikin login form yg asik") — SATU shell dipakai
// SEMUA 7 halaman auth (admin+app × login/register/forgot/reset), supaya
// user yang bolak-balik antar halaman ini lihat identitas visual yang
// sama, bukan cuma login yang dipercantik sementara yang lain dibiarkan
// polos. Split-screen di desktop (panel kiri branding, kanan form),
// WAJIB collapse jadi 1 kolom di mobile (`hidden lg:flex` panel kiri) —
// ditekankan eksplisit oleh user, bukan opsional.
export function AuthLayout({
  title,
  subtitle,
  children,
  footer,
}: {
  title: string;
  subtitle: string;
  children: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <main className="grid min-h-screen lg:grid-cols-2">
      <div className="relative hidden overflow-hidden bg-gradient-to-br from-primary-700 via-primary-600 to-primary-900 lg:flex lg:flex-col lg:justify-between lg:p-12">
        <div className="pointer-events-none absolute -left-24 -top-24 h-72 w-72 rounded-full bg-white/10 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-32 -right-16 h-96 w-96 rounded-full bg-white/10 blur-3xl" />

        <div className="relative flex items-center gap-2.5 text-white">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/15">
            <FileSpreadsheet className="h-5 w-5" />
          </div>
          <span className="text-lg font-bold tracking-tight">Facport</span>
        </div>

        <div className="relative flex flex-col gap-4 text-white">
          <h2 className="max-w-md text-3xl font-extrabold leading-tight text-balance">
            Import Excel ke Accurate Online, secepat klik.
          </h2>
          <p className="max-w-sm text-sm text-white/70">
            Otomatiskan ribuan transaksi tanpa input manual — bebas human error, hemat waktu kerja tim finance kamu.
          </p>
        </div>

        <p className="relative text-xs text-white/50">FAC Institute</p>
      </div>

      <div className="flex flex-col items-center justify-center p-6 sm:p-10">
        <div className="flex w-full max-w-sm flex-col gap-6">
          <div className="flex flex-col items-center gap-2 text-center lg:hidden">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary-600 text-white">
              <FileSpreadsheet className="h-5 w-5" />
            </div>
            <span className="text-lg font-bold tracking-tight text-primary-700">Facport</span>
          </div>

          <div className="w-full rounded-2xl border border-border/60 bg-background p-6 shadow-[var(--shadow-elevated)] sm:p-8">
            <div className="mb-6 flex flex-col gap-1 text-center">
              <h1 className="text-lg font-semibold text-foreground">{title}</h1>
              <p className="text-sm text-muted-foreground">{subtitle}</p>
            </div>
            {children}
          </div>

          {footer && <p className="text-center text-sm text-muted-foreground">{footer}</p>}
        </div>
      </div>
    </main>
  );
}
