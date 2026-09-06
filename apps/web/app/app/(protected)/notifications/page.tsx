"use client";

import { useEffect, useState } from "react";
import { Bell } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { Pagination } from "@/components/ui/pagination";
import { Skeleton } from "@/components/ui/skeleton";
import { NotificationList, type NotificationRow } from "@/components/notifications/notification-list";
import { api } from "@/lib/api-client";
import { useCompanyTimezone } from "@/components/company-timezone-provider";

const PAGE_SIZE = 20;

// § Fase 45 — arsip penuh notifikasi customer, dibuka lewat "Lihat semua"
// di dropdown lonceng (§ notification-bell.tsx) — pola sama
// `import/arsip/page.tsx` (Fase 41).
export default function NotificationsArchivePage() {
  const companyTimezone = useCompanyTimezone();
  const [notifications, setNotifications] = useState<NotificationRow[] | null>(null);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);

  async function load() {
    const res = await api.me.notifications.get({ query: { limit: PAGE_SIZE, offset: page * PAGE_SIZE } });
    if (res.data) {
      const data = res.data as unknown as { notifications: NotificationRow[]; total: number };
      setNotifications(data.notifications);
      setTotal(data.total);
    }
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch awal + tiap ganti halaman, pola standar
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page]);

  async function handleItemClick(notif: NotificationRow) {
    if (notif.isRead) return;
    await api.me.notifications({ id: notif.id }).read.patch();
    setNotifications((prev) => prev?.map((n) => (n.id === notif.id ? { ...n, isRead: true } : n)) ?? prev);
  }

  async function handleMarkAllRead() {
    await api.me.notifications["read-all"].post();
    setNotifications((prev) => prev?.map((n) => ({ ...n, isRead: true })) ?? prev);
  }

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const hasUnread = notifications?.some((n) => !n.isRead) ?? false;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Notifikasi"
        description="Semua notifikasi kamu, dari langganan, trial, sampai pembayaran."
        action={
          hasUnread ? (
            <Button variant="outline" onClick={handleMarkAllRead}>
              Tandai semua dibaca
            </Button>
          ) : undefined
        }
      />

      <Card>
        <CardHeader>
          <CardTitle>Riwayat</CardTitle>
          <CardDescription>{total} notifikasi total.</CardDescription>
        </CardHeader>
        <CardContent>
          {!notifications ? (
            <Skeleton className="h-40 w-full" />
          ) : notifications.length === 0 ? (
            <EmptyState icon={Bell} title="Belum ada notifikasi" />
          ) : (
            <>
              <NotificationList notifications={notifications} surface="app" timezone={companyTimezone} onItemClick={handleItemClick} />
              <Pagination page={page} totalPages={totalPages} onPageChange={setPage} className="mt-4" />
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
