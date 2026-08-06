// Tests for the query_neon_db tool (server/tools.ts).
//
// Like ociVmRootdFs.test.ts, this only asserts on behaviour that holds
// regardless of whether real Neon credentials are configured in this
// environment (NEON_URI is absent here on purpose — no live database
// access happens during `npm test`):
//
//   1. Missing sql -> clear error, no connection attempted.
//   2. Missing NEON_URI -> clear config error, no connection attempted.
//   3. Destructive/schema-changing statements (DROP, TRUNCATE, ALTER,
//      DELETE, UPDATE, CREATE, INSERT, GRANT, REVOKE) are refused without
//      confirm:true, returning requiresConfirmation:true — mirrors the
//      oci_vm terminate / rootd_fs rm+purge pattern.
//   4. A destructive statement hidden after a harmless-looking leading
//      statement in a multi-statement string is still caught (statement-
//      by-statement check, not just the first one).
//   5. Plain SELECT/EXPLAIN/SHOW statements are NOT treated as destructive
//      even without confirm:true.
//   6. With NEON_URI unset but sql+confirm both valid, the tool still
//      reports the config error (not a stack trace / unhandled rejection),
//      proving it never gets far enough to attempt a real connection when
//      one isn't configured.
import { toolImplementations } from '../tools';

let pass = 0, fail = 0;
const ok = (cond: boolean, label: string) => {
  if (cond) { pass++; console.log(`  ✓ ${label}`); }
  else { fail++; console.log(`  ✗ ${label}`); }
};

async function main() {
  const savedNeonUri = process.env.NEON_URI;
  delete process.env.NEON_URI;
  delete process.env.NEON_DATABASE_URL;
  delete process.env.DATABASE_URL;

  console.log('\n-- query_neon_db: parameter validation --');
  {
    const r: any = await toolImplementations.query_neon_db({ sql: '' });
    ok(r.status === 'error' && /sql is required/.test(r.message), "sql kosong -> error jelas");
  }

  console.log('\n-- query_neon_db: missing NEON_URI --');
  {
    const r: any = await toolImplementations.query_neon_db({ sql: 'SELECT 1;' });
    ok(r.status === 'error' && /NEON_URI/.test(r.message), "tanpa NEON_URI -> error konfigurasi jelas, bukan crash");
  }

  console.log('\n-- query_neon_db: destructive statements require confirm:true --');
  const destructiveCases = [
    'DROP TABLE users;',
    'TRUNCATE TABLE users;',
    'ALTER TABLE users ADD COLUMN foo TEXT;',
    'DELETE FROM users WHERE id = 1;',
    'UPDATE users SET name = \'x\' WHERE id = 1;',
    'CREATE TABLE foo (id INT);',
    'INSERT INTO users (name) VALUES (\'x\');',
    'GRANT SELECT ON users TO PUBLIC;',
    'REVOKE SELECT ON users FROM PUBLIC;',
  ];
  for (const sql of destructiveCases) {
    const r: any = await toolImplementations.query_neon_db({ sql });
    ok(r.status === 'error' && r.requiresConfirmation === true, `"${sql.split(' ')[0]} ..." tanpa confirm -> ditolak, requiresConfirmation:true`);
  }

  console.log('\n-- query_neon_db: destructive statement hidden after a harmless-looking one --');
  {
    const r: any = await toolImplementations.query_neon_db({ sql: 'SELECT 1; DROP TABLE users;' });
    ok(r.status === 'error' && r.requiresConfirmation === true, "statement kedua destruktif tetap terdeteksi (bukan cuma statement pertama)");
  }

  console.log('\n-- query_neon_db: plain read-only statements are NOT flagged as destructive --');
  const readOnlyCases = ['SELECT * FROM users;', 'EXPLAIN SELECT 1;', 'SHOW search_path;'];
  for (const sql of readOnlyCases) {
    const r: any = await toolImplementations.query_neon_db({ sql });
    // Without NEON_URI configured, these still fail -- but with the config
    // error, NOT requiresConfirmation. That distinction is what's being tested.
    ok(r.status === 'error' && !r.requiresConfirmation && /NEON_URI/.test(r.message), `"${sql}" -> tidak dianggap destruktif (gagal karena config, bukan confirm)`);
  }

  console.log('\n-- query_neon_db: confirm:true on a destructive statement reaches the real connection attempt --');
  {
    // Still no NEON_URI configured, so this must fail with the config error,
    // not requiresConfirmation -- proving confirm:true actually let it past
    // the destructive-statement gate and on to the (here, failing) connection step.
    const r: any = await toolImplementations.query_neon_db({ sql: 'DELETE FROM users WHERE id = 1;', confirm: true });
    ok(r.status === 'error' && !r.requiresConfirmation && /NEON_URI/.test(r.message), "confirm:true melewati gate destruktif, gagal di config (bukan ditolak confirm lagi)");
  }

  console.log('\n-- query_neon_db: administrative/system override queries are blocked EVEN with confirm:true --');
  const adminCases = [
    'ALTER SYSTEM SET work_mem = "4MB";',
    'COPY (SELECT * FROM users) TO PROGRAM "rm -rf /";',
    'SELECT * FROM pg_shadow;',
    'CREATE EXTENSION pgcrypto;',
  ];
  for (const sql of adminCases) {
    const r: any = await toolImplementations.query_neon_db({ sql, confirm: true });
    ok(r.status === 'error' && !r.requiresConfirmation && /Blocked by database guard/i.test(r.message), `"${sql.split(' ')[0]} ..." -> diblokir mutlak oleh database guard (bukan cek NEON_URI)`);
  }

  if (savedNeonUri !== undefined) process.env.NEON_URI = savedNeonUri;

  console.log(`\n${pass} lulus, ${fail} gagal\n`);
  process.exit(fail > 0 ? 1 : 0);
}

main();
