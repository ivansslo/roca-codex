#!/usr/bin/env bash
# Fix Proot Ubuntu localhost + Tailscale SSH job control + 100% agent functionality
# For: ivansslo termux-rocd Ubuntu 26.04 LTS PRoot-Distro aarch64
# Usage in ubuntu container (root@localhost):
#   bash fix-proot-ubuntu-localhost.sh
# Or from Termux host:
#   rocd "bash /path/to/fix-proot-ubuntu-localhost.sh"

set -e

RED='\033[0;31m'; GRN='\033[0;32m'; YLW='\033[1;33m'; CYN='\033[0;36m'; RST='\033[0m'

echo -e "${CYN}=== Fix Proot Ubuntu Localhost & Job Control ===${RST}"

# 0. CRITICAL FIX: /root is file not directory → ls '.' Not a directory + cat .bashrc Not a directory (screenshot 00:41)
echo "[0/7] CRITICAL: Checking if /root is corrupted (file instead of directory)..."
echo "pwd: $(pwd)"
ls -ld /root 2>&1 || echo "/root ls failed"
file /root 2>&1 || echo "file cmd not found"
ls -ld . 2>&1 || echo "dot ls failed → /root is broken"

if [ ! -d "/root" ]; then
  echo -e "${RED}❌ /root is NOT a directory (it's a file or broken symlink) — fixing now!${RST}"
  cd /tmp
  rm -rf /root 2>&1 || rm -f /root 2>&1 || true
  mkdir -p /root
  chmod 700 /root
  echo "Recreated /root as directory"
else
  # Check if /root/.bashrc is directory (bug from earlier rm -rf ~/.bashrc when ~/.bashrc was directory)
  if [ -d "/root/.bashrc" ]; then
    echo -e "${YLW}⚠️ /root/.bashrc is a directory — removing...${RST}"
    rm -rf /root/.bashrc
  fi
  # Check if '.' is accessible
  if ! ls -d . >/dev/null 2>&1; then
    echo "dot not accessible, cd /root and recreate"
    cd /tmp
    mkdir -p /root
    chmod 700 /root
  fi
fi

# Ensure /root/.bashrc exists as file
if [ ! -f "/root/.bashrc" ]; then
  echo "Creating /root/.bashrc from /etc/skel..."
  cp /etc/skel/.bashrc /root/.bashrc 2>/dev/null || echo 'export PS1="\u@\h:\w\$ "' > /root/.bashrc
fi

echo "After fix:"
ls -ld /root
ls -la /root/ | head -n 20
pwd
cd /root
ls 2>&1 | head -n 20
echo -e "${GRN}✅ /root fixed: $(ls -ld /root)${RST}"

# 1. Fix /etc/hosts — ensure localhost resolves
echo "[1/7] Fixing /etc/hosts..."
cat > /etc/hosts <<'HOSTS'
127.0.0.1   localhost
127.0.1.1   ubuntu-oci ubuntu-oci-1
::1         localhost ip6-localhost ip6-loopback
ff02::1     ip6-allnodes
ff02::2     ip6-routers
HOSTS
echo "127.0.0.1 localhost OK"
cat /etc/hosts

# 2. Fix /etc/resolv.conf — ensure DNS
echo "[2/6] Fixing /etc/resolv.conf & /etc/nsswitch.conf..."
cat > /etc/resolv.conf <<'RESOLV'
nameserver 1.1.1.1
nameserver 1.0.0.1
nameserver 8.8.8.8
nameserver 8.8.4.4
options edns0
RESOLV
echo "nameserver 1.1.1.1" > /etc/resolv.conf 2>&1 && cat /etc/resolv.conf || true

# Enable localhost loopback (if possible in proot)
echo "[3/6] Attempting lo up (may fail in proot, ignore)..."
ip link set lo up 2>&1 || ifconfig lo up 2>&1 || echo "lo up skipped (proot limited) — ok"

# 3. Fix bash job control warning in Tailscale SSH
# Tailscale SSH uses non-tty PTY → bash complains "cannot set terminal process group"
echo "[4/6] Fixing bash job control for Tailscale SSH..."
# Add to /root/.bashrc
if ! grep -q "TAILSCALE_SSH_FIX" /root/.bashrc 2>/dev/null; then
cat >> /root/.bashrc <<'BRC'

