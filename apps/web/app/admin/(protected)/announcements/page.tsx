"use client";

import { useEffect, useState } from "react";
import { X, Megaphone } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Combobox } from "@/components/ui/combobox";
import { Skeleton } from "@/components/ui/skeleton";
import { PageHeader } from "@/components/ui/page-header";
import { DataTable, createDataTableColumns } from "@/components/ui/data-table";
import { SearchForm } from "@/components/ui/search-form";
import { api } from "@/lib/api-client";
import { formatDate } from "@/lib/utils";
import { useCompanyTimezone } from "@/components/company-timezone-provider";
import { MODULE_OPTIONS, moduleLabel, type ModuleKey } from "@/lib/module-options";

type Announcement = {
  id: string;
  title: string;
  body: string;
  target: "all_customers" | "specific_modules" | "specific_users";
  targetModules: string[] | null;
  targetUserIds: string[] | null;
  recipientCount: number;
  createdAt: string;
};

type UserOption = { id: string; name: string; email: string };

const TARGET_LABEL: Record<Announcement["target"], string> = {
  all_customers: "Semua Customer",
  specific_modules: "Fitur Tertentu",
  specific_users: "User Tertentu",
};

// § Fase 45 — reuse pola Combobox cari-user dari `CreateInvoiceDialog`
// (`admin/invoices/page.tsx`, Fase 26), TAPI multi-select (pengumuman
// bisa ditarget ke banyak user sekaligus, beda dari 1 invoice = 1 user).
function AnnouncementFormDialog({ onCreated }: { onCreated: () => void }) {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [target, setTarget] = useState<Announcement["target"]>("all_customers");
  const [selectedModules, setSelectedModules] = useState<Set<ModuleKey>>(new Set());
  const [userOptions, setUserOptions] = useState<UserOption[]>([]);
  const [selectedUsers, setSelectedUsers] = useState<UserOption[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function openDialog() {
    setOpen(true);
    setTitle("");
    setBody("");
    setTarget("all_customers");
    setSelectedModules(new Set());
    setSelectedUsers([]);
    setError(null);
  }

  function toggleModule(key: ModuleKey) {
    setSelectedModules((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  async function searchUsers(query: string) {
    const res = await api.admin.users.get({ query: { search: query || undefined, limit: 10 } });
    if (res.data) setUserOptions((res.data as unknown as { users: UserOption[] }).users);
  }

  function addUser(userId: string) {
    const found = userOptions.find((u) => u.id === userId);
    if (found && !selectedUsers.some((u) => u.id === userId)) setSelectedUsers((prev) => [...prev, found]);
  }

  function removeUser(userId: string) {
    setSelectedUsers((prev) => prev.filter((u) => u.id !== userId));
  }

  async function handleSubmit() {
    if (!title.trim() || !body.trim()) {
      setError("Judul dan isi pengumuman wajib diisi.");
      return;
    }
    if (target === "specific_modules" && selectedModules.size === 0) {
      setError("Pilih minimal 1 fitur target.");
      return;
    }
    if (target === "specific_users" && selectedUsers.length === 0) {
      setError("Pilih minimal 1 user target.");
      return;
    }
    setSubmitting(true);
    setError(null);
    const res = await api.admin.announcements.post({
      title: title.trim(),
      body: body.trim(),
      target,
      targetModules: target === "specific_modules" ? [...selectedModules] : undefined,
      targetUserIds: target === "specific_users" ? selectedUsers.map((u) => u.id) : undefined,
    });
    setSubmitting(false);
    if (res.error) {
      setError("Gagal membuat pengumuman.");
      return;
    }
    toast.success("Pengumuman sedang dikirim ke penerima.");
    setOpen(false);
    onCreated();
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <Button onClick={openDialog}>Buat Pengumuman</Button>
      <DialogContent className="max-w-lg">
        <DialogTitle>Buat Pengumuman</DialogTitle>
        <div className="mt-3 flex flex-col gap-4 text-sm">
          <label className="flex flex-col gap-1.5">
            <span className="text-xs font-medium text-foreground">Judul</span>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="mis. Maintenance Terjadwal" />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-xs font-medium text-foreground">Isi Pengumuman</span>
            <Textarea value={body} onChange={(e) => setBody(e.target.value)} rows={4} placeholder="Tulis isi pengumuman di sini..." />
          </label>

          <div className="flex flex-col gap-2">
            <span className="text-xs font-medium text-foreground">Target Penerima</span>
            <div className="flex flex-col gap-2" role="radiogroup" aria-label="Target Penerima">
              {(Object.keys(TARGET_LABEL) as Announcement["target"][]).map((t) => (
                <label key={t} className="flex items-center gap-2">
                  <input type="radio" name="target" checked={target === t} onChange={() => setTarget(t)} />
                  {TARGET_LABEL[t]}
                </label>
              ))}
            </div>
          </div>

          {target === "specific_modules" && (
            <div className="flex flex-col gap-1.5 pl-1">
              {MODULE_OPTIONS.map((m) => (
                <label key={m.key} className="flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={selectedModules.has(m.key)} onChange={() => toggleModule(m.key)} />
                  {m.label}
                </label>
              ))}
            </div>
          )}

          {target === "specific_users" && (
            <div className="flex flex-col gap-2 pl-1">
              <Combobox
                options={userOptions.map((u) => ({ value: u.id, label: `${u.name || u.email} (${u.email})` }))}
                onChange={addUser}
                onSearch={searchUsers}
                placeholder="Cari user..."
              />
              {selectedUsers.length > 0 && (
                <ul className="flex flex-col gap-1">
                  {selectedUsers.map((u) => (
                    <li key={u.id} className="flex items-center justify-between rounded-md border border-border px-2 py-1 text-xs">
                      <span>{u.name || u.email}</span>
                      <button type="button" onClick={() => removeUser(u.id)} aria-label={`Hapus ${u.name || u.email}`}>
                        <X className="h-3.5 w-3.5 text-muted-foreground" />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}

          {error && <p className="text-destructive">{error}</p>}
          <Button onClick={handleSubmit} disabled={submitting} className="self-end">
            {submitting ? "Mengirim..." : "Kirim Pengumuman"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

const columnHelper = createDataTableColumns<Announcement>();

export default function AdminAnnouncementsPage() {
  const companyTimezone = useCompanyTimezone();
  const [announcements, setAnnouncements] = useState<Announcement[] | null>(null);
  const [search, setSearch] = useState("");

  async function load() {
    const res = await api.admin.announcements.get({ query: { search: search || undefined } });
    if (res.data) setAnnouncements((res.data as unknown as { announcements: Announcement[] }).announcements);
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch ulang saat search berubah, pola sama admin/users/page.tsx
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

  const columns = [
    columnHelper.accessor("title", { header: "Judul", cell: (ctx) => <span className="font-medium text-foreground">{ctx.getValue()}</span> }),
    columnHelper.display({
      id: "target",
      header: "Target",
      cell: ({ row }) => {
        const { target, targetModules } = row.original;
        if (target === "specific_modules" && targetModules) {
          return <span className="text-muted-foreground">{targetModules.map(moduleLabel).join(", ")}</span>;
        }
        return <Badge variant="default">{TARGET_LABEL[target]}</Badge>;
      },
    }),
    columnHelper.accessor("recipientCount", { header: "Penerima", cell: (ctx) => ctx.getValue() }),
    columnHelper.accessor("createdAt", { header: "Dikirim", cell: (ctx) => formatDate(ctx.getValue(), companyTimezone) }),
  ];

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Pengumuman" description="Kirim pengumuman ke customer — semua, fitur tertentu, atau user tertentu." action={<AnnouncementFormDialog onCreated={load} />} />

      <Card>
        <CardHeader>
          <CardTitle>Riwayat Pengumuman</CardTitle>
          <CardDescription>Jumlah penerima terisi begitu proses pengiriman selesai (beberapa saat setelah dikirim).</CardDescription>
          <SearchForm placeholder="Cari judul pengumuman..." onSearch={setSearch} className="mt-2 w-full" />
        </CardHeader>
        <CardContent>
          {!announcements ? (
            <Skeleton className="h-40 w-full" />
          ) : (
            <DataTable columns={columns} data={announcements} emptyIcon={Megaphone} emptyTitle="Belum ada pengumuman" />
          )}
        </CardContent>
      </Card>
    </div>
  );
}
