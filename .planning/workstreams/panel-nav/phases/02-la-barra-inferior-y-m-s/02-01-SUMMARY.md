---
phase: "02-la-barra-inferior-y-m-s"
plan: "01"
subsystem: panel-nav
status: complete
tags: [mobile-nav, bottom-bar, safe-area, viewport, design-tokens, a11y]
workstream: panel-nav

requires:
  - "lib/panel-history.ts — panelNavMode / consumeOwnedPanelEntry (v0.30, CERO diff)"
  - "components/dashboard/unsaved-changes-guard.tsx — useNavigationGuard (CERO diff)"
  - "lib/use-terminology.tsx — useTerminology, provider ya montado (CERO diff)"
provides:
  - "components/dashboard/nav-groups.ts — la fuente ÚNICA del inventario de menú (NAV_GROUPS, buildNavGroups, NavItem), sin directiva de cliente ⇒ importable desde un test de environment:'node'"
  - "components/dashboard/panel-bottom-nav.tsx — PanelBottomNav, la barra fija de 5 destinos"
  - "--panel-nav-h / --panel-nav-muted — los dos tokens de la superficie"
  - "export const viewport en app/(dashboard)/layout.tsx — la capacidad de zona segura, NUEVA en este repo"
affects:
  - "las 13 pantallas del route group (dashboard): reservan alto inferior y reciben viewport-fit=cover"
  - "components/dashboard/sidebar.tsx: lee el inventario del módulo compartido (desktop intacto)"

tech-stack:
  added: []
  patterns:
    - "env(safe-area-inset-*) como valor arbitrario de Tailwind v4 sin tailwind.config, espejando components/landing/whatsapp-float.tsx:36 — SIN espacios en el valor"
    - "export const viewport acotado a un route group (merge por clave de Next) para no mover el área de dibujo de las superficies vecinas"
    - "token de color dedicado a una superficie (--panel-nav-muted) cuando el token general no pasa AA en todos los temas"

key-files:
  created:
    - components/dashboard/nav-groups.ts
    - components/dashboard/panel-bottom-nav.tsx
    - .planning/workstreams/panel-nav/phases/02-la-barra-inferior-y-m-s/deferred-items.md
  modified:
    - app/globals.css
    - app/themes.css
    - app/(dashboard)/layout.tsx
    - components/dashboard/sidebar.tsx

key-decisions:
  - "El inventario del menú pasa a un módulo puro compartido (nav-groups.ts) en vez de quedar privado en el sidebar: el gateo por rubro se preserva por construcción y no por disciplina de copiar bien"
  - "El export viewport vive SÓLO en app/(dashboard)/layout.tsx: declararlo en la raíz movería el área de dibujo del landing y de /[slug], que son superficies de los clientes de los negocios"
  - "El indicador de activo se pinta con --foreground y no con el acento de marca: --primary no llega a 3:1 contra --card en 8 de las 40 combinaciones tema x paleta (mínimo 2.15:1)"
  - "El inactivo usa un token nuevo (--panel-nav-muted) porque --muted-foreground falla AA en los modos claros de spa (3.41:1) y modern (4.15:1)"
  - "El anillo de foco usa ring-foreground con ring-inset y no el ring-ring/50 del repo: --ring ES --primary, así que heredaría el mismo problema de contraste"
  - "La barra entra por lg:hidden y nunca por un prefijo de 768px: la banda 768-1023px no tiene sidebar hoy, tiene hamburguesa, y la hamburguesa se va en 02-03"
  - "La reserva de alto se hace en UN SOLO lugar (el <main> del layout) y de forma aditiva, con lg:pb-0 simétrico al lg:pt-0 que ya estaba"

requirements-completed: [MOB-01, MOB-02, MOB-07]

