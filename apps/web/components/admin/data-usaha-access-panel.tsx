"use client";

import { useCallback, useState } from "react";
import { ChevronDown, ChevronRight, History, Users } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Can } from "@/components/auth/can";
import { useCompanyTimezone } from "@/components/company-timezone-provider";
import { RevokeSeatDialog } from "@/components/admin/revoke-seat-dialog";
import { api } from "@/lib/api-client";
import { cn, formatDate } from "@/lib/utils";
import { describeDataUsahaEvent, type DataUsahaEvent } from "@/lib/data-usaha-history";

// § Fase 189B — panel "Akses & Riwayat" per Data Usaha di detail user admin: slot User Tambahan (cabut/pindahkan oleh admin, alasan wajib) dan riwayat gabungan
// koneksi Accurate + akses. DIMUAT SAAT DIBUKA (lazy) — halaman detail tidak menambah request per Data Usaha. Riwayat lintas pelanggan = laporan 189D.
type Seat = {
  id: string;
  status: string;
  invitedEmail: string | null;
  memberName: string | null;
  memberEmail: string | null;
  seatEndAt: string | null;
  seatSubscriptionStatus: string;
  seatExpired: boolean; // dihitung server
};
type AccessData = { seats: Seat[]; history: DataUsahaEvent[] };

const SEAT_STATUS: Record<string, { label: string; variant: "success" | "warning" | "default" }> = {
  active: { label: "Aktif", variant: "success" },
  invited: { label: "Diundang", variant: "warning" },
  available: { label: "Tersedia", variant: "default" },
};
const TONE_DOT = { info: "bg-primary-500", warning: "bg-amber-500", danger: "bg-red-500" } as const;
const HISTORY_PREVIEW = 8;

export function DataUsahaAccessPanel({ dataUsahaId }: { dataUsahaId: string }) {
  const timezone = useCompanyTimezone();
  const [open, setOpen] = useState(false);
  const [data, setData] = useState<AccessData | null>(null);
  const [error, setError] = useState(false);
  const [showAll, setShowAll] = useState(false);

  const load = useCallback(async () => {
    const res = await api.admin["data-usaha"]({ id: dataUsahaId }).access.get();
    if (res.error || !res.data) {
      setError(true);
      return;
    }
    setError(false);
    setData(res.data as unknown as AccessData);
  }, [dataUsahaId]);

  function toggle() {
    const next = !open;
    setOpen(next);
    if (next && !data) void load();
  }

  const history = data?.history ?? [];
  const shown = showAll ? history : history.slice(0, HISTORY_PREVIEW);

  return (
    <div className="mt-3 rounded-xl border border-border">
      <button type="button" onClick={toggle} aria-expanded={open} className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm font-medium text-foreground hover:bg-muted/40">
        {open ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
        <Users className="h-4 w-4 text-muted-foreground" />
        Akses (User Tambahan) &amp; Riwayat
      </button>
      {open && (
        <div className="flex flex-col gap-4 border-t border-border px-3 py-3 text-sm">
          {error && (
            <p role="alert" className="text-red-600">
              Gagal memuat akses dan riwayat. Tutup lalu buka lagi untuk mencoba ulang.
            </p>
          )}
          {!data && !error && <Skeleton className="h-20 w-full" />}
          {data && (
            <>
              <section aria-label="Slot akses">
                <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Slot User Tambahan ({data.seats.length})</h4>
                {data.seats.length === 0 ? (
                  <p className="text-muted-foreground">Belum ada slot User Tambahan di Data Usaha ini.</p>
                ) : (
                  <ul className="flex flex-col divide-y divide-border rounded-lg border border-border">
                    {data.seats.map((seat) => {
                      const status = SEAT_STATUS[seat.status] ?? { label: seat.status, variant: "default" as const };
                      const holder = seat.status === "active" ? (seat.memberEmail ?? "-") : seat.status === "invited" ? (seat.invitedEmail ?? "-") : null;
                      const expired = seat.seatExpired;
                      return (
                        <li key={seat.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2">
                          <div className="flex min-w-0 flex-col gap-0.5">
                            <span className="flex flex-wrap items-center gap-2">
                              <Badge variant={status.variant}>{status.label}</Badge>
                              {holder ? <span className="truncate font-medium text-foreground">{seat.status === "active" && seat.memberName ? `${seat.memberName} · ${holder}` : holder}</span> : <span className="text-muted-foreground">Belum dipakai</span>}
                            </span>
                            {seat.seatEndAt && (
                              <span className={cn("text-xs", expired ? "text-red-600" : "text-muted-foreground")}>
                                Kursi {expired ? "berakhir" : "berlaku sampai"} {formatDate(seat.seatEndAt, timezone)}
                              </span>
                            )}
                          </div>
                          {holder && (
                            <Can permission="subscriptions.manage">
                              <RevokeSeatDialog dataUsahaId={dataUsahaId} seatId={seat.id} holderLabel={holder} onDone={load} />
                            </Can>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                )}
              </section>

              <section aria-label="Riwayat Data Usaha">
                <h4 className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  <History className="h-3.5 w-3.5" /> Riwayat koneksi &amp; akses
                </h4>
                {history.length === 0 ? (
                  <p className="text-muted-foreground">Belum ada peristiwa tercatat (riwayat dimulai sejak fitur ini aktif).</p>
                ) : (
                  <ol className="flex flex-col gap-2">
                    {shown.map((event) => {
                      const d = describeDataUsahaEvent(event);
                      return (
                        <li key={event.id} className="flex gap-2">
                          <span className={cn("mt-1.5 h-2 w-2 shrink-0 rounded-full", TONE_DOT[d.tone])} aria-hidden="true" />
                          <div className="min-w-0">
                            <p className="text-foreground">{d.title}</p>
                            {d.detail && <p className="break-words text-xs text-muted-foreground">{d.detail}</p>}
                            <p className="text-xs text-muted-foreground">
                              {formatDate(event.createdAt, timezone)}
                              {event.actorName ? ` · ${event.actorName}` : ""}
                            </p>
                          </div>
                        </li>
                      );
                    })}
                  </ol>
                )}
                {history.length > HISTORY_PREVIEW && (
                  <button type="button" onClick={() => setShowAll((v) => !v)} className="mt-2 text-xs font-medium text-primary-700 hover:underline">
                    {showAll ? "Tampilkan lebih sedikit" : `Tampilkan semua (${history.length})`}
                  </button>
                )}
              </section>
            </>
          )}
        </div>
      )}
    </div>
  );
}
