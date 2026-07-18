# Phase 8: Auth siempre con tema Forjo - Context

**Gathered:** 2026-07-17
**Status:** Ready for planning

<domain>
## Phase Boundary

Que las pantallas de auth (login, register, forgot-password, reset-password) usen **siempre el tema Forjo base**, sin heredar la paleta/tema/fuente del negocio — respetando claro/oscuro según la preferencia del usuario (next-themes). Único requisito: **ONB-05**.

**El bug (mecánica confirmada):** el tema Forjo = el default del root layout (`app/layout.tsx`: `data-palette="red"`, sin `data-theme`/`data-font` — el look base naranja). `PaletteScript` (components/palette-script.tsx) pisa esos atributos en `<html>` con los valores del negocio en el dashboard, el CRM y la página pública. Al cerrar sesión con **navegación client-side** (sin recarga full), los atributos que dejó el dashboard **quedan pegados en `<html>`** y las pantallas de auth los heredan. (En un load full de `/login` sale bien porque el root re-renderiza `data-palette="red"` — el bug es solo en client-nav.)

**Fuera de scope:** cambiar el theming del dashboard o de la página pública `/[slug]` (siguen aplicando su paleta), tocar `PaletteScript` en sus usos actuales, o rediseñar las pantallas de auth.

</domain>

<decisions>
## Implementation Decisions

### ONB-05 — Reset del tema en auth
- **D-01:** El reset se hace en el **layout del route group `(auth)`** (`app/(auth)/layout.tsx` — confirmar en research si ya existe uno o hay que crearlo; las pantallas viven en `(auth)/(split)/*` y `(auth)/register`). Cubre TODOS los caminos de llegada a auth (logout, sesión vencida, entrar directo por URL), tanto SSR como navegación client-side — a diferencia de resetear solo en el flujo de logout, que deja agujeros.
- **D-02:** El reset pone `data-palette="red"` y **borra** `data-theme`/`data-font` de `<html>` (los defaults del tema Forjo base, lo mismo que el root layout). Debe correr **antes de pintar** (script inline, como hace `PaletteScript`) para evitar el flash de la paleta del negocio.
- **D-03:** **Respeta claro/oscuro** — NO toca la clase `.dark` que maneja next-themes ni el `ThemeProvider`. El usuario sigue en su modo elegido; solo se resetea la paleta/tema/fuente del tenant. "En dark o claro, pero siempre el tema Forjo."
- **D-04 (invariante de no-regresión):** el reset está **acotado al layout de (auth)** → el dashboard y `/[slug]` conservan su paleta/tema/fuente intactos. El criterio de éxito incluye verificar que esos dos NO se rompan.

### Claude's Discretion
- La forma exacta del script de reset (un componente tipo "ResetPaletteScript" análogo a `PaletteScript`, o inline en el layout): seguir el patrón de `PaletteScript` para el anti-flash.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### El mecanismo de theming
- `components/palette-script.tsx` — cómo se setea `data-palette`/`data-theme`/`data-font` en `<html>` (el molde a "invertir" para el reset; ver el manejo `delete d.theme`/`delete d.font` que ya usa para los defaults).
- `app/layout.tsx` — el root: `data-palette="red"` default (L59), `ThemeProvider` next-themes (L63, `attribute="class"`, `defaultTheme="light"`, `enableSystem=false`). Define qué es "el tema Forjo base".
- `app/(dashboard)/layout.tsx` (L40) y `app/[slug]/layout.tsx` — dónde `PaletteScript` aplica la paleta del negocio HOY. NO se tocan; son la referencia de qué NO regresionar (D-04).

### Las pantallas que reciben el reset
- `app/(auth)/` — el route group. Las pantallas: `(auth)/(split)/{login,forgot-password,reset-password}/page.tsx` y `(auth)/register/page.tsx`. El research confirma si `(auth)/layout.tsx` existe o hay que crearlo (y cómo compone con el `(split)/layout.tsx` que ya existe de Phase 4).

### Requirements
- `.planning/workstreams/onboarding/REQUIREMENTS.md` — ONB-05.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- **`PaletteScript`:** el patrón anti-flash (script inline en `<html>` antes de pintar) — el reset lo espeja pero seteando los defaults (`data-palette=red`, sin theme/font).
- **El `(split)/layout.tsx` de Phase 4:** ya envuelve login/forgot/reset; el register quedó fuera del split (D-10 de Phase 4). El reset tiene que cubrir los dos → probablemente el layout de `(auth)` (padre de ambos).

### Established Patterns
- **next-themes maneja `.dark` sobre `<html>`**; la paleta es un eje ortogonal (`data-palette`). El reset toca SOLO la paleta/tema/fuente, nunca `.dark`.

### Integration Points
- `app/(auth)/layout.tsx` (nuevo o existente) → script de reset de `data-palette`/`data-theme`/`data-font`.

</code_context>

<specifics>
## Specific Ideas

- El research DEBE confirmar: (a) si existe `app/(auth)/layout.tsx` o hay que crearlo, y cómo compone con `(auth)/(split)/layout.tsx`; (b) que el register (fuera del split) queda cubierto por el mismo reset; (c) que el script inline resetea antes del primer paint (sin flash de la paleta del negocio en client-nav); (d) que next-themes (claro/oscuro) sigue intacto.
- Criterio de no-regresión (D-04): tras el cambio, entrar al dashboard de un negocio con paleta custom y a su `/[slug]` → siguen con su paleta/tema/fuente; solo las pantallas de auth quedan en Forjo base.

</specifics>

<deferred>
## Deferred Ideas

None — fase de un solo requisito, acotada.

</deferred>

---

*Phase: 08-auth-siempre-con-tema-forjo*
*Context gathered: 2026-07-17*
