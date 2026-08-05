-- ============================================================
-- ROCAGENTINSIGHT — CORTEX AGENT
-- Agent cerdas untuk analisa data operasional RocAgent, dengan
-- akses ke semantic view ANALYTICS.ROCAGENT_OPS_SEMANTIC_VIEW
-- lewat Cortex Analyst tool.
-- ============================================================
USE DATABASE ROCAGENTINSIGHT_DB;
USE SCHEMA GOVERNANCE;

CREATE OR REPLACE AGENT GOVERNANCE.ROCAGENTINSIGHT
WITH PROFILE='{
  "display_name": "RocAgentInsight"
}'
COMMENT = 'Cortex Agent untuk analisa data operasional RocAgent: eksekusi tool, tingkat keberhasilan, aktivitas shell guard, dan tren pemakaian.'
FROM SPECIFICATION
$$
{
  "models": {
    "orchestration": "auto"
  },
  "instructions": {
    "response": "Jawab dalam Bahasa Indonesia kecuali diminta bahasa lain. Selalu dasarkan jawaban pada data yang benar-benar diambil dari semantic view ROCAGENT_OPS_SEMANTIC_VIEW -- jangan pernah mengarang angka. Jika data belum tersedia (tabel kosong), katakan dengan jujur bahwa belum ada data yang di-ingest, jangan berpura-pura punya hasil.",
    "orchestration": "Gunakan tool Cortex Analyst (rocagent_ops_analyst) untuk setiap pertanyaan tentang eksekusi tool, tingkat keberhasilan, command yang diblokir shell guard, durasi eksekusi, atau tren waktu. Jangan menjawab dari pengetahuan umum untuk pertanyaan tentang data RocAgent -- selalu query semantic view dulu.",
    "sample_questions": [
      {"question": "Berapa total eksekusi tool minggu ini?"},
      {"question": "Tool apa yang paling sering diblokir oleh shell guard?"},
      {"question": "Berapa tingkat keberhasilan (success rate) exec?"},
      {"question": "Tampilkan tren jumlah eksekusi per hari dalam 30 hari terakhir."}
    ]
  },
  "tools": [
    {
      "tool_spec": {
        "type": "cortex_analyst_text_to_sql",
        "name": "rocagent_ops_analyst",
        "description": "Analisa data operasional RocAgent (eksekusi tool, keberhasilan, shell guard, durasi) lewat semantic view ROCAGENT_OPS_SEMANTIC_VIEW."
      }
    }
  ],
  "tool_resources": {
    "rocagent_ops_analyst": {
      "semantic_view": "ROCAGENTINSIGHT_DB.ANALYTICS.ROCAGENT_OPS_SEMANTIC_VIEW",
      "execution_environment": {"type": "warehouse", "warehouse": "ROCAGENTINSIGHT_WH"}
    }
  }
}
$$;

SHOW AGENTS IN SCHEMA GOVERNANCE;
DESCRIBE AGENT GOVERNANCE.ROCAGENTINSIGHT;

-- Grant akses pakai agent ke role analyst
GRANT USAGE ON AGENT GOVERNANCE.ROCAGENTINSIGHT TO ROLE ROCAGENTINSIGHT_ANALYST;

-- ============================================================
-- CATATAN PENTING (dari pengalaman setup nyata):
-- tool_resources.execution_environment WAJIB berbentuk objek
-- {"type": "warehouse", "warehouse": "..."} -- BUKAN field
-- "warehouse" langsung di tool_resources. Tanpa ini, Agent
-- error saat run: "The Analyst tool ... is missing an execution
-- environment."
-- ============================================================
