# Hapus Massal Transaksi Accurate dari Excel — RENCANA (DRAFT)

> **Status: DRAFT, belum ada kode, menunggu keputusan client (Opsi 1 vs Opsi 2).**
> Dibuat 2026-10-10 dari diskusi dengan user. Belum jadi ADR — ADR ditulis setelah client memutuskan.

## Latar belakang
- Fitur **Batal Upload** (Fase 165) hanya menghapus dokumen yang DIBUAT Facport (ID Accurate tersimpan di `import_batch_rows`).
- Masalah baru: user menginput sendiri di Accurate dalam jumlah besar lalu salah/ingin dibersihkan — menghapus satu per satu terlalu berat.
- Usulan: upload Excel berisi **nomor transaksi** → Facport mencari → pratinjau → hapus massal. Contoh format dari client (alat lama AOL): 1 kolom `Transaction No` (mis. `P2411-04883`).

## Inti bersama (SAMA untuk kedua opsi — ±90% pekerjaan)
1. **Upload Excel** 1 kolom nomor transaksi (maks baris → tentukan; ukuran file mengikuti pola import).
2. **Pencarian nomor → ID Accurate** per modul (`list.do`/`detail.do` filter nomor). ⚠ BELUM diverifikasi per modul — wajib cek OpenAPI Accurate di awal eksekusi (kontrak `delete.do` memang identik: `DELETE ?id=`, lihat `lib/accurate-generic-delete.ts`).
3. **Pratinjau**: tiap nomor "ditemukan / tidak ditemukan" + tanggal, pihak terkait, nilai. Belum ada yang terhapus.
4. **Snapshot** (nomor, tanggal, nilai, pihak) disimpan di DB Facport saat pratinjau → jejak kalau user menyesal.
5. **Konfirmasi eksplisit** (ketik "HAPUS"/jumlah baris) + peringatan "tidak bisa dibatalkan, pastikan sudah backup Accurate".
6. **Job antrean** (`retryLimit: 0`, pola import) + progres per baris + pembatasan laju Accurate yang sudah ada. Tidak ditemukan = selesai (bukan galat). Accurate menolak (mis. sudah dibayar, periode ditutup) → pesan Accurate ditampilkan per baris; tombol coba ulang memproses baris gagal saja.
7. **Hanya pemilik Data Usaha** (pola `CANCEL_OWNER_ONLY`); audit log tiap penghapusan.
8. **Tabel & riwayat sendiri** (BUKAN `import_batches`/Arsip Import — profil risiko beda). Halaman hasil khusus.
9. Cakupan: **transaksi saja** (20 modul di `GENERIC_CANCELLABLE_MODULES` + Purchase Invoice, Sales Invoice, Job Order). Master data TIDAK ikut.
10. Registri modul tunggal (`module → path Accurate, label, kolom pratinjau`) supaya halaman/route per modul dihasilkan dari konfigurasi, bukan disalin ~23×. (Pelajaran berulang: checklist registrasi modul baru — jalankan diff-verification, jangan hanya baca.)
11. Deploy: cek `pgboss.job where state='active'` = 0 sebelum `up -d` (lihat `lessons-learned.md` 2026-10-09).

## Beda kedua opsi
| | **Opsi 1 — tombol di tiap modul** | **Opsi 2 — fitur berbayar sendiri (paket)** |
|---|---|---|
| Pintu masuk | Tombol "Hapus Massal" di halaman import tiap modul → halaman `/{modul}/hapus` + riwayat khusus modul | 1 menu "Hapus Massal": pilih modul → upload → pratinjau; 1 riwayat gabungan |
| Gerbang akses | `moduleAccess` modul itu (tidak berlangganan SQ = tidak bisa hapus SQ) | Kunci modul baru (mis. `bulk_delete`) di `plans.modules`; 1 paket membuka semua modul yang didukung |
| Monetisasi | Ikut harga modul | Produk/paket tambahan, harga sendiri |
| UI | Terasa menyatu, tetapi ±23 halaman hasil/riwayat (dari registri) | 1 halaman, lebih ringkas; modul yang tidak dilanggan tetap bisa dihapus |
| Risiko | Pemilik modul A tidak bisa membersihkan modul B | Bisa menghapus modul yang tidak dia pakai di Facport — perlu pembatas (mis. hanya modul yang Data Usahanya punya scope) |
| Trial | Ikut aturan trial modul | Putuskan terpisah (usul: boleh, dengan batas baris) |

**Desain yang membuat keputusan client murah:** gerbang dibungkus satu fungsi (mis. `canBulkDelete(subscription, module)`) dan pintu masuk UI dipisah dari inti. Opsi 1/2 (bahkan gabungan keduanya) tinggal mengganti fungsi itu + titik masuk UI — inti tidak berubah.

## Pertanyaan terbuka (butuh jawaban)
1. Keputusan client: Opsi 1 atau Opsi 2?
2. Trial boleh memakai fitur ini? Batas baris per upload?
3. Verifikasi OpenAPI: parameter pencarian nomor tiap modul + ada/tidaknya scope `*_delete` untuk PI, SI, Job Order (scope engine: `docs/architecture/architecture-accurate-scope-engine.md`; model koneksi: ADR-0036).
4. Perlu mencatat pemulihan manual (re-import dari snapshot)? Usul: tidak di fase pertama.

## Langkah setelah keputusan
Alur fase (`docs/SOP.md`): rencana → dokumen arsitektur final + ADR → eksekusi → typecheck → security review (subagent `security-auditor`; fitur destruktif) → tutup fase.
