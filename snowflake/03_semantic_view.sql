-- ============================================================
-- ROCAGENTINSIGHT — SEMANTIC VIEW (fondasi Cortex Analyst/Agent)
-- ============================================================
USE DATABASE ROCAGENTINSIGHT_DB;
USE SCHEMA ANALYTICS;

CREATE OR REPLACE SEMANTIC VIEW ANALYTICS.ROCAGENT_OPS_SEMANTIC_VIEW
  TABLES (
    EXEC AS FACT_TOOL_EXECUTION PRIMARY KEY (EXECUTION_ID)
      WITH SYNONYMS ('tool executions', 'agent runs', 'execution log')
      COMMENT = 'Setiap kali RocAgent menjalankan satu tool (run_bash_command, write_project_file, dll)',
    TOOL AS DIM_TOOL PRIMARY KEY (TOOL_NAME)
      WITH SYNONYMS ('tools', 'agent tools', 'capabilities')
      COMMENT = 'Katalog tool yang tersedia bagi RocAgent',
    DATE_DIM AS DIM_DATE PRIMARY KEY (DATE_KEY)
      WITH SYNONYMS ('dates', 'calendar')
      COMMENT = 'Dimensi tanggal'
  )
  RELATIONSHIPS (
    EXEC_TO_TOOL AS EXEC (TOOL_NAME) REFERENCES TOOL (TOOL_NAME),
    EXEC_TO_DATE AS EXEC (EVENT_DATE) REFERENCES DATE_DIM (DATE_KEY)
  )
  FACTS (
    EXEC.DURATION_MS AS DURATION_MS COMMENT = 'Durasi eksekusi tool dalam milidetik'
  )
  DIMENSIONS (
    EXEC.TOOL_NAME AS TOOL_NAME WITH SYNONYMS ('tool', 'nama tool') COMMENT = 'Nama tool yang dijalankan',
    EXEC.SOURCE_HOST AS SOURCE_HOST WITH SYNONYMS ('device', 'host') COMMENT = 'Device/host RocAgent yang menjalankan',
    EXEC.IS_SUCCESS AS IS_SUCCESS WITH SYNONYMS ('success', 'berhasil') COMMENT = 'Apakah eksekusi tool berhasil (tidak error)',
    EXEC.IS_BLOCKED AS IS_BLOCKED WITH SYNONYMS ('blocked', 'diblokir') COMMENT = 'Apakah command diblokir oleh commandGuard (shell guard)',
    TOOL.TOOL_CATEGORY AS TOOL_CATEGORY WITH SYNONYMS ('kategori tool', 'category') COMMENT = 'Kategori tool: file, shell, git, network, model-cascading, dst',
    TOOL.IS_MUTATING AS IS_MUTATING WITH SYNONYMS ('mutating', 'mengubah state') COMMENT = 'Apakah tool ini menulis/mengubah state (write/edit/delete/shell)',
    DATE_DIM.DAY_OF_WEEK AS DAY_OF_WEEK COMMENT = 'Hari dalam minggu'
  )
  METRICS (
    EXEC.TOTAL_EXECUTIONS AS COUNT(EXEC.EXECUTION_ID) WITH SYNONYMS ('total eksekusi', 'jumlah run') COMMENT = 'Total jumlah eksekusi tool',
    EXEC.SUCCESS_RATE AS AVG(CASE WHEN EXEC.IS_SUCCESS THEN 1.0 ELSE 0.0 END) WITH SYNONYMS ('tingkat keberhasilan') COMMENT = 'Persentase eksekusi tool yang berhasil (0-1)',
    EXEC.BLOCKED_COUNT AS SUM(CASE WHEN EXEC.IS_BLOCKED THEN 1 ELSE 0 END) WITH SYNONYMS ('jumlah diblokir') COMMENT = 'Jumlah command yang diblokir shell guard',
    EXEC.AVG_DURATION_MS AS AVG(EXEC.DURATION_MS) WITH SYNONYMS ('rata-rata durasi') COMMENT = 'Rata-rata durasi eksekusi tool (ms)'
  )
  COMMENT = 'Semantic model operasional RocAgent — dipakai Cortex Agent RocAgentInsight untuk menjawab pertanyaan natural language tentang eksekusi tool, tingkat keberhasilan, dan aktivitas shell guard';

SHOW SEMANTIC VIEWS IN SCHEMA ANALYTICS;
DESCRIBE SEMANTIC VIEW ANALYTICS.ROCAGENT_OPS_SEMANTIC_VIEW;
