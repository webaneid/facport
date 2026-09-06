"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Bell } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { api } from "@/lib/api-client";
import { formatDate } from "@/lib/utils";
import { useCompanyTimezone } from "@/components/company-timezone-provider";
import { notificationLink } from "@/lib/notification-routes";
import type { Surface } from "@/components/app-shell/sidebar";

type Notification = {
  id: string;
  type: string;
  title: string;
  body: string;
  isRead: boolean;
  createdAt: string;
};

const PREVIEW_LIMIT = 7;
const POLL_INTERVAL_MS = 30_000;

// § Fase 45 — ganti tombol `disabled` di `topbar.tsx` (ADR-0024, sengaja
// UI-only sampai ada kebutuhan nyata). Dipakai SAMA di admin maupun app
// surface — `surface` prop menentukan link tujuan tiap notifikasi (§
// lib/notification-routes.ts) SAJA, bukan endpoint (notifikasi keyed by
// userId, endpoint sama untuk semua role).
export function NotificationBell({ surface }: { surface: Surface }) {
  const companyTimezone = useCompanyTimezone();
  const [open, setOpen] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const [items, setItems] = useState<Notification[] | null>(null);

  async function loadUnreadCount() {
    const res = await api.me.notifications["unread-count"].get();
    if (res.data) setUnreadCount((res.data as { count: number }).count);
  }

  async function loadPreview() {
    const res = await api.me.notifications.get({ query: { limit: PREVIEW_LIMIT } });
    if (res.data) setItems((res.data as unknown as { notifications: Notification[] }).notifications);
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- poll count awal + berkala, pola sama batch-detail pages
    loadUnreadCount();
    const interval = setInterval(loadUnreadCount, POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, []);

  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (next && items === null) loadPreview();
  }

  async function handleItemClick(notif: Notification) {
    if (!notif.isRead) {
      await api.me.notifications({ id: notif.id }).read.patch();
      setUnreadCount((c) => Math.max(0, c - 1));
      setItems((prev) => prev?.map((n) => (n.id === notif.id ? { ...n, isRead: true } : n)) ?? prev);
    }
  }

  async function handleMarkAllRead() {
    await api.me.notifications["read-all"].post();
    setUnreadCount(0);
    setItems((prev) => prev?.map((n) => ({ ...n, isRead: true })) ?? prev);
  }

  return (
    <DropdownMenu open={open} onOpenChange={handleOpenChange}>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          title="Notifikasi"
          className="relative hidden size-10 items-center justify-center rounded-xl border border-admin-line bg-white/70 text-admin-muted hover:bg-white sm:inline-flex"
          aria-label="Notifikasi"
        >
          <Bell className="size-4.5" />
          {unreadCount > 0 && (
            <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-medium text-white">
              {unreadCount > 99 ? "99+" : unreadCount}
            </span>
          )}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-80">
        <div className="flex items-center justify-between px-2 py-1.5">
          <DropdownMenuLabel className="p-0">Notifikasi</DropdownMenuLabel>
          {unreadCount > 0 && (
            <button type="button" onClick={handleMarkAllRead} className="text-xs text-primary-600 hover:underline">
              Tandai semua dibaca
            </button>
          )}
        </div>
        <DropdownMenuSeparator />
        {items === null ? (
          <div className="flex flex-col gap-2 p-2">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
          </div>
        ) : items.length === 0 ? (
          <p className="px-2 py-4 text-center text-xs text-muted-foreground">Tidak ada notifikasi.</p>
        ) : (
          <div className="flex max-h-80 flex-col overflow-y-auto">
            {items.map((notif) => (
              <DropdownMenuItem key={notif.id} asChild className="items-start">
                <Link href={notificationLink(notif.type, surface)} onClick={() => handleItemClick(notif)}>
                  <span className={`mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full ${notif.isRead ? "bg-transparent" : "bg-primary-600"}`} />
                  <span className="flex flex-col gap-0.5">
                    <span className={`text-sm ${notif.isRead ? "text-muted-foreground" : "font-medium text-foreground"}`}>{notif.title}</span>
                    <span className="line-clamp-2 text-xs text-muted-foreground">{notif.body}</span>
                    <span className="text-[10px] text-muted-foreground">{formatDate(notif.createdAt, companyTimezone)}</span>
                  </span>
                </Link>
              </DropdownMenuItem>
            ))}
          </div>
        )}
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link href={surface === "admin" ? "/admin/notifications" : "/notifications"} className="justify-center text-sm text-primary-600">
            Lihat semua
          </Link>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