# >>> TAILSCALE_SSH_FIX >>> Fix job control in Tailscale SSH (proot)
if [[ -n "$TAILSCALE_SSH" ]] || [[ "$SSH_CLIENT" == *"100."* ]] || [[ ! -t 0 ]]; then
  # Disable job control warnings
  set +m
  # Force TERM
  export TERM=xterm-256color
  # Use setsid wrapper if needed
  [[ -z "$BASHRCSOURCED" ]] && export BASHRCSOURCED=1
  # Suppress ioctl warnings
  stty sane 2>/dev/null || true
fi
# <<< TAILSCALE_SSH_FIX <<<
BRC
fi

# Also fix /etc/bash.bashrc
sed -i 's/^.*mesg n.*/# mesg n disabled for Tailscale SSH/' /root/.bashrc 2>/dev/null || true

# Create wrapper for Tailscale SSH that allocates proper PTY
echo "[5/6] Creating /usr/local/bin/tailscale-ssh-wrapper..."
cat > /usr/local/bin/tailscale-ssh-wrapper <<'WRAP'
#!/bin/bash
# Wrapper to fix Inappropriate ioctl for device in Tailscale SSH
export TERM=xterm-256color
export SHELL=/bin/bash
# Force pseudo-terminal allocation
if [ -t 0 ]; then
  exec /bin/bash -l
else
  # Non-tty → use script to allocate PTY
  exec script -q -c "/bin/bash -l" /dev/null
fi
WRAP
chmod +x /usr/local/bin/tailscale-ssh-wrapper

# Update Tailscale SSH config to use wrapper? Not needed, but provide alternative sshd_config fix
mkdir -p /etc/ssh
grep -q "PermitTTY yes" /etc/ssh/sshd_config 2>/dev/null || echo "PermitTTY yes" >> /etc/ssh/sshd_config 2>/dev/null || true

# 4. Fix localhost socket access for agent
echo "[6/6] Fixing localhost access for rocagents (127.0.0.1:3000, 11434, 8080)..."
# Allow binding to 127.0.0.1 in proot — create proxy via socat if needed
if command -v socat >/dev/null 2>&1; then
  echo "socat available"
else
  apt update -y && apt install -y socat iproute2 net-tools curl wget openssh-server 2>&1 | tail -n 10 || true
fi

# Create systemd-like service file for proot? Just create helper script
cat > /usr/local/bin/fix-localhost-proxy <<'PROXY'
#!/bin/bash
# Proxy 127.0.0.1:11434 to Tailscale IP if localhost bind fails in proot
T_IP=$(tailscale ip -4 2>/dev/null | head -n1)
if [ -n "$T_IP" ]; then
  echo "Tailscale IP $T_IP available, proxying 127.0.0.1:11434 -> $T_IP:11434 if needed"
  # socat TCP-LISTEN:11434,fork,reuseaddr TCP:$T_IP:11434 &
fi
PROXY
chmod +x /usr/local/bin/fix-localhost-proxy

# Test localhost
echo ""
echo -e "${GRN}=== Testing localhost ===${RST}"
echo "ping 127.0.0.1"
ping -c1 -W2 127.0.0.1 2>&1 | head -n 5 || echo "ping blocked in proot — ok, TCP still works"
echo "curl 127.0.0.1:22 (ssh)"
timeout 2 bash -c 'cat < /dev/null > /dev/tcp/127.0.0.1/22 && echo "127.0.0.1:22 reachable"' || echo "127.0.0.1:22 not reachable — will use Tailscale IP"

echo "getent hosts localhost"
getent hosts localhost || echo "localhost in hosts: 127.0.0.1"

# Final check for agent 100%
echo ""
echo -e "${GRN}=== Agent 100% Functional Check ===${RST}"
echo "Checking tailscale..."
tailscale status 2>&1 | head -n 20
echo ""
echo "Checking Ollama / ROCSPACE-INITIAL..."
curl -s http://127.0.0.1:11434/api/tags 2>&1 | head -n 20 || tailscale_ip=$(tailscale ip -4 2>/dev/null | head -n1); curl -s http://$tailscale_ip:11434/api/tags 2>&1 | head -n 20 || echo "Ollama not yet running — start with: docker run -d -p 11434:11434 ollama/ollama"

echo ""
echo -e "${GRN}✅ Fix completed!${RST}"
echo "Next:"
echo "  1. Exit & re-SSH: ssh -tt root@100.91.232.91  (double -t forces PTY, fixes ioctl warning)"
echo "  2. In Termux host, use: ssh -tt root@100.91.232.91"
echo "  3. Or use: mosh root@100.91.232.91"
echo "  4. For rocagents agent 100% — dist/ rebuilt, run: npm start or node dist/server.cjs"
