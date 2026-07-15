# Phase 17: Exponer el CMS a clientes reales - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-07-15
**Phase:** 17-exponer-el-cms-a-clientes-reales
**Areas discussed:** Entrada al editor en el panel, Qué ve un dueño SIN el add-on, Apagador de emergencia post-flag

---

## Entrada al editor + qué ve un no-entitled (áreas acopladas)

| Option | Description | Selected |
|--------|-------------|----------|
| Upsell visible (el CMS vende el add-on) | Ítem de nav visible para todos. Entitled → editor. No-entitled → pantalla de upsell con CTA. Superficie de venta del add-on pago. | ✓ |
| Invisible para no-entitled (como hoy) | Ítem solo para entitled; no-entitled no ve nada y URL directa → 404. | |
| Híbrido (visible solo entitled + upsell por URL) | Ítem solo para entitled, pero URL directa de no-entitled → upsell en vez de 404. | |

**User's choice:** Upsell visible — el editor no-entitled es superficie de venta, no un 404.
**Notes:** Decisión de monetización explícita. Reemplaza el `notFound()` actual por render condicional.

### Sub-decisión: ubicación del ítem de nav

| Option | Description | Selected |
|--------|-------------|----------|
| Ítem propio en el sidebar ('Mi web') | Entrada top-level al nivel de Turnos/Agenda/Negocio. Máxima visibilidad. | ✓ |
| Dentro del hub 'Negocio' | Sub-sección de /negocio. Sidebar más limpio, una capa más de profundidad. | |

**User's choice:** Ítem propio "Mi web" en el sidebar, visible para todos.

### Sub-decisión: destino del CTA "Activar" del upsell

| Option | Description | Selected |
|--------|-------------|----------|
| Reusar UPGRADE_URL (forjo.studio/#servicios) | Mismo destino que el CTA de plan existente. Cero constante nueva, consistente. | ✓ |
| WhatsApp directo a Forjo | Link wa.me con mensaje pre-cargado. Requiere hardcodear número (constante nueva). | |
| Dejar el copy actual ('Escribinos') | Sin link accionable. Pobre como conversión. | |

**User's choice:** Reusar `UPGRADE_URL` (`https://forjo.studio/#servicios`).

---

## Apagador de emergencia post-flag

| Option | Description | Selected |
|--------|-------------|----------|
| El toggle per-negocio del admin CRM alcanza | Apagar `has_web_custom` por negocio desde /admin/negocios/[id]. Cumple PUB-01, cero código nuevo. | ✓ |
| Toggle masivo en el admin (apagar todos) | Botón que setea has_web_custom=false en masa. Código nuevo + acción destructiva peligrosa. | |
| Revert por deploy (git) | Sin switch runtime; revertir/hotfixear el deploy. Más lento. | |

**User's choice:** El toggle per-negocio del admin CRM es la única palanca de emergencia.
**Notes:** Sin flag global, sin toggle masivo. El toggle masivo quedó como idea diferida.

---

## Claude's Discretion

- Ícono del ítem "Mi web" en el sidebar (set lucide existente).
- Diseño exacto de la pantalla de upsell (brand Bauhaus dark, checklist UI).
- Label final si "Mi web" no calza con la terminología por vertical.

## Deferred Ideas

- Toggle masivo de `has_web_custom` en el admin (off-switch global real) — su propia fase si algún día hace falta.
