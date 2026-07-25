#!/data/data/com.termux/files/usr/bin/bash
# ═════════════════════════════════════════════════════════════════════════════
#  termux-rocd — Optimized for OPPO CPH1823 (Helio P60 ARM64) & All Devices
# ═════════════════════════════════════════════════════════════════════════════

set -e

export DEBIAN_FRONTEND=noninteractive
export PROOT_NO_SECCOMP=1
export PROOT_FORCE_READLINK=1
export MALLOC_ARENA_MAX=2
export ANDROID_API_LEVEL="$(getprop ro.build.version.sdk 2>/dev/null || echo 29)"

RED='\033[0;31m'; GRN='\033[0;32m'; YLW='\033[1;33m'; CYN='\033[0;36m'; BOLD='\033[1m'; RST='\033[0m'

echo -e "${CYN}=====================================================${RST}"
echo -e "${BOLD}${GRN}  ⚡ termux-rocd (CPH1823 Helio P60 ARM64 Optimized) ${RST}"
echo -e "${CYN}=====================================================${RST}"
echo ""

# 0. Ensure valid resolv.conf exists on host Termux & fix any broken symlinks
RESOLV_CONF="${PREFIX:-/data/data/com.termux/files/usr}/etc/resolv.conf"
rm -f "$RESOLV_CONF" 2>/dev/null || true
mkdir -p "$(dirname "$RESOLV_CONF")"
printf "nameserver 8.8.8.8\nnameserver 1.1.1.1\n" > "$RESOLV_CONF" 2>/dev/null || true

# 1. Install prerequisites (proot, python3, curl, git, jq, tar, unzip)
echo -e "${YLW}📦 Step 1: Installing base container prerequisites...${RST}"
pkg update -y 2>/dev/null || apt-get update -y
pkg install -y proot python curl git jq tar unzip 2>/dev/null || apt-get install -y proot python3 curl git jq tar unzip

# 2. Setup Native rocd Engine Path from Source (ivansslo/rocd)
BIN_DIR="${PREFIX:-$HOME/.local}/bin"
INSTALL_DIR="${PREFIX:-$HOME/.local}/share/rocd"
mkdir -p "$BIN_DIR" "$INSTALL_DIR"

echo -e "${YLW}📥 Step 2: Downloading latest rocd source engine from ivansslo/rocd...${RST}"
TMP_CLONE="$(mktemp -d)"
git clone --depth 1 https://github.com/ivansslo/rocd.git "$TMP_CLONE/rocd"
cp -r "$TMP_CLONE/rocd/rocd_mod" "$TMP_CLONE/rocd/rocd.py" "$TMP_CLONE/rocd/pyproject.toml" "$INSTALL_DIR/"
rm -rf "$TMP_CLONE"

# 3. Create Global 'rocd' Native Command
cat << 'EOF' > "$BIN_DIR/rocd"
#!/data/data/com.termux/files/usr/bin/bash
# Native rocd Container Engine Launcher (CPH1823 Cputime Tuned)

export PROOT_NO_SECCOMP=1
export PROOT_FORCE_READLINK=1
export MALLOC_ARENA_MAX=2

INSTALL_DIR="${PREFIX:-$HOME/.local}/share/rocd"
export PYTHONPATH="$INSTALL_DIR:$PYTHONPATH"

exec python3 "$INSTALL_DIR/rocd.py" "$@"
EOF

# 4. Create Global 'ubuntu' Direct Shortcut Command (CPH1823 Optimized)
cat << 'EOF' > "$BIN_DIR/ubuntu"
#!/data/data/com.termux/files/usr/bin/bash
# Direct launcher for Ubuntu container via native rocd engine (CPH1823 Optimized)

export PROOT_NO_SECCOMP=1
export PROOT_FORCE_READLINK=1
export MALLOC_ARENA_MAX=2

INSTALL_DIR="${PREFIX:-$HOME/.local}/share/rocd"
export PYTHONPATH="$INSTALL_DIR:$PYTHONPATH"

# Auto-fix host DNS configuration
RESOLV="${PREFIX:-/data/data/com.termux/files/usr}/etc/resolv.conf"
if [ ! -f "$RESOLV" ] || [ ! -s "$RESOLV" ]; then
  rm -f "$RESOLV" 2>/dev/null || true
  mkdir -p "$(dirname "$RESOLV")"
  printf "nameserver 8.8.8.8\nnameserver 1.1.1.1\n" > "$RESOLV" 2>/dev/null || true
fi

# Auto-install Ubuntu only if not already present
if ! python3 "$INSTALL_DIR/rocd.py" list 2>/dev/null | grep -i "ubuntu" | grep -q "installed"; then
  echo "🚀 First time setup: Installing Ubuntu container..."
  python3 "$INSTALL_DIR/rocd.py" install ubuntu 2>/dev/null || true
fi

if [ "$1" = "reset" ] || [ "$1" = "--reset" ] || [ "$1" = "reinstall" ]; then
  echo "🧹 Reinstalling & resetting Ubuntu container rootfs..."
  python3 "$INSTALL_DIR/rocd.py" reset ubuntu 2>/dev/null || python3 "$INSTALL_DIR/rocd.py" remove ubuntu 2>/dev/null || true
  python3 "$INSTALL_DIR/rocd.py" install ubuntu 2>/dev/null || true
  echo "✅ Container reset complete."
  exit 0
fi

if [ $# -gt 0 ]; then
  exec python3 "$INSTALL_DIR/rocd.py" run ubuntu -- "$@"
else
  echo "🚀 Entering Ubuntu Container (root@localhost)..."
  exec python3 "$INSTALL_DIR/rocd.py" login ubuntu
fi
EOF

chmod +x "$BIN_DIR/rocd" "$BIN_DIR/ubuntu"

# 5. Auto-start 'ubuntu' safely in ~/.bashrc
touch "$HOME/.bashrc"
sed -i '/rocd/d' "$HOME/.bashrc" 2>/dev/null || true
sed -i '/ubuntu/d' "$HOME/.bashrc" 2>/dev/null || true

cat << 'EOF' >> "$HOME/.bashrc"

# Safe auto-launch ubuntu container on Termux startup via native rocd engine
if [ -t 0 ] && [ -x "$PREFIX/bin/ubuntu" ] && [ -z "$UBUNTU_ACTIVE" ]; then
  export UBUNTU_ACTIVE=1
  ubuntu || echo "⚠️ Container exited. Retaining Termux host session."
fi
EOF

echo ""
echo -e "${GRN}=====================================================${RST}"
echo -e "${BOLD}${GRN}🎉 CPH1823 Helio P60 Engine & 'ubuntu' Command Ready!${RST}"
echo -e "${GRN}=====================================================${RST}"
echo -e "  • Target Device:   ${CYN}OPPO CPH1823 (Helio P60 / Mali-G72 ARM64)${RST}"
echo -e "  • Engine Memory:   ${CYN}PROOT_NO_SECCOMP=1 & MALLOC_ARENA_MAX=2${RST}"
echo -e "  • Direct Command:  ${BOLD}${GRN} ubuntu ${RST} (Log straight into Ubuntu container)"
echo ""
