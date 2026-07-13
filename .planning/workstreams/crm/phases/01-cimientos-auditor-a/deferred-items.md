# Deferred Items — Phase 01 (workstream crm)

## Out-of-scope pre-existing issues (NOT introduced by plan 01-02)

### tsc TS2348 en test/webhook-deposit.test.ts:104
- **Discovered during:** plan 01-02 verification (`npx tsc --noEmit`).
- **Error:** `Value of type 'Mock<Procedure | Constructable>' is not callable` — `vi.fn()` sin parametrizar bajo `strict: true` (mismo patrón que el plan 01-01 corrigió en `lib/audit.test.ts`).
- **File NOT touched by plan 01-02** (`git diff --quiet HEAD` confirma UNCHANGED). Fuera del scope boundary del executor.
- **Suggested fix (futuro):** tipar el spy con `vi.fn<(...args) => ...>()` explícito, igual que se hizo en `lib/audit.test.ts` (commit de027bf).
