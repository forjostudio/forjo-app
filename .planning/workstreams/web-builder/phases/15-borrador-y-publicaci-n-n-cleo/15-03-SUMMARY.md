---
phase: 15-borrador-y-publicaci-n-n-cleo
plan: 03
subsystem: cms-editor-ui
tags: [next16, react19, tailwind4, shadcn, sonner, lucide, landing-cms, a11y, design-tokens]

# Dependency graph
requires:
  - phase: 15-01
    provides: "businesses.landing_draft (migración 050)"
  - phase: 15-02
    provides: "saveLandingDraft / publishLanding() / discardLandingDraft() + deriveEditorState + los dos baselines en el cliente"
  - phase: 14-cms-editor-ui
    provides: "editor visual (web-client.tsx), save bar sticky, Dialog vendorizado"
provides:
  - "Barra publish sticky única: [estado] · Descartar · Guardar · Publicar (D-05)"
  - "Indicador de 3 estados excluyentes con aria-live y glifo propio en 'Publicado' (D-06)"
  - "Link 'Ver mi web' a /[slug] en otra pestaña (D-07)"
  - "Dialog de go-live (primera publicación, derivado de los datos — D-08/D-09)"
  - "Dialog destructivo de descarte con 2 variantes de cuerpo (D-12/D-13)"
  - "ACTION_ERROR_COPY — mapa único código → toast para las 3 acciones"
  - "Token semántico --warning (light + dark, palette-independiente)"
affects: [16-skill-escribe-el-borrador, 17-publish-go-live]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Publicar ENCADENA guardar → publicar SIEMPRE (no `if (dirty)`): publishLanding copia el borrador DE LA DB, así que sin el guardado previo el dueño publicaría algo distinto de su preview"
    - "Estado post-acción resuelto EN MEMORIA (baselines como useState): cero revalidatePath / router.refresh"
    - "Token semántico dark-aware y palette-independiente en globals.css (los bloques [data-palette] no lo tocan, igual que los --chart-*)"

key-files:
  created: []
  modified:
    - app/globals.css
    - app/(dashboard)/web/web-client.tsx

key-decisions:
  - "handlePublish guarda siempre antes de publicar (D-04) y el botón dice 'Publicando…' durante todo el encadenado: para el dueño es UNA acción"
  - "publishedBaseline pasa de useMemo a useState: al publicar, lo publicado pasa a ser el borrador actual en memoria — sin refetch ni invalidación de caché"
  - "El dialog de go-live SOLO confirma (D-11): cero chequeo de calidad pre-publicación; el único filtro de contenido es el Zod estricto del server (invalid_draft)"
  - "Descartar NO toca Storage (D-14): las fotos del borrador quedan huérfanas y el copy del dialog no las menciona"
  - "Token --warning nuevo (#8a5a12 light / #e6b53f dark): --chart-3 daba ≈1.5:1 sobre el crema y --primary ya estaba tomado por 'Cambios sin guardar'"

patterns-established:
  - "Barra de acciones sticky: 1 sola barra, 1 solo CTA primario, min-h-11 en todas las acciones y en los links con buttonVariants"
  - "Confirmación destructiva: foco inicial en la opción segura, el dialog no se cierra antes de la respuesta del server"

requirements-completed: [PUB-04, PUB-05, PUB-06, PUB-07]

# Metrics
duration: 25min
completed: 2026-07-13
status: complete
---

# Phase 15 Plan 03: Borrador y publicación (núcleo) — barra publish Summary

**El editor pasa de "guardar = publicar" a un borrador explícito: una sola barra sticky con `[estado] · Descartar · Guardar · Publicar`, un indicador de 3 estados excluyentes, el dialog de go-live que aparece exactamente una vez en la vida del negocio, y publicar que guarda SIEMPRE antes de publicar.**

## Performance

- **Duration:** ~25 min
- **Tasks:** 3
- **Files modified:** 2 (0 creados)

## Accomplishments

