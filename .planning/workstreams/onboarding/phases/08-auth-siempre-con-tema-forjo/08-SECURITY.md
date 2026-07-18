---
phase: 08
slug: auth-siempre-con-tema-forjo
status: verified
threats_open: 0
asvs_level: 1
created: 2026-07-18
---

# Phase 08 — Security

> Contrato de seguridad de la fase. Workstream `onboarding`, milestone v0.20 "Onboarding pulido". ONB-05: reset del tema del tenant al Forjo base en las pantallas de auth.

**Superficie de ataque efectivamente nula:** un script estático pre-paint con valores 100% literales, sin input, sin acceso a datos, sin service-role, sin deps nuevas. El auditor verificó cada disposición contra el código real. **4/4 cerradas.**

---

## Trust Boundaries

| Boundary | Description | Data Crossing |
|----------|-------------|---------------|
| `ResetThemeScript` → `<html>` | Script inline que resetea atributos de presentación del propio browser | Ninguno (valores literales estáticos, sin input) |

---

## Threat Register

| Threat ID | Category | Component | Disposition | Mitigation | Status |
|-----------|----------|-----------|-------------|------------|--------|
| T-08-01 | Tampering (injection) | `ResetThemeScript` (`dangerouslySetInnerHTML`) | accept (N/A) | `__html` armado solo con literales estáticos (`'red'`, `'--primary'`); cero interpolación (`grep '${'` = 0). La función no recibe params — ni usuario, ni DB, ni URL cruzan el límite. Unit test asserta el string exacto. Sin vector de inyección | closed |
| T-08-02 | Information Disclosure | Reset sobre `<html>` | accept (N/A) | Toca SOLO `dataset.palette/theme/font` + `style --primary` del `<html>` del browser; sin `fetch`/supabase/`business_id`/service-role. No lee ni escribe datos de negocio → aislamiento multi-tenant no aplica | closed |
| T-08-03 | Tampering (regresión de scope) | Colocación del layout en `(auth)` | mitigate | Los route-group layouts de Next están acotados a su subárbol; `(auth)/layout.tsx` es HERMANO de `(dashboard)`/`[slug]` bajo `app/`, no ancestro → el reset no se filtra. Diff de la fase = 3 archivos nuevos (A); `PaletteScript`, `(dashboard)/layout`, `[slug]/layout`, `(split)/layout` NO tocados (verificado por `git diff`) | closed |
| T-08-SC | Tampering (supply chain) | npm installs | accept (N/A) | La fase NO instala/actualiza paquetes; `package.json`/`package-lock.json` ausentes del diff; `tech-stack.added: []` | closed |

*Status: open · closed*

---

## Accepted Risks Log

| Risk ID | Threat Ref | Rationale | Accepted By | Date |
|---------|------------|-----------|-------------|------|
| AR-08-01 | T-08-01 | El script de reset no tiene input: `__html` son literales estáticos, sin interpolación. El `JSON.stringify` que usa `PaletteScript` no hace falta acá porque no recibe valores. N/A, no residual. | Forjo Studio | 2026-07-18 |
| AR-08-02 | T-08-02 | El reset solo toca atributos de presentación del `<html>` local; sin acceso a datos. N/A. | Forjo Studio | 2026-07-18 |
| AR-08-03 | T-08-SC | Cero paquetes nuevos → sin superficie supply-chain. N/A. | Forjo Studio | 2026-07-18 |

---

## Security Audit Trail

| Audit Date | Threats Total | Closed | Open | Run By |
|------------|---------------|--------|------|--------|
| 2026-07-18 | 4 | 4 | 0 | gsd-security-auditor (opus) |

**Notas del audit (verificación independiente):**
- `grep '${'` en `reset-theme-script.tsx` → 0 matches (literales 100% estáticos, sin vector de inyección).
- `vitest run components/reset-theme-script.test.tsx` → 5/5 passed (confirmado, no solo declarado).
- `git diff` de la fase = exactamente 3 archivos nuevos (A); ningún layout existente ni `PaletteScript` ni `package.json` modificados → no-regresión confirmada.
- `AuthLayout` es Server Component (sin `'use client'`), renderiza `<ResetThemeScript />` antes de `{children}` en un Fragment, sin markup visual.

**Pendiente (no de seguridad):** UAT del efecto DOM cross-navegación en staging con un negocio de `palette != 'red'` (login → dashboard con su paleta → logout → auth en Forjo base, en claro y oscuro).

---

## Sign-Off

- [x] Todas las amenazas tienen disposición (mitigate / accept)
- [x] Riesgos aceptados documentados en el Accepted Risks Log
- [x] `threats_open: 0` confirmado
- [x] `status: verified` en el frontmatter

**Approval:** verified 2026-07-18
