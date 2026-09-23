import { KonverterPage } from "@/components/converter/konverter-gate";
import { otherPaymentType } from "@/lib/converter/types/cashbook";

export default function KonverterOtherPaymentPage() {
  return <KonverterPage type={otherPaymentType} />;
}
