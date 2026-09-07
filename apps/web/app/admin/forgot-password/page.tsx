import { ForgotPasswordForm } from "@/components/auth/forgot-password-form";
import { AuthLayout } from "@/components/auth/auth-layout";

export default function AdminForgotPasswordPage() {
  return (
    <AuthLayout title="Lupa Password" subtitle="Masukkan email kamu, kami kirim link untuk atur password baru.">
      <ForgotPasswordForm />
    </AuthLayout>
  );
}
