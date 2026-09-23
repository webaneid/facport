import { KonverterPage } from "@/components/converter/konverter-gate";
import { standardCostType } from "@/lib/converter/types/standard-cost";

export default function KonverterStandardCostPage() {
  return <KonverterPage type={standardCostType} />;
}
