import { KonverterPage } from "@/components/converter/konverter-gate";
import { salesOrderType } from "@/lib/converter/types/sales-order";

export default function KonverterSalesOrderPage() {
  return <KonverterPage type={salesOrderType} />;
}
