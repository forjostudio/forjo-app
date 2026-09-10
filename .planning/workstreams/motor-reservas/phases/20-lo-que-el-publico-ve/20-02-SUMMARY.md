---
phase: 20-lo-que-el-publico-ve
plan: 02
subsystem: frontend
tags: [booking-publico, react, next16, ux, cobertura-por-servicio, uat-humana]

# Dependency graph
requires:
  - phase: 20-lo-que-el-publico-ve
    plan: 01
    provides: "prop timeBlockServices llegando a BookingClient + catalogo completo sin pre-filtrar + isServiceStaffed"
  - phase: 18-la-agenda-por-servicio
    provides: "lib/time-block-services.ts (isServiceScheduled/blocksForService, regla del comodin) + backstop server-side isServiceAllowedAt"
provides:
  - "app/[slug]/booking-client.tsx: paso 1 con disabled + motivo visible por los DOS ejes de cobertura (franja D-02, staff D-05)"
  - "app/[slug]/booking-client.tsx: derivacion serviceBlocks y openDaysSet por servicio (D-04) — el calendario solo ofrece los dias donde el servicio se da"
  - "AGENDA-07 cerrado end-to-end: el vacio se explica en el selector, no despues de dos pasos"
affects: [21-onboarding]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Los dos ejes de cobertura (franja y staff) se preguntan por servicio con sus funciones hermanas y se pintan con el MISMO molde de deshabilitado-con-motivo, distinguidos solo por el copy"
    - "Fail-safe direccional en el cliente: una prop opcional ausente degrada a la regla del comodin (todo permitido), nunca a apagar el catalogo"
    - "Un filtro de UX que es no-op algebraico sobre el server (starts(todas) − full = starts(ofrecen)) se documenta como tal en el codigo para que nadie lo confunda con una segunda autoridad"

key-files:
  created: []
  modified:
    - app/[slug]/booking-client.tsx

key-decisions:
  - "La precedencia del motivo cuando fallan los dos ejes a la vez es FRANJA primero (el eje de AGENDA-07); el motivo de staff solo aparece cuando la franja si cubre el servicio"
  - "En el cn() de la tarjeta, !enabled se evalua ANTES que la seleccion: con disabled nativo, 'seleccionada Y deshabilitada' es un estado inalcanzable"
  - "serviceBlocks cae a timeBlocks crudo sin servicio elegido: el calendario del paso 1→3 queda byte-identico a hoy y serviceBlocks es siempre un SUBCONJUNTO — nunca puede abrir un dia cerrado"
  - "El escenario de la UAT se sembro por SQL con 4 servicios (uno por verdad) en vez de los 3 del plan reconfigurados a mano: el guion original era contradictorio"

patterns-established:
  - "Deshabilitar-con-motivo en vez de ocultar, aplicado uniformemente a todos los ejes de una misma pantalla: un estado mal configurado no puede verse igual que uno correcto"
  - "Copy del motivo generica para un anonimo: dice QUE falta, nunca QUIEN cubre que ni que tiene que tocar el dueno en su panel"

requirements-completed: [AGENDA-07]

# Metrics
duration: 19min
completed: 2026-09-10
status: complete
---

# Phase 20 Plan 02: Lo que el público ve — el selector explica el vacío Summary

**El paso 1 del booking público deja de mentir: un servicio que ninguna franja cubre o que ningún profesional hace se ve deshabilitado con el motivo escrito debajo —y cada eje con su propio texto—, y el calendario del paso 3 solo ofrece los días donde el servicio elegido realmente se da.**

## Performance

- **Duration:** ~19 min de código y verificación automática (22:20Z → 22:39Z), más la UAT humana en el navegador
- **Started:** 2026-09-10T22:20:05Z
- **Completed:** 2026-09-10T22:38:39Z (código) · UAT humana confirmada por el usuario a continuación
- **Tasks:** 3 (2 de código + 1 de UAT humana)
- **Files modified:** 1

## Accomplishments

