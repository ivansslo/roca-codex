# ⚡ ROCAgents — v5.20.0 (Termux SSE & Auto-Roll Release)

> Pembaruan v5.20.0: Perbaikan menyeluruh SSE streaming & tool logs di Termux localhost, non-blocking execution, real HTTP app sync probe, dan Auto-Persona Roll.

## Ringkasan Perubahan (v5.20.0)
- **Termux SSE Streaming Fix**: Menambahkan header anti-buffering (`X-Accel-Buffering: no`, `Cache-Control: no-cache, no-transform`), explicit chunk flushing (`(res as any).flush?.()`), serta keepalive ping (`: ping`) 10s di `/api/terminal-stream` agar koneksi SSE di Termux/Android WebView tidak terputus.
- **Safe PATH Termux Native**: Memperbaiki `run_bash_command` agar menyertakan path biner Termux `/data/data/com.termux/files/usr/bin` dan melakukan pemeriksaan ketersediaan `proot-distro` secara dinamis.
- **Auto-Persona Roll (`🎲 Auto Roll`)**: Fitur seleksi persona adaptif otomatis yang menyesuaikan parameter model (`temperature`, `topP`, `systemSuffix`) berdasarkan konteks tugas (coding/kreatif/santai).
- **Grounded Application Sync**: Mengganti hardcoded sync log pada `sync_external_app` dengan HTTP probe nyata yang mengukur status code, latensi, dan header server secara langsung.
- **Non-Blocking Tool Execution**: Event `tool_start`, `tool_output`, dan `tool_result` dikirim secara instan tanpa menunda stream jawaban akhir.

## Instalasi (clone ke localhost)
```bash
git clone https://github.com/ivansslo/roca-codex.git
cd roca-codex
cp .env.example .env          # lalu isi min. 1 API key (GEMINI_API_KEY / GROQ_KEY / OPENROUTER_API_KEY / OPENAI_API_KEY)
npm install
npm run build                 # build frontend (dist/) + backend (dist/server.cjs)
npm start                     # -> http://localhost:3000  (mode dev: npm run dev)
```

## Menjalankan di Termux (Android)
```bash
# 1. Install dependensi utama Termux
pkg update -y && pkg install -y nodejs-lts git curl openssh proot-distro

# 2. Set password (WAJIB — server menolak start tanpa ini)
export WEB_PASSWORD="$(openssl rand -base64 24)"
echo "Password kamu: $WEB_PASSWORD"

# 3. Build & Start ROCAgents
npm run build
npm start
# Server bind ke 127.0.0.1:3000 saja. Untuk akses dari perangkat lain,
# pakai Tailscale dan set HOST=<tailscale-ip> secara sadar.
```

---

# ⚡ ROCAgents — Unified Hermes AI Agent CLI & Local Web UI

<div align="center">

**Integrated Autonomous AI System combining Hermes Agent CLI and the Local DevAgent Orchestrator Web UI.**

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Version](https://img.shields.io/badge/Version-v5.20.0-brightgreen)](#)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.8-blue)](https://www.typescriptlang.org/)
[![React](https://img.shields.io/badge/React-19-61dafb)](https://react.dev/)

</div>

---

## 🌟 Features & Architecture

1. **⚡ Real-Time Tool Execution Logs**: Live terminal SSE feed dengan zero-buffering pada Termux, Linux, & OCI Cloud instances.
2. **🎲 Auto-Persona Roll**: Deteksi otomatis tipe instruksi (coding, kreatif, kasual, presisi) dan penyesuaian parameter generasi secara dinamis.
3. **🛠️ Anti-Fabrication Engine**: Seluruh eksekusi shell, pembacaan berkas, git status, dan HTTP request bersumber langsung dari hasil biner sistem tanpa fabrikasi.
4. **🔗 Dual-Environment Terminal Integration**: Dukungan penuh untuk lingkungan PRoot Ubuntu maupun Termux Native Shell.
