#!/usr/bin/env bash
# ═════════════════════════════════════════════════════════════════════════════
#  termux-rocd — Ultimate Complete Ubuntu Shell Suite via OCI APT Turbo
# ═════════════════════════════════════════════════════════════════════════════

set -e

export DEBIAN_FRONTEND=noninteractive

echo "🛠️ 0. Repairing any broken dpkg packages inside container..."
dpkg --configure -a 2>/dev/null || true
dpkg --remove --force-remove-reinstreq nmap nmap-common 2>/dev/null || true
apt-get install -f -y 2>/dev/null || true

# Initialize 10x Fast APT Accelerator via Parallel Downloader
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
if [ -f "$SCRIPT_DIR/setup-oci-apt-mirror.sh" ]; then
  echo "⚡ Enabling 16-Socket Parallel APT Accelerator..."
  bash "$SCRIPT_DIR/setup-oci-apt-mirror.sh" || true
fi

APT_CMD="apt-get"
if command -v apt-fast >/dev/null 2>&1; then
  APT_CMD="apt-fast"
fi

echo "📦 1. Updating APT repositories & installing Full Ubuntu Shell Suite via OCI Turbo..."
$APT_CMD update -y || apt-get update -y

$APT_CMD install -y \
  sudo \
  bash \
  zsh \
  tmux \
  screen \
  vim \
  neovim \
  nano \
  git \
  gh \
  curl \
  wget \
  aria2 \
  jq \
  procps \
  htop \
  btop \
  psmisc \
  lsof \
  tree \
  strace \
  net-tools \
  iproute2 \
  dnsutils \
  iputils-ping \
  traceroute \
  unzip \
  zip \
  p7zip-full \
  tar \
  gzip \
  bzip2 \
  zstd \
  build-essential \
  g++ \
  gcc \
  make \
  pkg-config \
  libffi-dev \
  libssl-dev \
  python3 \
  python3-pip \
  python3-venv \
  python3-setuptools \
  python3-wheel \
  nodejs \
  npm \
  openssh-client \
  openssh-server \
  rsync || apt-get install -f -y

echo "⚙️ 2. Installing systemctl replacement emulator for containers..."
curl -fsSL https://raw.githubusercontent.com/gdraheim/docker-systemctl-replacement/master/files/docker/systemctl3.py -o /usr/bin/systemctl 2>/dev/null || true
chmod +x /usr/bin/systemctl 2>/dev/null || true

echo "🐳 3. Installing udocker (Docker Hub Engine for Non-Root PRoot)..."
if command -v python3 >/dev/null 2>&1; then
  python3 -m pip install udocker --quiet 2>/dev/null || pip3 install udocker --quiet 2>/dev/null || true
fi

echo "🐙 4. Configuring Git & GitHub CLI defaults..."
git config --global user.name "ivansslo" 2>/dev/null || true
git config --global user.email "ivansuselo@gmail.com" 2>/dev/null || true

echo ""
echo "===================================================================="
echo "🎉 OCI High-Speed APT Accelerator & Full Ubuntu Suite Installed!"
echo "===================================================================="
echo "  ✅ Speed Mode       : 16-Socket Parallel Downloader (apt-fast)"
echo "  ✅ Shells & Editors : bash, zsh, tmux, screen, neovim, vim, nano"
echo "  ✅ System & Process : sudo, htop, btop, procps, psmisc, lsof, tree"
echo "  ✅ Networks & Web   : curl, wget, aria2, net-tools, iproute2"
echo "  ✅ Runtimes & Build : gcc, g++, make, python3, pip, nodejs, npm"
echo "  ✅ Dev & Versioning : git, gh (GitHub CLI)"
echo "  ✅ Archiving        : zip, unzip, p7zip, zstd, tar, gzip, bzip2"
echo "  ✅ Containers & Init: udocker, systemctl emulator"
echo "===================================================================="
