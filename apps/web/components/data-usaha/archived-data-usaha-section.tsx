"use client";

import { useState } from "react";
import { Archive, ChevronDown, ChevronRight, RotateCcw } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api-client";
import { archiveDaysLeft, lifecycleError } from "@/lib/data-usaha-lifecycle";

// § Fase 218, ADR-0055 — Data Usaha yang diarsipkan pemilik: bisa dipulihkan selama masa simpan 30 hari. Pemulihan TIDAK menyambung Accurate lagi (harus dihubungkan dari awal).
export type ArchivedRow = { id: string; name: string; archivedAt: string; canRestore: boolean };

export function ArchivedDataUsahaSection({ items, retentionDays, onRestored }: { items: ArchivedRow[]; retentionDays: number; onRestored: () => void }) {
  const [open, setOpen] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  if (items.length === 0) return null;

  async function restore(id: string) {
    setBusyId(id);
    const res = await api.me["data-usaha"]({ id }).restore.post();
    setBusyId(null);
    if (res.error) {
      toast.error(lifecycleError((res.error.value as { code?: string } | undefined)?.code));
      return;
    }
    toast.success("Data Usaha dipulihkan. Hubungkan Accurate lagi untuk mulai import.");
    onRestored();
  }

  return (
    <div className="rounded-xl border border-border/60 bg-background">
      <button type="button" onClick={() => setOpen((o) => !o)} className="flex w-full items-center gap-2 px-4 py-3 text-left text-sm font-medium text-foreground" aria-expanded={open}>
        {open ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
        <Archive className="h-4 w-4 text-muted-foreground" />
        Diarsipkan ({items.length})
      </button>
      {open ? (
        <ul className="m-0 flex list-none flex-col gap-2 border-t border-border/60 p-3">
          {items.map((it) => (
            <li key={it.id} className="flex items-center gap-3 rounded-lg bg-muted/30 px-3 py-2">
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium text-foreground">{it.name}</span>
                <span className="block text-xs text-muted-foreground">
                  {it.canRestore ? `Dibersihkan permanen dalam ${archiveDaysLeft(it.archivedAt, new Date(), retentionDays)} hari` : "Masa simpan habis, tidak bisa dipulihkan"}
                </span>
              </span>
              {it.canRestore ? (
                <Button type="button" size="sm" variant="outline" disabled={busyId === it.id} onClick={() => restore(it.id)}>
                  <RotateCcw className="mr-1.5 h-3.5 w-3.5" />
                  Pulihkan
                </Button>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
