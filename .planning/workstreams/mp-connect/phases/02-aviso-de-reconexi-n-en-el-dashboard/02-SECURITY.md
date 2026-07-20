---
phase: 2
slug: 02-aviso-de-reconexi-n-en-el-dashboard
status: verified
threats_open: 0
asvs_level: 1
created: 2026-07-20
---

# Phase 2 — Security

> Aviso de reconexión de MercadoPago en el dashboard (workstream mp-connect, v0.23).
> Superficie de dashboard autenticada, riesgo bajo. Threat register autorado en plan-time
> (`<threat_model>` de 02-01-PLAN.md); esta auditoría verifica cada mitigación contra el código.

---

## Trust Boundaries

| Boundary | Description | Data Crossing |
|----------|-------------|---------------|
| dueño autenticado → dashboard (settings-client / layout) | Superficie autenticada; el estado se lee del `business` resuelto por `owner_id` (RLS activa), nunca de un business_id del cliente | Estado sano/caído (booleano derivado) |
| business (flag) → UI | Solo se proyecta el estado sano/caído; con D-09 `mp_user_id` ya no se muestra en ningún estado; jamás tokens ni `business_secrets` | Booleano derivado |

---

## Threat Register

| Threat ID | Category | Component | Disposition | Mitigation | Status |
|-----------|----------|-----------|-------------|------------|--------|
| T-02-01 | Information disclosure | mostrar el estado de conexión de OTRO negocio | mitigate | Estado leído del `business` resuelto por `owner_id` + RLS; sin business_id del cliente | closed |
| T-02-02 | Information disclosure | exponer token/secreto o número de cuenta en la UI | mitigate | Banner recibe solo booleano; card no renderiza `mp_user_id` (D-09); nunca token ni secrets | closed |
| T-02-03 | Tampering | falsear el estado desde el cliente | accept | UI read-only del flag; toda escritura es server-only (Phase 1); sin superficie de escritura nueva | closed |
| T-02-04 | Information disclosure | logo de MercadoPago (D-08) | accept | SVG estático inline decorativo (`aria-hidden`), sin `fetch` ni datos | closed |
| T-02-SC | Tampering (supply chain) | dependencias | accept | 0 paquetes npm nuevos; logo inline a mano | closed |

*Status: open · closed*
*Disposition: mitigate (implementation required) · accept (documented risk) · transfer (third-party)*

---

## Evidencia de verificación (mitigate)

### T-02-01 — aislamiento por tenant (owner_id + RLS) — CLOSED
- `app/(dashboard)/layout.tsx:18-22` — `supabase.from('businesses').select('*').eq('owner_id', user.id).single()`, con `createClient()` de `@/lib/supabase/server` (anon key + cookies → RLS activa). No se recibe ni usa ningún `business_id` del cliente.
- `app/(dashboard)/layout.tsx:46` — el banner se monta con `connectionError={business.mp_connection_status === 'error' && !!business.mp_user_id}`, derivado del business del dueño.
- `app/(dashboard)/negocio/page.tsx:12,24` — mismo patrón: business por `.eq('owner_id', user.id).single()` y pasado como prop a `SettingsClient`.
- `app/(dashboard)/settings/settings-client.tsx:715-717` — `mpConnected` / `mpConnectionError` derivan del prop `business` (owner-scoped), no de un id del cliente.

### T-02-02 — no exponer token/secreto/número de cuenta — CLOSED
- `components/dashboard/mp-connection-banner.tsx:12` — firma `MpConnectionBanner({ connectionError }: { connectionError: boolean })`: el único prop es un booleano; estructuralmente no puede transportar token/secret. `tsc` fuerza el tipo.
- `app/(dashboard)/settings/settings-client.tsx:1610-1619` — estado conectado (D-09): renderiza solo "Conectado" + `Check`, sin `mp_user_id`. Grep confirma que no existe el fragmento "· cuenta" ni "cuenta #".
- `settings-client.tsx:715-717` — `mp_user_id` se usa SOLO como flag en la lógica, no se renderiza.
- Estados caído (`1620-1633`) y desconectado (`1634-1638`): no imprimen valores de token ni secrets.

---

## Accepted Risks Log

| Risk ID | Threat Ref | Rationale | Accepted By | Date |
|---------|------------|-----------|-------------|------|
| AR-02-03 | T-02-03 | UI read-only del flag `mp_connection_status`. La escritura es server-only (Phase 1: callback OAuth / getValidMpAccessToken / createDepositPreference con service-role). Esta fase no abre superficie de escritura nueva: tocó solo 3 archivos de UI (`layout.tsx`, `settings-client.tsx`, `mp-connection-banner.tsx`); sin cambios en `supabase/`, `app/api/` ni `package.json`. "Reconectar" navega al OAuth existente (`/api/mercadopago/connect`), no modificado. Falsear el flag desde el cliente solo altera la vista propia del atacante, no habilita cobros. Riesgo bajo. | plan-time threat model (02-01-PLAN.md), verificado por gsd-security-auditor | 2026-07-20 |
| AR-02-04 | T-02-04 | El logo (`MpLogo`, `settings-client.tsx:139-149`) es un `<svg>` estático inline con `aria-hidden="true"`, sin `fetch`, sin datos del negocio y con un solo prop `className`. No introduce superficie de datos. | plan-time threat model, verificado por gsd-security-auditor | 2026-07-20 |
| AR-02-SC | T-02-SC | Sin dependencias npm nuevas: SUMMARY `tech-stack.added: []`; `package.json` no cambió en ninguno de los 3 commits de la fase (`ca6c006`, `2d416c7`, `5a2846a`). Logo SVG inline a mano (patrón google-button), reusa `lucide-react`/shadcn ya presentes. Sin superficie de supply-chain nueva. | plan-time threat model, verificado por gsd-security-auditor | 2026-07-20 |

*Accepted risks do not resurface in future audit runs.*

---

## Unregistered Flags

Ninguno. El SUMMARY no declara `## Threat Flags`. La única desviación registrada es un
`eslint-disable-next-line @next/next/no-html-link-for-pages` sobre el `<a href="/api/mercadopago/connect">`
del banner (navegación HTTP completa a propósito hacia un route handler OAuth, no `next/link`):
es un escape hatch de lint sobre una ancla intencional, no una superficie de ataque nueva.

---

## Security Audit Trail

| Audit Date | Threats Total | Closed | Open | Run By |
|------------|---------------|--------|------|--------|
| 2026-07-20 | 5 | 5 | 0 | gsd-security-auditor |

---

## Sign-Off

- [x] All threats have a disposition (mitigate / accept / transfer)
- [x] Accepted risks documented in Accepted Risks Log
- [x] `threats_open: 0` confirmed
- [x] `status: verified` set in frontmatter

**Approval:** verified 2026-07-20
