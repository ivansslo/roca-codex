#!/usr/bin/env bash
# ═════════════════════════════════════════════════════════════════════════════
#  rocd — Standalone FULL-PACKAGE Container Engine Installer for Termux & Linux
# ═════════════════════════════════════════════════════════════════════════════

set -e

export DEBIAN_FRONTEND=noninteractive

echo "⚡ Installing rocd Standalone Container Engine..."

# 1. Install host prerequisites
if command -v pkg &>/dev/null; then
  pkg update -y 2>/dev/null || true
  pkg install -y proot proot-distro python curl jq tar unzip git 2>/dev/null || true
elif command -v apt-get &>/dev/null; then
  sudo apt-get update -y 2>/dev/null || true
  sudo apt-get install -y proot python3 curl jq tar unzip git 2>/dev/null || true
fi

# 2. Setup global installation paths
BIN_DIR="${PREFIX:-$HOME/.local}/bin"
INSTALL_DIR="${PREFIX:-$HOME/.local}/share/rocd"

mkdir -p "$BIN_DIR" "$INSTALL_DIR"

# 3. Copy or clone rocd engine files to INSTALL_DIR
if [ -f "rocd.py" ] && [ -d "rocd_mod" ]; then
  echo "📦 Copying local rocd engine files to $INSTALL_DIR..."
  cp -r rocd_mod rocd.py pyproject.toml "$INSTALL_DIR/"
else
  echo "📥 Fetching latest rocd container engine files from GitHub..."
  TMP_CLONE="$(mktemp -d)"
  git clone --depth 1 https://github.com/ivansslo/rocd.git "$TMP_CLONE/rocd"
  cp -r "$TMP_CLONE/rocd/rocd_mod" "$TMP_CLONE/rocd/rocd.py" "$TMP_CLONE/rocd/pyproject.toml" "$INSTALL_DIR/"
  rm -rf "$TMP_CLONE"
fi

# 4. Create global executable wrapper
cat << 'EOF' > "$BIN_DIR/rocd"
#!/usr/bin/env bash
# rocd Container Engine Launcher

export PROOT_NO_SECCOMP=1
export PROOT_FORCE_READLINK=1

# Ensure host DNS resolv.conf exists before running
RESOLV_DIR="${PREFIX:-/data/data/com.termux/files/usr}/etc"
if [ -w "$(dirname "$RESOLV_DIR" 2>/dev/null)" ]; then
  mkdir -p "$RESOLV_DIR" 2>/dev/null || true
  RESOLV="$RESOLV_DIR/resolv.conf"
  if [ ! -f "$RESOLV" ] || [ ! -s "$RESOLV" ]; then
    printf "nameserver 8.8.8.8\nnameserver 1.1.1.1\n" > "$RESOLV" 2>/dev/null || true
  fi
fi

INSTALL_DIR="${PREFIX:-$HOME/.local}/share/rocd"
export PYTHONPATH="$INSTALL_DIR:$PYTHONPATH"

exec python3 "$INSTALL_DIR/rocd.py" "$@"
EOF

chmod +x "$BIN_DIR/rocd"

echo ""
echo "=========================================="
echo "🎉 rocd Container Engine Installed Successfully!"
echo "=========================================="
echo "Commands:"
echo "  • rocd list             (List container images)"
echo "  • rocd install ubuntu   (Install Ubuntu rootfs with full dev packages)"
echo "  • rocd login ubuntu     (Login to container)"
echo "  • rocd reset ubuntu     (Reset container)"
