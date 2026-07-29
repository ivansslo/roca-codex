/**
 * Central shell-command guard for every execution path in this server.
 *
 * WHAT THIS IS
 * ------------
 * A defence-in-depth layer, not a sandbox. It parses a command string into the
 * individual programs it would actually run (following pipes, `;`, `&&`, command
 * substitution and backticks) and blocks the ones known to be destructive or to
 * leak credentials.
 *
 * WHAT THIS IS NOT — read this before trusting it
 * -----------------------------------------------
 * Pattern-based command filtering CANNOT be made airtight. A determined attacker
 * who can already submit arbitrary strings has many ways around any such filter:
 *
 *   echo cm0gLXJmIC8K | base64 -d | sh      # payload hidden in an encoding
 *   X=rm; Y=-rf; $X $Y /                    # assembled from variables at runtime
 *   eval "$(printf '\x72\x6d')" -rf /       # built from escapes
 *   python -c "import os; os.system(...)"   # a whole interpreter as the escape hatch
 *
 * Some of these are caught below. Others are not, and some are undecidable
 * without actually running the shell. The real security boundary must be:
 *
 *   1. Authentication  — enforced, see server.ts (WEB_PASSWORD is mandatory)
 *   2. Network scope   — enforced, bind is 127.0.0.1 by default
 *   3. OS isolation    — NOT YET DONE: run this on the Oracle VM in a container
 *                        with a dedicated unprivileged user, not on the phone
 *                        with access to the real home directory.
 *
 * This guard's honest job is to stop the agent (an LLM that hallucinates) and
 * accidental copy-paste from destroying the machine. It is a seatbelt, not armour.
 */

export type GuardMode = 'enforce' | 'warn' | 'off';

export interface GuardVerdict {
  allowed: boolean;
  /** Machine-readable reason code, empty when allowed. */
  code: string;
  /** Human-readable explanation shown to the user/agent. */
  reason: string;
  /** The specific text that triggered the block, for the audit log. */
  offending?: string;
  /** Populated in 'warn' mode: what would have been blocked. */
  warnings: string[];
}

/** Programs that are never appropriate for an AI agent to invoke. */
const DENIED_BINARIES = new Set([
  // Filesystem destruction
  'mkfs', 'mkfs.ext4', 'mkfs.ext3', 'mkfs.vfat', 'mkfs.xfs', 'mkfs.btrfs',
  'fdisk', 'sfdisk', 'parted', 'wipefs', 'shred', 'badblocks', 'mkswap',
  // Machine state
  'shutdown', 'reboot', 'halt', 'poweroff', 'init', 'telinit', 'systemctl',
  // Account / privilege manipulation
  'passwd', 'chpasswd', 'useradd', 'userdel', 'usermod', 'groupadd', 'groupdel',
  'visudo', 'su', 'sudo', 'doas', 'pkexec', 'setcap', 'chroot',
  // Firewall / network reconfiguration
  'iptables', 'ip6tables', 'nft', 'ufw', 'firewall-cmd', 'route', 'ifconfig',
  // Kernel modules
  'insmod', 'rmmod', 'modprobe',
  // Crypto miners and common abuse tooling
  'xmrig', 'minerd', 'cpuminer',
]);

/**
 * Interpreters that can execute an arbitrary inline program, which would bypass
 * this guard entirely. Blocked only when given inline-code flags; running a
 * script file or a REPL is fine.
 */
const INTERPRETERS: Record<string, string[]> = {
  python: ['-c'], python3: ['-c'], python2: ['-c'],
  perl: ['-e', '-E'], ruby: ['-e'], php: ['-r'],
  node: ['-e', '--eval', '-p', '--print'], bun: ['-e', '--eval'], deno: ['eval'],
};

/** Shells that would re-enter execution with content this guard never inspected. */
const SHELLS = new Set(['sh', 'bash', 'zsh', 'dash', 'ksh', 'ash', 'fish', 'busybox']);

/** Programs that fetch from the network; dangerous when piped into a shell. */
const FETCHERS = new Set(['curl', 'wget', 'fetch', 'aria2c', 'httpie', 'http']);

/**
 * Patterns checked against the RAW command text. Only kept here when the pattern
 * cannot match ordinary prose, because raw-text matching cannot tell code from a
 * quoted string: an earlier version blocked `git commit -m "fix: rm -rf handling"`
 * because the commit MESSAGE contained the words. Everything decidable from argv
 * is checked per-segment in checkSegment() instead.
 */
const DENIED_PATTERNS: { re: RegExp; code: string; reason: string }[] = [
  {
    re: /:\s*\(\s*\)\s*\{.*\|.*&.*\}\s*;?\s*:/s,
    code: 'FORK_BOMB',
    reason: 'Fork bomb pattern detected.',
  },
];

