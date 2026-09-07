import Link from "next/link";
import { RegisterForm } from "@/components/auth/register-form";
import { AuthLayout } from "@/components/auth/auth-layout";

// § Fase 48 — sama alasannya `app/login/page.tsx`: teruskan `redirect`
// ke link "Login" juga, buat kasus user berubah pikiran/sudah pernah
// daftar sebelumnya dari halaman ini.
export default async function RegisterPage({
  searchParams,
}: {
  searchParams: Promise<{ redirect?: string }>;
}) {
  const { redirect } = await searchParams;
  const loginHref = redirect ? `/login?redirect=${encodeURIComponent(redirect)}` : "/login";

  return (
    <AuthLayout
      title="Buat akun Facport"
      subtitle="Mulai import transaksi ke Accurate Online."
      footer={
        <>
          Sudah punya akun?{" "}
          <Link href={loginHref} className="font-medium text-primary-600 hover:text-primary-700">
            Login
          </Link>
        </>
      }
    >
      <RegisterForm />
    </AuthLayout>
  );
}
