import Link from "next/link";
import { LoginForm } from "@/components/auth/login-form";
import { AuthLayout } from "@/components/auth/auth-layout";

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
    <AuthLayout
      title="Masuk ke akun kamu"
      subtitle="Kelola import transaksi ke Accurate Online."
      footer={
        <>
          Belum punya akun?{" "}
          <Link href={registerHref} className="font-medium text-primary-600 hover:text-primary-700">
            Daftar
          </Link>
        </>
      }
    >
      <LoginForm />
    </AuthLayout>
  );
}