coverage:
  - deliverable: "components/dashboard/nav-groups.ts es la única declaración del inventario del menú, con firma, .filter de grupos vacíos y los dos ITEMS al mismo href intactos"
    human_judgment: false
    verification:
      - kind: command
        ref: "gate de 9 conteos del Task 1 (exports=3 · use client=0 · firma=1 · filtro>=1 · href '/clients'=2 · declaraciones en el sidebar=0 · import=1 · call site=1 · bloque de desktop=1)"
        status: pass
      - kind: command
        ref: "./node_modules/.bin/tsc --noEmit — 0 líneas 'error TS'"
        status: pass
      - kind: command
        ref: "npx vitest run — rc 0, 105 archivos, 1619 casos"
        status: pass
  - deliverable: "Los dos tokens nuevos declarados en el bloque de :root y los 4 overrides dentro de los bloques de tema que ya existían, sin crear bloques nuevos"
    human_judgment: false
    verification:
      - kind: command
        ref: "gate de CSS: alto=1 · muted default=1 · overrides=4 · hex spa=1 · hex modern=1 · bloques [data-theme= ahora 41 == 41 en HEAD"
        status: pass
  - deliverable: "El export viewport acotado al route group (dashboard): el landing, /[slug], /admin y /login NO reciben la clave"
    human_judgment: false
    verification:
      - kind: command
        ref: "curl | grep -o del <meta name=\"viewport\"> en / · /negocio-prueba · /login (port 80): los tres sirven exactamente width=device-width, initial-scale=1"
        status: pass
      - kind: command
        ref: "git status --porcelain -- app/layout.tsx vacío + hash 962dd6d intacto; grep de 'export const viewport|generateViewport' en todo app/ devuelve 1 archivo y es app/(dashboard)/layout.tsx"
        status: pass
      - kind: command
        ref: "npm run build rc 0 — Next acepta el export en ese segmento"
        status: pass
  - deliverable: "El meta viewport SERVIDO de /dashboard lleva viewport-fit=cover e interactive-widget=resizes-visual (la mitad POSITIVA del criterio 2)"
    human_judgment: true
    rationale: "NO se pudo leer con curl en esta sesión: /dashboard responde 307 a /login sin sesión, y no se pudo reconstruir la cookie de sesión que el dev server espera (su nombre deriva del host de Supabase que trae su archivo de entorno, y el guard de secretos del entorno impide leerlo). Se intentó 4 veces con cookies minteadas por el propio @supabase/ssr (sb-127-auth-token y sb-localhost-auth-token, ambas válidas contra el Supabase local, que es el mismo que usa el dev server — /negocio-prueba devolvió 200 con el título del negocio del seed). Queda para la UAT: la franja de gestos PINTADA es la evidencia observable de que viewport-fit=cover tomó efecto."
  - deliverable: "La reserva de alto es aditiva, está en el <main>, incluye el inset y lleva lg:pb-0; ningún valor arbitrario de Tailwind contiene un espacio"
    human_judgment: false
    verification:
      - kind: command
        ref: "gate del layout: pt-14 / lg:pt-0 / lg:pl-60 / min-h-screen / reserva / inset / lg:pb-0 = 1 cada uno; montaje de la barra >= 2"
        status: pass
      - kind: command
        ref: "gate de espacios: 0 valores arbitrarios con espacio en layout.tsx y panel-bottom-nav.tsx"
        status: pass
  - deliverable: "La barra declara 5 destinos, entra por lg:hidden, lleva landmark con nombre propio y consume el dialecto de historial de v0.30 en el orden de T-5 (guard primero), sin mutaciones crudas"
    human_judgment: false
    verification:
      - kind: command
        ref: "gate de la barra: lg>=1 · prefijo 768px=0 · destinos únicos=5 (los 5 literales presentes) · panelNavMode/consumo/guard/aria-current>=1 · landmark=1 · guard ANTES del consumo=1 · pushState|replaceState|history.back=0"
        status: pass
  - deliverable: "Cero diff en los tres módulos de historial y en los otros cuatro intocables"
    human_judgment: false
    verification:
      - kind: command
        ref: "git log --format=%h -n1: panel-history=351a53b · overlay-history=32cf56c · dirty-history=351a53b · app/layout=962dd6d · drawer=87ac7ba · route-lists=22d83eb · verticals=9c32ef5; git status --porcelain sobre los 6 vacío; git diff 49fa195..HEAD sobre los 3 módulos sin salida"
        status: pass
  - deliverable: "Los 5 labels entran en una línea sin truncar y ningún destino mide menos de 44x44, MEDIDO leyendo el DOM a 375px y a 320px en las 5 familias x 2 pesos"
    human_judgment: false
    verification:
      - kind: command
        ref: "sonda montada en iframe de 375 y 320px, Chrome headless --dump-dom: item 75x56 y 64x56, truncado=false en los 5 ítems a los dos anchos, peor caso del sistema Pacientes/Plus Jakarta/600 = 52.4px contra 67.0px y 56.0px disponibles"
        status: pass
  - deliverable: "En un celular real: la franja de gestos pintada, el teclado, los botones de alta de Finanzas alcanzables, las tres pasadas de contraste, la banda de 900px y el desktop a >=1024px"
    human_judgment: true
    rationale: "Irreducible a comando en este repo: Vitest corre en environment:'node', sin jsdom ni Playwright, y el inset de zona segura vale 0 en Android y en todo emulador headless. NADIE lo miró todavía en un teléfono — la UAT visual está PENDIENTE (ver la sección de UAT de este documento)."

