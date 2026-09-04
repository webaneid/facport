"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { toast } from "sonner";
import { Landmark, ScanLine, Upload } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { api } from "@/lib/api-client";

type BankAccount = { id: string; bankName: string; accountNumber: string; accountName: string };
type QrisAccountPublic = { id: string; name: string; imageUrl: string };
type OrderDetail = {
  order: { id: string; method: string | null; status: string; bankAccountRef: string | null; qrisAccountRef: string | null; rejectionNote: string | null };
  invoice: { invoiceNumber: string; billToName: string; total: number };
  amountDue: number;
  bankAccounts: BankAccount[];
  qrisAccounts: QrisAccountPublic[];
};

const currencyFormatter = new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 });

// § Fase 16, ADR-0022 — halaman pembayaran manual: pilih metode (transfer
// bank/QRIS) -> lihat instruksi (nominal SUDAH termasuk kode unik) ->
// upload bukti. Route by `orderId` (bukan `invoiceId`) karena SEMUA
// endpoint backend fase ini dikunci by order.
export default function PayOrderPage() {
  const params = useParams<{ orderId: string }>();
  const orderId = params.orderId;
  const router = useRouter();
  const [detail, setDetail] = useState<OrderDetail | null | "not-found">(null);
  const [qris, setQris] = useState<{ type: "static" | "dynamic"; imageUrl?: string; qrDataUrl?: string } | null>(null);
  const [selectedAccountRef, setSelectedAccountRef] = useState<string | null>(null);
  const [selectedMethod, setSelectedMethod] = useState<"bank_transfer" | "qris" | null>(null);
  const [savingMethod, setSavingMethod] = useState(false);
  const [transferDate, setTransferDate] = useState(new Date().toISOString().slice(0, 10));
  const [payerNote, setPayerNote] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);

  async function load() {
    const res = await api.orders({ id: orderId }).get();
    if (res.error || !res.data) {
      setDetail("not-found");
      return;
    }
    const data = res.data as unknown as OrderDetail;
    setDetail(data);
    if (data.order.method === "qris") {
      const qrisRes = await api.orders({ id: orderId }).qris.get();
      if (qrisRes.data) setQris(qrisRes.data as unknown as { type: "static" | "dynamic"; imageUrl?: string; qrDataUrl?: string });
    }
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch data awal saat mount, pola standar
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orderId]);

  async function handleSelectMethod(method: "bank_transfer" | "qris") {
    if (!selectedAccountRef) return;
    setSavingMethod(true);
    const res = await api.orders({ id: orderId }).method.patch({ method, accountRef: selectedAccountRef });
    setSavingMethod(false);
    if (res.error) {
      toast.error("Gagal pilih metode pembayaran.");
      return;
    }
    await load();
  }

  async function handleUploadProof() {
    if (!file) {
      toast.error("Pilih foto bukti transfer dulu.");
      return;
    }
    setUploading(true);
    const res = await api.orders({ id: orderId }).proof.patch({
      file,
      transferDate: new Date(transferDate).toISOString(),
      payerNote: payerNote || undefined,
    });
    setUploading(false);
    if (res.error) {
      const code = (res.error.value as { code?: string } | undefined)?.code;
      toast.error(code === "INVALID_IMAGE_FILE" ? "Foto tidak bisa diproses, coba format JPG/PNG lain." : "Gagal upload bukti transfer.");
      return;
    }
    toast.success("Bukti transfer berhasil diupload, menunggu verifikasi admin.");
    await load();
  }

  if (detail === "not-found") {
    return (
      <div className="mx-auto max-w-2xl">
        <EmptyState icon={Landmark} title="Pembayaran tidak ditemukan" description="Order ini tidak ada atau bukan milikmu." />
      </div>
    );
  }

  if (!detail) {
    return (
      <div className="mx-auto flex max-w-2xl flex-col gap-4">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  const { order, invoice, amountDue, bankAccounts, qrisAccounts } = detail;

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-foreground">Bayar Invoice {invoice.invoiceNumber}</h1>
        <p className="text-sm text-muted-foreground">{invoice.billToName}</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Total Pembayaran</CardTitle>
          <CardDescription>Transfer PERSIS nominal ini (sudah termasuk kode unik) supaya mudah dicocokkan admin.</CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-3xl font-bold text-primary-700">{currencyFormatter.format(amountDue)}</p>
        </CardContent>
      </Card>

      {order.status === "paid" && (
        <Card>
          <CardContent className="py-6">
            <Badge variant="success" className="mb-2">
              ✓ Lunas
            </Badge>
            <p className="text-sm text-muted-foreground">Pembayaran sudah dikonfirmasi admin. Langganan kamu sudah aktif.</p>
            <Button onClick={() => router.push("/billing")} className="mt-3">
              Kembali ke Tagihan
            </Button>
          </CardContent>
        </Card>
      )}

      {order.status === "submitted" && (
        <Card>
          <CardContent className="py-6">
            <Badge variant="warning" className="mb-2">
              Menunggu Verifikasi
            </Badge>
            <p className="text-sm text-muted-foreground">Bukti transfer sudah diupload, admin akan verifikasi secepatnya.</p>
          </CardContent>
        </Card>
      )}

      {(order.status === "pending" || order.status === "rejected") && (
        <>
          {order.status === "rejected" && order.rejectionNote && (
            <Card>
              <CardContent className="py-4">
                <Badge variant="destructive" className="mb-2">
                  Ditolak
                </Badge>
                <p className="text-sm text-destructive">{order.rejectionNote}</p>
                <p className="mt-1 text-xs text-muted-foreground">Silakan periksa kembali & upload ulang bukti transfer.</p>
              </CardContent>
            </Card>
          )}

          {!order.method && (
            <Card>
              <CardHeader>
                <CardTitle>Pilih Metode Pembayaran</CardTitle>
              </CardHeader>
              <CardContent className="flex flex-col gap-4">
                {bankAccounts.length > 0 && (
                  <div className="flex flex-col gap-2">
                    <div className="flex items-center gap-2 text-sm font-medium text-foreground">
                      <Landmark className="h-4 w-4" /> Transfer Bank
                    </div>
                    {bankAccounts.map((acc) => (
                      <button
                        key={acc.id}
                        type="button"
                        onClick={() => setSelectedAccountRef(acc.id)}
                        className={`rounded-lg border px-4 py-3 text-left text-sm transition-colors ${
                          selectedAccountRef === acc.id ? "border-primary-600 bg-primary-50 ring-1 ring-primary-600" : "border-border hover:bg-muted/50"
                        }`}
                      >
                        <span className="font-medium text-foreground">{acc.bankName}</span> — {acc.accountNumber} a.n. {acc.accountName}
                      </button>
                    ))}
                    {selectedAccountRef && bankAccounts.some((a) => a.id === selectedAccountRef) && (
                      <Button onClick={() => handleSelectMethod("bank_transfer")} disabled={savingMethod} className="self-start">
                        Pakai Rekening Ini
                      </Button>
                    )}
                  </div>
                )}
                {qrisAccounts.length > 0 && (
                  <div className="flex flex-col gap-2">
                    <div className="flex items-center gap-2 text-sm font-medium text-foreground">
                      <ScanLine className="h-4 w-4" /> QRIS
                    </div>
                    {qrisAccounts.map((acc) => (
                      <button
                        key={acc.id}
                        type="button"
                        onClick={() => setSelectedAccountRef(acc.id)}
                        className={`rounded-lg border px-4 py-3 text-left text-sm transition-colors ${
                          selectedAccountRef === acc.id ? "border-primary-600 bg-primary-50 ring-1 ring-primary-600" : "border-border hover:bg-muted/50"
                        }`}
                      >
                        {acc.name}
                      </button>
                    ))}
                    {selectedAccountRef && qrisAccounts.some((a) => a.id === selectedAccountRef) && (
                      <Button onClick={() => handleSelectMethod("qris")} disabled={savingMethod} className="self-start">
                        Pakai QRIS Ini
                      </Button>
                    )}
                  </div>
                )}
                {bankAccounts.length === 0 && qrisAccounts.length === 0 && (
                  <p className="text-sm text-destructive">Metode pembayaran belum dikonfigurasi admin. Hubungi admin untuk melanjutkan.</p>
                )}
              </CardContent>
            </Card>
          )}

          {order.method === "bank_transfer" && order.bankAccountRef && (
            <Card>
              <CardHeader>
                <CardTitle>Instruksi Transfer Bank</CardTitle>
              </CardHeader>
              <CardContent>
                {(() => {
                  const selected = bankAccounts.find((a) => a.id === order.bankAccountRef);
                  // § security review 2026-09-04 (Low) — admin bisa saja
                  // hapus rekening ini setelah customer memilihnya (order
                  // masih pending/rejected) — jangan render kosong tanpa
                  // pesan, bingungkan customer.
                  if (!selected) {
                    return <p className="text-sm text-destructive">Rekening yang dipilih sudah tidak tersedia. Hubungi admin untuk melanjutkan.</p>;
                  }
                  return (
                    <p className="text-sm text-foreground">
                      <span className="font-medium">{selected.bankName}</span> — {selected.accountNumber} a.n. {selected.accountName}
                    </p>
                  );
                })()}
              </CardContent>
            </Card>
          )}

          {order.method === "qris" && qris && (
            <Card>
              <CardHeader>
                <CardTitle>Scan QRIS</CardTitle>
                {qris.type === "static" && <CardDescription>Ketik manual nominal di atas saat scan (kode unik WAJIB ikut ditransfer).</CardDescription>}
              </CardHeader>
              <CardContent className="flex justify-center">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={qris.type === "dynamic" ? qris.qrDataUrl : qris.imageUrl} alt="QRIS" className="h-64 w-64 object-contain" />
              </CardContent>
            </Card>
          )}

          {order.method && (
            <Card>
              <CardHeader>
                <CardTitle>Upload Bukti Transfer</CardTitle>
              </CardHeader>
              <CardContent className="flex flex-col gap-4">
                <label className="flex flex-col gap-1.5">
                  <span className="text-sm font-medium text-foreground">Tanggal Transfer</span>
                  <Input type="date" value={transferDate} onChange={(e) => setTransferDate(e.target.value)} />
                </label>
                <label className="flex flex-col gap-1.5">
                  <span className="text-sm font-medium text-foreground">Foto Bukti Transfer</span>
                  <Input type="file" accept="image/jpeg,image/png,image/webp,image/heic,image/heif" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
                </label>
                <label className="flex flex-col gap-1.5">
                  <span className="text-sm font-medium text-foreground">Catatan (opsional)</span>
                  <Input value={payerNote} onChange={(e) => setPayerNote(e.target.value)} placeholder="mis. transfer dari rekening pribadi" />
                </label>
                <Button onClick={handleUploadProof} disabled={uploading || !file} className="self-start">
                  <Upload className="h-4 w-4" />
                  {uploading ? "Mengupload..." : "Upload Bukti"}
                </Button>
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  );
}
