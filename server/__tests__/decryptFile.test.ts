// Tests for the decrypt_file tool (server/tools.ts).
//
// Unlike commandGuard.test.ts's pure pattern checks, this suite deliberately
// creates REAL encrypted fixtures with the SAME external tools an owner would
// actually use (the system `openssl`, `gpg`, and `zip -P` binaries, plus
// tools/rocvault itself for the rocvault format) and then decrypts them
// through toolImplementations.decrypt_file directly — not by reading the
// source and assuming the logic is right. Every format this tool claims to
// support is exercised end to end: correct passphrase must recover the exact
// original bytes, and a wrong passphrase must be rejected with a clear error
// rather than silently returning garbage or throwing an unhandled exception.
//
// Fixtures live under a throwaway workspace directory (WORKDIR below) inside
// the actual project root, since decrypt_file resolves paths relative to
// process.cwd() like every other file tool in this module (read_project_file,
// write_project_file, etc.) — that containment check is exercised too
// (path traversal / absolute path / sensitive-path targeting must all be
// refused).
import fs from 'fs';
import path from 'path';
import { execFileSync } from 'child_process';
import { toolImplementations } from '../tools';

let pass = 0, fail = 0;
const ok = (cond: boolean, label: string) => {
  if (cond) { pass++; console.log(`  ✓ ${label}`); }
  else { fail++; console.log(`  ✗ ${label}`); }
};

const WORKDIR = path.join(process.cwd(), '.decrypt_file_test_tmp');

function haveBinary(bin: string): boolean {
  try { execFileSync('which', [bin], { stdio: 'ignore' }); return true; }
  catch { return false; }
}