- **El paso 1 pregunta los DOS ejes por servicio** y los pinta con el mismo molde: `isServiceScheduled` (franja, `lib/time-block-services`) e `isServiceStaffed` (staff, `lib/staff-services`). Ninguna de las dos reglas del comodín se reimplementó inline — `grep -cE '\.filter\(r => r\.service_id' = 0`.
- **La tarjeta deshabilitada copia el molde exacto** del picker de consultorios del paso 3 (`type="button"`, `disabled`, `border-border/50 bg-secondary/30 opacity-60 cursor-not-allowed`, `<p className="text-xs text-muted-foreground mt-1">`). Cero clases nuevas, cero hex hardcodeado, cero espaciado arbitrario: cuando dos estados idénticos comparten pantalla, comparten pixel.
- **Los dos motivos son distinguibles:** "Sin horarios disponibles" (no hay franja) vs. "Sin profesional disponible" (hay franja, falta staff). Se leen a la vez, uno al lado del otro, verificado en pantalla.
- **El calendario del paso 3 dejó de ofrecer días mudos (D-04):** `openDaysSet` deriva de `serviceBlocks` (las franjas que dan el servicio elegido) en vez de todas las del negocio. Un servicio que solo se da los martes ya no deja clickear el lunes para devolver una grilla vacía.
- **Se cerró la ventana transitoria que abrió el Plan 20-01:** entre los dos planes, un servicio sin cobertura de staff ya no se ocultaba pero todavía no se deshabilitaba —o sea, quedaba reservable—. Ese estado dejó de existir en `fcd8374`.
- **AGENDA-07 cerrado**, que es lo que el Plan 20-01 dejó explícitamente sin marcar porque solo preparaba el dato.

## Task Commits

Cada task de código se commiteó atómicamente:

1. **Task 1: paso 1 con `disabled` + motivo por los dos ejes (D-02/D-05)** — `00a38e2` (feat)
2. **Task 2: `serviceBlocks` y el calendario por servicio (D-04)** — `fcd8374` (feat)
3. **Task 3: UAT humana** — sin commit de código (verificación en navegador; registrada abajo)

## Files Created/Modified

- `app/[slug]/booking-client.tsx` — único archivo tocado en todo el plan:
  - import de `isServiceStaffed` (ampliando el de `@/lib/staff-services`) y de `isServiceScheduled, blocksForService` (`@/lib/time-block-services`);
  - comentario de la prop `timeBlockServices` actualizado (dejó de ser "declarada pero no consumida": ahora dice para qué dos cosas sirve y por qué el `?? []` degrada al comodín);
  - `timeBlockServices` desestructurada en la firma;
  - derivación `serviceBlocks` (`useMemo`) y `openDaysSet` derivado de ella;
  - `services.map` convertido a cuerpo de bloque con `scheduled` / `staffed` / `enabled`, `type="button"`, `disabled={!enabled}`, `cn()` de tres ramas y el párrafo de motivo condicional.

## Decisions Made

- **Precedencia del motivo: franja primero.** Si un servicio falla los dos ejes a la vez se muestra "Sin horarios disponibles". El eje franja es el del requisito de esta fase; el de staff (D-05) entró como unificación de coherencia y se trató como regresión candidata. Está documentado en el código parafraseado, sin citar las cadenas literales, para no romper los greps de conteo exacto del plan.
- **`!enabled` se evalúa antes que la selección en el `cn()`.** Con el `disabled` nativo puesto el `onClick` de una tarjeta apagada nunca corre, así que "seleccionada Y deshabilitada" es inalcanzable; evaluar la selección primero pintaría un borde de foco que el usuario no puede haber producido.
- **`serviceBlocks` cae a `timeBlocks` crudo sin servicio elegido.** La pregunta "¿qué días da este servicio?" no tiene sujeto en el paso 1, y así el calendario queda byte-idéntico al de hoy. Además `serviceBlocks` es siempre un subconjunto de `timeBlocks`: por construcción no puede abrir un día que hoy esté cerrado (T-20-08 mitigado).
- **No se agregó guard en el `onClick`.** El `disabled` nativo ya cancela el evento (Pitfall 4); un segundo guard sería una segunda definición de "reservable" viviendo en el handler.
- **El `?? []` de la prop opcional es el fail-safe direccional heredado del Plan 20-01.** Puente ausente ⇒ comodín ⇒ todo agendado: degrada al comportamiento previo a la migr. 071, nunca apaga el catálogo. Cubre el `<BookingClient>` de fallback del `LandingRenderer`, que no pasa la prop.

## UAT humana (Task 3) — ejecutada por el usuario en el navegador