/** Flags meaning "recursive" and "force" for rm, in short bundles or long form. */
function rmFlags(argv: string[]): { recursive: boolean; force: boolean } {
  let recursive = false, force = false;
  for (const a of argv.slice(1)) {
    if (a === '--recursive') { recursive = true; continue; }
    if (a === '--force') { force = true; continue; }
    if (a === '--') break;
    if (/^-[a-zA-Z]+$/.test(a)) {
      if (/[rR]/.test(a)) recursive = true;
      if (/f/.test(a)) force = true;
    }
  }
  return { recursive, force };
}

/** Paths whose recursive deletion is catastrophic. */
function isCriticalTarget(p: string): boolean {
  const t = p.replace(/\/+$/, '') || '/';
  if (t === '/' || t === '/*' || t === '~' || t === '$HOME') return true;
  return /^\/(etc|usr|var|bin|sbin|lib|boot|home|root|opt|sys|proc|dev|data)(\/\*)?$/.test(t);
}

/**
 * Paths holding credentials. Reading them is blocked because the output flows
 * straight back into an LLM context and then into a chat transcript.
 */
// Matches the credential path anywhere in a token, so an absolute prefix such as
// /home/user/.oci/ is caught too (an earlier version anchored on whitespace and missed it).
const SENSITIVE_PATH_RE =
  /(\.ssh\/(id_|identity)|\.oci\/|\.aws\/credentials|\.config\/gh\/|\.netrc|\.git-credentials|\/etc\/shadow|\/etc\/sudoers|\.pem$|_rsa$|_ed25519$)/;

/** Commands that read file contents, used to decide if a sensitive path is being exfiltrated. */
const READERS = new Set(['cat', 'less', 'more', 'head', 'tail', 'strings', 'xxd', 'od', 'base64', 'cp', 'scp', 'nc', 'ncat']);

interface Segment {
  /** Raw text of this command segment. */
  raw: string;
  /** Argv-ish tokens, quotes stripped. */
  argv: string[];
  /** True when this segment's stdout is piped into another command. */
  pipedInto?: string;
}

/**
 * Split a command line into the individual commands it would run.
 * Handles quoting, `;` `&&` `||` `|` `&` newlines, `$(...)` and backticks.
 * Recurses into substitutions so `echo $(rm -rf /)` is inspected too.
 */
export function parseSegments(command: string): Segment[] {
  const segments: Segment[] = [];
  let current = '';
  let i = 0;
  let quote: '"' | "'" | null = null;
  const nested: string[] = [];

  const flush = (pipedInto?: string) => {
    const raw = current.trim();
    current = '';
    if (!raw) return;
    segments.push({ raw, argv: tokenize(raw), pipedInto });
  };

  while (i < command.length) {
    const c = command[i];
    const next = command[i + 1];

    if (quote) {
      // Inside single quotes nothing expands. Inside double quotes, $( ) still does.
      if (c === '\\' && quote === '"') { current += c + (next ?? ''); i += 2; continue; }
      if (c === quote) { quote = null; current += c; i++; continue; }
      if (quote === '"' && c === '$' && next === '(') {
        const { body, end } = readBalanced(command, i + 2, '(', ')');
        nested.push(body); i = end; continue;
      }
      current += c; i++; continue;
    }

    if (c === '\\') { current += c + (next ?? ''); i += 2; continue; }
    if (c === '"' || c === "'") { quote = c; current += c; i++; continue; }

    if (c === '$' && next === '(') {
      const { body, end } = readBalanced(command, i + 2, '(', ')');
      nested.push(body);
      current += ' '; // substitution result is opaque to us
      i = end; continue;
    }
    if (c === '`') {
      const close = command.indexOf('`', i + 1);
      if (close === -1) { current += c; i++; continue; }
      nested.push(command.slice(i + 1, close));
      current += ' ';
      i = close + 1; continue;
    }

    if (c === '|' && next === '|') { flush(); i += 2; continue; }
    if (c === '&' && next === '&') { flush(); i += 2; continue; }
    if (c === '|') {
      // Record what this segment pipes into, needed for the curl|sh check.
      const rest = command.slice(i + 1);
      flush(tokenize(rest.trim())[0] || '');
      i++; continue;
    }
    if (c === ';' || c === '\n' || c === '&') { flush(); i++; continue; }

    current += c; i++;
  }
  flush();

  for (const body of nested) segments.push(...parseSegments(body));
  return segments;
}

function readBalanced(s: string, start: number, open: string, close: string) {
  let depth = 1;
  let i = start;
  while (i < s.length && depth > 0) {
    if (s[i] === open) depth++;
    else if (s[i] === close) depth--;
    if (depth === 0) break;
    i++;
  }
  return { body: s.slice(start, i), end: i + 1 };
}