async function main() {
  fs.rmSync(WORKDIR, { recursive: true, force: true });
  fs.mkdirSync(WORKDIR, { recursive: true });

  const PLAINTEXT = 'RAHASIA: nilai_uji_12345\nbaris kedua dengan spasi   \n';
  const PASS = 'passphrase-uji-benar-999';
  const WRONG = 'passphrase-salah-000';

  try {
    // ---- rocvault format ----
    console.log('\n-- decrypt_file: rocvault format --');
    {
      const plainPath = path.join(WORKDIR, 'secret.env');
      const vaultRel = '.decrypt_file_test_tmp/secret.env.vault';
      fs.writeFileSync(plainPath, PLAINTEXT);
      execFileSync(path.join(process.cwd(), 'tools/rocvault'), ['lock', plainPath, path.join(WORKDIR, 'secret.env.vault')], {
        env: { ...process.env, ROCVAULT_PASS: PASS },
      });
      fs.unlinkSync(plainPath); // rocvault lock leaves the plaintext; remove it so only the vault remains

      const r: any = await toolImplementations.decrypt_file({ filename: vaultRel, passphrase: PASS });
      ok(r.status === 'success' && r.format === 'rocvault', 'rocvault: passphrase benar -> sukses, format terdeteksi benar');
      ok(r.content === PLAINTEXT, 'rocvault: isi hasil dekripsi identik dengan plaintext asli');

      const rWrong: any = await toolImplementations.decrypt_file({ filename: vaultRel, passphrase: WRONG });
      ok(rWrong.status === 'error' && /[Pp]assphrase/.test(rWrong.message), 'rocvault: passphrase salah -> error jelas, bukan crash');
    }

    // ---- openssl enc format ----
    if (haveBinary('openssl')) {
      console.log('\n-- decrypt_file: openssl enc format --');
      const encRel = '.decrypt_file_test_tmp/secret.txt.enc';
      const plainPath = path.join(WORKDIR, 'openssl_plain.txt');
      fs.writeFileSync(plainPath, PLAINTEXT);
      execFileSync('openssl', ['enc', '-aes-256-cbc', '-pbkdf2', '-salt', '-pass', `pass:${PASS}`, '-in', plainPath, '-out', path.join(WORKDIR, 'secret.txt.enc')]);

      const r: any = await toolImplementations.decrypt_file({ filename: encRel, passphrase: PASS });
      ok(r.status === 'success' && r.format === 'openssl', 'openssl: passphrase benar (aes-256-cbc+pbkdf2) -> sukses, format terdeteksi benar');
      ok(r.content === PLAINTEXT, 'openssl: isi hasil dekripsi identik dengan plaintext asli');

      const rWrong: any = await toolImplementations.decrypt_file({ filename: encRel, passphrase: WRONG });
      ok(rWrong.status === 'error', 'openssl: passphrase salah -> error jelas, bukan crash');

      // legacy KDF + AES-128, to prove the fallback attempts actually work
      const legacyRel = '.decrypt_file_test_tmp/secret_legacy.txt.enc';
      execFileSync('openssl', ['enc', '-aes-128-cbc', '-salt', '-pass', `pass:${PASS}`, '-in', plainPath, '-out', path.join(WORKDIR, 'secret_legacy.txt.enc')]);
      const rLegacy: any = await toolImplementations.decrypt_file({ filename: legacyRel, passphrase: PASS });
      ok(rLegacy.status === 'success' && rLegacy.content === PLAINTEXT, 'openssl: fallback ke aes-128-cbc + KDF legacy juga berhasil');
    } else {
      console.log('\n(openssl tidak tersedia di lingkungan ini — kasus openssl dilewati)');
    }

    // ---- gpg symmetric format ----
    if (haveBinary('gpg')) {
      console.log('\n-- decrypt_file: gpg symmetric format --');
      const gpgRel = '.decrypt_file_test_tmp/secret.gpg';
      const plainPath = path.join(WORKDIR, 'gpg_plain.txt');
      fs.writeFileSync(plainPath, PLAINTEXT);
      execFileSync('gpg', ['--batch', '--yes', '--passphrase', PASS, '-c', '--cipher-algo', 'AES256', '-o', path.join(WORKDIR, 'secret.gpg'), plainPath]);

      const r: any = await toolImplementations.decrypt_file({ filename: gpgRel, passphrase: PASS });
      ok(r.status === 'success' && r.format === 'gpg', 'gpg: passphrase benar -> sukses, format terdeteksi benar');
      ok(r.content === PLAINTEXT, 'gpg: isi hasil dekripsi identik dengan plaintext asli');

      const rWrong: any = await toolImplementations.decrypt_file({ filename: gpgRel, passphrase: WRONG });
      ok(rWrong.status === 'error', 'gpg: passphrase salah -> error jelas, bukan crash');
    } else {
      console.log('\n(gpg tidak tersedia di lingkungan ini — kasus gpg dilewati)');
    }

    // ---- ZipCrypto password-protected zip ----
    if (haveBinary('zip')) {
      console.log('\n-- decrypt_file: ZipCrypto zip format --');
      const zipRel = '.decrypt_file_test_tmp/secret.zip';
      const plainName = 'inner.txt';
      const plainPath = path.join(WORKDIR, plainName);
      fs.writeFileSync(plainPath, PLAINTEXT);
      execFileSync('zip', ['-P', PASS, '-j', path.join(WORKDIR, 'secret.zip'), plainPath]);

      const r: any = await toolImplementations.decrypt_file({ filename: zipRel, passphrase: PASS });
      ok(r.status === 'success' && r.format === 'zip', 'zip: passphrase benar -> sukses, format terdeteksi benar');
      ok(r.content === PLAINTEXT, 'zip: isi hasil dekripsi identik dengan plaintext asli');
      ok(Array.isArray(r.zipEntries) && r.zipEntries.includes(plainName), 'zip: daftar entri dilaporkan dengan benar');

      const rWrong: any = await toolImplementations.decrypt_file({ filename: zipRel, passphrase: WRONG });
      ok(rWrong.status === 'error', 'zip: passphrase salah -> error jelas, bukan crash');
    } else {
      console.log('\n(zip tidak tersedia di lingkungan ini — kasus zip dilewati)');
    }

    // ---- format detection failure ----
    console.log('\n-- decrypt_file: format tidak dikenal --');
    {
      const junkRel = '.decrypt_file_test_tmp/junk.bin';
      fs.writeFileSync(path.join(WORKDIR, 'junk.bin'), Buffer.from([0x01, 0x02, 0x03, 0x04, 0x05]));
      const r: any = await toolImplementations.decrypt_file({ filename: junkRel, passphrase: PASS });
      ok(r.status === 'error' && /tidak bisa mengenali/i.test(r.message), 'byte acak -> error format tidak dikenal, bukan crash');
    }

    // ---- parameter validation ----
    console.log('\n-- decrypt_file: validasi parameter --');
    {
      const r1: any = await toolImplementations.decrypt_file({ filename: '', passphrase: PASS });
      ok(r1.status === 'error' && /filename/i.test(r1.message), 'filename kosong -> error jelas');

      const r2: any = await toolImplementations.decrypt_file({ filename: '.decrypt_file_test_tmp/secret.env.vault', passphrase: '' });
      ok(r2.status === 'error' && /passphrase/i.test(r2.message), 'passphrase kosong -> error jelas, tidak menebak');

      const r3: any = await toolImplementations.decrypt_file({ filename: 'tidak/ada/berkas/ini.vault', passphrase: PASS });
      ok(r3.status === 'error' && /not found/i.test(r3.message), 'berkas tidak ada -> error jelas');
    }

    // ---- path containment (same convention as read_project_file / write_project_file) ----
    console.log('\n-- decrypt_file: containment path (tidak boleh keluar workspace) --');
    {
      const r1: any = await toolImplementations.decrypt_file({ filename: '../outside.vault', passphrase: PASS });
      ok(r1.status === 'error' && /access denied/i.test(r1.message), '../ traversal pada filename -> ditolak');

      const r2: any = await toolImplementations.decrypt_file({ filename: '/etc/passwd', passphrase: PASS });
      // Sama seperti read_project_file/write_project_file/edit_file/delete_project_file
      // lainnya di file ini: path.join(cwd, '/etc/passwd') menghasilkan '<cwd>/etc/passwd'
      // (perilaku standar Node path.join, BUKAN escape ke root filesystem sungguhan),
      // jadi hasil yang benar adalah "File not found" di dalam workspace, bukan "Access
      // denied" — ini konsisten dengan konvensi containment tool lain, bukan celah baru.
      ok(r2.status === 'error' && /not found/i.test(r2.message), "path absolut '/etc/passwd' -> tetap terkurung di workspace, dilaporkan 'not found' (konsisten dgn tool file lain)");
    }

    // ---- sensitive-path guard (SENSITIVE_PATH_RE from commandGuard.ts) ----
    console.log('\n-- decrypt_file: menolak target berkas kredensial --');
    {
      const r: any = await toolImplementations.decrypt_file({ filename: '.ssh/id_rsa', passphrase: PASS });
      ok(r.status === 'error' && /kredensial/i.test(r.message), 'menargetkan .ssh/id_rsa -> ditolak eksplisit');
    }

    // ---- outputFilename: writes to disk, containment enforced there too ----
    console.log('\n-- decrypt_file: outputFilename menulis ke berkas --');
    {
      const outRel = '.decrypt_file_test_tmp/decrypted_out.txt';
      const r: any = await toolImplementations.decrypt_file({
        filename: '.decrypt_file_test_tmp/secret.env.vault',
        passphrase: PASS,
        outputFilename: outRel,
      });
      ok(r.status === 'success' && r.savedTo === outRel, 'outputFilename valid -> disimpan, savedTo dilaporkan');
      const written = fs.existsSync(path.join(process.cwd(), outRel)) ? fs.readFileSync(path.join(process.cwd(), outRel), 'utf-8') : null;
      ok(written === PLAINTEXT, 'isi berkas yang ditulis ke disk identik dengan plaintext asli');

      const rBad: any = await toolImplementations.decrypt_file({
        filename: '.decrypt_file_test_tmp/secret.env.vault',
        passphrase: PASS,
        outputFilename: '../escape.txt',
      });
      ok(rBad.status === 'error' && /access denied/i.test(rBad.message), 'outputFilename dengan ../ traversal -> ditolak');
    }
  } finally {
    fs.rmSync(WORKDIR, { recursive: true, force: true });
  }

  console.log(`\n${pass} lulus, ${fail} gagal`);
  if (fail > 0) process.exit(1);
}

main().catch((e) => { console.error(e); process.exit(1); });
