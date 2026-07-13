---
phase: 03-espacio-compartido
plan: 03
subsystem: settings / motor-reservas
tags: [espacios-fisicos, agenda_spaces, terminologia, verticales, ui-settings]
requires:
  - "spaces / agenda_spaces (tablas + tipos Space/AgendaSpace, Plan 01)"
  - "VerticalTerminology con resource/resources (Task 1)"
provides:
  - "UI de config de espacios físicos compartidos + mapeo agenda→espacios (interim genérica)"
  - "término del eje de agenda 'Cancha'/'Profesional' por rubro (label-only)"
affects:
  - "app/(dashboard)/settings/settings-client.tsx"
  - "app/(dashboard)/settings/page.tsx"
  - "lib/verticals.ts"
tech-stack:
  added: []
  patterns:
    - "CRUD optimista reusando el patrón de professionals (browser client + RLS + toast)"
    - "terminología label-only por type (TYPE_TERMINOLOGY_OVERRIDE)"
key-files:
  created: []
  modified:
    - "lib/verticals.ts"
    - "app/(dashboard)/settings/page.tsx"
    - "app/(dashboard)/settings/settings-client.tsx"
decisions:
  - "La config de espacios es INTERIM y GENÉRICA: sirve a canchas hoy y a gym/consultorio (sala/equipo compartido) mañana, sin pantalla nueva (D-04)"
  - "La experiencia dedicada 'Vertical Canchas' (cancha unificada con precio + duración variable, sin profesionales, booking público propio) queda DIFERIDA a un milestone nuevo; NO se construyó acá"
metrics:
  duration: "~15min (continuación, revisión de claridad)"
  completed: "2026-06-30"
status: complete
---

# Phase 3 Plan 3: Config de espacios físicos compartidos + terminología del eje — Summary

UI dentro del editor de Settings (tab Equipo) para que el dueño cree espacios físicos compartidos y mapee cada agenda a sus espacios, más el término del eje de agenda ("Cancha"/"Profesional") resuelto por rubro — todo label-only, escribiendo por RLS sin pantalla nueva.

## Qué hace la UI

En **Settings → tab Equipo**, debajo del CRUD de agendas/professionals, vive la card **"Espacios físicos compartidos"**:

- **Alta de espacios**: el dueño crea espacios físicos por nombre (p.ej. A, B, C). Insert optimista en `spaces` vía browser client + RLS; toast de confirmación; borrado con la misma actualización optimista.
- **Mapeo agenda→espacios**: por cada agenda (professional) se marcan con chips qué espacios ocupa. Marcar/desmarcar escribe/borra filas en `agenda_spaces` por `(professional_id, space_id)`, optimista.
- **Término del eje por rubro**: para el type "Cancha de fútbol" el eje se nombra "Cancha"/"Canchas"; para salud/belleza/resto, "Profesional"/"Equipo" (override label-only en `lib/verticals.ts`, sin VerticalKey nuevo ni impacto en datos).

Con esto el dueño modela la F11 = {A, B, C}: la cancha grande mapea a los 3 espacios y reservarla bloquea a las cruzadas que comparten cada espacio (el acople de disponibilidad lo resuelven los Planes 01/02).

## Revisión de claridad (esta continuación)

El checkpoint visual (Task 4) volvió con ISSUES: la UI no dejaba claro cómo usar el sistema. Causa raíz: el copy confundía "espacio físico" con "lo reservable" (la agenda), y el término "Cancha" del eje colisionaba con espacios que el usuario también llamaba "Cancha A/B/C". Fix de copy + estructura aplicado (commit `f4f7298`), **solo UI, sin tocar data layer / writes / RLS / verticals**:

1. Título → **"Espacios físicos compartidos"**.
2. Ayuda de la card distingue explícitamente "espacio físico" (lugar real) de "lo reservable", con ejemplo concreto: cancha de fútbol 11 partida en 3 cruzadas → 3 espacios; la grande ocupa los tres.
3. Placeholder del input genérico, que no empuja a nombrar el espacio como lo reservable: **"Sala 1, Sector A, Equipo de pilates…"**.
4. Título del mapeo → **"Qué espacios ocupa cada {resource}"**.
5. Ayuda del mapeo consistente con el ejemplo (sin la referencia confusa a "la cancha grande ocupa todas").
6. **Empty-state**: si no hay agendas reales, en vez de ocultar el mapeo se muestra una guía — "Primero agregá tus {resources} más arriba; después vas a poder marcar qué espacios ocupa cada una."

El copy quedó **genérico**: lee bien tanto si `resourceWord` resuelve a "Cancha" como a "Profesional".

## Carácter interim y diferimiento

Esta pantalla es la **config de espacios INTERIM y GENÉRICA**. Sirve:
- al rubro **canchas** hoy (modelar cruzadas que comparten una cancha grande), y
- a un futuro caso **gym/consultorio** de equipo/sala compartida, sin rediseño.

La experiencia dedicada **"Vertical Canchas"** —cancha unificada con precio + duración variable, sin profesionales, y booking público propio— es una **DECISIÓN DE PRODUCTO que queda DIFERIDA a un milestone nuevo**. NO se construyó en este plan; este screen no la reemplaza ni la bloquea.

## Deviations from Plan

Ninguna en el data layer. La única desviación respecto al plan original es la **revisión de claridad de copy + estructura** sobre el bloque ya implementado, motivada por el feedback del checkpoint humano (Task 4). Es un fix de UI puro (copy, placeholder, título, empty-state); no se modificaron writes, RLS, terminología (`verticals.ts`) ni la carga de datos.

- **[Checkpoint resolution] Revisión de claridad de la config de espacios**
  - **Found during:** Task 4 (human-verify) volvió con ISSUES
  - **Issue:** copy confundía "espacio físico" con "lo reservable"; placeholder empujaba a nombrar mal; sin guía cuando no había agendas.
  - **Fix:** título + ayuda + placeholder + título/ayuda del mapeo + empty-state genéricos y claros.
  - **Files modified:** `app/(dashboard)/settings/settings-client.tsx`
  - **Commit:** `f4f7298`

## Checkpoint (Task 4)

RESUELTO por esta revisión. La config de espacios queda como **interim genérica**; no requiere un nuevo gate visual en esta corrida (la verificación end-to-end del acople de disponibilidad la cubren los Planes 01/02 + los tests CONC).

## Self-Check: PASSED
- `app/(dashboard)/settings/settings-client.tsx` — FOUND (modificado)
- Commit `f4f7298` — FOUND
- `npx tsc --noEmit` — exit 0 (verde)
