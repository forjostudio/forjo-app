# Phase 8: Auth siempre con tema Forjo - Research

**Researched:** 2026-07-17
**Domain:** Next.js 16 App Router — route-group layout nesting + reset de theming (data-attributes en `<html>`) con anti-flash pre-paint
**Confidence:** HIGH

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- **D-01:** El reset se hace en el **layout del route group `(auth)`** (`app/(auth)/layout.tsx`). Cubre TODOS los caminos de llegada a auth (logout, sesión vencida, entrar directo por URL), tanto SSR como navegación client-side.
- **D-02:** El reset pone `data-palette="red"` y **borra** `data-theme`/`data-font` de `<html>` (defaults del tema Forjo base, iguales al root layout). Debe correr **antes de pintar** (script inline, como `PaletteScript`) para evitar el flash de la paleta del negocio.
- **D-03:** **Respeta claro/oscuro** — NO toca la clase `.dark` que maneja next-themes ni el `ThemeProvider`. Solo se resetea paleta/tema/fuente del tenant.
- **D-04 (invariante de no-regresión):** el reset está **acotado al layout de (auth)** → el dashboard y `/[slug]` conservan su paleta/tema/fuente intactos.

### Claude's Discretion
- La forma exacta del script de reset (componente tipo `ResetPaletteScript` análogo a `PaletteScript`, o inline en el layout): seguir el patrón de `PaletteScript` para el anti-flash.

### Deferred Ideas (OUT OF SCOPE)
- None — fase de un solo requisito, acotada.
- Fuera de scope explícito (del CONTEXT): cambiar el theming del dashboard o de `/[slug]`, tocar `PaletteScript` en sus usos actuales, o rediseñar las pantallas de auth.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| ONB-05 | login, register, forgot-password y reset-password usan SIEMPRE el tema Forjo (respetando claro/oscuro), nunca la paleta del tenant; al cerrar sesión la paleta/tema del dashboard no se traslada. | El nuevo `app/(auth)/layout.tsx` (Server Component) renderiza un script inline que resetea `data-palette=red` + borra `data-theme`/`data-font` + `removeProperty('--primary')` antes de pintar. Al ser padre de `(auth)/(split)/*` y `(auth)/register`, cubre las 4 pantallas. No toca `.dark` (next-themes intacto). Ver Architecture Patterns + Code Examples. |
</phase_requirements>

## Summary

La fase es un fix de theming quirúrgico y de un solo archivo. Hoy no existe `app/(auth)/layout.tsx` — el único layout en el route group es `app/(auth)/(split)/layout.tsx` (el panel Bauhaus de Phase 4, que envuelve solo login/forgot/reset). El bug: `PaletteScript` muta `data-palette`/`data-theme`/`data-font` sobre `<html>` en el dashboard y en `/[slug]`; como `<html>` persiste a través de la navegación client-side, al hacer logout con `router.push('/login')` (soft-nav, confirmado en `sidebar.tsx:91-94`) esos atributos quedan pegados y las pantallas de auth heredan la paleta del negocio. En un full-load de `/login` no pasa porque el root layout re-emite `data-palette="red"` como atributo estático del `<html>`.

**Solución:** crear `app/(auth)/layout.tsx` como Server Component que renderiza un script inline de reset (espejo invertido de `PaletteScript`) + `{children}`. En Next 16, un layout en `(auth)/` es padre de TODO el subárbol: envuelve tanto `(auth)/(split)/*` (login/forgot/reset) como `(auth)/register` — cubre las 4 pantallas sin conflicto con `(split)/layout.tsx`. El `(split)/layout.tsx` sigue siendo el layout visual de sus 3 pantallas; el nuevo `(auth)/layout.tsx` NO agrega markup visual (solo el script), así que NO arrastra `/register` al split — que era exactamente el temor documentado en `(split)/layout.tsx:8-10` cuando ese comentario descartó poner el **panel** a nivel `(auth)`. Un reset de theming (sin markup) no tiene ese problema.

El patrón de script inline es el correcto para el anti-flash porque React ejecuta el `<script dangerouslySetInnerHTML>` **durante el commit, antes del paint** — evidencia empírica: `PaletteScript` aplica la paleta del dashboard justamente en el soft-nav de login (`login/page.tsx:63` usa `router.push('/dashboard')` + `router.refresh()`), por eso la paleta "se pega". El mismo mecanismo, invertido, resetea sin flash en el soft-nav de logout. Un `useEffect` NO serviría: corre después del paint → flash garantizado.

