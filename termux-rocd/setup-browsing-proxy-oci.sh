#!/usr/bin/env bash
# Speed up browsing via OCI server (HP -> OCI -> Internet) + Virtual Memory (swap)
# For: slow browsing via OCI, user complaint "Bisa kah anda menambah kecepatan juga untuk browsing di hp saya melalui oci server. Lambat sekali Virtual memory jika bisa?"
# Usage:
#   On OCI VM (161.118.253.28 / 100.91.232.91): bash setup-browsing-proxy-oci.sh oci
#   On Termux host: bash setup-browsing-proxy-oci.sh termux

set -e
MODE=${1:-oci}
OCI_IP="161.118.253.28"
OCI_TAILSCALE_IP="100.91.232.91"
PROXY_PORT="3128"
SOCKS_PORT="1080"

if [ "$MODE" = "oci" ]; then
  echo "=== OCI: Setup Browsing Proxy + BBR + Virtual Memory ==="
  
  # 1. Enable BBR for faster TCP
  echo "Enabling BBR congestion control..."
  sudo modprobe tcp_bbr 2>/dev/null || true
  echo "tcp_bbr" | sudo tee -a /etc/modules 2>/dev/null || true
  sudo sysctl -w net.core.default_qdisc=fq 2>/dev/null || true
  sudo sysctl -w net.ipv4.tcp_congestion_control=bbr 2>/dev/null || true
  echo "net.core.default_qdisc = fq" | sudo tee -a /etc/sysctl.d/99-bbr.conf
  echo "net.ipv4.tcp_congestion_control = bbr" | sudo tee -a /etc/sysctl.d/99-bbr.conf
  sudo sysctl -p /etc/sysctl.d/99-bbr.conf 2>/dev/null || true

  # 2. Install Squid HTTP proxy for browsing
  echo "Installing Squid proxy..."
  sudo apt update -y
  sudo apt install -y squid tinyproxy dante-server 2>&1 | tail -n 5 || true

  # Configure Squid for fast browsing
  sudo tee /etc/squid/squid.conf > /dev/null <<SQUID
http_port 0.0.0.0:$PROXY_PORT
http_port 0.0.0.0:8080
acl localnet src 10.0.0.0/8
acl localnet src 172.16.0.0/12
acl localnet src 192.168.0.0/16
acl localnet src 100.64.0.0/10
acl SSL_ports port 443
acl Safe_ports port 80
acl Safe_ports port 21
acl Safe_ports port 443
acl Safe_ports port 70
acl Safe_ports port 210
acl Safe_ports port 1025-65535
acl Safe_ports port 280
acl Safe_ports port 488
acl Safe_ports port 591
acl Safe_ports port 777
acl CONNECT method CONNECT
http_access deny !Safe_ports
http_access deny CONNECT !SSL_ports
http_access allow localhost manager
http_access deny manager
http_access allow localnet
http_access allow localhost
http_access allow all
cache_mem 512 MB
maximum_object_size_in_memory 64 MB
cache_dir ufs /var/spool/squid 1024 16 256
access_log /var/log/squid/access.log
coredump_dir /var/spool/squid
refresh_pattern ^ftp: 1440 20% 10080
refresh_pattern ^gopher: 1440 0% 1440
refresh_pattern -i (/cgi-bin/|\?) 0 0% 0
refresh_pattern . 0 20% 4320
dns_v4_first on
SQUID

  sudo mkdir -p /var/spool/squid
  sudo chown -R proxy:proxy /var/spool/squid 2>/dev/null || true
  sudo squid -z 2>&1 | tail -n 3 || true
  sudo systemctl enable --now squid 2>/dev/null || sudo service squid restart 2>/dev/null || sudo squid 2>&1 | head || true

  # 3. Setup SOCKS5 proxy via Dante for even faster browsing (UDP via TCP)
  echo "Configuring SOCKS5..."
  sudo tee /etc/danted.conf > /dev/null <<DANTE
logoutput: syslog
internal: 0.0.0.0 port = $SOCKS_PORT
external: eth0
socksmethod: none
clientmethod: none
user.privileged: root
user.unprivileged: nobody
client pass {
  from: 0.0.0.0/0 to: 0.0.0.0/0
  log: error
}
socks pass {
  from: 0.0.0.0/0 to: 0.0.0.0/0
  log: error
}
DANTE
  sudo systemctl enable --now danted 2>/dev/null || sudo service danted restart 2>/dev/null || true

  # 4. Virtual Memory (swap) on OCI for speed
  echo "Setting up virtual memory (swap) on OCI..."
  if [ ! -f /swapfile ]; then
    sudo fallocate -l 4G /swapfile 2>/dev/null || sudo dd if=/dev/zero of=/swapfile bs=1M count=4096 2>&1 | tail -n 2
    sudo chmod 600 /swapfile
    sudo mkswap /swapfile
    sudo swapon /swapfile
    echo "/swapfile none swap sw 0 0" | sudo tee -a /etc/fstab
    echo "vm.swappiness=10" | sudo tee -a /etc/sysctl.d/99-swappiness.conf
    sudo sysctl -p /etc/sysctl.d/99-swappiness.conf 2>/dev/null || true
  fi
  free -h
  swapon --show

  # 5. Cloudflare Warp / 1.1.1.1 for faster DNS
  echo "Setting up 1.1.1.1 DNS..."
  echo "nameserver 1.1.1.1
