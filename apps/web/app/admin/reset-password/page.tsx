import { ResetPasswordForm } from "@/components/auth/reset-password-form";
import { AuthLayout } from "@/components/auth/auth-layout";

export default function AdminResetPasswordPage() {
  return (
    <AuthLayout title="Atur Password Baru" subtitle="Pilih password baru yang kuat dan mudah kamu ingat.">
      <ResetPasswordForm />
    </AuthLayout>
  );
}
