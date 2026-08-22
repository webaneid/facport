# Architecture — Payment Gateway

> Untuk langganan/pembayaran penggunaan Facport sendiri (SaaS billing) —
> BUKAN bagian dari alur impor data ke Accurate Online (itu murni API
> integration, lihat `architecture-accurate-integration.md`). Terhubung ke
> model langganan → `docs/architecture/architecture-subscription.md`
> (`subscriptions.orderId` → `orders.id`).

## Tool: Ipaymu atau Xendit — Belum Final, Dua Kandidat
User project belum memutuskan provider final. Dua kandidat yang
dipertimbangkan untuk pasar Indonesia:

| | Ipaymu | Xendit |
|---|---|---|
| Fokus | UMKM/SaaS Indonesia, dukung QRIS, VA, e-wallet | Fintech/SaaS, API lebih modern, juga dukung disbursement |
| Dokumentasi | Bahasa Indonesia, cukup lengkap | Lengkap, API lebih konsisten (REST modern) |
| Cocok untuk | Billing langganan skala kecil-menengah | Kalau nanti butuh disbursement (refund otomatis, dst) juga |

**Keputusan final provider WAJIB dicatat di ADR baru** (`docs/decisions/adr-XXXX-pilih-payment-gateway.md`)
begitu diputuskan — jangan diam-diam pilih salah satu pas mulai
implementasi tanpa dokumentasi.

## ⚠️ Yang Paling Sering Salah — Verifikasi Webhook Signature
**Ini kelas bug security paling kritis di integrasi payment**: webhook
notifikasi pembayaran (`POST /webhooks/payment`) WAJIB diverifikasi
signature-nya, **JANGAN pernah percaya body request begitu saja** — siapa pun
bisa POST ke endpoint webhook kalau URL-nya diketahui, berpura-pura jadi
notifikasi "pembayaran sukses" palsu.

```ts
// apps/api/src/routes/webhooks.route.ts — contoh pola Xendit (HMAC + callback token)
import crypto from "crypto";

app.post("/webhooks/xendit", async ({ body, headers, set }) => {
  const callbackToken = headers["x-callback-token"];
  if (callbackToken !== process.env.XENDIT_CALLBACK_TOKEN) {
    set.status = 403;
    return { data: null, error: { code: "INVALID_SIGNATURE" } }; // TOLAK, jangan proses
  }

  // Token valid, baru proses update status order
  await processPaymentNotification(body);
});
```
> Ipaymu pakai skema verifikasi berbeda (signature dari kombinasi
> `va`+`apiKey`+`body`, di-hash) — **selalu cek dokumentasi resmi provider
> yang benar-benar dipakai**, jangan asumsikan sama antar provider.

## Idempotency — Webhook Bisa Terkirim Berkali-kali
Provider payment **bisa kirim webhook yang sama lebih dari sekali** (retry
dari sisi mereka kalau response kita lambat/timeout) — endpoint WAJIB
idempotent:
```ts
// Cek dulu apakah order_id ini sudah diproses sebelumnya
const existing = await getOrderStatus(body.order_id);
if (existing.status === "paid") {
  return { data: { message: "Already processed" }, error: null }; // return 200, JANGAN proses ulang/double-fulfill
}
```

## Alur Standar
```
Client (app.facport.com) → pilih plan → checkout → API create order + transaction (Ipaymu/Xendit) → return payment URL/token
Client → redirect ke payment page provider → user bayar
Provider → webhook ke API (§ verifikasi signature di atas) → update orders.status = "paid"
        → update subscriptions.status = "active", isi startAt/endAt (§ architecture-subscription.md)
Client → polling/redirect balik → tampilkan status final
```

## Data yang WAJIB Disimpan
```ts
export const orders = pgTable("orders", {
  id: uuid("id").defaultRandom().primaryKey(),
  externalId: varchar("external_id", { length: 100 }).notNull().unique(), // order_id yang dikirim ke provider
  status: varchar("status", { length: 20 }).notNull(), // "pending" | "paid" | "failed" | "expired"
  amount: integer("amount").notNull(), // dalam Rupiah (integer, HINDARI float untuk uang)
  paymentMethod: varchar("payment_method", { length: 50 }), // diisi dari webhook, mis. "qris" | "va_bca" | "ewallet"
  rawWebhookPayload: jsonb("raw_webhook_payload"), // simpan payload asli untuk audit/debug
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});
```
**Amount pakai integer, bukan float/decimal biasa** — floating point rawan
error pembulatan untuk uang, integer (dalam satuan Rupiah terkecil) lebih aman.

## Env (isi sesuai provider yang akhirnya dipilih)
```
# Ipaymu
IPAYMU_VA=
IPAYMU_API_KEY=
IPAYMU_IS_PRODUCTION=false   # WAJIB false di dev/staging

# Xendit
XENDIT_SECRET_KEY=
XENDIT_CALLBACK_TOKEN=
```

## Referensi
- Notifikasi konfirmasi pembayaran ke user → `docs/architecture/architecture-notifications.md`
- Audit log perubahan status order → `docs/architecture/architecture-security.md` §11
- Aktivasi langganan setelah bayar → `docs/architecture/architecture-subscription.md`
