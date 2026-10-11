"use client";

import { cn } from "@/lib/utils";

// § Fase 189B, D10 — saran alasan cepat (tombol pilih) di atas kolom catatan bebas. Pemilihan hanya MENGISI/menandai; admin tetap bebas menulis apa pun.
export function ReasonQuickPicks<T extends string>({
  options,
  value,
  onChange,
  label,
  disabled,
}: {
  options: { value: T; label: string }[];
  value: T | null;
  onChange: (next: T | null) => void;
  label: string;
  disabled?: boolean;
}) {
  return (
    <div role="group" aria-label={label} className="flex flex-wrap gap-2">
      {options.map((o) => {
        const active = value === o.value;
        return (
          <button
            key={o.value}
            type="button"
            aria-pressed={active}
            disabled={disabled}
            onClick={() => onChange(active ? null : o.value)}
            className={cn(
              "rounded-full border px-3 py-1 text-xs transition-colors disabled:opacity-50",
              active ? "border-primary-500 bg-primary-50 text-primary-700" : "border-border text-muted-foreground hover:bg-muted/50",
            )}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
