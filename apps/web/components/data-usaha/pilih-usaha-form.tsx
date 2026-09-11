"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { Building2, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FormField } from "@/components/ui/form-field";
import { Skeleton } from "@/components/ui/skeleton";
import { api } from "@/lib/api-client";
import { ACTIVE_DATA_USAHA_COOKIE } from "@/lib/active-data-usaha-cookie";

type DataUsahaRow = { id: string; name: string; accurateConnectionId: string | null };

const createSchema = z.object({ name: z.string().min(1, "Nama wajib diisi").max(200) });
type CreateFormValues = z.infer<typeof createSchema>;

// § cookie preferensi tampilan MURNI (lihat `lib/active-data-usaha.ts`) —
// non-httpOnly SENGAJA, supaya bisa diset langsung dari client TANPA
// round-trip Server Action (konsisten konvensi project: form pakai
// react-hook-form + `lib/api-client.ts`, bukan Server Action — §
// apps/web/CLAUDE.md).
function setActiveDataUsahaCookie(id: string) {
  const maxAge = 60 * 60 * 24 * 365;
  document.cookie = `${ACTIVE_DATA_USAHA_COOKIE}=${id}; path=/; max-age=${maxAge}; samesite=lax`;
}

export function PilihUsahaForm() {
  const router = useRouter();
  const [rows, setRows] = useState<DataUsahaRow[] | null>(null);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const form = useForm<CreateFormValues>({ resolver: zodResolver(createSchema) });

  useEffect(() => {
    async function load() {
      const res = await api.me["data-usaha"].get();
      const list = (res.data as unknown as { dataUsaha: DataUsahaRow[] } | undefined)?.dataUsaha ?? [];
      setRows(list);
      setShowCreateForm(list.length === 0);
    }
    load();
  }, []);

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

  if (!rows) {
    return (
      <div className="flex flex-col gap-2">
        <Skeleton className="h-14 w-full" />
        <Skeleton className="h-14 w-full" />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {rows.length > 0 && (
        <div className="flex flex-col gap-2">
          {rows.map((row) => (
            <button
              key={row.id}
              type="button"
              onClick={() => select(row.id)}
              className="flex items-center gap-3 rounded-xl border border-border/60 px-4 py-3 text-left transition-colors hover:border-primary-300 hover:bg-primary-50"
            >
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary-100 text-primary-700">
                <Building2 className="h-4 w-4" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium text-foreground">{row.name}</span>
                <span className="block text-xs text-muted-foreground">
                  {row.accurateConnectionId ? "Terhubung Accurate" : "Belum terhubung Accurate"}
                </span>
              </span>
            </button>
          ))}
        </div>
      )}

      {showCreateForm ? (
        <form onSubmit={form.handleSubmit(onCreate)} className="flex flex-col gap-3 rounded-xl border border-border/60 p-4">
          <FormField label="Nama Data Usaha" error={form.formState.errors.name?.message} hint='Contoh: "PT Maju Sejahtera" — bisa diganti namanya nanti.'>
            <Input autoFocus placeholder="Nama perusahaan/unit bisnis" {...form.register("name")} />
          </FormField>
          <div className="flex gap-2">
            <Button type="submit" loading={form.formState.isSubmitting} className="flex-1">
              Buat & Masuk
            </Button>
            {rows.length > 0 && (
              <Button type="button" variant="outline" onClick={() => setShowCreateForm(false)}>
                Batal
              </Button>
            )}
          </div>
        </form>
      ) : (
        <Button type="button" variant="outline" onClick={() => setShowCreateForm(true)} className="gap-2">
          <Plus className="h-4 w-4" />
          Buat Data Usaha Baru
        </Button>
      )}
    </div>
  );
}
