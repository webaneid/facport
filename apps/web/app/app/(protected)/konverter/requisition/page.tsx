import { KonverterPage } from "@/components/converter/konverter-gate";

// § Fase 157 — `moduleKey` string literal langsung (BUKAN import objek `xxxType` lagi, § catatan lengkap
// `konverter-gate.tsx`/`converter-type-view.tsx` soal kenapa: objek `ConverterType` berisi function, TIDAK BOLEH
// diserialisasi Server→Client).
export default function KonverterRequisitionPage() {
  return <KonverterPage moduleKey="konverter_requisition" />;
}