metrics:
  duration: "22 min"
  started: "2026-10-08T23:00:00Z"
  completed: "2026-10-08T23:22:00Z"
  tasks: 2
  files: 6

actuals:
  tokens: 25155
  tasks: 2
  commits: 2
  plan_head_before: "49fa195c5352dfc7acd5ab85713264b76c1fce37"
---

# Phase 2 Plan 01: El prerequisito compartido y el slice Summary

La barra inferior fija de 5 destinos entra en las 13 pantallas del panel por `lg:hidden`, con la zona
segura activada por un `export const viewport` acotado al route group `(dashboard)` —capacidad nueva
en este repo— y el alto reservado en un solo lugar; el inventario del menú salió del sidebar a un
módulo puro compartido para que la barra, Más y el sidebar lean el mismo gateo por rubro.

## Accomplishments

- **`components/dashboard/nav-groups.ts`** — el inventario del menú (`NAV_GROUPS`,
  `buildNavGroups`, `NavItem`) movido del sidebar **sin reescribir una línea de lógica**, como named
  exports, **sin** directiva de cliente (⇒ importable desde un test de `environment: 'node'`, que es
  lo que habilita el candado puro de 02-04), con la firma `(business: Business)` intacta, el
  `.filter(g => g.items.length > 0)` que mata los grupos vacíos, y los **dos** ITEMS que apuntan al
  mismo `href` (`clients` / `patients`) conservados a propósito.
- **`app/globals.css`** — `--panel-nav-h: 3.5rem` (el alto en un solo lugar) y
  `--panel-nav-muted: var(--muted-foreground)` (5.44:1 sobre `--card`, 5.02:1 sobre `--background`).
- **`app/themes.css`** — 4 overrides de `--panel-nav-muted` **dentro** de los bloques de tema que ya
  existían: spa claro `#6b6055` (venía de 3.41:1, falla AA) y modern claro `#5c6578` (venía de
  4.15:1), los dos oscuros vuelven al default porque ahí ya pasa. El conteo de `[data-theme=` no se
  movió (41 → 41): cero bloques nuevos, cascada intacta.
- **`app/(dashboard)/layout.tsx`** — el `export const viewport` con `viewportFit: 'cover'` e
  `interactiveWidget: 'resizes-visual'`; la reserva de alto **aditiva** en el `<main>`
  (`pb-[calc(var(--panel-nav-h)+env(safe-area-inset-bottom,0px))] lg:pb-0`, conservando `pt-14`,
  `lg:pt-0`, `lg:pl-60` y `min-h-screen`); y `<PanelBottomNav />` montada como hermana del sidebar.
