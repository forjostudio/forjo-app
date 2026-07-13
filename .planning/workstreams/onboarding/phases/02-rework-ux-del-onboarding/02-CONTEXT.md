# Phase 2: Rework UX del onboarding - Context

**Gathered:** 2026-07-03
**Status:** Ready for planning

<domain>
## Phase Boundary

Reducir la fricción del flujo de alta existente (`app/(onboarding)/onboarding/page.tsx`, 4 pasos:
Negocio → Servicios → Profesionales → Horarios) con dos cambios acotados:

1. **Botón "Omitir"** en los pasos **no obligatorios**, que deja el paso sin completar y permite
   llegar al dashboard y cargarlo después desde el panel.
2. **Repaso general de UX**: labels siempre visibles, feedback inmediato (validación inline), orden
   lógico — sobre los pasos ya existentes.

**Fuera de scope (esta fase):** NO se agregan pasos ni campos nuevos, NO es un rediseño visual
completo, NO se toca el motor de agenda/booking ni la reconciliación de horarios (cerrada en Phase 1).
NO se construye el indicador de "onboarding incompleto" en el panel (ONB-PROGRESS-01 → v2).

**Naturaleza del riesgo:** BAJO (UX). No agrega datos de tenant nuevos ni toca el aislamiento. El
onboarding sigue escribiendo sobre el negocio del usuario autenticado (patrón vigente). El único
cuidado de integridad es no dejar el flujo en estado inconsistente al omitir (mitigado: **solo Negocio
es obligatorio**, el resto es completable después → ningún omitible es prerrequisito real de otro).
</domain>

<decisions>
## Implementation Decisions

### Set de pasos obligatorios vs. omitibles (decisión central — ONB-01)
- **D-01:** **Solo el paso "Negocio" (paso 1) es obligatorio.** Es lo mínimo para crear el registro
  (`name`, `slug`, `type`). Los pasos **Servicios, Profesionales y Horarios son omitibles**. Razón:
  no hay data en producción y todo es completable después desde el panel, así que priorizar llegar
  rápido al dashboard es aceptable.
- **D-02:** Con Servicios/Profesionales/Horarios omitibles, la validación bloqueante actual de
  `canGoNext` en los pasos 2 y 3 (que hoy exige ≥1 servicio con name+price y ≥1 profesional con name)
  **se relaja**: esos pasos ya no bloquean el avance. Solo el paso 1 sigue exigiendo sus campos
  obligatorios para avanzar.

### Auto-skip por rubro (vertical Canchas)
- **D-03:** El paso **"Profesionales" se oculta automáticamente en el vertical `canchas`** (una cancha
  no es un profesional humano). En canchas el onboarding queda con 3 pasos (Negocio → Servicios →
  Horarios) y el stepper se ajusta dinámicamente. En el resto de rubros el paso aparece y es omitible
  manual como los demás. La config de cancha (cancha = professional + service_id) se completa después
  desde el panel (`/servicios`), consistente con "todo completable desde el panel". El vertical se
  resuelve con `getVerticalKeyByType(type)` / `lib/verticals.ts` (ya importado en el onboarding).

### Comportamiento del botón "Omitir"
- **D-04:** **"Omitir" avanza al paso siguiente** (skip granular por paso), NO salta directo a
  finalizar. El botón **"Finalizar y entrar al dashboard" solo aparece en el último paso**. El usuario
  recorre el flujo linealmente pero sin obligación de completar los pasos omitibles. (En canchas el
  "último paso" es Horarios, ya que Profesionales no existe.)

### Representación del paso omitido
- **D-05:** Un paso omitido **solo deja el dato vacío** — no se inserta nada (los inserts de
  `handleFinish` ya filtran vacíos: `services.filter(s => s.name)`, `professionals.filter(p => p.name)`,
  días sin bloques). **NO se agrega flag/columna de estado de onboarding** ni CTA dedicado. El panel ya
  muestra sus empty states naturales (Servicios/Equipo/Agenda vacíos). El indicador de "onboarding
  incompleto" es ONB-PROGRESS-01 (v2, diferido).

