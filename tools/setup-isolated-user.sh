#!/usr/bin/env bash
# setup-isolated-user.sh — jalankan RocAgent sebagai user Linux khusus + systemd.
#
# KENAPA: commandGuard adalah sabuk pengaman; batas tahan lama adalah isolasi
# OS. Dengan user 'rocagent' yang tidak berhak apa pun, lolosnya satu perintah
# berbahaya merusak paling jauh /srv/rocagent — bukan home & kredensial Anda.
# Lihat docs/ISOLASI-OS.md.
#
# Pakai:  sudo bash tools/setup-isolated-user.sh
# Target: VM Linux dengan systemd (OCI ubuntu/x86_64 atau aarch64).
# Menolak jalan di Termux dan pada sistem tanpa systemd.
#
# Copyright (c) 2026 Ivan Ssl (ivansslo). All rights reserved.

set -euo pipefail

c_red=$'\033[31m'; c_grn=$'\033[32m'; c_yel=$'\033[33m'; c_rst=$'\033[0m'
die()  { printf '%s✗ %s%s\n' "$c_red" "$*" "$c_rst" >&2; exit 1; }
ok()   { printf '%s✓%s %s\n' "$c_grn" "$c_rst" "$*"; }
warn() { printf '%s⚠%s  %s\n' "$c_yel" "$*" "$c_rst" >&2; }

ROC_USER="rocagent"
ROC_HOME="/srv/rocagent"
SERVICE="rocagent.service"

# ── Pra-syarat ────────────────────────────────────────────────────
[ "$(id -u)" -eq 0 ] || die "Jalankan dengan sudo/root:  sudo bash tools/setup-isolated-user.sh"
[ -d /data/data/com.termux/files/usr ] && die "Termux tidak punya multi-user — ikuti bagian 2 docs/ISOLASI-OS.md saja."
command -v systemctl >/dev/null || die "systemd tidak ditemukan. Untuk Podman rootless, lihat catatan di docs/ISOLASI-OS.md."
command -v node >/dev/null || die "node belum terpasang. Pasang Node.js 20+ dulu."
NODE_BIN="$(command -v node)"
NODE_MAJOR="$(node -v | sed 's/^v//; s/\..*//')"
[ "${NODE_MAJOR:-0}" -ge 20 ] || die "Node.js >= 20 diperlukan, terpasang: $(node -v)"

# Direktori repo sumber = induk dari tools/
SRC_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
[ -f "$SRC_DIR/package.json" ] || die "Tidak menemukan package.json di $SRC_DIR — jalankan dari dalam clone RocAgent."

printf '\n── Isolasi RocAgent ──\n'
printf '  user   : %s\n  home   : %s\n  sumber : %s\n  node   : %s (%s)\n\n' "$ROC_USER" "$ROC_HOME" "$SRC_DIR" "$NODE_BIN" "$(node -v)"

# ── 1. User khusus ────────────────────────────────────────────────
if id "$ROC_USER" >/dev/null 2>&1; then
  ok "user $ROC_USER sudah ada"
else
  useradd --system --home-dir "$ROC_HOME" --shell /usr/sbin/nologin --create-home "$ROC_USER"
  ok "user $ROC_USER dibuat (system account, nologin)"
fi

# ── 2. Salin repo (tanpa artefak lokal) ───────────────────────────
mkdir -p "$ROC_HOME"
command -v rsync >/dev/null || die "rsync belum terpasang (apt install -y rsync)"
rsync -a --delete \
  --exclude node_modules --exclude dist --exclude .git \
  --exclude db.json --exclude sessions --exclude '.env*' \
  "$SRC_DIR/" "$ROC_HOME/"
ok "repo tersalin ke $ROC_HOME"

# app.env: prioritas vault config operator, jangan pernah menimpa yang ada
if [ ! -f "$ROC_HOME/.env" ]; then
  if [ -f "$HOME/.config/rocagent/app.env" ]; then
    cp "$HOME/.config/rocagent/app.env" "$ROC_HOME/.env"
    ok "app.env disalin dari $HOME/.config/rocagent/"
  elif [ -f "$SRC_DIR/.env" ]; then
    cp "$SRC_DIR/.env" "$ROC_HOME/.env"
    ok ".env disalin dari repo"
  else
    cp "$SRC_DIR/.env.example" "$ROC_HOME/.env"
    warn ".env dibuat dari template — ISI WEB_PASSWORD + satu API key lalu restart."
  fi
fi
chmod 600 "$ROC_HOME/.env"

# ── 3. Dependensi + build sebagai user target ─────────────────────
chown -R "$ROC_USER:$ROC_USER" "$ROC_HOME"
runuser -u "$ROC_USER" -- bash -c "cd '$ROC_HOME' && npm install --legacy-peer-deps --no-audit --no-fund && npm run build" \
  || die "npm install/build gagal — lihat output di atas."
ok "dependensi & build selesai"

# ── 4. systemd unit ───────────────────────────────────────────────
cat > "/etc/systemd/system/$SERVICE" <<UNIT
[Unit]
Description=RocAgent — autonomous AI agent (isolated user)
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=$ROC_USER
Group=$ROC_USER
WorkingDirectory=$ROC_HOME
Environment=NODE_ENV=production
Environment=SHELL_GUARD=enforce
# HOST/PORT diambil dari $ROC_HOME/.env (default 127.0.0.1:3000)
ExecStart=$NODE_BIN dist/server.cjs
Restart=on-failure
RestartSec=3

# Hardening — server memang butuh: network, exec shell di dalam home-nya.
# Ia TIDAK butuh: /etc & /usr yang bisa ditulis, /home orang lain, privilege.
NoNewPrivileges=yes
ProtectSystem=strict
ReadWritePaths=$ROC_HOME
ProtectHome=yes
PrivateTmp=yes
ProtectKernelTunables=yes
ProtectKernelModules=yes
ProtectControlGroups=yes
RestrictSUIDSGID=yes
LockPersonality=yes

[Install]
WantedBy=multi-user.target
UNIT

systemctl daemon-reload
systemctl enable --now "$SERVICE" >/dev/null 2>&1 || systemctl restart "$SERVICE"
ok "$SERVICE aktif"

printf '\n── Verifikasi ──\n'
systemctl --no-pager --quiet is-active "$SERVICE" \
  && ok "service berjalan: journalctl -u $SERVICE -f" \
  || warn "service belum aktif — cek: journalctl -u $SERVICE -n 50 --no-pager"
printf '  Bind   : %s\n' "$(grep -E '^HOST=' "$ROC_HOME/.env" | cut -d= -f2 || echo '127.0.0.1')"
printf '  Uji    : curl -s http://127.0.0.1:%s/api/health\n' "$(grep -E '^PORT=' "$ROC_HOME/.env" | cut -d= -f2 || echo 3000)"
printf '  Update : sudo rsync dari repo lalu: sudo systemctl restart %s\n\n' "$SERVICE"