/** Split a segment into argv tokens, stripping quotes. */
export function tokenize(segment: string): string[] {
  const out: string[] = [];
  let cur = '';
  let quote: '"' | "'" | null = null;
  let started = false;

  for (let i = 0; i < segment.length; i++) {
    const c = segment[i];
    if (quote) {
      if (c === '\\' && quote === '"') { cur += segment[++i] ?? ''; started = true; continue; }
      if (c === quote) { quote = null; continue; }
      cur += c; started = true; continue;
    }
    if (c === '"' || c === "'") { quote = c; started = true; continue; }
    if (c === '\\') { cur += segment[++i] ?? ''; started = true; continue; }
    if (/\s/.test(c)) { if (started) { out.push(cur); cur = ''; started = false; } continue; }
    cur += c; started = true;
  }
  if (started) out.push(cur);
  return out;
}

/** Strip a leading path and any env-var assignments to find the real program name. */
function programName(argv: string[]): string {
  let idx = 0;
  // VAR=value prefixes: `FOO=bar rm -rf /`
  while (idx < argv.length && /^[A-Za-z_][A-Za-z0-9_]*=/.test(argv[idx])) idx++;
  const first = argv[idx];
  if (!first) return '';
  const base = first.split('/').pop() || first;
  return base.toLowerCase();
}

export function resolveMode(raw?: string): GuardMode {
  const v = (raw ?? process.env.SHELL_GUARD ?? 'enforce').toLowerCase();
  return v === 'off' ? 'off' : v === 'warn' ? 'warn' : 'enforce';
}

/**
 * Inspect a command. Never throws.
 */
