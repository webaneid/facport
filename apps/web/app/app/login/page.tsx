import Link from "next/link";
import { LoginForm } from "@/components/auth/login-form";

// § Fase 48 — `redirect` (dibawa dari landing, § module-features.tsx)
// WAJIB diteruskan ke link "Daftar" juga, bukan cuma dipakai LoginForm
// sendiri — user yang klik paket TAPI belum punya akun perlu jalur ini
// supaya `register-form.tsx` juga tahu ke mana ngarahin setelah
// verifikasi email (§ Keputusan Kecil: TIDAK divalidasi ulang di sini,
// `getSafeRedirect()` di kedua form client yang jadi garis pertahanan
// sebenarnya — di sini cuma diteruskan APA ADANYA sebagai query string).
export default async function AppLoginPage({
  searchParams,
}: {
  searchParams: Promise<{ redirect?: string }>;
}) {
  const { redirect } = await searchParams;
  const registerHref = redirect ? `/register?redirect=${encodeURIComponent(redirect)}` : "/register";

  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-6">
      <div className="flex w-full max-w-sm flex-col items-center gap-6">
        <Link href="/" className="text-2xl font-bold tracking-tight text-primary-700">
          Facport
        </Link>
        <div className="w-full rounded-xl border border-border/60 bg-background p-8 shadow-[var(--shadow-elevated)]">
          <div className="mb-6 flex flex-col gap-1 text-center">
            <h1 className="text-lg font-semibold text-foreground">Masuk ke akun kamu</h1>
            <p className="text-sm text-muted-foreground">Kelola import Faktur Pembelian ke Accurate Online.</p>
          </div>
          <LoginForm />
        </div>
        <p className="text-sm text-muted-foreground">
          Belum punya akun?{" "}
          <Link href={registerHref} className="font-medium text-primary-600 hover:text-primary-700">
            Daftar
          </Link>
        </p>
      </div>
    </main>
  );
}