- **Una sola barra, un solo CTA primario (D-05).** El contenedor sticky existente se conservó (`border-t` + `bg-background/95` + `backdrop-blur`); cambió su contenido: Descartar (`ghost`, muted, **sin rojo**) · Guardar (`secondary`, label corto) · **Publicar** (`default`, único acento de la pantalla). Los 3 botones y el link son `min-h-11` (44px) en **todos** los viewports. Mobile (`<sm`): 2 filas — `[estado · Ver mi web]` / `[Descartar · Guardar · Publicar]`, con Descartar `shrink-0` y los otros dos `flex-1`.
- **Indicador de 3 estados excluyentes (D-06).** Consume `deriveEditorState` (15-02, puro y testeado): `● Cambios sin guardar` (accent) → `● Guardado — sin publicar` (**warning**) → `✓ Publicado` (`Check` + muted). Mismo tamaño y peso en los 3, `aria-live="polite"`, punto `aria-hidden`, y **el estado nunca se comunica solo por color** (texto propio + cambio de glifo). Los 4 estados en vuelo (`Subiendo imágenes…`, `Guardando…`, `Publicando…`, `Descartando…`) son overlays transitorios, no un 4º estado.
- **Publicar guarda SIEMPRE antes de publicar (D-04, T-15-13).** `runPublish` encadena `saveLandingDraft(draft)` → `publishLanding()` **sin condicionarlo a "hay cambios sin guardar"**. Motivo: `publishLanding()` copia el borrador **de la DB**, y un negocio nuevo ve la plantilla base sembrada en memoria con `landing_draft = NULL` — sin el guardado previo recibiría *"No hay nada para publicar"* mirando su preview lleno. Si el guardado falla, **no publica**. Si publica bien, los dos baselines pasan a ser el borrador actual **en memoria** ⇒ el indicador cae en `✓ Publicado`.
- **Go-live exactamente una vez (D-08/D-09).** El dialog se abre solo si `publishedBaseline === null`. La condición se **deriva de los datos**: sin casilla "no volver a mostrar", sin preferencia persistida. Las publicaciones siguientes publican de un click. El cuerpo dice explícitamente que **las reservas siguen funcionando dentro de la web** (el miedo real del dueño al apretar el botón). Confirmatorio **no destructivo**, foco inicial en `[Publicar]`, y el dialog **no se cierra antes de la respuesta**.
- **Descarte con fricción (D-12/D-13).** Recicla el `<Dialog>` de confirm-on-exit, que era **código muerto** (el prompt de recarga lo hace el `beforeunload` nativo, que **no se tocó**: sigue atado a "cambios sin guardar", no a "sin publicar"). Dos cuerpos según si el negocio publicó alguna vez, foco inicial en `[Seguir editando]` (la opción segura) y el **único** `variant="destructive"` del archivo. Al descartar sin haber publicado nunca, se **re-siembra la plantilla base** y reaparece el aviso: nunca queda un editor vacío.
- **Los copys que mentían desaparecieron (PUB-05).** `Guardar cambios` y `Todo guardado` = **0 ocurrencias**. El toast de guardado es `Borrador guardado`; el aviso de empty-state ahora se ata a **"nunca publicó"** (no a "el borrador venía vacío") y tiene sus 2 variantes.
- **Token `--warning` (deuda semántica saldada).** 3 líneas en `globals.css`: `#8a5a12` light (**4.97:1** sobre el crema, AA) / `#e6b53f` dark (**8.75:1**, AAA). Palette-independiente. Era obligatorio: `--chart-3` da ≈1.5:1 sobre el crema y `--primary` ya estaba tomado por "Cambios sin guardar" (dos estados del mismo color = indicador roto).

## Task Commits

1. **Task 1:** token `--warning` (light + dark) + `--color-warning` en `@theme inline` — `64fefb6` (feat)
2. **Task 2:** barra publish (3 acciones, 3 estados, link "Ver mi web", `ACTION_ERROR_COPY`, toasts, empty-state) — `5d6f126` (feat)
3. **Task 3:** dialogs de go-live y de descarte destructivo — `94d1094` (feat)

## Files Created/Modified

