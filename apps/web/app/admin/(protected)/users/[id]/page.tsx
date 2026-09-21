"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { Building2, Eye, Inbox, Link2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { Accordion, AccordionItem, AccordionTrigger, AccordionContent } from "@/components/ui/accordion";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { StatusBadge } from "@/lib/status-badges";
import { moduleLabel } from "@/lib/module-options";
import { formatDate } from "@/lib/utils";
import { formatDuration } from "@/lib/duration";
import { TruncateText } from "@/components/ui/truncate-text";
import { useCompanyTimezone } from "@/components/company-timezone-provider";
import { DisconnectAccurateDialog } from "@/components/admin/disconnect-accurate-dialog";
import { api } from "@/lib/api-client";

// § diminta user 2026-09-05 — halaman detail user, tujuannya bantu admin
// diagnosa saat user telepon minta support: profil singkat + riwayat
// SEMUA batch import (lintas modul), klik Detail buka log per baris
// (§ `admin/import-batches/[batchId]/page.tsx`) yang tampilannya PERSIS
// halaman customer, cuma READ-ONLY (tidak ada retry/edit).
// § Fase 92 (2026-09-10) — ditambah Card "Langganan & Koneksi Accurate"
// (data terpisah dari `import-batches`, fetch paralel) — sebelumnya
// admin SAMA SEKALI tidak bisa lihat status koneksi Accurate customer
// dari sini, apalagi memperbaikinya kalau bermasalah (harus edit
// database manual). Sekarang admin bisa lihat + "Putuskan Koneksi"
// (mirror kemampuan customer sendiri di `/accurate`, § Fase 91) supaya
// customer tinggal "Hubungkan Ulang" dari sisi mereka.
type ImportBatch = { id: string; module: string; fileName: string; status: string; totalRows: number; createdAt: string };
type Detail = {
  user: { id: string; name: string; email: string; disabled: boolean; createdAt: string };
  batches: ImportBatch[];
  total: number;
};
type SubscriptionRow = {
  subscriptionId: string;
  status: string;
  startAt: string | null;
  endAt: string | null;
  durationDays: number | null;
  moduleKey: string | null;
  planName: string;
  dataUsahaId: string;
  dataUsahaName: string;
};
// § Fase 144 — status koneksi Accurate per DATA USAHA (ADR-0037), bukan per subscription.
type DataUsahaRow = {
  id: string;
  name: string;
  isOwner: boolean;
  connected: boolean;
  connectionStatus: string | null;
  accountEmail: string | null;
  accurateDbAlias: string | null;
};

