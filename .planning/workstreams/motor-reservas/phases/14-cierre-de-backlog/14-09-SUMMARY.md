---
phase: 14-cierre-de-backlog
plan: 09
subsystem: ui
tags: [tailwind, flexbox, radiogroup, touch-target, shell-scope, design-tokens, uat]

# Dependency graph
requires:
  - phase: 14-01
    provides: "el criterio D-01/D-02/D-03 de ancho y el molde `self-start` en el call-site (9 botones de este mismo archivo)"
  - phase: 14-05
    provides: "el módulo compartido `components/dashboard/active-tabs.tsx` (2 consumos que este plan no puede mover)"
  - phase: 14-08
    provides: "`lib/shell-scope.ts` + `ShellScopeProvider`: el scope del shell viaja al popup portaleado — sin eso el gap 1 no era observable"
provides:
  - "El radiogroup de preselección de profesional de `/equipo` deja de estirarse: segmentado apilado a ancho completo debajo de sm, ancho de contenido desde sm"
  - "Los 3 controles de alta de la vista Equipo auditados uno por uno con veredicto registrado (el inventario que faltaba)"
  - "Teléfono y Email siempre visibles en el alta de profesional (se elimina el enlace desplegable, su estado y su prop)"
  - "`confirmButtonClass(destructive, shellScope)`: la superficie de peligro del confirmar destructivo se condiciona a que haya un shell activo"
  - "UAT visual bloqueante de los 3 gaps de la fase, con 7 observaciones humanas transcritas y 3 defectos corregidos + re-observados"
  - "POLISH-04 y POLISH-05 cerrados con evidencia; REQUIREMENTS.md, ROADMAP.md y 14-VERIFICATION.md dicen lo mismo"
affects: [polish mobile del panel, cualquier fase que toque ConfirmDialog o el scope del CRM]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Mobile-first en los controles segmentados: el ancho completo debajo de sm es deliberado (segmentado), no un estirón accidental; `sm:self-start` devuelve el desktop aprobado"
    - "La superficie de peligro se decide por PRESENCIA de shell (`portalScopeClass()`), no por identidad del CRM"

key-files:
  created: []
  modified:
    - "app/(dashboard)/settings/settings-client.tsx"
    - "components/crm/confirm-dialog.tsx"
    - "components/crm/confirm-dialog.test.tsx"
    - "components/crm/maintenance-toggle.tsx"
    - ".planning/workstreams/motor-reservas/REQUIREMENTS.md"
    - ".planning/workstreams/motor-reservas/ROADMAP.md"
    - ".planning/workstreams/motor-reservas/phases/14-cierre-de-backlog/deferred-items.md"

key-decisions:
  - "Punto 5 (dueño): en mobile el segmentado va a ancho completo pero prolijo, en vez de forzar ancho-de-contenido en todos los anchos"
  - "Punto 3 (dueño): el alcance del rojo de peligro es SOLO el panel del dueño (5 diálogos); el CRM conserva `--danger` (10 diálogos). Se descartaron 'global (15)' y 'solo los 2 de abonos'"
  - "Punto 6 (dueño): la solución no es dar más aire al enlace sino mostrar Teléfono/Email siempre — son solo dos campos"
  - "Ajuste final (dueño): `min-h-11` en mobile en las dos opciones del segmentado; el desktop no se mueve"
  - "La coincidencia de color entre el badge 'Alto' y el confirmar destructivo se conserva DENTRO del CRM por decisión explícita, no por omisión"

patterns-established:
  - "Auditar el inventario completo de una vista (incluidos los controles correctos) en vez de parchar el que se ve mal: el gap de origen fue de inventario, no de técnica"
  - "El checkpoint humano manda sobre la lectura de código: 3 de las 7 observaciones reportaron defectos que ninguna aserción automática detectaba"

requirements-completed: [POLISH-04, POLISH-05]

# Metrics
duration: ~5h de reloj (sesión partida por el checkpoint humano de 2 rondas); ~70min de ejecución efectiva
completed: 2026-08-10
status: complete
---

# Phase 14 Plan 09: Cierre de los gaps 2 y 3 de POLISH-04 + UAT bloqueante de los 3 gaps

