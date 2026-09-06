import { ForgotPasswordForm } from "@/components/auth/forgot-password-form";

export default function AdminForgotPasswordPage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 p-8">
      <h1 className="text-xl font-semibold">Lupa Password</h1>
      <ForgotPasswordForm />
    </main>
  );
}
