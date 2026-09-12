import { AuthLayout } from "@/components/auth/auth-layout";
import { TransferAcceptForm } from "@/components/data-usaha/transfer-accept-form";

// § Fase 111, architecture-user-tambahan.md — halaman PUBLIK terima
// transfer kepemilikan Data Usaha, pola SAMA `/invite/[token]` (Fase 110,
// di LUAR grup `(protected)`, TANPA auth check — endpoint publik di
// baliknya sendiri yang jaga validitas token, § routes/transfers.route.ts).
export default async function TransferPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;

  return (
    <AuthLayout title="Transfer Kepemilikan Facport" subtitle="Terima kepemilikan Data Usaha yang dipindahkan ke kamu.">
      <TransferAcceptForm token={token} />
    </AuthLayout>
  );
}
