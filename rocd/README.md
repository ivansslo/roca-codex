# ⚡ rocd — Standalone Termux Rootfs Container Engine

<div align="center">

**Modern, lightweight, non-root Linux container engine for Termux and Android environments.**

[![License: MIT](https://img.shields.io/badge/License-GPL3-blue.svg)](LICENSE)
[![Termux](https://img.shields.io/badge/Termux-ARM64-brightgreen)](https://termux.dev)

</div>

---

## 🌟 Overview

**`rocd`** is a complete, standalone rootfs container management system for Termux on Android. It allows running full Linux distributions (Ubuntu, Debian, Arch Linux, Alpine, Fedora, Kali, Void, AlmaLinux, Rocky Linux) inside an unprivileged container environment with zero root required.

---

## 🚀 Quick Start (1-Line Command)

Install `rocd` directly in your **Termux** terminal:

```bash
curl -fsSL https://raw.githubusercontent.com/ivansslo/rocd/main/install.sh | bash
```

---

## 📖 Available Commands

| Command | Action |
| :--- | :--- |
| `rocd list` | List available and installed Linux distributions |
| `rocd install ubuntu` | Download and install Ubuntu 22.04 LTS rootfs |
| `rocd login ubuntu` | Log into the Ubuntu container shell as root |
| `rocd login ubuntu --user username` | Log in as a non-root user |
| `rocd run ubuntu -- command` | Run a specific command inside the container |
| `rocd backup ubuntu` | Export container rootfs to tar.xz backup archive |
| `rocd restore backup.tar.xz` | Restore container from backup archive |
| `rocd reset ubuntu` | Reset container back to initial fresh installation |
| `rocd remove ubuntu` | Delete installed container rootfs |

---

## 🛠️ Features

- 🛡️ **Zero Root Required**: Powered by PRoot binary layer with native SECCOMP bypass (`PROOT_NO_SECCOMP=1`).
- ⚡ **Native Performance**: Runs directly on device CPU with minimal overhead.
- 🌐 **Auto DNS Repair**: Fixes Termux `resolv.conf` volume mount paths automatically.
- 📦 **Docker & OCI Compatibility**: Supports OCI layer extraction and Docker image imports.

---

## 📄 License

GPL-3.0 License.
