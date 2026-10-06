# Fase 175 — Penegakan akses tepat di waktu akhir
**Status:** Planned · ADR-0041
Gerbang akses mengecek `end_at > sekarang`; job EXPIRE_SUBSCRIPTIONS & NOTIFY_EXPIRING_SOON dijalankan dalam WIB / lebih sering; reminder H-7/H-3/H-1 mengikuti WIB.
Tes: fitur terkunci saat kedaluwarsa tetapi Data Usaha tetap bisa diakses.
