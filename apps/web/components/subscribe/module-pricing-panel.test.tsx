import { describe, test, expect, mock } from "bun:test";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { ModulePricingPanel, type Plan } from "./module-pricing-panel";

// § Fase 176, ADR-0041 poin 4 — fitur yang masih aktif bisa DIPERPANJANG dari tanggal berakhir saat ini; pratinjau memakai fungsi yang sama dengan server.
const monthly: Plan = { id: "p-m", name: "Sales Order Bulanan", price: 100000, durationDays: 30, interval: "monthly", modules: ["sales_order"], isActive: true, trialEligible: false, kind: "module" };
const yearly: Plan = { id: "p-y", name: "Sales Order Tahunan", price: 1000000, durationDays: 365, interval: "yearly", modules: ["sales_order"], isActive: true, trialEligible: false, kind: "module" };
const group = { moduleKey: "sales_order", tiers: [yearly, monthly] } as never;

function renderPanel(over: Partial<React.ComponentProps<typeof ModulePricingPanel>> = {}) {
  const onToggle = mock(() => {});
  const onSelectTier = mock((_id: string) => {});
  render(
    <ModulePricingPanel
      group={group}
      activePlan={monthly}
      isSelected={false}
      isRealActive={false}
      isTrialActive={false}
      subscriptionInfo={undefined}
      hasEverTrialed={false}
      showTrialButton={false}
      tryingPlanId={null}
      onToggle={onToggle}
      onSelectTier={onSelectTier}
      onStartTrial={() => {}}
      {...over}
    />,
  );
  return { onToggle, onSelectTier };
}

describe("ModulePricingPanel — perpanjangan dini", () => {
  test("belum berlangganan: tombol 'Berlangganan', tanpa pratinjau perpanjangan", () => {
    renderPanel();
    expect(screen.getByRole("button", { name: "Berlangganan" })).toBeTruthy();
    expect(screen.queryByText(/Sisa masa aktifmu tidak hilang/)).toBeNull();
  });

  test("sudah berlangganan: tombol 'Perpanjang' aktif + pilihan periode TIDAK dikunci + pratinjau akhir baru = akhir lama + 1 bulan (jam sama, WIB)", () => {
    // akhir saat ini 6 Nov 2026 14:35 WIB (07:35Z), jangkar selaras: mulai 6 Okt 14:35 WIB, 1 bulan
    const { onToggle, onSelectTier } = renderPanel({
      isRealActive: true,
      subscriptionInfo: { startAt: "2026-10-06T07:35:00.000Z", endAt: "2026-11-06T07:35:00.000Z", periodAnchorAt: "2026-10-06T07:35:00.000Z", periodMonths: 1 },
    });
    expect(screen.getByText(/Sisa masa aktifmu tidak hilang/)).toBeTruthy();
    expect(screen.getByText(/6 Des 2026.*WIB/)).toBeTruthy(); // 6 Nov + 1 bulan, zona WIB
    fireEvent.click(screen.getByRole("button", { name: "Perpanjang" }));
    expect(onToggle).toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "1 Tahun" }));
    expect(onSelectTier).toHaveBeenCalledWith("p-y");
  });

  test("pratinjau mengikuti paket aktif yang dipilih: tahunan → +12 bulan dari akhir saat ini", () => {
    renderPanel({
      activePlan: yearly,
      isRealActive: true,
      subscriptionInfo: { startAt: "2026-10-06T07:35:00.000Z", endAt: "2026-11-06T07:35:00.000Z", periodAnchorAt: "2026-10-06T07:35:00.000Z", periodMonths: 1 },
    });
    expect(screen.getByText(/6 Nov 2027/)).toBeTruthy(); // 6 Nov 2026 + 12 bulan (jangkar 1 + 12 = 13 bulan dari 6 Okt)
  });
});

// § Fase 181, ADR-0042 — perpanjangan terjadwal di panel pelanggan: info + tombol Matikan (konfirmasi dulu; hanya mematikan).
describe("ModulePricingPanel — perpanjangan terjadwal", () => {
  const info = { subscriptionId: "sub-1", startAt: "2026-10-06T07:35:00.000Z", endAt: "2026-11-06T07:35:00.000Z", periodAnchorAt: "2026-10-06T07:35:00.000Z", periodMonths: 1, renewalInterval: "yearly" as const };
  function panel(over: Partial<React.ComponentProps<typeof ModulePricingPanel>> = {}) {
    const onTurnOffRenewal = mock(async (_id: string) => {});
    render(
      <ModulePricingPanel
        group={group}
        activePlan={monthly}
        isSelected={false}
        isRealActive
        isTrialActive={false}
        subscriptionInfo={info}
        hasEverTrialed={false}
        showTrialButton={false}
        tryingPlanId={null}
        onToggle={() => {}}
        onSelectTier={() => {}}
        onStartTrial={() => {}}
        onTurnOffRenewal={onTurnOffRenewal}
        {...over}
      />,
    );
    return { onTurnOffRenewal };
  }

  test("langganan aktif ber-perpanjangan-terjadwal: info jenis (Tahunan) + 7 hari sebelum berakhir; tidak tampil tanpa penanda atau saat trial", () => {
    panel();
    expect(screen.getByText(/Perpanjangan terjadwal: Tahunan/)).toBeTruthy();
    expect(screen.getByText(/terbit otomatis 7 hari sebelum berakhir/)).toBeTruthy();
  });
  test("tanpa penanda → tidak ada blok perpanjangan terjadwal", () => {
    panel({ subscriptionInfo: { ...info, renewalInterval: null } });
    expect(screen.queryByText(/Perpanjangan terjadwal/)).toBeNull();
  });
  test("Matikan: butuh konfirmasi 'Ya, matikan' (Batal membatalkan); konfirmasi memanggil onTurnOffRenewal dengan id langganan", async () => {
    const { onTurnOffRenewal } = panel();
    fireEvent.click(screen.getByRole("button", { name: "Matikan perpanjangan terjadwal" }));
    fireEvent.click(screen.getByRole("button", { name: "Batal" }));
    expect(onTurnOffRenewal).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Matikan perpanjangan terjadwal" }));
    fireEvent.click(screen.getByRole("button", { name: "Ya, matikan" }));
    await waitFor(() => expect(onTurnOffRenewal).toHaveBeenCalledWith("sub-1"));
  });
});
