import { describe, test, expect, mock, afterEach } from "bun:test";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
import { FormulaExportButton } from "./formula-export-button";

afterEach(cleanup);

describe("FormulaExportButton", () => {
  test("default: tidak menyertakan nonaktif; klik mengunduh dengan includeInactive=false", async () => {
    const download = mock(async (_url: string) => ({ ok: true as const, filename: "x.xlsx" }));
    render(<FormulaExportButton download={download} />);
    fireEvent.click(screen.getByRole("button", { name: /Export Excel/ }));
    await waitFor(() => expect(download).toHaveBeenCalled());
    expect(download.mock.calls[0]![0]).toContain("includeInactive=false");
  });

  test("centang 'Sertakan Formula nonaktif' → includeInactive=true", async () => {
    const download = mock(async (_url: string) => ({ ok: true as const, filename: "x.xlsx" }));
    render(<FormulaExportButton download={download} />);
    fireEvent.click(screen.getByRole("checkbox", { name: /nonaktif/i }));
    fireEvent.click(screen.getByRole("button", { name: /Export Excel/ }));
    await waitFor(() => expect(download).toHaveBeenCalled());
    expect(download.mock.calls[0]![0]).toContain("includeInactive=true");
  });

  test("tombol dikunci saat mengunduh (cegah klik ganda) lalu kembali aktif", async () => {
    let release!: () => void;
    const download = mock(() => new Promise<{ ok: true; filename: string }>((resolve) => (release = () => resolve({ ok: true, filename: "x.xlsx" }))));
    render(<FormulaExportButton download={download} />);
    const button = screen.getByRole("button", { name: /Export Excel/ }) as HTMLButtonElement;
    fireEvent.click(button);
    await waitFor(() => expect((screen.getByRole("button", { name: /Mengunduh/ }) as HTMLButtonElement).disabled).toBe(true));
    release();
    await waitFor(() => expect((screen.getByRole("button", { name: /Export Excel/ }) as HTMLButtonElement).disabled).toBe(false));
    expect(download).toHaveBeenCalledTimes(1);
  });
});