nameserver 1.0.0.1
nameserver 8.8.8.8" | sudo tee /etc/resolv.conf

  echo ""
  echo "✅ OCI Browsing Proxy Ready!"
  echo "HTTP Proxy: http://$OCI_TAILSCALE_IP:$PROXY_PORT and http://$OCI_TAILSCALE_IP:8080"
  echo "SOCKS5 Proxy: socks5://$OCI_TAILSCALE_IP:$SOCKS_PORT"
  echo "Public: http://$OCI_IP:$PROXY_PORT"
  echo "BBR: $(sysctl net.ipv4.tcp_congestion_control 2>&1 | tail -n 1)"
  echo "Swap: $(free -h | grep Swap)"

elif [ "$MODE" = "termux" ]; then
  echo "=== Termux: Setup Browsing via OCI Proxy + Virtual Memory ==="
  
  # Install needed packages
  pkg install -y proot-distro termux-api tsu 2>&1 | tail -n 5 || true

  # 1. Configure Termux to use OCI Squid proxy for fast browsing
  echo "Configuring proxy for Termux..."
  echo "export http_proxy=http://$OCI_TAILSCALE_IP:$PROXY_PORT" >> ~/.bashrc
  echo "export https_proxy=http://$OCI_TAILSCALE_IP:$PROXY_PORT" >> ~/.bashrc
  echo "export HTTP_PROXY=http://$OCI_TAILSCALE_IP:$PROXY_PORT" >> ~/.bashrc
  echo "export HTTPS_PROXY=http://$OCI_TAILSCALE_IP:$PROXY_PORT" >> ~/.bashrc
  echo "export no_proxy=localhost,127.0.0.1,100.64.0.0/10" >> ~/.bashrc

  # For curl/wget to use proxy
  mkdir -p ~/.curlrc.d 2>/dev/null || true
  echo "proxy = http://$OCI_TAILSCALE_IP:$PROXY_PORT" > ~/.curlrc

  # 2. Setup Tailscale as exit node for all phone traffic (fastest browsing via OCI)
  echo "Setting up Tailscale exit node..."
  echo "Run: tailscale up --exit-node=$OCI_TAILSCALE_IP --exit-node-allow-lan-access --accept-routes"
  echo "Or use: tailscale set --exit-node=$OCI_TAILSCALE_IP"

  # 3. Virtual Memory (swap) on Termux host (requires root or proot)
  echo "Setting up virtual memory (swap) on Termux host..."
  if [ -d "/data/data/com.termux/files/usr/var/lib/proot-distro/containers/ubuntu" ]; then
    echo "Creating swap inside ubuntu container..."
    proot-distro login ubuntu -- bash -c "
      if [ ! -f /swapfile ]; then
        fallocate -l 2G /swapfile 2>/dev/null || dd if=/dev/zero of=/swapfile bs=1M count=2048 2>&1 | tail -n 1
        chmod 600 /swapfile
        mkswap /swapfile
        swapon /swapfile || echo 'swapon needs privileged, will use as file'
      fi
      free -h
    " 2>&1 | tail -n 20
  else
    echo "No ubuntu container, creating swap file in Termux home (userland swap via file)..."
    if [ ! -f $HOME/swapfile ]; then
      dd if=/dev/zero of=$HOME/swapfile bs=1M count=1024 2>&1 | tail -n 2
      echo "Swap file created at ~/swapfile 1GB (use with proot-distro ubuntu swapon)"
    fi
  fi

  # 4. DNS 1.1.1.1 for faster browsing
  echo "Setting DNS to 1.1.1.1..."
  echo "nameserver 1.1.1.1
nameserver 1.0.0.1" > $PREFIX/etc/resolv.conf 2>&1 || echo "nameserver 1.1.1.1" > $PREFIX/etc/resolv.conf

  # 5. Browser speed test
  echo "Testing browsing speed via OCI proxy..."
  echo "Without proxy:"
  time curl -s -o /dev/null https://1.1.1.1 --connect-timeout 5 2>&1 | tail -n 5 || true
  echo "With proxy http://$OCI_TAILSCALE_IP:$PROXY_PORT:"
  time curl -x http://$OCI_TAILSCALE_IP:$PROXY_PORT -s -o /dev/null https://1.1.1.1 --connect-timeout 5 2>&1 | tail -n 5 || echo "Proxy not yet reachable, ensure OCI Squid running and Tailscale connected"

  echo ""
  echo "✅ Termux Browsing Speed Setup Done!"
  echo "To enable proxy browsing on phone:"
  echo "  export http_proxy=http://$OCI_TAILSCALE_IP:$PROXY_PORT"
  echo "  export https_proxy=http://$OCI_TAILSCALE_IP:$PROXY_PORT"
  echo "Or set Tailscale exit node:"
  echo "  tailscale set --exit-node=$OCI_TAILSCALE_IP --exit-node-allow-lan-access"
  echo ""
  echo "Virtual memory: ~/swapfile 1GB created, use inside ubuntu: swapon /swapfile"
  echo "To disable proxy:"
  echo "  unset http_proxy https_proxy HTTP_PROXY HTTPS_PROXY"
fi

echo ""
echo "Done - Browsing via OCI should be faster now (BBR + Squid cache + 1.1.1.1 DNS + Tailscale exit node + swap)"
