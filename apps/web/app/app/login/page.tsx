import Link from "next/link";
import { LoginForm } from "@/components/auth/login-form";

export default function AppLoginPage() {
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
          <Link href="/register" className="font-medium text-primary-600 hover:text-primary-700">
            Daftar
          </Link>
        </p>
      </div>
    </main>
  );
}
