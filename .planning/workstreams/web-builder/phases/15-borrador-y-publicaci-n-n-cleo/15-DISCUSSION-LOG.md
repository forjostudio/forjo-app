# Phase 15: Borrador y publicación (núcleo) - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-07-12
**Phase:** 15-Borrador y publicación (núcleo)
**Areas discussed:** Modelo de guardado, Barra de acciones y estados, Publicar y go-live, Descartar borrador, + zonas grises adicionales (Guardar↔Publicar, chequeo pre-publish, gate)

---

## Modelo de guardado

| Opción | Descripción | Elegida |
|--------|-------------|---------|
| Guardar explícito (como hoy) | Se mantiene el botón "Guardar" (ahora escribe `landing_draft`) + se agrega "Publicar". Cambio mínimo sobre Phase 14. | ✓ |
| Autosave del borrador | Borrador con debounce ~1-2s; único botón real = "Publicar". Menos fricción, más escrituras y errores sin botón que reintentar. | |
| Híbrido | Autosave + botón Guardar visible. | |

**User's choice:** Guardar explícito.

### Destino del borrador al publicar

| Opción | Descripción | Elegida |
|--------|-------------|---------|
| Queda como copia de lo publicado | Publicar copia draft → `landing_config`; el borrador sigue existiendo idéntico. "Sin publicar" = comparación draft ≠ publicado. | ✓ |
| Se limpia a NULL | "Sin publicar" = existe borrador. Dos caminos de lectura en el editor; descartar y publicar convergen. | |

**User's choice:** Queda como copia de lo publicado (recomendado).

---

## Barra de acciones y estados

| Opción | Descripción | Elegida |
|--------|-------------|---------|
| Todo en la barra inferior | Una sola barra sticky: `[estado] — Descartar · Guardar · Publicar`. | ✓ |
| Publicar arriba, Guardar abajo | Separa "trabajo en curso" de "salir al aire"; dos zonas de acción. | |
| Barra + panel de publicación | Bloque "Publicación" en el panel; el CTA deja de estar siempre visible. | |

### Comunicación de los 3 estados (PUB-05)

| Opción | Descripción | Elegida |
|--------|-------------|---------|
| Un solo indicador de 3 estados | `● Cambios sin guardar` → `● Guardado — sin publicar` → `✓ Publicado`. | ✓ |
| Badge "sin publicar" persistente | Indicador de guardado + badge separado. Dos indicadores compitiendo. | |

### Ver lo publicado

| Opción | Descripción | Elegida |
|--------|-------------|---------|
| Link "Ver mi web" a `/[slug]` | El preview siempre muestra el borrador; la web real se abre en otra pestaña. | ✓ |
| Toggle Borrador \| Publicado en el preview | Comparación sin salir del editor; hay que mantener el config publicado en el cliente. | |
| Las dos | Toggle + link. | |

**User's choice:** barra inferior única, indicador de 3 estados, link "Ver mi web".

---

## Publicar y go-live

| Opción | Descripción | Elegida |
|--------|-------------|---------|
| Solo la primera vez | Publicar sale de una; la PRIMERA publicación confirma (reemplaza la página de reservas, PUB-07). | ✓ |
| Siempre | Dialog en cada publicación. | |
| Nunca | Un click, sin dialog; el go-live inicial pasa sin aviso. | |

**User's choice (free-text):** *"podemos poner una casilla de no volver a mostrar o mucho toqueteo?"*
**Notes:** Se le explicó que con "solo la primera vez" la casilla es innecesaria: la condición se
deriva de los datos (`landing_config IS NULL`), el dialog aparece una vez en la vida del negocio y no
vuelve. La casilla solo tendría sentido confirmando en cada publicación, y ahí habría que persistir
la preferencia (localStorage o columna nueva = el estado que el milestone evita). Confirmó: *"vamos
con esa"* → **confirmación solo la primera vez, sin casilla**.

### Copy del aviso de primera publicación

