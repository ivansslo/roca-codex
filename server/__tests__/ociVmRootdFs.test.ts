// Tests for the oci_vm and rootd_fs execution tools (server/tools.ts).
//
// These tools shell out to external binaries (`oci`, `rootd`) that are not
// installed in this sandbox/CI environment, so this suite deliberately does
// NOT assert on real cloud/container behaviour — that would require a live
// OCI account and a Termux rootd-fs install, neither of which exist here.
// Instead it asserts on everything this test environment CAN verify for
// real, in-process, with no mocking of the guard or the tool logic itself:
//
//   1. Required-parameter validation returns a clear error before any
//      process is spawned (list/launch/power/resize each have distinct
//      required fields; missing them must never reach execFile).
//   2. Destructive actions (oci_vm terminate, rootd_fs rm/purge) are
//      refused without confirm:true, and the response says so explicitly
//      via requiresConfirmation:true rather than silently doing nothing.
//   3. Unknown/disallowed actions and subcommands are rejected by name
//      (oci_vm's action switch, rootd_fs's ROOTD_SUBCOMMANDS allowlist) —
//      this is what stops an arbitrary `oci <anything>` / `rootd <anything>`
//      surface from being reachable through these tools.
//   4. rootd_fs's `enter` is explicitly rejected with a pointer to `sh`,
//      since an interactive TTY subcommand cannot work through a one-shot
//      tool call.
//   5. When the required parameters ARE present, the tool proceeds past
//      validation into the real execFile call — which then fails with
//      ENOENT ("binary tidak ditemukan") in this sandbox precisely because
//      oci-cli/rootd are not installed here. That ENOENT is itself the
//      proof the tool reached real process execution rather than
//      short-circuiting or fabricating a result — on the owner's own
//      device, where both binaries are installed, the same code path
//      reaches the real CLI instead.
//   6. checkCommand() (the shared guard both tools funnel through via
//      guardShell) does not block well-formed oci/rootd invocations outright
//      — i.e. this guard integration does not accidentally make the tools
//      unusable.
import { toolImplementations } from '../tools';
import { checkCommand } from '../commandGuard';

let pass = 0, fail = 0;
const ok = (cond: boolean, label: string) => {
  if (cond) { pass++; console.log(`  ✓ ${label}`); }
  else { fail++; console.log(`  ✗ ${label}`); }
};

async function main() {
  console.log('\n-- oci_vm: parameter validation (no process spawned) --');
  {
    const r: any = await toolImplementations.oci_vm({ action: 'list' });
    ok(r.status === 'error' && /compartmentId/.test(r.message), "list tanpa compartmentId -> error jelas");
  }
  {
    const r: any = await toolImplementations.oci_vm({ action: 'launch', compartmentId: 'ocid1.x' });
    ok(r.status === 'error' && /availabilityDomain/.test(r.message), "launch tanpa availabilityDomain -> error jelas");
  }
  {
    const r: any = await toolImplementations.oci_vm({ action: 'power', instanceId: 'ocid1.y', vmAction: 'NUKE' });
    ok(r.status === 'error' && /vmAction/.test(r.message), "power dengan vmAction tak dikenal -> error jelas");
  }
  {
    const r: any = await toolImplementations.oci_vm({ action: 'resize', instanceId: 'ocid1.y' });
    ok(r.status === 'error' && /ocpus/.test(r.message), "resize tanpa ocpus/memoryInGBs -> error jelas");
  }
  {
    const r: any = await toolImplementations.oci_vm({ action: 'bogus' });
    ok(r.status === 'error' && /tidak dikenal/.test(r.message), "action tak dikenal -> ditolak");
  }

  console.log('\n-- oci_vm: destructive action requires confirm:true --');
  {
    const r: any = await toolImplementations.oci_vm({ action: 'terminate', instanceId: 'ocid1.y' });
    ok(r.status === 'error' && r.requiresConfirmation === true, "terminate tanpa confirm -> ditolak, requiresConfirmation:true");
  }

  console.log('\n-- oci_vm: valid call reaches real execFile (ENOENT in this sandbox = proof of real execution) --');
  {
    const r: any = await toolImplementations.oci_vm({ action: 'list', compartmentId: 'ocid1.x' });
    ok(r.status === 'error' && /oci-cli tidak ditemukan/.test(r.message), "list valid -> mencoba spawn oci nyata, gagal ENOENT (bukan bug, oci-cli tak terpasang di sandbox ini)");
  }

  console.log('\n-- rootd_fs: subcommand allowlist + enter rejection --');
  {
    const r: any = await toolImplementations.rootd_fs({ subcommand: 'enter' });
    ok(r.status === 'error' && /subcommand .sh./.test(r.message), "enter ditolak, diarahkan ke 'sh'");
  }
  {
    const r: any = await toolImplementations.rootd_fs({ subcommand: 'hackthesystem' });
    ok(r.status === 'error' && /tidak dikenal atau tidak diizinkan/.test(r.message), "subcommand tak dikenal -> ditolak");
  }

  console.log('\n-- rootd_fs: destructive subcommands require confirm:true --');
  {
    const r: any = await toolImplementations.rootd_fs({ subcommand: 'rm', args: ['ubuntu'] });
    ok(r.status === 'error' && r.requiresConfirmation === true, "rm tanpa confirm -> ditolak, requiresConfirmation:true");
  }
  {
    const r: any = await toolImplementations.rootd_fs({ subcommand: 'purge' });
    ok(r.status === 'error' && r.requiresConfirmation === true, "purge tanpa confirm -> ditolak, requiresConfirmation:true");
  }

  console.log('\n-- rootd_fs: valid call reaches real execFile (ENOENT in this sandbox = proof of real execution) --');
  {
    const r: any = await toolImplementations.rootd_fs({ subcommand: 'ls' });
    ok(r.status === 'error' && /rootd tidak ditemukan/.test(r.message), "ls valid -> mencoba spawn rootd nyata, gagal ENOENT (bukan bug, rootd-fs tak terpasang di sandbox ini)");
  }

  console.log('\n-- shared guard: well-formed oci/rootd invocations are not blocked outright --');
  {
    const v = checkCommand('oci compute instance list --compartment-id ocid1.x --output table', 'enforce');
    ok(v.allowed === true, "oci compute instance list -> allowed oleh commandGuard");
  }
  {
    const v = checkCommand('rootd sh ubuntu -- apt update', 'enforce');
    ok(v.allowed === true, "rootd sh ubuntu -- apt update -> allowed oleh commandGuard");
  }

  console.log(`\n${pass} lulus, ${fail} gagal\n`);
  process.exit(fail > 0 ? 1 : 0);
}

main();
