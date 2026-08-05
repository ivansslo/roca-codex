-- ============================================================
-- ROCAGENTINSIGHT — TABEL FONDASI DATA OPERASIONAL ROCAGENT
-- Struktur ini mencerminkan db.json RocAgent (server/db.ts):
--   ExecutionLog { timestamp, toolName, args, result }
-- Ditambah tabel ringkasan untuk sesi/persona agar Cortex Agent
-- punya konteks bisnis, bukan cuma log mentah.
-- ============================================================

USE DATABASE ROCAGENTINSIGHT_DB;
USE SCHEMA RAW;

-- Staging: menerima data mentah dari export db.json RocAgent
-- (kolom VARIANT supaya fleksibel menampung JSON args/result apapun).
CREATE TABLE IF NOT EXISTS RAW.EXECUTION_LOG_RAW (
  LOG_ID            NUMBER AUTOINCREMENT START 1 INCREMENT 1,
  EVENT_TIME        TIMESTAMP_NTZ NOT NULL,
  TOOL_NAME         VARCHAR(200) NOT NULL,
  ARGS_JSON         VARIANT,
  RESULT_JSON       VARIANT,
  SOURCE_HOST       VARCHAR(200) COMMENT 'Hostname/device RocAgent yang menghasilkan log ini',
  INGESTED_AT       TIMESTAMP_NTZ DEFAULT CURRENT_TIMESTAMP(),
  PRIMARY KEY (LOG_ID)
)
COMMENT = 'Staging mentah dari db.json ExecutionLog RocAgent — belum dibersihkan/dimodelkan';

CREATE TABLE IF NOT EXISTS RAW.CHAT_SESSION_RAW (
  SESSION_ID        VARCHAR(200) NOT NULL,
  TITLE             VARCHAR(500),
  CREATED_AT        TIMESTAMP_NTZ,
  MESSAGE_COUNT     NUMBER,
  PERSONA_ID        VARCHAR(100),
  PROVIDER          VARCHAR(100),
  MODEL_ID          VARCHAR(200),
  INGESTED_AT       TIMESTAMP_NTZ DEFAULT CURRENT_TIMESTAMP(),
  PRIMARY KEY (SESSION_ID)
)
COMMENT = 'Staging mentah dari ChatSession RocAgent';

-- ---- ANALYTICS: tabel termodelkan untuk Cortex Agent ----
USE SCHEMA ANALYTICS;

CREATE TABLE IF NOT EXISTS ANALYTICS.FACT_TOOL_EXECUTION (
  EXECUTION_ID      NUMBER AUTOINCREMENT START 1 INCREMENT 1,
  EVENT_DATE        DATE NOT NULL,
  EVENT_TIMESTAMP   TIMESTAMP_NTZ NOT NULL,
  TOOL_NAME         VARCHAR(200) NOT NULL,
  IS_SUCCESS        BOOLEAN COMMENT 'TRUE bila result.status != error',
  IS_BLOCKED        BOOLEAN COMMENT 'TRUE bila diblokir commandGuard (result.blocked = true)',
  DURATION_MS       NUMBER,
  SOURCE_HOST       VARCHAR(200),
  PRIMARY KEY (EXECUTION_ID)
)
COMMENT = 'Fact table: setiap eksekusi tool RocAgent, dimodelkan untuk agregasi cepat';

CREATE TABLE IF NOT EXISTS ANALYTICS.DIM_TOOL (
  TOOL_NAME         VARCHAR(200) NOT NULL,
  TOOL_CATEGORY     VARCHAR(100) COMMENT 'mis. file, shell, git, http, ssh, model-cascading',
  IS_MUTATING       BOOLEAN COMMENT 'TRUE bila tool ini menulis/mengubah state (write/edit/delete/run_bash)',
  PRIMARY KEY (TOOL_NAME)
)
COMMENT = 'Dimensi: katalog tool RocAgent (list_project_files, exec, dst)';

CREATE TABLE IF NOT EXISTS ANALYTICS.DIM_DATE (
  DATE_KEY          DATE NOT NULL,
  YEAR              NUMBER,
  MONTH             NUMBER,
  DAY               NUMBER,
  DAY_OF_WEEK       VARCHAR(20),
  PRIMARY KEY (DATE_KEY)
)
COMMENT = 'Dimensi tanggal standar untuk agregasi time-series';

-- Isi dim_date otomatis untuk rentang 2 tahun ke belakang s.d. 1 tahun ke depan
INSERT INTO ANALYTICS.DIM_DATE (DATE_KEY, YEAR, MONTH, DAY, DAY_OF_WEEK)
SELECT d, YEAR(d), MONTH(d), DAY(d), DAYNAME(d)
FROM (
  SELECT DATEADD(day, seq4(), DATEADD(year, -2, CURRENT_DATE())) AS d
  FROM TABLE(GENERATOR(ROWCOUNT => 1095))
) gen
WHERE NOT EXISTS (SELECT 1 FROM ANALYTICS.DIM_DATE dd WHERE dd.DATE_KEY = gen.d);

-- Seed katalog tool RocAgent yang sudah diketahui (dari server/db.ts DEFAULT_SCHEMA.tools)
MERGE INTO ANALYTICS.DIM_TOOL AS tgt
USING (
  SELECT * FROM VALUES
    ('list_project_files', 'file', FALSE),
    ('read_project_file', 'file', FALSE),
    ('write_project_file', 'file', TRUE),
    ('edit_file', 'file', TRUE),
    ('edit_project_file', 'file', TRUE),
    ('delete_project_file', 'file', TRUE),
    ('exec', 'shell', TRUE),
    ('terminal_manager', 'shell', TRUE),
    ('search_codebase', 'file', FALSE),
    ('web_searching_module', 'network', FALSE),
    ('http_request', 'network', TRUE),
    ('ask_model', 'model-cascading', FALSE),
    ('query_snowflake_insight', 'analytics', FALSE),
    ('git', 'git', TRUE),
    ('ssh_run', 'shell', TRUE),
    ('manage_memory', 'memory', TRUE),
    ('self_develop_capability', 'meta', TRUE)
  AS s(TOOL_NAME, TOOL_CATEGORY, IS_MUTATING)
) AS src
ON tgt.TOOL_NAME = src.TOOL_NAME
WHEN NOT MATCHED THEN
  INSERT (TOOL_NAME, TOOL_CATEGORY, IS_MUTATING) VALUES (src.TOOL_NAME, src.TOOL_CATEGORY, src.IS_MUTATING);

-- Verifikasi
SELECT COUNT(*) AS dim_date_rows FROM ANALYTICS.DIM_DATE;
SELECT COUNT(*) AS dim_tool_rows FROM ANALYTICS.DIM_TOOL;
SHOW TABLES IN SCHEMA ANALYTICS;
SHOW TABLES IN SCHEMA RAW;
