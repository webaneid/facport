"use client";

import { useMemo, useState } from "react";
import { Check, RefreshCw } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { PLAN_PRODUCT_FILTERS } from "@/lib/classify-plans";
import { INTERVAL_LABELS } from "@/lib/duration";
import { SUBSCRIPTION_INTERVALS, type SubscriptionInterval } from "@/lib/subscription-period";
import { timezoneAbbreviation } from "@/lib/timezone";
import { cn, currencyFormatter, formatDate } from "@/lib/utils";
import {
  buildPickerRows,
  countRowsByFilter,
  filterPickerRows,
  previewRow,
  pruneSelection,
  selectableKeys,
  summarizeSelection,
  type ActiveSubscriptionInfo,
  type PickerPlan,
  type PickerRow,
} from "@/lib/subscription-picker";

// § Fase 177, ADR-0041 — komponen reusable "pilih paket langganan": pilih BANYAK fitur sekaligus, filter per Produk, SATU periode (bulanan/tahunan) untuk
// semua, dan pratinjau tanggal+jam akhir yang dihitung dengan fungsi yang SAMA dengan server. Dipakai dialog Tambah User & Kelola Langganan (admin /users),
// dirancang bisa dipakai ulang di halaman app pelanggan. Komponen ini CONTROLLED (periode & pilihan dipegang pemanggil) dan tidak memanggil API —
// pemanggil yang mengirim `planIds` hasil `summarizeSelection` ke endpoint yang sesuai.

export type SubscriptionPickerProps = {
  plans: PickerPlan[];
  /** Langganan aktif per fitur di Data Usaha tujuan → mode Perpanjang. Kosong untuk user baru. */
  activeByModule?: Map<string, ActiveSubscriptionInfo>;
  interval: SubscriptionInterval;
  onIntervalChange: (interval: SubscriptionInterval) => void;
  selectedKeys: Set<string>;
  onSelectedKeysChange: (keys: Set<string>) => void;
  timeZone: string;
  /**
   * `exact` = langganan dimulai saat tombol simpan ditekan → tampilkan tanggal+jam akhir; `on-approval` = dimulai saat pembayaran disetujui (invoice) →
   * tanggal belum diketahui, tampilkan aturannya saja.
   */
  startsAt?: "exact" | "on-approval";
  /** Hanya untuk tes — waktu "sekarang" tetap. */
  now?: Date;
  disabled?: boolean;
};

