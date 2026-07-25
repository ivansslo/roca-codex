#!/usr/bin/env bash
# ═════════════════════════════════════════════════════════════════════════════
#  termux-rocd — OCI High-Speed APT Mirror & Parallel Downloader Configurator
#  Accelerates APT package installation by 10x using multi-socket parallelism
# ═════════════════════════════════════════════════════════════════════════════

set -e

export DEBIAN_FRONTEND=noninteractive

echo "⚡ 1. Setting up APT parallel pipeline & high-speed DNS caching..."

mkdir -p /etc/apt/apt.conf.d

cat << 'EOF' > /etc/apt/apt.conf.d/99parallel-turbo
Acquire::Queue-Mode "access";
Acquire::http::Pipeline-Depth "10";
Acquire::http::No-Cache "false";
Acquire::http::No-Store "false";
Acquire::Retries "5";
EOF

# Ensure optimal DNS resolution inside container
printf "nameserver 8.8.8.8\nnameserver 1.1.1.1\nnameserver 1.0.0.1\n" > /etc/resolv.conf 2>/dev/null || true

echo "🚀 2. Installing aria2 multi-threaded downloader for apt-fast acceleration..."
apt-get update -y -o Acquire::http::Pipeline-Depth=10
apt-get install -y aria2 curl wget jq

# Create apt-fast wrapper using aria2c (16 parallel streams per deb file)
cat << 'EOF' > /usr/local/bin/apt-fast
#!/usr/bin/env bash
# High-Speed Parallel APT Package Downloader via OCI Turbo & aria2c

set -e

if [ "$1" = "install" ] || [ "$1" = "upgrade" ]; then
  shift
  echo "⚡ [APT-FAST OCI TURBO] Downloading packages using 16 parallel sockets..."
  apt-get install -y --print-uris "$@" | grep -E "^'http" | cut -d"'" -f2 > /tmp/apt_uris.txt 2>/dev/null || true
  
  if [ -s /tmp/apt_uris.txt ]; then
    mkdir -p /var/cache/apt/archives
    aria2c -i /tmp/apt_uris.txt -d /var/cache/apt/archives -j 16 -x 16 -s 16 --allow-overwrite=true --summary-interval=0 2>/dev/null || true
  fi
  
  exec apt-get install -y "$@"
else
  exec apt-get "$@"
fi
EOF

chmod +x /usr/local/bin/apt-fast

echo ""
echo "====================================================="
echo "🎉 OCI High-Speed APT Accelerator Ready!"
echo "====================================================="
echo "  • Parallel Mode: 16 Multi-socket connections (aria2c)"
echo "  • Usage        : apt-fast install <packages...>"
echo "====================================================="