export default function AdminUserDetailPage() {
  const companyTimezone = useCompanyTimezone();
  const params = useParams<{ id: string }>();
  const [detail, setDetail] = useState<Detail | null>(null);
  const [subscriptions, setSubscriptions] = useState<SubscriptionRow[] | null>(null);
  const [dataUsahaList, setDataUsahaList] = useState<DataUsahaRow[]>([]);
  const [notFound, setNotFound] = useState(false);

  const loadSubscriptions = useCallback(async () => {
    const res = await api.admin.users({ id: params.id }).subscriptions.get();
    if (res.data) {
      const data = res.data as unknown as { subscriptions: SubscriptionRow[]; dataUsaha: DataUsahaRow[] };
      setSubscriptions(data.subscriptions);
      setDataUsahaList(data.dataUsaha);
    }
  }, [params.id]);

  useEffect(() => {
    async function load() {
      const res = await api.admin.users({ id: params.id })["import-batches"].get();
      if (res.data) setDetail(res.data as unknown as Detail);
      else if (res.error) setNotFound(true);
      await loadSubscriptions();
    }
    load();
  }, [params.id, loadSubscriptions]);

  if (notFound) {
    return <EmptyState icon={Inbox} title="User tidak ditemukan" />;
  }

  if (!detail) {
    return (
      <div className="flex flex-col gap-4">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }

  const { user, batches, total } = detail;

  // § diminta user 2026-09-12 — kelompokkan per Data Usaha (accordion),
  // supaya admin tahu langganan/fitur mana milik Data Usaha yang mana —
  // sebelumnya flat list tanpa konteks ini (endpoint dibuat Fase 92,
  // SEBELUM Data Usaha jadi entity Fase 107). Urutan grup ikut urutan
  // kemunculan pertama subscription-nya (backend sudah `orderBy(desc(createdAt))`).
  // § Fase 144 — grup mengikuti daftar Data Usaha dari API (termasuk Data Usaha TANPA langganan), tiap grup membawa status koneksinya
  // sendiri + subscription-nya. Urutan: Data Usaha yang punya subscription paling baru dulu (API urut createdAt desc), sisanya menyusul.
  const subsByDataUsaha = new Map<string, SubscriptionRow[]>();
  for (const sub of subscriptions ?? []) subsByDataUsaha.set(sub.dataUsahaId, [...(subsByDataUsaha.get(sub.dataUsahaId) ?? []), sub]);
  const orderIndex = new Map<string, number>();
  (subscriptions ?? []).forEach((sub, i) => {
    if (!orderIndex.has(sub.dataUsahaId)) orderIndex.set(sub.dataUsahaId, i);
  });
  const dataUsahaGroups = [...dataUsahaList]
    .sort((a, b) => (orderIndex.get(a.id) ?? Number.MAX_SAFE_INTEGER) - (orderIndex.get(b.id) ?? Number.MAX_SAFE_INTEGER))
    .map((du) => ({ du, subs: subsByDataUsaha.get(du.id) ?? [] }));

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Detail User" description="Profil & riwayat import — buat referensi saat user telepon support." />

      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <CardTitle>{user.name || "-"}</CardTitle>
              <CardDescription>{user.email}</CardDescription>
            </div>
            {user.disabled ? <Badge variant="destructive">Nonaktif</Badge> : <Badge variant="success">Aktif</Badge>}
          </div>
        </CardHeader>
        <CardContent>
          <p className="text-xs text-muted-foreground">Terdaftar {formatDate(user.createdAt, companyTimezone)}</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Langganan & Koneksi Accurate</CardTitle>
          <CardDescription>Dikelompokkan per Data Usaha — tiap Data Usaha punya koneksi Accurate sendiri-sendiri.</CardDescription>
        </CardHeader>
        <CardContent>
          {subscriptions === null ? (
            <Skeleton className="h-24 w-full" />
          ) : dataUsahaGroups.length === 0 ? (
            <EmptyState icon={Link2} title="Belum punya Data Usaha atau langganan" />
          ) : (
            <Accordion type="multiple" defaultValue={dataUsahaGroups.map((g) => g.du.id)}>
              {dataUsahaGroups.map((group) => (
                <AccordionItem key={group.du.id} value={group.du.id}>
                  <AccordionTrigger>
                    <span className="flex items-center gap-2">
                      <Building2 className="h-4 w-4 text-muted-foreground" />
                      {group.du.name}
                      <span className="text-xs font-normal text-muted-foreground">({group.subs.length} fitur)</span>
                    </span>
                  </AccordionTrigger>
                  <AccordionContent>
                    {/* § Fase 144 — koneksi Accurate SATU per Data Usaha: ringkasan + SATU tombol "Putuskan" (memutus semua fitur di bawah). */}
                    <div className="mb-3 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border bg-muted/30 px-3 py-2 text-sm">
                      <span className="flex flex-wrap items-center gap-2">
                        <span className="font-medium text-foreground">Koneksi Accurate</span>
                        {group.du.connectionStatus === null ? (
                          <Badge variant="default">Belum Terhubung</Badge>
                        ) : (
                          <StatusBadge domain="accurate-connection" status={group.du.connectionStatus} />
                        )}
                        {group.du.accurateDbAlias && <span className="text-xs text-muted-foreground">Database: {group.du.accurateDbAlias}</span>}
                        {group.du.accountEmail && <span className="text-xs text-muted-foreground">Akun: {group.du.accountEmail}</span>}
                        {!group.du.isOwner && <span className="text-xs text-muted-foreground">(bukan milik user ini)</span>}
                      </span>
                      {group.du.connectionStatus !== null && (
                        <DisconnectAccurateDialog
                          dataUsaha={{ id: group.du.id, name: group.du.name, accurateDbAlias: group.du.accurateDbAlias }}
                          onDisconnected={loadSubscriptions}
                        />
                      )}
                    </div>
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="w-[26%]">Fitur</TableHead>
                          <TableHead className="w-[28%]">Paket</TableHead>
                          {/* § ADR-0034 (2026-09-17) — "Durasi"+"Berlaku" (2
                              kolom terpisah, Fase 130) DIGABUNG jadi 1: cuma
                              tanggal AKHIR yang ditampilkan langsung (info
                              paling actionable — "kapan expired"), tanggal
                              mulai+durasi dipindah ke `title` attribute
                              (hover) via `TruncateText` — tetap ada, tidak
                              hilang, cuma tidak WAJIB selalu terlihat. */}
                          <TableHead className="w-[24%]">Berlaku</TableHead>
                          <TableHead className="w-[22%]">Status Langganan</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {group.subs.map((sub) => {
                          const berlakuTitle = [
                            sub.startAt ? `Mulai ${formatDate(sub.startAt, companyTimezone)}` : null,
                            sub.durationDays !== null ? `Durasi ${formatDuration(sub.durationDays)}` : null,
                          ]
                            .filter(Boolean)
                            .join(" · ");
                          return (
                            <TableRow key={sub.subscriptionId}>
                              <TableCell className="text-muted-foreground">
                                <TruncateText>{sub.moduleKey ? moduleLabel(sub.moduleKey) : "-"}</TruncateText>
                              </TableCell>
                              <TableCell className="font-medium text-foreground">
                                <TruncateText>{sub.planName}</TruncateText>
                              </TableCell>
                              <TableCell className="text-muted-foreground">
                                <TruncateText title={berlakuTitle || undefined}>{sub.endAt ? formatDate(sub.endAt, companyTimezone) : "-"}</TruncateText>
                              </TableCell>
                              <TableCell>
                                <StatusBadge domain="subscription" status={sub.status} />
                              </TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  </AccordionContent>
                </AccordionItem>
              ))}
            </Accordion>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Riwayat Import</CardTitle>
          <CardDescription>{total} batch total, lintas semua fitur.</CardDescription>
        </CardHeader>
        <CardContent>
          {batches.length === 0 ? (
            <EmptyState icon={Inbox} title="Belum ada riwayat import" />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[32%]">File</TableHead>
                  <TableHead className="w-[18%]">Fitur</TableHead>
                  <TableHead className="w-[14%]">Status</TableHead>
                  <TableHead className="w-[10%]">Baris</TableHead>
                  <TableHead className="w-[16%]">Tanggal</TableHead>
                  <TableHead className="w-[60px] text-right">Aksi</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {batches.map((batch) => (
                  <TableRow key={batch.id}>
                    <TableCell className="font-medium text-foreground">
                      <TruncateText>{batch.fileName}</TruncateText>
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      <TruncateText>{moduleLabel(batch.module)}</TruncateText>
                    </TableCell>
                    <TableCell>
                      <StatusBadge domain="import-batch" status={batch.status} />
                    </TableCell>
                    <TableCell>{batch.totalRows}</TableCell>
                    <TableCell className="text-muted-foreground">{formatDate(batch.createdAt, companyTimezone)}</TableCell>
                    <TableCell>
                      <div className="flex justify-end">
                        <Link
                          href={`/import-batches/${batch.id}`}
                          title="Detail"
                          aria-label={`Detail batch ${batch.fileName}`}
                          className={buttonVariants("ghost", "h-8 w-8 p-0")}
                        >
                          <Eye className="h-4 w-4" />
                        </Link>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
