import { describe, test, expect } from "bun:test";
import { render, screen } from "@testing-library/react";
import { DataCheckNotice } from "./data-check-notice";

describe("DataCheckNotice", () => {
  test("tanpa dataCheck atau semuanya nol → tidak render apa pun", () => {
    expect(render(<DataCheckNotice />).container.firstChild).toBeNull();
    expect(render(<DataCheckNotice dataCheck={{ cleanedCells: 0, normalizedKeyCells: 0, warnings: [] }} />).container.firstChild).toBeNull();
  });

  test("menampilkan jumlah sel yang dirapikan otomatis", () => {
    render(<DataCheckNotice dataCheck={{ cleanedCells: 12, normalizedKeyCells: 3, warnings: [] }} />);
    expect(screen.getByText("Data dirapikan otomatis")).toBeInTheDocument();
    expect(screen.getByText(/12 sel dibersihkan/)).toBeInTheDocument();
    expect(screen.getByText(/3 sel kode\/nama master dirapikan/)).toBeInTheDocument();
    expect(screen.queryByText(/Periksa karakter tidak biasa/)).not.toBeInTheDocument();
  });

  test("menampilkan peringatan dengan kolom, jumlah, nomor baris, dan contoh; menegaskan tidak diubah otomatis", () => {
    render(
      <DataCheckNotice
        dataCheck={{
          cleanedCells: 0,
          normalizedKeyCells: 0,
          warnings: [{ column: "Item No", kind: "non_ascii", count: 7, rows: [2, 3, 4, 5, 6], example: '"X-1" — "X" (U+0421)' }],
        }}
      />,
    );
    expect(screen.getByText(/Periksa karakter tidak biasa/)).toBeInTheDocument();
    expect(screen.getByText("Item No")).toBeInTheDocument();
    expect(screen.getByText(/7 sel berisi karakter non-ASCII/)).toBeInTheDocument();
    expect(screen.getByText(/baris 2, 3, 4, 5, 6, …/)).toBeInTheDocument();
    expect(screen.getByText(/U\+0421/)).toBeInTheDocument();
    expect(screen.getByText(/tidak diubah otomatis/)).toBeInTheDocument();
  });
});
