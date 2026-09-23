"use client";

import { useMemo, useState } from "react";
import { Download, FileSpreadsheet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Alert } from "@/components/ui/alert";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { FileDropzone } from "@/components/ui/file-dropzone";
import { api } from "@/lib/api-client";
import { converterHasData, type ConverterCtxBase } from "@/lib/converter/converter-type";
import { CONVERTER_TYPE_REGISTRY } from "@/lib/converter/type-registry";
import { readExcelFile } from "@/lib/converter/read-excel";
import { downloadConverterTemplate } from "@/lib/converter/template";
import { downloadTextFile } from "@/lib/converter/download-file";

// § Fase 151, ADR-0038, architecture-konverter.md — halaman GENERIK per Varian (mirror pola legacy `handleFile`+
// `render`, `tool.html` baris 1397-1445): (1) isi Branch Code (+ Mata Uang Default kalau `needsCurrency`), (2)
// upload Excel via `FileDropzone`, (3) parse+`process()`+`build()` 100% DI BROWSER (tidak ada request server SAMA
// SEKALI di langkah ini), (4) tampilkan ringkasan+error/warning, (5) tombol Download panggil `POST
// /me/conversion-logs` DULU (gerbang kuota trial + entitlement, § "Trial — Kuota Baris" architecture doc) —
// BARU kalau `{ok:true}\` panggil `downloadTextFile()`. Component ini generik terhadap `ConverterType<TCtx>` apa
// pun — tiap halaman `/konverter/{tipe}/page.tsx` cuma nge-pass 1 modul type-nya sendiri.
//
// § Fase 157 (fix bug runtime, ditemukan user via /konverter/other-deposit) — SEBELUM ini terima `type:
// ConverterType<TCtx>` LANGSUNG sebagai prop dari `KonverterPage` (Server Component, § konverter-gate.tsx).
// Next.js App Router MENOLAK itu saat runtime: "Functions cannot be passed directly to Client Components" — objek
// `ConverterType` berisi 3 FUNCTION (`process`/`build`/`summary`), dan React TIDAK BISA serialisasi function
// menyeberang boundary Server→Client (kecuali Server Action). Fix: terima `moduleKey` (STRING, aman
// diserialisasi) saja, resolve objek `ConverterType` sendiri di sini lewat `CONVERTER_TYPE_REGISTRY` — resolusi
// itu terjadi 100% DI DALAM modul client ini, tidak pernah menyeberang boundary apa pun.
export function ConverterTypeView({ moduleKey }: { moduleKey: string }) {
  const type = CONVERTER_TYPE_REGISTRY[moduleKey];
  const [branch, setBranch] = useState("");
  const [defCurrency, setDefCurrency] = useState("IDR");
  const [file, setFile] = useState<File | undefined>(undefined);
  // § diminta user 2026-09-23 (bug) — SEBELUM ini, parse+process JADI SATU di `handleFile` (dipanggil SEKALI
  // saat file dipilih): kalau Branch Code masih kosong saat itu, prosesnya berhenti total dan TIDAK ADA yang
  // memicunya lagi begitu Branch Code diisi belakangan — file kelihatan "sudah terpilih" di UI tapi hasilnya
  // tidak pernah muncul sampai user re-upload file yang SAMA lagi. Fix: PARSE (baca file Excel, mahal — sekali
  // per file, ASYNC — state biasa) dipisah dari PROCESS (`type.process()`, murah, SYNCHRONOUS pure function
  // dari state yang sudah ada) — PROCESS dihitung sebagai NILAI DERIVED (`useMemo`, BUKAN `useEffect`+`setState`,
  // yang kena lint `react-hooks/set-state-in-effect` DAN secara desain memang tidak perlu effect sama sekali
  // untuk komputasi sinkron begini) — otomatis mengikuti setiap perubahan `branch`/`defCurrency`/`parsed`, TANPA
  // perlu "memicu ulang" apa pun secara manual. Parse Excel TIDAK diulang cuma karena Branch Code berubah (mahal,
  // tidak perlu — isi file tidak berubah).
  const [parsed, setParsed] = useState<{ rows: Record<string, unknown>[]; sheetCount: number; skippedExampleRows: number } | null>(null);
  const [actionNotice, setActionNotice] = useState<string | null>(null);
  const [processing, setProcessing] = useState(false);
  const [downloading, setDownloading] = useState(false);

  async function handleFile(selected: File | undefined) {
    setFile(selected);
    setParsed(null);
    setActionNotice(null);
    if (!selected || !type) return;

    setProcessing(true);
    try {
      const result = await readExcelFile(selected);
      setParsed(result);
    } catch (err) {
      setActionNotice(`Gagal membaca file: ${err instanceof Error ? err.message : String(err)}. Pastikan file Excel valid.`);
    } finally {
      setProcessing(false);
    }
  }

  const trimmedBranch = branch.trim();
  // § true begitu file SUDAH diparse (bukan cuma dipilih) TAPI Branch Code masih kosong — dipakai baik untuk
  // validasi inline field maupun notice, TIDAK PERNAH ketinggalan sinkron dari `ctx` karena sama-sama derived.
  const branchRequired = !!parsed && !trimmedBranch;
  const branchNotice = branchRequired ? "Branch Code belum diisi — isi dulu sebelum melihat ringkasan." : null;
  const notice = actionNotice ?? branchNotice;

  const ctx = useMemo<ConverterCtxBase | null>(() => {
    if (!parsed || !trimmedBranch || !type) return null;
    const result = type.process(parsed.rows, { branch: trimmedBranch, defCurrency: defCurrency.trim() || "IDR" });
    // § Fase 151 — warning tambahan pola SAMA legacy (baris contoh dilewati / lebih dari 1 sheet), ditaruh
    // di AWAL array (bukan diacak) supaya paling menonjol di kartu ringkasan.
    const extraWarnings: string[] = [];
    if (parsed.sheetCount > 1) extraWarnings.push(`File berisi ${parsed.sheetCount} sheet; hanya sheet pertama yang dibaca.`);
    if (parsed.skippedExampleRows) extraWarnings.push(`Dilewati ${parsed.skippedExampleRows} baris contoh template (bertanda CONTOH-HAPUS). Hapus baris contoh sebelum mengisi data asli.`);
    result.warnings = [...extraWarnings, ...result.warnings];
    return result;
  }, [parsed, trimmedBranch, defCurrency, type]);

  const hasErrors = !!ctx && ctx.errors.length > 0;
  // § Fase 156 — mirror legacy `hasData` (§ `converterHasData`, converter-type.ts): 0 error di file KOSONG (tidak
  // ada baris tervalidasi sama sekali) bukan berarti valid untuk di-download.
  const hasData = !!ctx && converterHasData(ctx);
  const summary = ctx && type ? type.summary(ctx) : null;
  const xml = ctx && type && !hasErrors && hasData ? type.build(ctx) : null;

  async function handleDownload() {
    if (!xml || !ctx || !summary || !type) return;
    setDownloading(true);
    setActionNotice(null);
    try {
      // § rowCount = field EKSPLISIT `summary().rowCount` (§ converter-type.ts) — hasil hitungan OTOMATIS, BUKAN
      // angka bebas (§ prinsip kuota trial architecture doc).
      const res = await api.me["conversion-logs"].post({ moduleKey: type.key, fileName: file?.name ?? type.fileName, rowCount: summary.rowCount });
      if (res.error) {
        const value = res.error.value as { code?: string; remaining?: number; max?: number } | undefined;
        setActionNotice(
          value?.code === "TRIAL_ROW_LIMIT_EXCEEDED"
            ? `Batas trial tercapai — sisa ${value.remaining} dari ${value.max} baris. Upgrade ke paket berbayar untuk lanjut.`
            : value?.code === "MODULE_NOT_SUBSCRIBED"
              ? "Langganan Varian ini tidak aktif. Aktifkan dulu lewat halaman Berlangganan."
              : "Gagal memproses permintaan download.",
        );
        return;
      }
      downloadTextFile(type.fileName, xml, "application/xml;charset=utf-8");
    } finally {
      setDownloading(false);
    }
  }

  // § pertahanan — SEHARUSNYA tidak pernah terjadi (`moduleKey` selalu dikirim `KonverterPage` dari daftar
  // moduleKey yang sudah divalidasi terdaftar di `MODULE_CATALOG`/`CONVERTER_TYPE_REGISTRY`), tapi gagal jelas
  // lebih baik daripada crash putih kalau suatu saat ada moduleKey yang lolos tanpa entri registry.
  if (!type) {
    return <Alert variant="destructive">Varian &quot;{moduleKey}&quot; tidak dikenal. Hubungi dukungan.</Alert>;
  }

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-foreground">{type.label}</h1>
        {/* § note legacy cuma tag <b>, hardcode di kode kita sendiri — aman di-render innerHTML, § converter-type.ts */}
        <p className="text-sm text-muted-foreground" dangerouslySetInnerHTML={{ __html: type.note }} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>1. Isi Data Dasar</CardTitle>
          <CardDescription>Branch Code sesuai Data Usaha di Accurate Desktop tujuan.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4 sm:flex-row">
          <label className="flex flex-1 flex-col gap-1.5">
            <span className="text-sm font-medium text-foreground">Branch Code</span>
            <Input value={branch} onChange={(e) => setBranch(e.target.value)} placeholder="mis. HO" />
            {branchRequired && <span className="text-xs text-destructive">Wajib diisi.</span>}
          </label>
          {type.needsCurrency && (
            <label className="flex flex-1 flex-col gap-1.5">
              <span className="text-sm font-medium text-foreground">Mata Uang Default</span>
              <Input value={defCurrency} onChange={(e) => setDefCurrency(e.target.value)} placeholder="IDR" />
            </label>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>2. Upload File Excel</CardTitle>
          <CardDescription>
            Kolom wajib: {type.headers.join(", ")}.{" "}
            <button type="button" onClick={() => downloadConverterTemplate(type)} className="text-primary-600 underline hover:text-primary-700">
              Download template Excel
            </button>
          </CardDescription>
        </CardHeader>
        <CardContent>
          <FileDropzone value={file} onChange={handleFile} accept=".xlsx,.xls" hint="Format .xlsx atau .xls" />
        </CardContent>
      </Card>

      {processing && <Alert variant="default">Memproses file…</Alert>}
      {notice && <Alert variant="destructive">{notice}</Alert>}

      {ctx && summary && (
        <Card>
          <CardHeader>
            <CardTitle>3. Ringkasan</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {summary.stats.map(([n, label]) => (
                <div key={label} className="rounded-lg border border-border bg-muted px-3 py-2 text-center">
                  <div className="text-xl font-bold text-foreground tabular-nums">{n}</div>
                  <div className="text-xs text-muted-foreground">{label}</div>
                </div>
              ))}
            </div>

            {!hasErrors && (
              <Alert variant="success">{summary.totals}</Alert>
            )}
            {hasErrors && (
              <Alert variant="destructive">
                <p className="font-medium">{ctx.errors.length} error ditemukan — perbaiki di Excel lalu upload ulang:</p>
                <ul className="mt-1 list-disc pl-4">
                  {ctx.errors.slice(0, 40).map((e, i) => (
                    <li key={i}>{e}</li>
                  ))}
                  {ctx.errors.length > 40 && <li>… +{ctx.errors.length - 40} error lain.</li>}
                </ul>
              </Alert>
            )}
            {ctx.warnings.length > 0 && (
              <Alert variant="warning">
                <p className="font-medium">Perlu dicek:</p>
                <ul className="mt-1 list-disc pl-4">
                  {ctx.warnings.slice(0, 25).map((w, i) => (
                    <li key={i}>{w}</li>
                  ))}
                  {ctx.warnings.length > 25 && <li>… +{ctx.warnings.length - 25} peringatan lain.</li>}
                </ul>
              </Alert>
            )}

            {xml && (
              <details className="rounded-lg border border-border">
                <summary className="cursor-pointer px-3 py-2 text-sm font-medium text-foreground">Pratinjau XML</summary>
                <pre className="max-h-64 overflow-auto whitespace-pre-wrap break-all bg-muted px-3 py-2 text-xs text-muted-foreground">{xml}</pre>
              </details>
            )}

            <Button onClick={handleDownload} disabled={!xml || downloading} className="self-start gap-1.5">
              <Download className="h-4 w-4" />
              {downloading ? "Memproses…" : "Download XML"}
            </Button>
          </CardContent>
        </Card>
      )}

      {/* § `!notice` ditambah — tanpa ini, hint generik ini tampil BERSAMAAN dengan Alert "Branch Code belum
         diisi" (keduanya sama-sama true saat ctx null gara-gara branch kosong), jadi user lihat 2 pesan sekaligus. */}
      {!ctx && !processing && !notice && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <FileSpreadsheet className="h-4 w-4" />
          Upload file Excel untuk melihat ringkasan konversi.
        </div>
      )}
    </div>
  );
}