- `app/globals.css` — **EDIT quirúrgico: 3 líneas agregadas, 0 eliminadas.** `--color-warning: var(--warning)` en `@theme inline`, `--warning: #8a5a12` en `:root, [data-theme='forjo']`, `--warning: #e6b53f` en `.dark`. **No** se tocó ningún bloque `[data-palette=…]`, ni `.crm-shell`, ni los estilos del landing.
- `app/(dashboard)/web/web-client.tsx` — **EDIT por bloques** (nunca reescrito entero). `SAVE_ERROR_COPY` → `ACTION_ERROR_COPY` (mapa único, 11 códigos, fallback a `server_error`), mapas `STATE_LABEL` / `STATE_TONE` / `STATE_DOT`, `publishedBaseline` de `useMemo` a `useState`, estados `publishing` / `discarding` / `showGoLive` / `showDiscardConfirm`, matriz de habilitación (`canDiscard` / `canSave` / `canPublish`), `runPublish` / `handlePublishClick` / `runDiscard` / `openPublicSite`, barra publish, link "Ver mi web" (header en desktop, fila 1 en mobile), aviso de empty-state con sus 2 variantes y los 2 dialogs.

## Evidencia de verificación

```
npx tsc --noEmit                                   → 0
npx eslint "app/(dashboard)/web/web-client.tsx"    → 0 findings
npx vitest run                                     → 497 passed / 36 files (isolation 13/13, 0 skipped)
git diff --stat app/globals.css                    → 3 insertions(+), 0 deletions(-)
git diff --name-only package.json package-lock.json → vacío (CERO dependencias nuevas)
```

Greps de aceptación sobre `web-client.tsx`:

```
min-h-11                                   = 9   (Descartar, Guardar, Publicar, los 2 links, los 4 botones de dialog)
ACTION_ERROR_COPY                          = 5   (definición + 4 usos, uno por rama de error)
SAVE_ERROR_COPY                            = 0
no_draft|publish_failed|discard_failed|invalid_draft = 5
deriveEditorState                          = 2
text-warning = 1 · bg-warning = 1
aria-live="polite"                         = 1
"Todo guardado" = 0 · "Guardar cambios"    = 0   ← los 2 copys engañosos que PUB-05 declara
"Tu web está al aire" = 1 · "Cambios publicados" = 1 · "Borrador guardado" = 1
noopener,noreferrer                        = 1   (el toast; los 2 <a> usan rel="noopener noreferrer")
revalidatePath|router.refresh (sin comentarios) = 0
diff añadido con .storage / landing-assets / .remove( = 0   ← D-14: Descartar no toca Storage
<Dialog                                    = 2   (go-live + descartar; el confirm-on-exit muerto se RECICLÓ)
variant="destructive"                      = 1   ← el rojo vive SOLO en el dialog de descarte
"Vas a perder.*(fotos|imágenes)"           = 0   ← D-14: el copy no promete una limpieza que no ocurre
```

Prohibiciones verificadas por revisión de código:

- **D-11:** ni `runPublish` ni el dialog de go-live evalúan completitud del config. No hay checklist, ni mínimos de contenido, ni bloqueo por "el hero no tiene título". El único rechazo de contenido que ve el dueño es el toast de `invalid_draft`, que viene del Zod estricto del server.
- **D-14:** `runDiscard` solo llama a `discardLandingDraft()` y reconstruye el borrador en memoria. Cero llamadas a Storage.
- **D-04:** la llamada a `saveLandingDraft(draft)` dentro de `runPublish` **no está envuelta en ninguna condición**.

## Human check (a–f) — PENDIENTE

`human_verify_mode: end-of-phase` ⇒ se valida al cerrar la fase (`/gsd:verify-work`), no como checkpoint bloqueante. Requiere `CMS_ENABLED=true` y un negocio con `has_web_custom` en el Supabase local:

- (a) **PUB-03 / SC1:** guardar → indicador `● Guardado — sin publicar` y `/{slug}` sin cambios.
- (b) **PUB-04 / SC2:** publicar → toast + `/{slug}` con el cambio; indicador `✓ Publicado` y los 3 botones apagados.
- (c) **PUB-07 / SC5:** la primera publicación abre "Publicar tu web"; la segunda no abre nada.
- (d) **PUB-06 / SC4:** descartar → el editor vuelve a lo que está al aire (o a la plantilla base + aviso).
- (e) **PUB-08 / SC5 (regresión):** un negocio con landing ya publicada abre en `✓ Publicado` desde el primer render (si abre en `● Guardado — sin publicar` sin haber tocado nada, el compare canónico está roto).
- (f) **Mobile 375px:** barra en 2 filas, 44px de alto, el texto del estado no se trunca.

