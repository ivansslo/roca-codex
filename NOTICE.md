# NOTICE

This file records third-party attribution that RocAgent's `LICENSE`
(proprietary, all rights reserved) does not itself cover, plus the
infrastructure this project runs on top of. It exists so that upstream
license terms remain honored even though this information is not
duplicated in `README.md`.

## Runtime environment (not imported as libraries)

RocAgent runs **on top of** the following projects — they provide the
Termux/container/VM environment RocAgent executes inside of; none of their
code is imported, vendored, or bundled into this repository.

| Project | Role | License |
|---|---|---|
| [rootd-fs](https://github.com/ivansslo/rootd-fs) | Rootless container runtime for Termux | MIT |
| [termuxrd](https://github.com/ivansslo/termuxrd) | Termux environment setup | MIT |
| [termuxrd-cloud](https://github.com/ivansslo/termuxrd-cloud) | Phone-to-cloud VM bridge over Tailscale | MIT |

## Design attribution

The `engineering` Agent Multi pipeline (Chief Architect → Lead Developer →
Security Pentester → QA Supervisor) adapts the four-role structure and the
`[ SCORE: A ]` / `[ COVERAGE: 94% ]` / `[ RELEASE: v1.0.0-rc1 ]` sign-off
convention from [roc-webui](https://github.com/ivansslo/roc-webui)'s
"4-Step Engineering Orchestra" (Apache-2.0). No source code from roc-webui
is copied into this repository — `server/agentOrchestra.ts` is an
independent implementation built on RocAgent's own tool-calling
infrastructure (`runOrchestrator`, `toolImplementations`, `commandGuard`)
rather than that project's offline simulator.

Per Apache License 2.0 §4(b)/(c), this NOTICE preserves the attribution
that would otherwise appear in a NOTICE file distributed with roc-webui's
own derivative-work notices, and per §4(a) no roc-webui copyright,
patent, trademark, or attribution notice has been removed — none applied
to the design elements adapted here, as no source was copied.

Author of all four projects above and of RocAgent: **Ivan Ssl**
([@ivansslo](https://github.com/ivansslo)).
