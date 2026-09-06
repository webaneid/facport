import { describe, test, expect } from "bun:test";
import QRCode from "qrcode";
import sharp from "sharp";
import { decodeQrisEmvPayload } from "./qris-decode";

// § diminta user 2026-09-06 — verifikasi round-trip NYATA: generate QR
// code sungguhan (bukan mock) berisi payload EMV, lalu pastikan
// `decodeQrisEmvPayload` bisa baca isinya balik — sama seperti alur
// asli (admin foto barcode QRIS fisik, sistem baca otomatis).
const VALID_EMV_PAYLOAD = "000201" + "6304" + "ABCD"; // struktural valid: mulai "0002", akhir "6304"+4 hex

describe("decodeQrisEmvPayload", () => {
  test("baca balik payload EMV dari QR code sungguhan (round-trip)", async () => {
    const qrBuffer = await QRCode.toBuffer(VALID_EMV_PAYLOAD, { width: 300, margin: 1 });
    const result = await decodeQrisEmvPayload(qrBuffer);
    expect(result).toBe(VALID_EMV_PAYLOAD);
  });

  test("null kalau QR code valid tapi ISINYA bukan payload QRIS (mis. QR link website)", async () => {
    const qrBuffer = await QRCode.toBuffer("https://facport.com", { width: 300, margin: 1 });
    const result = await decodeQrisEmvPayload(qrBuffer);
    expect(result).toBeNull();
  });

  test("null kalau gambar BUKAN QR code sama sekali (foto polos)", async () => {
    const plainImage = await sharp({ create: { width: 200, height: 200, channels: 3, background: { r: 255, g: 255, b: 255 } } })
      .png()
      .toBuffer();
    const result = await decodeQrisEmvPayload(plainImage);
    expect(result).toBeNull();
  });

  test("null (bukan throw) kalau buffer bukan gambar valid sama sekali", async () => {
    const garbage = Buffer.from("bukan file gambar sama sekali");
    const result = await decodeQrisEmvPayload(garbage);
    expect(result).toBeNull();
  });

  test("payload dengan whitespace di dalam QR code TETAP dibaca trim (defense-in-depth)", async () => {
    // § kasus edge: kalau barcode fisiknya sendiri encode string dengan
    // whitespace tersisa (jarang, tapi tetap ditangani sama seperti input
    // manual, § lessons-learned.md 2026-09-06).
    const qrBuffer = await QRCode.toBuffer(`  ${VALID_EMV_PAYLOAD}  `, { width: 300, margin: 1 });
    const result = await decodeQrisEmvPayload(qrBuffer);
    expect(result).toBe(VALID_EMV_PAYLOAD);
  });
});
