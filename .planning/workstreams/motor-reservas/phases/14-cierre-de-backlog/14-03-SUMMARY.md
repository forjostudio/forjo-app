---
phase: 14-cierre-de-backlog
plan: 03
subsystem: abonos
tags: [polish, seguridad, link-de-baja, integracion, botones]
status: complete
requires:
  - "app/api/abonos/cancel-link/[id]/route.ts — el endpoint on-demand del link de baja (WR-07)"
  - "test/abono-cancel-routes.test.ts — molde de suite de ruta con sesión real del dueño y guards anti-falso-verde"
  - "test/helpers/booking-fixtures.ts — seedOneTenant / teardownOneTenant"
provides:
  - "Gate server-side: una serie con status 'cancelled' ya no entrega su link de baja (D-09)"
  - "Rechazo indistinguible del caso ajeno: cero códigos de error nuevos en el endpoint (T-14-08)"
  - "test/abono-cancel-link.test.ts — 6 casos de integración del contrato del endpoint"
  - "El bloque de copiar el link oculto entero en una serie dada de baja (D-08)"
  - "El Guardar de la ventana de generación de /abonos desestirado (D-01/D-02)"
affects:
  - "app/(dashboard)/abonos/abonos-client.tsx (detalle de la serie + card de la ventana)"
  - "app/api/abonos/cancel-link/[id]/route.ts"
tech-stack:
  added: []
  patterns:
    - "el filtro de exclusión viaja DENTRO de la query (.neq) y no en un if sobre la fila leída: el estado ni se selecciona y no queda rama donde filtrar el motivo del rechazo"
    - "aserción CRUZADA de indistinguibilidad (cuerpo contra cuerpo y status contra status) en vez de dos aserciones contra el mismo literal"
    - "self-start en el call-site para el <Button> hijo directo de <Card> (flex-column + align-items: stretch)"
key-files:
  created:
    - "test/abono-cancel-link.test.ts"
  modified:
    - "app/api/abonos/cancel-link/[id]/route.ts"
    - "app/(dashboard)/abonos/abonos-client.tsx"
decisions:
  - "El rechazo de la serie cancelada reusa el literal exacto que el archivo ya emite 4 veces ({ ok: false, error: 'not_found' } / 404). Inventar un código propio convertiría al endpoint en un oráculo de existencia — que es justo lo que D-09 prohíbe"
  - "El corte es SOLO sobre 'cancelled'. Una serie 'completed' sigue entregando el link: ya asignó sus N sesiones pero esos turnos pueden estar por delante y su cliente necesita la vía de baja (T-14-11). Caso 2 de la suite lo fija"
  - "El bloque de copiar se envolvió en un guard NUEVO con la misma condición del que ya existía (dos ocurrencias de a.status !== 'cancelled'), no se fusionaron en un solo ternario: el bloque de copiar y el par Dar de baja / Serie dada de baja son decisiones independientes y 14-06 va a tocar la segunda"
  - "Se quitó el pt-2 del párrafo 'Serie dada de baja': con el bloque de copiar oculto pasa a ser hijo único de un contenedor que ya trae pt-4, y el pt-2 separaba de un párrafo que ya no está"
metrics:
  duration: "~35 min"
  completed: 2026-08-04
  tasks: 3
  files: 3
  commits: 3
---

# Phase 14 Plan 03: POLISH-06 (link de baja de una serie muerta) + POLISH-04 en Abonos — Summary

Una serie dada de baja dejó de entregar su link de cancelación en las dos capas: el endpoint la
rechaza con el mismo 404 genérico que un id de otro negocio (autoridad) y el detalle deja de ofrecer
el botón (cortesía). El gate está probado contra la base real, incluida la indistinguibilidad.

## Qué se hizo

### Task 1 — El endpoint rechaza la serie cancelada (commit `1a03e2f`)

Un solo `.neq('status', 'cancelled')` sumado a la query de `app/api/abonos/cancel-link/[id]/route.ts`
que ya estaba doblemente scopeada por `id` y `business_id`. El resultado `null` cae en el `if (!abono)`
que ya existía: **ninguna rama de respuesta nueva, ningún código de error nuevo**.

El filtro va **dentro de la query** a propósito y no en un `if` sobre la fila leída — así el estado ni
siquiera se selecciona, el endpoint sigue siendo de una sola columna (T-07-46) y no queda ningún lugar
donde una versión futura pueda filtrar el *motivo* del rechazo.

