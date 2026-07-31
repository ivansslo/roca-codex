-- ============================================================
-- LANGKAH 1: Jalankan ini di Snowsight (login manual Anda),
-- dengan role ACCOUNTADMIN, SEBELUM PAT bisa dipakai dari luar.
-- ============================================================
USE ROLE ACCOUNTADMIN;

-- Buat network policy yang HANYA mengizinkan IP tertentu (mis. server
-- RocAgent Anda, atau IP tempat integrasi ini dites) mengakses lewat PAT.
-- GANTI '0.0.0.0' di bawah dengan IP publik server/perangkat Anda.
CREATE OR REPLACE NETWORK POLICY ROCAGENT_PAT_POLICY
  ALLOWED_IP_LIST = ('0.0.0.0')
  COMMENT = 'Akses PAT untuk integrasi Cortex Agent RocAgentInsight <-> RocAgent';

-- Terapkan policy KHUSUS ke user Anda (bukan ke seluruh akun),
-- supaya login normal dari perangkat lain tidak terpengaruh.
ALTER USER IVANSSLO SET NETWORK_POLICY = ROCAGENT_PAT_POLICY;

-- Verifikasi
SHOW NETWORK POLICIES;
DESC USER IVANSSLO;