**El radiogroup de preselección de `/equipo` deja de estirarse (segmentado a ancho completo con altura táctil de 44px debajo de sm, ancho de contenido desde sm), los 3 controles de alta de Equipo quedan auditados con veredicto, la UAT humana de 2 rondas cierra POLISH-05 y arrastra 3 correcciones no planificadas, y la trazabilidad de la fase queda consistente.**

## Performance

- **Duración:** ~5 h de reloj (18:05 → 22:54), partidas por el checkpoint humano; ~70 min de ejecución efectiva
- **Iniciado:** 2026-08-10T18:05 (commit `2e11c40`)
- **Completado:** 2026-08-10T22:54 (commit `abb7ce8`)
- **Tasks:** 3 (Task 1 auto · Task 2 checkpoint humano bloqueante, 2 rondas · Task 3 auto)
- **Archivos modificados:** 7 (4 de código, 3 de planificación)

## Accomplishments

- **Gap 2 (POLISH-04) cerrado:** el `<div role="radiogroup" aria-label="Preselección del profesional">` era hijo directo de un `<Card>` (`flex flex-col`), cuyo `align-items: stretch` blockifica el ítem y lo estira pese al `inline-flex` propio. Fix en el call-site, nunca en `components/ui/card.tsx`.
- **Gap 3 (POLISH-04) cerrado por auditoría:** los 3 controles de alta de la vista Equipo quedaron inventariados con contenedor, display/align-items, altura declarada y veredicto — incluidos los dos que estaban bien.
- **Gap 1 (POLISH-05) cerrado por el ojo humano:** el dueño confirmó que dentro de los modales del CRM "Alto" y "Medio" se distinguen (rojo vs amarillo). Es la única evidencia admisible para ese requisito.
- **3 defectos que el pipeline verde no veía**, reportados por el dueño y corregidos en este mismo plan (puntos 3, 5 y 6), con segunda ronda de observación aprobada.
- **Altura táctil:** las opciones apiladas del segmentado pasan de 32px a 44px en mobile, mirroreando el control gemelo de `CapacityModeFields`.
- **Trazabilidad consistente:** POLISH-04/05 marcados y en `Complete`, ROADMAP con 14-09 cerrado y la línea de `**Plans**` en su estado final.

## Task Commits

1. **Task 1 (a) — radiogroup de preselección desestirado** — `2e11c40` (fix)
2. *(estado del workstream, pausa en el checkpoint)* — `dd1e770` (docs)
3. **Corrección A del checkpoint (punto 6) — datos de contacto siempre visibles** — `2e3a155` (fix)
4. **Corrección B del checkpoint (punto 5) — segmentado a ancho completo en mobile** — `515ab6d` (fix)
5. **Corrección C del checkpoint (punto 3) — confirmar destructivo del panel al primario del tema** — `0f44da8` (fix)
6. **Backlog de la UAT (2 ítems)** — `b32c5c9` (docs)
7. **Ajuste final aprobado — `min-h-11` en mobile** — `566a7b3` (fix)
8. **Task 3 — trazabilidad de POLISH-04 y POLISH-05** — `abb7ce8` (docs)

## Files Created/Modified

- `app/(dashboard)/settings/settings-client.tsx` — radiogroup de Equipo desestirado + segmentado mobile + altura táctil; alta de profesional con Teléfono/Email siempre visibles (se eliminan el enlace, el estado `proExtraOpen` y la prop `showExtra`)
- `components/crm/confirm-dialog.tsx` — `confirmButtonClass(destructive, shellScope)`: la superficie de peligro se condiciona a la presencia de un shell
- `components/crm/confirm-dialog.test.tsx` — cobertura de la firma nueva (con shell / sin shell / no destructivo)
- `components/crm/maintenance-toggle.tsx` — adecuación al call-site de la firma nueva
- `.planning/workstreams/motor-reservas/REQUIREMENTS.md` — POLISH-04/05 marcados + `Complete` en Traceability
- `.planning/workstreams/motor-reservas/ROADMAP.md` — 14-09 marcado + línea de `**Plans**` en estado final
- `.planning/.../14-cierre-de-backlog/deferred-items.md` — 2 entradas de la UAT

