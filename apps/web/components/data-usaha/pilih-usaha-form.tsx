"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { Building2, Pencil, Plus, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FormField } from "@/components/ui/form-field";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { api } from "@/lib/api-client";
import { ACTIVE_DATA_USAHA_COOKIE } from "@/lib/active-data-usaha-cookie";
import { PilihUsahaHeader } from "./pilih-usaha-header";
import { BannerSlider, BANNER_COLLAPSE_STORAGE_KEY } from "./banner-slider";

// § Fase 110, architecture-user-tambahan.md — `isOwner: false` = Data
// Usaha ini BUKAN milik user (dia numpang lewat seat User Tambahan aktif,
// § GET /me/data-usaha union kepemilikan+seat) — ditandai badge "Anggota"
// biar user tidak bingung kenapa ada Data Usaha "orang lain" di daftarnya.
type DataUsahaRow = { id: string; name: string; accurateConnectionId: string | null; isOwner: boolean };

const createSchema = z.object({ name: z.string().min(1, "Nama wajib diisi").max(200) });
type CreateFormValues = z.infer<typeof createSchema>;

function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  return (parts[0]![0]! + parts[1]![0]!).toUpperCase();
}

const AVATAR_PALETTE = ["bg-primary-600", "bg-sky-600", "bg-emerald-600", "bg-amber-600", "bg-violet-600", "bg-rose-600"];
function avatarColor(seed: string) {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
  return AVATAR_PALETTE[hash % AVATAR_PALETTE.length]!;
}

// § cookie preferensi tampilan MURNI (lihat `lib/active-data-usaha.ts`) —
// non-httpOnly SENGAJA, supaya bisa diset langsung dari client TANPA
// round-trip Server Action (konsisten konvensi project: form pakai
// react-hook-form + `lib/api-client.ts`, bukan Server Action — §
// apps/web/CLAUDE.md).
function setActiveDataUsahaCookie(id: string) {
  const maxAge = 60 * 60 * 24 * 365;
  document.cookie = `${ACTIVE_DATA_USAHA_COOKIE}=${id}; path=/; max-age=${maxAge}; samesite=lax`;
}

