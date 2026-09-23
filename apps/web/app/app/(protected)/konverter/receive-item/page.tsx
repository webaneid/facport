import { KonverterPage } from "@/components/converter/konverter-gate";
import { receiveItemType } from "@/lib/converter/types/receive-item";

export default function KonverterReceiveItemPage() {
  return <KonverterPage type={receiveItemType} />;
}