---

## Tabla de auditoría — los 3 controles de alta de la vista Equipo (gap 3)

| # | Control | Contenedor padre | `display` / `align-items` efectivos | Altura declarada del control | Veredicto |
|---|---------|------------------|--------------------------------------|------------------------------|-----------|
| 1 | Botón "Agregar" de **profesional** (`<Button className="gap-1">`) | `<div className="border-t border-border pt-4 space-y-3">` | `display: block` (contenedor de bloque, sin `flex`) / `align-items` no aplica | `h-8` (tamaño default del botón, `inline-flex items-center justify-center`) | **Correcto por layout, no se toca.** Un contenedor de bloque no estira a su hijo: el botón queda al ancho de su contenido sin necesitar `self-start`. **Pero** el dueño reportó otro defecto sobre este mismo bloque —el botón no se veía alineado con el enlace que tenía encima y estaba "casi pegado al texto"—, y la causa estaba en el control #3, no en éste (ver abajo). Tras la Corrección A, el dueño: *"Con los campos visible me gusta como queda el botón."* |
| 2 | Botón "Agregar" de **espacio** (`<Button className="gap-1">`) | `<div className="flex items-end gap-2">`, junto al campo de nombre | `display: flex` / `align-items: flex-end` | Botón `h-8`; `<Input>` hermano también `h-8`; `<Label>` `text-sm leading-none` | **Correcto, no se toca.** El botón y el campo declaran la misma altura y el `items-end` los deja a ras; no hay padre flex-column que lo estire ni desalineación de línea base que corregir. Confirmado a ojo en el punto 6 de la UAT. |
| 3 | Enlace "+ Datos de contacto (opcional)" | mismo bloque que el #1 (`border-t pt-4 space-y-3`) | contenido **en línea** suelto dentro de un contenedor de bloque | sin altura declarada (caja de línea) | **Defecto confirmado por el dueño.** Palabras textuales: *"El boton agregar no esta centrado con \"+ datos de contacto (opcional\" y está casi pegado al texto, quiero darle mas aire. Y sino propongo como solución que los campos esos estén siempre visibles, son solo dos y no cambia mucho."* Corrección aplicada (`2e3a155`): en vez de ajustar el aire del enlace, **se elimina el enlace** y Teléfono/Email quedan siempre visibles; se borran también el estado `proExtraOpen` y la prop `showExtra` de `ProFields`. Es la solución que propuso el propio dueño. Re-observada y aprobada en la segunda ronda. |

**Control extra fuera de la tabla (gap 2, el fix principal):** `<div role="radiogroup" aria-label="Preselección del profesional">`, hijo directo de `<Card className="p-6 space-y-4 mt-4">` (`flex flex-col`) ⇒ estirado por `align-items: stretch`. Fix en el call-site, con el comentario de rigor. **No se tocó** el radiogroup gemelo de `CapacityModeFields`: su padre es `<div className="space-y-1.5">`, un contenedor de bloque que no estira nada.

---

## Las 7 observaciones humanas del checkpoint (transcritas)

> Transcripción literal de lo que escribió el dueño mirando la aplicación. **3 de las 7 (puntos 3, 5 y 6) reportaron defectos en la primera ronda.** No es cierto que "las 7 dieron OK".

**1.** "OK"
*(observado con captura: modal del CRM sobre fondo oscuro, chip "Alto" en rojo y botón "Cambiar plan" en amarillo — se distinguen a simple vista. Es el cierre del gap 1 / POLISH-05.)*

**2.** "Paso captura, no se como estaba antes. Creo que queda bien."
*(el fondo oscuro que el popup del CRM heredó del scope en 14-08 queda ACEPTADO por el dueño.)*

**3.** "OK. El negocio de prueba no es rubro canchas. Podras comparar los modales de abono con el de servicios? Fijate que en los de abono el color del boton desactivar al confirmar toma al color del badge de riesgo y no el del tema. En servicios está bien."

**4.** "Todo ok. Algo que noté, que hicimos en version desktop, que era que el día de la agenda se pinte al pasar el mouse para agregar turno en ese día especifico (captura con martes 11 seleccionado), es que en movil no se distingue eso, obviamente porque no hay cursor. Que solucion le podemos dar para que parezca un boton?"

