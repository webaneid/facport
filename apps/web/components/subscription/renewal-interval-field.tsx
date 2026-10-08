"use client";

import { cn } from "@/lib/utils";
import type { SubscriptionInterval } from "@/lib/subscription-period";

// § Fase 181, ADR-0042 — "Perpanjangan berikutnya" saat admin memberi paket (Tambah User & Kelola Langganan): menandai langganan modul supaya TAGIHAN PERPANJANGAN terbit otomatis
// 7 hari sebelum berakhir (pembayaran tetap manual, masa aktif bertambah dari tanggal berakhir). "none" = tidak terjadwal (perilaku sekarang). Slot User Tambahan (seat) & trial tidak ikut.
export type RenewalChoice = "none" | SubscriptionInterval;

const OPTIONS: { value: RenewalChoice; label: string }[] = [
  { value: "none", label: "Tidak ada" },
  { value: "monthly", label: "Bulanan" },
  { value: "yearly", label: "Tahunan" },
];

export function RenewalIntervalField({ value, onChange, disabled }: { value: RenewalChoice; onChange: (value: RenewalChoice) => void; disabled?: boolean }) {
  return (
    <fieldset className="flex flex-col gap-1.5" disabled={disabled}>
      <legend className="mb-1 text-xs font-medium text-foreground">Perpanjangan berikutnya</legend>
      <div className="flex gap-1.5" role="group" aria-label="Perpanjangan berikutnya">
        {OPTIONS.map((o) => (
          <button
            key={o.value}
            type="button"
            aria-pressed={value === o.value}
            onClick={() => onChange(o.value)}
            className={cn(
              "rounded-full border px-4 py-1 text-xs font-medium transition-colors disabled:opacity-50",
              value === o.value ? "border-primary-600 bg-primary-600 text-white" : "border-border text-muted-foreground hover:border-primary-300",
            )}
          >
            {o.label}
          </button>
        ))}
      </div>
      <p className="text-xs text-muted-foreground">
        {value === "none"
          ? "Tidak ada tagihan otomatis — perpanjangan dilakukan manual."
          : `Tagihan perpanjangan ${value === "yearly" ? "1 tahun" : "1 bulan"} terbit otomatis 7 hari sebelum langganan berakhir (customer diberi tahu lewat notifikasi dan email). Setelah dibayar, masa aktif bertambah dari tanggal berakhir. Tidak berlaku untuk Slot User Tambahan.`}
      </p>
    </fieldset>
  );
}
