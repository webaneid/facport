import { describe, test, expect, mock, beforeEach } from "bun:test";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

// § Fase 217, ADR-0054 — dialog lepas klaim trial: tombol aktif hanya setelah alasan diisi, kirim alasan, galat server dipetakan.
type Res = { data: unknown; error: unknown };
const releasePost = mock(async (_b: unknown): Promise<Res> => ({ data: { released: true }, error: null }));
const toastSuccess = mock((_m: string) => {});
mock.module("@/lib/api-client", () => ({ api: { admin: { "trial-claims": (_a: { id: string }) => ({ release: { post: releasePost } }) } }, apiBaseUrl: "" }));
mock.module("sonner", () => ({ toast: { success: toastSuccess, error: mock((_m: string) => {}) } }));
const { TrialClaimReleaseDialog } = await import("./trial-claim-release-dialog");

beforeEach(() => {
  releasePost.mockClear();
  toastSuccess.mockClear();
});

describe("TrialClaimReleaseDialog", () => {
  test("tombol nonaktif tanpa alasan; terapkan mengirim alasan, menutup dan memanggil onDone", async () => {
    const onDone = mock(() => {});
    const onOpenChange = mock((_o: boolean) => {});
    render(<TrialClaimReleaseDialog open onOpenChange={onOpenChange} claimId="c1" accurateDbId="2672480" moduleName="Sales Receipt" onDone={onDone} />);
    const button = screen.getByRole("button", { name: "Lepas klaim" }) as HTMLButtonElement;
    expect(button.disabled).toBe(true);
    await userEvent.type(screen.getByLabelText("Alasan melepas klaim"), "  salah klaim  ");
    expect(button.disabled).toBe(false);
    await userEvent.click(button);
    await waitFor(() => expect(releasePost).toHaveBeenCalledTimes(1));
    expect(releasePost.mock.calls[0]?.[0]).toEqual({ reason: "salah klaim" });
    expect(onDone).toHaveBeenCalledTimes(1);
    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(toastSuccess).toHaveBeenCalled();
  });

  test("galat server tampil sebagai pesan Indonesia dan dialog tetap terbuka", async () => {
    releasePost.mockImplementationOnce(async () => ({ data: null, error: { value: { code: "CLAIM_ALREADY_RELEASED" } } }));
    const onDone = mock(() => {});
    render(<TrialClaimReleaseDialog open onOpenChange={() => {}} claimId="c1" accurateDbId="2672480" moduleName="Sales Receipt" onDone={onDone} />);
    await userEvent.type(screen.getByLabelText("Alasan melepas klaim"), "coba lagi");
    await userEvent.click(screen.getByRole("button", { name: "Lepas klaim" }));
    expect(await screen.findByText(/sudah dilepas/)).toBeTruthy();
    expect(onDone).not.toHaveBeenCalled();
  });
});
