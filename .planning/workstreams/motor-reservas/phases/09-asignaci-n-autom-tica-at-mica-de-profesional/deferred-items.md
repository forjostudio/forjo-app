# Deferred / Out-of-Scope Items — Phase 09

> Discoveries logged during execution that are NOT caused by this phase's changes.
> Per the Scope Boundary, these are recorded, not fixed, here.

## D-INFRA-01 — Abono tests flaky under default parallel `npm test` (pre-existing)

**Found during:** 09-02 Task 3 (full regression run, D-11).

**Symptom:** Running the FULL suite with vitest's default file-parallelism, 7–11 tests fail
non-deterministically (count varies run to run), ALL confined to the abono files
(`abono-generation.test.ts`, `abono-cron.test.ts`, `abono-create.test.ts`). Typical failure:
an abono tenant's occurrence count includes extra appointments on real-`now()`-relative Mondays
(e.g. `2026-07-27`, `2026-08-31`) that the fixed-future (`2031-…`) assertions don't expect.

**Root cause (not this plan):** the abono forward-generation / rolling-window tests do
time-relative generation against the SHARED local Postgres; when their files run concurrently they
contend and cross-contaminate. This is independent of the 058 migration and of plan 09-02:

- Reproduces with **none of this plan's files in the run**:
  `vitest run test/abono-generation.test.ts test/abono-cron.test.ts test/abono-create.test.ts`
  → 1 failure with zero motor/staff files present.
- `test/abono-generation.test.ts` **alone** → 11/11 green.
- Full suite with `vitest run --no-file-parallelism` → **59 files, 762 passed | 1 skipped, 0 failed.**

**Why not fixed here:** the abono test files and `vitest.config.mts` are unrelated to this plan
(new fixture fn + new test file only). Changing global test parallelism is an infra decision that
affects CI timing and other suites — out of scope for 09-02.

**Recommendation (future infra ticket):** either isolate the abono time-relative tests (freeze
`now()` / pin the rolling window) or run the suite with `--no-file-parallelism` in CI against the
shared DB. Not a motor (`book_slot_atomic`) regression.
