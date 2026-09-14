"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from "lucide-react";
import { cn } from "@/lib/utils";

// § Fase 116, architecture-promo.md — `title`/`description`/`buttonLabel`
// ALL-OR-NOTHING (divalidasi backend, § admin/promos.route.ts): ketiganya
// null = mode "gambar jadi link langsung", ketiganya terisi = mode
// "kartu + tombol". Field lain (`isActive`/`sortOrder`/`createdBy`) SENGAJA
// tidak ada di sini — endpoint publik `GET /promos` sudah memperkecil
// response ke field yang dipakai render saja.
type Promo = {
  id: string;
  title: string | null;
  description: string | null;
  buttonLabel: string | null;
  url: string;
  imageUrl: string;
};

const AUTOPLAY_MS = 6000;
export const BANNER_COLLAPSE_STORAGE_KEY = "facport-pilih-usaha-banner-collapsed";

// § Fase 116 — komponen ini SEBELUMNYA (Fase 109 tambahan, 2026-09-12)
// hardcode 3 slide teks+gradient TANPA gambar/URL sama sekali ("Konten
// SEMENTARA hardcode... belum ada sistem admin untuk kelola banner" —
// dicatat eksplisit sebagai Known Limitation, § phase-109 doc). Fase ini
// menyambungkannya ke `GET /promos` (`api.promos.get()`, dipanggil dari
// PARENT `pilih-usaha-form.tsx`, BUKAN di sini — supaya parent juga tahu
// kalau 0 promo aktif untuk atur ulang lebar grid Data Usaha di
// sebelahnya) SEKALIGUS nambah kapabilitas gambar+link+tombol yang belum
// pernah ada. Mekanisme slider (autoplay/dot/chevron/collapse) DIPERTAHANKAN
// APA ADANYA dari versi lama, cuma sumber & isi tiap slide yang berubah.
//
// § Controlled dari parent — state collapse dipakai JUGA oleh grid Data
// Usaha di sebelahnya (3 kolom saat banner tampil, 5-6 saat diciutkan).
// Rasio slide 4:5 (`aspect-[4/5]`) — diminta eksplisit user, "kayak
// ukuran instagram post".
export function BannerSlider({
  promos,
  collapsed,
  onToggleCollapsed,
}: {
  promos: Promo[];
  collapsed: boolean;
  onToggleCollapsed: () => void;
}) {
  const [index, setIndex] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (collapsed || promos.length === 0) return;
    timerRef.current = setInterval(() => setIndex((i) => (i + 1) % promos.length), AUTOPLAY_MS);
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [collapsed, promos.length]);

  // § 0 promo aktif — TIDAK render apa pun (bukan cuma "banner kosong"),
  // termasuk saat `collapsed` (tidak ada gunanya tombol "tampilkan"
  // kalau isinya kosong). Parent (`pilih-usaha-form.tsx`) sudah
  // menghitung ini ke `effectiveCollapsed` buat lebar grid, jadi tidak
  // ada ruang kosong yang nyisa.
  if (promos.length === 0) return null;

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

  const promo = promos[index % promos.length]!;
  // § mode kartu+tombol vs mode gambar-klik — lihat komentar type `Promo` di atas.
  const isCardMode = !!(promo.title && promo.description && promo.buttonLabel);

  function go(delta: number) {
    setIndex((i) => (i + delta + promos.length) % promos.length);
  }

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

      <div className="relative aspect-[4/5] w-full overflow-hidden rounded-2xl bg-muted shadow-sm">
        {isCardMode ? (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={promo.imageUrl} alt="" className="absolute inset-0 h-full w-full object-cover" />
            {/* § scrim gelap di atas gambar — jaga kontras teks putih,
                gambar admin bisa terang/gelap apa pun. */}
            <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/30 to-transparent" />
            <div className="relative flex h-full flex-col justify-end gap-2 p-6 text-white">
              <h3 className="text-lg font-bold leading-snug text-balance">{promo.title}</h3>
              <p className="text-sm text-white/80">{promo.description}</p>
              <a
                href={promo.url}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-1 inline-flex w-fit items-center rounded-lg bg-white px-3 py-1.5 text-xs font-semibold text-primary-700 transition-colors hover:bg-white/90"
              >
                {promo.buttonLabel}
              </a>
            </div>
          </>
        ) : (
          <a href={promo.url} target="_blank" rel="noopener noreferrer" className="absolute inset-0 block">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={promo.imageUrl} alt="Promo" className="h-full w-full object-cover" />
          </a>
        )}

        {promos.length > 1 && (
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

      {promos.length > 1 && (
        <div className="flex items-center justify-center gap-1.5">
          {promos.map((p, i) => (
            <button
              key={p.id}
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
