# Glossary

## Istilah Teknis Project
| Istilah    | Arti                                                    |
|------------|-----------------------------------------------------------|
| apps/api   | Backend Elysia/Bun                                          |
| apps/web   | Frontend Next.js                                            |
| Presigned URL | Mekanisme URL sementara MinIO untuk upload/download langsung tanpa lewat API — **BELUM dipakai** di project ini, upload sekarang lewat proxy API (§ `architecture-storage.md`). Istilah dicatat di sini karena masih relevan buat gap terbuka soal cara nampilin gambar dari MinIO ke browser (belum diputuskan). |
| Import batch | Satu proses impor 1 file Excel (bisa berisi ribuan baris) — lihat `import_batches` di `architecture-accurate-integration.md` |

## Istilah Domain
| Istilah   | Arti singkat |
|-----------|---------------|
| Accurate Online | Sistem akuntansi pihak ketiga (accurate.id) yang jadi tujuan akhir semua data yang diimpor lewat Facport |
| Import mapping | Proses pemetaan kolom Excel milik user ke field yang dibutuhkan API Accurate (nama kolom Excel tidak selalu sama dengan nama field Accurate) — lihat `architecture-accurate-integration.md` §3 |
| Modul | **Istilah overload, 3 arti berbeda tergantung konteks** — (1) makna ASLI baris ini: kategori top-level Accurate lama (Penjualan/Pembelian/Persediaan/Manufaktur/Kas & Bank), dipakai sebelum ADR-0019; (2) makna ADR-0019 (dominan sejak Fase 14): sub-modul-SKU konkret yang dijual per-unit (mis. `sales_invoice`) — INI yang dimaksud di kode (`moduleKey`, `moduleAccess`); (3) tingkat "Kategori" di ADR-0033 (Fase 117): pengelompokan presentasional varian dalam 1 Produk, mirip arti (1) tapi scoped per Produk & TIDAK dipakai gating. Kalau ambigu, cek konteks fase — dokumen baru pakai istilah "Varian" (§ ADR-0033) untuk arti (2), bukan "Modul" lagi. |
| Brand | Satu identitas produk yang customer lihat: **"Facport"**, tetap, tidak berubah walau ada beberapa Produk di dalamnya — lihat `architecture-product-lines.md` |
| Produk | Lini bisnis di bawah Brand Facport: **Facport** (Excel→Accurate Online), **Konverter** (Excel→XML untuk Accurate Desktop), **AutoProduksi** (formula/BOM manufaktur) — field `productLine` di data model, § ADR-0033 & `architecture-product-lines.md` |
| Varian | Sub-modul/tipe-transaksi konkret DI DALAM 1 Produk (mis. Sales Invoice adalah varian Produk Facport) — field `module`/`moduleKey`, unit gating/billing sesungguhnya, sama konsep "sub-modul" ADR-0019 |
| Konverter | Produk untuk pengguna Accurate DESKTOP — convert Excel→XML 100% di browser (client-side), user import manual ke Accurate Desktop, TIDAK ADA koneksi/API Accurate Online. Awalnya aplikasi PHP terpisah, sedang dilebur ke Facport § ADR-0033 |
| AutoProduksi | Produk manufaktur/formula (BOM) — resep produk jadi dari bahan baku+takaran, input jumlah produksi otomatis memotong stok bahan baku. Belum ada kode, direncanakan sebagai Produk ke-3 § ADR-0033 |
| Nama Perusahaan (akun) | Isian milik AKUN pengguna (`user.company_name`), diisi saat daftar/lengkapi profil. **BUKAN** Data Usaha dan tidak diturunkan darinya — lihat `architecture-contact.md` |
| Data Usaha | Workspace Accurate (`data_usaha`) dengan nama sendiri, tempat langganan/koneksi Accurate/User Tambahan menempel. Terpisah total dari Nama Perusahaan akun dan tidak menyimpan kontak pelanggan |
| Akun Internal | Akun yang tidak ditagih dan tidak dihitung di laporan uang: trainer, karyawan, mitra (ditandai Super Admin) ATAU pemegang role Admin/Super Admin (otomatis). Lawannya Akun Komersil (default). Lihat `architecture-internal-accounts.md` |
| Akun Komersil | Akun role customer yang bukan internal — ditentukan status AKUN, bukan trial/langganan |
| Lengkapi Profil | Modal yang tidak bisa ditutup untuk akun pelanggan yang Nama Perusahaan/Telepon/WhatsApp-nya masih kosong; hanya lapisan tampilan, tanpa memblokir API |
| Pesanan Penjualan | Sales Order — dokumen transaksi modul Penjualan |
| Delivery Order | Pengiriman Pesanan — dokumen transaksi modul Penjualan |
| Sales Invoice | Faktur Penjualan — dokumen transaksi modul Penjualan |
| Sales Receipt | Penerimaan Penjualan — dokumen transaksi modul Penjualan |
| Purchase Order | Pesanan Pembelian — dokumen transaksi modul Pembelian |
| Received Item | Penerimaan Barang — dokumen transaksi modul Pembelian |
| Purchase Invoice | Faktur Pembelian — dokumen transaksi modul Pembelian |
| Purchase Payment | Pembayaran Pembelian — dokumen transaksi modul Pembelian |
| Job Order | Pekerjaan Pesanan — dokumen transaksi modul Persediaan |
| Roll Over | Penyelesaian Pesanan — dokumen transaksi modul Persediaan |
| Item Transfer | Pindah Barang — dokumen transaksi modul Persediaan |
| Item Adjustment | Penyesuaian Persediaan — dokumen transaksi modul Persediaan |
| SPK | Perintah Kerja (Surat Perintah Kerja) — dokumen transaksi modul Manufaktur |
| Material Release (MR) | Pengambilan Bahan Baku — dokumen transaksi modul Manufaktur |
| Material Release (MRT) | Penyelesaian Barang Jadi — dokumen transaksi modul Manufaktur |
| OP | Pembayaran (Kas & Bank) |
| OD | Penerimaan (Kas & Bank) |

> Tambahkan istilah baru begitu muncul, supaya Claude tidak salah interpretasi
> di sesi berikutnya.
