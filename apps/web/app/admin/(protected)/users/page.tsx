"use client";

import { useEffect, useState } from "react";
import { CreditCard, Pencil } from "lucide-react";
import { toast } from "sonner";
import { Badge, type BadgeProps } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { formatDate } from "@/lib/utils";
import { api } from "@/lib/api-client";

const PAGE_SIZE = 20;

type ActiveSubscription = { status: string; planName: string; endAt: string | null } | null;
type UserRow = {
  id: string;
  name: string;
  email: string;
  emailVerified: boolean;
  createdAt: string;
  roles: string[];
  activeSubscription: ActiveSubscription;
};
type Plan = { id: string; name: string; durationDays: number; modules: string[]; isActive: boolean };
type SubscriptionHistoryItem = {
  id: string;
  status: string;
  startAt: string | null;
  endAt: string | null;
  createdAt: string;
  planName: string;
};

const SUB_STATUS: Record<string, { label: string; variant: BadgeProps["variant"] }> = {
  active: { label: "Aktif", variant: "success" },
  pending_payment: { label: "Menunggu Pembayaran", variant: "warning" },
  expired: { label: "Kadaluarsa", variant: "destructive" },
  cancelled: { label: "Dibatalkan", variant: "default" },
};

// § architecture-subscription.md § "Admin-Provisioned" — tempPassword
// CUMA muncul SEKALI di response create, tidak disimpan/ditampilkan lagi
// setelahnya — dialog ini WAJIB jelas bilang "catat sekarang".
function AddUserDialog({ onCreated }: { onCreated: () => void }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<{ email: string; tempPassword: string } | null>(null);

  async function handleCreate() {
    if (!name.trim() || !email.trim()) {
      setError("Nama dan email wajib diisi.");
      return;
    }
    setSubmitting(true);
    setError(null);
    const res = await api.admin.users.post({ name: name.trim(), email: email.trim() });
    setSubmitting(false);
    if (res.error) {
      setError("Gagal membuat user — coba lagi.");
      return;
    }
    const data = res.data as unknown as { email: string; tempPassword: string };
    setCreated({ email: data.email, tempPassword: data.tempPassword });
    onCreated();
  }

  function handleClose(next: boolean) {
    setOpen(next);
    if (!next) {
      setName("");
      setEmail("");
      setCreated(null);
      setError(null);
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <Button onClick={() => setOpen(true)}>Tambah User</Button>
      <DialogContent>
        <DialogTitle>Tambah User</DialogTitle>
        {created ? (
          <div className="mt-3 flex flex-col gap-3 text-sm">
            <p className="rounded-md bg-warning-bg px-3 py-2 text-warning">
              <strong>Catat password ini sekarang</strong> — tidak akan ditampilkan lagi setelah dialog ini ditutup.
            </p>
            <p>
              Email: <code className="text-foreground">{created.email}</code>
            </p>
            <p>
              Password sementara: <code className="text-foreground">{created.tempPassword}</code>
            </p>
            <Button onClick={() => handleClose(false)} className="self-end">
              Selesai
            </Button>
          </div>
        ) : (
          <div className="mt-3 flex flex-col gap-3 text-sm">
            <label className="flex flex-col gap-1.5">
              <span className="text-xs font-medium text-foreground">Nama</span>
              <Input value={name} onChange={(e) => setName(e.target.value)} />
            </label>
            <label className="flex flex-col gap-1.5">
              <span className="text-xs font-medium text-foreground">Email</span>
              <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
            </label>
            {error && <p className="text-destructive">{error}</p>}
            <Button onClick={handleCreate} disabled={submitting} className="self-end">
              {submitting ? "Membuat..." : "Buat User"}
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function ManageSubscriptionDialog({ user, onAssigned }: { user: UserRow; onAssigned: () => void }) {
  const [open, setOpen] = useState(false);
  const [plans, setPlans] = useState<Plan[] | null>(null);
  const [history, setHistory] = useState<SubscriptionHistoryItem[] | null>(null);
  const [selectedPlanId, setSelectedPlanId] = useState("");
  const [endAt, setEndAt] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editEndAt, setEditEndAt] = useState("");
  const [editSubmitting, setEditSubmitting] = useState(false);

  async function load() {
    const [plansRes, historyRes] = await Promise.all([api.admin.plans.get(), api.admin.subscriptions.get({ query: { userId: user.id } })]);
    if (plansRes.data) setPlans((plansRes.data as unknown as { plans: Plan[] }).plans.filter((p) => p.isActive));
    if (historyRes.data) setHistory((historyRes.data as unknown as { subscriptions: SubscriptionHistoryItem[] }).subscriptions);
  }

  function openDialog() {
    setOpen(true);
    setSelectedPlanId("");
    setEndAt("");
    setError(null);
    setEditingId(null);
    load();
  }

  async function handleAssign() {
    if (!selectedPlanId) {
      setError("Pilih paket dulu.");
      return;
    }
    // § ADR-0016 — endAt WAJIB diisi admin secara manual, tidak lagi
    // dihitung otomatis dari plan.durationDays.
    if (!endAt) {
      setError("Tanggal expired wajib diisi.");
      return;
    }
    setSubmitting(true);
    setError(null);
    const res = await api.admin.subscriptions.post({ userId: user.id, planId: selectedPlanId, endAt: new Date(endAt).toISOString() });
    setSubmitting(false);
    if (res.error) {
      setError("Gagal assign paket — pastikan tanggal expired di masa depan.");
      return;
    }
    toast.success(`Paket berhasil di-assign ke ${user.name || user.email}.`);
    setSelectedPlanId("");
    setEndAt("");
    load();
    onAssigned();
  }

  function startEdit(h: SubscriptionHistoryItem) {
    setEditingId(h.id);
    setEditEndAt(h.endAt ? h.endAt.slice(0, 10) : "");
  }

  async function handleSaveEdit(id: string) {
    if (!editEndAt) return;
    setEditSubmitting(true);
    const res = await api.admin.subscriptions({ id }).patch({ endAt: new Date(editEndAt).toISOString() });
    setEditSubmitting(false);
    if (res.error) {
      toast.error("Gagal ubah tanggal expired — pastikan tanggal di masa depan.");
      return;
    }
    toast.success("Tanggal expired berhasil diubah.");
    setEditingId(null);
    load();
    onAssigned();
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <button
        type="button"
        onClick={openDialog}
        title="Kelola Langganan"
        aria-label={`Kelola langganan ${user.name}`}
        className={buttonVariants("ghost", "h-8 w-8 p-0")}
      >
        <CreditCard className="h-4 w-4" />
      </button>
      <DialogContent className="max-w-lg">
        <DialogTitle>Langganan: {user.name || user.email}</DialogTitle>
        <div className="mt-3 flex flex-col gap-4 text-sm">
          <div className="flex flex-col gap-2">
            <span className="text-xs font-medium text-foreground">Riwayat Langganan</span>
            {!history ? (
              <Skeleton className="h-16 w-full" />
            ) : history.length === 0 ? (
              <p className="text-muted-foreground">Belum pernah punya langganan.</p>
            ) : (
              <ul className="flex flex-col divide-y divide-border">
                {history.map((h) => (
                  <li key={h.id} className="flex items-center justify-between py-2">
                    <span className="text-foreground">{h.planName}</span>
                    {editingId === h.id ? (
                      <div className="flex items-center gap-2">
                        <Input
                          type="date"
                          value={editEndAt}
                          onChange={(e) => setEditEndAt(e.target.value)}
                          className="h-8 w-36"
                        />
                        <Button
                          onClick={() => handleSaveEdit(h.id)}
                          disabled={editSubmitting || !editEndAt}
                          className="h-8 px-2.5 py-0 text-xs"
                        >
                          {editSubmitting ? "..." : "Simpan"}
                        </Button>
                        <Button
                          variant="outline"
                          onClick={() => setEditingId(null)}
                          disabled={editSubmitting}
                          className="h-8 px-2.5 py-0 text-xs"
                        >
                          Batal
                        </Button>
                      </div>
                    ) : (
                      <div className="flex items-center gap-2">
                        <Badge variant={(SUB_STATUS[h.status] ?? { variant: "default" }).variant}>
                          {SUB_STATUS[h.status]?.label ?? h.status}
                        </Badge>
                        {h.endAt && <span className="text-xs text-muted-foreground">s/d {formatDate(h.endAt)}</span>}
                        {h.status === "active" && (
                          <button
                            type="button"
                            title="Ubah tanggal expired"
                            aria-label="Ubah tanggal expired"
                            onClick={() => startEdit(h)}
                            className={buttonVariants("ghost", "h-6 w-6 p-0")}
                          >
                            <Pencil className="h-3 w-3" />
                          </button>
                        )}
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div className="flex flex-col gap-2 border-t border-border pt-3">
            <span className="text-xs font-medium text-foreground">Assign Paket Baru</span>
            {!plans ? (
              <Skeleton className="h-9 w-full" />
            ) : plans.length === 0 ? (
              <p className="text-muted-foreground">Belum ada paket aktif — buat dulu di halaman Paket.</p>
            ) : (
              <select
                className="rounded-md border border-border bg-background px-3 py-2 text-sm"
                value={selectedPlanId}
                onChange={(e) => setSelectedPlanId(e.target.value)}
              >
                <option value="">(pilih paket)</option>
                {plans.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} — {p.durationDays} hari
                  </option>
                ))}
              </select>
            )}
            <label className="flex flex-col gap-1.5">
              <span className="text-xs font-medium text-foreground">Tanggal Expired</span>
              <Input type="date" value={endAt} onChange={(e) => setEndAt(e.target.value)} />
            </label>
            {error && <p className="text-destructive">{error}</p>}
            <Button onClick={handleAssign} disabled={submitting || !plans?.length} className="self-end">
              {submitting ? "Memproses..." : "Assign Paket"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default function AdminUsersPage() {
  const [users, setUsers] = useState<UserRow[] | null>(null);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [search, setSearch] = useState("");

  async function load() {
    const res = await api.admin.users.get({ query: { limit: PAGE_SIZE, offset: page * PAGE_SIZE, search: search || undefined } });
    if (res.data) {
      const data = res.data as unknown as { users: UserRow[]; total: number };
      setUsers(data.users);
      setTotal(data.total);
    }
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch ulang saat page/search berubah, pola standar
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, search]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-foreground">Pengguna</h1>
          <p className="text-sm text-muted-foreground">Kelola user & langganan mereka.</p>
        </div>
        <AddUserDialog onCreated={load} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Semua Pengguna</CardTitle>
          <CardDescription>{total} pengguna total.</CardDescription>
          <Input
            placeholder="Cari nama atau email..."
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(0);
            }}
            className="mt-2 max-w-xs"
          />
        </CardHeader>
        <CardContent>
          {!users ? (
            <Skeleton className="h-40 w-full" />
          ) : users.length === 0 ? (
            <EmptyState icon={CreditCard} title="Tidak ada pengguna ditemukan" />
          ) : (
            <>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Nama</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead>Role</TableHead>
                    <TableHead>Langganan Aktif</TableHead>
                    <TableHead>Terdaftar</TableHead>
                    <TableHead className="text-right">Aksi</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {users.map((u) => (
                    <TableRow key={u.id}>
                      <TableCell className="font-medium text-foreground">{u.name || "-"}</TableCell>
                      <TableCell className="text-muted-foreground">{u.email}</TableCell>
                      <TableCell className="text-muted-foreground">{u.roles.join(", ") || "-"}</TableCell>
                      <TableCell>
                        {u.activeSubscription ? (
                          <Badge variant="success">{u.activeSubscription.planName}</Badge>
                        ) : (
                          <span className="text-xs text-muted-foreground">Tidak ada</span>
                        )}
                      </TableCell>
                      <TableCell className="text-muted-foreground">{formatDate(u.createdAt)}</TableCell>
                      <TableCell>
                        <div className="flex items-center justify-end gap-1">
                          <ManageSubscriptionDialog user={u} onAssigned={load} />
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>

              <div className="mt-4 flex items-center justify-between">
                <p className="text-xs text-muted-foreground">
                  Halaman {page + 1} dari {totalPages}
                </p>
                <div className="flex gap-2">
                  <Button variant="outline" onClick={() => setPage((p) => Math.max(0, p - 1))} disabled={page === 0}>
                    Sebelumnya
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
                    disabled={page + 1 >= totalPages}
                  >
                    Berikutnya
                  </Button>
                </div>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
