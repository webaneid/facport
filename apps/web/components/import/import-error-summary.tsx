"use client";

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { summarizeErrors, type ErrorAction, type SummaryRow } from "@/lib/import-error-summary";

// § Perbaikan kecil (2026-10-20) — ringkasan galat per jenis di halaman hasil import (generik lintas modul; data dari baris yang SUDAH dimuat halaman).
const ACTION_LABEL: Record<ErrorAction, string> = {
  "fix-data": "Perbaiki data dulu — Retry tanpa perbaikan akan gagal lagi",
  "check-accurate": "Periksa Accurate dulu sebelum import ulang",
  "retry-ok": "Boleh Retry",
};

export function ImportErrorSummary({ rows }: { rows: SummaryRow[] }) {
  const summary = summarizeErrors(rows);
  if (summary.totalFailed === 0) return null;
  return (
    <Card data-testid="import-error-summary">
      <CardHeader>
        <CardTitle>Ringkasan Galat</CardTitle>
        <CardDescription>
          {summary.totalFailed.toLocaleString("id-ID")} baris gagal, dikelompokkan menurut jenis galat. Perbaiki penyebabnya dulu sebelum menekan Retry.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {summary.groups.map((g) => (
          <div key={g.key} className="rounded-md border border-border p-3 text-sm">
            <div className="flex items-start justify-between gap-3">
              <p className="min-w-0 break-words text-foreground">{g.example.length > 240 ? `${g.example.slice(0, 240)}…` : g.example}</p>
              <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-xs font-medium">{g.count.toLocaleString("id-ID")} baris</span>
            </div>
            {g.hint && (
              <p className="mt-2 text-muted-foreground">
                <span className="font-medium text-foreground">{ACTION_LABEL[g.hint.action]}.</span> {g.hint.advice}
              </p>
            )}
          </div>
        ))}
        {summary.otherGroups > 0 && (
          <p className="text-xs text-muted-foreground">
            Dan {summary.otherGroups.toLocaleString("id-ID")} jenis galat lain ({summary.otherRows.toLocaleString("id-ID")} baris) — lihat Detail per Baris di bawah.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