**Primary recommendation:** Crear `app/(auth)/layout.tsx` (Server Component) que renderice un `<ResetThemeScript />` (script inline: `data.palette='red'; delete data.theme; delete data.font; removeProperty('--primary')`) seguido de `{children}`. Sin tocar `.dark`, sin tocar `PaletteScript`, sin migración ni deps. Verificación = UAT (más un test unitario opcional del string del script).

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Reset de paleta/tema/fuente en auth | Browser / Client (script inline pre-paint sobre `<html>`) | Frontend Server (el layout Server Component emite el script en el HTML) | El theming vive en atributos de `<html>` que persisten a través de la navegación SPA; solo un script client-executed puede DESHACER lo que dejó una navegación previa. El layout (server) es el vehículo que inyecta ese script en las 4 pantallas de auth. |
| next-themes claro/oscuro (`.dark`) | Browser / Client (next-themes) | — | Eje ortogonal; NO se toca. El reset opera solo sobre `dataset`/`style`, nunca sobre `classList`. |

## Standard Stack

Sin dependencias nuevas. Se usa exclusivamente lo ya presente:

| Herramienta | Versión | Rol en esta fase | Fuente |
|-------------|---------|------------------|--------|
| next | 16.2.7 | Route-group layout nesting (`app/(auth)/layout.tsx`) | [VERIFIED: package.json / .claude/CLAUDE.md] |
| react | 19.2.4 | Render del `<script dangerouslySetInnerHTML>` en el árbol (ejecuta en commit, pre-paint) | [VERIFIED: package.json] |
| next-themes | 0.4.6 | Maneja la clase `.dark` (NO se toca) | [VERIFIED: package.json] |

**Installation:** N/A — no se instala nada.

## Package Legitimacy Audit

N/A — esta fase no instala ni actualiza paquetes externos. Cero superficie de supply-chain.

## Architecture Patterns

### Estructura de route groups (estado actual + cambio)

```
app/
├── layout.tsx                      # ROOT: <html data-palette="red"> + ThemeProvider (define "Forjo base")
├── (auth)/
│   ├── layout.tsx                  # ← NUEVO: reset script + {children}. Padre de TODO (auth).
│   ├── (split)/
│   │   ├── layout.tsx              # EXISTE (Phase 4): panel Bauhaus. Envuelve solo estas 3:
│   │   │   ├── login/page.tsx
│   │   │   ├── forgot-password/page.tsx
│   │   │   └── reset-password/page.tsx
│   └── register/page.tsx           # FUERA del split — el nuevo (auth)/layout SÍ lo cubre
├── (dashboard)/layout.tsx          # PaletteScript(business.*) — NO SE TOCA (D-04)
└── [slug]/layout.tsx               # PaletteScript(landingTheme) — NO SE TOCA (D-04)
```

**Anidamiento resultante (Next 16 App Router):**
- `/login`, `/forgot-password`, `/reset-password` → `root layout` › `(auth)/layout` › `(split)/layout` › page
- `/register` → `root layout` › `(auth)/layout` › page

El nuevo `(auth)/layout` es padre común de ambas ramas → **el reset cubre las 4 pantallas con un solo archivo.** [CITED: Next.js layouts nest by folder; route groups `(...)` no aportan segmento de URL — `node_modules/next/dist/docs/`, y confirmado por el comentario de `(split)/layout.tsx:8-10`]

### Pattern 1: Reset de theming como espejo invertido de PaletteScript

**What:** Un componente que devuelve un `<script dangerouslySetInnerHTML>` con literales estáticos que fuerzan los defaults Forjo sobre `<html>`.
**When to use:** En el `(auth)/layout.tsx`, antes de `{children}`.
**Por qué inline y no useEffect:** React monta y ejecuta el script inline durante el commit, **sincrónicamente antes del paint** del nuevo route → sin flash. Un `useEffect`/`useLayoutEffect` corre después del paint → se vería un frame con la paleta del negocio. Evidencia de que el inline ejecuta en soft-nav: `PaletteScript` aplica la paleta del dashboard en el `router.push('/dashboard')` de `login/page.tsx:63` (por eso queda "pegada" y filtra a auth).

**Example:**
```tsx
// components/reset-theme-script.tsx  (Server Component, sin 'use client' — igual que PaletteScript)
// Espejo invertido de PaletteScript: fuerza el tema Forjo base sobre <html>, antes de pintar.
// - data-palette = 'red'      (default del root layout)
// - borra data-theme/data-font (los defaults Forjo = ausencia de atributo)
// - removeProperty('--primary') (por si un /[slug] con override de landing lo dejó inline)
// NO toca la clase .dark: es de next-themes (eje claro/oscuro ortogonal, D-03).
export function ResetThemeScript() {
  const js =
    `(()=>{const e=document.documentElement,d=e.dataset;` +
    `d.palette='red';` +
    `delete d.theme;` +
    `delete d.font;` +
    `e.style.removeProperty('--primary');` +
    `})()`
  return <script dangerouslySetInnerHTML={{ __html: js }} />
}
```

