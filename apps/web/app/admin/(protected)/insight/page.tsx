"use client";

import { Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { PageHeader } from "@/components/ui/page-header";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { usePermissions } from "@/lib/use-permissions";
import { Alert } from "@/components/ui/alert";
import { INSIGHT_TABS, parseTab, type InsightTab } from "@/lib/insights";
import { SummaryTab } from "@/components/admin/insight/summary-tab";
import { CustomersTab } from "@/components/admin/insight/customers-tab";
import { FeaturesTab } from "@/components/admin/insight/features-tab";
import { SubscriptionsTab } from "@/components/admin/insight/subscriptions-tab";
import { TrendTab } from "@/components/admin/insight/trend-tab";
import { ConnectionTab } from "@/components/admin/insight/connection-tab";

// § Fase 189D — halaman Insight admin. Tab dari `?tab=` (dapat di-bookmark; nilai tak dikenal → ringkasan). Hanya tab aktif yang dirender/memuat data.
function TabBody({ tab }: { tab: InsightTab }) {
  if (tab === "ringkasan") return <SummaryTab />;
  if (tab === "pelanggan") return <CustomersTab mode="pelanggan" />;
  if (tab === "akses") return <CustomersTab mode="akses" />;
  if (tab === "fitur") return <FeaturesTab />;
  if (tab === "langganan") return <SubscriptionsTab />;
  if (tab === "tren") return <TrendTab />;
  return <ConnectionTab />;
}

function InsightContent() {
  const router = useRouter();
  const params = useSearchParams();
  const tab = parseTab(params.get("tab"));
  // Menu sudah disaring izin, tetapi URL bisa dibuka langsung: tanpa `insights.view` jangan render tab (API tetap menolak 403).
  const allowed = usePermissions().includes("insights.view");
  if (!allowed) {
    return (
      <div className="space-y-6">
        <PageHeader title="Insight" />
        <Alert variant="warning">Anda tidak punya izin untuk membuka halaman Insight.</Alert>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader title="Insight" description="Data pelanggan, fitur, akses, langganan, tren, dan riwayat koneksi." />
      <Tabs value={tab} onValueChange={(next) => router.replace(`/insight?tab=${parseTab(next)}`)}>
        <TabsList className="flex h-auto flex-wrap justify-start">
          {INSIGHT_TABS.map((t) => (
            <TabsTrigger key={t.key} value={t.key}>
              {t.label}
            </TabsTrigger>
          ))}
        </TabsList>
        <TabsContent value={tab}>
          <TabBody tab={tab} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

export default function AdminInsightPage() {
  return (
    <Suspense fallback={null}>
      <InsightContent />
    </Suspense>
  );
}
