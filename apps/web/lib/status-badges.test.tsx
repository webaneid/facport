import { describe, test, expect } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { StatusBadge } from "./status-badges";

// § diminta user 2026-10-03 — label status panjang harus dipotong "…" di batas kolom, bukan melewatinya.
describe("StatusBadge — truncate di layar kecil", () => {
  test("badge dibatasi lebar induk dan teksnya truncate; label lengkap ada di title", () => {
    const html = renderToStaticMarkup(<StatusBadge domain="order" status="submitted" />);
    expect(html).toContain("max-w-full");
    expect(html).toContain("min-w-0");
    expect(html).toContain('class="truncate"');
    expect(html).toMatch(/title="[^"]+"/);
  });

  test("className tambahan dari pemanggil tetap ikut", () => {
    expect(renderToStaticMarkup(<StatusBadge domain="invoice" status="paid" className="ml-2" />)).toContain("ml-2");
  });
});
