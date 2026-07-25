#!/usr/bin/env bash
# ═════════════════════════════════════════════════════════════════════════════
#  Remote Desktop (RDP / VNC / GUI + XFCE4) Setup Script
#  Auto-detects Termux Host vs Ubuntu/OCI VM Server vs Container
# ═════════════════════════════════════════════════════════════════════════════

set -e

export DEBIAN_FRONTEND=noninteractive

if command -v sudo >/dev/null 2>&1; then
  SUDO="sudo"
else
  SUDO=""
fi

# Detect Termux host environment
if command -v pkg >/dev/null 2>&1 || [ -d "/data/data/com.termux" ]; then
  echo "📱 Detected Termux Host environment..."
  echo "📦 Updating Termux repos and installing XFCE4 Desktop & VNC/X11..."
  pkg update -y
  pkg install -y x11-repo 2>/dev/null || true
  pkg install -y xfce4 dbus tigervnc termux-x11-nightly 2>/dev/null || pkg install -y xfce4 dbus tigervnc

  echo "xfce4-session" > ~/.xsession

  echo ""
  echo "=========================================="
  echo "🎉 TERMUX-XFCE4-GUI-SIAP"
  echo "=========================================="
  echo "Start GUI Server on Termux using:"
  echo "  vncserver -geometry 1280x720 :1"
  exit 0
fi

# Ubuntu / Debian / OCI VM / rocd Container Environment
echo "📦 Updating repositories and installing xrdp, tigervnc, xfce4 & dbus..."
$SUDO apt update -y
$SUDO apt install -y xrdp tigervnc-standalone-server tigervnc-common xfce4 xfce4-goodies dbus-x11 2>/dev/null || \
$SUDO apt install -y xrdp tightvncserver xfce4 dbus

mkdir -p ~/.vnc
echo "xfce4-session" > ~/.xsession
echo "xfce4-session" > ~/.vnc/xstartup
chmod +x ~/.vnc/xstartup 2>/dev/null || true

echo "⚙️ Enabling xrdp service..."
$SUDO systemctl enable --now xrdp 2>/dev/null || $SUDO service xrdp start 2>/dev/null || true
$SUDO adduser xrdp ssl-cert 2>/dev/null || true

echo "🔥 Opening port 3389 in iptables firewall..."
$SUDO iptables -I INPUT -p tcp --dport 3389 -j ACCEPT 2>/dev/null || true
if command -v netfilter-persistent >/dev/null 2>&1; then
  $SUDO netfilter-persistent save 2>/dev/null || true
fi

if [ -n "$1" ]; then
  echo "🔑 Setting password for user ubuntu/root..."
  if id "ubuntu" &>/dev/null; then
    echo "ubuntu:$1" | $SUDO chpasswd
  else
    echo "root:$1" | $SUDO chpasswd
  fi
else
  echo "🔑 Please set a user password using: passwd"
fi

echo ""
echo "=========================================="
echo "🎉 RDP-UBUNTU-SIAP & VNCSERVER-INSTALLED"
echo "=========================================="
echo "1. Connect via RDP client (Port 3389):"
echo "   IP: $(curl -s ifconfig.me || echo '161.118.253.28'):3389"
echo "2. Or start VNC Server locally inside container using:"
echo "   vncserver -geometry 1280x720 :1"
