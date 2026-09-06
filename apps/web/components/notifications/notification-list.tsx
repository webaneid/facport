import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { formatDate } from "@/lib/utils";
import { notificationLink } from "@/lib/notification-routes";
import type { Surface } from "@/components/app-shell/sidebar";

export type NotificationRow = {
  id: string;
  type: string;
  title: string;
  body: string;
  isRead: boolean;
  createdAt: string;
};

// § Fase 45 — shared antara halaman arsip app (`app/notifications/page.tsx`)
// dan admin (`admin/notifications/page.tsx`), pola sama `ImportBatchTable`
// (Fase 41) — 1 tempat, supaya kalau ada tipe notifikasi baru nanti,
// cukup update `lib/notification-routes.ts`, bukan 2 halaman terpisah.
export function NotificationList({
  notifications,
  surface,
  timezone,
  onItemClick,
}: {
  notifications: NotificationRow[];
  surface: Surface;
  timezone: string;
  onItemClick: (notif: NotificationRow) => void;
}) {
  return (
    <ul className="flex flex-col divide-y divide-border">
      {notifications.map((notif) => (
        <li key={notif.id}>
          <Link
            href={notificationLink(notif.type, surface)}
            onClick={() => onItemClick(notif)}
            className={`flex flex-col gap-1 px-1 py-3 transition-colors hover:bg-muted/50 ${notif.isRead ? "" : "bg-primary-50/40"}`}
          >
            <div className="flex items-center justify-between gap-2">
              <span className={`text-sm ${notif.isRead ? "text-muted-foreground" : "font-medium text-foreground"}`}>{notif.title}</span>
              {!notif.isRead && <Badge variant="primary">Baru</Badge>}
            </div>
            <p className="text-sm text-muted-foreground">{notif.body}</p>
            <span className="text-xs text-muted-foreground">{formatDate(notif.createdAt, timezone)}</span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
