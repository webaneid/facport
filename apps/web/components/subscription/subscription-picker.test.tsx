import { describe, test, expect } from "bun:test";
import { useState } from "react";
import { render, screen, fireEvent, within } from "@testing-library/react";
import { SubscriptionPicker } from "./subscription-picker";
import type { ActiveSubscriptionInfo, PickerPlan } from "@/lib/subscription-picker";
import type { SubscriptionInterval } from "@/lib/subscription-period";

// § Fase 177, ADR-0041 — komponen pemilih langganan: banyak fitur sekaligus, filter Produk, satu periode, pratinjau tanggal+jam akhir (WIB).
let n = 0;
const plan = (moduleKey: string | null, interval: "monthly" | "yearly", price: number, extra: Partial<PickerPlan> = {}): PickerPlan => ({
  id: `p${++n}`,
  name: `${moduleKey ?? "seat"} ${interval}`,
  price,
  durationDays: interval === "yearly" ? 365 : 30,
  interval,
  modules: moduleKey ? [moduleKey] : [],
  isActive: true,
  ...extra,
});
const plans: PickerPlan[] = [
  plan("sales_invoice", "monthly", 100000),
  plan("sales_invoice", "yearly", 1000000),
  plan("purchase_invoice", "monthly", 90000), // tidak punya paket tahunan
  plan("konverter_sales_invoice", "monthly", 50000),
  plan("konverter_sales_invoice", "yearly", 500000),
  plan(null, "monthly", 20000, { kind: "seat_addon" }),
];
// 6 Okt 2026 14:35 WIB
const NOW = new Date(Date.UTC(2026, 9, 6, 7, 35));

function Harness({ active, startsAt, initial }: { active?: Map<string, ActiveSubscriptionInfo>; startsAt?: "exact" | "on-approval"; initial?: string[] }) {
  const [interval, setInterval] = useState<SubscriptionInterval>("monthly");
  const [keys, setKeys] = useState<Set<string>>(new Set(initial ?? []));
  return (
    <SubscriptionPicker
      plans={plans}
      activeByModule={active}
      interval={interval}
      onIntervalChange={setInterval}
      selectedKeys={keys}
      onSelectedKeysChange={setKeys}
      timeZone="Asia/Jakarta"
      startsAt={startsAt}
      now={NOW}
    />
  );
}

// nama aksesibel memuat Produk: "Sales Invoice" ada di Facport DAN Konverter
const checkbox = (name: string) => screen.getByRole("checkbox", { name }) as HTMLButtonElement;
const FP_SI = "Sales Invoice — Facport";
const FP_PI = "Purchase Invoice — Facport";
const SEAT = "Slot User Tambahan — Tambah User";

