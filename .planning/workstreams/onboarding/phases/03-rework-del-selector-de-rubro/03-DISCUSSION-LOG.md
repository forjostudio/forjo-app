# Phase 3: Rework del selector de rubro - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-07-04
**Phase:** 3-Rework del selector de rubro
**Areas discussed:** Campo obligatorio vs opcional + fallback, Alcance en el dashboard, Copy/naming del campo, Negocios existentes / rubros viejos

---

## Campo personalizable: obligatorio vs opcional + fallback en booking

| Option | Description | Selected |
|--------|-------------|----------|
| Opcional + fallback al rubro | Campo libre opcional; si vacío, booking muestra el label del rubro (ej. "Salud"). | ✓ |
| Opcional, vacío = nada | Opcional; si vacío, booking no muestra subtítulo (comportamiento actual). | |
| Obligatorio | No se puede crear el negocio sin completar el campo libre. | |

**User's choice:** Opcional + fallback al rubro.
**Notes:** El rubro (los 4) sigue siendo obligatorio para crear el negocio; el campo libre es el opcional.
Nunca queda sin categoría en booking. Consistente con Phase 2 (todo completable después).

---

## Alcance en el dashboard (Configuración → Negocio)

| Option | Description | Selected |
|--------|-------------|----------|
| Reemplazar por el nuevo patrón | El dashboard usa el mismo selector nuevo (4 rubros + campo libre siempre visible + placeholder + leyenda); se saca el dropdown de subtipos y el toggle "Otro". | ✓ |
| Solo alinear (placeholder + leyenda) | Dejar la lógica actual (grupo + "Otro" + subtipos) y solo sumar placeholder + leyenda. | |

**User's choice:** Reemplazar por el nuevo patrón.
**Notes:** Consistencia total onboarding ↔ dashboard. El settings ya tenía el modelo grupo+label+"Otro";
se unifica al patrón nuevo.

---

## Copy / naming del campo personalizable

| Option | Description | Selected |
|--------|-------------|----------|
| "¿A qué se dedica tu negocio?" | Cercano, invita a describir; placeholder por rubro. | ✓ |
| "Especialidad / actividad" | Neutro y corto. | |
| "Rubro específico" | Empareja con el selector "Rubro" de arriba. | |

**User's choice:** "¿A qué se dedica tu negocio?" (leyenda: "Así aparecerá en tu página de reservas").
**Notes:** Placeholders por rubro confirmados (Salud/Belleza/General/Canchas), patrón "Ej: …".

---

## Negocios existentes / rubros viejos (subtipos granulares)

| Option | Description | Selected |
|--------|-------------|----------|
| Mantener como fuente interna (cero regresión) | Sacar subtipos del selector pero dejar `VERTICALS[key].types` + `getVerticalKeyByType` para resolver existentes. | |
| Limpiarlos de lib/verticals.ts | Eliminar los subtipos; requiere migrar/mapear el vertical de negocios existentes. | ✓ |

**User's choice:** Limpiarlos de lib/verticals.ts.
**Notes:** Implica un **backfill de `vertical` desde `type`** para negocios existentes ANTES de limpiar
(derivando con `getVerticalKeyByType`/`LEGACY_TYPE_VERTICAL`), como seguro de cero regresión. Riesgo real
bajo (casi sin data en prod). Flag para research: consumidores de `ALL_BUSINESS_TYPES` (sugerencia por IA).

---

## Claude's Discretion

- Mecánica de la migración de backfill (nueva migración SQL sobre baseline v0.13).
- Dónde se consume `ALL_BUSINESS_TYPES` y qué hacer con la sugerencia por IA al limpiar subtipos.
- Helper de placeholders por rubro + label de rubro para el fallback en booking.
- Forma exacta del control (Select 4 rubros + Input libre) respetando Bauhaus + mobile-first.

## Deferred Ideas

- Renombrar terminología del vertical más allá del selector → fuera de alcance.
- Construir una sugerencia de rubro por IA nueva → no; solo mapear/decidir la existente.
