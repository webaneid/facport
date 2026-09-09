"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { CreditCard, Pencil, UserX, UserCheck, Eye } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { SearchForm } from "@/components/ui/search-form";
import { Checkbox } from "@/components/ui/checkbox";
import { Can } from "@/components/auth/can";
import { Combobox } from "@/components/ui/combobox";
import { Skeleton } from "@/components/ui/skeleton";
import { PageHeader } from "@/components/ui/page-header";
import { Pagination } from "@/components/ui/pagination";
import { DataTable, createDataTableColumns } from "@/components/ui/data-table";
import { StatusBadge } from "@/lib/status-badges";
import { formatDate, currencyFormatter } from "@/lib/utils";
import { api } from "@/lib/api-client";
import { useCompanyTimezone } from "@/components/company-timezone-provider";
import { endOfDayInTimezone } from "@/lib/timezone";
import { moduleLabel } from "@/lib/module-options";

const PAGE_SIZE = 20;

type ActiveSubscription = { status: string; planName: string; endAt: string | null };
type UserRow = {
  id: string;
  name: string;
  email: string;
  emailVerified: boolean;
  disabled: boolean;
  createdAt: string;
  roles: string[];
  activeSubscriptions: ActiveSubscription[];
};
type Plan = { id: string; name: string; price: number; durationDays: number; modules: string[]; isActive: boolean };
type SubscriptionHistoryItem = {
  id: string;
  status: string;
  startAt: string | null;
  endAt: string | null;
  createdAt: string;
  planName: string;
};

type CreatedUserResult = {
  email: string;
  tempPassword: string;
  invoiceId?: string;
  orderId?: string;
  amountDue?: number;
  subscriptionIds?: string[];
};

