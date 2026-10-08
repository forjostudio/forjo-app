# Phase 2 — Ítems diferidos (fuera del alcance de los planes de la fase)

## D-1 · `react-hooks/purity` preexistente en `app/(dashboard)/layout.tsx`

- **Encontrado durante:** el gate de eslint del Task 2 del plan 02-01.
- **Qué es:** `./node_modules/.bin/eslint "app/(dashboard)/layout.tsx"` sale **rc 1** con
  `react-hooks/purity` — *"Cannot call impure function during render: `Date.now`"* — sobre el cálculo
  de `daysLeft` del banner de plan.
- **Preexistente, medido, no causado por la fase:** se verificó linteando la versión del archivo **en
  HEAD `49fa195`** (copiada a un archivo sonda en el mismo directorio, para que aplique la misma
  config de eslint, y borrada enseguida): mismo error, misma regla, misma línea, **rc 1**. La única
  diferencia es el número de línea (42 en HEAD → 62 ahora, por las líneas que el plan 02-01 insertó
  arriba).
- **Por qué NO se arregló acá:** regla de alcance del ejecutor — sólo se auto-arreglan los problemas
  causados DIRECTAMENTE por los cambios del task. El cálculo de `daysLeft` no lo toca este plan, y
  arreglarlo implica decidir de dónde sale "hoy" en un Server Component (prop, `headers()`, o
  moverlo al cliente), que es una decisión de diseño con su propia UAT.
- **Consecuencia para los gates de la fase:** el gate de eslint del Task 2 del plan 02-01 lista
  cuatro archivos y espera rc 0; con este error preexistente **nunca** puede dar rc 0. Se corrió
  acotado a los **tres archivos que el plan efectivamente escribe**
  (`panel-bottom-nav.tsx`, `nav-groups.ts`, `sidebar.tsx`) → **rc 0**. Los planes 02-02, 02-03 y
  02-04 que vuelvan a listar `app/(dashboard)/layout.tsx` en un gate de eslint se van a topar con lo
  mismo.
- **Dónde se arregla:** fuera de esta fase (candidato a `/gsd-quick`).
