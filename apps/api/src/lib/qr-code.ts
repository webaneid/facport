import QRCode from "qrcode";

// § Fase 16 — generate QR code jadi data URL PNG base64, dipakai
// `<img src={...}>` langsung di frontend. TIDAK disimpan ke MinIO/disk —
// di-generate on-demand tiap request (payload EMV berubah tiap invoice,
// tidak ada gunanya di-cache).
export async function generateQrDataUrl(text: string): Promise<string> {
  return QRCode.toDataURL(text, {
    width: 300,
    margin: 1,
    errorCorrectionLevel: "M",
    color: { dark: "#000000", light: "#ffffff" },
  });
}
