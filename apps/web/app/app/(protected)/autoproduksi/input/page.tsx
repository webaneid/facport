"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Combobox } from "@/components/ui/combobox";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { api } from "@/lib/api-client";

// § Fase 159 — form PALING SEDERHANA di seluruh Facport: pilih formula +
// input qty produksi, sisanya OTOMATIS (hitung kebutuhan bahan baku, kirim
// ke Accurate). Konfirmasi alur ke user 2026-09-28: "cukup bilang produksi
// berapa Bolu, sisanya otomatis mengikuti resep yang sudah didefinisikan
// di awal". Diproses ASYNC lewat job queue (JOBS.PROCESS_AUTOPRODUKSI_ENTRY)
// — submit langsung dapat status "pending", hasil final dicek di halaman
// Riwayat (polling), konsisten pola 23 modul lain (bukan tunggu di halaman
// ini).
type Formula = { id: string; name: string; finishedGoodItemNo: string; finishedGoodItemUnitName: string };

function todayIsoDate(): string {
  return new Date().toISOString().slice(0, 10);
}

export default function AutoProduksiInputPage() {
  const [formulas, setFormulas] = useState<Formula[] | null>(null);
  const [formulaId, setFormulaId] = useState("");
  const [producedQty, setProducedQty] = useState("");
  const [transDate, setTransDate] = useState(todayIsoDate());
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    (async () => {
      const res = await api.autoproduksi.formulas.get();
      if (res.data) setFormulas((res.data as unknown as { formulas: Formula[] }).formulas);
    })();
  }, []);

  const selectedFormula = formulas?.find((f) => f.id === formulaId);

  async function handleSubmit() {
    if (!formulaId) {
      toast.error("Pilih formula dulu.");
      return;
    }
    const qty = Number(producedQty);
    if (!qty || qty <= 0) {
      toast.error("Qty produksi harus lebih dari 0.");
      return;
    }
    setSubmitting(true);
    const res = await api.autoproduksi["production-entries"].post({ formulaId, producedQty: qty, transDate });
    setSubmitting(false);
    if (res.error) {
      toast.error("Gagal submit input produksi.");
      return;
    }
    toast.success("Input produksi terkirim — cek status di halaman Riwayat.");
    setProducedQty("");
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-foreground">Input Produksi</h1>
        <p className="text-sm text-muted-foreground">
          Pilih formula & qty hasil produksi — kebutuhan Bahan Baku dihitung otomatis sesuai resep.
        </p>
      </div>

      <Card className="max-w-lg">
        <CardHeader>
          <CardTitle>Form Input Produksi</CardTitle>
          <CardDescription>Belum ada formula? Buat dulu di halaman List Formula.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {!formulas ? (
            <Skeleton className="h-40 w-full" />
          ) : formulas.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Belum ada formula.{" "}
              <Link href="/autoproduksi/formulas" className="text-primary underline">
                Buat formula pertama
              </Link>
              .
            </p>
          ) : (
            <>
              <label className="flex flex-col gap-1.5 text-sm">
                <span className="text-xs font-medium text-foreground">Formula / Resep</span>
                <Combobox
                  options={formulas.map((f) => ({ value: f.id, label: f.name }))}
                  value={formulaId}
                  onChange={setFormulaId}
                  placeholder="Pilih formula..."
                />
              </label>
              <label className="flex flex-col gap-1.5 text-sm">
                <span className="text-xs font-medium text-foreground">Tanggal Transaksi</span>
                <Input type="date" value={transDate} onChange={(e) => setTransDate(e.target.value)} />
              </label>
              <label className="flex flex-col gap-1.5 text-sm">
                <span className="text-xs font-medium text-foreground">
                  Qty Produksi {selectedFormula ? `(${selectedFormula.finishedGoodItemUnitName})` : ""}
                </span>
                <Input type="number" value={producedQty} onChange={(e) => setProducedQty(e.target.value)} placeholder="1" />
              </label>
              <Button onClick={handleSubmit} disabled={submitting}>
                {submitting ? "Mengirim..." : "Input Produksi"}
              </Button>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