// § diminta user 2026-09-11 — redesain gerbang "Pilih Data Usaha" mengikuti
// pola visual Accurate Online (referensi screenshot user): header custom
// (§ `PilihUsahaHeader`) + banner promo collapsible di kiri (§
// `BannerSlider`) + grid kartu Data Usaha di kanan (3 kolom saat banner
// tampil, lebih banyak saat diciutkan — spec eksplisit user). Layout BARU
// ini `hidden lg:block` — di bawah breakpoint `lg`, TETAP pakai tampilan
// list-row lama (diminta eksplisit: "ketika mobile tampilannya menjadi
// seperti sekarang card-nya").
export function PilihUsahaForm({
  user,
  logoUrl,
  faviconUrl,
}: {
  user: { name: string; email: string };
  logoUrl?: string;
  faviconUrl?: string;
}) {
  const router = useRouter();
  const [rows, setRows] = useState<DataUsahaRow[] | null>(null);
  const [search, setSearch] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [bannerCollapsed, setBannerCollapsed] = useState(false);
  const [renameTarget, setRenameTarget] = useState<DataUsahaRow | null>(null);
  const form = useForm<CreateFormValues>({ resolver: zodResolver(createSchema) });
  const renameForm = useForm<CreateFormValues>({ resolver: zodResolver(createSchema) });

  useEffect(() => {
    async function load() {
      const res = await api.me["data-usaha"].get();
      const list = (res.data as unknown as { dataUsaha: DataUsahaRow[] } | undefined)?.dataUsaha ?? [];
      setRows(list);
    }
    load();
    try {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- baca localStorage (external system) SEKALI saat mount, pola standar
      setBannerCollapsed(localStorage.getItem(BANNER_COLLAPSE_STORAGE_KEY) === "1");
    } catch {
      // § localStorage bisa gagal (private window dkk) — biarkan default terbuka.
    }
  }, []);

  function toggleBannerCollapsed() {
    setBannerCollapsed((prev) => {
      const next = !prev;
      try {
        localStorage.setItem(BANNER_COLLAPSE_STORAGE_KEY, next ? "1" : "0");
      } catch {
        // § sama seperti di atas.
      }
      return next;
    });
  }

  function select(id: string) {
    setActiveDataUsahaCookie(id);
    router.push("/");
  }

  async function onCreate(values: CreateFormValues) {
    const res = await api.me["data-usaha"].post({ name: values.name });
    if (res.error) {
      toast.error("Gagal membuat Data Usaha. Coba lagi.");
      return;
    }
    const created = res.data as unknown as { id: string };
    select(created.id);
  }

  function openRename(row: DataUsahaRow) {
    setRenameTarget(row);
    renameForm.reset({ name: row.name });
  }

  async function onRename(values: CreateFormValues) {
    if (!renameTarget) return;
    const res = await api.me["data-usaha"]({ id: renameTarget.id }).patch({ name: values.name });
    if (res.error) {
      toast.error("Gagal mengubah nama. Coba lagi.");
      return;
    }
    const updated = res.data as unknown as { name: string };
    setRows((prev) => prev?.map((r) => (r.id === renameTarget.id ? { ...r, name: updated.name } : r)) ?? prev);
    toast.success("Nama Data Usaha berhasil diubah.");
    setRenameTarget(null);
  }

  const filteredRows = rows?.filter((r) => r.name.toLowerCase().includes(search.trim().toLowerCase())) ?? null;

  return (
    <div className="flex min-h-screen flex-col bg-muted/20">
      <PilihUsahaHeader user={user} logoUrl={logoUrl} faviconUrl={faviconUrl} />

      {/* § Desktop (>= lg): banner + grid. Lihat komentar di atas untuk alasan breakpoint. */}
      <div className="mx-auto hidden w-full max-w-6xl flex-1 gap-6 p-6 lg:flex">
        <BannerSlider collapsed={bannerCollapsed} onToggleCollapsed={toggleBannerCollapsed} />

        <div className="flex min-w-0 flex-1 flex-col gap-4">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <span className="h-6 w-1 rounded-full bg-primary-600" />
              <h1 className="text-lg font-semibold text-foreground">Data Usaha</h1>
              <Button size="sm" className="h-8 w-8 rounded-full p-0" onClick={() => setCreateOpen(true)} aria-label="Buat Data Usaha baru">
                <Plus className="h-4 w-4" />
              </Button>
            </div>
            <div className="relative w-64">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input placeholder="Cari Data Usaha" value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
            </div>
          </div>

          {!filteredRows ? (
            <div className={cn("grid gap-4", bannerCollapsed ? "grid-cols-3 xl:grid-cols-5 2xl:grid-cols-6" : "grid-cols-2 xl:grid-cols-3")}>
              {Array.from({ length: bannerCollapsed ? 5 : 3 }).map((_, i) => (
                <Skeleton key={i} className="aspect-[4/3] w-full rounded-xl" />
              ))}
            </div>
          ) : filteredRows.length === 0 && rows!.length === 0 ? (
            <EmptyState
              icon={Building2}
              title="Belum ada Data Usaha"
              description='Klik tombol "+" di atas untuk membuat Data Usaha pertamamu.'
            />
          ) : filteredRows.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              Tidak ada Data Usaha yang cocok dengan pencarian &quot;{search}&quot;.
            </p>
          ) : (
            <div className={cn("grid gap-4", bannerCollapsed ? "grid-cols-3 xl:grid-cols-5 2xl:grid-cols-6" : "grid-cols-2 xl:grid-cols-3")}>
              {filteredRows.map((row) => (
                <div
                  key={row.id}
                  role="button"
                  tabIndex={0}
                  onClick={() => select(row.id)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") select(row.id);
                  }}
                  className="group flex cursor-pointer flex-col overflow-hidden rounded-xl border border-border/60 bg-background text-left shadow-sm transition-all hover:-translate-y-0.5 hover:border-primary-300 hover:shadow-md"
                >
                  <span className="relative flex aspect-[4/3] items-center justify-center bg-muted/40">
                    {row.isOwner ? (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          openRename(row);
                        }}
                        title="Ubah nama"
                        aria-label={`Ubah nama ${row.name}`}
                        className="absolute left-2 top-2 flex h-6 w-6 items-center justify-center rounded-full bg-background/80 text-muted-foreground opacity-0 shadow-sm transition-opacity hover:text-foreground group-hover:opacity-100"
                      >
                        <Pencil className="h-3 w-3" />
                      </button>
                    ) : (
                      <Badge variant="default" className="absolute right-2 top-2">
                        Anggota
                      </Badge>
                    )}
                    <span
                      className={cn(
                        "flex h-14 w-14 items-center justify-center rounded-full text-lg font-bold text-white",
                        avatarColor(row.id),
                      )}
                    >
                      {initials(row.name)}
                    </span>
                  </span>
                  <span className="flex flex-col gap-0.5 bg-primary-600 px-3 py-2 text-white">
                    <span className="truncate text-sm font-medium">{row.name}</span>
                    <span className="truncate text-[11px] text-white/75">
                      {row.accurateConnectionId ? "Terhubung Accurate" : "Belum terhubung Accurate"}
                    </span>
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* § Mobile/tablet (< lg): layout list-row lama, dipertahankan APA
          ADANYA (diminta eksplisit user), cuma dibungkus header baru. */}
      <div className="mx-auto flex w-full max-w-md flex-1 flex-col gap-4 p-6 lg:hidden">
        {!rows ? (
          <div className="flex flex-col gap-2">
            <Skeleton className="h-14 w-full" />
            <Skeleton className="h-14 w-full" />
          </div>
        ) : (
          <>
            {rows.length > 0 && (
              <div className="flex flex-col gap-2">
                {rows.map((row) => (
                  <div
                    key={row.id}
                    role="button"
                    tabIndex={0}
                    onClick={() => select(row.id)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") select(row.id);
                    }}
                    className="flex cursor-pointer items-center gap-3 rounded-xl border border-border/60 px-4 py-3 text-left transition-colors hover:border-primary-300 hover:bg-primary-50"
                  >
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary-100 text-primary-700">
                      <Building2 className="h-4 w-4" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-1.5">
                        <span className="block truncate text-sm font-medium text-foreground">{row.name}</span>
                        {!row.isOwner && (
                          <span className="shrink-0 rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
                            Anggota
                          </span>
                        )}
                      </span>
                      <span className="block text-xs text-muted-foreground">
                        {row.accurateConnectionId ? "Terhubung Accurate" : "Belum terhubung Accurate"}
                      </span>
                    </span>
                    {row.isOwner && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          openRename(row);
                        }}
                        title="Ubah nama"
                        aria-label={`Ubah nama ${row.name}`}
                        className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}

            <Button type="button" variant="outline" onClick={() => setCreateOpen(true)} className="gap-2">
              <Plus className="h-4 w-4" />
              Buat Data Usaha Baru
            </Button>
          </>
        )}
      </div>

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Buat Data Usaha Baru</DialogTitle>
          </DialogHeader>
          <form onSubmit={form.handleSubmit(onCreate)} className="flex flex-col gap-4">
            <FormField label="Nama Data Usaha" error={form.formState.errors.name?.message} hint='Contoh: "PT Maju Sejahtera" — bisa diganti namanya nanti.'>
              <Input autoFocus placeholder="Nama perusahaan/unit bisnis" {...form.register("name")} />
            </FormField>
            <DialogFooter>
              <Button type="submit" loading={form.formState.isSubmitting} className="w-full">
                Buat & Masuk
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={!!renameTarget} onOpenChange={(open) => !open && setRenameTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Ubah Nama Data Usaha</DialogTitle>
          </DialogHeader>
          <form onSubmit={renameForm.handleSubmit(onRename)} className="flex flex-col gap-4">
            <FormField label="Nama Data Usaha" error={renameForm.formState.errors.name?.message}>
              <Input autoFocus placeholder="Nama perusahaan/unit bisnis" {...renameForm.register("name")} />
            </FormField>
            <DialogFooter>
              <Button type="submit" loading={renameForm.formState.isSubmitting} className="w-full">
                Simpan
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
