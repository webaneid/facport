import * as React from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

// Native <select> bergaya — untuk pilihan TETAP & sedikit (~<10 opsi,
// tidak butuh search). Untuk pilihan banyak/data async, pakai
// `Combobox` (§ architecture-component-autocomplete.md), JANGAN raw
// <select> lagi seperti sebelumnya (§ ADR-0023).
export function Select({ className, children, ...props }: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <div className="relative">
      <select
        className={cn(
          "flex w-full appearance-none rounded-md border border-border bg-background px-3 py-2 pr-9 text-sm outline-none transition-shadow focus:border-primary-500 focus:ring-4 focus:ring-primary-500/10",
          className,
        )}
        {...props}
      >
        {children}
      </select>
      <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 opacity-50" />
    </div>
  );
}
