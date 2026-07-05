---
phase: 01-reorg-de-ia-ayuda
plan: 03
subsystem: ui
tags: [next16, help-faq, native-details, zero-install, sidebar, settings-client]

# Dependency graph
requires:
  - phase: 01-reorg-de-ia-ayuda (plan 01)
    provides: sidebar agrupado — el footer donde se cuelga el link Ayuda
  - phase: 01-reorg-de-ia-ayuda (plan 02)
    provides: settings-client con view config reducida (Apariencia · Seguridad · Suscripción) donde va el 2º acceso
provides:
  - "/ayuda = server component con FAQ estática (7 preguntas) en disclosures nativos <details>/<summary>, zero-install"
  - "sidebar footer: link Ayuda (HelpCircle) → /ayuda que cierra el drawer en mobile"
  - "Configuración (view config): link '¿Necesitás ayuda? Ver la guía' → /ayuda"
affects: [fases del milestone que sumen contenido de ayuda o toquen el footer del sidebar]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Disclosure nativo <details>/<summary> estilado con Tailwind (group-open:rotate-180, [&::-webkit-details-marker]:hidden) como alternativa zero-install al shadcn Accordion"
    - "Contenido de ayuda como array TS local versionado en git (const FAQ: { pregunta, respuesta }[]) — sin Supabase, sin MDX, sin fetch"

key-files:
  created:
    - "app/(dashboard)/ayuda/page.tsx"
  modified:
    - "components/dashboard/sidebar.tsx"
    - "app/(dashboard)/settings/settings-client.tsx"

key-decisions:
  - "Disclosure nativo <details>/<summary> en vez de shadcn Accordion → cero dependencias nuevas (HARD GATE del plan: git diff --stat package.json vacío)"
  - "FAQ como array TS a nivel de módulo (D-08): editar la ayuda = editar el array y commitear; sin tabla en Supabase"
  - "El link de Configuración se gatea con !isSection para mostrarse solo en la view config del mega-componente SettingsClient, no en los hubs Negocio/Servicios/etc."
  - "page.tsx es sync (no async): la ayuda no hace fetch de negocio, queda protegida solo por el layout del route group (dashboard)"

patterns-established:
  - "Ayuda estática zero-install: server component + array TS local + <details>/<summary> nativo (patrón reutilizable para cualquier contenido estático versionado)"

requirements-completed: [HELP-01]

# Metrics
duration: 8min
completed: 2026-07-05
status: complete
---

# Phase 1 Plan 03: FAQ / Ayuda estática (HELP-01) Summary

Ruta `/ayuda` como server component que renderiza una FAQ estática de 7 preguntas en disclosures nativos `<details>`/`<summary>` (zero-install, cero dependencias nuevas), con dos accesos: el footer del sidebar (link Ayuda + icono HelpCircle) y un link discreto desde Configuración.

## Qué se construyó

- **`app/(dashboard)/ayuda/page.tsx` (nuevo):** server component sync. Array TS local `const FAQ: { pregunta: string; respuesta: string }[]` con 7 entradas versionadas en git (D-08). Header `PageEyebrow label="Ayuda"` + `h1` "Ayuda" con `font-[family-name:var(--font-heading)]` + subtítulo "Cómo usar Forjo Gestión", contenedor raíz `max-w-3xl` (modelado sobre settings-client L808). Lista en contenedor `rounded-lg border border-border divide-y divide-border`; cada item es un `<details className="group">` con `<summary>` (flex, `list-none`, `[&::-webkit-details-marker]:hidden`, `focus-visible:ring-[3px]`, `hover:bg-secondary/50`) + `<ChevronDown group-open:rotate-180 text-muted-foreground>` y `<p>` de respuesta. Múltiples disclosures pueden estar abiertos a la vez (independientes, sin `name` compartido).
- **`components/dashboard/sidebar.tsx` (edit):** import de `HelpCircle` + `<Link href="/ayuda">` en el footer (encima de "Cerrar sesión"), con el mismo styling de fila de nav (`flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium ... hover:bg-secondary`) + `focus-visible:ring-[3px]` y `onClick={() => setMobileOpen(false)}` para cerrar el drawer en mobile.
- **`app/(dashboard)/settings/settings-client.tsx` (edit):** import de `Link` de `next/link` + link "¿Necesitás ayuda? Ver la guía" → `/ayuda` después de `</Tabs>`, gateado con `!isSection` para que aparezca solo en la view `config`. Navegación interna (sin `target="_blank"`).

Las 7 preguntas del draft (D-09, Claude redacta / el usuario revisa): crear un turno, cargar servicios/prestaciones, agregar equipo/profesionales, configurar consultorios/locales, cobrar seña / conectar MercadoPago (menciona Negocio → Integraciones, coherente con D-06), compartir la página pública de reservas, y qué es el rubro/vertical.

## Contenido de las 7 respuestas

Cada respuesta son 2-4 oraciones cortas orientadas a la acción (verbo + próximo paso) apuntando a la sección relevante del panel. **El usuario debe revisar/ajustar el texto** (D-09: contenido no crítico, estructura sí). Editar = editar el array `FAQ` en `ayuda/page.tsx` y commitear.

## Verificación

- `npx tsc --noEmit`: verde en los 3 archivos (`ayuda/page.tsx`, `sidebar.tsx`, `settings-client.tsx`).
- `npx eslint components/dashboard/sidebar.tsx` y `app/(dashboard)/ayuda/page.tsx`: **PASS** (0 errores).
- `git diff --stat package.json`: **vacío** — HARD GATE zero-install cumplido, ninguna dependencia nueva (no shadcn Accordion, no `@radix-ui/react-accordion`).
- `grep -c 'href="/ayuda"' sidebar.tsx` = 1; `/ayuda` presente en settings-client.tsx.
- `git diff sidebar.tsx`: el único `href` agregado es `/ayuda`; ningún otro destino del sidebar cambió (behavior-frozen).

## Deviations from Plan

Ninguna desviación funcional — el plan se ejecutó tal cual.

### Deferred Issues (out of scope)

**[SCOPE BOUNDARY] Errores eslint pre-existentes en `settings-client.tsx`**
- **Found during:** Task 2
- **Issue:** `npx eslint app/(dashboard)/settings/settings-client.tsx` reporta 10 errores del React Compiler (`react-hooks/set-state-in-effect`, `react-hooks/immutability`, `react-hooks/purity`) en las líneas 165, 179, 187, 188, 196, 205, 329, 444.
- **Por qué es out-of-scope:** los 10 errores existen en la versión de HEAD del archivo **antes** de las ediciones de este plan (verificado: copia de HEAD linteada = 10 errores, mismo conteo). Ninguno cae en las 2 líneas agregadas acá (el import de `Link` arriba y el link Ayuda cerca de L1730). No causados por este plan.
- **Acción:** no se tocan (SCOPE BOUNDARY — solo se auto-arreglan issues causados por el task actual). Registrados en `deferred-items.md`.

## Threat Flags

Ninguno. La página es contenido 100% estático (array TS en el repo), sin fetch, sin input del usuario, sin datos de tenant, sin dependencia nueva. Coherente con el threat register del plan (T-03-01/02 accept, T-03-SC mitigate cumplido).

## Self-Check: PASSED
- FOUND: app/(dashboard)/ayuda/page.tsx
- FOUND commit 29b647f (Task 1)
- FOUND commit 3d0a7e4 (Task 2)
