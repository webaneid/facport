import { describe, test, expect } from "bun:test";
import { render } from "@testing-library/react";
import { Card, CardContent } from "./card";
import { Button } from "./button";
import { PageHeader } from "./page-header";
import { Badge } from "./badge";
import { StatCard } from "./stat-card";
import { CompactSurface } from "../app-shell/compact-surface";
import { Users } from "lucide-react";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// § Fase 190, ADR-0046 — kontrak design system admin: primitif membawa kelas `compact:` (aktif hanya di bawah data-ui="compact"), kelas dasar TIDAK hilang (surface pelanggan/landing
// tidak berubah), dan varian didefinisikan di globals.css. Tampilan sebenarnya diverifikasi user di browser.
describe("kelas dasar + varian compact", () => {
  test("Card/Button/PageHeader/Badge/StatCard memuat kelas dasar LAMA dan kelas compact: baru", () => {
    const { container } = render(
      <div>
        <Card data-t="card"><CardContent data-t="content">x</CardContent></Card>
        <Button data-t="button">b</Button>
        <PageHeader title="Judul" />
        <Badge data-t="badge">b</Badge>
        <StatCard icon={Users} label="L" value="1" />
      </div>,
    );
    const cls = (sel: string) => container.querySelector(sel)?.className ?? "";
    expect(cls('[data-t="card"]')).toContain("rounded-2xl"); // dasar tetap
    expect(cls('[data-t="card"]')).toContain("compact:rounded-lg");
    expect(cls('[data-t="content"]')).toContain("p-6");
    expect(cls('[data-t="content"]')).toContain("compact:p-4");
    expect(cls('[data-t="button"]')).toContain("rounded-xl");
    expect(cls('[data-t="button"]')).toContain("compact:rounded-md");
    expect(cls("h1")).toContain("text-3xl");
    expect(cls("h1")).toContain("compact:text-xl");
    expect(cls('[data-t="badge"]')).toContain("compact:text-[11px]");
    expect(container.innerHTML).toContain("compact:text-2xl");
  });
});

describe("CompactSurface", () => {
  test("membungkus dengan data-ui=compact dan memasang atribut di <body> (portal), melepasnya saat unmount", () => {
    const { container, unmount } = render(<CompactSurface><p>isi</p></CompactSurface>);
    expect(container.querySelector('[data-ui="compact"]')?.textContent).toBe("isi");
    expect(document.body.dataset.ui).toBe("compact");
    unmount();
    expect(document.body.dataset.ui).toBeUndefined();
  });
  test("globals.css mendefinisikan varian compact: yang di-scope ke data-ui", () => {
    const css = readFileSync(join(import.meta.dir, "../../app/globals.css"), "utf8");
    expect(css).toMatch(/@custom-variant compact \(&:where\(\[data-ui="compact"\], \[data-ui="compact"\] \*\)\)/);
  });
});
