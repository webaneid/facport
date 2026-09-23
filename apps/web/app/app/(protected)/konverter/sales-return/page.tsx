import { KonverterPage } from "@/components/converter/konverter-gate";
import { salesReturnType } from "@/lib/converter/types/sales-return";

export default function KonverterSalesReturnPage() {
  return <KonverterPage type={salesReturnType} />;
}
