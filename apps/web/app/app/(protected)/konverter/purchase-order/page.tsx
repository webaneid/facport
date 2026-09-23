import { KonverterPage } from "@/components/converter/konverter-gate";
import { purchaseOrderType } from "@/lib/converter/types/purchase-order";

export default function KonverterPurchaseOrderPage() {
  return <KonverterPage type={purchaseOrderType} />;
}
