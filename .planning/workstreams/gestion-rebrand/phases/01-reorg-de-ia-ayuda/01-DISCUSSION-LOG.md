# Phase 1: Reorg de IA + Ayuda - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-07-05
**Phase:** 1-Reorg de IA + Ayuda
**Areas discussed:** Sidebar agrupado, Negocio hub / qué migra, Redirects rutas viejas, FAQ / Ayuda

---

## Negocio hub — tabs migradas (Cobros/Integraciones/Notificaciones)

| Option | Description | Selected |
|--------|-------------|----------|
| Tabs client-side | 1 sola ruta /negocio con tabs internas (igual que /settings hoy). Cero redirects. Reubicar el callback ?mp= a /negocio. | ✓ |
| Sub-rutas reales | /negocio/cobros, /negocio/integraciones, etc. Deep-linkeables pero más trabajo y sí requiere redirects. | |

**User's choice:** Tabs client-side
**Notes:** Resuelve también el área "Redirects rutas viejas": las tabs nunca tuvieron URL propia → no hay ruta vieja a redirigir. Única tarea de behavior-freeze: mover el callback `?mp=connected|error` de /settings a /negocio.

---

## FAQ / Ayuda — ubicación

| Option | Description | Selected |
|--------|-------------|----------|
| Ruta propia + 2 accesos | Página /ayuda linkeada desde el footer del sidebar Y desde Configuración. | ✓ |
| Solo desde el footer | Ruta /ayuda linkeada únicamente desde el footer del sidebar. | |
| Dentro de Configuración | FAQ como sección/tab dentro de /settings, sin ruta propia. | |

**User's choice:** Ruta propia + 2 accesos
**Notes:** Más descubrible, un solo lugar que mantener.

---

## FAQ / Ayuda — formato de contenido

| Option | Description | Selected |
|--------|-------------|----------|
| Array TS + Accordion | Contenido estático en el repo (array de {pregunta, respuesta}) renderizado con Accordion de shadcn. Zero-install*, versionado en git. | ✓ |
| MDX | Archivos MDX con formato rico; suma pipeline MDX (dep nueva). | |
| Tabla en Supabase | Q&A editable sin deploy; overkill para v1 estático. | |

**User's choice:** Array TS + Accordion
**Notes:** *Se flaggeó que el `Accordion` de shadcn NO existe aún en components/ui y sumarlo trae una dep nueva (radix/base-ui). Evaluar `<details>`/`<summary>` nativo zero-install en plan-phase.

---

## Sidebar agrupado — implementación del gating por vertical

| Option | Description | Selected |
|--------|-------------|----------|
| Grupos en el sidebar | Definir los grupos en sidebar.tsx y filtrar cada grupo contra el v.menu del vertical. Sin tocar verticals.ts. | ✓ |
| menuGroups en VERTICALS | Agregar la estructura de grupos a cada VerticalConfig en verticals.ts. Toca el archivo de verticales. | |

**User's choice:** Grupos en el sidebar
**Notes:** El mapeo de grupos (PANEL/AGENDA/GESTIÓN/REPORTES/AJUSTES → items) ya está LOCKED por el mock aprobado + inventario de pantallas; no se re-discutió. Grupo MENSAJES excluido (add-on, fuera de milestone).

---

## Claude's Discretion

- Slug de la ruta de ayuda (`/ayuda` vs `/faq`), orden interno de tabs de Negocio (más allá de Datos primero), microcopy de las secciones del sidebar.
- Decisión final Accordion shadcn (dep nueva) vs `<details>` nativo — flaggeado para plan-phase.
- Draft del set inicial de preguntas de la FAQ (Claude redacta, usuario revisa).

## Deferred Ideas

- Grupo MENSAJES + Bandeja del negocio (add-on agente WhatsApp) — milestone aparte.
- FAQ-base-de-conocimiento del agente — atada al add-on.
- Alta manual + badge de origen + exports CSV — Fase 2. Import CSV — Fase 3.
- Sub-rutas reales / deep-linking de tabs de Negocio — descartado para v1.