// § architecture-subscription.md § "Admin-Provisioned" — tempPassword
// CUMA muncul SEKALI di response create, tidak disimpan/ditampilkan lagi
// setelahnya — dialog ini WAJIB jelas bilang "catat sekarang".
//
// § Fase 18 — DIPERLUAS: admin BOLEH sekalian centang sub-modul + pilih
// "Kirim Invoice" (customer bayar sendiri, § /billing/[orderId]/pay,
// Fase 16) ATAU "Tandai Sudah Dibayar" (subscription langsung aktif,
// tanpa invoice). Email selamat datang (kredensial + link relevan)
// dikirim OTOMATIS oleh backend (job queue) — dialog ini TIDAK perlu
// kirim email sendiri, cukup tampilkan konfirmasi hasil.
function AddUserDialog({ onCreated }: { onCreated: () => void }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [plans, setPlans] = useState<Plan[] | null>(null);
  const [selectedPlanIds, setSelectedPlanIds] = useState<Set<string>>(new Set());
  const [markAsPaid, setMarkAsPaid] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<CreatedUserResult | null>(null);

  function openDialog() {
    setOpen(true);
    if (!plans) {
      api.admin.plans.get().then((res) => {
        if (res.data) setPlans((res.data as unknown as { plans: Plan[] }).plans.filter((p) => p.isActive));
      });
    }
  }

  function togglePlan(planId: string) {
    setSelectedPlanIds((prev) => {
      const next = new Set(prev);
      if (next.has(planId)) next.delete(planId);
      else next.add(planId);
      return next;
    });
  }

  async function handleCreate() {
    if (!name.trim() || !email.trim()) {
      setError("Nama dan email wajib diisi.");
      return;
    }
    setSubmitting(true);
    setError(null);
    const res = await api.admin.users.post({
      name: name.trim(),
      email: email.trim(),
      planIds: selectedPlanIds.size > 0 ? [...selectedPlanIds] : undefined,
      markAsPaid: selectedPlanIds.size > 0 ? markAsPaid : undefined,
    });
    setSubmitting(false);
    if (res.error) {
      const code = (res.error.value as { code?: string } | undefined)?.code;
      setError(code === "PLAN_NOT_ACTIVE" ? "Salah satu paket sudah tidak aktif." : "Gagal membuat user — coba lagi.");
      return;
    }
    setCreated(res.data as unknown as CreatedUserResult);
    onCreated();
  }

  function handleClose(next: boolean) {
    setOpen(next);
    if (!next) {
      setName("");
      setEmail("");
      setSelectedPlanIds(new Set());
      setMarkAsPaid(false);
      setCreated(null);
      setError(null);
    }
  }

  const selectedPlans = plans?.filter((p) => selectedPlanIds.has(p.id)) ?? [];
  const total = selectedPlans.reduce((sum, p) => sum + p.price, 0);

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <Button onClick={openDialog}>Tambah User</Button>
      <DialogContent className="max-w-lg">
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
            {created.orderId && (
              <p className="text-muted-foreground">
                Invoice dibuat (total {currencyFormatter.format(created.amountDue ?? 0)}) — customer bisa login lalu bayar di{" "}
                <code className="text-foreground">/billing/{created.orderId}/pay</code>. Email undangan otomatis terkirim.
              </p>
            )}
            {created.subscriptionIds && (
              <p className="text-muted-foreground">
                {created.subscriptionIds.length} fitur langsung AKTIF (ditandai sudah dibayar). Email undangan otomatis terkirim.
              </p>
            )}
            <Button onClick={() => handleClose(false)} className="self-end">
              Selesai
            </Button>
          </div>
        ) : (
          <div className="mt-3 flex flex-col gap-4 text-sm">
            <label className="flex flex-col gap-1.5">
              <span className="text-xs font-medium text-foreground">Nama</span>
              <Input value={name} onChange={(e) => setName(e.target.value)} />
            </label>
            <label className="flex flex-col gap-1.5">
              <span className="text-xs font-medium text-foreground">Email</span>
              <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
            </label>

            <div className="flex flex-col gap-2 border-t border-border pt-3">
              <span className="text-xs font-medium text-foreground">Fitur (opsional)</span>
              {!plans ? (
                <Skeleton className="h-16 w-full" />
              ) : plans.length === 0 ? (
                <p className="text-muted-foreground">Belum ada paket aktif — buat dulu di halaman Paket.</p>
              ) : (
                <div className="flex flex-col gap-1.5">
                  {plans.map((p) => (
                    <label key={p.id} className="flex items-center gap-2">
                      <Checkbox checked={selectedPlanIds.has(p.id)} onCheckedChange={() => togglePlan(p.id)} />
                      <span className="text-foreground">{p.name}</span>
                      <span className="text-xs text-muted-foreground">
                        ({p.modules.map(moduleLabel).join(", ")}, {currencyFormatter.format(p.price)})
                      </span>
                    </label>
                  ))}
                </div>
              )}
            </div>

            {selectedPlanIds.size > 0 && (
              <div className="flex flex-col gap-2 rounded-md bg-muted p-3">
                <p className="text-xs text-muted-foreground">Total: {currencyFormatter.format(total)}</p>
                {/* § Fase 26, ADR-0024 — `markAsPaid` PERSIS aksi yang
                    digerbangi `subscriptions.manage` di backend (§
                    security review Fase 18, HIGH bypass fix) — role
                    yang cuma punya `users.manage` (mis. "staf
                    onboarding") tidak PERLU lihat opsi yang toh akan
                    ditolak 403 kalau dipilih. UI hint saja, backend
                    TETAP jadi penjaga sesungguhnya. */}
                <Can permission="subscriptions.manage">
                  <label className="flex items-center gap-2">
                    <Checkbox checked={markAsPaid} onCheckedChange={(checked) => setMarkAsPaid(checked === true)} />
                    <span className="text-foreground">Tandai Sudah Dibayar (aktifkan langsung, tanpa invoice)</span>
                  </label>
                </Can>
                {!markAsPaid && (
                  <p className="text-xs text-muted-foreground">
                    Invoice dibuat, customer bayar sendiri (transfer bank/QRIS) lewat halaman tagihan setelah login.
                  </p>
                )}
              </div>
            )}

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
  const companyTimezone = useCompanyTimezone();
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
    // § BUG ditemukan 2026-09-06 (audit timezone menyeluruh, diminta user)
    // — `new Date(endAt).toISOString()` mem-parse tanggal date-picker
    // ("YYYY-MM-DD") sebagai UTC MIDNIGHT, BUKAN akhir hari di timezone
    // perusahaan. Admin pilih "31 Desember" bermaksud "berlaku SAMPAI
    // akhir tanggal itu", tapi versi lama bikin subscription expired
    // mulai jam 07:00 WIB tanggal itu juga (UTC+7 midnight = 07:00 WIB)
    // — masa aktif TERAKHIR terpotong ~17 jam tanpa admin sadari. Fix:
    // `endOfDayInTimezone` (§ lib/timezone.ts) konversi ke instant UTC
    // yang benar-benar merepresentasikan 23:59:59.999 di timezone
    // perusahaan.
    const res = await api.admin.subscriptions.post({
      userId: user.id,
      planId: selectedPlanId,
      endAt: endOfDayInTimezone(endAt, companyTimezone).toISOString(),
    });
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
    // § sama fix-nya dengan `handleAssign` di atas — lihat komentar di sana.
    const res = await api.admin.subscriptions({ id }).patch({ endAt: endOfDayInTimezone(editEndAt, companyTimezone).toISOString() });
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
                        <StatusBadge domain="subscription" status={h.status} />
                        {h.endAt && <span className="text-xs text-muted-foreground">s/d {formatDate(h.endAt, companyTimezone)}</span>}
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
              <Combobox
                options={plans.map((p) => ({ value: p.id, label: `${p.name} — ${p.durationDays} hari` }))}
                value={selectedPlanId}
                onChange={setSelectedPlanId}
                placeholder="(pilih paket)"
              />
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

const columnHelper = createDataTableColumns<UserRow>();

export default function AdminUsersPage() {
  const companyTimezone = useCompanyTimezone();
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

  // § Fase 29, ADR-0027 — "mengurangi user" = nonaktifkan (reversibel),
  // BUKAN hapus permanen (§ ADR-0027 § Decision 3). Guard tambahan
  // (tolak diri sendiri/Super Admin terakhir) ditegakkan BACKEND — pesan
  // error di sini cuma re-tampilkan kode dari sana, bukan validasi baru.
  async function toggleDisabled(row: UserRow) {
    const res = row.disabled ? await api.admin.users({ id: row.id }).enable.patch() : await api.admin.users({ id: row.id }).disable.patch();
    if (res.error) {
      const code = (res.error.value as { code?: string } | undefined)?.code;
      const message =
        code === "CANNOT_DISABLE_SELF"
          ? "Tidak bisa menonaktifkan akun sendiri."
          : code === "CANNOT_DISABLE_LAST_SUPER_ADMIN"
            ? "Tidak bisa menonaktifkan Super Admin terakhir yang masih aktif."
            : "Gagal mengubah status akun.";
      toast.error(message);
      return;
    }
    toast.success(row.disabled ? "Akun diaktifkan kembali." : "Akun dinonaktifkan — sesi login yang aktif langsung diputus.");
    load();
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch ulang saat page/search berubah, pola standar
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, search]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  // Tidak dibungkus `useMemo` — lihat catatan sama di admin/orders/page.tsx.
  const columns = [
    columnHelper.accessor("name", { header: "Nama", cell: (ctx) => <span className="font-medium text-foreground">{ctx.getValue() || "-"}</span> }),
    columnHelper.accessor("email", { header: "Email", cell: (ctx) => <span className="text-muted-foreground">{ctx.getValue()}</span> }),
    columnHelper.display({
      id: "status",
      header: "Status",
      // § halaman ini SEKARANG cuma customer (§ Fase 29 lanjutan, `GET
      // /admin/users` difilter server-side) — kolom "Role" yang dulu di
      // sini SELALU "Pelanggan" jadi dihapus, tidak ada nilai informasi.
      cell: ({ row }) => (row.original.disabled ? <Badge variant="destructive">Nonaktif</Badge> : <span className="text-xs text-muted-foreground">Aktif</span>),
    }),
    columnHelper.display({
      id: "activeSubscription",
      header: "Langganan Aktif",
      cell: ({ row }) =>
        row.original.activeSubscriptions.length > 0 ? (
          <div className="flex flex-wrap gap-1">
            {row.original.activeSubscriptions.map((s, i) => (
              <Badge key={i} variant="success">
                {s.planName}
              </Badge>
            ))}
          </div>
        ) : (
          <span className="text-xs text-muted-foreground">Tidak ada</span>
        ),
    }),
    columnHelper.accessor("createdAt", { header: "Terdaftar", cell: (ctx) => <span className="text-muted-foreground">{formatDate(ctx.getValue(), companyTimezone)}</span> }),
    columnHelper.display({
      id: "actions",
      header: "Aksi",
      cell: ({ row }) => (
        <div className="flex items-center justify-end gap-1">
          {/* § diminta user 2026-09-05 — lihat detail user (profil +
              riwayat/log import) buat bantu diagnosa saat user telepon
              support. `users.view` cukup (read-only, sama dgn izin
              lihat halaman ini sendiri). */}
          <Link
            href={`/users/${row.original.id}`}
            title="Detail"
            aria-label={`Detail ${row.original.name}`}
            className={buttonVariants("ghost", "h-8 w-8 p-0")}
          >
            <Eye className="h-4 w-4" />
          </Link>
          {/* § Fase 26, ADR-0024 (security-auditor finding) — dialog ini
              assign/edit/lihat riwayat subscription, SEMUA digerbangi
              `subscriptions.manage` di backend, BUKAN `users.manage` yang
              menggerbangi halaman ini — pola split-permission sama dgn
              checkbox "Tandai Sudah Dibayar" di bawah. */}
          <Can permission="subscriptions.manage">
            <ManageSubscriptionDialog user={row.original} onAssigned={load} />
          </Can>
          {/* § Fase 29, ADR-0027 — nonaktifkan/aktifkan HANYA `users.manage`
              (Super Admin), beda dari halaman ini sendiri yang cuma butuh
              `users.view` (Admin terbatas juga bisa lihat, tidak bisa aksi). */}
          <Can permission="users.manage">
            <button
              type="button"
              onClick={() => toggleDisabled(row.original)}
              title={row.original.disabled ? "Aktifkan Kembali" : "Nonaktifkan"}
              aria-label={`${row.original.disabled ? "Aktifkan" : "Nonaktifkan"} ${row.original.name}`}
              className={buttonVariants("ghost", "h-8 w-8 p-0")}
            >
              {row.original.disabled ? <UserCheck className="h-4 w-4" /> : <UserX className="h-4 w-4" />}
            </button>
          </Can>
        </div>
      ),
    }),
  ];

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Pengguna"
        description="Kelola pelanggan & langganan mereka. Akun tim internal (Super Admin/Admin) dikelola di menu Tim Internal."
        // § Fase 29, ADR-0027 — halaman ini bisa diakses dgn `users.view`
        // saja (Admin terbatas), tapi tambah user BARU butuh
        // `users.manage` terpisah — sembunyikan trigger kalau permission
        // itu tidak ada (backend tetap jadi penjaga utama).
        action={
          <Can permission="users.manage">
            <AddUserDialog onCreated={load} />
          </Can>
        }
      />

      <Card>
        <CardHeader>
          <CardTitle>Semua Pengguna</CardTitle>
          <CardDescription>{total} pengguna total.</CardDescription>
          <SearchForm
            placeholder="Cari nama atau email..."
            onSearch={(q) => {
              setSearch(q);
              setPage(0);
            }}
            className="mt-2 max-w-xs"
          />
        </CardHeader>
        <CardContent>
          {!users ? (
            <Skeleton className="h-40 w-full" />
          ) : (
            <div className="flex flex-col gap-4">
              <DataTable columns={columns} data={users} pageSize={PAGE_SIZE} emptyIcon={CreditCard} emptyTitle="Tidak ada pengguna ditemukan" />
              {/* § Fase 21 — `DataTable` cuma paginasi CLIENT-SIDE (§
                  komentar `data-table.tsx`), sedangkan daftar ini
                  paginasi SERVER-SIDE (`offset`/`limit` ke API). `pageSize`
                  di atas disamakan `PAGE_SIZE` supaya 1 halaman server =
                  1 "halaman" client (Pagination bawaan DataTable jadi
                  no-op), navigasi sungguhan pakai `Pagination` yang SAMA
                  komponennya, di-wire ke state server di sini. */}
              <Pagination page={page} totalPages={totalPages} onPageChange={setPage} />
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
