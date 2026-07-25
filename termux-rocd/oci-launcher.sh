#!/usr/bin/env bash
# rocd wrapper — unified launcher for local container + OCI remote shell
# ivansslo/termux-rocd extended
# Usage:
#   rocd            → local ubuntu container (original behavior)
#   rocd oci        → SSH to OCI via Tailscale (100.91.232.91)
#   rocd local      → bypass OCI auto, force local shell
#   rocd tunnel     → forward Ollama 11434
#   rocd aperture   → info about aperture roadfx node

OCI_TS_IP="${OCI_TS_IP:-100.91.232.91}"
OCI_PUBLIC_IP="${OCI_PUBLIC_IP:-161.118.253.28}"
OCI_USER="${OCI_USER:-ubuntu}"

case "$1" in
  oci)
    echo "🚀 rocd → OCI shell $OCI_USER@$OCI_TS_IP"
    if command -v mosh >/dev/null 2>&1; then
      mosh --ssh="ssh -o StrictHostKeyChecking=no" $OCI_USER@$OCI_TS_IP || ssh -t $OCI_USER@$OCI_TS_IP
    else
      ssh -t $OCI_USER@$OCI_TS_IP "bash -l" || ssh -t $OCI_USER@$OCI_PUBLIC_IP "bash -l"
    fi
    ;;
  tunnel)
    echo "🔗 Tunneling OCI Ollama 11434 → localhost:11434"
    autossh -M 0 -L 11434:127.0.0.1:11434 $OCI_USER@$OCI_TS_IP -N -v
    ;;
  aperture)
    echo "🪟 Aperture roadfx status:"
    echo "URL: https://aperture.tailscale.com/"
    echo "Expected node: roadfx"
    tailscale status | grep -i roadfx || echo "roadfx not yet in tailnet - need authorize"
    tailscale status | grep -i aperture || echo "No aperture node visible, check admin console"
    ;;
  local|"")
    # original termux-rocd behavior -> call udocker
    if command -v udocker >/dev/null 2>&1; then
      if [ "$1" = "local" ]; then shift; fi
      # check container roc-container
      if udocker ps | grep -q roc-container; then
        udocker run --rm -ti -v $HOME:/home --user=root roc-container /bin/bash "$@"
      else
        echo "roc-container not found, creating..."
        udocker pull ubuntu:22.04
        udocker create --name=roc-container ubuntu:22.04
        udocker run --rm -ti roc-container /bin/bash
      fi
    else
      echo "udocker not installed, launching bash..."
      bash -l
    fi
    ;;
  *)
    echo "Unknown: $1 — try: rocd [oci|local|tunnel|aperture]"
    ;;
esac