**5.** "Desktop, ancho de contenido. Movil no se ve muy lindo, queda ancho completo."

**6.** "El boton agregar no esta centrado con \"+ datos de contacto (opcional\" y está casi pegado al texto, quiero darle mas aire. Y sino propongo como solución que los campos esos estén siempre visibles, son solo dos y no cambia mucho. Con los campos visible me gusta como queda el botón."

**7.** "Ok"

**Segunda ronda (re-observación de los 3 puntos corregidos):** "Aprobado todo. Aplica el min-h11"

### Qué disparó cada defecto y cómo se cerró

| Punto | Defecto reportado (ronda 1) | Corrección | Commit | Ronda 2 |
|-------|------------------------------|-----------|--------|---------|
| 3 | El confirmar destructivo de los diálogos de abono toma el color del badge de riesgo en vez del primario del tema | **Corrección C** — `confirmButtonClass(destructive, shellScope)`: la superficie de peligro se pinta solo si hay un shell activo; en el panel cae al primario del tema | `0f44da8` | Aprobado |
| 5 | El recuadro de preselección queda "ancho completo" y feo en mobile | **Corrección B** — debajo de `sm` el recuadro se vuelve un segmentado apilado a ancho completo (deliberado); desde `sm` vuelve exactamente al desktop ya aprobado | `515ab6d` | Aprobado |
| 6 | El botón "Agregar" no queda alineado con el enlace "+ Datos de contacto (opcional)" y está casi pegado al texto | **Corrección A** — Teléfono/Email siempre visibles; se elimina el enlace, el estado `proExtraOpen` y la prop `showExtra` | `2e3a155` | Aprobado |
| 4 | El día de la agenda no tiene afordancia táctil en mobile | **No se arregló acá** — capacidad nueva, necesita diseño; el dueño pidió una propuesta, no un parche | — | Al backlog (`b32c5c9`) |
| — | Ajuste final aprobado en la ronda 2: altura táctil de 44px en mobile en las dos opciones del segmentado | `min-h-11 sm:min-h-0`, copiando la forma del control gemelo de `CapacityModeFields` | `566a7b3` | — |

### Decisiones que tomó el dueño durante el checkpoint

- **Punto 5** — eligió *"ancho completo, pero prolijo"* en mobile por sobre *"ancho de contenido en todos los anchos"*.
- **Punto 3** — eligió el alcance **"solo el panel del dueño"** (5 diálogos) sobre **"global (15)"** y sobre **"solo los 2 de abonos"**. Además **corrigió sobre la marcha una premisa errónea del ejecutor**: el rojo no era exclusivo de abonos; la diferencia que él veía era de **estado** (`hideConfirm` en `/servicios` esconde el botón destructivo y promueve el secundario al primario del tema), no de pantalla. Diagnóstico completo registrado en `deferred-items.md`.
- **Punto 6** — propuso él mismo la solución (campos siempre visibles) en vez de pedir solo más aire.
- **Ajuste final** — aprobó `min-h-11` en mobile, con el desktop sin mover.

---

## Conteos anti-regresión (output literal)

```
$ grep -cE '<Button[^>]*className="self-start"' "app/(dashboard)/settings/settings-client.tsx"
9
$ grep -cE 'role="radiogroup"' "app/(dashboard)/settings/settings-client.tsx"
2
$ grep -cE '<ActiveTabs' "app/(dashboard)/settings/settings-client.tsx"
2
$ grep -c 'aria-label="Preselección del profesional"' "app/(dashboard)/settings/settings-client.tsx"
1
$ grep -c 'sm:self-start' "app/(dashboard)/settings/settings-client.tsx"
1
$ grep -c 'min-h-11' "app/(dashboard)/settings/settings-client.tsx"
3
```

`min-h-11` = 3: el control gemelo de `CapacityModeFields` (1, intacto) + las dos opciones del segmentado de preselección (2, nuevas).

**Criterios de la Task 3 (output literal):**

