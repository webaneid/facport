# Fase 172 — Sales Order: tarik header, atribut baris & Beban dari Sales Quotation

**Status:** Done (2026-10-07) · **Doc:** `docs/architecture/architecture-sales-order.md` § Fase 172

## Tujuan & Scope
Lanjutan Fase 169: baris perluasan (Sales Quot No terisi, kolom item kosong) juga menarik kolom header, atribut baris, dan baris Expense dari penawaran.
Excel yang terisi menang. Expense Project tidak dibuat (Accurate tidak menyediakan).

## Ringkasan Hasil
- `accurate-sales-quotation.ts`: `parseSalesQuotationDetail`/`getSalesQuotationByNumber` (header + baris + Expense; inti baris ketat, tambahan toleran).
- `sales-order.mapping.ts`: `expandQuotationEntry` menarik atribut baris; `expandQuotationRowsInPayload` mengisi header kosong & Expense.
- Tes: parser + perluasan (Excel menang, Expense tidak ganda, tanpa perluasan tidak disentuh). Typecheck bersih.

## Known Limitations
- Nama field baca respons `sales-quotation/detail.do` belum diverifikasi respons asli.
- Header dari penawaran pertama saja; UI belum dilihat di browser.
