"use client";

import { useEffect, useState } from "react";

// § Fase 87 — indikator progres saat import besar (1000-20000 baris)
// sedang diproses, dipakai LINTAS 6 fitur import (pola sama
// `editable-grid.tsx`: generic, module-agnostic, semua data dioper
// lewat props oleh halaman pemanggil).
//
// Bar % di komponen ini ASLI (dihitung dari `processed`/`total`, data
// yang SUDAH ada lewat polling 3 detik yang sudah berjalan sejak awal
// di tiap halaman detail batch) — BUKAN animasi.
//
// Teks berputar di bawahnya SENGAJA cosmetic/ambient (siklus berbasis
// waktu, TIDAK sinkron ke baris/step literal yang sedang diproses) —
// project ini TIDAK punya event stream real-time dari backend (no
// websocket/SSE, cuma polling agregat), jadi tidak mungkin menampilkan
// "sekarang baris ke-X" yang akurat tanpa perubahan backend besar (di
// luar scope fase ini, § architecture-component-import-progress.md).
export const DEFAULT_IMPORT_PROGRESS_MESSAGES = [
  "Membaca data Excel...",
  "Menghubungi Accurate...",
  "Memvalidasi baris...",
  "Mengirim data...",
  "Menunggu balasan Accurate...",
  "Memastikan tersimpan...",
  "Lanjut ke baris berikutnya...",
];
const DEFAULT_MESSAGE_INTERVAL_MS = 2500;

export function ImportProgress({
  status,
  total,
  processed,
  messages = DEFAULT_IMPORT_PROGRESS_MESSAGES,
  messageIntervalMs = DEFAULT_MESSAGE_INTERVAL_MS,
}: {
  status: string;
  total: number;
  processed: number;
  messages?: string[];
  messageIntervalMs?: number;
}) {
  const isProcessing = status === "processing";
  const [messageIndex, setMessageIndex] = useState(0);

  useEffect(() => {
    if (!isProcessing) return;
    const interval = setInterval(() => {
      setMessageIndex((i) => (i + 1) % messages.length);
    }, messageIntervalMs);
    return () => clearInterval(interval);
  }, [isProcessing, messages.length, messageIntervalMs]);

  // § belum mulai diproses sama sekali — tidak ada apa pun untuk ditampilkan.
  if (status === "mapping_pending") return null;

  const percent = total > 0 ? Math.min(100, Math.round((processed / total) * 100)) : 0;

  return (
    <div className="flex flex-col gap-1.5">
      <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
        <div
          className="h-full rounded-full bg-primary-600 transition-[width] duration-500 ease-out motion-reduce:transition-none"
          style={{ width: `${percent}%` }}
        />
      </div>
      {isProcessing && (
        <p className="text-xs text-muted-foreground" aria-live="polite">
          {messages[messageIndex % messages.length]} ({percent}%)
        </p>
      )}
    </div>
  );
}
