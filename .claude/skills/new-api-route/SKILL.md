---
name: new-api-route
description: Scaffold route baru di apps/api mengikuti konvensi project (Elysia route + service + response format {data, error}). Gunakan saat user minta "tambah endpoint baru" atau "buat route untuk resource X".
---

# Skill: New API Route

Ketika diminta bikin endpoint/route baru:

1. Baca `docs/architecture/architecture-api.md` untuk pola response format.
2. Buat file `apps/api/src/routes/{resource}.route.ts` dengan validasi Elysia (`t.Object`).
3. Buat file `apps/api/src/services/{resource}.service.ts` untuk business logic —
   JANGAN taruh logic langsung di handler route.
4. Daftarkan route baru di `apps/api/src/index.ts` lewat `.use()`.
5. Kalau butuh tabel baru, ikuti alur di `docs/architecture/architecture-database.md`
   (edit schema.ts → generate migration → review → apply).
6. Response selalu `{ data, error }`, jangan return raw object.
7. Kalau ada perilaku yang perlu diingat untuk endpoint ini (edge case dsb),
   catat di `docs/lessons-learned.md`.
