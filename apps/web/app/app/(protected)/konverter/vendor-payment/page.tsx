import { KonverterPage } from "@/components/converter/konverter-gate";
import { vendorPaymentType } from "@/lib/converter/types/vendor-payment";

export default function KonverterVendorPaymentPage() {
  return <KonverterPage type={vendorPaymentType} />;
}
