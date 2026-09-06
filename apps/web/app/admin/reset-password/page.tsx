import { ResetPasswordForm } from "@/components/auth/reset-password-form";

export default function AdminResetPasswordPage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 p-8">
      <h1 className="text-xl font-semibold">Atur Password Baru</h1>
      <ResetPasswordForm />
    </main>
  );
}
