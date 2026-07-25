#!/usr/bin/env bash
# Migrate rocd/containers/ubuntu -> proot-distro/containers/ubuntu
# + Fix rocd /root Not a directory bug from HOST
# Run FROM Termux host ~ $
# Usage: bash ~/rocagents/termux-rocd/migrate-rocd-to-proot-distro.sh

set -e
echo "=== Migrate rocd ubuntu -> proot-distro ubuntu + Fix /root bug ==="

ROCD_BASE="/data/data/com.termux/files/usr/var/lib/rocd/containers/ubuntu"
ROCD_ROOTFS="$ROCD_BASE/rootfs"
PROOT_BASE="/data/data/com.termux/files/usr/var/lib/proot-distro/containers/ubuntu"
PROOT_ROOTFS="$PROOT_BASE/rootfs"
# Alternative installed-rootfs path
PROOT_ALT="/data/data/com.termux/files/usr/var/lib/proot-distro/installed-rootfs/ubuntu"

echo "[1/5] Detecting rocd container..."
ls -ld "$ROCD_BASE" 2>&1 | head -n 5 || echo "rocd base not found"
ls -ld "$ROCD_ROOTFS" 2>&1 | head -n 5 || true
if [ -d "$ROCD_ROOTFS" ]; then
  echo "ROCD_ROOTFS=$ROCD_ROOTFS"
  ls -ld "$ROCD_ROOTFS/root" 2>&1 || true
  file "$ROCD_ROOTFS/root" 2>&1 || true
fi

echo "[2/5] Fixing rocd /root Not a directory FROM HOST..."
if [ -e "$ROCD_ROOTFS" ]; then
  # If /root is file, remove
  if [ -f "$ROCD_ROOTFS/root" ] && [ ! -d "$ROCD_ROOTFS/root" ]; then
    echo "❌ $ROCD_ROOTFS/root is FILE → removing"
    rm -f "$ROCD_ROOTFS/root"
  fi
  # If /root/.bashrc is directory
  if [ -d "$ROCD_ROOTFS/root/.bashrc" ]; then
    echo "Removing directory .bashrc in rocd..."
    rm -rf "$ROCD_ROOTFS/root/.bashrc"
  fi
  mkdir -p "$ROCD_ROOTFS/root"
  chmod 700 "$ROCD_ROOTFS/root"
  if [ -f "$ROCD_ROOTFS/etc/skel/.bashrc" ]; then
    cp "$ROCD_ROOTFS/etc/skel/.bashrc" "$ROCD_ROOTFS/root/.bashrc"
  else
    echo 'export PS1="\u@\h:\w\$ "' > "$ROCD_ROOTFS/root/.bashrc"
  fi
  echo "✅ Fixed rocd root:"
  ls -ld "$ROCD_ROOTFS/root"
  ls -la "$ROCD_ROOTFS/root" | head -n 15
fi

echo "[3/5] Detecting proot-distro ubuntu..."
ls -ld "$PROOT_BASE" 2>&1 | head -n 3 || true
ls -ld "$PROOT_ROOTFS" 2>&1 | head -n 3 || true
ls -ld "$PROOT_ALT" 2>&1 | head -n 3 || true
proot-distro list 2>&1 | tail -n 20

echo "[4/5] Migrating data rocd -> proot-distro..."
# List what's in rocd root home
echo "--- rocd /root contents ---"
ls -la "$ROCD_ROOTFS/root" 2>&1 | head -n 30 || true
echo "--- rocd /home/ubuntu contents ---"
ls -la "$ROCD_ROOTFS/home/ubuntu" 2>&1 | head -n 30 || ls -la "$ROCD_ROOTFS/home" 2>&1 | head -n 30 || true

# Ensure proot-distro root exists
if [ -d "$PROOT_ROOTFS" ]; then
  DEST_ROOT="$PROOT_ROOTFS/root"
elif [ -d "$PROOT_ALT/rootfs" ]; then
  DEST_ROOT="$PROOT_ALT/rootfs/root"
  PROOT_ROOTFS="$PROOT_ALT/rootfs"
else
  DEST_ROOT=""
fi

if [ -n "$DEST_ROOT" ] && [ -d "$DEST_ROOT" ]; then
  echo "Migrating to $DEST_ROOT ..."
  # Copy any custom files from rocd root (excluding broken ones)
  echo "Copying rocd/root -> proot-distro/root (skip existing)..."
  cp -rn "$ROCD_ROOTFS/root/." "$DEST_ROOT/" 2>&1 | head -n 20 || true
  
  # Also migrate home
  if [ -d "$ROCD_ROOTFS/home/ubuntu" ]; then
    mkdir -p "$PROOT_ROOTFS/home/ubuntu"
    cp -rn "$ROCD_ROOTFS/home/ubuntu/." "$PROOT_ROOTFS/home/ubuntu/" 2>&1 | head -n 20 || true
  fi
  
  echo "✅ Migrated"
  ls -la "$DEST_ROOT" | head -n 20
else
  echo "⚠️ Could not find proot-distro dest root, skipping copy"
fi

echo "[5/5] Bind rocagents repo into both containers..."
# Make rocagents available inside containers via bind mount trick
# For proot-distro, create bind mount helper script
mkdir -p ~/.termux
cat > $PREFIX/bin/ubuntu-fixed <<'BIN'
#!/data/data/com.termux/files/usr/bin/bash
# Fixed ubuntu command that uses proot-distro ubuntu (healthy) instead of broken rocd
# Auto-mount ~/rocagents to /root/rocagents
if [ -d "$HOME/rocagents" ]; then
  exec proot-distro login --bind "$HOME/rocagents:/root/rocagents" --bind "$HOME/rocagents:/home/ubuntu/rocagents" ubuntu "$@"
else
  exec proot-distro login ubuntu "$@"
fi
BIN
chmod +x $PREFIX/bin/ubuntu-fixed
echo "Created $PREFIX/bin/ubuntu-fixed"

# Also create wrapper to replace broken 'ubuntu' command with fixed one (optional)
echo "To replace broken 'ubuntu' command:"
echo "  mv \$PREFIX/bin/ubuntu \$PREFIX/bin/ubuntu-rocd-broken"
echo "  cp \$PREFIX/bin/ubuntu-fixed \$PREFIX/bin/ubuntu"
echo "  Or just use: ubuntu-fixed  or  proot-distro login ubuntu"

echo ""
echo "=== Verification ==="
echo "Test rocd ubuntu (should now be fixed):"
echo "  ubuntu"
echo "  inside: pwd; ls; cat .bashrc | head"
echo ""
echo "Test proot-distro ubuntu (healthy):"
proot-distro login ubuntu -- sh -c 'pwd; ls -ld /root; ls | head; echo "--- .bashrc ---"; cat /root/.bashrc | head -n 3' 2>&1 | head -n 30

echo ""
echo "=== Rocagents repo location ==="
echo "Host: ~/rocagents = $HOME/rocagents"
echo "Inside proot-distro ubuntu:"
echo "  proot-distro login ubuntu -- ls -la /root/rocagents 2>&1 | head"
proot-distro login ubuntu -- ls -la /root/rocagents 2>&1 | head -n 20 || echo "Not yet mounted — use --bind as in ubuntu-fixed"
echo ""
echo "Inside rocd ubuntu:"
echo "  ubuntu -> ls -la /root/rocagents"
echo ""
echo "Done — now you can use ubuntu-fixed for clean silent container with rocagents mounted."
