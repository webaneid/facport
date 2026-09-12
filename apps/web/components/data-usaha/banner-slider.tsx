"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from "lucide-react";
import { cn } from "@/lib/utils";

type Slide = { title: string; description: string; gradient: string };

// § diminta user 2026-09-11 — slot iklan/promosi di gerbang "Pilih Data
// Usaha" (referensi: banner Accurate Online di halaman yang sama).
// Konten SEMENTARA hardcode (promosi Facport sendiri) — belum ada sistem
// admin untuk kelola banner (di luar scope langkah pertama ini, "pelan2
// dulu" per instruksi user), tapi struktur slider SUDAH generik (array
// `Slide[]`) supaya gampang disambungkan ke data dinamis nanti tanpa
// bongkar ulang komponen ini.
const SLIDES: Slide[] = [
  {
    title: "Import Excel Sekali Klik",
    description: "Ribuan baris transaksi langsung masuk Accurate Online tanpa input manual.",
    gradient: "from-primary-600 via-primary-700 to-primary-900",
  },
  {
    title: "User Tambahan untuk Tim",
    description: "Undang staf akuntansi ke Data Usaha ini — akses fitur yang sama, akun terpisah.",
    gradient: "from-sky-600 via-sky-700 to-primary-900",
  },
  {
    title: "Riwayat Import Rapi",
    description: "Semua arsip import tersimpan otomatis, gampang dicek kalau ada yang perlu ditelusuri.",
    gradient: "from-emerald-600 via-emerald-700 to-primary-900",
  },
];

const AUTOPLAY_MS = 6000;
export const BANNER_COLLAPSE_STORAGE_KEY = "facport-pilih-usaha-banner-collapsed";

// § Controlled dari parent (`pilih-usaha-form.tsx`) — state collapse
// dipakai JUGA oleh grid Data Usaha di sebelahnya (3 kolom saat banner
// tampil, 5-6 saat diciutkan), jadi tidak bisa jadi local state komponen
// ini sendiri. localStorage read/write TETAP di sini (baca `useEffect`
// hydrate di parent) — pola persist SAMA sidebar app-shell
// (`COLLAPSE_STORAGE_KEY` di `components/app-shell/sidebar.tsx`). Rasio
// slide 4:5 (`aspect-[4/5]`) — diminta eksplisit user, "kayak ukuran
// instagram post".
export function BannerSlider({ collapsed, onToggleCollapsed }: { collapsed: boolean; onToggleCollapsed: () => void }) {
  const [index, setIndex] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (collapsed) return;
    timerRef.current = setInterval(() => setIndex((i) => (i + 1) % SLIDES.length), AUTOPLAY_MS);
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [collapsed]);

  function go(delta: number) {
    setIndex((i) => (i + delta + SLIDES.length) % SLIDES.length);
  }

  if (collapsed) {
    return (
      <div className="hidden shrink-0 lg:flex lg:flex-col lg:items-center lg:pt-1">
        <button
          type="button"
          onClick={onToggleCollapsed}
          title="Tampilkan banner"
          aria-label="Tampilkan banner"
          className="flex h-9 w-9 items-center justify-center rounded-lg border border-border/60 bg-background text-muted-foreground transition-colors hover:bg-muted"
        >
          <ChevronsRight className="h-4 w-4" />
        </button>
      </div>
    );
  }

  const slide = SLIDES[index]!;

  return (
    <div className="hidden w-[280px] shrink-0 flex-col gap-2 xl:w-[320px] lg:flex">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-muted-foreground">Promo</span>
        <button
          type="button"
          onClick={onToggleCollapsed}
          title="Ciutkan banner"
          aria-label="Ciutkan banner"
          className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted"
        >
          <ChevronsLeft className="h-4 w-4" />
        </button>
      </div>

      <div className={cn("relative aspect-[4/5] w-full overflow-hidden rounded-2xl bg-gradient-to-br p-6 text-white shadow-sm", slide.gradient)}>
        <div className="pointer-events-none absolute -right-10 -top-10 h-40 w-40 rounded-full bg-white/10 blur-2xl" />
        <div className="pointer-events-none absolute -bottom-16 -left-10 h-48 w-48 rounded-full bg-white/10 blur-2xl" />

        <div className="relative flex h-full flex-col justify-end gap-2">
          <h3 className="text-lg font-bold leading-snug text-balance">{slide.title}</h3>
          <p className="text-sm text-white/80">{slide.description}</p>
        </div>

        {SLIDES.length > 1 && (
          <>
            <button
              type="button"
              onClick={() => go(-1)}
              aria-label="Slide sebelumnya"
              className="absolute left-2 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-full bg-black/20 text-white transition-colors hover:bg-black/35"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={() => go(1)}
              aria-label="Slide berikutnya"
              className="absolute right-2 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-full bg-black/20 text-white transition-colors hover:bg-black/35"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </>
        )}
      </div>

      {SLIDES.length > 1 && (
        <div className="flex items-center justify-center gap-1.5">
          {SLIDES.map((s, i) => (
            <button
              key={s.title}
              type="button"
              onClick={() => setIndex(i)}
              aria-label={`Ke slide ${i + 1}`}
              className={cn("h-1.5 rounded-full transition-all", i === index ? "w-5 bg-primary-600" : "w-1.5 bg-border")}
            />
          ))}
        </div>
      )}
    </div>
  );
}
