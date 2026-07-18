---
phase: 9
slug: rediseno-visual-del-login
status: verified
threats_open: 0
asvs_level: 1
created: 2026-07-18
---

# Phase 9 — Security

> Per-phase security contract: threat register, accepted risks, and audit trail.
> Rediseño VISUAL de las pantallas de auth del split (login/forgot/reset), mobile y desktop, sin
> cambios de lógica. Reusa flujos existentes (signInWithPassword, signInWithOAuth). Sin endpoints,
> queries, service-role, migraciones ni deps nuevas. Superficie nueva = sólo presentación.

---

## Trust Boundaries

| Boundary | Description | Data Crossing |
|----------|-------------|---------------|
| Cliente ↔ formularios de auth (mobile sheet + desktop) | Reusan flujos EXISTENTES (`signInWithPassword`, `signInWithOAuth`). No se agregan endpoints, queries, service-role ni migraciones. | Credenciales de login (email/password), inicio de OAuth de Google. |

---

## Threat Register

| Threat ID | Category | Component | Disposition | Mitigation | Status |
|-----------|----------|-----------|-------------|------------|--------|
| T-09-01 | Tampering (open redirect) | `useGoogleSignIn` + CTA Google del hero mobile | mitigate | `redirectTo` fijo `${window.location.origin}/auth/callback`, centralizado en el hook | closed |
| T-09-02 | Information Disclosure (reflected input) | Aviso OAuth en `MobileLoginHero` | accept (N/A) | Compara `=== 'oauth'` contra literal fijo; nunca refleja el valor de la query | closed |
| T-09-03 | Information Disclosure (user enumeration) | Form del bottom sheet | accept (N/A) | Reusa `signInWithPassword` con error genérico; sin oráculo de enumeración | closed |
| T-09-04 | Tampering (regresión de scope) | `.auth-cream-panel` (globals.css) | mitigate | Skin acotado a la clase; no toca `:root`/`.dark`/`[data-palette]` ni el theming de dashboard/`[slug]` | closed |
| T-09-SC | Tampering (supply chain) | npm installs | accept (N/A) | Sin paquetes nuevos ni actualizados | closed |

*Status: open · closed*
*Disposition: mitigate (implementation required) · accept (documented risk) · transfer (third-party)*

### Evidencia de verificación

- **T-09-01 — CLOSED (mitigate).** El `redirectTo` es SIEMPRE el callback fijo en
  `components/auth/google-button.tsx:37` (`redirectTo: \`${window.location.origin}/auth/callback\``),
  dentro de `useGoogleSignIn` (`components/auth/google-button.tsx:25-50`). El CTA de Google del hero
  mobile REUSA ese mismo hook — no tiene su propia llamada: import en
  `components/auth/mobile-login-hero.tsx:12,47` y uso en `mobile-login-hero.tsx:143`
  (`onClick={googleSignIn}`). Grep de `signInWithOAuth|redirectTo` en todo `*.{ts,tsx}` confirma un
  ÚNICO `signInWithOAuth` (google-button.tsx:33) y un único `redirectTo` de código
  (google-button.tsx:37): no hay ruta divergente ni segunda superficie. No se refleja input del
  usuario ni el destino final. Invariante T-05-02 preservada.

- **T-09-02 — CLOSED (accept, N/A).** El aviso de fallo OAuth del hero mobile lee
  `window.location.search` en un effect client-only y compara `params.get('error') !== 'oauth'`
  contra un literal fijo, mostrando un toast con texto CONSTANTE, nunca el valor de la query
  (`components/auth/mobile-login-hero.tsx:74-81`). El banner desktop hace lo mismo:
  `params.get('error') !== 'oauth'` con copy fijo (`app/(auth)/(split)/login/page.tsx:33-42`). Sin
  XSS ni oráculo. `matchMedia('(max-width: 759px)')` gatea el toast al viewport mobile para no
  duplicar el banner desktop. Riesgo registrado en el Accepted Risks Log.

- **T-09-03 — CLOSED (accept, N/A).** El form del bottom sheet usa `signInWithPassword` y muestra el
  MISMO error genérico "Email o contraseña incorrectos" (`mobile-login-hero.tsx:90`), idéntico al
  form desktop (`app/(auth)/(split)/login/page.tsx:60`). No distingue usuario inexistente de
  contraseña incorrecta → no introduce oráculo de enumeración. Riesgo registrado en el log.

- **T-09-04 — CLOSED (mitigate).** El skin crema está acotado a la clase `.auth-cream-panel`
  (`app/globals.css:172-193`): las 11 reglas del bloque están todas prefijadas con `.auth-cream-panel`
  y las custom properties se redefinen SÓLO dentro de ese scope. Grep de `:root|\.dark|data-palette`
  sobre globals.css NO devuelve ninguna coincidencia dentro del bloque `.auth-cream-panel` (sólo los
  bloques del tema base, CRM shell, impersonation-view y frj-site, ajenos a esta fase). La clase se
  aplica únicamente al panel del form en `app/(auth)/(split)/layout.tsx:64`. No toca el theming de
  dashboard/`[slug]`; ONB-05 (reset de paleta de tenant) se preserva — todos los colores son
  literales Forjo.

- **T-09-SC — CLOSED (accept, N/A).** La fase no instala ni actualiza paquetes: `package.json` no
  está en `files_modified` del plan/summary, y los imports de los 5 archivos tocados son todos deps
  ya presentes (react, next/navigation, next/link, react-hook-form, @hookform/resolvers/zod, zod,
  sonner, lucide-react, @/lib/supabase/client). Cero superficie supply-chain. Riesgo registrado en el
  log.

---

## Accepted Risks Log

| Risk ID | Threat Ref | Rationale | Accepted By | Date |
|---------|------------|-----------|-------------|------|
| AR-09-02 | T-09-02 | Aviso OAuth compara `=== 'oauth'` contra literal fijo y muestra copy constante; nunca refleja la query. Sin reflected-input real. | Plan-time register (author) | 2026-07-18 |
| AR-09-03 | T-09-03 | Login reusa `signInWithPassword` con error genérico idéntico en mobile y desktop; no introduce oráculo de enumeración. | Plan-time register (author) | 2026-07-18 |
| AR-09-SC | T-09-SC | Rediseño de presentación sobre deps ya presentes; no instala ni actualiza paquetes. Sin superficie supply-chain. | Plan-time register (author) | 2026-07-18 |

*Accepted risks do not resurface in future audit runs.*

---

## Unregistered Flags

`components/auth/mobile-login-hero.tsx/09-01-SUMMARY.md` no contiene sección `## Threat Flags`.
No se detectó superficie de ataque nueva sin mapear durante la implementación. Ninguna.

---

## Security Audit Trail

| Audit Date | Threats Total | Closed | Open | Run By |
|------------|---------------|--------|------|--------|
| 2026-07-18 | 5 | 5 | 0 | gsd-security-auditor |

---

## Sign-Off

- [x] All threats have a disposition (mitigate / accept / transfer)
- [x] Accepted risks documented in Accepted Risks Log
- [x] `threats_open: 0` confirmed
- [x] `status: verified` set in frontmatter

**Approval:** verified 2026-07-18
