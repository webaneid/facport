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
| Modul | Kategori besar fitur impor: Penjualan, Pembelian, Persediaan, Manufaktur, Kas & Bank/Buku Besar — lihat `docs/PROGRESS.md` untuk daftar lengkap & urutan fase |
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
