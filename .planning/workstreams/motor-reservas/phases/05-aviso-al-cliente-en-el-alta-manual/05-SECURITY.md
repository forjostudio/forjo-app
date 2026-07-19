---
phase: 05-aviso-al-cliente-en-el-alta-manual
status: verified
threats_open: 0
asvs_level: 1
block_on: high
verified_at: 2026-07-19
verified_against: HEAD (incluye fixes UX post-plan e03419e, d3b7e42)
---

# Phase 05 — Aviso al cliente en el alta manual · Security Verification

**Veredicto:** SECURED — 8/8 threats cerrados (2 planes, register autorado a plan-time).
**Method:** verificación de cada mitigación declarada contra el código real (no doc/intención). No se escanean amenazas nuevas.

## Threat Verification

| Threat ID | Plan | Category | Disposition | Estado | Evidencia (archivo:línea) |
|-----------|------|----------|-------------|--------|---------------------------|
| T-05-01 | 02 | Information Disclosure | mitigate | CLOSED | `app/api/appointments/create/route.ts:35-40` (business por `owner_id`), `:138` (gate `notify && clientEmail`), `:144` (`getBusinessSecrets(business.id)` acotado al propio negocio), `:146` (`to: clientEmail` del turno recién creado), `:141,156` (`cancelToken` de ESE turno) |
| T-05-02 | 02 | Spoofing/Tampering (flag `notify`) | accept | CLOSED | Riesgo aceptado documentado abajo. Actor = dueño autenticado (`route.ts:26-29`); gate adicional por `clientEmail` presente (`:138`) |
| T-05-03 | 02 | Denial of Service (envío de mail) | accept+mitigate | CLOSED | Parte mitigate verificada: mail en `after()` best-effort con try/catch (`route.ts:142-163`), un mail por alta (acción humana). Parte accept documentada abajo |
| T-05-04 | 01+02 | Tampering (header injection en `From`) | mitigate | CLOSED | `lib/email.ts:10-13` (`fromDisplayName` sanitiza `[\r\n"<>]`, trunca 64), `:15-30` (`resolveSender`), `:245` (`sendManualBookingConfirmation` llama `resolveSender`, NO arma el header a mano) |
| T-05-05 | 01 | Information Disclosure (cuerpo del mail) | mitigate | CLOSED | `lib/email.ts:213-324` — la función solo renderiza los params recibidos; sin lectura de DB ni de otros tenants (email.ts no importa Supabase). El caller acota la fuente (T-05-01) |
| T-05-06 | 02 | Tampering (bypass de integridad del alta) | mitigate | CLOSED | Mail puramente aditivo: `after()` separado (`route.ts:133-164`) DESPUÉS del `after()` de gcal (`:97-131`, intacto); core sin cambios (`:78-92`, `requireDeposit:false` en `:91`); el mail no toca el insert ni el anti-doble-booking |
| T-05-SC | 01+02 | Tampering (supply chain) | accept | CLOSED | Riesgo aceptado documentado abajo. Corroborado: `git diff 0262442^..HEAD -- package.json package-lock.json` vacío (sin dependencias nuevas); Resend por `fetch` crudo (`lib/email.ts:61-72`), checkbox nativo HTML |

## Verificaciones específicas solicitadas

1. **Aislamiento / info disclosure (T-05-01):** VERIFICADO. El negocio se resuelve por `owner_id` de la sesión (`route.ts:38`), nunca por un id que venga del cliente. El mail va a `clientEmail` normalizado del propio body del dueño (`:58,146`), y los secretos salen de `getBusinessSecrets(business.id)` (`:144`). Cero cruce de tenant. El destinatario se pasa como `to: [to]` (array JSON a la API de Resend, `lib/email.ts:318`), no concatenado a un header.
2. **Header injection (T-05-04):** VERIFICADO. `from` sale de `resolveSender` → `fromDisplayName` que strippea `\r\n"<>` (`lib/email.ts:11`). No hay construcción manual del header `From`.
3. **Best-effort:** VERIFICADO. El mail corre en un `after()` propio con try/catch + `console.error` contextualizado (`route.ts:142-163`); un fallo de Resend no rompe el alta (el turno ya se insertó y la respuesta ya se devolvió en `:166`).
4. **Endpoint autenticado:** VERIFICADO. `getUser()` → 401 sin sesión (`route.ts:26-29`). El alta manual no abre vector nuevo: reusa `createAppointmentCore` (anti-tampering por `business_id` + re-check de solapamiento).
5. **Supply chain (T-05-SC):** VERIFICADO. Sin cambios en `package.json`/`package-lock.json` en toda la fase.

## Accepted Risks Log

| Threat ID | Category | Disposition | Justificación aceptada |
|-----------|----------|-------------|------------------------|
| T-05-02 | Spoofing/Tampering (flag `notify`) | accept | El actor es el dueño autenticado (sesión anon+RLS, tenant por `owner_id`). Forzar `notify=true` solo dispara un mail al cliente que él mismo cargó — es la feature, no un abuso. Gateado además por `clientEmail` presente. |
| T-05-03 | Denial of Service (envío de mail) | accept (parte) | Un mail por alta = acción humana del dueño; no hay amplificación automatizable. La parte mitigate (best-effort en `after()`) está verificada en código. |
| T-05-SC | Tampering (supply chain) | accept | La fase no agrega dependencias npm: `sendManualBookingConfirmation` reusa `fetch` crudo + helpers ya en el repo; el checkbox es `<input type="checkbox">` nativo. Sin superficie de install. Corroborado con `git diff` de package files (vacío). |

## Unregistered Flags

None. Ningún summary (05-01, 05-02) declara sección `## Threat Flags`. Los commits de fix UX posteriores al plan (`e03419e`, `d3b7e42`) tocan el form y el endpoint pero no introducen superficie de ataque nueva: el gate de auth (`route.ts:29`), la resolución por `owner_id` (`:38`), el gate del mail (`:138`) y el reuso de `resolveSender` siguen presentes en el estado final verificado.

## Notas de corroboración (no bloqueantes)

- Test puro `test/manual-notify-email.test.ts` presente (corrobora T-05-04/T-05-05: reuso del sender sanitizado + ausencia de precio/seña/saldo en html y text).
- El form gatea el flag en cliente (`nuevo-turno-form.tsx:326` `notify: notifyClient && !!client.email`, y `:352` `willNotify`), pero la autoridad es el servidor: re-gatea por `clientEmail` presente (`route.ts:138`). Defensa en profundidad correcta.
