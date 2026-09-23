import { KonverterPage } from "@/components/converter/konverter-gate";
import { purchaseReturnType } from "@/lib/converter/types/purchase-return";

export default function KonverterPurchaseReturnPage() {
  return <KonverterPage type={purchaseReturnType} />;
}
