// Tests for the oci_vm and rootd_fs execution tools (server/tools.ts).
//
// These tools shell out to external binaries (`oci`, `rootd`) that may or
// may not be installed depending on where this suite runs: absent in this
// sandbox/CI environment, but genuinely present on the owner's own Termux
// device (oci-cli and rootd-fs are both installed there). The suite must
// pass in BOTH cases without assuming which one it's running in.
//
// It asserts on everything that is true regardless of environment:
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
//      validation into the real execFile call. server/tools.ts's run()
//      helper (oci_vm) and the rootd_fs try/catch both put `action` /
//      `subcommand` on the returned object on EVERY code path past
//      validation — success, ENOENT (binary missing, this sandbox), or a
//      real CLI error (binary present but the fake ocid/box name in this
//      test is rejected by the real oci-cli/rootd, as on the owner's
//      device). Asserting on that field, rather than on any specific error
//      message, is what makes this test environment-agnostic: it proves
//      "the tool did not short-circuit before reaching execution" without
//      caring whether execution itself succeeded, failed with ENOENT, or
//      failed with a real CLI error.
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

  console.log('\n-- oci_vm: valid call reaches real execFile (env-agnostic: ENOENT here, real oci-cli on owner device) --');
  {
    const r: any = await toolImplementations.oci_vm({ action: 'list', compartmentId: 'ocid1.x' });
    // r.action is only set by the run() helper AFTER validation passes, on every
    // branch (success, ENOENT, or a real CLI error) — present regardless of
    // whether oci-cli is installed in the environment running this test.
    ok(r.action === 'list', "list valid -> melewati validasi, mencapai execFile nyata (ENOENT di sandbox tanpa oci-cli, atau respons oci-cli asli di device dengan oci-cli terpasang)");
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

  console.log('\n-- rootd_fs: valid call reaches real execFile (env-agnostic: ENOENT here, real rootd on owner device) --');
  {
    const r: any = await toolImplementations.rootd_fs({ subcommand: 'ls' });
    // Same reasoning as oci_vm above: r.subcommand is set on every branch past
    // validation, regardless of whether the real `rootd` binary is installed.
    ok(r.subcommand === 'ls', "ls valid -> melewati validasi, mencapai execFile nyata (ENOENT di sandbox tanpa rootd-fs, atau respons rootd asli di device dengan rootd-fs terpasang)");
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
