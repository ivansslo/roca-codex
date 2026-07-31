# RocAgentInsight — Cortex Agent di Snowflake, terintegrasi ke RocAgent

Cortex Agent "RocAgentInsight" untuk analisa data operasional RocAgent
(execution logs, tool usage, success rate, aktivitas shell guard),
dibangun di atas Snowflake native Semantic View + Cortex Agent object.

## Struktur objek yang dibuat

| Objek | Nama | Keterangan |
|---|---|---|
| Role | `ROCAGENTINSIGHT_ADMIN` | Full control database/schema/warehouse RocAgentInsight |
| Role | `ROCAGENTINSIGHT_ANALYST` | Read-only + akses pakai Cortex Agent |
| Warehouse | `ROCAGENTINSIGHT_WH` | X-Small, auto-suspend 60s, auto-resume |
| Database | `ROCAGENTINSIGHT_DB` | Fondasi seluruh objek |
| Schema | `RAW` | Staging data mentah (`EXECUTION_LOG_RAW`, `CHAT_SESSION_RAW`) |
| Schema | `ANALYTICS` | Data termodelkan (`FACT_TOOL_EXECUTION`, `DIM_TOOL`, `DIM_DATE`) |
| Schema | `GOVERNANCE` | Semantic model & Cortex Agent |
| Semantic View | `ANALYTICS.ROCAGENT_OPS_SEMANTIC_VIEW` | Fondasi Cortex Analyst — tabel, relasi, dimensi, metrik |
| Cortex Agent | `GOVERNANCE.ROCAGENTINSIGHT` | Agent siap pakai, teruji live |
| Table | `GOVERNANCE.AGENT_MEMORY` | Memori key/value lintas-sesi milik agent (lihat bagian "Memori lintas-sesi" di bawah) |

Jalankan file `00` sampai `05` **berurutan** di Snowsight (atau lewat konektor
apa pun dengan role `ACCOUNTADMIN`/`ORGADMIN` sesuai kebutuhan tiap file).

## Cara pakai agent langsung (tanpa RocAgent)

```bash
curl -s -X POST \
  "https://<account>.snowflakecomputing.com/api/v2/databases/ROCAGENTINSIGHT_DB/schemas/GOVERNANCE/agents/ROCAGENTINSIGHT:run" \
  -H "Authorization: Bearer $SNOWFLAKE_PAT" \
  -H "Content-Type: application/json" \
  -H "X-Snowflake-Authorization-Token-Type: PROGRAMMATIC_ACCESS_TOKEN" \
  -d '{"messages":[{"role":"user","content":[{"type":"text","text":"Berapa total eksekusi tool minggu ini?"}]}]}'
```

Atau lewat Snowsight: **AI & ML → Agents → RocAgentInsight**.

## Integrasi ke RocAgent — tool `query_snowflake_insight`

RocAgent sekarang punya tool baru (`server/tools.ts` + terdaftar di
`server/db.ts`) yang memanggil Cortex Agent ini secara langsung, sehingga
setiap role di Agent Multi (Scout, Architect, dsb) bisa bertanya data
operasional lewat bahasa natural.

**Konfigurasi** — tambahkan ke `~/.config/rocagent/cloud.env` (bukan
`app.env`, sesuai prinsip pemisahan kredensial RocAgent):

```bash
SNOWFLAKE_ACCOUNT=<account-identifier>          # mis. xy12345.ap-southeast-3.aws
SNOWFLAKE_USER=<username>
SNOWFLAKE_PAT=<programmatic-access-token>       # atau SNOWFLAKE_KEY (alias yang sama)

# Opsional — default sudah mengarah ke RocAgentInsight:
SNOWFLAKE_INSIGHT_DB=ROCAGENTINSIGHT_DB
SNOWFLAKE_INSIGHT_SCHEMA=GOVERNANCE
SNOWFLAKE_INSIGHT_AGENT=ROCAGENTINSIGHT
```

Lalu jalankan seperti biasa:
```bash
rocvault run ~/.config/rocagent/app.env.vault ~/.config/rocagent/cloud.env.vault -- npm start
```

**Contoh pemakaian** — tanya RocAgent di chat/CLI:
> "Tanyakan ke Snowflake: berapa total eksekusi tool minggu ini?"

RocAgent akan memanggil `query_snowflake_insight`, yang mem-POST ke endpoint
`api/v2/.../agents/ROCAGENTINSIGHT:run`, mem-parse SSE response Cortex Agent,
dan mengembalikan jawaban bersih (bukan raw SSE) ke model — lengkap dengan
daftar tool internal yang dipakai Cortex Agent (`tools_used`) untuk transparansi.

**Diverifikasi nyata** (bukan cuma typecheck): tool ini dipanggil langsung dari
dalam proses RocAgent dan benar-benar menerima jawaban dari Cortex Agent di
Snowflake, termasuk jawaban jujur saat tabel `FACT_TOOL_EXECUTION` masih kosong.

## Memori lintas-sesi ("Ingat preferensi saya")

Sebelumnya, RocAgentInsight jujur melaporkan tidak punya cara mengingat
preferensi owner antar sesi chat terpisah (baik dari `ai.snowflake.com`
maupun lewat `query_snowflake_insight`) — hanya konteks dalam satu sesi
yang berjalan yang diingat. `06_agent_memory.sql` menambah kemampuan nyata
untuk ini:

- Tabel `GOVERNANCE.AGENT_MEMORY` — satu baris per key preferensi (bukan log
  percakapan mentah).
