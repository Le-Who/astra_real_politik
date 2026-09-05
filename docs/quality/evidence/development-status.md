# Implementation status

User authorized the existing full implementation plan and an isolated worktree on 2026-09-05.
Worktree: `E:/Projects/astra_real_politik/.worktrees/implementation`.
Branch: `codex/implementation`. Base: `7ecb88c`.
Normal in-scope technical decisions may proceed without renewed approval.
No permission is inferred to spend a provider key or publish infrastructure.

## Work queue

- [ ] T01: reproducible workspace and health/startup checks — in progress.
- [ ] T02–T04: domain contracts, transactional persistence, authentication/vault.
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
Docker is not on PATH; check local PostgreSQL options before T03.
