// Halaman SEMENTARA cuma buat verifikasi visual Fase 00 (Combobox +
// MediaLibraryModal) — dihapus/diganti pas Fase 01 bikin landing beneran.
"use client";

import { useState } from "react";
import { Combobox } from "@/components/ui/combobox";
import { MediaLibraryModal } from "@/components/media-library/media-library-modal";
import { Button } from "@/components/ui/button";

const MODULE_OPTIONS = [
  { value: "penjualan", label: "Modul Penjualan" },
  { value: "pembelian", label: "Modul Pembelian" },
  { value: "persediaan", label: "Modul Persediaan" },
  { value: "manufaktur", label: "Modul Manufaktur" },
  { value: "kas-bank", label: "Modul Kas & Bank" },
];

export default function ComponentsTestPage() {
  const [selectedModule, setSelectedModule] = useState<string>();
  const [selectedMedia, setSelectedMedia] = useState<string>();

  return (
    <main className="mx-auto flex max-w-md flex-col gap-8 p-8">
      <h1 className="text-xl font-semibold">Fase 00 — Test Komponen</h1>

      <section className="flex flex-col gap-2">
        <label className="text-sm font-medium">Combobox</label>
        <Combobox
          options={MODULE_OPTIONS}
          value={selectedModule}
          onChange={setSelectedModule}
          placeholder="Pilih modul..."
        />
        {selectedModule && <p className="text-sm text-neutral-500">Dipilih: {selectedModule}</p>}
      </section>

      <section className="flex flex-col gap-2">
        <label className="text-sm font-medium">Media Library Modal</label>
        <MediaLibraryModal
          trigger={<Button variant="outline">Pilih / Upload Gambar</Button>}
          onSelect={(media) => setSelectedMedia(media.url)}
        />
        {selectedMedia && <p className="break-all text-sm text-neutral-500">storageKey: {selectedMedia}</p>}
      </section>
    </main>
  );
}
