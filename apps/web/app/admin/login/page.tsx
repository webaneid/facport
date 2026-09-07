import { LoginForm } from "@/components/auth/login-form";
import { AuthLayout } from "@/components/auth/auth-layout";

export default function AdminLoginPage() {
  return (
    <AuthLayout title="Login Admin" subtitle="Kelola paket, pengguna, dan pengumuman Facport.">
      <LoginForm />
    </AuthLayout>
  );
}
