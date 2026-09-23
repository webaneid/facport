import type { ConverterType } from "./converter-type";
import { requisitionType } from "./types/requisition";
import { itemTransferType } from "./types/item-transfer";
import { journalVoucherType } from "./types/journal-voucher";
import { otherDepositType, otherPaymentType } from "./types/cashbook";
import { customerReceiptType } from "./types/customer-receipt";
import { vendorPaymentType } from "./types/vendor-payment";
import { purchaseInvoiceType } from "./types/purchase-invoice";
import { purchaseOrderType } from "./types/purchase-order";
import { receiveItemType } from "./types/receive-item";
import { purchaseReturnType } from "./types/purchase-return";
import { salesInvoiceType } from "./types/sales-invoice";
import { salesOrderType } from "./types/sales-order";
import { deliveryOrderType } from "./types/delivery-order";
import { salesReturnType } from "./types/sales-return";
import { standardCostType } from "./types/standard-cost";

// § Fase 157 (fix bug runtime, ditemukan user via /konverter/other-deposit) — SATU tempat semua 16 `ConverterType`
// diimpor, dipakai KHUSUS oleh `ConverterTypeView` (Client Component, § komentar lengkap di sana soal KENAPA ini
// perlu ada sama sekali: Next.js App Router TIDAK BISA mengirim objek berisi function (`process`/`build`/
// `summary`) dari Server Component ke Client Component sebagai prop — "Functions cannot be passed directly to
// Client Components"). Registry ini di-import di FILE CLIENT (`converter-type-view.tsx`), jadi resolusinya
// PURNA di sisi client, tidak pernah menyeberang boundary sama sekali — cukup `moduleKey` (string, aman
// diserialisasi) yang dikirim dari Server Component.
//
// § `ConverterType<any>` SENGAJA (bukan generic union) — tiap entri punya `TCtx` konkret berbeda
// (`RequisitionCtx`/`JournalVoucherCtx`/dst), TypeScript tidak bisa (dan tidak perlu) melacak kecocokan tipe
// lintas 16 entri berbeda di 1 Record; konsistensi `process()`↔`build()`↔`summary()` per entri dijamin oleh
// modul sumbernya sendiri (§ tiap `types/*.ts`, sudah diverifikasi test XML exact-match), bukan oleh compiler
// di titik lookup ini.
export const CONVERTER_TYPE_REGISTRY: Record<string, ConverterType<any>> = {
  [requisitionType.key]: requisitionType,
  [itemTransferType.key]: itemTransferType,
  [journalVoucherType.key]: journalVoucherType,
  [otherDepositType.key]: otherDepositType,
  [otherPaymentType.key]: otherPaymentType,
  [customerReceiptType.key]: customerReceiptType,
  [vendorPaymentType.key]: vendorPaymentType,
  [purchaseInvoiceType.key]: purchaseInvoiceType,
  [purchaseOrderType.key]: purchaseOrderType,
  [receiveItemType.key]: receiveItemType,
  [purchaseReturnType.key]: purchaseReturnType,
  [salesInvoiceType.key]: salesInvoiceType,
  [salesOrderType.key]: salesOrderType,
  [deliveryOrderType.key]: deliveryOrderType,
  [salesReturnType.key]: salesReturnType,
  [standardCostType.key]: standardCostType,
};