Entorno: `npm run dev` contra Supabase **local** (`.env.development.local`), negocio `negocio-prueba`, pestaña sin sesión (cliente anónimo). Escenario sembrado (ver desviación):

| Servicio | Franjas que lo dan | Profesionales | Esperado |
|---|---|---|---|
| Corte | 6 días (todos menos martes) | Ana, Bruno | habilitado |
| Cerámica | solo martes | Ana | habilitado |
| Yoga | ninguna | Ana | deshabilitado (franja) |
| Masaje | 6 días | ninguno | deshabilitado (staff) |

Las 4 observaciones, tal como las reportó el usuario (las tres primeras con captura de pantalla):

1. **D-02 — PASS.** La tarjeta **"Yoga"** se ve atenuada en el paso 1, con el texto **"Sin horarios disponibles"** debajo de los "30 min". Al tocarla **no avanza** al paso 2.
2. **D-05 — PASS.** La tarjeta **"Masaje"** se ve atenuada en la **misma pantalla**, con el texto **"Sin profesional disponible"** — un motivo **distinto** al de Yoga, y los dos se leen a la vez, uno al lado del otro: son distinguibles. Tampoco avanza. En la captura del paso 1 se ve el estado completo: Corte $5.000 y Cerámica $4.000 habilitadas con fondo crema; Yoga $3.500 y Masaje $6.000 atenuadas en gris con su motivo respectivo; la barra marca "PASO 1 DE 4 — Servicio".
3. **D-04 — PASS.** Textual: *"D-04 pass, solo los martes aparecen"*. Clic en Cerámica → Ana → calendario del paso 3: **solo los martes** quedan clickeables, el resto de los días cerrados.
4. **Cero regresión (AGENDA-04) — PASS.** Textual: *"probé una reserva de corte y anduvo"*. Reserva de Corte de punta a punta, funcionando igual que antes de la fase.

Ninguna observación reporta haber podido avanzar de paso con una tarjeta deshabilitada.

**Bonus — el editor de chips de la Phase 19 quedó ejercitado:** el usuario mandó además una captura de `/agenda` que confirma el mapeo sembrado tal como lo lee el panel — Lunes/Miércoles/Jueves/Viernes/Sábado/Domingo con "Corte" y "Masaje" tildados, Martes con solo "Cerámica" tildada, los siete con franja 08:00–20:00. O sea que el dato que ve el público y el que muestra el panel coinciden, que es exactamente la coherencia que el milestone persigue.

## Deviations from Plan

### Aprobadas por el coordinador

**1. [Escenario de UAT] 4 servicios sembrados por SQL en vez de 3 reconfigurados a mano**

- **Found during:** Task 3 (preparación del entorno de la UAT)
- **Issue:** El guion del plan era **contradictorio**. Pedía mapear a Ana y a Bruno exclusivamente con "Corte" y después usar "Cerámica" primero como tarjeta **habilitada** (para llegar al calendario y ver D-04) y después como tarjeta **deshabilitada por falta de staff** (para ver D-05). Con ese mapeo, Cerámica queda sin staff desde el minuto cero: nunca se puede llegar a su calendario. Los dos pasos solo coexisten con una reconfiguración a mitad de la UAT que el plan no explicitaba.
- **Fix:** Escenario de **4 servicios**, uno por verdad, sembrado por SQL en la base local: Corte (franja + staff), Cerámica (franja solo martes + Ana), Yoga (sin franja), Masaje (sin staff). Las cuatro verdades se verifican en una sola pasada y **los dos motivos quedan comparables lado a lado en la misma pantalla** — evidencia más fuerte de "distinguibles" que verlos en momentos distintos.
- **Files modified:** ninguno del repo. El SQL vive en el scratchpad de la sesión; solo escribe datos de prueba en el Supabase local.
- **Verification:** la UAT humana pasó 4/4, y la captura de `/agenda` confirma que el panel lee el mismo mapeo.
- **Aprobada explícitamente por el coordinador.**

---

**Total deviations:** 1 (de escenario de verificación, aprobada). **Cero desviaciones de código:** el plan se ejecutó tal como estaba escrito, y los 9 gates de `<verification>` pasaron sin excepción.

### Fuera de alcance (detectado, NO tocado)