- **`components/dashboard/panel-bottom-nav.tsx`** — los 5 destinos **literales en el fuente** (no
  derivados de `buildNavGroups`), labels de las posiciones 2 y 4 desde `useTerminology()`, zona segura
  en los **tres** ejes con fallback `0px`, activo por **cuatro** canales (indicador 4×24 en
  `--foreground`, color, peso 600, `aria-current="page"`), los cinco estados del proyecto, y el
  dialecto de historial de v0.30 replicado **verbatim y en el mismo orden** (guard de cambios sin
  guardar primero, NAV-08 después y sólo si el destino es el activo).
- **`components/dashboard/sidebar.tsx`** — importa el inventario por alias en vez de declararlo;
  import de `lucide-react` recortado a los 5 iconos que le quedan y `resolveVertical` quitado.
  **Desktop byte-idéntico** (`hidden lg:flex lg:flex-col lg:fixed … lg:w-60 … z-20` intacto) y
  `sidebarContent` sin tocar. −67 líneas, +3.

## La medición de la sonda (criterios 1 y 2 de la fase)

Sonda montada en un **iframe del ancho pedido** (Chrome headless ignora `--window-size` con
`--dump-dom`), sirviéndose del dev server para que resuelvan las familias reales de `next/font`:

**Ancho del label a 11px, por familia × peso (px):**

| familia | peso | Inicio | Turnos | Reservas | Agenda | Clientes | Pacientes | Más |
|---|---|---|---|---|---|---|---|---|
| Space Grotesk | 500 | 28.5 | 36.0 | 47.8 | 40.6 | 42.8 | 52.1 | 21.7 |
| Space Grotesk | 600 | 28.6 | 36.0 | 47.8 | 40.5 | 42.8 | 52.1 | 21.8 |
| Plus Jakarta | 500 | 28.3 | 34.7 | 47.4 | 41.3 | 43.5 | 52.0 | 21.4 |
| **Plus Jakarta** | **600** | 28.7 | 35.1 | 47.8 | 41.5 | 43.9 | **52.4** | 21.6 |
| Mulish | 500 | 26.5 | 34.6 | 47.3 | 40.5 | 40.7 | 49.5 | 21.6 |
| Mulish | 600 | 26.9 | 34.9 | 47.5 | 40.8 | 41.0 | 49.9 | 21.7 |
| Chakra Petch | 500 | 26.3 | 34.7 | 47.6 | 38.9 | 40.7 | 49.5 | 21.3 |
| Chakra Petch | 600 | 26.3 | 34.7 | 47.6 | 38.9 | 40.7 | 49.5 | 21.3 |
| Manrope | 500 | 27.5 | 35.8 | 47.4 | 39.4 | 43.0 | 51.1 | 21.3 |
| Manrope | 600 | 28.3 | 36.3 | 48.2 | 40.0 | 43.9 | 52.0 | 21.5 |

**Peor caso del sistema: `Pacientes` en Plus Jakarta peso 600 = 52.4px** — exactamente el número que
el plan declaró, contra **67.0px** disponibles a 375px y **56.0px** a 320px. ✓

**Área táctil y truncado, leído del DOM** (se montó el peor caso a propósito: `Reservas` y
`Pacientes` en las dos posiciones que los pueden recibir):

| viewport | hueco por label | ítems medidos | truncado |
|---|---|---|---|
| 375px | 67.0px | los 5 en **75 × 56** | `false` en los 5 |
| 320px | 56.0px | los 5 en **64 × 56** | `false` en los 5 |

Las dos áreas superan 44×44. ⚠ Matiz honesto: Chakra Petch devolvió **valores idénticos a peso 500 y
600**, lo que sugiere que esa familia resolvió a un solo fichero de peso. No cambia la conclusión —el
peor caso cae en Plus Jakarta, que sí varió por peso— pero si alguien quiere el número exacto de
Chakra a 600, hay que volver a medirlo.

## El gate del meta viewport (criterio 2 de la fase)

