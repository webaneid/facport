import { KonverterPage } from "@/components/converter/konverter-gate";
import { otherDepositType } from "@/lib/converter/types/cashbook";

export default function KonverterOtherDepositPage() {
  return <KonverterPage type={otherDepositType} />;
}
