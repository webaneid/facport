"use client";

import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { UserPlus, Mail, RotateCw, UserX } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FormField } from "@/components/ui/form-field";
import { Card, CardContent, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { api } from "@/lib/api-client";

type Seat = {
  id: string;
  status: "available" | "invited" | "active";
  invitedEmail: string | null;
  memberName: string | null;
  memberEmail: string | null;
};

const inviteSchema = z.object({ email: z.string().email("Format email tidak valid") });
type InviteFormValues = z.infer<typeof inviteSchema>;

const STATUS_BADGE: Record<Seat["status"], { label: string; variant: "default" | "warning" | "success" }> = {
  available: { label: "Kosong", variant: "default" },
  invited: { label: "Menunggu Diterima", variant: "warning" },
  active: { label: "Aktif", variant: "success" },
};

// § Fase 110, architecture-user-tambahan.md — "Kelola Tim": list seat User
// Tambahan milik Data Usaha AKTIF + invite/resend/revoke. `dataUsahaId`
// dioper dari `page.tsx` (Server Component, cookie sudah divalidasi layout).
export function TeamForm({ dataUsahaId }: { dataUsahaId: string }) {
  const [seats, setSeats] = useState<Seat[] | null>(null);
  const [inviteTarget, setInviteTarget] = useState<string | null>(null);
  const [busySeatId, setBusySeatId] = useState<string | null>(null);
  const form = useForm<InviteFormValues>({ resolver: zodResolver(inviteSchema) });

  async function load() {
    const res = await api.me.team.get({ query: { dataUsahaId } });
    const list = (res.data as unknown as { seats: Seat[] } | undefined)?.seats ?? [];
    setSeats(list);
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function onInvite(values: InviteFormValues) {
    if (!inviteTarget) return;
    const res = await api.me.team({ seatId: inviteTarget }).invite.post({ email: values.email });
    if (res.error) {
      toast.error("Gagal mengirim undangan. Coba lagi.");
      return;
    }
    toast.success(`Undangan terkirim ke ${values.email}.`);
    setInviteTarget(null);
    form.reset();
    load();
  }

  async function onResend(seatId: string) {
    setBusySeatId(seatId);
    const res = await api.me.team({ seatId }).resend.post();
    setBusySeatId(null);
    if (res.error) {
      toast.error("Gagal mengirim ulang undangan.");
      return;
    }
    toast.success("Undangan dikirim ulang.");
  }

  async function onRevoke(seatId: string) {
    setBusySeatId(seatId);
    const res = await api.me.team({ seatId }).revoke.post();
    setBusySeatId(null);
    if (res.error) {
      toast.error("Gagal mencabut akses.");
      return;
    }
    toast.success("Akses dicabut — slot siap diundang ke orang baru.");
    load();
  }

  if (!seats) {
    return (
      <div className="mx-auto flex max-w-3xl flex-col gap-4">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-foreground">Kelola Tim</h1>
        <p className="text-sm text-muted-foreground">
          User Tambahan yang kamu undang dapat akses ke SEMUA fitur aktif Data Usaha ini.
        </p>
      </div>

      {seats.length === 0 ? (
        <EmptyState
          icon={UserPlus}
          title="Belum ada slot User Tambahan"
          description='Beli slot lewat halaman "Berlangganan" untuk mulai mengundang tim.'
        />
      ) : (
        <div className="flex flex-col gap-3">
          {seats.map((seat) => {
            const statusInfo = STATUS_BADGE[seat.status];
            return (
              <Card key={seat.id}>
                <CardContent className="flex items-center justify-between gap-4 py-4">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="truncate text-sm font-medium text-foreground">
                        {seat.memberName || seat.memberEmail || seat.invitedEmail || "Slot kosong"}
                      </span>
                      <Badge variant={statusInfo.variant}>{statusInfo.label}</Badge>
                    </div>
                    {seat.status === "invited" && <p className="mt-1 text-xs text-muted-foreground">Menunggu {seat.invitedEmail} menerima undangan.</p>}
                  </div>
                  <div className="flex shrink-0 gap-2">
                    {seat.status === "available" && (
                      <Button size="sm" variant="outline" className="gap-1.5" onClick={() => setInviteTarget(seat.id)}>
                        <Mail className="h-3.5 w-3.5" />
                        Undang
                      </Button>
                    )}
                    {seat.status === "invited" && (
                      <Button size="sm" variant="outline" loading={busySeatId === seat.id} className="gap-1.5" onClick={() => onResend(seat.id)}>
                        <RotateCw className="h-3.5 w-3.5" />
                        Kirim Ulang
                      </Button>
                    )}
                    {seat.status !== "available" && (
                      <Button
                        size="sm"
                        variant="destructive"
                        loading={busySeatId === seat.id}
                        className="gap-1.5"
                        onClick={() => onRevoke(seat.id)}
                      >
                        <UserX className="h-3.5 w-3.5" />
                        Cabut
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <Dialog open={!!inviteTarget} onOpenChange={(open) => !open && setInviteTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Undang User Tambahan</DialogTitle>
          </DialogHeader>
          <form onSubmit={form.handleSubmit(onInvite)} className="flex flex-col gap-4">
            <CardDescription>Kirim link undangan ke email ini — mereka bisa login pakai password atau Google.</CardDescription>
            <FormField label="Email" error={form.formState.errors.email?.message}>
              <Input type="email" autoFocus placeholder="nama@email.com" {...form.register("email")} />
            </FormField>
            <DialogFooter>
              <Button type="submit" loading={form.formState.isSubmitting} className="w-full">
                Kirim Undangan
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
