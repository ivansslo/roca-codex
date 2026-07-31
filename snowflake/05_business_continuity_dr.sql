-- ============================================================
-- ROCAGENTINSIGHT — BUSINESS CONTINUITY & DISASTER RECOVERY
-- ============================================================
-- CATATAN PENTING (baca sebelum menjalankan):
--
-- Failover Group otomatis (CREATE FAILOVER GROUP ... dengan
-- REPLICATION_SCHEDULE) HANYA tersedia mulai Snowflake Business
-- Critical Edition ke atas. Cek dulu edisi akun Anda dengan:
--
--   SELECT ACCOUNT_NAME, EDITION FROM
--     SNOWFLAKE.ORGANIZATION_USAGE.ACCOUNTS WHERE DELETED_ON IS NULL;
--
-- Jika hasilnya ENTERPRISE (atau di bawahnya), Failover Group
-- TIDAK bisa dipakai -- gunakan Database Replication manual di
-- bawah ini sebagai gantinya ("warm standby", bukan auto-failover).
--
-- PRASYARAT sebelum skrip ini bisa jalan penuh:
--   1. Akun SEKUNDER sudah ada di region/cloud tujuan.
--   2. Akun tersebut sudah tergabung dalam organisasi yang sama.
--   3. Role ORGADMIN dibutuhkan untuk CREATE ACCOUNT / SHOW
--      ORGANIZATION ACCOUNTS -- PAT session mungkin terkunci ke
--      role default (ACCOUNTADMIN) tergantung konfigurasi; kalau
--      begitu jalankan bagian ORGADMIN ini via Snowsight (login
--      manual), bukan lewat PAT.
-- ============================================================

-- ---- LANGKAH 0: PRASYARAT — jalankan sebagai ORGADMIN ----
USE ROLE ORGADMIN;
SHOW ORGANIZATION ACCOUNTS;

-- Jika belum ada akun kedua, buat dulu (ganti region/edition sesuai
-- kebutuhan -- edition HARUS sama Enterprise atau lebih tinggi di
-- kedua akun agar replikasi didukung):
--
-- CREATE ACCOUNT ROCAGENT_DR_SECONDARY
--   ADMIN_NAME = '<username admin>'
--   ADMIN_PASSWORD = '<password kuat, atau pakai ADMIN_RSA_PUBLIC_KEY>'
--   EMAIL = '<email Anda>'
--   EDITION = 'ENTERPRISE'
--   REGION_GROUP = 'PUBLIC'
--   REGION = '<mis. AWS_US_EAST_1, AZURE_WESTEUROPE, GCP_ASIA_SOUTHEAST1>'
--   COMMENT = 'DR secondary untuk ROCAGENTINSIGHT_DB';

-- ---- LANGKAH 1: Aktifkan replikasi di akun PRIMARY (akun ini) ----
USE ROLE ACCOUNTADMIN;

-- Buat replika database di akun sekunder (dijalankan DARI akun sekunder
-- setelah primary mengizinkan replikasi):
--
--   -- dijalankan di akun SEKUNDER:
--   CREATE DATABASE ROCAGENTINSIGHT_DB
--     AS REPLICA OF <org>.<primary_account>.ROCAGENTINSIGHT_DB;

-- ---- LANGKAH 2: Refresh terjadwal (menggantikan REPLICATION_SCHEDULE
--      otomatis milik Failover Group) ----
-- Jalankan ini DI AKUN SEKUNDER via Snowflake Task, supaya replika
-- ter-update berkala tanpa campur tangan manual tiap saat.
--
-- USE ROLE ACCOUNTADMIN;
-- CREATE OR REPLACE TASK ROCAGENTINSIGHT_DB_REFRESH_TASK
--   WAREHOUSE = ROCAGENTINSIGHT_WH
--   SCHEDULE = 'USING CRON 0 */6 * * * UTC'  -- setiap 6 jam
-- AS
--   ALTER DATABASE ROCAGENTINSIGHT_DB REFRESH;
--
-- ALTER TASK ROCAGENTINSIGHT_DB_REFRESH_TASK RESUME;

-- ---- LANGKAH 3: Prosedur FAILOVER MANUAL saat insiden ----
-- Dijalankan DI AKUN SEKUNDER ketika primary benar-benar down:
--
--   ALTER DATABASE ROCAGENTINSIGHT_DB PRIMARY;
--
-- Setelah ini, akun sekunder menjadi read-write primary baru.
-- Arahkan ulang RocAgent/aplikasi ke akun sekunder (ganti
-- SNOWFLAKE_ACCOUNT di cloud.env) sampai akun asli pulih.

-- ---- LANGKAH 4: Failback (setelah primary asli pulih) ----
-- Setelah primary asli kembali online, jadikan ia REPLICA dulu
-- (bukan langsung PRIMARY lagi) untuk menghindari split-brain:
--
--   -- di akun ASLI (yang baru pulih):
--   ALTER DATABASE ROCAGENTINSIGHT_DB REFRESH;
--   -- setelah data sinkron dan disepakati, baru:
--   ALTER DATABASE ROCAGENTINSIGHT_DB PRIMARY;

-- ============================================================
-- CATATAN UPGRADE KE BUSINESS CRITICAL (opsional, untuk nanti)
-- ============================================================
-- Jika di masa depan akun di-upgrade ke Business Critical Edition+,
-- ganti pendekatan manual di atas dengan Failover Group otomatis:
--
--   CREATE FAILOVER GROUP ROCAGENTINSIGHT_FG
--     OBJECT_TYPES = DATABASES
--     ALLOWED_DATABASES = ROCAGENTINSIGHT_DB
--     ALLOWED_ACCOUNTS = <org>.<secondary_account>
--     REPLICATION_SCHEDULE = '10 MINUTE';
--
--   -- Lalu di akun sekunder:
--   CREATE FAILOVER GROUP ROCAGENTINSIGHT_FG
--     AS REPLICA OF <org>.<primary_account>.ROCAGENTINSIGHT_FG;
--
--   -- Saat insiden (otomatis mem-promote SEMUA object di grup):
--   ALTER FAILOVER GROUP ROCAGENTINSIGHT_FG PRIMARY;
--
-- Ini superior karena: (a) satu perintah mem-failover banyak object
-- sekaligus secara konsisten, (b) replication_schedule berjalan
-- otomatis tanpa Task manual, (c) bisa dikombinasi dengan Client
-- Redirect (SYSTEM$ALLOWLIST / connection URL tunggal) supaya
-- aplikasi tidak perlu ganti account identifier manual saat failover.