### Repaso de UX (ONB-02)
- **D-06:** **Orden de pasos: se mantiene** Negocio → Servicios → Profesionales → Horarios (identidad
  → oferta → equipo → disponibilidad). En canchas: Negocio → Servicios → Horarios.
- **D-07:** **Labels siempre visibles en Servicios.** Hoy los labels ("Nombre", "Min.", "Precio") solo
  se renderizan en la 1ª fila (`{i === 0 && <Label…>}`). Cambiar a un **encabezado de columnas fijo**
  (o repetir labels) para que el label sea visible sin importar en qué fila se esté.
- **D-08:** **Validación inline con feedback inmediato (onBlur)** en los campos con formato (ej.
  WhatsApp, precio). Hoy solo Horarios valida inline (`validateHours`) y el slug verifica en vivo;
  extender ese criterio al resto de los campos con formato, con error inline inmediato en vez de solo
  al intentar avanzar/finalizar.
- **D-09:** **Se permite precio 0** en una fila de servicio completada (ej. consulta/servicio
  gratuito). Cambia la regla actual (`canGoNext` exige `price > 0`). Criterio nuevo: filas vacías se
  ignoran; una fila con nombre se acepta con precio ≥ 0. (Verificar que el insert de `services` y el
  panel de Servicios toleren precio 0.)

### Claude's Discretion
- Copy exacto del botón "Omitir" (ej. "Omitir" vs. "Omitir por ahora" / "Completar después").
- Ubicación/estilo del botón "Omitir" en la barra de navegación (junto a "Siguiente" vs. como link
  secundario) — respetar el diseño Bauhaus dark y los estados hover/focus/active existentes.
- Forma exacta del encabezado de columnas en Servicios (header sticky vs. labels repetidas).
- Mecánica del stepper dinámico en canchas (recalcular índices/total de pasos) — seguir el patrón del
  array `steps` actual, filtrando Profesionales por vertical.
- Detalle de qué campos con formato reciben validación onBlur y sus mensajes (seguir el patrón de
  `validateHours` y del error de WhatsApp ya existente).
</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Archivo a modificar (núcleo de la fase)
- `app/(onboarding)/onboarding/page.tsx` — el flujo completo: estado de los 4 pasos, `canGoNext`
  (validación de avance, ~línea 324), `handleFinish` (inserts filtrados, ~línea 223), array `steps`
  (~línea 317), stepper (~línea 348), y la barra de navegación Atrás/Siguiente/Finalizar (~línea 659).

### Resolución de vertical (para el auto-skip de canchas, D-03)
- `lib/verticals.ts` — `getVerticalKeyByType(type)`, `TYPE_GROUPS`, `VerticalKey` (incluye `'canchas'`,
  v0.13). Ya importado en el onboarding.

### Panel donde se completan los pasos omitidos después (D-05 — empty states)
- `app/(dashboard)/servicios/page.tsx` — completar Servicios luego (y config de canchas).
- `app/(dashboard)/equipo/page.tsx` — completar Profesionales luego.
- `app/(dashboard)/agenda/agenda-client.tsx` — completar/editar Horarios luego (`saveHours`, patrón de
  `time_blocks` + `validateBlocks`, referencia de validación inline para D-08).

### Roadmap / requirements
- `.planning/workstreams/onboarding/ROADMAP.md` §"Phase 2" — goal, criterios, decisión de fase.
- `.planning/workstreams/onboarding/REQUIREMENTS.md` — ONB-01, ONB-02 (y v2: ONB-PROGRESS-01 diferido).

### Fase previa (contexto de horarios — ya cerrada, NO re-tocar)
- `.planning/workstreams/onboarding/phases/01-reconciliaci-n-de-horarios/01-CONTEXT.md` — Phase 1 ya
  migró el paso de Horarios a `time_blocks` + horario partido (D-04/D-06 de esa fase). Esta fase NO
  cambia dónde se escriben los horarios, solo la UX del paso.

