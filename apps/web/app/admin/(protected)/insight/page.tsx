"use client";

import { Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { PageHeader } from "@/components/ui/page-header";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { INSIGHT_TABS, parseTab, type InsightTab } from "@/lib/insights";
import { SummaryTab } from "@/components/admin/insight/summary-tab";
import { CustomersTab } from "@/components/admin/insight/customers-tab";

// § Fase 189D — halaman Insight admin. Tab dari `?tab=` (dapat di-bookmark; nilai tak dikenal → ringkasan). Hanya tab aktif yang dirender/memuat data.
function TabBody({ tab }: { tab: InsightTab }) {
  if (tab === "ringkasan") return <SummaryTab />;
  if (tab === "pelanggan") return <CustomersTab mode="pelanggan" />;
  if (tab === "akses") return <CustomersTab mode="akses" />;
  return <p className="text-sm text-muted-foreground">Segera hadir.</p>;
}

function InsightContent() {
  const router = useRouter();
  const params = useSearchParams();
  const tab = parseTab(params.get("tab"));

  return (
    <div className="space-y-6">
      <PageHeader title="Insight" description="Data pelanggan, fitur, akses, langganan, tren, dan riwayat koneksi." />
      <Tabs value={tab} onValueChange={(next) => router.replace(`/insight?tab=${next}`)}>
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