```tsx
// app/(auth)/layout.tsx  (Server Component)
import { ResetThemeScript } from '@/components/reset-theme-script'

// Reset del theming del tenant para TODAS las pantallas de auth (login/register/forgot/reset).
// Padre común de (auth)/(split)/* y (auth)/register → cubre las 4. Solo agrega el script:
// NO renderiza el panel Bauhaus (ese vive en (split)/layout.tsx), así que /register NO entra al split.
export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <ResetThemeScript />
      {children}
    </>
  )
}
```

**Nota sobre `--primary`:** el dashboard llama a `PaletteScript` SIN la prop `primary` (comentario en `palette-script.tsx:16-17`), así que el vector real de leak desde logout es solo `data-*`. Pero `/[slug]` SÍ puede setear `--primary` inline (landing override, THEME-03). `removeProperty('--primary')` es seguro-barato que cierra el leak teórico `/[slug] → /login` por soft-nav. Incluirlo. Si el planner prefiere el mínimo estricto de D-02 (solo data-attributes), es aceptable, pero se recomienda incluir `--primary` por robustez.

### Anti-Patterns to Avoid
- **Poner el reset en un `useEffect`:** corre post-paint → flash de la paleta del negocio en el soft-nav de logout. Debe ser script inline en el árbol.
- **Poner el reset a nivel `(split)`:** no cubriría `/register` (está fuera del split). Debe ir en `(auth)`.
- **Poner el panel Bauhaus a nivel `(auth)`:** arrastraría `/register` al split (violaría el diseño de Phase 4). El `(auth)/layout` debe agregar SOLO el script, cero markup visual.
- **Tocar `classList`/`.dark` o el `ThemeProvider`:** rompería la preferencia claro/oscuro (D-03). El reset opera solo sobre `dataset` y `style`.
- **Duplicar lógica de paleta en `(split)/layout.tsx`:** ese archivo no setea/resetea nada de theming (solo markup con `bg-primary`, que ya hereda del reset). No tocarlo.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Anti-flash pre-paint | Un observador/`useEffect` que corrige el tema | Script inline en el árbol del layout (patrón `PaletteScript`) | Es el patrón ya validado en el repo; React lo ejecuta en commit antes del paint. |
| Cobertura de las 4 pantallas | Resetear en cada `page.tsx` o en el flujo de logout | Un único `(auth)/layout.tsx` padre | Un solo punto cubre logout, sesión vencida y entrada directa por URL; menos agujeros. |

**Key insight:** El theming vive en atributos de `<html>` que sobreviven a la navegación SPA. El fix correcto no es "limpiar al salir del dashboard" (deja agujeros por cada camino de entrada a auth) sino "forzar el default al entrar a auth", en el layout que envuelve las 4 pantallas.

## Runtime State Inventory

No aplica en sentido de datos persistidos/servicios (es un cambio de código puro), pero el punto central de esta fase ES estado runtime en el DOM:

| Category | Items Found | Action Required |
|----------|-------------|------------------|
| Stored data | None — no hay DB/migración involucrada. | Ninguna |
| Live service config | None. | Ninguna |
| OS-registered state | None. | Ninguna |
| Secrets/env vars | None. | Ninguna |
| Build artifacts | None. | Ninguna |
| **DOM runtime state (el objetivo real)** | `<html>` acumula `data-palette`/`data-theme`/`data-font` (y potencialmente `style="--primary"`) de `PaletteScript`; persisten a través de soft-nav. | Reset en `(auth)/layout.tsx` (código nuevo, NO migración de datos). |

## Common Pitfalls

### Pitfall 1: Flash de la paleta del tenant si el reset no es pre-paint
**What goes wrong:** Se ve un frame con la paleta/tema del negocio antes de que aparezca el tema Forjo.
**Why it happens:** Se implementó el reset en `useEffect` (post-paint) en vez de script inline (commit, pre-paint).
**How to avoid:** Renderizar `<script dangerouslySetInnerHTML>` dentro del árbol del layout, como `PaletteScript`.
**Warning signs:** Parpadeo naranja→azul→naranja al hacer logout desde un negocio con paleta custom.

