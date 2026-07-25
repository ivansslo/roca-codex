#!/usr/bin/env bash
# ═════════════════════════════════════════════════════════════════════════════
#  OCI CLI Installer & Configurator for Termux & Linux
# ═════════════════════════════════════════════════════════════════════════════

set -e

RED='\033[0;31m'
GRN='\033[0;32m'
YLW='\033[1;33m'
CYN='\033[0;36m'
RST='\033[0m'

echo -e "${CYN}=====================================================${RST}"
echo -e "${GRN}         🚀 Installing OCI CLI for Termux / Linux     ${RST}"
echo -e "${CYN}=====================================================${RST}"

# Purge previous corrupt builds if requested or if flag provided
if [ "${1:-}" = "--purge" ] || [ "${1:-}" = "-p" ]; then
  echo -e "${YLW}🧹 Purging previous pip cache and cryptography wheels...${RST}"
  python3 -m pip purge 2>/dev/null || pip cache purge 2>/dev/null || true
  python3 -m pip uninstall -y cryptography oci-cli maturin 2>/dev/null || true
  command -v pkg &>/dev/null && pkg clean -y 2>/dev/null || true
  echo -e "${GRN}✅ Cache purged successfully!${RST}"
fi

# Set Android API level to resolve maturin / cryptography compilation issues
export ANDROID_API_LEVEL="$(getprop ro.build.version.sdk 2>/dev/null || echo 24)"

# 1. Install pre-compiled system dependencies
echo -e "${YLW}📦 Installing pre-compiled packages & cryptography binaries...${RST}"
if command -v pkg &>/dev/null; then
  echo -e "${YLW}Installing Termux C/Rust & python-cryptography packages...${RST}"
  pkg update -y
  pkg install -y python clang rust make pkg-config libffi openssl python-cryptography curl jq git
elif command -v apt-get &>/dev/null; then
  sudo apt-get update -y
  sudo apt-get install -y python3 python3-pip python3-venv python3-cryptography curl jq git
fi

# 2. Setup pip for OCI CLI using pre-compiled binaries
echo -e "${YLW}🐍 Installing oci-cli package via pip...${RST}"
if command -v python3 &>/dev/null; then
  mkdir -p "$HOME/.oci"
  python3 -m pip install --upgrade pip setuptools wheel --quiet 2>/dev/null || true
  python3 -m pip install oci-cli --no-build-isolation 2>/dev/null || python3 -m pip install oci-cli || pip install oci-cli
fi

# 3. Create OCI configuration ~/.oci/config from environment variables
OCI_USER="${OCI_USER:-ocid1.user.oc1..aaaaaaaapqqiklbf4nzdig2igdlg4j32itqc742f3gpnnc3zkcnrra4hgrfa}"
OCI_TENANCY="${OCI_TENANCY:-ocid1.tenancy.oc1..aaaaaaaacjngdgzlotanmtvz6y3esckykgbsj2vdrmj53h4y367xg6n2cf4a}"
OCI_FINGERPRINT="${OCI_FINGERPRINT:-44:d3:f7:95:99:16:d8:eb:de:c9:7c:72:7b:6e:8d:cd}"
OCI_REGION="${OCI_REGION:-ap-singapore-1}"
KEY_FILE="$HOME/.config/oci/oci_api_key.pem"

mkdir -p "$HOME/.oci" "$HOME/.config/oci"

cat << EOF > "$HOME/.oci/config"
[DEFAULT]
user=$OCI_USER
fingerprint=$OCI_FINGERPRINT
tenancy=$OCI_TENANCY
region=$OCI_REGION
key_file=$KEY_FILE
EOF

chmod 600 "$HOME/.oci/config" 2>/dev/null || true

echo -e "${GRN}✅ OCI CLI Installation Completed Successfully!${RST}"
echo -e "${CYN}Config File Created:${RST} $HOME/.oci/config"
echo ""
echo -e "${YLW}ℹ️ Next step: Make sure your OCI API key is placed at:${RST} $KEY_FILE"
echo -e "Run health check: ${GRN}oci os ns get${RST} or ${GRN}./hermes oci status${RST}"
