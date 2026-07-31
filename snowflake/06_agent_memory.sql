-- ============================================================
-- ROCAGENTINSIGHT — CROSS-SESSION AGENT MEMORY
-- ============================================================
-- Problem this solves: when the owner talks to RocAgentInsight directly
-- at ai.snowflake.com (Snowflake Intelligence), the agent honestly reports
-- it has no built-in way to remember preferences across separate chat
-- sessions — Cortex Agents only carry context within a single running
-- conversation. This adds a real, persistent memory store the agent can
-- read from and write to itself, via two "generic" custom tools backed by
-- stored procedures (Snowflake's documented pattern — see
-- https://docs.snowflake.com/en/user-guide/snowflake-cortex/cortex-agents-manage,
-- "Custom tools: Provide the stored procedure ... along with the warehouse
-- used to run it").
--
-- This does NOT change how query_snowflake_insight is called from RocAgent
-- (server/tools.ts) — it is additive. Both the RocAgent-invoked agent run
-- and a human talking to the same agent directly in Snowflake Intelligence
-- share the exact same memory store, because it is the agent object itself
-- that gained the new tools, not a RocAgent-side feature.
-- ============================================================
USE ROLE ROCAGENTINSIGHT_ADMIN;
USE DATABASE ROCAGENTINSIGHT_DB;
USE SCHEMA GOVERNANCE;

-- ---- 1. Storage table ----
-- One row per (memory key). Upserted by SAVE_AGENT_MEMORY, so there is
-- never more than one live value per key — this is a key/value store, not
-- an append-only log. UPDATED_BY records the Snowflake session user that
-- wrote it (the PAT's user, i.e. IVANSSLO for both RocAgent-driven calls
-- and direct Snowflake Intelligence chats, since both authenticate as the
-- same account user).
CREATE TABLE IF NOT EXISTS GOVERNANCE.AGENT_MEMORY (
  MEMORY_KEY    VARCHAR(200)     NOT NULL,
  MEMORY_VALUE  VARCHAR(16384)   NOT NULL,
  UPDATED_AT    TIMESTAMP_LTZ    NOT NULL DEFAULT CURRENT_TIMESTAMP(),
  UPDATED_BY    VARCHAR(200)     NOT NULL DEFAULT CURRENT_USER(),
  CONSTRAINT PK_AGENT_MEMORY PRIMARY KEY (MEMORY_KEY)
)
COMMENT = 'Cross-session key/value memory for the RocAgentInsight Cortex Agent, read/written by the agent itself via the save_preference / get_preferences / forget_preference tools. Not an execution log — one live row per key.';

-- ---- 2. SAVE — upsert a single preference ----
CREATE OR REPLACE PROCEDURE GOVERNANCE.SAVE_AGENT_MEMORY(KEY VARCHAR, VALUE VARCHAR)
RETURNS VARCHAR
LANGUAGE SQL
COMMENT = 'Upsert one memory key/value pair for RocAgentInsight. Called by the agent''s save_preference tool.'
AS
$$
BEGIN
  MERGE INTO GOVERNANCE.AGENT_MEMORY AS tgt
  USING (SELECT :KEY AS MEMORY_KEY, :VALUE AS MEMORY_VALUE) AS src
  ON tgt.MEMORY_KEY = src.MEMORY_KEY
  WHEN MATCHED THEN UPDATE SET
    MEMORY_VALUE = src.MEMORY_VALUE,
    UPDATED_AT = CURRENT_TIMESTAMP(),
    UPDATED_BY = CURRENT_USER()
  WHEN NOT MATCHED THEN INSERT (MEMORY_KEY, MEMORY_VALUE, UPDATED_AT, UPDATED_BY)
    VALUES (src.MEMORY_KEY, src.MEMORY_VALUE, CURRENT_TIMESTAMP(), CURRENT_USER());
  RETURN 'saved: ' || :KEY;
END;
$$;

-- ---- 3. GET — return every stored preference as a JSON object ----
-- Returns a JSON string (not a table) so a "generic" tool_spec with a
-- plain string return type can be used directly by the agent without an
-- extra parsing step.
CREATE OR REPLACE PROCEDURE GOVERNANCE.GET_AGENT_MEMORY()
RETURNS VARCHAR
LANGUAGE SQL
COMMENT = 'Return every stored RocAgentInsight memory key/value pair as a JSON object. Called by the agent''s get_preferences tool.'
AS
$$
DECLARE
  result VARCHAR;
BEGIN
  SELECT OBJECT_AGG(MEMORY_KEY, MEMORY_VALUE::VARIANT)::VARCHAR INTO :result
  FROM GOVERNANCE.AGENT_MEMORY;
  RETURN COALESCE(:result, '{}');
END;
$$;

-- ---- 4. FORGET — remove a single preference ----
CREATE OR REPLACE PROCEDURE GOVERNANCE.FORGET_AGENT_MEMORY(KEY VARCHAR)
RETURNS VARCHAR
LANGUAGE SQL
COMMENT = 'Delete one memory key for RocAgentInsight, if present. Called by the agent''s forget_preference tool.'
AS
$$
BEGIN
  DELETE FROM GOVERNANCE.AGENT_MEMORY WHERE MEMORY_KEY = :KEY;
  RETURN 'forgotten: ' || :KEY;
END;
$$;

GRANT USAGE ON PROCEDURE GOVERNANCE.SAVE_AGENT_MEMORY(VARCHAR, VARCHAR) TO ROLE ROCAGENTINSIGHT_ANALYST;
GRANT USAGE ON PROCEDURE GOVERNANCE.GET_AGENT_MEMORY() TO ROLE ROCAGENTINSIGHT_ANALYST;
GRANT USAGE ON PROCEDURE GOVERNANCE.FORGET_AGENT_MEMORY(VARCHAR) TO ROLE ROCAGENTINSIGHT_ANALYST;
GRANT SELECT ON TABLE GOVERNANCE.AGENT_MEMORY TO ROLE ROCAGENTINSIGHT_ANALYST;

-- ---- 5. Wire the tools into the RocAgentInsight agent ----
-- CREATE OR REPLACE AGENT with the FULL spec (Snowflake note: "The new
-- specification completely replaces the existing one" for ALTER ... MODIFY
-- LIVE VERSION SET SPECIFICATION — CREATE OR REPLACE AGENT has the same
-- property, so this restates the rocagent_ops_analyst tool from
-- 04_cortex_agent.sql unchanged and adds three new generic/procedure tools
-- alongside it).
USE DATABASE ROCAGENTINSIGHT_DB;
USE SCHEMA GOVERNANCE;

CREATE OR REPLACE AGENT GOVERNANCE.ROCAGENTINSIGHT
WITH PROFILE='{
  "display_name": "RocAgentInsight"
}'
COMMENT = 'Cortex Agent untuk analisa data operasional RocAgent (eksekusi tool, tingkat keberhasilan, shell guard, tren pemakaian) dan penyimpanan preferensi lintas-sesi milik owner.'
FROM SPECIFICATION
$$
{
  "models": {
    "orchestration": "auto"
  },
  "instructions": {
    "response": "Jawab dalam Bahasa Indonesia kecuali diminta bahasa lain. Selalu dasarkan jawaban data pada hasil nyata dari semantic view ROCAGENT_OPS_SEMANTIC_VIEW -- jangan pernah mengarang angka. Jika data belum tersedia (tabel kosong), katakan dengan jujur bahwa belum ada data yang di-ingest.",
    "orchestration": "Gunakan tool Cortex Analyst (rocagent_ops_analyst) untuk pertanyaan tentang eksekusi tool, tingkat keberhasilan, command yang diblokir shell guard, durasi eksekusi, atau tren waktu. Gunakan get_preferences di AWAL setiap percakapan baru untuk memuat preferensi yang pernah disimpan owner sebelumnya (format jawaban, metrik favorit, bahasa, dsb) dan terapkan sepanjang sesi ini tanpa diminta ulang. Gunakan save_preference ketika owner secara eksplisit meminta sesuatu diingat untuk sesi-sesi berikutnya. Gunakan forget_preference ketika owner meminta suatu preferensi dihapus. Jangan mengarang isi memori -- selalu panggil get_preferences untuk membacanya, jangan menebak dari percakapan sebelumnya di sesi lain.",
    "sample_questions": [
      {"question": "Berapa total eksekusi tool minggu ini?"},
      {"question": "Tool apa yang paling sering diblokir oleh shell guard?"},
      {"question": "Ingat: saya selalu mau jawaban dalam format ringkas dengan bullet point."},
      {"question": "Apa saja preferensi yang sudah kamu ingat tentang saya?"}
    ]
  },
  "tools": [
    {
      "tool_spec": {
        "type": "cortex_analyst_text_to_sql",
        "name": "rocagent_ops_analyst",
        "description": "Analisa data operasional RocAgent (eksekusi tool, keberhasilan, shell guard, durasi) lewat semantic view ROCAGENT_OPS_SEMANTIC_VIEW."
      }
    },
    {
      "tool_spec": {
        "type": "generic",
        "name": "save_preference",
        "description": "Simpan satu preferensi owner secara permanen lintas-sesi (mis. format jawaban, metrik favorit, bahasa). Panggil ini HANYA ketika owner secara eksplisit meminta sesuatu diingat.",
        "input_schema": {
          "type": "object",
          "properties": {
            "key": {"type": "string", "description": "Nama singkat preferensi, mis. 'format_jawaban' atau 'bahasa'."},
            "value": {"type": "string", "description": "Isi preferensi yang harus diingat."}
          },
          "required": ["key", "value"]
        }
      }
    },
    {
      "tool_spec": {
        "type": "generic",
        "name": "get_preferences",
        "description": "Ambil SEMUA preferensi owner yang pernah disimpan, sebagai objek JSON key/value. Panggil ini di awal percakapan baru untuk memuat preferensi lama, jangan menebak dari ingatan sesi lain."
      }
    },
    {
      "tool_spec": {
        "type": "generic",
        "name": "forget_preference",
        "description": "Hapus satu preferensi owner berdasarkan nama key-nya. Panggil ini ketika owner meminta suatu preferensi dihapus/dilupakan.",
        "input_schema": {
          "type": "object",
          "properties": {
            "key": {"type": "string", "description": "Nama preferensi yang akan dihapus."}
          },
          "required": ["key"]
        }
      }
    }
  ],
  "tool_resources": {
    "rocagent_ops_analyst": {
      "semantic_view": "ROCAGENTINSIGHT_DB.ANALYTICS.ROCAGENT_OPS_SEMANTIC_VIEW",
      "execution_environment": {"type": "warehouse", "warehouse": "ROCAGENTINSIGHT_WH"}
    },
    "save_preference": {
      "identifier": "ROCAGENTINSIGHT_DB.GOVERNANCE.SAVE_AGENT_MEMORY",
      "type": "procedure",
      "execution_environment": {"type": "warehouse", "warehouse": "ROCAGENTINSIGHT_WH"}
    },
    "get_preferences": {
      "identifier": "ROCAGENTINSIGHT_DB.GOVERNANCE.GET_AGENT_MEMORY",
      "type": "procedure",
      "execution_environment": {"type": "warehouse", "warehouse": "ROCAGENTINSIGHT_WH"}
    },
    "forget_preference": {
      "identifier": "ROCAGENTINSIGHT_DB.GOVERNANCE.FORGET_AGENT_MEMORY",
      "type": "procedure",
      "execution_environment": {"type": "warehouse", "warehouse": "ROCAGENTINSIGHT_WH"}
    }
  }
}
$$;

SHOW AGENTS IN SCHEMA GOVERNANCE;
DESCRIBE AGENT GOVERNANCE.ROCAGENTINSIGHT;

-- ============================================================
-- CATATAN
--  - Memori ini DISENGAJA sederhana (satu tabel key/value, bukan riwayat
--    percakapan penuh) -- agent tidak dan tidak seharusnya menyimpan
--    transkrip chat mentah, hanya preferensi eksplisit yang owner minta
--    diingat.
--  - Baik dipanggil dari RocAgent (query_snowflake_insight -> agent run)
--    maupun langsung dari ai.snowflake.com, agent yang sama dan tabel
--    memori yang sama dipakai -- preferensi yang disimpan lewat satu jalur
--    langsung terlihat lewat jalur lainnya.
--  - RocAgent sendiri (server/tools.ts) tidak diubah untuk fitur ini --
--    seluruh logika memori hidup di sisi Snowflake sebagai kemampuan baru
--    agent itu sendiri, bukan fitur RocAgent yang terpisah.
-- ============================================================
