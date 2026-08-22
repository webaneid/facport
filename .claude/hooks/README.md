# Hooks — Enforcement Deterministik

CLAUDE.md itu *advisory* (Claude ikuti ~sebagian besar waktu, bukan 100%). Untuk
aturan yang WAJIB tanpa pengecualian, pakai hooks — hooks jalan otomatis lewat
event, komunikasi hasil via exit code, jadi selalu konsisten.

## Contoh: Lint otomatis setelah tiap edit file TypeScript

`.claude/hooks/post-edit-lint.sh`
```bash
#!/bin/bash
# Dipanggil otomatis oleh Claude Code setelah tool edit file selesai.
# Baca file yang diedit dari JSON stdin, jalankan lint hanya untuk file itu.

FILE_PATH=$(cat | jq -r '.tool_input.file_path // empty')

if [[ "$FILE_PATH" == *.ts || "$FILE_PATH" == *.tsx ]]; then
  cd "$(dirname "$FILE_PATH")" 2>/dev/null
  bunx eslint "$FILE_PATH" --fix
  if [ $? -ne 0 ]; then
    echo "Lint gagal untuk $FILE_PATH" >&2
    exit 2   # exit code 2 = block, kasih tahu Claude ada masalah
  fi
fi
exit 0
```

## Contoh: Cegah commit langsung ke branch main

`.claude/hooks/pre-commit-guard.sh`
```bash
#!/bin/bash
BRANCH=$(git branch --show-current)
if [ "$BRANCH" == "main" ]; then
  echo "Jangan commit langsung ke main, buat branch baru." >&2
  exit 2
fi
exit 0
```

## Lapis Kedua (Independen dari Claude Code) — WAJIB Kalau Serius
Hook di atas cuma jalan kalau **Claude** yang nulis file lewat Claude Code.
Kalau kamu edit manual terus `git commit` sendiri, hook itu nggak ke-trigger
sama sekali. Buat proteksi yang independen dari siapa pun yang commit:

```bash
# Install gitleaks, lalu pasang sebagai git pre-commit hook asli (bukan Claude Code)
brew install gitleaks   # atau: https://github.com/gitleaks/gitleaks#installing
echo '#!/bin/sh
gitleaks protect --staged --verbose' > .git/hooks/pre-commit
chmod +x .git/hooks/pre-commit
```
Ini jalan di level git, bukan Claude Code — jadi tetap protect meskipun
commit-nya dari kamu langsung, editor lain, atau CI. Idealnya juga
ditambahkan sebagai step di `.github/workflows/ci.yml` biar PR yang lolos
lewat kontributor lain juga ke-cover.

## Hook: Secret Scanning (secret-scan.sh)
File terpisah di folder ini (`secret-scan.sh`) — otomatis mengecek pola secret
(AWS key, private key, password/secret hardcoded) di tiap file yang diedit,
dan **block** (exit code 2) kalau ketemu. Ini lapisan pertama; untuk proyek
production sebaiknya ditambah gitleaks/trufflehog di CI sebagai lapisan kedua
yang scan seluruh history git, bukan cuma file yang baru diedit.

## Hook: Dependency Audit (dependency-audit.sh)
Jalan otomatis tiap `bun add <package>` — cek known vulnerability lewat
`bun audit`. Beda dari secret-scan: ini **warning** (exit 1), bukan hard block
(exit 2), karena hasil audit bisa noisy/false-positive dan butuh judgment
manusia untuk keputusan lanjut/tidak.

## Skill: security-review
`.claude/skills/security-review/SKILL.md` — dipanggil setelah selesai bikin
endpoint/fitur baru, cek kode yang baru ditulis terhadap checklist di
`architecture-security.md`, per file, cepat.

## Subagent: security-auditor
`.claude/agents/security-auditor.md` — untuk audit menyeluruh (banyak file/
seluruh folder), read-only, jalan di context terisolasi supaya tidak
menghabiskan context sesi utama. Cocok dipanggil sebelum release atau
audit berkala, bukan tiap kali edit kecil.

## Registrasi di settings.json
Hooks didaftarkan di `.claude/settings.json` (lihat file contoh di folder ini),
di-map ke event tertentu (post-edit, pre-commit, dll — sesuaikan dengan versi
Claude Code yang dipakai, cek dokumentasi resmi untuk nama event terbaru).

> Jangan taruh logic bisnis di hooks — hooks untuk *enforcement*, bukan business logic.
