import { AuthLayout } from "@/components/auth/auth-layout";
import { InviteAcceptForm } from "@/components/data-usaha/invite-accept-form";

// § Fase 110, architecture-user-tambahan.md — halaman PUBLIK terima
// undangan "User Tambahan", pola SAMA `/login`/`/register` (di LUAR grup
// `(protected)`, TANPA auth check — endpoint publik di baliknya sendiri
// yang jaga validitas token, § routes/invites.route.ts).
export default async function InvitePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;

  return (
    <AuthLayout title="Undangan Facport" subtitle="Terima undangan untuk mulai pakai fitur yang dibagikan ke kamu.">
      <InviteAcceptForm token={token} />
    </AuthLayout>
  );
}