```
$ grep -nE '^- \[x\] \*\*POLISH-0[45]\*\*' .planning/workstreams/motor-reservas/REQUIREMENTS.md
63:- [x] **POLISH-04**: Los botones de acción del dashboard tienen ancho **consistente** app-wide: …
64:- [x] **POLISH-05**: El `RiskBadge` "Alto" se muestra **con color** (relleno semántico de peligro) …
   ⇒ 2 líneas ✓

$ grep -nE '^\| POLISH-0[4567] \| Phase 14 \| Complete' .planning/workstreams/motor-reservas/REQUIREMENTS.md
108:| POLISH-04 | Phase 14 | Complete |
109:| POLISH-05 | Phase 14 | Complete |
110:| POLISH-06 | Phase 14 | Complete |
111:| POLISH-07 | Phase 14 | Complete |
   ⇒ 4 líneas ✓

$ grep -cE '^- \[x\] 14-0[89]-PLAN\.md' .planning/workstreams/motor-reservas/ROADMAP.md
2 ✓

$ grep -cE '^- \[x\] 14-0[1-7]-PLAN\.md' .planning/workstreams/motor-reservas/ROADMAP.md
7 ✓   (anti-clobber: las 7 entradas previas siguen ahí y marcadas)

$ git diff --stat -- .planning/workstreams/motor-reservas/ROADMAP.md
 .planning/workstreams/motor-reservas/ROADMAP.md | 4 ++--
 1 file changed, 2 insertions(+), 2 deletions(-)
   ⇒ 4 líneas cambiadas, ≤ 20 ✓  (Edit acotado, no Write)
```

**Gates:**

```
$ ./node_modules/.bin/tsc --noEmit ; echo "TSC_EXIT=$?"
TSC_EXIT=0

$ npm run build            → BUILD_EXIT=0

$ npx vitest run components/crm/confirm-dialog.test.tsx test/shell-scope.test.ts
 Test Files  2 passed (2)
      Tests  26 passed (26)
```

**`ShellScopeProvider`** sigue en sus 2 archivos reales: `components/ui/shell-scope.tsx` (definición) y `app/(crm)/layout.tsx` (único consumo). La tercera aparición de `grep -rl` es una **mención en un comentario** de `lib/shell-scope.ts`, no un uso.

**Archivos prohibidos fuera del diff** — `git diff --name-only e8f43c1..HEAD` lista 8 archivos y **ninguno** es `app/globals.css`, `app/themes.css`, `components/crm/risk-badge.tsx`, `components/ui/{card,button,input,label}.tsx`, `components/dashboard/active-tabs.tsx`, `package.json` ni `package-lock.json`. ✓

---

## Deviations from Plan

### 1. [Rule 2 — funcionalidad crítica faltante] Alcance ampliado a 3 archivos del CRM

- **Encontrado durante:** Task 2 (checkpoint humano, punto 3).
- **Qué declaraba el plan:** `files_modified` listaba 3 archivos (`settings-client.tsx` + los 2 de planificación).
- **Qué se tocó además:** `components/crm/confirm-dialog.tsx`, `components/crm/confirm-dialog.test.tsx`, `components/crm/maintenance-toggle.tsx`.
- **Motivo:** el punto 3 del checkpoint reportó un defecto real y el dueño eligió explícitamente el alcance de la corrección. El plan **autoriza** esto: *"El árbitro final es el checkpoint humano de la Task 2: si el dueño reporta que alguno se sigue viendo mal, se aplica el fix que describa su transcripción antes de cerrar este plan"*.
- **Commit:** `0f44da8`.

### 2. [Criterio de aceptación que cambió de valor] `className="self-start inline-flex` pasó de 1 a 0

- **Encontrado durante:** Corrección B (punto 5 del checkpoint).
- **Qué pasó:** el criterio original de la Task 1 exigía `grep -cE 'className="self-start inline-flex'` ⇒ **1**. Al pasar el control a mobile-first, `self-start` viaja como `sm:self-start` y el `className` arranca con `flex w-full flex-col`, así que ese grep ahora devuelve **0**.
- **Qué se hizo:** **no** se forzó la clase para satisfacer el grep. El invariante que ese criterio protegía —"solo el radiogroup de Equipo lleva la clase nueva, el gemelo de `CapacityModeFields` sigue intacto"— se verifica con `grep -c 'sm:self-start'` ⇒ **1**, y con `role="radiogroup"` ⇒ 2 (el gemelo sin tocar).
- **Lección:** un criterio de aceptación escrito sobre una string literal de clases no sobrevive a un cambio de estrategia responsive. El criterio de intención (1 solo control desestirado) sí.