### Pitfall 2: `/register` sin cubrir
**What goes wrong:** login/forgot/reset se resetean pero `/register` sigue heredando la paleta.
**Why it happens:** Se puso el reset a nivel `(split)` (que no incluye register) en vez de `(auth)`.
**How to avoid:** El reset va en `app/(auth)/layout.tsx`, padre de ambas ramas.
**Warning signs:** Al ir de un dashboard con paleta custom a `/register`, se ve la paleta del negocio.

### Pitfall 3: Romper claro/oscuro
**What goes wrong:** Tras logout, el usuario que estaba en dark vuelve a light (o viceversa).
**Why it happens:** El reset tocó `classList`/`.dark` o reinició el `ThemeProvider`.
**How to avoid:** El reset toca SOLO `dataset` (palette/theme/font) y `style` (`--primary`), nunca `classList`. next-themes es dueño de `.dark`. Las variantes dark son selectores CSS `.dark[data-palette=red]` → con `.dark` intacto + `data-palette=red` se obtiene el Forjo base en oscuro (D-03).
**Warning signs:** El modo cambia solo al entrar a cualquier pantalla de auth.

### Pitfall 4: Regresión del dashboard o `/[slug]`
**What goes wrong:** El dashboard o la página pública pierden su paleta custom.
**Why it happens:** Se modificó `PaletteScript`, o el `(auth)/layout` se colocó donde afecta a siblings.
**How to avoid:** Los route-group layouts están acotados a su subárbol; `(auth)/layout` NO afecta a `(dashboard)` ni `[slug]` (son grupos hermanos bajo `app/`). No tocar `PaletteScript` ni los layouts de dashboard/slug.
**Warning signs:** El dashboard o `/[slug]` aparecen en rojo Forjo en vez de su paleta.

### Pitfall 5: `(split)/layout.tsx` ya reseteaba algo (doble lógica)
**Verificado:** `(split)/layout.tsx` NO setea ni resetea theming — solo renderiza markup (`bg-primary`, `bg-background`, `Image`). No hay doble lógica; no tocarlo. [VERIFIED: lectura de `app/(auth)/(split)/layout.tsx`]

## Code Examples

Ver Pattern 1 arriba (los dos snippets: `components/reset-theme-script.tsx` + `app/(auth)/layout.tsx`). Referencia del molde a invertir: `components/palette-script.tsx:27-36` (construcción del JS con `delete d.theme`/`delete d.font`).

## State of the Art

No aplica — no hay cambio de enfoque tecnológico. El patrón (script inline pre-paint para atributos de `<html>`) es el mismo que ya usa el repo con `PaletteScript` y el que recomienda next-themes/Next para evitar theme-flash.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | El `<script dangerouslySetInnerHTML>` inline re-ejecuta en el soft-nav de entrada a `(auth)` (mount fresco del layout al pasar de `(dashboard)`/`[slug]` a `(auth)`). Basado en evidencia de que `PaletteScript` aplica la paleta del dashboard en el soft-nav de login. | Architecture Patterns / Summary | Si por alguna versión de React el script no corriera en soft-nav, quedaría flash/leak. **Mitigación de hardening (opcional):** agregar un `ResetThemeClient` (`'use client'` + `useInsertionEffect`/`useLayoutEffect` con la misma lógica) como respaldo. Detectable en UAT (Pitfall 1). Se recomienda NO agregarlo salvo que UAT muestre flash — mantener el mínimo. |

**Nota:** A1 es LOW-risk en la práctica: el mecanismo idéntico (PaletteScript) funciona hoy en soft-nav, y ese es justamente el origen del bug que esta fase corrige.

## Open Questions

1. **¿Incluir `removeProperty('--primary')` o ceñirse al mínimo de D-02?**
   - Qué sabemos: el leak real desde logout es solo `data-*` (dashboard no pasa `primary`); `--primary` solo lo setea `/[slug]`.
   - Qué falta: confirmar si el planner quiere cubrir el vector teórico `/[slug]→/login` por soft-nav.
   - Recomendación: incluirlo (barato, cierra el caso). Si se prefiere el literal de D-02, omitirlo es aceptable.

2. **¿Existe un negocio con paleta no-`red` en el entorno local para UAT?**
   - Qué sabemos: UAT necesita un tenant con paleta/tema/fuente custom para ver el leak y su reset.
   - Recomendación: usar/crear en Supabase local (`.env.development.local`) un negocio con `palette != 'red'` y opcionalmente `theme`/`font` custom. Si no hay, probar en staging.

## Environment Availability

