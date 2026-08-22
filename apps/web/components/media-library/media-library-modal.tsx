// Versi DASAR untuk Fase 00 — picker + upload langsung, belum fitur
// WordPress-like penuh (grid/search/filter, dst — lihat
// docs/architecture/components/architecture-component-media-library.md,
// menyusul di fase yang benar-benar butuh).
"use client";

import { useState } from "react";
import { Dialog, DialogContent, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api-client";

type MediaLibraryPickerProps = {
  trigger: React.ReactNode;
  onSelect: (selected: { id: string; url: string; altText: string | null }) => void;
};

export function MediaLibraryModal({ trigger, onSelect }: MediaLibraryPickerProps) {
  const [open, setOpen] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleFile(file: File) {
    setUploading(true);
    setError(null);
    const res = await api.media.upload.post({ file });
    setUploading(false);
    // § docs/decisions/adr-0010-response-format-eden.md — sukses: res.data
    // langsung berisi payload (bare, TANPA wrapper {data,error} manual di
    // server, sudah diperbaiki). Error non-2xx: res.error = { status, value }
    // dari Eden. SATU limitasi Eden yang TERSISA (sempit, BUKAN double-wrap
    // bug yang sudah diperbaiki di tempat lain): untuk route `t.File()`
    // (multipart) spesifik, Eden infer tipe sukses jadi `{}` kosong — jenis
    // route lain (JSON biasa) infer benar tanpa perlu ini. `as` di bawah
    // SUDAH diverifikasi manual lewat curl (shape response nyata cocok).
    if (res.error || !res.data) {
      setError("Upload gagal — cek tipe file (JPEG/PNG/WebP) & ukuran (maks 5MB).");
      return;
    }
    const uploaded = res.data as { id: string; storageKey: string; altText: string | null };
    onSelect({ id: uploaded.id, url: uploaded.storageKey, altText: uploaded.altText });
    setOpen(false);
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent>
        <DialogTitle className="mb-4 text-lg font-medium">Pilih atau Upload Gambar</DialogTitle>
        <input
          type="file"
          accept="image/*"
          disabled={uploading}
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void handleFile(file);
          }}
          className="block w-full text-sm"
        />
        {uploading && <p className="mt-2 text-sm text-neutral-500">Mengupload...</p>}
        {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
        <div className="mt-4 flex justify-end">
          <Button variant="outline" onClick={() => setOpen(false)}>
            Batal
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