**Puerto usado: 80.** Derivado, no cableado: ya había un dev server corriendo a mano en el 80 (PID
2576) y el intento de levantar uno nuevo murió con *"Another next dev server is already running"* —
exactamente la trampa que el plan anticipó. **No** hizo falta sumar ninguna IP de LAN a
`allowedDevOrigins` para esto (eso es sólo para la UAT desde el teléfono, y queda pendiente).

Salida literal:

```
/                <meta name="viewport" content="width=device-width, initial-scale=1"/>
/negocio-prueba  <meta name="viewport" content="width=device-width, initial-scale=1"/>
/admin           (307 → /login, no sirve HTML sin sesión)
/login           <meta name="viewport" content="width=device-width, initial-scale=1"/>
/dashboard       (307 → /login, no sirve HTML sin sesión)
```

**La mitad que importa para la seguridad está probada:** las tres rutas vecinas que sí sirven HTML
—el landing, la página pública de reservas con el negocio del seed, y el login— sirven **ni una clave
más** que el default. Y el radio está acotado estructuralmente: `grep` de
`export const viewport|generateViewport` sobre **todo** `app/` devuelve **un** archivo, y es
`app/(dashboard)/layout.tsx`; `app/layout.tsx` sigue en su hash base `962dd6d` y su único hit de
"viewport" es un comentario sobre los toasts de sonner. `/admin` vive fuera del árbol de
`app/(dashboard)/`, así que estructuralmente no puede recibir la clave.

**La mitad positiva NO está probada por comando** (ver `coverage`): `/dashboard` responde 307 sin
sesión y no se logró reconstruir la cookie que el dev server espera. Se intentó 4 veces minteando la
cookie con el **propio `@supabase/ssr`** del repo (nombres `sb-127-auth-token` y
`sb-localhost-auth-token`, login exitoso contra el Supabase local — que **es** el mismo que usa el dev
server, porque `/negocio-prueba` devolvió 200 con el título del negocio del seed). El nombre que el
servidor espera deriva del host de Supabase que trae su archivo de entorno, y el guard de secretos
impide leerlo. Se cortó ahí por el límite de intentos. **Lo cubre la UAT:** la franja de gestos
pintada es la evidencia observable de que `viewport-fit=cover` tomó efecto.

## Las tres pasadas de contraste y el resto de la UAT visual

**NO se corrieron. UAT visual PENDIENTE — nadie miró esto en un teléfono.** Las tres pasadas
obligatorias (forjo claro · spa claro con paleta `clay` · modern claro con paleta `amber`), el
comportamiento con el teclado en los dos motores, los botones de alta de Finanzas alcanzables, la
franja de gestos pintada, la banda de 900px y el desktop a ≥1024px siguen todos sin verificar por un
humano. El workstream tiene `auto_advance: false` y `human_verify_mode: end-of-phase`, así que esto
cae al final de la fase y **no** se auto-aprueba.

## Tasks Completed

| # | Task | Tipo | Commit | Archivos |
|---|---|---|---|---|
| 1 | Mover el inventario del menú a un módulo compartido | `auto` | `fa4ad16` | `nav-groups.ts` (nuevo), `sidebar.tsx` |
| 2 | El slice de punta a punta: zona segura, reserva de alto y la barra navegando | `tracer` | `1da6c5c` | `globals.css`, `themes.css`, `(dashboard)/layout.tsx`, `panel-bottom-nav.tsx` (nuevo) |

## Pipeline

| Gate | Resultado |
|---|---|
| `./node_modules/.bin/tsc --noEmit` | **rc 0**, cero líneas `error TS` (las dos corridas, Task 1 y Task 2) |
| `npx vitest run` | **rc 0** · `Test Files 105 passed (105)` · `Tests 1619 passed \| 4 expected fail \| 1 skipped (1624)` — exactamente el piso medido, las dos corridas |
| `./node_modules/.bin/eslint` (los 3 archivos que este plan escribe) | **rc 0** |
| `./node_modules/.bin/eslint` (los 4 del gate, incluyendo el layout) | **rc 1** por un error **preexistente** — ver Deviations |
| `npm run build` | **rc 0** |
| Inmutabilidad de los 7 intocables (hash de commit) | los 7 en su hash base |
| Cero dependencias | `git diff -- package.json package-lock.json` vacío |
| Tokens sin fuga | hits sólo en `globals.css` (5), `themes.css` (4), `(dashboard)/layout.tsx` (1), `panel-bottom-nav.tsx` (2). Arrancaba de **0** medido |

