import Link from "next/link";
import { ForgotPasswordForm } from "@/components/auth/forgot-password-form";
import { AuthLayout } from "@/components/auth/auth-layout";

export default function AppForgotPasswordPage() {
  return (
    <AuthLayout
      title="Lupa Password"
      subtitle="Masukkan email kamu, kami kirim link untuk atur password baru."
      footer={
        <>
          Ingat password?{" "}
          <Link href="/login" className="font-medium text-primary-600 hover:text-primary-700">
            Login
          </Link>
        </>
      }
    >
      <ForgotPasswordForm />
    </AuthLayout>
  );
}