- Tiga stored procedure yang di-wire sebagai *custom tool* (`type: generic`)
  ke agent: `SAVE_AGENT_MEMORY` (upsert), `GET_AGENT_MEMORY` (baca semua
  sebagai JSON), `FORGET_AGENT_MEMORY` (hapus satu key) — dipanggil agent
  sendiri sebagai `save_preference` / `get_preferences` / `forget_preference`.
- Karena tool ini melekat pada objek agent itu sendiri (bukan fitur sisi
  RocAgent), memori yang sama terlihat baik saat dipanggil dari RocAgent
  maupun langsung dari Snowsight/`ai.snowflake.com` — keduanya
  mengautentikasi sebagai user Snowflake yang sama.

**Diverifikasi live** (bukan cuma baca SQL): dipanggil 3x berturut-turut
lewat HTTP request terpisah (setara sesi chat baru tiap kali) —
`save_preference` menyimpan 2 preferensi, `get_preferences` di panggilan
terpisah berikutnya berhasil membacanya kembali, `forget_preference`
menghapus satu key sambil membiarkan key lainnya utuh. Data uji dibersihkan
setelahnya; `AGENT_MEMORY` production kosong dan siap dipakai owner.

Jalankan `06_agent_memory.sql` dengan role `ROCAGENTINSIGHT_ADMIN` untuk
tabel/procedure, lalu bagian `CREATE OR REPLACE AGENT` di file yang sama
butuh privilege `MODIFY` atas agent — kalau agent sebelumnya dibuat dengan
`ACCOUNTADMIN` tanpa transfer ownership, jalankan dulu:
```sql
GRANT OWNERSHIP ON AGENT ROCAGENTINSIGHT_DB.GOVERNANCE.ROCAGENTINSIGHT
  TO ROLE ROCAGENTINSIGHT_ADMIN COPY CURRENT GRANTS;
```

## Troubleshooting

**"Snowflake Cortex Agent HTTP ..." atau tool gagal / model melaporkan "kesalahan konektivitas"**

Cek berurutan (ini yang paling sering jadi penyebab, berdasarkan insiden nyata):

1. **PAT sudah di-revoke/rotasi tapi `cloud.env` belum diperbarui.** Error dari
   Snowflake akan berubah dari `Network policy is required` menjadi
   `Programmatic access token is invalid` — ini konfirmasi PAT lama mati.
   Buat PAT baru di Snowsight, update `SNOWFLAKE_PAT` di
   `~/.config/rocagent/cloud.env`, lalu `rocvault lock` ulang dan restart
   RocAgent.
2. **Network Policy memblokir IP server RocAgent.** Error:
   `Network policy is required` atau `IP address is not allowed`. Jalankan
   `00_network_policy.sql` dengan IP publik server RocAgent Anda yang
   sesungguhnya (bukan IP sandbox/pihak ketiga mana pun yang dipakai saat
   setup awal).
3. **Cek cepat dari mana pun** (tidak perlu lewat RocAgent) apakah PAT +
   network policy sudah benar:
   ```bash
   curl -s -X POST \
     "https://<account>.snowflakecomputing.com/api/v2/databases/ROCAGENTINSIGHT_DB/schemas/GOVERNANCE/agents/ROCAGENTINSIGHT:run" \
     -H "Authorization: Bearer $SNOWFLAKE_PAT" \
     -H "Content-Type: application/json" \
     -H "X-Snowflake-Authorization-Token-Type: PROGRAMMATIC_ACCESS_TOKEN" \
     -d '{"messages":[{"role":"user","content":[{"type":"text","text":"test"}]}]}'
   ```
   Kalau ini gagal, masalahnya murni di sisi Snowflake (token/network policy),
   bukan di kode RocAgent.

## Yang BELUM dilakukan (butuh keputusan/aksi Anda)

1. **Data operasional masih kosong.** `FACT_TOOL_EXECUTION` sengaja dibuat
   sebagai fondasi kosong. Untuk mengisi data nyata: ekspor `db.json`
   (execution logs) RocAgent → load ke `RAW.EXECUTION_LOG_RAW` → transform ke
   `ANALYTICS.FACT_TOOL_EXECUTION`. Bisa dibuatkan skrip loader terpisah
   (mis. tool baru `sync_snowflake_logs` atau Task terjadwal) kalau diperlukan.

2. **Network Policy PAT** — pastikan `ALLOWED_IP_LIST` di `00_network_policy.sql`
   mengarah ke IP server RocAgent Anda yang sesungguhnya (bukan IP sandbox
   mana pun yang dipakai saat setup), supaya PAT tetap bisa dipakai dari
   server produksi setelah bypass sementara berakhir.

3. **Business Continuity & DR** — akun harus Business Critical Edition+ untuk
   Failover Group otomatis. Kalau akun Anda Enterprise (atau lebih rendah),
   pakai Database Replication manual di `05_business_continuity_dr.sql`
   (perlu akun sekunder + role ORGADMIN, keduanya belum tersedia/dieksekusi
   saat file ini ditulis).

## File di folder ini

- `00_network_policy.sql` — wajib dijalankan duluan agar PAT bisa dipakai
- `01_foundation.sql` — role, warehouse, database, schema
- `02_tables.sql` — tabel RAW & ANALYTICS + seed `DIM_TOOL`/`DIM_DATE`
- `03_semantic_view.sql` — semantic view untuk Cortex Analyst
- `04_cortex_agent.sql` — definisi awal Cortex Agent RocAgentInsight (hanya tool Cortex Analyst)
- `05_business_continuity_dr.sql` — panduan DR manual + contoh Failover Group masa depan
- `06_agent_memory.sql` — tabel + 3 stored procedure memori key/value lintas-sesi, di-wire sebagai custom tool tambahan pada agent yang sama (superset dari `04`, jalankan setelahnya)
