---
created: 2026-07-28T15:00:00.000Z
title: "Revisar los botones full-width en toda la app"
area: ux-polish
files:
  - app/(dashboard)/settings/settings-client.tsx
  - components/ui/button.tsx
---

## Pedido

El usuario quiere **arreglar/revisar todos los botones que están full-width (`w-full`) dentro de la
app** — se ven varios (ej. "Guardar" y "Liberar horarios vencidos" en Negocio → Cobros) ocupando el
ancho completo del card, lo que se lee poco intencional / poco premium en desktop.

## Alcance

Pase de diseño **app-wide**: auditar los `w-full`/`className="w-full"` en botones de acción del
dashboard y definir un criterio consistente (ej. botones de acción con ancho por contenido, alineados
a la derecha; full-width solo en mobile o en CTAs primarios de formularios largos). NO es Phase 11 —
es un milestone de polish visual propio. Candidato a evaluar junto con [[hallazgos-uat-phase11]]
(RiskBadge sin color, etc.) en un ciclo de UI-polish o v0.26.

**Criterio a definir en discuss:** ¿full-width solo en mobile (<768px) y ancho-por-contenido en
desktop? ¿o algún patrón por tipo de botón (submit de form vs acción secundaria)?
</content>
