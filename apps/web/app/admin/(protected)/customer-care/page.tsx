"use client";

import { useEffect, useState } from "react";
import { Pencil, Ban, Users, MessageCircleOff, MessageCircle } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { PageHeader } from "@/components/ui/page-header";
import { StatCard } from "@/components/ui/stat-card";
import { DataTable, createDataTableColumns } from "@/components/ui/data-table";
import { api } from "@/lib/api-client";

type Agent = {
  id: string;
  name: string;
  position: string;
  photoUrl: string | null;
  whatsappNumber: string;
  isActive: boolean;
  manuallyOfflineUntil: string | null;
  isOnlineNow: boolean;
};

const WORK_DAY_LABELS = ["Minggu", "Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu"];

function AgentFormDialog({ agent, onSaved }: { agent?: Agent; onSaved: () => void }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(agent?.name ?? "");
  const [position, setPosition] = useState(agent?.position ?? "");
  const [whatsappNumber, setWhatsappNumber] = useState(agent?.whatsappNumber ?? "");
  const [photoFile, setPhotoFile] = useState<File | undefined>(undefined);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSave() {
    if (!name.trim() || !position.trim() || !whatsappNumber.trim()) {
      setError("Semua field wajib diisi.");
      return;
    }
    if (!/^[0-9]+$/.test(whatsappNumber.trim())) {
      setError('Nomor WhatsApp cuma angka, TANPA "+"/spasi/strip (mis. 628123456789).');
      return;
    }
    setSubmitting(true);
    setError(null);
    const body = { name: name.trim(), position: position.trim(), whatsappNumber: whatsappNumber.trim() };
    const res = agent ? await api.admin["customer-care"].agents({ id: agent.id }).put(body) : await api.admin["customer-care"].agents.post(body);
    if (res.error) {
      setSubmitting(false);
      setError("Gagal menyimpan agent.");
      return;
    }
    const savedId = agent?.id ?? (res.data as unknown as { id: string }).id;
    if (photoFile) {
      const photoRes = await api.admin["customer-care"].agents({ id: savedId }).photo.post({ file: photoFile });
      if (photoRes.error) toast.error("Agent tersimpan, tapi upload foto gagal — coba upload ulang lewat Edit.");
    }
    setSubmitting(false);
    toast.success(agent ? "Agent diperbarui." : "Agent ditambahkan.");
    setOpen(false);
    onSaved();
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      {agent ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          title="Edit"
          aria-label={`Edit ${agent.name}`}
          className={buttonVariants("ghost", "h-8 w-8 p-0")}
        >
          <Pencil className="h-4 w-4" />
        </button>
      ) : (
        <Button onClick={() => setOpen(true)}>Tambah Agent</Button>
      )}
      <DialogContent>
        <DialogTitle>{agent ? `Edit: ${agent.name}` : "Tambah Agent"}</DialogTitle>
        <div className="mt-3 flex flex-col gap-4 text-sm">
          {agent?.photoUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={agent.photoUrl} alt={agent.name} className="h-16 w-16 rounded-full object-cover" />
          )}
          <label className="flex flex-col gap-1.5">
            <span className="text-xs font-medium text-foreground">Foto</span>
            <Input type="file" accept="image/jpeg,image/png,image/webp" onChange={(e) => setPhotoFile(e.target.files?.[0])} />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-xs font-medium text-foreground">Nama</span>
            <Input value={name} onChange={(e) => setName(e.target.value)} />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-xs font-medium text-foreground">Posisi</span>
            <Input value={position} onChange={(e) => setPosition(e.target.value)} placeholder="mis. Customer Care" />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-xs font-medium text-foreground">Nomor WhatsApp</span>
            <Input value={whatsappNumber} onChange={(e) => setWhatsappNumber(e.target.value)} placeholder="628123456789" />
          </label>
          {error && <p className="text-destructive">{error}</p>}
          <Button onClick={handleSave} disabled={submitting} className="self-end">
            {submitting ? "Menyimpan..." : "Simpan"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function WorkScheduleDialog({ onSaved }: { onSaved: () => void }) {
  const [open, setOpen] = useState(false);
  const [startHour, setStartHour] = useState("09");
  const [startMinute, setStartMinute] = useState("00");
  const [endHour, setEndHour] = useState("17");
  const [endMinute, setEndMinute] = useState("00");
  const [workDays, setWorkDays] = useState<Set<number>>(new Set([1, 2, 3, 4, 5, 6]));
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function openDialog() {
    setOpen(true);
    const res = await api.admin["customer-care"].settings.get();
    if (res.data) {
      const data = res.data as unknown as { workStartMinutes: number; workEndMinutes: number; workDays: number[] };
      setStartHour(String(Math.floor(data.workStartMinutes / 60)).padStart(2, "0"));
      setStartMinute(String(data.workStartMinutes % 60).padStart(2, "0"));
      setEndHour(String(Math.floor(data.workEndMinutes / 60)).padStart(2, "0"));
      setEndMinute(String(data.workEndMinutes % 60).padStart(2, "0"));
      setWorkDays(new Set(data.workDays));
    }
  }

  function toggleDay(day: number) {
    setWorkDays((prev) => {
      const next = new Set(prev);
      if (next.has(day)) next.delete(day);
      else next.add(day);
      return next;
    });
  }

  async function handleSave() {
    const workStartMinutes = Number(startHour) * 60 + Number(startMinute);
    const workEndMinutes = Number(endHour) * 60 + Number(endMinute);
    if (!Number.isInteger(workStartMinutes) || !Number.isInteger(workEndMinutes) || workStartMinutes >= workEndMinutes) {
      setError("Jam mulai harus lebih awal dari jam selesai.");
      return;
    }
    setSubmitting(true);
    setError(null);
    const res = await api.admin["customer-care"].settings.put({ workStartMinutes, workEndMinutes, workDays: [...workDays] });
    setSubmitting(false);
    if (res.error) {
      setError("Gagal menyimpan jam kerja.");
      return;
    }
    toast.success("Jam kerja disimpan.");
    setOpen(false);
    onSaved();
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <Button variant="outline" onClick={openDialog}>
        Jam Kerja
      </Button>
      <DialogContent>
        <DialogTitle>Jam Kerja Customer Care</DialogTitle>
        <div className="mt-3 flex flex-col gap-4 text-sm">
          <p className="text-xs text-muted-foreground">
            Di luar jam &amp; hari ini, semua CS otomatis dianggap offline (widget customer menampilkan pesan offline).
          </p>
          <div className="flex items-center gap-2">
            <label className="flex flex-1 flex-col gap-1.5">
              <span className="text-xs font-medium text-foreground">Jam Mulai</span>
              <div className="flex gap-1">
                <Input type="number" min={0} max={23} value={startHour} onChange={(e) => setStartHour(e.target.value)} />
                <Input type="number" min={0} max={59} value={startMinute} onChange={(e) => setStartMinute(e.target.value)} />
              </div>
            </label>
            <label className="flex flex-1 flex-col gap-1.5">
              <span className="text-xs font-medium text-foreground">Jam Selesai</span>
              <div className="flex gap-1">
                <Input type="number" min={0} max={23} value={endHour} onChange={(e) => setEndHour(e.target.value)} />
                <Input type="number" min={0} max={59} value={endMinute} onChange={(e) => setEndMinute(e.target.value)} />
              </div>
            </label>
          </div>
          <div className="flex flex-col gap-1.5">
            <span className="text-xs font-medium text-foreground">Hari Kerja</span>
            <div className="flex flex-wrap gap-3">
              {WORK_DAY_LABELS.map((label, day) => (
                <label key={day} className="flex items-center gap-1.5 text-xs">
                  <input type="checkbox" checked={workDays.has(day)} onChange={() => toggleDay(day)} />
                  {label}
                </label>
              ))}
            </div>
          </div>
          {error && <p className="text-destructive">{error}</p>}
          <Button onClick={handleSave} disabled={submitting} className="self-end">
            {submitting ? "Menyimpan..." : "Simpan"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

const columnHelper = createDataTableColumns<Agent>();

export default function AdminCustomerCarePage() {
  const [agents, setAgents] = useState<Agent[] | null>(null);
  const [analytics, setAnalytics] = useState<Record<string, number>>({});

  async function load() {
    const [agentsRes, analyticsRes] = await Promise.all([
      api.admin["customer-care"].agents.get(),
      api.admin["customer-care"].analytics.get({ query: { period: "today" } }),
    ]);
    if (agentsRes.data) setAgents((agentsRes.data as unknown as { agents: Agent[] }).agents);
    if (analyticsRes.data) {
      const rows = (analyticsRes.data as unknown as { analytics: { agentId: string; uniqueCustomers: number }[] }).analytics;
      setAnalytics(Object.fromEntries(rows.map((r) => [r.agentId, r.uniqueCustomers])));
    }
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch data awal saat mount, pola standar
    load();
  }, []);

  async function handleToggleOffline(agent: Agent) {
    const res = agent.manuallyOfflineUntil
      ? await api.admin["customer-care"].agents({ id: agent.id })["online-now"].post()
      : await api.admin["customer-care"].agents({ id: agent.id })["offline-today"].post();
    if (res.error) {
      toast.error("Gagal mengubah status.");
      return;
    }
    toast.success(agent.manuallyOfflineUntil ? `${agent.name} diaktifkan kembali.` : `${agent.name} di-off-kan hari ini.`);
    load();
  }

  async function handleDeactivate(agent: Agent) {
    const res = await api.admin["customer-care"].agents({ id: agent.id }).delete();
    if (res.error) {
      toast.error("Gagal menonaktifkan agent.");
      return;
    }
    toast.success(`"${agent.name}" dinonaktifkan.`);
    load();
  }

  const totalServedToday = Object.values(analytics).reduce((sum, n) => sum + n, 0);

  const columns = [
    columnHelper.display({
      id: "photo",
      header: "Foto",
      cell: ({ row }) =>
        row.original.photoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={row.original.photoUrl} alt={row.original.name} className="h-8 w-8 rounded-full object-cover" />
        ) : (
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-muted text-xs text-muted-foreground">
            {row.original.name.slice(0, 1).toUpperCase()}
          </div>
        ),
    }),
    columnHelper.accessor("name", { header: "Nama", cell: (ctx) => <span className="font-medium text-foreground">{ctx.getValue()}</span> }),
    columnHelper.accessor("position", { header: "Posisi", cell: (ctx) => <span className="text-muted-foreground">{ctx.getValue()}</span> }),
    columnHelper.accessor("whatsappNumber", { header: "WhatsApp", cell: (ctx) => ctx.getValue() }),
    columnHelper.display({
      id: "status",
      header: "Status",
      cell: ({ row }) =>
        !row.original.isActive ? (
          <Badge variant="default">Nonaktif</Badge>
        ) : row.original.isOnlineNow ? (
          <Badge variant="success">Online</Badge>
        ) : (
          <Badge variant="warning">Offline</Badge>
        ),
    }),
    columnHelper.display({
      id: "servedToday",
      header: "Dilayani Hari Ini",
      cell: ({ row }) => analytics[row.original.id] ?? 0,
    }),
    columnHelper.display({
      id: "actions",
      header: "Aksi",
      cell: ({ row }) => {
        const agent = row.original;
        return (
          <div className="flex items-center justify-end gap-1">
            {agent.isActive && (
              <button
                type="button"
                onClick={() => handleToggleOffline(agent)}
                title={agent.manuallyOfflineUntil ? "Aktifkan lagi" : "Off hari ini"}
                aria-label={agent.manuallyOfflineUntil ? `Aktifkan ${agent.name}` : `Off-kan ${agent.name} hari ini`}
                className={buttonVariants("ghost", "h-8 w-8 p-0")}
              >
                {agent.manuallyOfflineUntil ? <MessageCircle className="h-4 w-4" /> : <MessageCircleOff className="h-4 w-4" />}
              </button>
            )}
            <AgentFormDialog agent={agent} onSaved={load} />
            {agent.isActive && (
              <button
                type="button"
                onClick={() => handleDeactivate(agent)}
                title="Nonaktifkan"
                aria-label={`Nonaktifkan ${agent.name}`}
                className={buttonVariants("ghost", "h-8 w-8 p-0 text-destructive hover:bg-destructive-bg")}
              >
                <Ban className="h-4 w-4" />
              </button>
            )}
          </div>
        );
      },
    }),
  ];

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Customer Care"
        description="Kelola profil CS, jam kerja, dan rotasi WhatsApp."
        action={
          <div className="flex gap-2">
            <WorkScheduleDialog onSaved={load} />
            <AgentFormDialog onSaved={load} />
          </div>
        }
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <StatCard icon={Users} label="Total Dilayani Hari Ini" value={totalServedToday} />
        <StatCard icon={MessageCircle} label="Agent Online Sekarang" value={agents?.filter((a) => a.isOnlineNow).length ?? 0} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Daftar Agent</CardTitle>
          <CardDescription>Rotasi otomatis memilih agent online dengan klik paling sedikit hari ini.</CardDescription>
        </CardHeader>
        <CardContent>
          {!agents ? <Skeleton className="h-40 w-full" /> : <DataTable columns={columns} data={agents} emptyIcon={Ban} emptyTitle="Belum ada agent" />}
        </CardContent>
      </Card>
    </div>
  );
}
