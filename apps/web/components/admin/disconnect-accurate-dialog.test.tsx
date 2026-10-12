import { describe, test, expect, mock, beforeEach } from "bun:test";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

// § Fase 189B, D10 — alasan putus koneksi OPSIONAL (saran cepat + catatan internal): terkirim hanya bila diisi.
const disconnectPost = mock(async (_b: unknown): Promise<{ data: unknown; error: unknown }> => ({ data: { disconnected: true }, error: null }));
mock.module("@/lib/api-client", () => ({
  api: { admin: { "data-usaha": () => ({ "disconnect-accurate": { post: disconnectPost } }) } },
  apiBaseUrl: "",
  markActiveDataUsahaSeen: () => {},
}));
mock.module("sonner", () => ({ toast: { success: () => {}, error: () => {} } }));

const { DisconnectAccurateDialog } = await import("./disconnect-accurate-dialog");

beforeEach(() => disconnectPost.mockClear());

async function open() {
  const onDisconnected = mock(() => {});
  const user = userEvent.setup();
  render(<DisconnectAccurateDialog dataUsaha={{ id: "du-1", name: "PT Maju", accurateDbAlias: "PT Salah" }} onDisconnected={onDisconnected} />);
  await user.click(screen.getByRole("button", { name: /Putuskan koneksi Accurate Data Usaha PT Maju/ }));
  await screen.findByRole("dialog");
  return { user, onDisconnected };
}

describe("DisconnectAccurateDialog — alasan opsional", () => {
  test("tanpa alasan: body hanya removeAccount (perilaku lama tidak berubah)", async () => {
    const { user, onDisconnected } = await open();
    await user.click(screen.getByRole("button", { name: "Putuskan Koneksi" }));
    await waitFor(() => expect(disconnectPost).toHaveBeenCalledTimes(1));
    expect(disconnectPost.mock.calls[0]![0]).toEqual({ removeAccount: false });
    await waitFor(() => expect(onDisconnected).toHaveBeenCalled());
  });

  test("saran cepat + catatan: dikirim sebagai reason {code, note} (ter-trim)", async () => {
    const { user } = await open();
    await user.click(screen.getByRole("button", { name: "Salah database" }));
    await user.type(screen.getByLabelText("Catatan alasan"), "  Pilih PT yang salah, via WA  ");
    await user.click(screen.getByRole("button", { name: "Putuskan Koneksi" }));
    await waitFor(() => expect(disconnectPost).toHaveBeenCalledTimes(1));
    expect(disconnectPost.mock.calls[0]![0]).toEqual({ removeAccount: false, reason: { code: "salah_database", note: "Pilih PT yang salah, via WA" } });
  });

  test("hanya catatan, hanya kode, atau kode dilepas lagi (klik ulang) → bentuk reason yang sesuai; kosong → tanpa reason", async () => {
    const { user } = await open();
    await user.click(screen.getByRole("button", { name: "Salah akun Accurate" }));
    await user.click(screen.getByRole("button", { name: "Salah akun Accurate" })); // lepas pilihan
    await user.click(screen.getByRole("button", { name: "Putuskan Koneksi" }));
    await waitFor(() => expect(disconnectPost).toHaveBeenCalledTimes(1));
    expect(disconnectPost.mock.calls[0]![0]).toEqual({ removeAccount: false });
  });
});
