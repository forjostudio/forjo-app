# Phase 5: Vitest Test Suite (TEST-01) - Discussion Log

> **Audit trail only.** Decisiones canónicas en CONTEXT.md.

**Date:** 2026-06-17
**Phase:** 5-Vitest Test Suite
**Mode:** interactive (default)
**Areas discussed:** DB target, CI wiring, comportamiento DB-tests en CI, estrategia de fixtures (cobertura no seleccionada → default 2 pilares)

---

## DB target (aislamiento)
**Decisión (texto del usuario):** "proyecto dev con fixtures + teardown". No proyecto dedicado, no Supabase CLI local.

## CI wiring
| Option | Selected |
|--------|----------|
| GitHub Actions completo (.github/workflows/test.yml + secrets) | ✓ |
| Script CI-ready + diferir Actions | |

## DB-tests en CI
| Option | Selected |
|--------|----------|
| Skip si faltan creds (webhooks siempre corren) | ✓ |
| Requerir creds siempre | |

## Estrategia de fixtures
| Option | Selected |
|--------|----------|
| Seed suite-level + IDs únicos (__test_<uuid>, beforeAll/afterAll service-role) | ✓ |
| Por-test crear+limpiar | |

## Cobertura (no seleccionada → default)
Dos pilares de TEST-01: aislamiento cross read/write + los 2 webhooks. NO se agregan tests de SEC-03/04.

## Deferred Ideas
- UI/E2E tests → v2.
- Tests de SEC-03/04 → fuera de TEST-01.
- pgTAP / Supabase CLI → no adoptado.
