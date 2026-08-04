---
phase: 14-cierre-de-backlog
plan: 01
subsystem: dashboard-ui
tags: [polish, botones, tailwind, tokens-semanticos, riskbadge]
status: complete
requires:
  - "app/globals.css — indirección --danger / --danger-foreground (resuelta en 13-05 #1)"
  - "app/themes.css — pares de peligro por theme"
provides:
  - "Criterio único de ancho de botón (D-01 / D-02) aplicado en Ajustes, Agenda y los 2 forms de alta"
  - "RiskBadge alto = pill relleno de peligro sin dot, en los dos shells"
affects:
  - "app/(dashboard)/settings/settings-client.tsx"
  - "app/(dashboard)/agenda/agenda-client.tsx"
  - "components/dashboard/nuevo-turno-form.tsx"
  - "components/dashboard/nuevo-abono-form.tsx"
  - "components/crm/risk-badge.tsx"
  - "/admin/auditoria y los 4 ConfirmDialog del panel (consumen RiskBadge risk=alto)"
tech-stack:
  added: []
  patterns:
    - "self-start en el call-site para desestirar un <Button> hijo directo de <Card> (flex-column)"
    - "w-full sm:w-auto al final de la lista de clases (molde abonos-client.tsx:480)"
    - "componente compartido consume la indirección --danger, nunca el token de un shell puntual"
key-files:
  created: []
  modified:
    - "app/(dashboard)/settings/settings-client.tsx"
    - "app/(dashboard)/agenda/agenda-client.tsx"
    - "components/dashboard/nuevo-turno-form.tsx"
    - "components/dashboard/nuevo-abono-form.tsx"
    - "components/crm/risk-badge.tsx"
decisions:
  - "D-03 resuelto: los 9 botones desestirados van a la izquierda con self-start, sin justify-end — replican el precedente ya en producción de settings-client.tsx:1568 en vez de abrir un eje visual nuevo por card"
  - "D-01 se aplicó sin excepción también en el panel lateral angosto de Días especiales; el trade-off queda anotado para la UAT visual de 14-07, no se inventó una excepción por contenedor"
metrics:
  duration: "~35 min"
  completed: 2026-08-04
  tasks: 3
  files: 5
  commits: 3
---

# Phase 14 Plan 01: Pulido de ancho de botones + RiskBadge alto — Summary

19 call-sites de botón alineados a un criterio único de ancho (`w-full sm:w-auto` en mobile-first,
`self-start` cuando el estirón lo causaba el `<Card>` flex-column) y la variante `alto` del
`RiskBadge` convertida a pill relleno de peligro sin dot, desde un único componente compartido.

## Qué se hizo

### Task 1 — 8 botones hijos directos de `<Card>` en Ajustes (POLISH-04 causa 2 / D-02)

Commit `596fd43`. Los 8 `<Button>` auditados en `14-PATTERNS.md` §1.b declaraban **cero** clases de
ancho y aun así ocupaban todo el ancho: `components/ui/card.tsx:15` es `flex flex-col`, así que todo
hijo directo hereda `align-items: stretch`. Se les agregó `className="self-start"`, texto literal
idéntico al precedente ya validado en producción (`:1568`):

| Botón | Pantalla |
|---|---|
| Guardar panel | Configuración → Panel del dashboard |
| **Guardar** (Seña) | **Negocio → Cobros** — caso reportado por el dueño |
| **Liberar horarios vencidos** | **Negocio → Cobros** — caso reportado por el dueño |
| Conectar con MercadoPago | Integraciones |
| Conectar Google Calendar | Integraciones |
| Guardar (Notificaciones) | Notificaciones |
| Guardar (reCAPTCHA) | Seguridad |
| Ver planes | Suscripción |

`components/ui/card.tsx` quedó **intacto** (T-14-02): el `flex flex-col` es la causa raíz pero es
transversal a toda la app, así que el fix vive en los call-sites. Los 18 candidatos descartados del
§1.b tampoco se tocaron.

### Task 2 — 9 botones de Agenda y de los dos formularios de alta (POLISH-04 / D-01)

Commit `0729d9d`. `w-full` → `w-full sm:w-auto` (clase nueva al final, molde `abonos-client.tsx:480`)
en: Marcar como cerrado, Quitar excepción, Aplicar horario especial y Copiar a N días
(`agenda-client.tsx`), más los 2 botones del aviso de dedupe de cliente en `nuevo-turno-form.tsx` y
sus gemelos literales en `nuevo-abono-form.tsx` (los que tenían `gap-1.5` conservaron el gap:
`w-full gap-1.5 sm:w-auto`). El "Guardar" de la ventana de reserva (`agenda-client.tsx:946`, causa 2)
recibió `self-start`, igual que su gemelo de Abonos que resuelve el plan 14-03.

Los `Input`/`div` de ancho completo de esos archivos **no** se tocaron: el conteo de `className="w-full"`
bajó exactamente 1 por formulario, como exigía el criterio de aceptación.

### Task 3 — RiskBadge "Alto" con relleno semántico de peligro (POLISH-05 / D-05, D-06, D-07)