- El hook de diseño vuelve a reportar `broken-image` en `app/[slug]/booking-client.tsx` (`<img src={pro.photo_url}>`, paso 2). **Falso positivo preexistente**, ya clasificado como tal en el Plan 20-01: el `<img>` está guardado por `pro.photo_url ?`, tiene rationale escrito y un `eslint-disable` deliberado (no migra a `next/image` porque exigiría `remotePatterns` global). No se tocó ni se silenció.

## Issues Encountered

Ninguno. `tsc`, `eslint` y la suite completa quedaron verdes en cada gate, y la UAT humana pasó 4/4 sin gaps.

## Verificación (los 9 gates del plan)

| # | Gate | Resultado |
|---|------|-----------|
| 1 | `./node_modules/.bin/tsc --noEmit` | exit **0** |
| 2 | `isServiceScheduled(` = 1 + `blocksForService(` = 1 | **2** llamadas a la fuente única de la regla de franja |
| 3 | `isServiceStaffed(` | **1** |
| 4 | `'Sin horarios disponibles'` = **2** · `'Sin profesional disponible'` = **1** | ✅ |
| 5 | `weekly` (`timeBlocks.filter(b => b.day_of_week === date.getDay())`) = **1** · `locHasBlocks` (`timeBlocks.some(b => b.location_id === id)`) = **1** | intactas (Pitfalls 3 y 6) |
| 6 | `git diff -- lib/landing/derive.ts` (D-03, fence 1) | vacío |
| 7 | Las 4 observaciones de la UAT humana registradas | arriba, con textual del usuario |
| 8 | `git diff --name-only HEAD~2 HEAD` | **exactamente** `app/[slug]/booking-client.tsx` |
| 9 | `git diff -- package.json package-lock.json` | vacío |

Extra: `disabled={!enabled}` = **2** (paso 3 existente + paso 1 nuevo) · `type="button"` = **6** (5 + 1) · `.filter(r => r.service_id` = **0** (AGENDA-02) · `new Set(timeBlocks.map(b => b.day_of_week))` = **0** (la línea vieja de `openDaysSet` ya no existe) · `serviceBlocks` = **3** · `eslint` exit **0** · **suite completa: 85 files, 1080 passed / 4 expected fail / 1 skipped**, idéntica al baseline de arranque · `ls supabase/migrations | grep -c '^077'` = **0** (cero migraciones nuevas).

## Known Stubs

Ninguno. La prop `timeBlockServices` pasó de declarada-sin-consumir (estado del Plan 20-01) a consumida en sus dos usos previstos. El estado transitorio que el Plan 20-01 advertía —servicio sin staff ya no oculto pero todavía reservable— **quedó cerrado**: ahora se deshabilita con motivo.

## Threat Flags

Ninguno. Cero superficie nueva: sin queries nuevas, sin endpoints, sin migraciones, sin dependencias. El `disabled` es UX y así está escrito en el código; la autoridad sigue siendo el backstop server-side `isServiceAllowedAt` de la Phase 18, que este plan no tocó ni debilitó (T-20-05, accept). T-20-06 mitigado: la copy es genérica y no nombra profesionales ni instruye acciones del panel. T-20-08 mitigado por construcción: `serviceBlocks ⊆ timeBlocks`. T-20-07 sigue siendo deuda preexistente y ajena a esta fase (el `create` no valida `professional_services` para el camino con profesional específico).

## Next Phase Readiness

- **AGENDA-07 cerrado end-to-end** y verificado en navegador con datos reales: el criterio 1 (a nivel día, D-04) y el criterio 2 (el vacío explicado en el selector, D-02) están los dos en pie.
- **Phase 20 completa** a nivel de sus dos planes: el 20-01 puso el dato, el 20-02 lo hizo visible.
- **Phase 21 (onboarding, AGENDA-08) desbloqueada:** el eje "declara" es lo único que queda; el eje "consume" ya no tiene huecos.
- **Sin deuda de infra:** cero dependencias, cero migraciones (la próxima libre sigue siendo la **077**).
- **Entorno local:** queda con el escenario de UAT sembrado a pedido del coordinador (4 servicios, 2 profesionales, mapeo explícito en las 7 franjas). `supabase db reset` lo devuelve al seed original cuando haga falta.

---
*Phase: 20-lo-que-el-publico-ve*
*Completed: 2026-09-10*

## Self-Check: PASSED

El archivo declarado (`app/[slug]/booking-client.tsx`) existe en disco y los 2 commits de task existen en git (`00a38e2`, `fcd8374`).
