import Link from "next/link";
import { headers } from "next/headers";
import { PackageSearch } from "lucide-react";
import { EmptyState } from "@/components/ui/empty-state";
import { buttonVariants } from "@/components/ui/button";
import { getActiveDataUsahaIdCookie } from "@/lib/active-data-usaha";
import type { ConverterType, ConverterCtxBase } from "@/lib/converter/converter-type";
import { ConverterTypeView } from "./converter-type-view";

// § Fase 151-152, ADR-0038 — Server Component GENERIK dipakai SETIAP `app/app/(protected)/konverter/{tipe}/page.tsx`
// (16 total, dibangun bertahap) — SATU tempat gerbang subscription (§ alasan lengkap di komentar `page.tsx`
// requisition pertama kali ditulis, Fase 151: proses Konverter 100% client-side, jadi TIDAK ada 403 server yang
// otomatis menahan preview kalau page-level tidak menahan duluan — BEDA dari halaman import Facport manapun).
// Sengaja diekstrak jadi 1 component di sini SETELAH tipe ke-3 (`journal-voucher`) supaya TIDAK menduplikasi
// boilerplate fetch+filter yang IDENTIK di 16 file `page.tsx` — tiap `page.tsx` sekarang cuma 3 baris.
export async function KonverterPage<TCtx extends ConverterCtxBase>({ type }: { type: ConverterType<TCtx> }) {
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
  const subscribed = subJson.subscriptions.some((s) => s.subscription.dataUsahaId === dataUsahaId && s.plan.modules.includes(type.key));

  if (!subscribed) {
    return (
      <EmptyState
        icon={PackageSearch}
        title="Belum berlangganan Varian ini"
        description={`Aktifkan ${type.label} Konverter dulu untuk mulai konversi Excel ke XML.`}
        action={
          <Link href="/subscribe" className={buttonVariants("default")}>
            Lihat Paket
          </Link>
        }
      />
    );
  }

  return <ConverterTypeView type={type} />;
}