Commit `69e41b6`. La variante `alto` pasó de `border-border bg-secondary text-foreground` a
`border-transparent bg-[var(--danger)] text-[var(--danger-foreground)]`, quedando simétrica con
`medio` (que ya era un pill relleno) y resolviendo que "Alto" pesara visualmente **menos** que
"Medio". Se eliminó el bloque del dot de `alto` — con el relleno es redundante. El dot de `bajo`, la
variante `medio` y `RISK_LABEL` quedaron byte-idénticos.

El JSDoc de cabecera describía el comportamiento viejo ("pill oscuro + dot rojo"); se reescribió
dejando asentado el invariante **D-07** (un componente compartido resuelve el peligro por la
indirección, nunca por el token propio de un shell) y la nota de **D-06** (un solo componente, dos
shells, el CRM cambia de aspecto a propósito). `app/globals.css`, `app/themes.css` y
`components/crm/confirm-dialog.tsx` no aparecen en el diff: el badge solo **consume** tokens, no
redeclara ninguno ni recalcula contraste.

## A mirar en la UAT visual (14-07)

Los 3 botones del panel lateral angosto de **Agenda → Días especiales** (`Marcar como cerrado`,
`Quitar excepción`, `Aplicar horario especial`) bajo D-01: a partir de 640px pasan a
ancho-por-contenido dentro de un panel que **sigue siendo angosto** (columna dentro de un
`lg:flex-row`). D-01 es LOCKED y explícitamente "sin excepciones por contenedor", así que se aplicó
igual y el trade-off quedó comentado en el código junto al primero de los tres. **No** se inventó una
excepción ni se revirtió por cuenta propia — se mira en la UAT visual y se decide ahí.

Superficies donde se ve el cambio del badge (verificar en **ambos** shells): `/admin/auditoria` y los
4 ConfirmDialog del panel (`abonos-client.tsx:551`, `settings-client.tsx` `:2491`/`:2530`,
`canchas-manager.tsx:368`). `plan-price-card.tsx` usa `risk="medio"` → no afectado.

## Deviations from Plan

Ninguna. Los 3 tasks se ejecutaron exactamente como estaban escritos, con todos los criterios de
aceptación en verde.

**Nota sobre el comando de verificación:** donde el plan decía `npx tsc --noEmit` se ejecutó
`./node_modules/.bin/tsc --noEmit`. En este repo `npx tsc` baja `tsc@2.0.4` del registro (no es el
compilador) y **siempre sale 0** — es un falso verde documentado del proyecto. `npx vitest` sí
resuelve bien y se usó tal cual.

## Deferred Issues

Las suites de integración de abonos (`test/abono-create`, `test/abono-cancel-routes`,
`test/abono-cron`, `test/abono-generation`) fallan de forma **no determinista** contra el Supabase
local: tres corridas dieron 3, 8 y 7 tests en rojo con conjuntos distintos y el mismo total de 863
tests. Es **pre-existente** — el baseline se tomó antes de escribir la Task 3 y ninguna de esas
suites renderiza los componentes tocados. Registrado en `deferred-items.md` de la fase; queda fuera
de alcance de un plan de pulido de `className`.

## Verification

| Chequeo | Resultado |
|---|---|
| `./node_modules/.bin/tsc --noEmit` | exit 0 (tras cada task) |
| `npx vitest run` | 863 tests totales, igual que el baseline (fallas flaky pre-existentes, ver arriba) |
| `npm run build` | exit 0, build completo |
| `git diff --name-only` (3 commits) | exactamente los 5 archivos de `files_modified`, ninguno más |
| `git diff --stat components/ui/card.tsx` | vacío (T-14-02 mitigado) |
| `git diff --stat app/globals.css app/themes.css confirm-dialog.tsx` | vacío |

Criterios de aceptación por task: 5/5 (Task 1), 8/8 (Task 2), 7/7 (Task 3) — todos verificados con
los `grep -c` exactos que especificaba el plan.

## Threat Model

| Threat ID | Disposición | Estado |
|---|---|---|
| T-14-01 (Information Disclosure, RiskBadge) | accept | Sin cambio: el badge sigue renderizando un literal de un enum de 3 valores; solo cambió el color |
| T-14-02 (Tampering, `components/ui/card.tsx`) | mitigate | **Cerrado**: el archivo no aparece en ningún diff de los 3 commits |
| T-14-03 (DoS, superficie visual) | accept | Backstop = UAT visual bloqueante del plan 14-07 sobre los dos shells (D-06) |

Sin flags de amenaza nuevos: el plan no toca datos, endpoints, queries ni permisos.

## Known Stubs

Ninguno.

## Commits

| Task | Commit | Descripción |
|---|---|---|
| 1 | `596fd43` | desestirar los 8 botones hijos directos de Card en Ajustes |
| 2 | `0729d9d` | alinear a D-01 los botones de Agenda y los dos formularios de alta |
| 3 | `69e41b6` | RiskBadge alto como pill relleno de peligro sin dot |

## Self-Check: PASSED

Los 5 archivos modificados existen en disco y los 3 commits existen en el historial.
