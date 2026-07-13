---
phase: 06-comms-bandeja
plan: 02
subsystem: ui
tags: [crm, bandeja, whatsapp, react, rsc, rls, supabase, sonner]

# Dependency graph
requires:
  - phase: 06-comms-bandeja (06-01)
    provides: "migración 038 (conversations/messages + RLS mixta owner-OR-admin), libs puras, server actions takeConversation/releaseConversation auditadas"
  - phase: 04-pipeline-tags-timeline
    provides: "patrón de lectura RLS-gated con session client en superficies CRM (crm_timeline T-04-10), StatusBadge/RiskBadge, tokens dark del tema Forjo"
provides:
  - "Página RSC /admin/bandeja que lee conversations con session client (RLS-gated, override admin en la policy, NO service-role)"
  - "Componente cliente bandeja-client.tsx: lista 2-paneles + thread + estados IA/Vos/Sin asignar + filtros Todas/WhatsApp + Tomar conversación + composer DESHABILITADO"
  - "Item Bandeja del sidebar CRM habilitado (href /admin/bandeja, sin PRONTO)"
  - "Superficie visible de COMMS-01 (bandeja unificada asociada a negocio) y COMMS-02 (estados + takeover)"
affects: [comms, bandeja, whatsapp-agent, comms-03-mail, manual-send]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Lectura RLS-gated en superficie CRM con session client (createClient), nunca service-role: el override admin vive en la RLS mixta de 038 (Pitfall 1 / T-06-05)"
    - "Composer inerte (disabled) como contrato visible de feature diferido (D-03 envío manual) sin cablear ningún send"

key-files:
  created:
    - app/(crm)/admin/bandeja/page.tsx
    - app/(crm)/admin/bandeja/bandeja-client.tsx
  modified:
    - components/crm/crm-sidebar.tsx

key-decisions:
  - "Lectura del operador con session client (createClient) — NUNCA createAdminClient en page/client: el override admin vive en la RLS mixta de 038. Service-role en la superficie filtraría TODOS los tenants (Pitfall 1, T-06-05)"
  - "Sin tab/canal Email en los filtros — solo Todas/WhatsApp (COMMS-03 diferido, D-01); grep case-insensitive de 'email' en el client = 0"
  - "Composer (input + Enviar) DESHABILITADO con copy 'próximamente' — envío manual diferido (D-03), cero superficie de send (T-06-10)"
  - "Estados mapeados desde handled_by: 'ai'→IA atendiendo, 'human'→Vos atendés, 'unassigned'→Sin asignar; reusa el chip de estado del CRM, cero hex hardcodeado"
  - "Tomar/Liberar invocan las server actions de 06-01 (takeConversation/releaseConversation), que re-guardan requireAdmin() + auditan (logAudit). La UI no es la garantía"

patterns-established:
  - "Superficie CRM = RSC (page.tsx, session read RLS-gated) + componente cliente co-ubicado (*-client.tsx); admin client y filas crudas nunca cruzan al cliente"
  - "Feature diferido visible-pero-inerte: composer con disabled y copy 'próximamente' en lugar de ocultarlo, fiel al mock sin habilitar el send"

requirements-completed: [COMMS-01, COMMS-02]

# Metrics
duration: ~continuation
completed: 2026-06-24
status: complete
---

# Phase 6 Plan 2: Bandeja del operador (UI) Summary

**Bandeja /admin/bandeja: RSC con lectura RLS-gated (session client) + cliente 2-paneles (lista + thread + estados IA/Vos/Sin asignar + filtros Todas/WhatsApp + Tomar conversación auditado + composer deshabilitado), fiel a 07-bandeja.png, cero service-role en la superficie, cero deps nuevas.**

## Performance

- **Duration:** continuation (Tasks 1-2 ejecutados en sesión previa; este pase cierra el plan tras checkpoint humano aprobado)
- **Completed:** 2026-06-24
- **Tasks:** 3 (2 auto + 1 checkpoint:human-verify aprobado)
- **Files modified:** 3 (2 created + 1 modified)

## Accomplishments
- Página RSC `/admin/bandeja` que lee `conversations` con session client (RLS admin-override de 038), SELECT explícito sin comodín, order por `last_message_at` desc + limit, loadError pasado al cliente.
- Componente cliente `bandeja-client.tsx` que reproduce `07-bandeja.png`: lista 2-paneles (search, filtros Todas/WhatsApp, filas con avatar/nombre/negocio/preview/hora AR/no-leídos), thread con banner del agente IA + burbujas inbound/outbound, badge de estado mapeado desde `handled_by`.
- "Tomar conversación" cableado a la server action `takeConversation` (toast + estado → "Vos atendés"); "Liberar" simétrico (`releaseConversation`).
- Composer (input + Enviar) DESHABILITADO con copy "próximamente" — envío manual diferido (D-03), sin ningún send cableado.
- Item "Bandeja" del sidebar habilitado a `/admin/bandeja` (ya no PRONTO).

## Task Commits

1. **Task 1: Página RSC /admin/bandeja (session read, RLS-gated) + habilitar item del sidebar** - `fc1a6de` (feat)
2. **Task 2: bandeja-client.tsx — lista + thread + estados + Tomar + composer disabled** - `00b9eaf` (feat)
3. **Task 3: Checkpoint visual contra 07-bandeja.png + takeover + composer disabled** - checkpoint:human-verify, RESUELTO ("aprobado")