**og:image (Open Question 1 del RESEARCH):** si tras publicar la og:image queda stale, **no es una regresión de esta fase** — el comportamiento de caché es idéntico al de hoy. Queda como ítem de UAT.

## Decisions Made

- **`publishedBaseline` pasa de `useMemo` a `useState`.** Es lo que permite que el post-publicación se resuelva **en memoria** (D-10) sin `revalidatePath` ni `router.refresh()`: la web pública es `force-dynamic` (no hay caché que invalidar) y revalidar desde un Server Function refrescaría todas las páginas del panel ya visitadas. Efecto colateral querido: `neverPublished` deja de ser `true` apenas se publica ⇒ el aviso de empty-state desaparece y el go-live no vuelve a abrirse, sin recargar.
- **El botón dice `Publicando…` durante todo el encadenado**, no parpadea `Guardando…` → `Publicando…`. Para el dueño es UNA acción.
- **Si el guardado sale bien pero la publicación falla**, `savedBaseline` **igual** se actualiza (el borrador SÍ quedó en la DB) ⇒ el estado queda en `● Guardado — sin publicar` y es recuperable con un click en Publicar. Nada se pierde.
- **`autoFocus` en el confirmatorio del go-live y en `[Seguir editando]` del descarte** (foco en la opción segura cuando la acción es irreversible).

## Deviations from Plan

### Reparto de trabajo entre los commits de Task 2 y Task 3

El `<Dialog>` de confirm-on-exit era código muerto **pero su estado (`showExitConfirm`) sí existía**. Al reemplazar la save bar (Task 2), el botón Descartar necesitaba su dialog para no dejar un commit con una acción rota, así que **el dialog de descarte entró en el commit de Task 2** y Task 3 sumó el de go-live y el rewire de `handlePublishClick`. Cada commit deja el árbol compilando y el editor usable. El resultado final es idéntico al planificado (2 dialogs, el muerto reciclado, `variant="destructive"` = 1).

Sin deviaciones de las Reglas 1–4: no aparecieron bugs, funcionalidad crítica faltante ni bloqueos.

## Issues Encountered

`npm run lint` reporta 588 problemas **preexistentes y fuera de scope** (tooling vendorizado en `.claude/gsd-core/**`, `design_handoff_forjo_rebrand/**`, warnings del React Compiler en componentes viejos del dashboard). `npx eslint` sobre `web-client.tsx` → **0 findings**. No se tocó nada de eso.

## User Setup Required

Ninguno nuevo. Sigue vigente el runbook de 15-01: **la migración 050 se aplica a prod a mano ANTES del deploy del código** (con `NOTIFY pgrst, 'reload schema';`). Para probar el editor en local: `CMS_ENABLED=true`.

## Next Phase Readiness

- **Fase 15 completa a nivel código** (15-01 · 15-02 · 15-03). Queda `/gsd:verify-work` (human check a–f) y `/gsd:secure-phase 15`.
- **Riesgo aceptado heredado (T-15-10 / T-15-12):** la UI **no es un control de seguridad**. Botones deshabilitados y dialogs son cosméticos; los gates reales (flag, sesión, `business_id` de la sesión, `has_web_custom`, Zod estricto) viven en las Server Actions de 15-02. Un dueño que saltee la UI publica, en el peor caso, **su propio** borrador — que es su derecho.
- **Sin blockers.**

## Self-Check: PASSED

- `app/globals.css` — FOUND
- `app/(dashboard)/web/web-client.tsx` — FOUND
- Commits `64fefb6`, `5d6f126`, `94d1094` — FOUND en `git log`

---
*Phase: 15-borrador-y-publicaci-n-n-cleo*
*Completed: 2026-07-13*
</content>
</invoke>
