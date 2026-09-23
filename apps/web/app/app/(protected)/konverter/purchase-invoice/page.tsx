import { KonverterPage } from "@/components/converter/konverter-gate";
import { purchaseInvoiceType } from "@/lib/converter/types/purchase-invoice";

export default function KonverterPurchaseInvoicePage() {
  return <KonverterPage type={purchaseInvoiceType} />;
}
