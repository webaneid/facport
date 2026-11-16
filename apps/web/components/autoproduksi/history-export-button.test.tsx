import { describe, test, expect, mock, afterEach } from "bun:test";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
import { HistoryExportButton } from "./history-export-button";

afterEach(cleanup);

const today = () => "2026-11-14";
const button = () => screen.getByRole("button", { name: /Unduh Excel/ }) as HTMLButtonElement;
const setDate = (label: RegExp, value: string) => fireEvent.change(screen.getByLabelText(label), { target: { value } });

describe("HistoryExportButton", () => {
  test("default hari ini → klik mengunduh dengan rentang from=to=hari ini", async () => {
    const download = mock(async (_url: string) => ({ ok: true as const, filename: "x.xlsx" }));
    render(<HistoryExportButton download={download} today={today} baseUrl="http://api" />);
    fireEvent.click(button());
    await waitFor(() => expect(download).toHaveBeenCalled());
    expect(download.mock.calls[0]![0]).toBe("http://api/autoproduksi/production-entries/export?from=2026-11-14&to=2026-11-14");
  });

  test("rentang 3 hari → tombol terkunci + pesan; 2 hari → aktif", () => {
    render(<HistoryExportButton download={async () => ({ ok: true as const, filename: "x" })} today={today} />);
    setDate(/akhir/, "2026-11-16");
    expect(button().disabled).toBe(true);
    expect(screen.getByText(/Rentang maksimal 2 hari/)).toBeTruthy();
    setDate(/akhir/, "2026-11-15");
    expect(button().disabled).toBe(false);
  });

  test("tanggal akhir sebelum mulai → terkunci", () => {
    render(<HistoryExportButton download={async () => ({ ok: true as const, filename: "x" })} today={today} />);
    setDate(/akhir/, "2026-11-10");
    expect(button().disabled).toBe(true);
    expect(screen.getByText(/tidak boleh sebelum/)).toBeTruthy();
  });

  test("tombol dikunci saat mengunduh (cegah klik ganda)", async () => {
    let release!: () => void;
    const download = mock(() => new Promise<{ ok: true; filename: string }>((resolve) => (release = () => resolve({ ok: true, filename: "x.xlsx" }))));
    render(<HistoryExportButton download={download} today={today} />);
    fireEvent.click(button());
    await waitFor(() => expect((screen.getByRole("button", { name: /Mengunduh/ }) as HTMLButtonElement).disabled).toBe(true));
    release();
    await waitFor(() => expect(button().disabled).toBe(false));
    expect(download).toHaveBeenCalledTimes(1);
  });
});
