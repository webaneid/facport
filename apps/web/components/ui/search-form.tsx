"use client";

import { useEffect, useRef, useState } from "react";
import { Search, X } from "lucide-react";
import { cn } from "@/lib/utils";

// § Fase 25, ADR-0024 — GANTI pola search box `onChange` langsung fetch
// tiap keystroke (celah nyata ditemukan di `admin/users/page.tsx`,
// bukan hipotetis) — debounce WAJIB (§ spec sumber
// `architecture-component-form-controls.md`), default 350ms. State
// URL query param SENGAJA belum diimplementasikan di sini (nilai
// tambahnya kecil dibanding kompleksitas Suspense boundary untuk
// `useSearchParams` di semua pemakai — revisit kalau ada kebutuhan
// nyata "search bisa di-bookmark/share").
export function SearchForm({
  defaultValue = "",
  onSearch,
  placeholder = "Cari...",
  debounceMs = 350,
  className,
}: {
  defaultValue?: string;
  onSearch: (query: string) => void;
  placeholder?: string;
  debounceMs?: number;
  className?: string;
}) {
  const [value, setValue] = useState(defaultValue);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const isFirstRender = useRef(true);

  useEffect(() => {
    // Skip debounce pada mount pertama — `onSearch` awal biar dipanggil
    // pemanggil sendiri (via fetch awal), bukan diduplikasi di sini.
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }
    clearTimeout(timer.current);
    timer.current = setTimeout(() => onSearch(value), debounceMs);
    return () => clearTimeout(timer.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  return (
    <div className={cn("flex items-center gap-2 rounded-md border border-border bg-background px-3 py-2", className)}>
      <Search className="h-4 w-4 shrink-0 text-muted-foreground" />
      <input
        type="search"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder={placeholder}
        className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground/70"
      />
      {value && (
        <button type="button" onClick={() => setValue("")} aria-label="Bersihkan pencarian" className="shrink-0 text-muted-foreground hover:text-foreground">
          <X className="h-4 w-4" />
        </button>
      )}
    </div>
  );
}