**Plan metadata:** `.planning/` gitignored → el commit de docs se omite (esperado; sin commit de metadata).

## Files Created/Modified
- `app/(crm)/admin/bandeja/page.tsx` - RSC: lee conversations con session client (RLS-gated, override admin en la policy), SELECT explícito, order+limit, pasa rows+loadError al cliente.
- `app/(crm)/admin/bandeja/bandeja-client.tsx` - 'use client': lista 2-paneles + thread + estados + filtros Todas/WhatsApp + Tomar/Liberar + composer disabled, fiel a 07-bandeja.png.
- `components/crm/crm-sidebar.tsx` - item Bandeja habilitado (href `/admin/bandeja`, sin `soon`).

## Decisions Made
- Lectura del operador con session client (`createClient`), nunca `createAdminClient`, en page y client — el override admin vive en la RLS mixta de 038 (Pitfall 1 / T-06-05). Verificado: grep `createAdminClient` = 0 en ambos archivos.
- Sin canal Email (D-01, COMMS-03 diferido) — grep case-insensitive de "email" en el client = 0.
- Composer inerte con `disabled` + copy "próximamente" (D-03 envío manual diferido) — sin superficie de send (T-06-10).
- Estados desde `handled_by` (ai/human/unassigned) reusando el chip de estado del CRM; cero hex hardcodeado, cero deps nuevas.

## Deviations from Plan

None - plan ejecutado tal cual. (Tareas 1-2 según el plan; checkpoint Task 3 aprobado por el operador.)

## Issues Encountered
- Durante la QA visual (Task 3), el primer intento de "Tomar conversación" falló: el seed de prueba usó un UUID malformado (versión inválida) que `z.uuid()` rechazó correctamente. NO es un bug de código — los ids reales de conversación son `gen_random_uuid()` (v4) y pasan la validación. Sin cambio de código. El operador confirmó "aprobado" tras corregir el seed.

## Known Stubs
- **Composer / envío manual (D-03, diferido):** input + botón "Enviar" presentes pero `disabled` con copy "próximamente". Intencional, fiel al mock; el send manual two-way es un plan futuro de la fase Comms (add-on Mensajes). No bloquea COMMS-01/02.
- **Canal Email / mail two-way (COMMS-03, D-01, diferido):** sin tab Email en los filtros. Resend hoy es solo saliente; la bandeja que RECIBE mail necesita infra de inbound (otro servicio/dominio) — ver blocker §9.2 en STATE.md. COMMS-03 NO es parte de este plan (requirements = COMMS-01, COMMS-02).

## Threat Flags

Sin superficie nueva fuera del threat_model del plan. Mitigaciones aplicadas:

| Threat ID | Disposición | Evidencia |
|-----------|-------------|-----------|
| T-06-05 (EoP — service-role en lectura del operador) | mitigate | page.tsx y bandeja-client usan SOLO session client (createClient); grep `createAdminClient` = 0 en ambos; override admin vive en la RLS mixta de 038. |
| T-06-09 (Info Disclosure — filas crudas al cliente) | mitigate | SELECT explícito de columnas no sensibles; el cliente recibe solo lo necesario; layout (crm) ya gatea is_admin (defensa en profundidad). |
| T-06-06 (Repudiation — takeover sin traza) | mitigate | El botón invoca takeConversation, que re-guarda requireAdmin() + logAudit (06-01); confirmado en /admin/auditoria la entrada "Tomó conversación". |
| T-06-10 (Tampering — envío manual no autorizado) | mitigate | Composer DESHABILITADO, sin ningún submit/send cableado (D-03). |
| T-06-SC (supply-chain) | mitigate | Cero dependencias nuevas (sonner/shadcn/recharts ya en el repo). |

## User Setup Required
None - sin configuración de servicio externo. (La migración 038 ya fue aplicada en 06-01.)

## Next Phase Readiness
- COMMS-01 y COMMS-02 cubiertos en su cara de UI sobre la base de 06-01. Phase 6 completa sus 2 planes.
- Diferidos para futuro (NO bloquean el cierre de fase): envío manual two-way (D-03) y mail entrante / COMMS-03 (D-01, depende de infra de inbound — blocker §9.2).
- Pendiente operativo NO bloqueante (heredado de 06-01): regenerar `supabase/schema.sql` con `supabase db dump`.

## Self-Check: PASSED

- `app/(crm)/admin/bandeja/page.tsx` — FOUND
- `app/(crm)/admin/bandeja/bandeja-client.tsx` — FOUND
- `components/crm/crm-sidebar.tsx` — item Bandeja habilitado (línea 58) FOUND
- commit `fc1a6de` (Task 1) — FOUND on gsd/crm
- commit `00b9eaf` (Task 2) — FOUND on gsd/crm
- `npx tsc --noEmit` — exit 0 (clean)
- grep `createAdminClient` en page.tsx y bandeja-client.tsx — 0 (sin fuga de tenants)
- grep case-insensitive "email" en el client — 0 (sin canal Email, D-01)

---
*Phase: 06-comms-bandeja*
*Completed: 2026-06-24*
