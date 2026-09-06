"use client";

import { useState } from "react";
import { MessageCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";
import { api } from "@/lib/api-client";

type NextAgentResponse =
  | { available: true; agent: { id: string; name: string; position: string; photoUrl: string | null } }
  | { available: false; workSchedule: { workStartMinutes: number; workEndMinutes: number; workDays: number[] } };

function formatHour(minutes: number): string {
  const h = Math.floor(minutes / 60)
    .toString()
    .padStart(2, "0");
  const m = (minutes % 60).toString().padStart(2, "0");
  return `${h}.${m}`;
}

// § Fase 46 — floating widget bottom-right, dipasang di
// `app/(protected)/layout.tsx` (SEMUA halaman app, bukan cuma dashboard,
// dikonfirmasi user via AskUserQuestion). Fetch "next agent" cuma saat
// popover DIBUKA (bukan langsung saat halaman mount) — hindari 1 extra
// request tiap navigasi kalau customer tidak pernah buka widget-nya.
export function CustomerCareWidget() {
  const [open, setOpen] = useState(false);
  const [data, setData] = useState<NextAgentResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [connecting, setConnecting] = useState(false);

  async function handleOpenChange(next: boolean) {
    setOpen(next);
    if (next && data === null) {
      setLoading(true);
      const res = await api.me["customer-care"].next.get();
      setLoading(false);
      if (res.data) setData(res.data as unknown as NextAgentResponse);
    }
  }

  async function handleChat() {
    if (!data?.available) return;
    setConnecting(true);
    const res = await api.me["customer-care"].click.post({ agentId: data.agent.id });
    setConnecting(false);
    if (res.error) {
      // § agent yang tadi tersedia ternyata sudah tidak online lagi
      // (jam kerja lewat / di-off-kan admin persis di antara buka
      // popover dan klik) — refresh data, biar customer lihat status terbaru.
      setData(null);
      handleOpenChange(true);
      return;
    }
    const { waLink } = res.data as unknown as { waLink: string };
    window.open(waLink, "_blank", "noopener,noreferrer");
    setOpen(false);
  }

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label="Hubungi Customer Care"
          title="Hubungi Customer Care"
          className="fixed bottom-4 right-4 z-40 flex h-14 w-14 items-center justify-center rounded-full bg-primary-600 text-white shadow-lg transition-transform hover:scale-105"
        >
          <MessageCircle className="h-6 w-6" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="p-4">
        {loading ? (
          <p className="text-sm text-muted-foreground">Memuat...</p>
        ) : !data ? (
          <p className="text-sm text-muted-foreground">Gagal memuat.</p>
        ) : data.available ? (
          <div className="flex flex-col items-center gap-3 text-center">
            {data.agent.photoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={data.agent.photoUrl} alt={data.agent.name} className="h-16 w-16 rounded-full object-cover" />
            ) : (
              <div className="flex h-16 w-16 items-center justify-center rounded-full bg-primary-100 text-lg font-medium text-primary-700">
                {data.agent.name.slice(0, 1).toUpperCase()}
              </div>
            )}
            <div>
              <p className="font-medium text-foreground">{data.agent.name}</p>
              <p className="text-xs text-muted-foreground">{data.agent.position}</p>
            </div>
            <Button onClick={handleChat} disabled={connecting} className="w-full">
              {connecting ? "Menghubungkan..." : "Chat via WhatsApp"}
            </Button>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-2 text-center">
            <p className="text-sm font-medium text-foreground">Customer Care sedang offline</p>
            <p className="text-xs text-muted-foreground">
              Jam layanan: {formatHour(data.workSchedule.workStartMinutes)}–{formatHour(data.workSchedule.workEndMinutes)}
            </p>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}
