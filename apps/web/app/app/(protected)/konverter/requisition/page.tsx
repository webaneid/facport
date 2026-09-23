import { KonverterPage } from "@/components/converter/konverter-gate";
import { requisitionType } from "@/lib/converter/types/requisition";

// § Fase 151, ADR-0038 — gerbang subscription + render `ConverterTypeView` sekarang di `KonverterPage`
// (component reusable, § `components/converter/konverter-gate.tsx`, diekstrak Fase 152).
export default function KonverterRequisitionPage() {
  return <KonverterPage type={requisitionType} />;
}
