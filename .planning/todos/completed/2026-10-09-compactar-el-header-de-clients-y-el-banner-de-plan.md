---
created: 2026-10-09T23:05:00.000Z
title: El header de /clients se come media pantalla en mobile
area: panel
resolves_phase: null
files:
  - components/dashboard/plan-banner.tsx
  - app/(dashboard)/clients/clients-client.tsx
---

## Problem

En un teléfono, `/clients` muestra **un solo nombre** antes de que empiece la lista, y deja una
ventanita diminuta para scrollear. Detectado por el dueño en la UAT de la Phase 2 de v0.31
(2026-10-09), con captura en iPhone.

**No es el mecanismo del alto** —ese se arregló en la fase y la lista llega hasta el borde correcto,
con el último cliente visible sobre la barra—. Es que **el header tiene nueve filas** antes del
primer nombre:

| Bloque | Filas |
|---|---|
| Banner de período de prueba | **2** (texto arriba, botón "Activar plan" abajo) |
| `Clientes (28)` + ícono de fusionar | 1 |
| Exportar CSV · Importar CSV (grid 2-col, ancho completo) | 1 |
| Nuevo cliente (ancho completo) | 1 |
| Tabs de filtro | 1 |
| Select Profesional | 1 |
| Buscador | 1 |
| Índice A-Z | 2 |

El header del panel es `flex-shrink-0`: **no scrollea**, así que todo ese alto se le resta siempre a
la lista.

## Solution

Las dos las propuso el dueño; van en este orden de rendimiento:

**1. El banner de plan a UNA fila** (`components/dashboard/plan-banner.tsx`). Las dos líneas de
texto a la izquierda —título y días restantes, igual que el header de dos líneas del panel— y
**"Activar plan" a la derecha en la misma fila**. ⚠ Es el que más rinde de los dos: ese banner lo
ven **las 15 pantallas** del panel, no sólo Clientes, y `plan_status` tiene `DEFAULT 'trial'` así
que **todo negocio nuevo lo tiene puesto**. Tocar un solo componente mejora todo el panel.

**2. Exportar / Importar suben a la fila del título**, junto al ícono de fusionar que ya está ahí.
Los tres son acciones **secundarias**; como íconos con `aria-label` + tooltip ocupan una fracción y
**desaparece una fila entera**. "Nuevo cliente" conserva su fila propia y su etiqueta: es el CTA
primario, y el `CLAUDE.md` del proyecto pide un solo CTA primario por sección.

Entre las dos: **~3 filas menos**, más del doble de nombres visibles.

### Lo que NO hay que hacer

El dueño propuso como alternativa abreviar los botones a **"Imp" / "Exp"**. Descartado: el
`CLAUDE.md` del proyecto pide *"Botones: verbo de acción + contexto"*, y "Imp" no se entiende. Los
íconos con `aria-label` logran la misma compactación sin romper la regla ni la accesibilidad.

## Lo que ya se hizo y NO hay que rehacer

En la misma UAT se implementó el **modo búsqueda** de `/clients` (commit `4850a62`): al enfocar el
buscador se repliegan el título, Exportar/Importar y Nuevo cliente, y vuelven al salir con el campo
vacío. Ataca el mismo síntoma **mientras se busca**. Esta tarea ataca el estado **en reposo**, que
es el que el dueño midió como "un solo nombre visible". Los dos suman y no se pisan.

## Relacionado

De la misma UAT, conviene hacerlos en la misma pasada:

- `2026-10-09-el-zoom-automatico-de-ios-en-los-inputs-del-panel.md` — el zoom de iOS come todavía
  más pantalla al enfocar, y el buscador de `/clients` es uno de los 16 inputs que lo disparan.
- `2026-10-09-guarda-de-borrador-en-los-dialogos-del-panel.md`.
