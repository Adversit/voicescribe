# AGENTS.md

Repository: `voicescribe`
Default branch: `0325main`

Read these first:
1. `docs/active/协作约定.md`
2. `docs/active/0325第一阶段改造计划.md`
3. `docs/active/2026-03-25-voicescribe-windows-spec.md`
4. `docs/active/2026-03-26-implementation-gap-checklist.md`
5. `docs/active/第一阶段测试.md`
6. `docs/active/2026-03-25-session-bug-log.md`

Priority: `plan > spec > checklist > code`

Workflow:
- Update docs before code.
- Test before reporting.
- Write test results into `docs/active/第一阶段测试.md` before claiming something is tested.
- New bugs must be written into `docs/active/2026-03-25-session-bug-log.md`.
- Packaging is a final-stage task unless it blocks earlier debugging.

Model path rule:
- Active model/cache root must stay under `<repo>/models/`.
- Do not switch the runtime back to user-profile default caches as the primary path.

Windows PowerShell UTF-8 rule:
- Do not treat console mojibake as proof that a file is damaged.
- When writing Chinese content from the shell, avoid raw Chinese literals inside PowerShell command strings.
- Prefer ASCII-safe scripts, Unicode escapes, and explicit UTF-8 writes.
- After writing Chinese content, verify by UTF-8 re-read instead of only checking console output.
