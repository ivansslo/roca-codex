#!/usr/bin/env bash
# Fix ubuntu container's /root "Not a directory" bug FROM Termux HOST — v2
# Handles rocd + proot-distro paths + direct login fix
# Run FROM Termux host ~ $ (not inside ubuntu)

set -e
echo "=== Fix from HOST: /root Not a directory v2 ==="

# Method 1: Try direct proot-distro login fix (most reliable)
if command -v proot-distro >/dev/null 2>&1; then
  echo "[1/3] Trying proot-distro login fix..."
  if proot-distro list 2>&1 | grep -q "ubuntu"; then
    echo "Found ubuntu distro in proot-distro, attempting inside-container fix via login..."
    proot-distro login ubuntu -- sh -c '
      echo "Inside container: pwd=$(pwd) id=$(id)"
      echo "Checking /root..."
      ls -ld /root 2>&1 || echo "/root ls failed"
      file /root 2>&1 || true
      echo "Fixing..."
      cd /tmp
      rm -rf /root 2>&1 || rm -f /root 2>&1 || true
      mkdir -p /root
      chmod 700 /root
      if [ -f /etc/skel/.bashrc ]; then
        cp /etc/skel/.bashrc /root/.bashrc
      else
        echo "export PS1=\"\\u@\\h:\\w\\$ \"" > /root/.bashrc
      fi
      echo "After fix:"
      ls -ld /root
      ls -la /root | head -n 20
      echo "OK"
    ' 2>&1 || echo "proot-distro login fix attempted (check output above)"
  fi
fi

# Method 2: Find rocd containers path and fix directly on host filesystem
echo "[2/3] Searching host filesystem for ubuntu rootfs..."
POSSIBLE_BASES=(
  "$PREFIX/var/lib/rocd/containers/ubuntu"
  "$PREFIX/var/lib/proot-distro/installed-rootfs/ubuntu"
  "$PREFIX/var/lib/proot-distro/containers/ubuntu"
  "$HOME/ubuntu-fs"
  "/data/data/com.termux/files/usr/var/lib/rocd/containers/ubuntu"
  "/data/data/com.termux/files/usr/var/lib/proot-distro/installed-rootfs/ubuntu"
)

FOUND_FIX=0
for base in "${POSSIBLE_BASES[@]}"; do
  # Try different subpaths for root
  for sub in "root" "rootfs/root" "rootfs/home/root" "home/ubuntu" "rootfs/home/ubuntu"; do
    if [ -e "$base" ]; then
      echo "Checking base: $base"
      # Look for actual root dir inside
      if [ -d "$base/rootfs" ]; then
        echo "  Found rootfs at $base/rootfs"
        # Check if root inside rootfs is file
        if [ -f "$base/rootfs/root" ] && [ ! -d "$base/rootfs/root" ]; then
          echo "  ❌ $base/rootfs/root is FILE (should be dir) — fixing..."
          rm -f "$base/rootfs/root"
          mkdir -p "$base/rootfs/root"
          chmod 700 "$base/rootfs/root"
          [ -f "$base/rootfs/etc/skel/.bashrc" ] && cp "$base/rootfs/etc/skel/.bashrc" "$base/rootfs/root/.bashrc" || echo 'export PS1="\u@\h:\w\$ "' > "$base/rootfs/root/.bashrc"
          FOUND_FIX=1
        fi
        if [ -d "$base/rootfs/root" ]; then
          if [ -d "$base/rootfs/root/.bashrc" ]; then
            echo "  Removing directory .bashrc at $base/rootfs/root/.bashrc"
            rm -rf "$base/rootfs/root/.bashrc"
            [ -f "$base/rootfs/etc/skel/.bashrc" ] && cp "$base/rootfs/etc/skel/.bashrc" "$base/rootfs/root/.bashrc" || true
            FOUND_FIX=1
          fi
          if [ ! -f "$base/rootfs/root/.bashrc" ]; then
            [ -f "$base/rootfs/etc/skel/.bashrc" ] && cp "$base/rootfs/etc/skel/.bashrc" "$base/rootfs/root/.bashrc" || echo 'export PS1="\u@\h:\w\$ "' > "$base/rootfs/root/.bashrc"
            FOUND_FIX=1
          fi
        fi
      fi
      # Direct root check (rocd containers without rootfs layer)
      if [ -f "$base/root" ] && [ ! -d "$base/root" ]; then
        echo "  ❌ $base/root is FILE — fixing..."
        rm -f "$base/root"
        mkdir -p "$base/root"
        chmod 700 "$base/root"
        FOUND_FIX=1
      fi
    fi
  done
done

# Method 3: Brute search for any directory named root that contains .bashrc as directory (bug)
echo "[3/3] Brute search for broken .bashrc directory..."
find $PREFIX/var -type d -name ".bashrc" 2>/dev/null | head -n 20 | while read d; do
  echo "  Found .bashrc directory: $d → removing"
  rm -rf "$d" 2>&1 || true
  parent=$(dirname "$d")
  if [ ! -f "$parent/.bashrc" ] && [ -f "$parent/../etc/skel/.bashrc" ]; then
    cp "$parent/../etc/skel/.bashrc" "$parent/.bashrc" 2>&1 || true
  elif [ ! -f "$parent/.bashrc" ]; then
    echo 'export PS1="\u@\h:\w\$ "' > "$parent/.bashrc" 2>&1 || true
  fi
  FOUND_FIX=1
done

echo ""
if [ "$FOUND_FIX" = "1" ]; then
  echo "✅ Fixed at least one path!"
else
  echo "⚠️ No auto-fix path found, but proot-distro login method should have fixed inside container."
  echo "Try manual:"
  echo "  proot-distro login ubuntu -- bash -c 'cd /tmp; rm -rf /root; mkdir -p /root; chmod 700 /root; cp /etc/skel/.bashrc /root/.bashrc; ls -la /root'"
fi

echo ""
echo "=== Verify ==="
if command -v proot-distro >/dev/null 2>&1; then
  proot-distro login ubuntu -- sh -c 'ls -ld /root; ls -la /root | head -n 10; cat /root/.bashrc | head -n 5' 2>&1 || true
fi
echo "Done — now try: ubuntu  or  proot-distro login ubuntu"
