# Fase 179 — Koreksi langganan tahunan 360 hari
**Status:** Planned · ADR-0041
SQL dry-run lalu koreksi satu kali: langganan tahunan ber-`end_at − start_at` ≈ 360 hari digenapi menjadi tepat 1 tahun kalender dari `start_at` (zona perusahaan). Dijalankan pemilik di production; backup dulu.
