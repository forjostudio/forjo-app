---
phase: 07-cancelaci-n-del-abono-mail-panel
plan: 05
type: execute
status: complete
requirements: [ABONO-04, ABONO-05]
checkpoint: human-verify
result: aprobado-con-desvios
---

# 07-05 — Verificación end-to-end de las dos vías de baja

Checkpoint humano ejecutado por el operador contra el Supabase local y el negocio de prueba.
No se modificó código en este plan.

## Resultado

**Aprobado con desvíos.** Los 4 criterios de éxito del ROADMAP §Phase 7 quedaron verificados en vivo.
Los desvíos encontrados son de presentación, no de comportamiento: ninguno toca el efecto de la baja
sobre los turnos ni la política de mails.

## Criterios verificados

| # | Criterio | Resultado |
|---|---|---|
| 1 | El link del mail da de baja la SERIE completa, no un turno suelto | ✓ verificado |
| 2 | El dueño da de baja el abono desde el panel | ✓ verificado |
| 3 | La serie dada de baja deja de generar turnos futuros | ✓ verificado (queda en Archivados, el cron solo procesa `active`) |
| 4 | Las dos vías dejan el mismo estado en los turnos futuros | ✓ verificado |
| — | Checklist visual (375px, contraste, estados) | ✓ verificado |

### Vía A — baja por el cliente

Funcionó de punta a punta. La página pública mostró branding del tenant, servicio, día/hora del turno
fijo y — antes de confirmar — el conteo de turnos a cancelar con la fecha del último (8 turnos, último
viernes 11/9), coincidiendo con el detalle del panel. Reabrir el link mostró el estado sin botón de acción.

### Vía B — baja por el dueño

La confirmación declaró el conteo real (9 turnos, último 15/9) y la irreversibilidad. La serie salió de
la vista principal y apareció bajo Archivados. Sin ningún camino de reactivación (D-04 respetado).

### No verificable en local

**Mails.** Resend no está configurado en el entorno local, así que la política D-14 (un solo mail por
destinatario y por baja) no pudo confirmarse por recepción. Sí está cubierta por los 14 tests de
`test/abono-cancel-email.test.ts`, incluido el caso `cancelledCount: 7` → `toHaveBeenCalledTimes(1)`.
Queda como verificación pendiente en producción, en línea con el pendiente equivalente de v0.22.

## Desvíos → Gap 07-06

1. **El punto del badge "Alto" no toma color fuera del CRM.**
   Causa raíz: `components/crm/risk-badge.tsx` pinta el dot con `style={{ backgroundColor: 'var(--crm-danger)' }}`
   y `--crm-danger` está definido únicamente dentro de `.crm-shell` (`app/globals.css`), a propósito, para
   que la paleta del CRM no se filtre al dashboard. Fuera de ese scope la variable no resuelve y el dot
   queda transparente.
   Alcance: **pre-existente y global** — afecta a todo `ConfirmDialog` fuera del CRM
   (`app/(dashboard)/abonos`, `app/(dashboard)/settings`, `components/dashboard/canchas-manager.tsx`).
   La Phase 7 no lo introdujo; lo puso a la vista.

2. **La tarjeta del listado confunde turnos generados con sesiones contratadas.**
   Muestra `8 turnos` junto a `15 sesiones` sin indicar que el primero es progreso del segundo. El
   detalle ya lo expresa bien (`Sesiones 8 de 15`). Falta el mismo criterio en la tarjeta.

## No es un desvío

- **Conteo de turnos < sesiones contratadas.** Es la ventana rolling operando según diseño (ABONO-06,
  Phase 6): el motor materializa hasta `hoy + abono_window_weeks` y el cron diario extiende la cola hasta
  que el abono finito junta sus N turnos reales, momento en que pasa a `completed`. Verificado
  aritméticamente contra las dos series de prueba: con ventana de 8 semanas desde el martes 21/7 entran
  9 martes (último 15/9) y 8 viernes (último 11/9) — exactamente lo observado. Una semana salteada por
  conflicto no consume sesión (D-06), y por eso el contrato se expresa en cantidad y no en fecha de fin.
- **Ausencia de reactivación en Archivados.** Correcto por D-04.
- **Ausencia de "borrar definitivamente".** Nunca estuvo en el alcance de la fase. Es capacidad nueva y
  destructiva; se deriva a discusión propia en vez de absorberla en un plan de gap.
