import { KonverterPage } from "@/components/converter/konverter-gate";
import { deliveryOrderType } from "@/lib/converter/types/delivery-order";

export default function KonverterDeliveryOrderPage() {
  return <KonverterPage type={deliveryOrderType} />;
}