## Deviations from Plan

### 1. [Rule 3 excluido por alcance] El gate de eslint del Task 2 no puede dar rc 0: hay un error preexistente en el layout

- **Encontrado durante:** Task 2, gate de eslint.
- **Qué pasó:** el gate listaba cuatro archivos y esperaba `rc 0`. Salió `rc 1`:
  `react-hooks/purity` — *"Cannot call impure function during render: `Date.now`"* — en
  `app/(dashboard)/layout.tsx`, sobre el cálculo de `daysLeft` del banner de plan.
- **Por qué NO se arregló:** es **preexistente y medido**. Se linteó la versión del archivo **en HEAD
  `49fa195`** (copiada a un archivo sonda en el mismo directorio para que aplicara la misma config, y
  borrada enseguida): mismo error, misma regla, misma línea (42 entonces, 62 ahora por las líneas que
  este plan insertó arriba), **rc 1**. Cae de lleno en la regla de alcance: sólo se auto-arregla lo
  causado directamente por los cambios del task. Arreglarlo implica decidir de dónde sale "hoy" en un
  Server Component, que es una decisión de diseño con su propia UAT.
- **Qué se hizo en su lugar:** se corrió eslint acotado a los **tres archivos que este plan escribe**
  (`panel-bottom-nav.tsx`, `nav-groups.ts`, `sidebar.tsx`) → **rc 0**, y se anotó el ítem en
  `deferred-items.md` del directorio de la fase. Los planes 02-02 / 02-03 / 02-04 que vuelvan a listar
  el layout en un gate de eslint se van a topar con lo mismo.
- **Archivos modificados:** ninguno (es un diferido, no un arreglo).

### 2. [Corrección de gate propio, sin cambio de comportamiento] Mis comentarios rompieron tres gates de conteo

- **Encontrado durante:** Task 2, primera corrida de los gates.
- **Qué pasó:** los comentarios densos que el plan exige (PC-9) repetían **literalmente** las cadenas
  que los gates cuentan, y los conteos salieron en 2 en vez de 1: los hex `#6b6055` / `#5c6578` en
  `themes.css`, y `viewportFit: 'cover'` / `interactiveWidget: 'resizes-visual'` en el layout.
- **Fix:** se reescribieron los comentarios para explicar el *por qué* **sin** repetir los literales
  (p. ej. *"el valor de abajo sube el peor caso a 5.02:1"* en vez de citar el hex). Cero cambio de
  código, cero cambio de comportamiento.
- **Verificación:** los tres gates pasaron a 1 y salieron verdes.

### 3. [Autocorregida] Marqué MOB-01/02/07 como completos y los tuve que revertir

- **Encontrado durante:** el cierre del plan, al revisar el diff de `REQUIREMENTS.md`.
- **Qué pasó:** corrí `requirements.mark-complete MOB-01 MOB-02 MOB-07` **sin** pasar antes por el
  gate de IDs compartidos. Los tres los declaran **también** los planes `02-03` (MOB-01, MOB-07) y
  `02-04` (MOB-01, MOB-02, MOB-07), que todavía no tienen SUMMARY ⇒ `requirements.ready-ids` devuelve
  **0 de 3 listos**. Marcarlos acá los habría dejado en `Complete` con dos planes de la fase sin
  ejecutar, justo el falso verde que ese gate existe para evitar.
- **Fix:** `git checkout -- .planning/workstreams/panel-nav/REQUIREMENTS.md`. El archivo volvió a su
  estado en HEAD y **no** se commiteó ningún cambio de requisitos.