`abonos.status` es `NOT NULL` con `CHECK` sobre tres valores (migr. 054), así que el filtro de
desigualdad no puede dejar filas afuera por un NULL — la trampa que sí existía en
`appointments.status` (documentada en 13-01).

Se sumó al bloque de cabecera un párrafo explicando el porqué: el token no rota ni vence, una serie
terminal no tiene uso legítimo para él, y el rechazo comparte cuerpo y status con el caso ajeno para
no volverse un oráculo de existencia.

**Verificado por grep (todos los criterios del plan):** `.neq` = 1, `error: 'not_found'` = 4,
`error: '` = 5 (los 4 + el único 401), `.select('cancel_token')` = 1, `createAdminClient|SERVICE_ROLE`
= 0.

### Task 2 — Suite de integración del endpoint (commit `b4ba8ff`)

`test/abono-cancel-link.test.ts`, 220 líneas, **6 casos ejecutados (0 skipped)** contra el Supabase
local. Dos tenants sembrados; en el propio tres series (`active`, `completed`, `cancelled`), en el
ajeno una `active`.

| # | Caso | Espera |
|---|---|---|
| 1 | serie `active` propia | 200 + `url` terminada en el token de esa serie |
| 2 | serie `completed` propia | 200 + `url` — contrapeso de D-09 (T-14-11) |
| 3 | serie `cancelled` propia | 404 `{ ok: false, error: 'not_found' }` |
| 4 | serie `active` **ajena** | 404 idéntico |
| 5 | **cruzado 3 ≡ 4** | mismo status y mismo cuerpo, comparados entre sí |
| 6 | sin sesión | 401 `unauthorized` (el único código distinto) |

Mock único: `@/lib/supabase/server`. Este handler no despacha efectos (no manda mails, no usa
`after()`, no toca el cliente admin), así que no hacen falta el mock parcial de `next/server` ni los
spies de email/secrets del molde de `abono-cancel-routes.test.ts`.

Los **dos guards anti-falso-verde** del molde están (4 menciones de `GUARD`): que el cliente de
aserción tenga sesión anon real —sin ella todo daría 401 y los 404 del gate serían humo— y que la anon
key no sea la service-role key. `SUPABASE_SERVICE_ROLE_KEY` aparece **únicamente** dentro de ese
segundo guard (línea 134), nunca en la construcción del cliente que consume el handler.

### Task 3 — UI del detalle + POLISH-04 en Abonos (commit `dec9c7a`)

(a) El `<Button>` de copiar y su párrafo de ayuda quedaron envueltos en la misma condición de estado
que ya usaba "Dar de baja": desaparecen **juntos**, sin párrafo huérfano y sin estado vacío sustituto
(D-08). El contenedor con borde superior y su `pt-4` se conservan, así que el bloque de acciones no se
pega a "Semanas salteadas" cuando queda solo el párrafo de la serie muerta. Se quitó el `pt-2` de ese
párrafo, que ahora es hijo único del contenedor.

El comentario que encabeza el bloque se actualizó: decía que copiar el link era el único lugar donde
el dueño obtiene la credencial, sin mencionar que deja de ofrecerse. Ahora cita D-08 y deja asentado
que **la autoridad es el endpoint** y esto es solo cortesía de no ofrecer una acción que va a fallar.

(b) `className="self-start"` en el Guardar de la ventana de generación (`:414`), con el texto exacto
del precedente de `settings-client.tsx:1568` y el mismo comentario que 14-01 dejó en su gemelo de
`agenda-client.tsx:946`. Los dos botones que ya cumplían D-01 (`w-full gap-1.5 sm:w-auto`) no se
tocaron, y el predicado de tabs `isAbonoActivo` tampoco (`git diff -U0 | grep -c isAbonoActivo` = 0).

## Prueba de mutación (evidencia de que el test no es falso verde)

Requisito explícito del `<output>` del plan. Con el `.neq` de la Task 1 **quitado a mano**:

```
FAIL  3 — una serie dada de baja NO entrega su link: 404 genérico (D-09)
      → expected 200 to be 404
FAIL  5 — la respuesta ... es INDISTINGUIBLE de la del negocio ajeno (T-14-08)
      → expected 200 to be 404
Tests  2 failed | 4 passed (6)
```

Fallan **exactamente** los dos casos que protegen el gate, y ninguno más. El filtro se restauró
(`git checkout` del archivo commiteado, que además normalizó los fines de línea que había tocado el
`perl` de la mutación) y la suite volvió a 6/6.

