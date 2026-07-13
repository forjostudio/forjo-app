---
phase: 03-impersonaci-n-read-only
plan: 02
subsystem: ui
tags: [impersonation, read-only, audit, crm, next16, rsc, confirm-dialog]
status: complete

# Dependency graph
requires:
  - phase: 03-impersonaci-n-read-only
    plan: 01
    provides: startImpersonation action, loadImpersonationData() + tipo ImpersonationData, getBusinessIntegrationStatus(), loader RSC /ver con guard + auditoría por carga + PaletteScript del negocio
  - phase: 01-cimientos-auditor-a
    provides: ConfirmDialog escalonado (nivel VER), StatusBadge, audit_log/logAudit
  - phase: 02-admin-de-plataforma
    provides: ficha /admin/negocios/[id] (ficha-client.tsx), patrón de ConfirmDialog en acciones
provides:
  - "ImpersonationBanner: banner fijo amarillo 'Estás viendo como X · solo lectura' + 'Salir de la vista' (Link, D-04) + StatusBadge del negocio (D-11)"
  - "ImpersonationView + renderers read-only por sección (agenda/turnos, servicios, equipo, consultorios, clientes con PII, negocio/config) alimentados por ImpersonationData; sin write paths"
  - "ConfirmDialog.minReasonLength (prop opcional aditiva): alinea el min del motivo dialog↔server, feedback inline en vez de toast genérico; Phase 2 intacta"
  - "Entrada 'Ver como cliente' en la ficha: ConfirmDialog confirmWord='VER' + requireReason + minReasonLength=10 + disclaimer → startImpersonation + navegación client-side a /ver"
affects: [crm impersonation, Phase 3 COMPLETA]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Read-only POR CONSTRUCCIÓN en la superficie UI: renderers NUEVOS presentacionales (Card/Badge/StatusBadge/UpcomingAppointments) sin @/lib/supabase/client, sin *-client.tsx del dashboard, sin fetch de mutación ni botones de update/delete (D-02)"
    - "Config bajo impersonación muestra solo PRESENCIA de integraciones (conectado/desconectado) vía data.integrationStatus, nunca el valor crudo de un secreto"
    - "Server action que solo audita y resuelve limpio (Promise<void>) + navegación client-side con router.push — evita que redirect()/NEXT_REDIRECT atraviese el try/catch del ConfirmDialog y dispare su toast de error genérico"
    - "Prop opcional aditiva (minReasonLength) backward-compatible: default = comportamiento previo, callers existentes no se tocan"

key-files:
  created:
    - "components/crm/impersonation-banner.tsx"
    - "app/(crm)/admin/negocios/[id]/ver/impersonation-view.tsx"
  modified:
    - "app/(crm)/admin/negocios/[id]/ver/page.tsx"
    - "components/crm/confirm-dialog.tsx"
    - "components/crm/confirm-dialog.test.tsx"
    - "app/(crm)/admin/negocios/[id]/ficha-client.tsx"
    - "app/(crm)/admin/_actions.ts"

# Decisiones
decisions:
  - "startImpersonation pasó de redirect() server-side a audit+return; la navegación a /ver la hace el cliente con router.push (fix del toast espurio)"
  - "El banner es FEEDBACK, no la garantía read-only: la garantía es la ausencia de write paths server-side"
  - "minReasonLength como prop opcional aditiva en vez de hardcodear el min en el dialog — mantiene Phase 2 intacta"

# Métricas
metrics:
  duration: "checkpoint + fix (continuación de sesión)"
  completed: 2026-06-20
  tasks: 3
  files: 7
---

# Phase 3 Plan 02: Superficie visual read-only de impersonación — Summary

Superficie visual completa de la impersonación read-only sobre el backbone de Plan 03-01: banner fijo de impersonación con StatusBadge, renderers presentacionales por sección alimentados por la data server-side, y el punto de entrada auditado en la ficha (ConfirmDialog nivel "VER" con motivo min 10 + disclaimer). Cierra IMP-03 (banner + salir + fidelidad visual) e IMP-01 desde el lado UI (refuerzo).

## Qué se construyó

### Task 1 — ImpersonationBanner + renderers read-only + montaje en /ver (commit `d382de1`)
- `components/crm/impersonation-banner.tsx`: banner fijo amarillo "Estás viendo como {nombre} · solo lectura" + `<Link>` "Salir de la vista" (D-04: salir = navegar) + `StatusBadge` del negocio (D-11: incluido suspended).
- `app/(crm)/admin/negocios/[id]/ver/impersonation-view.tsx`: `ImpersonationView` + sub-renderers delgados por sección operativa (agenda/turnos, servicios, equipo, consultorios, clientes con PII completa, negocio/config), calcando el estilo de `dashboard/page.tsx`. Config muestra solo presencia de integraciones (`data.integrationStatus`), nunca un token. Sin clinical-history ni finances (D-06). Sin `@/lib/supabase/client`, sin `*-client.tsx` del dashboard, sin fetch de mutación (D-02).
- `app/(crm)/admin/negocios/[id]/ver/page.tsx`: reemplaza el placeholder de 03-01 por `<ImpersonationBanner>` + `<ImpersonationView>`.

