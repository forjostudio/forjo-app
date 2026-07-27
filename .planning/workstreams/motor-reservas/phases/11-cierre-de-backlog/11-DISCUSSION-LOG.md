# Phase 11 — Discussion Log

**Date:** 2026-07-27
**Phase:** 11 — Cierre de backlog (última de v0.25 multi-staff)
**Mode:** discuss (3 decisiones directas + fold de extras)

Fase de pulido, no toca el motor. POLISH-02 (eslint setState-in-useEffect) no tiene gris → planner elige la forma idiomática; va incluido sin preguntar.

## Decisiones

### POLISH-01 — indicador cancelada vs completada (Archivados)
- Opciones: chip color semántico (rec.) · chips neutros · ícono+texto
- Elegido: **chip con color semántico** ("Cancelado" muted/destructive · "Completado" success/neutral) → D-01

### POLISH-03 — borde lateral acentuado de las 2 pantallas de cancelación
- Contexto surfaced: el `border-l-4`+accent es patrón app-wide (booking/confirmación/cancelación) → cambiar solo 2 pantallas diverge.
- Opciones: mantener (marca) (rec.) · suavizar solo las 2 · suavizar app-wide
- Elegido: **mantener** — confirmar consistencia entre las 2 + aceptar el finding `side-tab` como intencional, sin cambiar el patrón ni aflojar el endurecimiento público → D-03

### Extras al scope (multiSelect)
- Elegidos: **ambos**
  - **Mensaje de borrado más claro** (folded todo `2026-07-27-mensaje-borrado-servicio-*`) → D-04 (solo copy, 3 toasts)
  - **Default del selector configurable por negocio** (diferido del discuss-10) → D-05/06/07/08. Se le marcó al usuario que es una FEATURE (migr + UI + wiring), no polish; la eligió igual. Default = 'any' (preserva Phase 10).
- cupo-por-solape: reviewed, NOT folded → v0.26 (milestone aparte).

## Claude's discretion (a research/planner)
- POLISH-02: forma idiomática del fix (derivar / key / handler) sin cambiar comportamiento.
- EXTRA-B: mecanismo del setting (columna nueva en `businesses` `public_selector_default DEFAULT 'any'`, migr 061, recomendado) + dónde va el toggle en Ajustes/Negocio.
- POLISH-01: componente de chip reusando la paleta semántica.

## Diferidos
- Cupo por solape → v0.26.
- Suavizar el borde app-wide → no elegido (se mantiene el patrón).
</content>