export function SubscriptionPicker({
  plans,
  activeByModule,
  interval,
  onIntervalChange,
  selectedKeys,
  onSelectedKeysChange,
  timeZone,
  startsAt = "exact",
  now: nowProp,
  disabled,
}: SubscriptionPickerProps) {
  const [filterKey, setFilterKey] = useState("all");
  const [search, setSearch] = useState("");
  const now = nowProp ?? new Date();

  const rows = useMemo(() => buildPickerRows(plans, { interval, activeByModule }), [plans, interval, activeByModule]);
  const counts = useMemo(() => countRowsByFilter(rows), [rows]);
  const visible = useMemo(() => filterPickerRows(rows, { filterKey, search }), [rows, filterKey, search]);
  const visibleSelectable = selectableKeys(visible);
  const allVisibleSelected = visibleSelectable.length > 0 && visibleSelectable.every((k) => selectedKeys.has(k));
  const summary = summarizeSelection(rows, selectedKeys, now, timeZone);
  const zone = timezoneAbbreviation(timeZone);
  const formatEnd = (date: Date) => `${formatDate(date, timeZone)} ${zone}`;

  // Kelompok per Kategori, urutan baris dipertahankan (sudah terurut katalog).
  const groups = useMemo(() => {
    const byCategory = new Map<string, PickerRow[]>();
    for (const row of visible) byCategory.set(row.categoryLabel, [...(byCategory.get(row.categoryLabel) ?? []), row]);
    return [...byCategory.entries()];
  }, [visible]);

  // Ganti periode: pilihan yang fiturnya TIDAK punya paket di periode baru dilepas di sini (bukan diserahkan ke pemanggil) — tidak pernah ada pilihan "tanpa paket".
  function changeInterval(next: SubscriptionInterval) {
    onIntervalChange(next);
    onSelectedKeysChange(pruneSelection(buildPickerRows(plans, { interval: next, activeByModule }), selectedKeys));
  }

  function toggle(key: string) {
    const next = new Set(selectedKeys);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    onSelectedKeysChange(next);
  }

  function toggleAllVisible() {
    const next = new Set(selectedKeys);
    for (const key of visibleSelectable) {
      if (allVisibleSelected) next.delete(key);
      else next.add(key);
    }
    onSelectedKeysChange(next);
  }

  return (
    <div className="flex flex-col gap-3 text-sm">
      <div className="flex flex-col gap-1.5">
        <span className="text-xs font-medium text-foreground">Periode (berlaku untuk semua fitur yang dipilih)</span>
        <div className="flex gap-1.5" role="group" aria-label="Periode langganan">
          {SUBSCRIPTION_INTERVALS.map((value) => (
            <button
              key={value}
              type="button"
              disabled={disabled}
              aria-pressed={interval === value}
              onClick={() => changeInterval(value)}
              className={cn(
                "rounded-full border px-4 py-1 text-xs font-medium transition-colors disabled:opacity-50",
                interval === value ? "border-primary-600 bg-primary-600 text-white" : "border-border text-muted-foreground hover:border-primary-300",
              )}
            >
              {INTERVAL_LABELS[value]}
            </button>
          ))}
        </div>
      </div>

      <div className="flex flex-wrap gap-1.5" role="group" aria-label="Filter produk">
        {[{ key: "all", label: "Semua" }, ...PLAN_PRODUCT_FILTERS].map((f) => {
          const active = filterKey === f.key;
          return (
            <button
              key={f.key}
              type="button"
              aria-pressed={active}
              onClick={() => setFilterKey(f.key)}
              className={
                active
                  ? "rounded-full border border-primary-500 bg-primary-500 px-3 py-1 text-xs font-medium text-white"
                  : "rounded-full border border-border px-3 py-1 text-xs text-muted-foreground hover:bg-muted"
              }
            >
              {f.label} <span className={active ? "opacity-80" : "opacity-60"}>({counts[f.key] ?? 0})</span>
            </button>
          );
        })}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Input placeholder="Cari fitur..." value={search} onChange={(e) => setSearch(e.target.value)} disabled={disabled} className="h-8 min-w-0 flex-1" aria-label="Cari fitur" />
        <Button type="button" variant="outline" onClick={toggleAllVisible} disabled={disabled || visibleSelectable.length === 0} className="h-8 px-2.5 py-0 text-xs">
          {allVisibleSelected ? "Lepas semua (hasil filter)" : "Pilih semua (hasil filter)"}
        </Button>
        <Button type="button" variant="outline" onClick={() => onSelectedKeysChange(new Set())} disabled={disabled || selectedKeys.size === 0} className="h-8 px-2.5 py-0 text-xs">
          Kosongkan
        </Button>
      </div>

      <div className="max-h-72 overflow-y-auto rounded-md border border-border">
        {visible.length === 0 ? (
          <p className="p-3 text-xs text-muted-foreground">Tidak ada fitur untuk filter ini.</p>
        ) : (
          groups.map(([category, categoryRows]) => (
            <div key={category}>
              <div className="sticky top-0 z-10 bg-muted px-3 py-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{category}</div>
              <ul className="divide-y divide-border">
                {categoryRows.map((row) => {
                  const selected = selectedKeys.has(row.key);
                  const unavailable = row.plan === null;
                  const preview = selected ? previewRow(row, now, timeZone) : null;
                  const activeInfo = row.active?.endAt && new Date(row.active.endAt).getTime() > now.getTime() ? row.active : null;
                  return (
                    <li key={row.key}>
                      <label className={cn("flex items-start gap-2 px-3 py-2", unavailable ? "opacity-60" : "cursor-pointer hover:bg-muted/50")}>
                        <Checkbox
                          className="mt-0.5"
                          checked={selected}
                          disabled={disabled || unavailable}
                          onCheckedChange={() => toggle(row.key)}
                          aria-label={`${row.label} — ${row.productLabel}`}
                        />
                        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                          <span className="flex flex-wrap items-center gap-1.5 text-foreground">
                            {row.label}
                            {filterKey === "all" && <span className="text-[11px] text-muted-foreground">({row.productLabel})</span>}
                            {activeInfo && !activeInfo.isTrial && <Badge variant="success">Aktif</Badge>}
                            {activeInfo?.isTrial && <Badge variant="warning">Trial</Badge>}
                          </span>
                          {unavailable && <span className="text-xs text-muted-foreground">Tidak tersedia untuk periode {INTERVAL_LABELS[interval].toLowerCase()}</span>}
                          {activeInfo && !activeInfo.isTrial && activeInfo.endAt && (
                            <span className="text-xs text-muted-foreground">Berlaku sampai {formatEnd(new Date(activeInfo.endAt))}</span>
                          )}
                          {preview && startsAt === "exact" && (
                            <span className="flex items-center gap-1 text-xs text-primary-700">
                              {preview.mode === "renew" ? <RefreshCw className="h-3 w-3" /> : <Check className="h-3 w-3" />}
                              {preview.mode === "renew"
                                ? `Diperpanjang dari tanggal berakhir → sampai ${formatEnd(preview.endAt)}`
                                : preview.mode === "replace-trial"
                                  ? `Menggantikan trial → berakhir ${formatEnd(preview.endAt)}`
                                  : `Berakhir ${formatEnd(preview.endAt)}`}
                            </span>
                          )}
                        </span>
                        {row.plan && <span className="shrink-0 text-xs text-muted-foreground">{currencyFormatter.format(row.plan.price)}</span>}
                      </label>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))
        )}
      </div>

      <div className="flex flex-col gap-1 rounded-md bg-muted p-3 text-xs" aria-live="polite">
        <p className="text-foreground">
          <strong>{summary.count}</strong> fitur dipilih · Total <strong>{currencyFormatter.format(summary.total)}</strong>
        </p>
        {summary.count > 0 && startsAt === "exact" && summary.newCount > 0 && summary.newEndAt && (
          <p className="text-muted-foreground">
            {summary.newCount} langganan baru berakhir bersamaan: <strong className="text-foreground">{formatEnd(summary.newEndAt)}</strong> (dihitung saat disimpan).
          </p>
        )}
        {summary.count > 0 && startsAt === "exact" && summary.renewCount > 0 && (
          <p className="text-muted-foreground">{summary.renewCount} diperpanjang dari tanggal & jam berakhirnya — sisa masa aktif tidak hilang.</p>
        )}
        {summary.count > 0 && startsAt === "on-approval" && (
          <p className="text-muted-foreground">
            Langganan dimulai saat pembayaran disetujui, berakhir di tanggal & jam yang sama {interval === "yearly" ? "tahun" : "bulan"} berikutnya ({zone}).
          </p>
        )}
      </div>
    </div>
  );
}
