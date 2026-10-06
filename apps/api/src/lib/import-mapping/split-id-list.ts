// § diminta user 2026-10-06 — 1 sel Excel berisi BEBERAPA ID dipisah koma (mis. ID Karyawan penjual "42620120010, K-01") harus jadi array
// string beneran untuk field API bertipe array (`detailItem[].salesmanListNumber`). Bug: Sales Quotation dulu hanya membungkus seluruh sel
// jadi 1 elemen (`["42620120010, K-01"]`) sehingga Accurate tidak menemukan penjualnya. Pemisah: koma (standar template), titik-koma dan baris
// baru juga diterima (salah ketik umum). Spasi di sekitar tiap ID dibuang, entri kosong dibuang. SATU fungsi untuk Sales Quotation, Sales
// Order, dan Sales Invoice supaya aturannya tidak berbeda antar modul.
export function splitIdList(value: unknown): string[] {
  return String(value)
    .split(/[,;\n\r]+/)
    .map((part) => part.trim())
    .filter((part) => part !== "");
}
