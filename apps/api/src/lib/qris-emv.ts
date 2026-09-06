// § Fase 16, ADR-0022 — QRIS EMV TLV (Tag-Length-Value) parser & builder.
// Format QRIS Indonesia: teks (bukan biner), tiap field Tag(2 digit) +
// Length(2 digit desimal) + Value(N karakter). Adaptasi PERSIS dari
// referensi TERBUKTI production (jalajogja `apps/web/lib/qris-emv.ts`) —
// lihat docs/phases/phase-16-payment-manual.md § Referensi Riset.
//
// Kenapa manipulasi lokal (bukan API gateway): admin cuma perlu 1 foto
// QRIS statis dari bank/penyedia mereka (gratis) — sistem override Tag 54
// (nominal) supaya customer tidak perlu ketik manual nominal + kode unik,
// TANPA perlu daftar payment gateway/QRIS-acquirer apa pun. Lihat
// architecture-payment.md § "QRIS Dinamis".

type Tlv = { tag: string; value: string };

function parseTlv(str: string): Tlv[] {
  const result: Tlv[] = [];
  let i = 0;
  // Berhenti sebelum CRC (tag 63) — CRC dihitung ulang terpisah, jangan
  // ikut di-parse sebagai TLV biasa.
  while (i + 4 <= str.length) {
    const tag = str.slice(i, i + 2);
    if (tag === "63") break;
    const len = parseInt(str.slice(i + 2, i + 4), 10);
    if (isNaN(len) || i + 4 + len > str.length) break;
    result.push({ tag, value: str.slice(i + 4, i + 4 + len) });
    i += 4 + len;
  }
  return result;
}

function makeTlv(tag: string, value: string): string {
  return `${tag}${String(value.length).padStart(2, "0")}${value}`;
}

function buildFromTlvs(tlvs: Tlv[]): string {
  return tlvs.map(({ tag, value }) => makeTlv(tag, value)).join("");
}

// CRC16-CCITT (polynomial 0x1021, init 0xFFFF) — WAJIB persis algoritma
// ini, QRIS EMV spec menentukan CRC ini secara spesifik (bukan CRC16
// varian lain yang lebih umum).
function crc16(str: string): string {
  let crc = 0xffff;
  for (let i = 0; i < str.length; i++) {
    crc ^= str.charCodeAt(i) << 8;
    for (let j = 0; j < 8; j++) {
      crc = crc & 0x8000 ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff;
    }
  }
  return crc.toString(16).toUpperCase().padStart(4, "0");
}

// § reference (Tag 62 sub-tag 05) dipotong 25 karakter — batas EMV spec
// untuk Additional Data Field "Reference Label".
const MAX_REFERENCE_LENGTH = 25;

export function buildDynamicQris(staticPayload: string, amount: number, reference: string): string {
  // Strip CRC lama di akhir ("6304XXXX" = tag+length+4 hex char)
  const body = staticPayload.replace(/6304[0-9A-Fa-f]{4}$/, "");
  const tlvs = parseTlv(body);
  const output: Tlv[] = [];
  let hasTag54 = false;
  let hasTag62 = false;

  for (const { tag, value } of tlvs) {
    if (tag === "01") {
      // Point of Initiation Method: Static(11) -> Dynamic(12)
      output.push({ tag: "01", value: "12" });
    } else if (tag === "54") {
      // Transaction Amount — override
      output.push({ tag: "54", value: Math.round(amount).toString() });
      hasTag54 = true;
    } else if (tag === "53") {
      // Transaction Currency (IDR=360) — Tag 54 WAJIB tepat setelah tag
      // ini kalau belum ada (urutan field EMV signifikan)
      output.push({ tag, value });
      if (!hasTag54) {
        output.push({ tag: "54", value: Math.round(amount).toString() });
        hasTag54 = true;
      }
    } else if (tag === "62") {
      // Additional Data Field Template — inject/ganti sub-tag 05 (reference label)
      const ref = reference.slice(0, MAX_REFERENCE_LENGTH);
      const subTlvs = parseTlv(value);
      const has05 = subTlvs.some((s) => s.tag === "05");
      const newSubs = has05
        ? subTlvs.map((s) => (s.tag === "05" ? { tag: "05", value: ref } : s))
        : [{ tag: "05", value: ref }, ...subTlvs];
      output.push({ tag: "62", value: buildFromTlvs(newSubs) });
      hasTag62 = true;
    } else {
      output.push({ tag, value });
    }
  }

  if (!hasTag62) {
    const ref = reference.slice(0, MAX_REFERENCE_LENGTH);
    output.push({ tag: "62", value: makeTlv("05", ref) });
  }

  // § security review 2026-09-04 (Medium) — payload EMV admin yang tidak
  // punya Tag 53 MAUPUN Tag 54 (malformed/salah salin) sebelumnya lolos
  // TANPA nominal ter-inject sama sekali — QR tetap ditandai "dinamis"
  // (Tag 01="12") tapi customer diam-diam harus ketik manual nominal
  // TANPA tahu itu, kode unik jadi tidak ikut ke-transfer. WAJIB gagal
  // keras di sini (bukan silent), caller (`orders.route.ts` `GET
  // /orders/:id/qris`) sudah punya try/catch → 502 QRIS_GENERATION_FAILED.
  if (!hasTag54) {
    throw new Error("QRIS payload EMV tidak berisi tag Transaction Amount (54) atau Currency (53) yang valid untuk dijadikan dinamis");
  }

  const withoutCrc = buildFromTlvs(output) + "6304";
  return withoutCrc + crc16(withoutCrc);
}

export function isValidQrisPayload(payload: string): boolean {
  return payload.startsWith("0002") && /6304[0-9A-Fa-f]{4}$/.test(payload);
}