describe("SubscriptionPicker", () => {
  test("memilih banyak fitur sekaligus: ringkasan jumlah, total, dan satu tanggal+jam akhir untuk semua langganan baru (WIB)", () => {
    render(<Harness />);
    fireEvent.click(checkbox(FP_SI));
    fireEvent.click(checkbox(FP_PI));
    fireEvent.click(checkbox(SEAT));
    expect(screen.getByText(/fitur dipilih/).textContent).toContain("3");
    expect(screen.getByText(/Rp\s?210\.000/)).toBeTruthy(); // 100.000 + 90.000 + 20.000
    expect(screen.getByText(/3 langganan baru berakhir bersamaan/)).toBeTruthy();
    expect(screen.getAllByText(/6 Nov 2026.*WIB/).length).toBeGreaterThan(0); // bulan depan, jam 14.35
  });

  test("ganti ke Tahunan: harga tahunan; fitur tanpa paket tahunan tidak tersedia & terlepas dari pilihan", () => {
    render(<Harness initial={["sales_invoice", "purchase_invoice"]} />);
    fireEvent.click(screen.getByRole("button", { name: "Tahunan" }));
    expect(screen.getAllByText(/Rp\s?1\.000\.000/).length).toBeGreaterThan(0);
    expect(checkbox(FP_PI).disabled).toBe(true);
    expect(checkbox(FP_PI).getAttribute("aria-checked")).toBe("false"); // pilihan dilepas otomatis
    expect(checkbox(FP_SI).getAttribute("aria-checked")).toBe("true");
    // Purchase Invoice dan Slot User Tambahan sama-sama tidak punya paket tahunan di fixture ini
    expect(screen.getAllByText(/Tidak tersedia untuk periode tahunan/)).toHaveLength(2);
    // tahun depan: tampil di baris fitur DAN di ringkasan
    expect(screen.getAllByText(/6 Okt 2027.*WIB/).length).toBeGreaterThanOrEqual(2);
  });

  test("filter Produk + 'Pilih semua (hasil filter)' hanya memilih yang tampil; tombol berubah jadi 'Lepas semua'", () => {
    render(<Harness />);
    fireEvent.click(screen.getByRole("button", { name: /^Konverter/ }));
    expect(screen.queryByRole("checkbox", { name: FP_SI })).toBeNull(); // baris Facport tersaring
    fireEvent.click(screen.getByRole("button", { name: "Pilih semua (hasil filter)" }));
    expect(screen.getByText(/fitur dipilih/).textContent).toContain("1");
    expect(checkbox("Sales Invoice — Konverter").getAttribute("aria-checked")).toBe("true");
    expect(screen.getByRole("button", { name: "Lepas semua (hasil filter)" })).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: /^Semua/ }));
    expect(checkbox(FP_SI).getAttribute("aria-checked")).toBe("false"); // yang Facport TIDAK ikut terpilih
    expect(screen.getByRole("button", { name: "Pilih semua (hasil filter)" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Kosongkan" }));
    expect(screen.getByText(/fitur dipilih/).textContent).toContain("0");
  });

  test("pencarian menyaring fitur; 'tidak ada' menampilkan pesan", () => {
    render(<Harness />);
    fireEvent.change(screen.getByLabelText("Cari fitur"), { target: { value: "slot user" } });
    expect(screen.queryByRole("checkbox", { name: "Purchase Invoice" })).toBeNull();
    expect(checkbox(SEAT)).toBeTruthy();
    fireEvent.change(screen.getByLabelText("Cari fitur"), { target: { value: "zzz" } });
    expect(screen.getByText("Tidak ada fitur untuk filter ini.")).toBeTruthy();
  });

  test("mode Perpanjang: fitur aktif ditandai, menampilkan akhir saat ini & akhir baru = akhir lama + periode (bukan dari sekarang)", () => {
    const active = new Map<string, ActiveSubscriptionInfo>([["sales_invoice", { endAt: new Date(Date.UTC(2027, 0, 1, 13, 0)).toISOString(), isTrial: false }]]); // 1 Jan 2027 20:00 WIB
    render(<Harness active={active} initial={["sales_invoice"]} />);
    expect(screen.getByText("Aktif")).toBeTruthy();
    expect(screen.getByText(/Berlaku sampai 1 Jan 2027.*WIB/)).toBeTruthy();
    expect(screen.getByText(/Diperpanjang dari tanggal berakhir → sampai 1 Feb 2027.*WIB/)).toBeTruthy();
    expect(screen.getByText(/1 diperpanjang dari tanggal & jam berakhirnya/)).toBeTruthy();
  });

  test("trial aktif: ditandai Trial dan pratinjau 'Menggantikan trial' (mulai sekarang)", () => {
    const active = new Map<string, ActiveSubscriptionInfo>([["sales_invoice", { endAt: new Date(Date.UTC(2026, 9, 20, 3, 0)).toISOString(), isTrial: true }]]);
    render(<Harness active={active} initial={["sales_invoice"]} />);
    expect(screen.getByText("Trial")).toBeTruthy();
    expect(screen.getByText(/Menggantikan trial → berakhir 6 Nov 2026/)).toBeTruthy();
  });

  test("startsAt 'on-approval' (invoice): tanpa tanggal pasti, hanya aturan 'dimulai saat pembayaran disetujui'", () => {
    render(<Harness startsAt="on-approval" initial={["sales_invoice"]} />);
    expect(screen.getByText(/Langganan dimulai saat pembayaran disetujui/)).toBeTruthy();
    expect(screen.queryByText(/6 Nov 2026/)).toBeNull();
    const summary = screen.getByText(/fitur dipilih/).closest("div")!;
    expect(within(summary).getByText(/bulan berikutnya/)).toBeTruthy();
  });
});
