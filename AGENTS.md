# AGENTS.md

Repository: `voicescribe`
Default branch: `0325main`

Read these first:
1. `docs/active/协作约定.md`
2. `docs/active/2026-03-31-phase-status.md`
3. If touching archived Phase 1 logic, also read:
   - `docs/archive/phase1/0325第一阶段改造计划.md`
   - `docs/archive/phase1/2026-03-25-voicescribe-windows-spec.md`
   - `docs/archive/phase1/2026-03-26-implementation-gap-checklist.md`
   - `docs/archive/phase1/第一阶段测试.md`
   - `docs/archive/phase1/2026-03-25-session-bug-log.md`

Priority: `active status > relevant archive spec/checklist > code`

Workflow:
- Update docs before code.
- Test before reporting.
- If the work is still Phase 1 tail-closeout, write test results into `docs/archive/phase1/第一阶段测试.md` before claiming something is tested.
- If the work is still Phase 1 tail-closeout, write new bugs into `docs/archive/phase1/2026-03-25-session-bug-log.md`.
- If a new phase starts, create new active docs instead of continuing to expand archived planning docs.
- Packaging is a final-stage task unless it blocks earlier debugging.

Model path rule:
- Active model/cache root must stay under `<repo>/models/`.
- Do not switch the runtime back to user-profile default caches as the primary path.

Windows PowerShell UTF-8 rule:
- Do not treat console mojibake as proof that a file is damaged.
- When writing Chinese content from the shell, avoid raw Chinese literals inside PowerShell command strings.
- Prefer ASCII-safe scripts, Unicode escapes, and explicit UTF-8 writes.
- After writing Chinese content, verify by UTF-8 re-read instead of only checking console output.