### 3. [Mecanismo] Cómo funciona la Corrección C y por qué respeta D-07

`confirmButtonClass(destructive, shellScope)` pinta la superficie de peligro **solo si** `portalScopeClass(shellScope)` devuelve algo:

```ts
export function confirmButtonClass(destructive?: boolean, shellScope?: string): string {
  return destructive && portalScopeClass(shellScope)
    ? 'bg-[var(--danger)] text-[var(--danger-foreground)] hover:bg-[var(--danger-hover)]'
    : ''
}
```

- Recibe una **string opaca** y pregunta *"¿hay algún shell activo?"*, **no** *"¿estoy en el CRM?"*. Nada acopla el componente al super-admin.
- Reusa `portalScopeClass()`, **la misma función** que decide el scope del popup portaleado de 14-08: las dos superficies no pueden divergir por construcción.
- **`app/globals.css` y `app/themes.css` no se tocaron.** Ningún token se redefinió ni se duplicó ningún hex.
- **Reparto real, contado sobre el repo:** **5** `ConfirmDialog` en el panel del dueño pasan al primario del tema — `abonos-client.tsx` ×2, `settings-client.tsx` ×2 (servicio y espacio), `canchas-manager.tsx` ×1 — y **10** en el CRM conservan `--danger` — `ficha-client.tsx` ×7, `pipeline-client.tsx` ×1, `maintenance-toggle.tsx` ×1, `plan-price-card.tsx` ×1.
  ⚠ **Corrección de un dato previo:** el brief de continuación decía "7 y 8". Era un conteo mal hecho del orquestador. Los números correctos son **5 y 10** (15 call-sites en total), verificados con `grep -rn "<ConfirmDialog" app components`.

---

**Total de desviaciones:** 3 (1 de alcance autorizada por el checkpoint · 1 criterio que cambió de valor sin romper su invariante · 1 aclaración de mecanismo y conteo).
**Impacto:** ninguna desviación agrega alcance por fuera de lo que el checkpoint humano reportó. No se instaló nada. No se tocó producción.

## Issues Encountered

**La suite completa de Vitest no es un gate útil en esta máquina hoy — diagnóstico cerrado.**
`npx vitest run` completo da **725 passed / 9 failed / 23 suites caídas**, y **todas** las fallas son `Test timed out in 5000ms`. La causa es de entorno, no de código: hay **3 stacks de Supabase local levantados** y `http://127.0.0.1:54321/rest/v1/` tarda **2,16 s** solo en el root. Es la continuación del blocker que ya registró `14-08-SUMMARY.md` §"Suite completa" (ahí eran ~1,26 s). **No se re-encuadra como verde y no se re-investiga.**
Lo que **sí** es gate y **sí** está verde: las suites unitarias que este plan toca (`confirm-dialog.test.tsx` + `shell-scope.test.ts`, 26/26), que no van contra la DB, más `tsc` 0 y `build` 0.

## Estado final de POLISH-04 y POLISH-05

| Requisito | Estado | Evidencia |
|-----------|--------|-----------|
| **POLISH-04** | **Complete** | 14-01 (17 botones, criterio D-01/D-02/D-03) + 14-02/03 (Clientes, Abonos) + **este plan**: gap 2 (radiogroup de Equipo desestirado, `2e11c40` → `515ab6d` → `566a7b3`) y gap 3 (los 3 controles de alta auditados con veredicto, tabla de arriba; el único defecto real —el enlace de datos de contacto— corregido en `2e3a155`). Confirmado a ojo en los puntos **5**, **6** y **7** de la UAT. |
| **POLISH-05** | **Complete** | 14-01 (relleno semántico del `RiskBadge`) + 14-08 (causa raíz: el scope del shell viaja al popup portaleado, 12 tests con prueba de mutación) + **punto 1 de la UAT de este plan**: el dueño vio, con captura, el chip "Alto" en rojo y el "Medio" en amarillo dentro de un modal del CRM, distinguibles a simple vista. **Esta observación es la única evidencia admisible** para este requisito: ninguna aserción de código prueba que dos chips se vean de colores distintos. |

