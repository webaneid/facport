import { describe, test, expect } from "bun:test";
import { useState } from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ContactFields, EMPTY_CONTACT, validateContact, type ContactValues } from "./contact-fields";

// Callback `onValue` dipanggil dari event handler (bukan saat render) — mencatat nilai terbaru untuk asersi.
function Harness({ initial = EMPTY_CONTACT, onValue }: { initial?: ContactValues; onValue?: (v: ContactValues) => void }) {
  const [value, setValue] = useState(initial);
  return (
    <ContactFields
      value={value}
      onChange={(v) => {
        setValue(v);
        onValue?.(v);
      }}
    />
  );
}

describe("validateContact", () => {
  const ok: ContactValues = { companyName: "PT Maju", phone: "+628123456789", whatsapp: "+628123456789" };
  test("sah → null", () => {
    expect(validateContact(ok)).toBeNull();
  });
  test("kosong → galat untuk ketiga isian, dengan pesan wajib diisi", () => {
    const errors = validateContact(EMPTY_CONTACT);
    expect(errors).toMatchObject({ companyName: "Nama perusahaan wajib diisi" });
    expect(errors?.phone).toContain("Nomor telepon");
    expect(errors?.whatsapp).toContain("Nomor WhatsApp");
  });
  test("nama hanya spasi, nomor tanpa + atau terlalu pendek ditolak", () => {
    expect(validateContact({ ...ok, companyName: "   " })?.companyName).toBeTruthy();
    expect(validateContact({ ...ok, phone: "628123456789" })?.phone).toBeTruthy();
    expect(validateContact({ ...ok, whatsapp: "+6281" })?.whatsapp).toBeTruthy();
    expect(validateContact({ ...ok, companyName: "a".repeat(201) })?.companyName).toBeTruthy();
  });
});

describe("ContactFields", () => {
  test("kotak centang 'WhatsApp sama dengan nomor telepon' aktif di awal: mengetik telepon otomatis mengisi WhatsApp, isian WhatsApp tersembunyi", async () => {
    const user = userEvent.setup();
    const seen: ContactValues[] = [];
    render(<Harness onValue={(v) => seen.push(v)} />);
    const checkbox = screen.getByRole("checkbox", { name: "WhatsApp sama dengan nomor telepon" });
    expect(checkbox.getAttribute("data-state")).toBe("checked");
    expect(screen.queryByLabelText("Nomor WhatsApp")).toBeNull();

    await user.type(screen.getByLabelText("Nomor telepon"), "081234567890");
    expect(seen.at(-1)!.phone).toBe("+6281234567890");
    expect(seen.at(-1)!.whatsapp).toBe("+6281234567890");
  });

  test("hilangkan centang → isian WhatsApp muncul dan bisa diisi nomor lain tanpa mengubah telepon", async () => {
    const user = userEvent.setup();
    const seen: ContactValues[] = [];
    render(<Harness onValue={(v) => seen.push(v)} />);
    await user.type(screen.getByLabelText("Nomor telepon"), "081234567890");
    await user.click(screen.getByRole("checkbox", { name: "WhatsApp sama dengan nomor telepon" }));
    const wa = screen.getByLabelText("Nomor WhatsApp");

    await user.clear(wa);
    await user.type(wa, "0899887766");
    expect(seen.at(-1)!.whatsapp).toBe("+62899887766");
    expect(seen.at(-1)!.phone).toBe("+6281234567890");
  });

  test("data awal dengan WhatsApp berbeda → centang mati dan WhatsApp tampil", () => {
    render(<Harness initial={{ companyName: "PT A", phone: "+628111111111", whatsapp: "+628222222222" }} />);
    expect(screen.getByRole("checkbox", { name: "WhatsApp sama dengan nomor telepon" }).getAttribute("data-state")).toBe("unchecked");
    expect((screen.getByLabelText("Nomor WhatsApp") as HTMLInputElement).value).toBe("8222222222");
  });

  test("nama perusahaan terisi di state induk", async () => {
    const user = userEvent.setup();
    const seen: ContactValues[] = [];
    render(<Harness onValue={(v) => seen.push(v)} />);
    await user.type(screen.getByPlaceholderText("Nama Perusahaan"), "PT Maju Jaya");
    expect(seen.at(-1)!.companyName).toBe("PT Maju Jaya");
  });
});
