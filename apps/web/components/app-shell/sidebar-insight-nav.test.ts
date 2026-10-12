import { describe, test, expect } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// § Fase 189D — menu "Insight" di grup admin, wajib ber-izin `insights.view`. Diperiksa dari sumber (bukan impor `sidebar.tsx`): modul itu memuat
// `next/navigation`, dan `mock.module` parsial dari file tes lain bocor lintas file sehingga impornya gagal di suite penuh (lessons-learned 189G).
const source = readFileSync(join(import.meta.dir, "sidebar.tsx"), "utf8");
const [appBlock = "", adminBlock = ""] = source.split(/\n {2}admin: \[/);

describe("nav admin — Insight", () => {
  test("item /insight ada di grup admin dan ber-izin insights.view", () => {
    expect(adminBlock).toMatch(/href: "\/insight", label: "Insight", icon: BarChart3, permission: "insights\.view"/);
  });
  test("tidak ada di nav pelanggan", () => {
    expect(appBlock).not.toContain('"/insight"');
  });
});