## Deviations from Plan

### Ajustes menores

**1. [Rule 3 - Criterio de aceptación mal calibrado] `grep -c 'Copiar link de baja'` da 2, no 1**
- **Encontrado en:** Task 3, al verificar los criterios.
- **Causa:** el string ya aparecía **dos** veces en `HEAD` antes de tocar nada (`:477` dentro del
  comentario del bloque, `:481` como label del botón). El criterio del plan asumía 1.
- **Resolución:** no se cambió nada. El invariante real que el criterio quería fijar —"el botón sigue
  existiendo una sola vez"— se cumple: hay exactamente un `<Button>` con ese label, ahora bajo guard.
  Verificado contra `git show HEAD:...` para confirmar que el 2 es pre-existente y no un duplicado
  introducido por este plan.

**2. [Rule 1 - Aire muerto] Se quitó el `pt-2` del párrafo "Serie dada de baja"**
- **Encontrado en:** Task 3, al cuidar la estructura visual que el plan pide verificar.
- **Issue:** ese `pt-2` separaba el párrafo del texto de ayuda de arriba. Con el bloque de copiar
  oculto el párrafo queda como hijo único de un contenedor que ya trae `pt-4`, y el `pt-2` sumaba 8px
  de aire muerto bajo el borde.
- **Fix:** clase removida, con comentario del porqué. El mensaje quedó intacto (`grep` = 1).

## Estado de la suite completa (flakiness pre-existente)

`npx vitest run` completo, dos corridas:

| Corrida | Falladas | Archivos |
|---|---|---|
| 1 | 5 | `abono-cron` (3), `abono-generation` (1), +1 |
| 2 | 6 | `abono-cancel-routes` (1), `abono-create` (1), `abono-cron` (3), `abono-generation` (1) |

**El conjunto de fallos cambia entre corridas** → es la flakiness pre-existente ya reproducida por los
dos ejecutores anteriores de esta fase (suites de abonos compartiendo el Supabase local). **No es
regresión de este plan**, y en particular:

- `test/abono-cancel-link.test.ts` (el archivo nuevo) pasó **6/6 en las cuatro corridas** — aisladas y
  dentro del run completo.
- Las suites `abono-cancel*` corridas **juntas y aisladas dos veces seguidas** dieron **56/56 verdes
  las dos veces**. El único fallo de `abono-cancel-routes` apareció solo dentro del run completo y no
  se reprodujo en aislamiento → confirmado como flakiness de concurrencia, no regresión.

**Criterio de verde propio de este plan (el que sí es determinista): cumplido.**
- `npx vitest run test/abono-cancel-link.test.ts` → 6 passed, 0 skipped.
- `./node_modules/.bin/tsc --noEmit` → sale 0 (nunca `npx tsc`, que baja `tsc@2.0.4` y siempre sale 0).
- `npm run build` → completa sin error.
- `git diff --name-only HEAD~3 HEAD` → exactamente los 3 archivos de `files_modified`.

## Nota para el plan 14-06 (Wave 2, vuelve a tocar este archivo)

Zonas de `abonos-client.tsx` tocadas por este plan, para que el merge conceptual sea limpio:

1. **`:414`** — el `<Button>` de `saveWindow`: solo se le agregó `className="self-start"` + un
   comentario arriba. Zona lejana a EXTRA-B.
2. **`:473-490` aprox.** — el comentario de cabecera del bloque de acciones (creció ~6 líneas) y el
   nuevo `{a.status !== 'cancelled' && (<>…</>)}` que envuelve el botón de copiar y su párrafo.
3. **`:504` aprox.** — el `<p>` de "Serie dada de baja" perdió su `pt-2` y ganó un comentario arriba,
   **dentro** de la rama `else` del ternario.

El ternario de `Dar de baja` / `Serie dada de baja` (donde 14-06 va a insertar Eliminar) sigue con la
misma forma y la misma condición: lo único que cambió ahí es el `className` del `<p>` del `else`.
**No se tocaron** las píldoras, `ABONO_TABS`, `isAbonoActivo` ni el `ConfirmDialog` de la baja.

## Self-Check: PASSED

- `app/api/abonos/cancel-link/[id]/route.ts` → FOUND
- `test/abono-cancel-link.test.ts` → FOUND
- `app/(dashboard)/abonos/abonos-client.tsx` → FOUND
- commit `1a03e2f` → FOUND
- commit `b4ba8ff` → FOUND
- commit `dec9c7a` → FOUND
