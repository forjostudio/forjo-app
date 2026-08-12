---
created: 2026-07-28T14:00:00.000Z
title: "Hallazgos pre-existentes del UAT de Phase 11 (fuera de scope de la fase)"
area: ux-polish
files:
  - components/crm/risk-badge.tsx
  - app/(dashboard)/abonos/abonos-client.tsx
  - app/(dashboard)/settings/settings-client.tsx
  - app/(dashboard)/clients/clients-client.tsx
---

## Contexto

Detectados probando el UAT de Phase 11 (2026-07-28). **Ninguno es regresión de Phase 11** —
son pre-existentes o ideas nuevas. Candidatos a un milestone de polish o v0.26.

## 1. RiskBadge "Alto" se ve sin color

`components/crm/risk-badge.tsx`: la variante `alto` es `bg-secondary text-foreground` + un **dot rojo
`--crm-danger`** a la izquierda (diseño del CRM, v0.11). Fuera del contexto CRM/admin (ej. el diálogo
"¿Dar de baja el turno fijo?" con `risk="alto"` en `abonos-client.tsx:533`) el token `--crm-danger`
puede no estar definido → el dot no se ve → el badge parece un pill gris "sin color". El usuario lo
marcó como "falla general".
**Fix candidato:** definir `--crm-danger` globalmente (no solo en el scope CRM) o dar al `alto` un
relleno semántico más visible fuera del CRM. Es decisión de diseño (afecta al CRM también).

## 2. Un abono CANCELADO sigue mostrando "Copiar link de baja"

En el detalle de una serie con `status='cancelled'` (que dice "Serie dada de baja el … No genera
turnos nuevos") todavía aparece el botón **"Copiar link de baja"** — ilógico: una serie ya dada de
baja no debería ofrecer el link de cancelación. Ocultar ese botón cuando `status !== 'active'`.
Archivo: `app/(dashboard)/abonos/abonos-client.tsx` (el detalle/modal de la serie).

## 3. Borrado de servicio: modal + permitir borrar si los turnos son solo PASADOS

Idea del usuario (mejora sobre el copy de EXTRA-A ya shipeado): en vez de un toast, un **modal** que
avise si hay turnos **FUTUROS**; y si los turnos son **solo pasados**, permitir eliminar el servicio
igual. **Decisión de producto + modelo:** hoy el FK 23503 bloquea el borrado por CUALQUIER turno
(protege el historial de Finanzas por servicio). "Borrar con pasados" implica orphanar esos turnos
(romper reportes) o hard-deletearlos. Requiere decidir qué pasa con el historial. NO es quick.

## 4. Cliente nuevo (0 visitas) aparece en "Pausa", no en "Nuevas"

`clients-client.tsx`: un cliente recién creado sin turnos cae en el filtro **"Pausa"** (">2 meses sin
venir") en lugar de **"Nuevas"**. Contraintuitivo: nunca vino, no está "pausado". Revisar la lógica de
clasificación para que 0-visitas-reciente-alta → "Nuevas" y no "Pausa".

## Alcance

Backlog. Ninguno bloquea el cierre de Phase 11. Evaluar en el próximo milestone de polish / v0.26.
</content>
