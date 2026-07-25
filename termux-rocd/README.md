# ⚡ termux-rocd — Termux Reset & udocker Container Provisioner

<div align="center">

**Standalone script to reset Termux to a clean initial state and transform Termux into an isolated Linux Container environment using `udocker`.**

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Termux Compatible](https://img.shields.io/badge/Termux-ARM64-brightgreen)](https://termux.dev)
[![udocker Engine](https://img.shields.io/badge/udocker-Container%20Engine-blue)](https://github.com/indigo-dc/udocker)

</div>

---

## 🌟 Overview

`termux-rocd` provides an automated zero-effort solution for Android/Termux users:
1. **🧹 Complete System Reset**: Purges broken `pip` caches, corrupt metadata, and temporary files.
2. **📦 Container Transformation**: Installs `udocker` (a non-root Docker execution engine tailored for unprivileged user environments).
3. **🚀 Pre-provisioned Ubuntu Environment**: Automatically downloads Ubuntu 22.04 LTS and provisions a container named `roc-container`.
4. **🔗 One-Word Launcher (`rocd`)**: Installs a global shortcut `rocd` to easily spawn a root shell inside the container.

---

## 🚀 Quick Installation (1-Line Command)

Run this single command directly in your **Termux** terminal:

```bash
curl -fsSL https://raw.githubusercontent.com/ivansslo/termux-rocd/main/install.sh | bash
```

---

## 📖 How to Use

Once the installation completes, use the global `rocd` command:

```bash
# 1. Enter the isolated container shell as root:
rocd

# 2. Execute a single command directly inside the container:
rocd apt-get update && rocd apt-get install -y htop

# 3. Reset the container back to a clean Ubuntu state:
rocd reset
```

---

## 🛠️ Customization & Commands

| Command | Action |
| :--- | :--- |
| `rocd` | Launch interactive root bash shell inside `roc-container` |
| `rocd <cmd>` | Execute a specific command inside container |
| `rocd reset` | Wipe `roc-container` and create a fresh new Ubuntu container |
| `udocker ps` | List all udocker containers |
| `udocker images` | List all downloaded container images |

---

## 🛡️ License

Licensed under the MIT License.