### Task 2 — ConfirmDialog.minReasonLength (aditivo) + entrada en la ficha (commit `d89fe87`)
- `components/crm/confirm-dialog.tsx`: prop opcional `minReasonLength` en `ConfirmDialogProps` + `ConfirmStateInput` + `computeConfirmState` (default 1 = "no vacío" actual). Helper inline "El motivo debe tener al menos N caracteres" cuando el motivo es no vacío pero corto. Phase 2 (suspend/precio/plan/addon/trial) intacta.
- `components/crm/confirm-dialog.test.tsx`: casos nuevos para `computeConfirmState` (sin prop: 'a' habilita; con `minReasonLength: 10`: 3 chars no habilita, 10 sí). Verde.
- `app/(crm)/admin/negocios/[id]/ficha-client.tsx`: botón "Ver como cliente" sin gating de estado (D-11) + `<ConfirmDialog confirmWord="VER" requireReason minReasonLength={10}>` con disclaimer (D-14) → `startImpersonation`.

### Task 3 — Checkpoint humano end-to-end (APROBADO con fix)
El operador verificó el flujo completo en el navegador: paleta del negocio (no el shell dark, D-12), banner fijo, secciones read-only sin botones de mutación, estados activo/suspendido reflejados, y las filas de auditoría (entrada `user.impersonate` con motivo + carga `user.impersonate.view`). **Todo funcionando.** Único problema reportado: un toast de error espurio al confirmar "Ver como cliente", aunque la navegación y la auditoría sí ocurrían. Resuelto con la deviation de abajo. Checkpoint **aprobado**.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Toast de error espurio al confirmar "Ver como cliente" (commit `8723f4f`)**
- **Found during:** Task 3 (checkpoint humano)
- **Issue:** `startImpersonation` hacía `redirect('/admin/negocios/[id]/ver')` server-side. `redirect()` de Next lanza `NEXT_REDIRECT` (excepción de control); ese throw atravesaba el `try/catch` del `ConfirmDialog` (rama catch → `toast.error('No se pudo completar la acción...')`), disparando el toast aunque la navegación y la auditoría sí ocurrían. Es el patrón documentado de Next: `redirect()` no debe atravesar un `try/catch` sin `unstable_rethrow`.
- **Fix:** `startImpersonation` pasó de **redirect server-side** a **audit + return** (`Promise<void>` limpio): `requireAdmin()` → `parse` → `logAudit({ action: 'user.impersonate', risk: 'alto', reason })` → return. La **navegación a /ver ahora es client-side** con `router.push` en el `onConfirm` de la ficha, tras resolver la action. La action resuelve sin throw → el dialog cierra normal → sin toast. El toast genérico solo aparece ahora ante un fallo REAL (requireAdmin/zod), que es lo correcto.
- **D-04 preservado:** navegar sigue siendo navegar (impersonar = navegar a la sub-página, sin estado global / cookie); solo cambia que el navegar es client-side.
- **Auditoría sin cambios:** la fila de entrada (`user.impersonate`, con motivo) la sigue escribiendo la action; la fila de carga (`user.impersonate.view`) la sigue escribiendo el loader de /ver. Ambas iguales.
- **Files modified:** `app/(crm)/admin/_actions.ts` (quitar `redirect()` + su import — ninguna otra action lo usaba), `app/(crm)/admin/negocios/[id]/ficha-client.tsx` (`useRouter` + `router.push` tras la action).
- **Commit:** `8723f4f`

## Requisitos cubiertos

- **IMP-01** (read-only por construcción, lado UI/refuerzo): la superficie /ver no tiene ningún botón ni path de mutación; la entrada solo ocurre vía `startImpersonation` (auditada). La garantía server-side es de Plan 03-01.
- **IMP-02** (entrada auditada): cubierto por el wiring ficha → ConfirmDialog "VER" → `startImpersonation` (audita `user.impersonate`, riesgo alto, con motivo).
- **IMP-03** (banner + salir + fidelidad visual): banner fijo "Estás viendo como X · solo lectura" + "Salir de la vista" + paleta del negocio (D-12), funcional en cualquier estado incl. suspended (D-11).

Los tres requisitos quedan cubiertos al cerrar la superficie visual de la impersonación. **Phase 3 completa.**

## Verificación

- `npx tsc --noEmit -p tsconfig.json` → exit 0.
- `npm run lint` sobre los 2 archivos del fix → 0 errores, 0 warnings (los 461 errores del proyecto son pre-existentes en archivos no relacionados: `upcoming-appointments.tsx`, `design_handoff_forjo_rebrand/`).
- `grep redirect` en `_actions.ts` → solo aparece en comentario; ninguna action redirige.
- `grep router.push / useRouter / startImpersonation` en `ficha-client.tsx` → push client-side tras la action confirmado.
- Checkpoint humano aprobado por el operador (todo funciona; el único defecto reportado quedó resuelto por la deviation #1).

## Self-Check: PASSED
- FOUND: `app/(crm)/admin/_actions.ts` (modificado, redirect removido)
- FOUND: `app/(crm)/admin/negocios/[id]/ficha-client.tsx` (modificado, router.push)
- FOUND: commit `d382de1` (Task 1)
- FOUND: commit `d89fe87` (Task 2)
- FOUND: commit `8723f4f` (fix del toast)
