# Phase 14: CMS editor UI - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-07-08
**Phase:** 14-cms-editor-ui
**Areas discussed:** Preview + layout, Subida de imágenes, Guardar / borrador, Reordenar + on/off de secciones

---

## Preview + layout del editor

| Option | Description | Selected |
|--------|-------------|----------|
| Split: editor + preview en vivo | Panel de edición + preview lado a lado que re-renderiza el landing-renderer REAL con el config borrador (WYSIWYG, sin iframe). Desktop split; mobile toggle. | ✓ |
| WYSIWYG inline | Editar sobre la propia página, campos in-place. Más mágico, mucho más laburo y frágil. | |
| Form apilado + botón "Ver preview" | Formulario + preview a pantalla completa bajo demanda. Más simple, feedback menos inmediato. | |

**User's choice:** Split editor + preview en vivo (re-render del renderer con config borrador).
**Notes:** Reusa `landing-renderer.tsx`; booking queda caja negra en el preview (threat note).

---

## Subida de imágenes

| Option | Description | Selected |
|--------|-------------|----------|
| Directo del navegador (client de sesión) | Upload directo al bucket con el Storage client de sesión; RLS owner-write fuerza {business_id}/. URL al config; borrar toca solo el config (huérfano benigno). | ✓ |
| Vía Server Action | El archivo pasa por el server. Más complejo (multipart), sin aislamiento extra (bucket ya owner-only). | |
| Directo + borrado real del objeto | Como el directo pero borra el objeto en Storage al quitar/reemplazar. Más trabajo y riesgo. | |

**User's choice:** Upload directo del navegador con el client de sesión.
**Notes:** No hay helper de upload en la app todavía (es nuevo). Limpieza de huérfanos diferida.

---

## Guardar / modelo de borrador

| Option | Description | Selected |
|--------|-------------|----------|
| Borrador en memoria + botón Guardar | Borrador cliente; preview lo refleja (SC5); "Guardar" arma el config completo y llama saveLandingConfig. Sin tabla de draft. | ✓ |
| Autosave por cambio | Cada cambio persiste solo (debounced). No encaja con preview-antes-de-persistir ni overwrite-total. | |

**User's choice:** Borrador en memoria + botón Guardar.
**Notes:** Sin publish/go-live (v2). El caller maneja el `{ ok, error }` de saveLandingConfig (WR-03 de Phase 13).

---

## Reordenar + on/off de secciones

| Option | Description | Selected |
|--------|-------------|----------|
| Lista las 8 + toggle + subir/bajar | Se listan siempre las 8 secciones fijas con toggle enabled + botones subir/bajar para order. Sin dependencia nueva. | ✓ |
| Drag-and-drop + toggle | Arrastrar para reordenar + toggle. Más pulido, suma dependencia y complejidad touch/a11y. | |
| Solo activas + menú "agregar" | Lista solo las activas; las apagadas se agregan desde un menú. Oculta el set fijo. | |

**User's choice:** Lista las 8 + toggle + subir/bajar.
**Notes:** Set FIJO; sin crear/borrar secciones. Evaluar en UI si booking/hero quedan siempre enabled.

---

## Claude's Discretion

- Tema/paleta/primary/motion (EDIT-04): NO se discutió — default = reusar el patrón de swatches de
  settings-client apuntado a `landing_config.theme` (preset + overrides.palette + overrides.primary por
  `isSafeColor`) + selector de motion, aplicado en el preview vía `resolveLandingTheme`.
- Ubicación del editor: `app/(dashboard)/web/` gateado por `CMS_ENABLED` server-side, sin nav (hereda Phase 13).
- Estructura fina de componentes, debounce del preview, copy de toasts/labels.

## Deferred Ideas

- Exposición en nav + gating por plan (v2, PUB-01).
- Publish/go-live draft→publicado (v2, PUB-02).
- Limpieza de objetos huérfanos en landing-assets.
- Drag-and-drop de secciones y WYSIWYG inline.
- Tightening per-sección del `data` (discriminated union).
