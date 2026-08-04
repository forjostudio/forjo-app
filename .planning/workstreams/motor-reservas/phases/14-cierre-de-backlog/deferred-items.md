# Phase 14 — Ítems fuera de alcance detectados durante la ejecución

## 14-01 — Suites de integración de abonos inestables (pre-existentes)

**Detectado:** 2026-08-04, durante la verificación del plan 14-01.

`npx vitest run` falla de forma **no determinista** en `test/abono-create.test.ts`,
`test/abono-cancel-routes.test.ts`, `test/abono-cron.test.ts` y `test/abono-generation.test.ts`
(integración contra el Supabase LOCAL). Tres corridas consecutivas dieron 3, 8 y 7 tests en rojo,
con un conjunto **distinto** cada vez y el mismo total de 863 tests.

**Por qué queda fuera de alcance:** el plan 14-01 solo cambia valores de `className` y una variante
`cva`; ninguna de esas suites renderiza los componentes tocados. Las fallas ya estaban antes del
primer commit del plan (baseline tomado tras la Task 2, con la Task 3 sin escribir). Arreglarlas es
trabajo de estabilización de la infra de tests, no de esta fase de pulido.

**Candidato a:** todo propio / milestone de infra de testing.