| Opción | Descripción | Elegida |
|--------|-------------|---------|
| Directo y concreto | "A partir de ahora, quien entre a forjo.studio/tu-slug va a ver tu web en vez de la página de reservas simple. Las reservas siguen funcionando igual, dentro de tu web." | ✓ |
| Corto | "Tu web va a quedar al aire en forjo.studio/tu-slug. ¿Publicar?" | |

### Feedback post-publicación

| Opción | Descripción | Elegida |
|--------|-------------|---------|
| Toast con acción "Ver mi web" | `toast.success('Tu web está al aire')` + acción que abre `/[slug]`. | ✓ |
| Toast simple | Solo "Publicado". | |
| Dialog de éxito la primera vez | Celebra el go-live; una pantalla más que cerrar. | |

---

## Descartar borrador

| Opción | Descripción | Elegida |
|--------|-------------|---------|
| Dialog destructivo | "Vas a perder todos los cambios que no publicaste. Tu web al aire no se toca." | ✓ |
| Sin confirmación + deshacer | Toast con "Deshacer"; el undo se pierde al recargar. | |

### Descartar sin haber publicado nunca

| Opción | Descripción | Elegida |
|--------|-------------|---------|
| Vuelve a la plantilla base | Se siembra `DEFAULT_LANDING_CONFIG` + aviso de empty-state (camino que ya existe). | ✓ |
| Estado "sin web" explícito | Empty-state distinto con botón "Empezar desde la plantilla". | |

### Fotos huérfanas en Storage

| Opción | Descripción | Elegida |
|--------|-------------|---------|
| Quedan huérfanas | No se toca Storage (misma decisión que Phase 14, D-02c). | ✓ |
| Borrarlas al descartar | Requiere diffear URLs draft vs publicado; un borrado mal calculado se lleva una foto que SÍ está al aire. | |

---

## Zonas grises adicionales (segunda ronda)

### Guardar ↔ Publicar (el borrador que se publica es el de la DB)

| Opción | Descripción | Elegida |
|--------|-------------|---------|
| Publicar guarda primero | Con cambios sin guardar, "Publicar" encadena guardar → publicar. El dueño nunca publica algo distinto de lo que ve. | ✓ |
| Publicar deshabilitado si hay cambios sin guardar | Modelo explícito; dead-end visual. | |
| Publicar lo guardado, y avisar | Publica algo distinto de lo que ve — la sorpresa que se evita. | |

### Chequeo de contenido antes de publicar

| Opción | Descripción | Elegida |
|--------|-------------|---------|
| No chequea nada | Si Zod lo acepta, se publica. El renderer es fail-safe y el preview muestra la verdad. | ✓ |
| Checklist blando | Advertencias no bloqueantes en el dialog. Reglas de calidad nuevas a mantener. | |
| Bloquea si falta lo esencial | Paternalista; frena el go-live. | |

### Gate / exposición en esta fase

| Opción | Descripción | Elegida |
|--------|-------------|---------|
| Todo detrás del flag, sin tocar el nav | Publicar/Descartar en el editor actual (`CMS_ENABLED` + `has_web_custom`, sin entrada en el menú). | ✓ |
| Aprovechar y exponerlo ya | Sería PUB-01 (Phase 17) — rompe el orden LOCKED del milestone. | |

---

## Claude's Discretion

- Firma/granularidad de las Server Actions nuevas y cómo se implementa "publicar guarda primero"
  (dos actions encadenadas vs una `publish` que valida+persiste el borrador y después copia).
- Cómo se pasa el config publicado como baseline y cómo se compone el estado de 3 valores en
  `web-client.tsx`.
- Copy exacto de los toasts de error y microcopy de botones.
- Detalle de la migración 050 (dentro de las restricciones: aditiva, backfill desde `landing_config`,
  validada con `supabase db reset`, aplicada a mano en prod).

## Deferred Ideas

- Autosave del borrador (evaluado y descartado en esta fase).
- Toggle Borrador|Publicado en el preview.
- Checklist de calidad pre-publicación.
- Limpieza de imágenes huérfanas en Storage (backlog, heredado de Phase 14).
- Confirm-on-exit por navegación interna (ya diferido en el milestone).
