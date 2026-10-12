import { describe, test, expect, mock, beforeEach } from "bun:test";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

// § Fase 190D — palet perintah: Ctrl+K membuka, item disaring izin, pencarian pelanggan (debounce, min 2 huruf, hanya dengan users.view), pilih → navigasi.
let permissions = ["users.view", "insights.view"];
const push = mock((_href: string) => {});
const usersGet = mock(async (_a: unknown): Promise<{ data: unknown; error: unknown }> => ({ data: { users: [{ id: "u1", name: "Budi Santoso", email: "budi@test.local" }] }, error: null }));
mock.module("next/navigation", () => ({ useRouter: () => ({ push }) }));
mock.module("@/lib/api-client", () => ({ api: { admin: { users: { get: usersGet } } }, apiBaseUrl: "" }));
mock.module("@/lib/use-permissions", () => ({ usePermissions: () => permissions, usePermission: (k: string) => permissions.includes(k), PermissionsProvider: ({ children }: { children: React.ReactNode }) => children }));
const { CommandPalette } = await import("./command-palette");

const items = [
  { href: "/", label: "Dashboard" },
  { href: "/users", label: "Pengguna", permission: "users.view" },
  { href: "/insight", label: "Insight", permission: "insights.view" },
  { href: "/plans", label: "Paket", permission: "plans.manage" },
];

beforeEach(() => {
  permissions = ["users.view", "insights.view"];
  push.mockClear();
  usersGet.mockClear();
});

describe("CommandPalette", () => {
  test("Ctrl+K membuka; hanya item yang diizinkan tampil; memilih item menavigasi dan menutup", async () => {
    render(<CommandPalette items={items} />);
    expect(screen.queryByLabelText("Kolom pencarian")).toBeNull();
    fireEvent.keyDown(document, { key: "k", ctrlKey: true });
    expect(await screen.findByLabelText("Kolom pencarian")).toBeTruthy();
    expect(screen.getByText("Insight")).toBeTruthy();
    expect(screen.queryByText("Paket")).toBeNull(); // tanpa plans.manage
    await userEvent.click(screen.getByText("Insight"));
    expect(push).toHaveBeenCalledWith("/insight");
    await waitFor(() => expect(screen.queryByLabelText("Kolom pencarian")).toBeNull());
  });

  test("ketik menyaring halaman; ≥2 huruf mencari pelanggan (debounce) dan memilihnya membuka detail", async () => {
    render(<CommandPalette items={items} />);
    fireEvent.keyDown(document, { key: "k", metaKey: true });
    const input = await screen.findByLabelText("Kolom pencarian");
    await userEvent.type(input, "b");
    expect(usersGet).not.toHaveBeenCalled(); // 1 huruf: belum mencari
    await userEvent.type(input, "ud");
    await waitFor(() => expect(usersGet).toHaveBeenCalledTimes(1));
    expect(usersGet.mock.calls[0]?.[0]).toEqual({ query: { search: "bud", limit: 6 } });
    await userEvent.click(await screen.findByText("Budi Santoso"));
    expect(push).toHaveBeenCalledWith("/users/u1");
  });

  test("tanpa users.view: tidak ada pencarian pelanggan dan tidak memanggil API", async () => {
    permissions = ["insights.view"];
    render(<CommandPalette items={items} />);
    fireEvent.keyDown(document, { key: "k", ctrlKey: true });
    await userEvent.type(await screen.findByLabelText("Kolom pencarian"), "budi");
    await new Promise((r) => setTimeout(r, 400));
    expect(usersGet).not.toHaveBeenCalled();
    expect(screen.queryByText("Budi Santoso")).toBeNull();
  });
});