No aplica — cambio de código puro (un layout + un componente), sin herramientas/servicios externos.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest (presente en el repo — MEMORY: ~283 tests). |
| Config file | Existe infra de Vitest (baseline del proyecto). |
| Quick run command | `npm run test` (o el script de vitest del repo). |
| Full suite command | `npm run test` + `tsc --noEmit` (gate de CI del proyecto). |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| ONB-05 | El string JS del `ResetThemeScript` setea `palette='red'`, borra `theme`/`font`, hace `removeProperty('--primary')` y NO menciona `classList`/`.dark`. | unit (opcional, hardening) | `vitest run` sobre un test que importe el componente y asserte el `__html` emitido. | ❌ Wave 0 (opcional) |
| ONB-05 | Reset efectivo del theming en las 4 pantallas de auth por soft-nav, sin flash, sin romper claro/oscuro; dashboard y `/[slug]` sin regresión. | manual-only (UAT) | — (efecto DOM cross-navegación, no unit-testeable de forma fiable) | UAT |

### Sampling Rate
- **Per task commit:** `tsc --noEmit` + vitest quick (si se agrega el unit test).
- **Per wave merge:** suite completa.
- **Phase gate:** UAT PASS + suite verde.

### UAT (criterio de éxito real)
1. Loguearse en un negocio con paleta/tema/fuente custom → dashboard muestra la paleta del negocio (no-regresión D-04).
2. Ir a su `/[slug]` público → sigue con la paleta/tema del negocio (no-regresión D-04).
3. **Cerrar sesión (logout = soft-nav, `sidebar.tsx:91-94`)** → `/login` debe verse en **Forjo base (rojo/naranja)**, sin flash de la paleta del negocio.
4. Ir a `/register`, `/forgot-password`, `/reset-password` → todas en Forjo base.
5. Repetir en **modo oscuro**: el modo elegido debe sobrevivir (D-03) — auth en Forjo base oscuro, no vuelve a claro.

### Wave 0 Gaps
- [ ] (Opcional) `components/reset-theme-script.test.ts` — asserta el `__html` del script (ONB-05).
- Si no se agrega: "None — la verificación es UAT; no hay infra faltante."

## Security Domain

Superficie mínima. El único riesgo teórico de un `<script dangerouslySetInnerHTML>` es la inyección — **aquí NO existe**: el script se construye 100% con literales estáticos (`'red'`), sin ningún input del usuario, de la DB ni de la URL. A diferencia de `PaletteScript` (que usa `JSON.stringify` como defensa porque recibe valores), el reset no interpola nada dinámico.

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V5 Input Validation | no | El script no toma input; cero interpolación dinámica. |
| Multi-tenant isolation | no | No toca datos de negocio; solo atributos de presentación en `<html>`. |

Sin RLS, sin queries, sin secretos, sin migración. No requiere `supabase-multitenant-rls`.

## Sources

### Primary (HIGH confidence)
- `app/layout.tsx` (root: `data-palette="red"` L59, `ThemeProvider attribute="class" defaultTheme="light" enableSystem={false}` L63) — define "Forjo base".
- `components/palette-script.tsx` — molde a invertir (`delete d.theme`/`delete d.font`, `--primary`).
- `app/(auth)/(split)/layout.tsx` — confirma que NO hay theming ahí y el comentario L8-10 sobre por qué el split es anidado.
- `app/(auth)/register/page.tsx` + Glob de `app/(auth)/**` — confirma que NO existe `(auth)/layout.tsx` y que register está fuera del split.
- `app/(dashboard)/layout.tsx:40` y `app/[slug]/layout.tsx:111` — usos de `PaletteScript` a NO regresionar.
- `components/dashboard/sidebar.tsx:91-94` — logout = `signOut()` + `router.push('/login')` + `router.refresh()` (soft-nav).
- `app/(auth)/(split)/login/page.tsx:63-64` — login = `router.push('/dashboard')` + `router.refresh()` (soft-nav; prueba que el inline script aplica en soft-nav).
- `components/theme-provider.tsx` — next-themes wrapper (dueño de `.dark`).

### Secondary (MEDIUM confidence)
- Convención Next.js App Router: layouts anidan por carpeta; route groups `(...)` no aportan URL. [node_modules/next/dist/docs/, y comentario explícito en `(split)/layout.tsx`]

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — no hay stack nuevo; todo verificado en package.json/CLAUDE.md.
- Architecture: HIGH — estructura de archivos confirmada por Glob + lectura; anidamiento es convención estándar de Next 16.
- Pitfalls: HIGH — mecanismo verificado leyendo `PaletteScript` y los flujos de nav; único punto ASSUMED (A1) es LOW-risk con mitigación conocida.

**Research date:** 2026-07-17
**Valid until:** ~30 días (código estable; sin dependencias externas volátiles).
