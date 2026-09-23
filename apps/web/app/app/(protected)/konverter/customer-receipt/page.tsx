import { KonverterPage } from "@/components/converter/konverter-gate";
import { customerReceiptType } from "@/lib/converter/types/customer-receipt";

export default function KonverterCustomerReceiptPage() {
  return <KonverterPage type={customerReceiptType} />;
}
