"use client";

import { useEffect, useState } from "react";
import { Pencil, Trash2, ImageOff } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { PageHeader } from "@/components/ui/page-header";
import { DataTable, createDataTableColumns } from "@/components/ui/data-table";
import { TruncateText } from "@/components/ui/truncate-text";
import { api } from "@/lib/api-client";

// § Fase 116, architecture-promo.md
type Promo = {
  id: string;
  title: string | null;
  description: string | null;
  buttonLabel: string | null;
  url: string;
  imageUrl: string;
  isActive: boolean;
  sortOrder: number;
};

// § title/description/buttonLabel ALL-OR-NOTHING — pola sama backend
// (`validatePromoTextFields`, admin/promos.route.ts), JANGAN duplikasi
// logic-nya beda antara sini & server kalau berubah nanti.
function validateTextFields(title: string, description: string, buttonLabel: string): string | null {
  const filled = [title, description, buttonLabel].filter((v) => v.trim() !== "");
  if (filled.length > 0 && filled.length < 3) {
    return 'Title, Deskripsi, dan Label Tombol harus diisi SEMUA (mode kartu+tombol) atau DIKOSONGKAN SEMUA (mode gambar-klik) — tidak bisa sebagian.';
  }
  return null;
}

function PromoFormDialog({ promo, onSaved }: { promo?: Promo; onSaved: () => void }) {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState(promo?.title ?? "");
  const [description, setDescription] = useState(promo?.description ?? "");
  const [buttonLabel, setButtonLabel] = useState(promo?.buttonLabel ?? "");
  const [url, setUrl] = useState(promo?.url ?? "");
  const [imageUrl, setImageUrl] = useState(promo?.imageUrl ?? "");
  const [isActive, setIsActive] = useState(promo?.isActive ?? true);
  const [uploading, setUploading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function openDialog() {
    setOpen(true);
    setTitle(promo?.title ?? "");
    setDescription(promo?.description ?? "");
    setButtonLabel(promo?.buttonLabel ?? "");
    setUrl(promo?.url ?? "");
    setImageUrl(promo?.imageUrl ?? "");
    setIsActive(promo?.isActive ?? true);
    setError(null);
  }

  async function handleImageChange(file: File | undefined) {
    if (!file) return;
    setUploading(true);
    setError(null);
    const res = await api.admin.promos.image.post({ file });
    setUploading(false);
    if (res.error || !res.data) {
      setError("Upload gambar gagal — cek tipe file (JPEG/PNG/WebP) & ukuran (maks 5MB).");
      return;
    }
    setImageUrl((res.data as { url: string }).url);
  }

  async function handleSave() {
    const textError = validateTextFields(title, description, buttonLabel);
    if (textError) {
      setError(textError);
      return;
    }
    if (!url.trim()) {
      setError("URL wajib diisi.");
      return;
    }
    // § security review Fase 116 (Medium) — validasi skema di sini SEKADAR
    // UX (feedback cepat), backend (`admin/promos.route.ts` `validatePromoUrlScheme`)
    // TETAP sumber kebenaran WAJIB — cegah `javascript:` URI yang bisa
    // dieksekusi customer saat klik promo.
    try {
      const parsed = new URL(url.trim());
      if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
        setError("URL harus diawali http:// atau https://");
        return;
      }
    } catch {
      setError("Format URL tidak valid.");
      return;
    }
    if (!imageUrl) {
      setError("Upload gambar dulu.");
      return;
    }
    setSubmitting(true);
    setError(null);
    const body = {
      title: title.trim() || undefined,
      description: description.trim() || undefined,
      buttonLabel: buttonLabel.trim() || undefined,
      url: url.trim(),
      imageUrl,
      isActive,
    };
    const res = promo ? await api.admin.promos({ id: promo.id }).patch(body) : await api.admin.promos.post(body);
    setSubmitting(false);
    if (res.error) {
      setError("Gagal menyimpan promo.");
      return;
    }
    toast.success(promo ? "Promo diperbarui." : "Promo dibuat.");
    setOpen(false);
    onSaved();
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      {promo ? (
        <button
          type="button"
          onClick={openDialog}
          title="Edit"
          aria-label={`Edit promo ${promo.title ?? promo.id}`}
          className={buttonVariants("ghost", "h-8 w-8 p-0")}
        >
          <Pencil className="h-4 w-4" />
        </button>
      ) : (
        <Button onClick={openDialog}>Tambah Promo</Button>
      )}
      <DialogContent className="max-w-lg">
        <DialogTitle>{promo ? "Edit Promo" : "Tambah Promo"}</DialogTitle>
        <div className="mt-3 flex flex-col gap-4 text-sm">
          <label className="flex flex-col gap-1.5">
            <span className="text-xs font-medium text-foreground">Gambar</span>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            {imageUrl && <img src={imageUrl} alt="Preview promo" className="h-32 w-full rounded-lg border border-border object-cover" />}
            <Input type="file" accept="image/jpeg,image/png,image/webp" disabled={uploading} onChange={(e) => handleImageChange(e.target.files?.[0])} />
            {uploading && <span className="text-xs text-muted-foreground">Mengupload...</span>}
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-xs font-medium text-foreground">URL Tujuan</span>
            <Input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://..." />
          </label>
          <div className="flex flex-col gap-1.5 rounded-lg border border-border/60 p-3">
            <span className="text-xs font-medium text-foreground">
              Title, Deskripsi &amp; Label Tombol <span className="font-normal text-muted-foreground">(opsional — isi semua atau kosongkan semua)</span>
            </span>
            <span className="text-xs text-muted-foreground">
              Diisi semua → tampil sebagai kartu dengan tombol. Dikosongkan semua → seluruh gambar jadi link yang bisa diklik langsung.
            </span>
            <Input className="mt-1" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Title" />
            <Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} placeholder="Deskripsi singkat" />
            <Input value={buttonLabel} onChange={(e) => setButtonLabel(e.target.value)} placeholder='Label tombol, mis. "Selengkapnya"' />
          </div>
          <label className="flex items-center gap-2">
            <Checkbox checked={isActive} onCheckedChange={(checked) => setIsActive(checked === true)} />
            <span className="text-xs font-medium text-foreground">Aktif</span>
          </label>
          {error && <p className="text-destructive">{error}</p>}
          <Button onClick={handleSave} disabled={submitting || uploading} className="self-end">
            {submitting ? "Menyimpan..." : "Simpan"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

const columnHelper = createDataTableColumns<Promo>();

export default function AdminPromosPage() {
  const [promos, setPromos] = useState<Promo[] | null>(null);

  async function load() {
    const res = await api.admin.promos.get();
    if (res.data) setPromos([...(res.data as unknown as { promos: Promo[] }).promos].sort((a, b) => a.sortOrder - b.sortOrder));
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch data awal saat mount, pola standar (sama admin/announcements/page.tsx)
    load();
  }, []);

  async function handleDelete(promo: Promo) {
    const res = await api.admin.promos({ id: promo.id }).delete();
    if (res.error) {
      toast.error("Gagal menghapus promo.");
      return;
    }
    toast.success("Promo dihapus.");
    load();
  }

  // § maksimal 5 promo AKTIF yang tampil di slider (diminta user, §
  // `GET /promos` `LIMIT 5 ORDER BY sortOrder`) — dihitung ULANG di sini
  // (client-side, urutan SAMA PERSIS: `isActive` lalu `sortOrder` ASC)
  // MURNI buat kasih indikator visual ke admin, BUKAN sumber kebenaran
  // (backend yang menentukan apa yang beneran tampil).
  const visiblePromoIds = new Set(
    (promos ?? [])
      .filter((p) => p.isActive)
      .sort((a, b) => a.sortOrder - b.sortOrder)
      .slice(0, 5)
      .map((p) => p.id),
  );

  // § ADR-0034 (2026-09-17) — width eksplisit + "Title" (bebas, bisa
  // panjang) dibungkus `TruncateText`.
  const columns = [
    columnHelper.display({
      id: "image",
      header: "Gambar",
      meta: { width: "72px" },
      cell: ({ row }) =>
        row.original.imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={row.original.imageUrl} alt="" className="h-10 w-16 rounded object-cover" />
        ) : (
          <ImageOff className="h-5 w-5 text-muted-foreground" />
        ),
    }),
    columnHelper.display({
      id: "title",
      header: "Title",
      meta: { width: "28%" },
      cell: ({ row }) =>
        row.original.title ? (
          <TruncateText className="font-medium text-foreground">{row.original.title}</TruncateText>
        ) : (
          <span className="text-xs text-muted-foreground">(mode gambar-klik)</span>
        ),
    }),
    columnHelper.display({
      id: "status",
      header: "Status",
      meta: { width: "14%" },
      cell: ({ row }) => <Badge variant={row.original.isActive ? "success" : "default"}>{row.original.isActive ? "Aktif" : "Nonaktif"}</Badge>,
    }),
    columnHelper.display({
      id: "visible",
      header: "Tampil di Slider",
      meta: { width: "22%" },
      cell: ({ row }) =>
        row.original.isActive && visiblePromoIds.has(row.original.id) ? (
          <Badge variant="success">Tampil</Badge>
        ) : (
          <span className="text-xs text-muted-foreground">{row.original.isActive ? "Tidak tampil (>5 aktif)" : "-"}</span>
        ),
    }),
    columnHelper.accessor("sortOrder", { header: "Urutan", meta: { width: "12%" }, cell: (ctx) => ctx.getValue() }),
    columnHelper.display({
      id: "actions",
      header: "Aksi",
      meta: { width: "88px" },
      cell: ({ row }) => (
        <div className="flex items-center justify-end gap-1">
          <PromoFormDialog promo={row.original} onSaved={load} />
          <button
            type="button"
            onClick={() => handleDelete(row.original)}
            title="Hapus"
            aria-label={`Hapus promo ${row.original.title ?? row.original.id}`}
            className={buttonVariants("ghost", "h-8 w-8 p-0 text-destructive hover:text-destructive")}
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      ),
    }),
  ];

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Promo"
        description="Banner promo di gerbang Pilih Data Usaha — maksimal 5 yang tampil sekaligus, urut sesuai kolom Urutan."
        action={<PromoFormDialog onSaved={load} />}
      />

      <Card>
        <CardHeader>
          <CardTitle>Daftar Promo</CardTitle>
          <CardDescription>Isi Title+Deskripsi+Label Tombol untuk mode kartu, atau kosongkan semua untuk mode gambar-klik.</CardDescription>
        </CardHeader>
        <CardContent>
          {!promos ? <Skeleton className="h-40 w-full" /> : <DataTable columns={columns} data={promos} emptyIcon={ImageOff} emptyTitle="Belum ada promo" />}
        </CardContent>
      </Card>
    </div>
  );
}
