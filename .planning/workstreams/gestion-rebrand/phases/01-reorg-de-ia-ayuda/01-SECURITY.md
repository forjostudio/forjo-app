---
phase: 01
slug: reorg-de-ia-ayuda
status: secured
threats_open: 0
threats_total: 11
threats_closed: 11
asvs_level: 1
created: 2026-07-05
---

# SECURITY.md — Fase 01 reorg-de-ia-ayuda (gestion-rebrand)

**Estado:** SECURED — 11/11 amenazas cerradas
**ASVS Level:** 1
**block_on:** high (ninguna amenaza high sin mitigar)
**Base de comparación:** commit `acc3833` → HEAD
**Auditado:** 2026-07-05

Fase behavior-frozen (reorg de navegación). El register fue autorado en plan-time
(`register_authored_at_plan_time: true`). Cada mitigación fue verificada contra el código
implementado; los `accept` se validaron contra el código para confirmar que la superficie
declarada como nula efectivamente lo es. Archivos de implementación READ-ONLY (no modificados).

## Verificación de amenazas

| Threat ID | Categoría | Disposición | Estado | Evidencia |
|-----------|-----------|-------------|--------|-----------|
| T-01-01 | Information disclosure | mitigate | CLOSED | `components/dashboard/sidebar.tsx` L69-76: `buildNavGroups` filtra cada key de grupo contra `new Set(resolveVertical(business).menu)` (`menu.has(k)`) — misma fuente de gating que la lista plana original; grupo sin items no renderiza (L76 `.filter(g => g.items.length > 0)`). `git diff acc3833..HEAD -- lib/verticals.ts` VACÍO (verticals.ts intacto). |
| T-01-02 | Tampering | accept | CLOSED (riesgo aceptado) | `sidebar.tsx` L56-68: `ITEMS` es un mapa estático local; los `href` no vienen de input del cliente. Diff del sidebar solo agrega el link `/ayuda` (HELP-01); ningún otro destino cambió (behavior-frozen). |
| T-01-SC | Tampering (supply-chain) | mitigate | CLOSED | `git diff --stat acc3833..HEAD -- package.json` y `-- package-lock.json` VACÍOS. Cero dependencias nuevas. |
| T-02-01 | Information disclosure | mitigate | CLOSED | `app/(dashboard)/negocio/page.tsx` L12: `business` resuelto por `.eq('owner_id', user.id).single()` (server-side). L20: `getBusinessSecrets(business.id)` con ese id del dueño. `lib/business-secrets.ts` L35-42: service-role server-only, `.eq('business_id', businessId)`. Sin ruta de id proveniente del cliente. |
| T-02-02 | Spoofing / CSRF | mitigate | CLOSED | `git diff acc3833..HEAD` de `callback/route.ts` y `connect/route.ts`: los únicos cambios son los strings de redirect `/settings`→`/negocio` + un comentario. La validación `state !== saved` (callback L22), cookie `mp_oauth_state` (connect L17-23), `redirect('/login')` sin user (callback L26) y `exchangeMpCode(code)` (callback L28) permanecen intactos. CSRF no debilitado. |
| T-02-03 | Tampering | accept | CLOSED (riesgo aceptado) | `settings-client.tsx` diff (efecto `?mp=`, gateado por `isNegocio`): un valor arbitrario `?mp=foo` no dispara la rama `connected` ni `error`; el flag solo controla `toast` + tab local + `replaceState(null, '', '/negocio')`. No autoriza ni persiste nada. Superficie nula confirmada en código. |
| T-02-04 | Elevation of privilege | mitigate | CLOSED | `settings-client.tsx` diff: los cambios se limitan a los `TabsTrigger` de los dos `TabsList` (config reducido a 3 + hub Negocio de 4) y al link `/ayuda` agregado DESPUÉS de `</Tabs>`. Ningún `<TabsContent>` (Cobros/Integraciones/Notificaciones) fue editado — cuerpo behavior-frozen; conservan su guardado owner-only. |
| T-02-SC | Tampering (supply-chain) | mitigate | CLOSED | `git diff --stat acc3833..HEAD -- package.json` VACÍO. Se reusan `@/components/ui/tabs`, `getBusinessSecrets`, `mpConnectConfigured` (ya instalados). |
| T-03-01 | Information disclosure | accept | CLOSED (riesgo aceptado) | `app/(dashboard)/ayuda/page.tsx`: contenido 100% estático (`const FAQ` a nivel de módulo, L8-44), sin fetch, sin datos de tenant, sin secretos. Sesión forzada por `(dashboard)/layout.tsx` L13-15 (`getUser()` → `redirect('/login')`). Sin fuga posible. |
| T-03-02 | Tampering | accept | CLOSED (riesgo aceptado) | `ayuda/page.tsx` L61-67: disclosures `<details>`/`<summary>` nativos, sin JS custom ni ARIA manual, sin estado de servidor ni acción. Superficie nula. |
| T-03-SC | Tampering (supply-chain) | mitigate | CLOSED | HARD GATE cumplido: `git diff --stat acc3833..HEAD -- package.json` VACÍO. La FAQ usa `<details>`/`<summary>` nativo; `ayuda/page.tsx` NO importa shadcn Accordion ni `@radix-ui/react-accordion` (las únicas apariciones de "Accordion" son un comentario que documenta la ausencia de la dependencia). |

## Alcance de archivos verificado

`git diff --stat acc3833..HEAD` toca solo estos archivos de implementación (todos declarados en los planes):

- `components/dashboard/sidebar.tsx` (T-01-01/02, link ayuda T-03)
- `app/(dashboard)/negocio/page.tsx` (T-02-01)
- `app/(dashboard)/settings/settings-client.tsx` (T-02-03/04, link ayuda T-03)
- `app/api/mercadopago/callback/route.ts` (T-02-02)
- `app/api/mercadopago/connect/route.ts` (T-02-02)
- `app/(dashboard)/ayuda/page.tsx` (nuevo, T-03-01/02)

Sin archivos de implementación fuera del set declarado. `lib/verticals.ts`, `package.json` y
`package-lock.json` sin cambios.

## Riesgos aceptados (log)

- **T-01-02** — hrefs de navegación desde mapa estático local (no input cliente); riesgo de
  regresión visual, no de ataque. Behavior-frozen: destinos sin cambios.
- **T-02-03** — flag `?mp=connected|error` no confiable: solo dispara toast + tab local +
  `replaceState`; no autoriza ni persiste. Un valor arbitrario no dispara ninguna rama.
- **T-03-01** — contenido de la FAQ estático y genérico, sin datos de tenant ni secretos; página
  protegida por sesión vía el layout de `(dashboard)`.
- **T-03-02** — disclosure `<details>` nativo, sin JS/ARIA custom; superficie nula.

## Unregistered Flags

Ninguno. La única sección `## Threat Flags` presente en los SUMMARY (01-03) declara "Ninguno".
No apareció superficie de ataque nueva sin mapear durante la implementación.
