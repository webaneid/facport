"use client";

import { useEffect, useState } from "react";
import { UserCog, UserX, UserCheck } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Can } from "@/components/auth/can";
import { Skeleton } from "@/components/ui/skeleton";
import { PageHeader } from "@/components/ui/page-header";
import { DataTable, createDataTableColumns } from "@/components/ui/data-table";
import { formatDate } from "@/lib/utils";
import { useCompanyTimezone } from "@/components/company-timezone-provider";
import { api } from "@/lib/api-client";
import { roleLabel } from "@/lib/role-labels";

// § diminta user 2026-09-05 — menu KHUSUS tim internal (Super Admin/
// Admin), terpisah dari halaman "Pengguna" yang sekarang cuma customer
// (§ ADR-0027 lanjutan) — jawaban langsung atas "saya mau pisahin
// antara customer dan user untuk admin".
type StaffRow = { id: string; name: string; email: string; disabled: boolean; createdAt: string; role: string };

// § Fase 29, ADR-0027 — provisioning akun SISI ADMIN (Super Admin/Admin),
// TERPISAH dari `AddUserDialog` di halaman Pengguna (yang SELALU bikin
// akun customer) — 2 tipe akun beda origin login & beda kebutuhan
// field, bukan 1 dialog yang ngurus keduanya (§ ADR-0027 § Decision 5).
function AddStaffDialog({ onCreated }: { onCreated: () => void }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<"staff" | "admin">("staff");
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
    const res = await api.admin.staff.post({ name: name.trim(), email: email.trim(), role });
    setSubmitting(false);
    if (res.error) {
      setError("Gagal membuat akun staff — coba lagi.");
      return;
    }
    setCreated(res.data as unknown as { email: string; tempPassword: string });
    onCreated();
  }

  function handleClose(next: boolean) {
    setOpen(next);
    if (!next) {
      setName("");
      setEmail("");
      setRole("staff");
      setCreated(null);
      setError(null);
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <Button onClick={() => setOpen(true)}>Tambah Staff</Button>
      <DialogContent className="max-w-lg">
        <DialogTitle>Tambah Staff</DialogTitle>
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
          <div className="mt-3 flex flex-col gap-4 text-sm">
            <label className="flex flex-col gap-1.5">
              <span className="text-xs font-medium text-foreground">Nama</span>
              <Input value={name} onChange={(e) => setName(e.target.value)} />
            </label>
            <label className="flex flex-col gap-1.5">
              <span className="text-xs font-medium text-foreground">Email</span>
              <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
            </label>
            <div className="flex flex-col gap-2">
              <span className="text-xs font-medium text-foreground">Role</span>
              <div className="flex flex-col gap-1.5">
                <label className="flex items-center gap-2">
                  <input type="radio" checked={role === "staff"} onChange={() => setRole("staff")} />
                  <span className="text-foreground">Admin</span>
                  <span className="text-xs text-muted-foreground">— semua akses admin KECUALI tambah/nonaktifkan user</span>
                </label>
                <label className="flex items-center gap-2">
                  <input type="radio" checked={role === "admin"} onChange={() => setRole("admin")} />
                  <span className="text-foreground">Super Admin</span>
                  <span className="text-xs text-muted-foreground">— akses penuh, termasuk tambah/nonaktifkan user</span>
                </label>
              </div>
            </div>
            {error && <p className="text-destructive">{error}</p>}
            <Button onClick={handleCreate} disabled={submitting} className="self-end">
              {submitting ? "Membuat..." : "Buat Akun"}
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

const columnHelper = createDataTableColumns<StaffRow>();

export default function AdminStaffPage() {
  const companyTimezone = useCompanyTimezone();
  const [staff, setStaff] = useState<StaffRow[] | null>(null);

  async function load() {
    const res = await api.admin.staff.get();
    if (res.data) setStaff((res.data as unknown as { users: StaffRow[] }).users);
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch data awal saat mount, pola standar
    load();
  }, []);

  // § pola sama admin/users/page.tsx — nonaktifkan (reversibel), BUKAN
  // hapus permanen (§ ADR-0027 § Decision 3). Guard tambahan (tolak diri
  // sendiri/Super Admin terakhir) ditegakkan BACKEND.
  async function toggleDisabled(row: StaffRow) {
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

  const columns = [
    columnHelper.accessor("name", { header: "Nama", cell: (ctx) => <span className="font-medium text-foreground">{ctx.getValue() || "-"}</span> }),
    columnHelper.accessor("email", { header: "Email", cell: (ctx) => <span className="text-muted-foreground">{ctx.getValue()}</span> }),
    columnHelper.display({
      id: "role",
      header: "Role",
      cell: ({ row }) => (
        <div className="flex items-center gap-1.5">
          <span className="text-foreground">{roleLabel(row.original.role)}</span>
          {row.original.disabled && <Badge variant="destructive">Nonaktif</Badge>}
        </div>
      ),
    }),
    columnHelper.accessor("createdAt", { header: "Bergabung", cell: (ctx) => <span className="text-muted-foreground">{formatDate(ctx.getValue(), companyTimezone)}</span> }),
    columnHelper.display({
      id: "actions",
      header: "Aksi",
      cell: ({ row }) => (
        <div className="flex items-center justify-end gap-1">
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
        title="Tim Internal"
        description="Kelola akun Super Admin & Admin — pelanggan dikelola di menu Pengguna."
        // § tambah staff BARU butuh `users.manage` (Super Admin saja) —
        // Admin terbatas cuma boleh LIHAT daftar tim (§ ADR-0027).
        action={
          <Can permission="users.manage">
            <AddStaffDialog onCreated={load} />
          </Can>
        }
      />

      <Card>
        <CardHeader>
          <CardTitle>Semua Akun Tim Internal</CardTitle>
          <CardDescription>{staff?.length ?? 0} akun.</CardDescription>
        </CardHeader>
        <CardContent>
          {!staff ? <Skeleton className="h-40 w-full" /> : <DataTable columns={columns} data={staff} emptyIcon={UserCog} emptyTitle="Belum ada akun tim internal" />}
        </CardContent>
      </Card>
    </div>
  );
}
