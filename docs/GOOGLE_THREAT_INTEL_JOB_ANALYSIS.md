# Senior Analyst, Google Threat Intelligence, Mandiant (Bahasa) — Deep Dive

> Owner: Ivan Ssl (ivansslo) — Applied: 2026-07-22 — Location: Jakarta (Hybrid 3 days onsite client-facing) — Remote eligible Indonesia

## TL;DR
Role CTI analyst di organisasi **Google Threat Intelligence / Mandiant** fokus **Indonesia/SEA scam/fraud/phishing infrastructure mapping**, konsumsi & analisis CTI operational, hunting, detection, takedown, dan komunikasi Bahasa Indonesia + English ke stakeholder teknis & eksekutif.

## Snapshot dari screenshot kamu

**Title:** Senior Analyst, Google Threat Intelligence, Mandiant (Bahasa)
**Company:** Google
**Location:** Indonesia, Remote eligible, Mid
**Note hybrid:** Based in Jakarta office but requires regular onsite client-facing at designated client location in Jakarta (currently 3 days/week). Note: Google hybrid workplace.

### Minimum Qualifications (wajib)
- Bachelor's degree or equivalent practical experience.
- 5 years experience in data analytics, cybersecurity, technology research, anti-abuse, policy, or related.
- Experience identifying, tracking, or mapping illicit scam infrastructure to centralized threat actor groups.
- Experience with consumption, processing, or analysis of Cyber Threat Intelligence (CTI) within operational environment, supporting monitoring, detection, or response.
- Ability to communicate in Bahasa Indonesia fluently to support regional threat intelligence efforts.

### Preferred Qualifications
- 8 years experience (same domains)
- Analyzing network, endpoint, security logs/telemetry for security investigations & threat hunting
- Engaging & presenting to technical stakeholders + executive leaders (verbal + report writing)
- Deploying AI-driven threat hunting and high-volume takedown strategies

## What You'll Actually Do (day-to-day mapping)

1. **Scam Infra Mapping**
   - Kumpulkan domain/IP/ASN/hosting provider/payment gateway signals, Telegram/WhatsApp channel, fake APK, social media accounts → cluster ke actor group.
   - Gunakan `rocspace` → Cloudflare Workers gateway logs + R2 analytics + Tailscale mesh isolated investigation (Aperture) — sesuai screenshot Aperture tadi!
   - Tools: Passive DNS, WHOIS, SSL cert transparency, URLScan, VirusTotal, Shodan, etc.

2. **CTI Consumption & Operationalization**
   - Konsumsi CTI feeds (Google TI, Mandiant, open-source) → processing via `rocagents` AuroRa-40 memory engine + Neon Postgres vector store → buat detection rules, hunting hypotheses.
   - Support monitoring/detection/response: tulis YARA, Sigma, Snort/Suricata rules.

3. **Telemetry & Log Analysis**
   - Analyze network, endpoint, security logs (EDR, proxy, DNS, email gateway) — cari pattern scam. Ini nyambung ke `lsmod` kernel analyzer + Grafana Loki/Prometheus dash kamu.
   - Tulis timeline investigation.

4. **Client-Facing & Reporting**
   - 3 hari onsite di client Jakarta (bank/fintech/telco/gov?). Presentasi Bahasa Indonesia + English.
   - Report struktur Mandiant style: Executive Summary, Threat Overview, Infrastructure Mapping, TTPs (MITRE ATT&CK), Impact, Recommendations, IoCs.

5. **AI-driven Threat Hunting & Takedown**
   - Deploy AI untuk hunting at scale: `rocagents` orchestrator (Groq + Gemini + RoadQwen + OCI local model) bisa jadi hunting LLM.
   - High-volume takedown: abuse report ke registrar/hosting, Cloudflare abuse, Google Safe Browsing, brand protection.

## Why You Are Strong Fit — Mapping to Your Ecosystem

| Job Requirement | Your Project Evidence |
|---|---|
| Identify/track/map illicit scam infra | `rocspace` 14 domains router, gateway telemetry, abuse detection logs |
| CTI consumption/processing/analysis | `rocagents` AuroRa Quad (RoC + x + Fun + 40 Honcho memory) + Neon Vector + db.json memories |
| Network/endpoint/log/telemetry | Grafana OAuth, Loki logs, Prometheus metrics, `lsmod` kernel driver analyzer v11.55.430 |
| Anti-abuse automation | Cloudflare Workers, R2, hermes-cloudflare, termux-rocd auto DNS repair |
| AI-driven hunting & takedown | Orchestrator provider failover (Groq, Gemini, OpenRouter, RoadQwen, OCI), backboard AI, n8n automation |
| Bahasa Indonesia fluent | Native speaker, you can write laporan bilingual |
| Present to tech & exec | Portfolio ivanssl.pro, 106+ GitHub repos, dashboard SyncHub |

## Interview Prep (STAR)

Siapkan 3 case study:

**Case 1 — Scam Infra Mapping:**
S: Detected 200 domains fake bank BRI using same favicon/cert.
T: Cluster to 1 actor group.
A: Collected WHOIS, SSL, passive DNS, Telegram scraping via crawl4ai, mapped ASN, built graph.
R: Takedown 80% within 72h, report to client.

**Case 2 — Log/Telemetry Hunting:**
S: Proxy logs show outbound to 100.93.139.73:11434 anomaly.
T: Threat hunting lateral movement.
A: Correlate endpoint logs, Tailscale mesh logs, Loki queries, create Sigma rule.
R: Detected C2, contained, reduced dwell time.

**Case 3 — AI-driven Takedown at Scale:**
S: Need high-volume phishing takedown 1000+ URLs/day.
A: Built `rocagents` tool `isochrones_threat_geo_mapper` + Cloudflare Worker abuse submit automation + n8n Zapier MCP.
R: 90% automation, 10x faster than manual.

## 30/60/90 Plan

- **30 days:** Onboard Mandiant CTI platform, learn Jakarta client infra, audit existing scam clusters, setup local Tailscale lab.
- **60 days:** Deliver first Indonesia threat landscape report (Bahasa), deploy 3 Sigma/YARA rules, start takedown pipeline.
- **90 days:** Lead client onsite, present exec briefing, AI hunting POC with Gemini + OCI model, mentor junior analysts.

## Resume yang sudah dibuat

File: `Ivan_Ssl_Senior_Threat_Intelligence_Analyst_Google.pdf` (2 pages) — tailored, sudah present_file sebelumnya.

## Next Action

- Siapkan portfolio link: https://ivanssl.pro + https://github.com/ivansslo + https://hub.roadfx.biz.id
- Update LinkedIn headline: "Threat Intel | AI-Driven Hunting & Anti-Abuse | RocSpace Platform"
- Keep Aperture + Tailscale setup as demo: you can show secure isolated investigation browser via Aperture roadfx (screenshot pertama tadi).

---

For Google recruiter search: this role reports into Google Threat Intelligence Mandiant — CTI Analyst Indonesia Bahasa — scam fraud phishing infrastructure mapping.