## Estado de la fase 14

**La fase 14 queda CERRADA.** Los 9 planes están ejecutados, los 4 requisitos (POLISH-04, 05, 06, 07) están en `Complete`, y los **3 gaps** que registró `14-VERIFICATION.md` están cerrados con evidencia:

| Gap | Severidad | Cerrado por | Evidencia |
|-----|-----------|-------------|-----------|
| 1 — chips "Alto"/"Medio" indistinguibles dentro de los modales del CRM | BLOCKER | 14-08 (mecanismo) + 14-09 punto 1 (ojo humano) | UAT con captura |
| 2 — radiogroup de preselección de `/equipo` a ancho completo | WARNING | 14-09 Task 1 (a) + Corrección B + `min-h-11` | UAT puntos 5 y ronda 2 |
| 3 — controles de alta de `/equipo` sin auditar | WARNING | 14-09 Task 1 (b), tabla de auditoría | UAT punto 6 y ronda 2 |

`REQUIREMENTS.md`, `ROADMAP.md` y `14-VERIFICATION.md` dicen ahora lo mismo. Las 7 entradas previas del ROADMAP (14-01…14-07) quedaron intactas (anti-clobber verificado).

### Ítems mandados al backlog (no arreglados acá)

Registrados en `deferred-items.md`, commit `b32c5c9`:

1. **El día de la agenda no tiene afordancia táctil en mobile** (punto 4 de la UAT). **Motivo:** es una **capacidad nueva** —dotar de afordancia a un control cuyo único feedback es `hover`—, no una regresión de POLISH-04/05 ni uno de los 3 gaps. Además el dueño pidió una **propuesta de solución** (*"¿Qué solución le podemos dar para que parezca un botón?"*), o sea que arranca por diseño. Toca `agenda-client.tsx`, archivo que este plan no abre. **Candidato a:** fase de polish mobile del panel, junto a `panel-mobile-navigation-bugs` y el follow-up de agenda/booking mobile de v0.22.
2. **Diagnóstico del punto 3** (la diferencia de color era de **estado**, no de pantalla). **Motivo:** no queda trabajo pendiente — se registra para que nadie vuelva a diagnosticarlo desde cero, y para que la coincidencia de color que **sigue** existiendo dentro del CRM se lea como **decisión del dueño** y no como defecto por arreglar.

## User Setup Required

Ninguno. No se agregó configuración externa, no hay migraciones nuevas y **producción no se tocó** (la última migración en prod sigue siendo la **066**; la próxima del repo es la **067**).

## Next Phase Readiness

- **Fase 14 cerrada.** Corresponde `/gsd:verify-work` / cierre de milestone v0.26 o el paso siguiente del workstream.
- **Sin deployar:** el código de 14-06 (botón Eliminar), el de 14-08 (scope portaleado) y el de este plan siguen fuera de prod. La base ya tiene el gate de la 066, así que el orden está bien.
- **Cambio visible al deployar:** dentro del CRM los modales se ven con fondo oscuro (heredan el shell) y en el **panel** el confirmar destructivo pasó del rojo al primario del tema. Ambos están aprobados por el dueño, pero conviene anticiparlos.
- **Deuda de entorno (no de código):** la suite completa de Vitest no es confiable en esta máquina mientras haya 3 stacks de Supabase local levantados.

## Self-Check: PASSED

- Archivo declarado existe: `14-09-SUMMARY.md` ✓
- Los 8 commits citados existen en el historial: `2e11c40`, `dd1e770`, `2e3a155`, `515ab6d`, `0f44da8`, `b32c5c9`, `566a7b3`, `abb7ce8` ✓
- Los 5 criterios de la Task 3 y los gates (`tsc` 0, `build` 0, 26/26) verificados con output literal ✓

---
*Phase: 14-cierre-de-backlog*
*Completado: 2026-08-10*
