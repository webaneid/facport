# Workflow Modes — Kapan Pakai Apa

> Ini soal CARA PAKAI Claude Code (mode, subagent, auto mode, hemat token) —
> beda dari `docs/SOP.md` yang ngatur PROSES per fase project. Baca ini
> sebelum mulai kerjaan apa pun, terutama di Langkah 1 SOP (Perencanaan).

## Decision Table — Pilih Mode

| Situasi                                                          | Mode/Cara                     |
|--------------------------------------------------------------------|----------------------------------|
| Task besar, berisiko, belum familiar dengan bagian codebase ini     | **Plan Mode** dulu               |
| Migration, refactor lintas modul, apa pun yang susah di-rollback   | **Plan Mode** dulu               |
| Task jelas scope-nya, kecil-menengah, ada git checkpoint            | **Auto Mode**                    |
| Kerjaan rutin/berulang yang polanya sudah terbukti aman            | **Auto Mode**                    |
| Eksplorasi/riset codebase besar, hasil cukup ringkasan saja          | **Subagent**                     |
| Audit banyak file sekaligus, independen satu sama lain              | **Subagent** (bisa paralel)      |
| Task kecil, tapi detail hasilnya kamu tetap perlu lihat langsung    | **Eksekusi langsung** (sesi utama) |
| High-stakes: auth, payment, migration data production               | **Eksekusi langsung** + Plan Mode |
| Debugging yang butuh iterasi cepat bolak-balik                      | **Eksekusi langsung**            |

## Kenapa Subagent BUKAN Selalu Lebih Hemat
Tiap subagent reload system prompt + tool definitions dari nol — subagent-heavy
workflow bisa sampai ~7x lebih mahal dibanding kerjain langsung di sesi utama,
KHUSUS untuk task kecil. Subagent baru worth it kalau:
- Task-nya butuh baca banyak file besar (>3-4 file) yang bakal bikin context
  sesi utama bengkak kalau dibaca langsung, DAN
- Kamu cuma butuh hasil ringkasannya, bukan raw detail tiap file

Kalau dua syarat itu nggak kepenuhi, kerjain langsung — lebih murah dan lebih cepat.

## Aturan Sebelum Mulai Kerjaan (dicek di Langkah 1 SOP)
1. Task ini "familiar & jelas" atau "besar & berisiko"? → tentukan Plan Mode vs Auto Mode.
2. Task ini butuh eksplorasi berat (banyak file) yang hasilnya cukup ringkasan?
   → pertimbangkan subagent. Kalau bukan → eksekusi langsung.
3. Kalau ragu antara subagent vs langsung untuk task medium → default ke
   **langsung dulu**. Baru pindah ke subagent kalau ternyata context sesi
   utama mulai berat/lambat.

## Hemat Token — Kebiasaan Harian
- **Jangan paste file/log besar ke chat** — kasih path-nya, biarkan Claude baca sendiri.
- **`/clear`** antar task yang topiknya nggak nyambung, jangan bawa histori lama terus.
- **`/compact`** kalau sesi udah panjang tapi masih task yang sama — jangan tunggu
  sampai otomatis trigger di saat kritis.
- **CLAUDE.md & skill jangan sering diedit-edit di tengah sesi** — itu bikin prompt
  cache invalid, kehilangan diskon token dari cache hit.
- **Audit MCP server yang ke-connect** — server yang nggak kepake tapi masih connected
  tetap makan context buat definisi tool-nya.
- **Task paralel-independen** → subagent oke dijalankan bareng. Task yang saling
  bergantung urutannya → jangan dipaksa paralel, kerjain berurutan di sesi utama.

## Plugin Marketplace — Nambah "Indra" Baru ke Claude Code
Beda dari skill/hooks/subagent (yang kita definisikan sendiri di `.claude/`),
plugin dari marketplace resmi Anthropic ngasih kapabilitas yang nggak bisa
dibikin sendiri lewat prompt — misal baca error TypeScript real-time lewat
language server, bukan cuma dari nebak baca kode.

### Setup sekali di awal
```bash
/plugin marketplace add anthropics/claude-plugins-official
```

### Plugin yang dipasang di project ini (dan kenapa)
| Plugin                              | Fungsi                                              | Nyambung ke                              |
|----------------------------------------|--------------------------------------------------------|---------------------------------------------|
| `typescript-lsp@claude-plugins-official` | Type-check real-time tiap edit, auto-catch regresi    | Otomatisasi Langkah 3 SOP (`bun run typecheck`) |
| `context7@claude-plugins-official`     | Dokumentasi Elysia/Drizzle/Next.js versi terkini       | Cegah Claude pakai API lama pas nulis kode Elysia (library relatif baru) |
| `security-guidance@claude-plugins-official` | Guidance keamanan resmi dari Anthropic             | Lapisan tambahan buat skill `security-review` & subagent `security-auditor` |
| `commit-commands@claude-plugins-official` | `/commit` — generate conventional commit dari diff   | Konsisten sama `docs/conventions.md`        |
| `code-review@claude-plugins-official`  | Second opinion review sebelum merge                    | Dipakai di Langkah 5 SOP (tutup fase)       |
| `frontend-design@claude-plugins-official` | Guidance desain UI lebih opinionated                | Kerjaan `apps/web` (Next.js)                |

Install:
```bash
/plugin install typescript-lsp@claude-plugins-official
/plugin install context7@claude-plugins-official
/plugin install security-guidance@claude-plugins-official
/plugin install commit-commands@claude-plugins-official
/plugin install code-review@claude-plugins-official
/plugin install frontend-design@claude-plugins-official
/reload-plugins
```

Binary tambahan yang dibutuhkan `typescript-lsp`:
```bash
npm install -g typescript-language-server typescript
```

### Aturan Pasang Plugin Baru
- **Cek dulu apa plugin ini nambah kapabilitas BARU** (baca file, jalanin tool
  eksternal, dsb) atau cuma "instruksi lebih detail" — kalau cuma yang kedua,
  kemungkinan cukup dibikin Skill sendiri di `.claude/skills/`, nggak perlu
  install plugin (lebih ringan, lebih bisa dikontrol).
- **Prioritaskan `@claude-plugins-official`** (marketplace resmi Anthropic).
  Marketplace komunitas boleh dipakai tapi WAJIB baca dulu isi plugin-nya
  sebelum install — plugin bisa bawa MCP server yang jalan dengan permission
  tinggi di komputer kamu, dan Anthropic tidak menjamin plugin non-official
  bekerja sesuai klaim.
- **Jangan install banyak sekaligus "just in case"** — tiap plugin nambah
  context/token overhead meski nggak dipakai. Install kalau ada kebutuhan
  konkret, bukan kelihatan bagus doang.
- **Cek berkala plugin yang nganggur** — Claude Code otomatis nandain plugin
  yang nggak dipakai ≥2 minggu di tab "Not used recently". Uninstall yang
  nganggur biar nggak numpuk beban context.

## Referensi
- Plan/Auto mode di-cycle pakai `Shift+Tab` di terminal, atau `/plan` untuk sekali pakai.
- Subagent didefinisikan di `.claude/agents/` (contoh: `security-auditor.md`).
- Detail proses per fase (bukan mode tool) → `docs/SOP.md`.
