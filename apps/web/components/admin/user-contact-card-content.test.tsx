import { describe, test, expect } from "bun:test";
import { render, screen } from "@testing-library/react";
import { UserContactCardContent } from "./user-contact-card-content";

// § Fase 189A — tautan WhatsApp admin dibangun dari E.164 ASLI (wa.me/62…), bukan dari tampilan 08… (bug Jalajogja); nomor tak sah/kosong tanpa tautan.
describe("UserContactCardContent", () => {
  test("WhatsApp menjadi tautan wa.me tab baru dengan kode negara; tampilan teks 08…", () => {
    render(<UserContactCardContent companyName="PT Maju Jaya" phone="+628123456789" whatsapp="+628123456789" />);
    const link = screen.getByRole("link", { name: /Chat WhatsApp/ });
    expect(link.getAttribute("href")).toBe("https://wa.me/628123456789");
    expect(link.getAttribute("target")).toBe("_blank");
    expect(link.getAttribute("rel")).toContain("noopener");
    expect(link.textContent).toBe("08123456789");
    expect(screen.getByText("PT Maju Jaya")).toBeTruthy();
    expect(screen.getByRole("link", { name: "08123456789" }).getAttribute("href")).toBe("tel:+628123456789");
  });

  test("WhatsApp internasional tetap membawa kode negaranya", () => {
    render(<UserContactCardContent companyName="PT KL" phone="+60123456789" whatsapp="+60123456789" />);
    expect(screen.getByRole("link", { name: /Chat WhatsApp/ }).getAttribute("href")).toBe("https://wa.me/60123456789");
  });

  test("kosong → 'Belum diisi' dan tidak ada tautan; nomor rusak (data tak sah) juga tanpa tautan", () => {
    const { rerender } = render(<UserContactCardContent companyName={null} phone={null} whatsapp={null} />);
    expect(screen.getAllByText("Belum diisi")).toHaveLength(3);
    expect(screen.queryByRole("link")).toBeNull();
    rerender(<UserContactCardContent companyName="PT X" phone="+62" whatsapp="08<script>" />);
    expect(screen.queryByRole("link", { name: /Chat WhatsApp/ })).toBeNull();
  });
});