### Skills / convenciones
- Skill `convenciones-forjo` — stack, verticales, naming, patrón Server/Client component.
- CLAUDE.md (UI/UX): labels siempre visibles, feedback inline onBlur, estados hover/focus/active,
  touch targets ≥44px, mobile-first 375px — guían el repaso de UX (ONB-02).
</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `handleFinish` ya inserta todo al final en un solo flujo y **filtra vacíos** (`services.filter(s =>
  s.name)`, `professionals.filter(p => p.name)`, días sin bloques no insertan) → "omitir" NO requiere
  cambiar el modelo de datos: nada se persiste hasta Finalizar y los vacíos ya se descartan. El cambio
  es de **navegación + validación**, no de persistencia.
- El array `steps` (~línea 317) y `canGoNext` (~línea 324) son los dos puntos donde se controla el
  flujo/gating → ahí viven los cambios de omitibles (D-01/D-02) y del stepper dinámico (D-03).
- El paso de Horarios ya tiene el patrón de validación inline (`validateHours`, error por bloque) y el
  WhatsApp ya valida formato en `handleFinish` → base para extender el onBlur del D-08.
- `selectPalette` ya da feedback inmediato (tiñe el documento al instante) — modelo de "feedback
  inmediato" a imitar en otros campos.

### Established Patterns
- Componentes `'use client'` con estado local por paso; shadcn (`Input`, `Label`, `Select`, `Button`,
  `Card`, `Badge`) + `lucide-react` + `toast` de `sonner` para feedback.
- Campos opcionales marcados con `(opcional)` en el label (patrón ya presente en WhatsApp/Instagram/
  Dirección) — reutilizable para señalizar pasos/campos omitibles.
- Stepper con índice `s.n` y estado `step` — el total de pasos hoy es fijo (4); D-03 lo vuelve
  dependiente del vertical.

### Integration Points
- `getVerticalKeyByType(type)` (ya usado para los hints de salud/belleza, ~línea 410) es el mismo hook
  para decidir si mostrar el paso Profesionales (D-03).
- Los empty states del panel (Servicios/Equipo/Agenda) son el "destino" de los pasos omitidos (D-05):
  no requieren cambios en esta fase, solo que existan (ya existen).

### Security / Isolation (relevancia: BAJO — UX, sin datos de tenant nuevos)
- `handleFinish` escribe siempre con `business.id` del negocio recién creado por la sesión del owner
  (aislamiento por tenant + RLS ya vigentes). "Omitir" no debilita ninguna validación server-side ni
  permite escribir sobre otro tenant. `linkLeadOnSignup` (conversión CRM, service-role, re-deriva el
  email del owner) queda intacto y best-effort.
</code_context>

<specifics>
## Specific Ideas

- "Omitir" debe dejar llegar al dashboard sin trabar el alta, pero recorriendo el flujo (avanza paso a
  paso, no salta al final) — el usuario ve qué está salteando.
- Canchas: el paso "Profesionales" no tiene sentido (la cancha no es una persona) → desaparece del
  flujo para ese rubro, sin que el usuario tenga que "omitirlo" manualmente.
- Servicios gratuitos son válidos (precio 0) — no todo servicio tiene precio.
</specifics>

<deferred>
## Deferred Ideas

- **ONB-PROGRESS-01** — indicador de "onboarding incompleto" en el panel que recuerde completar los
  pasos omitidos → v2. En v0.14 alcanza con que el dato quede completable desde el panel (D-05).
- **Renombrar el paso Profesionales según terminología del vertical** (más allá del auto-skip de
  canchas) — considerado en la discusión, NO se toma (mantiene el alcance acotado; sería tocar
  `lib/verticals`/terminología más de lo necesario).
- **Reordenar los pasos** — evaluado, se mantiene el orden actual (D-06).
- **Rediseño visual completo del onboarding** — fuera de scope (REQUIREMENTS §Out of Scope).

### Reviewed Todos (not folded)
None — no había todos pendientes que matchearan esta fase.

</deferred>

---

*Phase: 2-Rework UX del onboarding*
*Context gathered: 2026-07-03*
