import { KonverterPage } from "@/components/converter/konverter-gate";
import { salesInvoiceType } from "@/lib/converter/types/sales-invoice";

export default function KonverterSalesInvoicePage() {
  return <KonverterPage type={salesInvoiceType} />;
}