export function checkCommand(command: string, mode: GuardMode = resolveMode()): GuardVerdict {
  const ok = (): GuardVerdict => ({ allowed: true, code: '', reason: '', warnings: [] });

  if (mode === 'off') return ok();
  if (typeof command !== 'string' || !command.trim()) {
    return { allowed: false, code: 'EMPTY', reason: 'Empty command.', warnings: [] };
  }
  if (command.length > 8000) {
    return { allowed: false, code: 'TOO_LONG', reason: 'Command exceeds 8000 characters.', warnings: [] };
  }
  // A NUL byte can truncate the string differently in the guard than in the shell.
  if (command.includes('\0')) {
    return { allowed: false, code: 'NUL_BYTE', reason: 'Command contains a NUL byte.', warnings: [] };
  }

  const deny = (code: string, reason: string, offending?: string): GuardVerdict => {
    if (mode === 'warn') {
      return { allowed: true, code: '', reason: '', warnings: [`${code}: ${reason}`], offending };
    }
    return { allowed: false, code, reason, offending, warnings: [] };
  };

  for (const p of DENIED_PATTERNS) {
    const m = command.match(p.re);
    if (m) return deny(p.code, p.reason, m[0].trim());
  }

  const segments = parseSegments(command);

  for (const seg of segments) {
    const prog = programName(seg.argv);
    if (!prog) continue;

    if (DENIED_BINARIES.has(prog)) {
      return deny('DENIED_BINARY', `The program "${prog}" is not permitted.`, seg.raw);
    }

    // Interpreter with inline code: the guard cannot see inside that program.
    const inlineFlags = INTERPRETERS[prog];
    if (inlineFlags && seg.argv.some(a => inlineFlags.includes(a))) {
      return deny(
        'INLINE_INTERPRETER',
        `Running inline code via "${prog}" bypasses command inspection. Write the code to a file and execute the file instead.`,
        seg.raw,
      );
    }

    // Network fetch piped into a shell or interpreter: classic curl|sh.
    if (FETCHERS.has(prog) && seg.pipedInto) {
      const target = seg.pipedInto.split('/').pop()?.toLowerCase() || '';
      if (SHELLS.has(target) || target in INTERPRETERS) {
        return deny(
          'REMOTE_CODE_PIPE',
          `Piping a download straight into "${target}" runs unreviewed remote code. Download to a file, inspect it, then run it.`,
          seg.raw,
        );
      }
    }

    // Shell invoked with -c: inspect the payload rather than trusting it.
    if (SHELLS.has(prog)) {
      const ci = seg.argv.findIndex(a => a === '-c');
      if (ci !== -1 && seg.argv[ci + 1]) {
        const innerVerdict = checkCommand(seg.argv[ci + 1], mode);
        if (!innerVerdict.allowed) return innerVerdict;
      }
    }

    // eval re-parses a string the guard never saw as code.
    if (prog === 'eval') {
      return deny('EVAL', 'eval executes a dynamically built string, which cannot be inspected.', seg.raw);
    }

    // --- checks below operate on argv, so quoted prose can never trigger them ---

    // rm with both recursive and force, or aimed at a critical path.
    if (prog === 'rm') {
      const { recursive, force } = rmFlags(seg.argv);
      const targets = seg.argv.slice(1).filter(a => !a.startsWith('-'));
      if (recursive && force) {
        return deny('RM_RECURSIVE_FORCE',
          'Recursive forced delete (rm -rf). Drop -f so the shell can prompt, delete a specific path, or use the delete_project_file tool.',
          seg.raw);
      }
      const critical = targets.find(isCriticalTarget);
      if (critical && recursive) {
        return deny('RM_CRITICAL_PATH', `Recursive delete of a critical path ("${critical}").`, seg.raw);
      }
    }

    // dd writing to a raw block device.
    if (prog === 'dd' && seg.argv.some(a => /^of=\/dev\/(sd|hd|nvme|mmcblk|vd|block)/.test(a))) {
      return deny('DD_TO_DEVICE', 'Writing directly to a block device destroys the disk.', seg.raw);
    }

    // chmod/chown recursively on the filesystem root, or chmod 777 on root.
    if ((prog === 'chmod' || prog === 'chown')) {
      const rec = seg.argv.slice(1).some(a => /^-[a-zA-Z]*R/.test(a) || a === '--recursive');
      const hitsRoot = seg.argv.slice(1).some(a => !a.startsWith('-') && isCriticalTarget(a));
      if (rec && hitsRoot) {
        return deny('RECURSIVE_ROOT_PERMS', `Recursive ${prog} on a critical path.`, seg.raw);
      }
      if (prog === 'chmod' && seg.argv.includes('777') && hitsRoot) {
        return deny('CHMOD_ROOT', 'Making a critical path world-writable.', seg.raw);
      }
    }

    // git operations that destroy history.
    if (prog === 'git') {
      const sub = seg.argv.find((a, i) => i > 0 && !a.startsWith('-'));
      const flags = seg.argv.slice(1);
      if (sub === 'push' && flags.some(f => f === '--force' || f === '-f')) {
        return deny('GIT_FORCE_PUSH',
          'Force push can destroy remote history. Use --force-with-lease, or push manually.', seg.raw);
      }
      if (sub === 'reset' && flags.includes('--hard')) {
        return deny('GIT_HARD_RESET', 'git reset --hard discards uncommitted work irreversibly.', seg.raw);
      }
      if (sub === 'clean' && flags.some(f => /^-[a-zA-Z]*f/.test(f)) && flags.some(f => /^-[a-zA-Z]*d/.test(f) || f === '-x')) {
        return deny('GIT_CLEAN_FORCE', 'git clean -fd deletes untracked files irreversibly.', seg.raw);
      }
    }

    // history -c
    if (prog === 'history' && seg.argv.includes('-c')) {
      return deny('HISTORY_WIPE', 'Clearing shell history looks like covering tracks.', seg.raw);
    }

    // Redirection onto a raw device, e.g. `echo x > /dev/sda`.
    if (/>\s*\/dev\/(sd|hd|nvme|mmcblk|vd)/.test(seg.raw)) {
      return deny('REDIRECT_TO_DEVICE', 'Redirecting output onto a raw block device destroys the disk.', seg.raw);
    }

    // Credential exfiltration: check argv tokens, not the raw text, so that
    // `git commit -m "backup .ssh/id_rsa notes"` is not mistaken for a read.
    if (READERS.has(prog) && seg.argv.slice(1).some(a => SENSITIVE_PATH_RE.test(a))) {
      return deny(
        'SENSITIVE_PATH',
        'Reading credential files (SSH keys, OCI/AWS config, .netrc) is blocked; their contents would end up in the chat transcript.',
        seg.raw,
      );
    }
  }

  // base64 -d piped into anything executable.
  if (/base64\s+(-d|--decode|-D)/.test(command) && /\|\s*(sh|bash|zsh|python3?|perl|node)\b/.test(command)) {
    return deny('ENCODED_PAYLOAD', 'Decoding a payload directly into an interpreter hides what is being run.', command.trim());
  }

  return ok();
}

/** One-line audit record. Never contains the command output, only the command. */
export function auditLine(tool: string, command: string, verdict: GuardVerdict): string {
  const status = verdict.allowed ? (verdict.warnings.length ? 'WARN' : 'ALLOW') : 'BLOCK';
  const detail = verdict.allowed ? verdict.warnings.join('; ') : verdict.code;
  return `[shell-guard] ${new Date().toISOString()} ${status} tool=${tool} ${detail ? `reason=${detail} ` : ''}cmd=${JSON.stringify(command.slice(0, 500))}`;
}
