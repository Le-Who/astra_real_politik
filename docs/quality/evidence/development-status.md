# Implementation status

User authorized the existing full implementation plan and an isolated worktree on 2026-09-05.
Worktree: `E:/Projects/astra_real_politik/.worktrees/implementation`.
Branch: `codex/implementation`. Base: `7ecb88c`.
Normal in-scope technical decisions may proceed without renewed approval.
No permission is inferred to spend a provider key or publish infrastructure.

## Work queue

- [x] T01: reproducible workspace and health/startup checks — commit cfa4513, clean-clone check passed; future content/eval/release tools explicitly remain unavailable.
- [ ] T02: core contracts and projection implemented; scenario schema, normalized-domain integration and broader negative coverage remain.
- [ ] T03–T04: transactional persistence, authentication/vault.
- [ ] T05–T09: sourced geography, historical/contemporary packages, temporal knowledge/memory.
- [ ] T10–T19: real AI orchestration, costs, commands, diplomacy and consequences.
- [ ] T20–T30: map, XP desktop, complete game flows, editor, saves and recovery.
- [ ] T31–T36: security, live evaluations, accessibility, performance, deployment, full acceptance.

The full T01–T36 plan and R01–R28/A01–A18/Q01–Q10 criteria remain authoritative.
This file records progress, not reduced acceptance criteria.

## Verification policy (user override)

Batch related implementation work; run only affected tests, type checks and lint checks during development.
Do not run the entire suite for every task/commit. Full-suite runs: **0 / 3**.
Reserve full runs for integrated product, release candidate, and post-fix final acceptance.
Record each full run here before starting it; missing/skipped/live-unavailable results are not passes.
Targeted checks are recorded in the task evidence. Never retry paid/ambiguous calls without authorization.

## Environment

Windows command execution needs `tty: true` in the current tool session.
Without a PTY, shells exited with 0xC0000142 before commands ran.
Use PowerShell with `login: false` and the explicit worktree directory.
System Node is 24.13.0; project runtime will be pnpm-managed Node 24.20.0.
Docker/PostgreSQL executables are not on PATH and their standard Program Files directories were not found. WSL is available; inspect installed distributions or use an isolated portable PostgreSQL dependency for T03. Do not replace PostgreSQL integration tests with an in-memory imitation.

## Next concrete work

Finish T02: scenario/AI runtime envelopes, additional invariant tests and normalized-projection contract for T03/T18/T19. Resource, conflict, treaty and action effects currently fail closed in the core reducer with EXTERNAL_PROJECTION_REQUIRED; they are not implemented gameplay. The trusted external-validation hook is only an integration boundary, not proof of authorization implementation.
Then establish a real test PostgreSQL instance and implement T03 transactions/replay/outbox before authentication/BYOK in T04.
T01 screenshot artifacts were inspected; full UX, content, live AI, deployment and release acceptance remain NOT RUN.
