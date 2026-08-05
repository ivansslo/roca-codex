// Tests for two 2026-08-01 fixes/additions:
//
//   1. exec / terminal_manager's "missing binary -> rootd_fs
//      hint" behaviour. Found live: the owner asked the agent to run a
//      command the host Termux shell didn't have, and instead of doing
//      something different the agent kept re-issuing near-identical
//      exec/rootd_fs calls hunting for a fix until the
//      duplicate-call circuit breaker force-stopped the turn ("mendeteksi
//      diri saya memanggil tool yang SAMA PERSIS berulang kali"). That
//      breaker is a correct backstop, but it doesn't teach the agent the
//      right next move. This tests the actual fix: exec/
//      terminal_manager attach an explicit `hint` field pointing at
//      rootd_fs when the failure looks like a missing binary.
//
//   2. The (id, provider) model-catalog fix in /api/models — a new
//      CloudFerro Sherlock catalog entry deliberately reuses Groq's
//      existing "openai/gpt-oss-120b" id (same upstream model, different
//      account/endpoint), so id-only matching anywhere in the catalog
//      handling would be a real bug (silently mixing up which provider a
//      selection means). This asserts the catalog itself is well-formed:
//      every (id, provider) PAIR is unique even though some ids repeat.
import { toolImplementations } from '../tools';

let pass = 0, fail = 0;
const ok = (cond: boolean, label: string) => {
  if (cond) { pass++; console.log(`  ✓ ${label}`); }
  else { fail++; console.log(`  ✗ ${label}`); }
};

async function main() {
  console.log('\n-- exec: missing binary -> rootd_fs hint --');
  {
    const r: any = await toolImplementations.exec({ command: 'totallynonexistentbinaryxyz123456' });
    ok(r.status === 'error', "binary tak ada -> status error");
    ok(typeof r.hint === 'string' && /rootd_fs/.test(r.hint), "hint menyebut rootd_fs secara eksplisit");
    ok(/JANGAN ulangi/i.test(r.hint || ''), "hint eksplisit melarang mengulang command host yang sama");
    ok(/totallynonexistentbinaryxyz123456/.test(r.hint || ''), "hint menyebut nama binary yang hilang");
  }

  console.log('\n-- exec: perintah sukses TIDAK mendapat hint (tidak false-positive) --');
  {
    const r: any = await toolImplementations.exec({ command: 'echo hello-world-test' });
    ok(r.status === 'success', "echo -> sukses");
    ok(r.hint === undefined, "tidak ada hint palsu pada perintah yang sukses");
  }

  console.log('\n-- exec: error TIDAK terkait binary hilang (mis. file tidak ada) TIDAK mendapat hint --');
  {
    // `cat` itself exists — this fails because the ARGUMENT (a file) is
    // missing, exit code 1, not because a binary is missing (exit 127).
    // detectMissingBinaryHint must not conflate the two.
    const r: any = await toolImplementations.exec({ command: 'cat /tmp/definitely_does_not_exist_xyz_987.txt' });
    ok(r.status === 'error', "cat file hilang -> status error");
    ok(r.hint === undefined, "TIDAK mendapat hint rootd_fs (ini bukan binary hilang, cat ada; hanya argumennya salah)");
  }

  console.log('\n-- terminal_manager: binary hilang juga mendapat hint yang sama --');
  {
    const r: any = await toolImplementations.terminal_manager({ command: 'anotherfakemissingbinaryxyz789' });
    ok(typeof r.hint === 'string' && /rootd_fs/.test(r.hint), "terminal_manager: hint menyebut rootd_fs");
  }

  console.log('\n-- /api/models catalog: (id, provider) pairs unik meski beberapa id berulang --');
  {
    // Re-derive the same catalog server.ts builds, without booting an HTTP
    // server (keeps this test fast and dependency-free) — this exercises
    // the actual literal array by re-reading server.ts's source, so a typo
    // introduced later would still be caught rather than silently drifting
    // from what's tested here.
    const fs = await import('fs');
    const src = fs.readFileSync(new URL('../../server.ts', import.meta.url), 'utf-8');
    const catalogMatch = src.match(/const catalog = \[([\s\S]*?)\n\s*\];/);
    ok(!!catalogMatch, "server.ts: blok catalog ditemukan untuk diperiksa");
    if (catalogMatch) {
      const body = catalogMatch[1];
      const entries = [...body.matchAll(/\{\s*id:\s*"([^"]+)",[^}]*provider:\s*"([^"]+)"/g)]
        .map(m => ({ id: m[1], provider: m[2] }));
      ok(entries.length >= 10, `catalog punya cukup banyak entri (${entries.length} ditemukan, minimal 10 diharapkan)`);

      const pairKeys = entries.map(e => `${e.provider}::${e.id}`);
      const uniquePairs = new Set(pairKeys);
      ok(uniquePairs.size === pairKeys.length, "setiap pasangan (provider, id) di catalog unik (tidak ada baris duplikat persis)");

      const hasGptOssCfSherlock = entries.some(e => e.id === 'openai/gpt-oss-120b' && e.provider === 'cfsherlock');
      ok(hasGptOssCfSherlock, "entri 'openai/gpt-oss-120b' milik provider cfsherlock ada");

      const cfsherlockEntries = entries.filter(e => e.provider === 'cfsherlock');
      ok(cfsherlockEntries.length >= 10, `cfsherlock memiliki entri model aktif di catalog (${cfsherlockEntries.length} ditemukan)`);
    }
  }

  console.log('\n-- src/components: (id, provider) matching fix hadir di semua tempat yang relevan --');
  {
    const fs = await import('fs');
    const readSrc = (p: string) => fs.readFileSync(new URL(`../../${p}`, import.meta.url), 'utf-8');

    const header = readSrc('src/components/Header.tsx');
    ok(/m\.id === p\.selectedModel && m\.provider === p\.selectedProvider/.test(header), "Header.tsx: activeModel dicocokkan via (id, provider), bukan id saja");

    const quickSwitch = readSrc('src/components/ModelQuickSwitch.tsx');
    ok(/m\.id === selectedModel && m\.provider === selectedProvider/.test(quickSwitch), "ModelQuickSwitch.tsx: current dicocokkan via (id, provider)");
    ok(/provider === selectedProvider/.test(quickSwitch), "ModelQuickSwitch.tsx: highlight item per-baris juga mempertimbangkan provider grup");

    const sidebar = readSrc('src/components/Sidebar.tsx');
    ok(/selectedModel === m\.id && selectedProvider === m\.provider/.test(sidebar), "Sidebar.tsx: sel dicocokkan via (id, provider)");

    const app = readSrc('src/App.tsx');
    ok(/selectedProvider=\{selectedProvider\}/.test(app.split('<Header')[1]?.slice(0, 400) || ''), "App.tsx: <Header> sekarang menerima prop selectedProvider");
  }

  console.log(`\n${pass} lulus, ${fail} gagal`);
  if (fail > 0) process.exit(1);
}

main().catch((e) => { console.error(e); process.exit(1); });
