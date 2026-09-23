import Link from "next/link";
import { headers } from "next/headers";
import { PackageSearch } from "lucide-react";
import { EmptyState } from "@/components/ui/empty-state";
import { buttonVariants } from "@/components/ui/button";
import { getActiveDataUsahaIdCookie } from "@/lib/active-data-usaha";
import { ConverterTypeView } from "@/components/converter/converter-type-view";
import { requisitionType } from "@/lib/converter/types/requisition";

// § Fase 151, ADR-0038 — Server Component tipis, pola SAMA `import/arsip/page.tsx` (fetch sendiri, bukan thread
// context dari `(protected)/layout.tsx`). GERBANG KHUSUS Konverter yang TIDAK ada presedennya di halaman import
// Facport manapun: proses Excel→XML di halaman ini 100% CLIENT-SIDE, jadi kalau TIDAK dicek di sini, user yang
// login tapi TIDAK subscribe Varian ini tetap bisa lihat SELURUH hasil konversi (pratinjau XML) tanpa panggilan
// server sama sekali — cuma tombol Download yang kena gerbang server (`POST /me/conversion-logs`). Halaman
// Facport aman TANPA gerbang page-level karena pemrosesan sungguhan selalu di server (upload/confirm API 403
// duluan) — Konverter TIDAK punya lapis itu, jadi page-level check WAJIB ADA di sini, bukan opsional.
export default async function KonverterRequisitionPage() {
  const dataUsahaId = await getActiveDataUsahaIdCookie();
  if (!dataUsahaId) {
    return <EmptyState icon={PackageSearch} title="Pilih Data Usaha dulu" description="Kembali ke gerbang pemilihan Data Usaha." />;
  }

  const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";
  const cookie = (await headers()).get("cookie") ?? "";
  const subRes = await fetch(`${apiUrl}/me/subscriptions`, { headers: { cookie }, cache: "no-store" });
  const subJson = subRes.ok
    ? ((await subRes.json()) as { subscriptions: { subscription: { dataUsahaId: string }; plan: { modules: string[] } }[] })
    : { subscriptions: [] };
  const subscribed = subJson.subscriptions.some(
    (s) => s.subscription.dataUsahaId === dataUsahaId && s.plan.modules.includes(requisitionType.key),
  );

  if (!subscribed) {
    return (
      <EmptyState
        icon={PackageSearch}
        title="Belum berlangganan Varian ini"
        description="Aktifkan Permintaan Barang (Requisition) Konverter dulu untuk mulai konversi Excel ke XML."
        action={
          <Link href="/subscribe" className={buttonVariants("default")}>
            Lihat Paket
          </Link>
        }
      />
    );
  }

  return <ConverterTypeView type={requisitionType} />;
}
