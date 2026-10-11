"use client";

import Link from "next/link";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { api } from "@/lib/api-client";
import { formatDate } from "@/lib/utils";
import { useCompanyTimezone } from "@/components/company-timezone-provider";
import { seatStatusLabel, type CustomerAccessResponse } from "@/lib/insights";
import { useInsightQuery } from "./use-insight-query";

function AccessBody({ userId }: { userId: string }) {
  const timeZone = useCompanyTimezone();
  const { loading, data, failed } = useInsightQuery<CustomerAccessResponse>(`access:${userId}`, () => api.admin.insights.customers({ userId }).access.get() as never);

  if (loading) return <Skeleton className="h-32 w-full" />;
  if (failed || !data) return <Alert variant="destructive">Gagal memuat akses pelanggan ini.</Alert>;
  if (data.dataUsaha.length === 0) return <p className="text-sm text-muted-foreground">Akun ini belum memiliki Data Usaha.</p>;

  return (
    <div className="space-y-4">
      {data.dataUsaha.map((du) => (
        <section key={du.id} className="space-y-2">
          <h3 className="text-sm font-semibold">{du.name}</h3>
          {du.seats.length === 0 ? (
            <p className="text-sm text-muted-foreground">Tidak ada slot User Tambahan.</p>
          ) : (
            <ul className="divide-y rounded-md border text-sm">
              {du.seats.map((seat) => (
                <li key={seat.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2">
                  <span className="min-w-0 truncate" title={seat.memberEmail ?? seat.invitedEmail ?? undefined}>
                    {seat.memberName ? `${seat.memberName} · ` : ""}
                    {seat.memberEmail ?? seat.invitedEmail ?? "Slot kosong"}
                  </span>
                  <span className="flex items-center gap-2">
                    <Badge variant={seat.status === "active" && !seat.seatExpired ? "success" : seat.status === "invited" ? "primary" : "default"}>{seatStatusLabel(seat)}</Badge>
                    {seat.seatEndAt ? <span className="text-xs text-muted-foreground">s.d. {formatDate(seat.seatEndAt, timeZone)}</span> : null}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      ))}
      <p className="text-xs text-muted-foreground">
        Untuk mencabut atau memindahkan akses, buka{" "}
        <Link className="text-primary-700 hover:underline" href={`/users/${data.owner.id}`}>
          detail pengguna
        </Link>
        .
      </p>
    </div>
  );
}

export function CustomerAccessDialog({ userId, name, onClose }: { userId: string | null; name: string; onClose: () => void }) {
  return (
    <Dialog open={userId !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Akses {name}</DialogTitle>
          <DialogDescription>Data Usaha milik pelanggan ini dan slot User Tambahan-nya.</DialogDescription>
        </DialogHeader>
        {userId ? <AccessBody userId={userId} /> : null}
      </DialogContent>
    </Dialog>
  );
}