- **Verificación:** `git status --porcelain -- .planning/workstreams/panel-nav/REQUIREMENTS.md` vacío.
  Los tres IDs los va a marcar el último plan de la fase que los declare (`02-04`).
- **Nota para el `requirements-completed` del frontmatter:** queda `[MOB-01, MOB-02, MOB-07]` porque
  es la copia verbatim del PLAN.md (es lo que este plan **aporta**), pero `REQUIREMENTS.md` sigue
  diciendo que están abiertos, y eso es lo correcto.

**Total: 3 desviaciones** — 1 diferida por alcance (lint preexistente), 2 autocorregidas (texto de
comentarios, marcado prematuro de requisitos). **Impacto:** ninguno sobre el comportamiento. El único
residuo es el ítem diferido.

## Authentication Gates

Uno, y no bloqueó el plan: leer el `<meta name="viewport">` **servido** de `/dashboard` requiere una
sesión del panel, y el nombre de la cookie que el dev server espera deriva de un valor que vive en su
archivo de entorno (no legible). Se intentó 4 veces minteando la cookie con el propio
`@supabase/ssr`; el login contra el Supabase local funcionó (`test@forjo.local`) pero el dev server
siguió devolviendo 307. Queda cubierto por la UAT, no por un comando. La sonda temporal
(`__probe-mint-session.mjs`) se borró.

## Known Stubs

Uno, **declarado por el plan** y no un descuido:

| Stub | Archivo | Motivo |
|---|---|---|
| El 5º destino de la barra (`/mas`) apunta a una ruta que todavía no existe ⇒ **404** | `components/dashboard/panel-bottom-nav.tsx` | Es el **único estado intermedio declarado** de la fase. La ruta la crea el plan **02-02** (wave 2). Los otros 4 destinos navegan desde este plan |

## Threat Flags

Ninguno. Cero migraciones (la próxima libre sigue siendo la **080**), cero policies, cero queries
nuevas, cero uso de service role, cero superficie anónima nueva, cero paquetes npm. La única amenaza
`high` con gate automatizado de este plan (T-02-01, el export `viewport` desbordando su route group)
quedó mitigada y **medida** por los dos lados: el hash base de `app/layout.tsx` intacto, y el `curl`
de las tres rutas vecinas sirviendo el default sin una clave más.

## Los 9 supuestos marcados del probe de bordes — siguen abiertos

Las 9 filas que el plan declara (`applicable: 9`, `resolved: 0`) siguen siendo **supuestos**, no
criterios cumplidos. Que la cobertura adicional de cada fila esté verde **no** las cierra. El
verificador que necesite decidir sobre uno de esos bordes y no encuentre evidencia **se abstiene**.

## Next

El plan **02-02** (wave 2) es el que cierra el 5º destino: crea `/mas`, consume
`components/dashboard/nav-groups.ts` (que este plan dejó listo) y resta la barra del inventario **por
`href`** y no por key.

⚠ **Antes de seguir:** el gate de retroalimentación del tracer está **abierto**. La UAT visual en un
celular real (franja de gestos, teclado en los dos motores, las tres pasadas de contraste, la banda de
900px, el desktop a ≥1024px) **no la miró nadie todavía**.

## Self-Check: PASSED

- `components/dashboard/nav-groups.ts` — FOUND
- `components/dashboard/panel-bottom-nav.tsx` — FOUND
- `app/globals.css` · `app/themes.css` · `app/(dashboard)/layout.tsx` · `components/dashboard/sidebar.tsx` — FOUND, modificados
- commit `fa4ad16` — FOUND · commit `1da6c5c` — FOUND
- `git rev-list --count 49fa195..HEAD` = **2** (los dos commits de producción; el commit de este
  documento no está contado porque se mide antes de hacerlo)
- Cero diff en `lib/panel-history.ts`, `lib/overlay-history.ts`, `lib/dirty-history.ts` — CONFIRMADO
  por hash de commit y por `git diff 49fa195..HEAD`
- Todos los `<acceptance_criteria>` de los dos tasks re-corridos y verdes, con la única excepción
  documentada del eslint preexistente del layout
