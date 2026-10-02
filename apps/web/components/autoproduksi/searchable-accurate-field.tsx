"use client";

import { useState } from "react";
import { Combobox } from "@/components/ui/combobox";
import { Input } from "@/components/ui/input";

// § diminta client 2026-09-30 — search Accurate (Barang/Gudang) TIDAK
// selalu ketemu (mis. search ternyata cuma cocok ke NAMA, bukan kode "no"
// — dikonfirmasi manual oleh client, § lessons-learned.md). `Combobox`
// sendiri TIDAK diubah (dipakai lintas project, § architecture doc "WAJIB
// dipakai ulang") — toggle manual ini LOKAL ke komponen ini: swap ke
// `Input` polos kalau user klik "Isi manual", supaya kode yang tidak
// ketemu di search tetap bisa diisi tangan sebagai fallback.
// § Fase 168 — diekstrak dari `formulas/page.tsx` ke sini (BUKAN definisi
// baru) karena sekarang dipakai DUA halaman (`formulas/page.tsx` DAN
// `input/page.tsx`, § Gudang Barang Jadi/Gudang Bahan Baku di Input
// Produksi) — perilaku TIDAK berubah, cuma lokasinya.
export function SearchableField({
  value,
  onChange,
  onSearch,
  options,
  placeholder,
}: {
  value: string;
  onChange: (value: string) => void;
  onSearch: (query: string) => void;
  options: { value: string; label: string }[];
  placeholder: string;
}) {
  const [manual, setManual] = useState(false);
  return (
    <div className="flex flex-col gap-1">
      {manual ? (
        <Input value={value} onChange={(e) => onChange(e.target.value)} placeholder="Ketik kode manual..." />
      ) : (
        <Combobox value={value} onChange={onChange} onSearch={onSearch} placeholder={placeholder} options={options} />
      )}
      <button
        type="button"
        onClick={() => setManual((m) => !m)}
        className="self-start text-[11px] text-muted-foreground underline decoration-dotted hover:text-foreground"
      >
        {manual ? "Cari di Accurate lagi" : "Tidak ketemu? Isi manual"}
      </button>
    </div>
  );
}
