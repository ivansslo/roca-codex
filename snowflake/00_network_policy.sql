-- ============================================================
-- NETWORK POLICY untuk PAT RocAgentInsight
-- ============================================================
-- Referensi resmi: https://docs.snowflake.com/en/user-guide/network-policies
--
-- CATATAN: ALLOWED_IP_LIST langsung di CREATE NETWORK POLICY (versi di
-- bawah) MASIH BERFUNGSI, tapi Snowflake merekomendasikan Network Rules
-- untuk policy BARU (lebih mudah dikelola: satu rule per grup, bisa
-- dipakai ulang, ada COMMENT per rule). Dua opsi disediakan -- pilih salah
-- satu, jangan campur ALLOWED_IP_LIST dan ALLOWED_NETWORK_RULE_LIST di
-- policy yang sama.
-- ============================================================

USE ROLE ACCOUNTADMIN;

-- ---- OPSI A (legacy, tetap didukung): ALLOWED_IP_LIST langsung ----
-- Cukup untuk kasus sederhana (satu server RocAgent, IP publik statis).
-- GANTI 'IP_SERVER_ROCAGENT_ANDA' dengan IP publik server RocAgent Anda
-- yang sesungguhnya (bukan IP dinamis/sandbox pihak ketiga).
CREATE OR REPLACE NETWORK POLICY ROCAGENT_PAT_POLICY
  ALLOWED_IP_LIST = ('IP_SERVER_ROCAGENT_ANDA')
  COMMENT = 'Akses PAT untuk integrasi Cortex Agent RocAgentInsight <-> RocAgent';

-- ---- OPSI B (direkomendasikan Snowflake untuk policy baru): Network Rules ----
-- Lebih rapi kalau IP server berubah-ubah (mis. dynamic IP residential/mobile)
-- atau Anda ingin menambah IP tambahan nanti tanpa CREATE OR REPLACE ulang.
--
-- CREATE NETWORK RULE ROCAGENT_ALLOWED_IPS
--   MODE = INGRESS
--   TYPE = IPV4
--   VALUE_LIST = ('IP_SERVER_ROCAGENT_ANDA')
--   COMMENT = 'IP server RocAgent yang boleh memakai PAT RocAgentInsight';
--
-- CREATE NETWORK POLICY ROCAGENT_PAT_POLICY
--   ALLOWED_NETWORK_RULE_LIST = ('ROCAGENT_ALLOWED_IPS')
--   COMMENT = 'Akses PAT untuk integrasi Cortex Agent RocAgentInsight <-> RocAgent';

-- Terapkan policy KHUSUS ke user Anda (bukan ke seluruh akun),
-- supaya login normal dari perangkat lain tidak terpengaruh.
ALTER USER IVANSSLO SET NETWORK_POLICY = ROCAGENT_PAT_POLICY;

-- Verifikasi
SHOW NETWORK POLICIES;
SHOW NETWORK RULES;
DESC USER IVANSSLO;

-- ============================================================
-- CATATAN OPERASIONAL PENTING:
--
-- 1. Kalau Anda merevoke/rotasi PAT (praktik keamanan yang benar), PAT
--    LAMA berhenti berfungsi SEKETIKA -- ini bukan bug. Semua tempat
--    yang menyimpan PAT lama (cloud.env di HP, catatan, dsb) harus
--    diperbarui ke PAT baru sebelum tool query_snowflake_insight bisa
--    jalan lagi.
--
-- 2. MINS_TO_BYPASS_NETWORK_POLICY (disebut di dokumentasi Snowflake)
--    HANYA bisa diset oleh Snowflake Support -- bukan sesuatu yang bisa
--    Anda konfigurasi sendiri dari Snowsight/SQL. Kalau butuh akses
--    sementara tanpa network policy ketat, cara yang benar adalah
--    DROP/ALTER network policy itu sendiri (seperti opsi A/B di atas),
--    bukan mengandalkan bypass timer.
--
-- 3. Setelah PAT + network policy final, jangan lupa: cek kembali
--    `SHOW NETWORK POLICIES` dan `DESC USER <user>` untuk memastikan
--    tidak ada policy longgar/percobaan yang tertinggal aktif.
-- ============================================================
