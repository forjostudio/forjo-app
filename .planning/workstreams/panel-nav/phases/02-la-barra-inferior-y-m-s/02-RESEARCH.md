---
phase: "2"
slug: "la-barra-inferior-y-m-s"
workstream: "panel-nav"
milestone: "v0.31 — La navegación mobile del panel"
researched: "2026-10-08"
domain: "Navegación mobile en Next.js 16 App Router — viewport/safe-area, ruta nueva en route group, reuso del menú por vertical"
confidence: HIGH
requirements: ["MOB-01", "MOB-02", "MOB-03", "MOB-07", "MOB-05 (sólo la superficie)"]
---

# Phase 2: La barra inferior y Más — Research

**Researched:** 2026-10-08
**Domain:** Navegación mobile del panel sobre Next.js 16.2.7 (App Router) + Tailwind v4 CSS-first
**Confidence:** HIGH (todo lo de framework y repo está leído contra lo instalado; lo de plataforma-navegador es MEDIUM y está marcado)
**HEAD en el que se midió todo:** `e7f7d7c`

> **Qué es este documento.** El **UI-SPEC es el contrato de diseño y está aprobado** (`16a5b1c`): este
> research **no redibuja nada** y no reabre O-1/O-2/O-3. Lo que hace es cerrar las **siete incógnitas
> técnicas** que el UI-SPEC no podía cerrar porque no verificó semántica de framework, y **corregir
> ocho datos** que están mal en el upstream (ROADMAP / REQUIREMENTS / UI-SPEC) — tres de ellos con
> consecuencia real para el plan. No hay CONTEXT.md para esta fase: el dueño salteó discuss-phase a
> propósito porque el UI-SPEC ya cierra las decisiones.

## Summary

**La buena noticia es grande: la afirmación de mayor riesgo de toda la fase es verdadera, y está
probada con código, no con documentación.** El merge de `viewport` en Next 16.2.7 es **por clave,
partiendo del default**, y se acumula recorriendo **el árbol de ESA ruta**: `accumulateViewport` arranca
en `createDefaultViewport()` y mergea un item por segmento (`resolve-metadata.js:834-863`), y
`mergeViewport` hace `structuredClone` del padre y sólo sobrescribe las claves presentes
(`:315-347`, con `viewportFit` e `interactiveWidget` en la rama *"always override the target with the
source"*). El árbol de `/[slug]` no contiene `(dashboard)/layout` ⇒ **su `<head>` no se entera**, y el
del dashboard sale con las dos claves **sumadas** al default, sin perder `width=device-width`. El
criterio 2 del ROADMAP se sostiene. Lo que sí hay que **afinar** es su método: "diff byte a byte del
`<head>`" es frágil (el head de `/[slug]` lo produce un `generateMetadata` que lee la base), y el
invariante decidible es **la línea del meta viewport**.

**La segunda noticia también es buena, y es más fuerte que el argumento del UI-SPEC.** `resizes-visual`
no es sólo "el default de Chrome" [CITED: MDN]: es **lo que los cuatro quicks de octubre midieron**. El
quick `261005-x91` apagó el manejo de teclado de vaul y dejó medido, en 412×823, que con el teclado
arriba los campos del fondo de los drawers quedan **estructuralmente** debajo del teclado. Esas
mediciones se tomaron bajo el comportamiento por defecto, que **es** `resizes-visual`. Declarar
`resizes-content` cambiaría el layout viewport e **invalidaría las cuatro mediciones de una**. El
riesgo residual del teclado no es esta perilla: es que **iOS Safari desplaza el layout viewport** para
mantener el campo enfocado a la vista, cosa que `interactiveWidget` no gobierna y que sólo se ve en un
iPhone real.

**Y hay tres hallazgos que cambian el plan.** (1) **T-2 es falso**: el repo **sí** usa
`env(safe-area-inset-*)` en tres lugares, y uno de ellos —`whatsapp-float.tsx:36`— es **la sintaxis
Tailwind v4 exacta que ya compila acá**, así que no hay que inventarla. (2) `buildNavGroups` **no está
exportada** y vive en un archivo `'use client'`: la regla no-negociable "Más no reimplementa el filtro"
exige un movimiento mecánico que el UI-SPEC no menciona. (3) `panelNavMode` tiene una rama
`to === root ⇒ push` que nadie enumeró: `Inicio → Más → (toco Inicio) → atrás` cae en **Más**, no
afuera del panel — comportamiento correcto de un nivel, pero hay que **declararlo** o la UAT lo
reporta como bug.

**Primary recommendation:** ejecutar el UI-SPEC tal cual, con **cuatro ajustes mecánicos** y **cero
cambios de diseño**: (a) extraer `NAV_GROUPS` + `buildNavGroups` a un módulo compartido antes de
escribir Más; (b) afinar el criterio 2 a "la línea del meta viewport", no al head entero; (c) escribir
los `env()` sin espacios, espejando `whatsapp-float.tsx:36`; (d) declarar por escrito las cuatro ramas
de `panelNavMode` con `/mas` en el medio, la cuarta incluida.

<phase_requirements>
## Phase Requirements

| ID | Descripción | Soporte de este research |
|----|-------------|--------------------------|
| **MOB-01** | Barra inferior fija `Inicio · Turnos · Agenda · Clientes · Más`, visible en todas las pantallas, con el destino actual señalado | §6 del UI-SPEC está medido. Acá: los labels por vertical salen **computados** de `verticals.ts:58,80,101,122` × `sidebar.tsx:43-49` (tabla en §6 de este doc); el consumo de historial se cita verbatim (§5); `MoreHorizontal` confirmado presente en `lucide-react@1.17.0`; el breakpoint `lg` confirmado (`sidebar.tsx:253` header `lg:hidden`, `:279` sidebar `hidden lg:flex`) |
| **MOB-02** | Zona segura + 44×44 + no tapar contenido | §1 de este doc cierra el `viewport` export con evidencia de código; §3 da la sintaxis `env()` con precedente **en este repo** (T-2 corregido); la reserva de alto va en `(dashboard)/layout.tsx:57` (confirmado, **no** la :56) |
| **MOB-03** | Más = menú resuelto por vertical menos la barra, agrupado como hoy, sin perder destinos | §6 de este doc: inventarios **computados** de los 4 verticales (8/8/8/7 ✓), las 5 keys a restar (no 4), `buildNavGroups` no exportada (bloqueante mecánico), y las 3 filas del footer localizadas en **dos** lugares del sidebar, no uno |
| **MOB-07** | Desktop idéntico | El desktop es `hidden lg:flex` (`sidebar.tsx:279`) y nada de esta fase lo toca; el `viewport` nuevo es inerte en desktop; `--panel-nav-muted` y `--panel-nav-h` tienen **0 hits** hoy (medido) ⇒ aditivos por construcción |
| **MOB-05** (superficie) | Aviso efímero de salida | §13 del UI-SPEC. Acá se confirma el motivo que lo saca de sonner: el `<Toaster position="top-center">` es uno solo y global (`app/layout.tsx:81`) y el quick `261005-vuy` **ya descartó** montar un segundo. La implementación es Phase 3 |
</phase_requirements>

## Project Constraints (from CLAUDE.md / AGENTS.md)

Directivas accionables extraídas. Tienen la **misma autoridad** que el UI-SPEC: ningún plan puede
contradecirlas.

| # | Directiva | Fuente | Qué implica acá |
|---|---|---|---|
| PC-1 | **"This is NOT the Next.js you know."** Leer el guide de `node_modules/next/dist/docs/` antes de escribir código | `AGENTS.md` | Cumplido: §1 y §2 de este doc citan `generate-viewport.md`, `generate-metadata.md`, `route-groups.md` y los **tipos y el runtime instalados**, no memoria |
| PC-2 | Middleware = `proxy.ts`, no `middleware.ts` | `.claude/CLAUDE.md` | §4: `/mas` no entra a las listas de `proxy.ts`. **No tocar `lib/auth/route-lists.ts`** |
| PC-3 | Aislamiento por tenant no negociable: toda query filtra por `business_id` / se resuelve por `owner_id` | `.claude/CLAUDE.md` + skill `supabase-multitenant-rls` | `/mas/page.tsx` resuelve `business` por `owner_id` y **no lee ninguna otra tabla**. Cero policies, cero migraciones |
| PC-4 | **Migraciones: cero.** Próxima libre **080** | ROADMAP M-10 (corrige REQUIREMENTS) | Verificado: última aplicada `079_service_categories_name_normalized.sql` |
| PC-5 | Vercel Hobby: un cron diario como máximo | `.claude/CLAUDE.md` | No aplica (cero crons) |
| PC-6 | Usar `Edit` (reemplazo parcial), **nunca `Write`** sobre archivos existentes salvo cambio >80% | `~/.claude/CLAUDE.md` §3 | `sidebar.tsx` (284 líneas) se **edita**; los componentes nuevos se escriben |
| PC-7 | Tailwind v4 CSS-first: **no existe `tailwind.config`** (`components.json:7` → `"config": ""`) | `.claude/CLAUDE.md` | Todo token nuevo es custom property en `app/globals.css` / `app/themes.css` |
| PC-8 | `@/*` siempre; nunca rutas relativas profundas | `.claude/CLAUDE.md` | `@/components/dashboard/...`, `@/lib/panel-history` |
| PC-9 | Comentarios **densos en español** explicando el *por qué* de lo no obvio; secciones con barras Unicode (`// ── X ───`) | `.claude/CLAUDE.md` | Los dos componentes nuevos deben llevar cabecera con el por qué (molde: `lib/panel-history.ts:1-40`, `sidebar.tsx:37-42`) |
| PC-10 | HTML semántico: `nav`, `main`, `button` (no `div` clickeable); un `h1` único por página; jerarquía de headings correcta | `~/.claude/CLAUDE.md` | §11/§12 del UI-SPEC lo resuelven; **medido**: las 10 pantallas del panel tienen exactamente 1 `<h1>` |
| PC-11 | Touch targets ≥44×44; nunca hover como único feedback; focus visible obligatorio | `~/.claude/CLAUDE.md` | §6/§8 del UI-SPEC, medido |
| PC-12 | Tests: **no hay framework de UI**. `environment: 'node'`, sin jsdom, **sin paquetes nuevos** | `.claude/CLAUDE.md` + `vitest.config.mts:48` | §7: nada DOM es testeable; los candados son **grep estático** y **gate de git** |
| PC-13 | Windows + PowerShell como shell primario | `.claude/CLAUDE.md` | Los comandos de verificación van en la forma ya probada en este workstream (§7) |
| PC-14 | GSD: nada de ediciones directas fuera de un workflow | `.claude/CLAUDE.md` | Informativo |
| PC-15 | Respuestas y artefactos **en español** | memoria del proyecto | Este documento |

**Skills del proyecto cargadas:** `convenciones-forjo` (stack, arquitectura multi-tenant, naming,
patrón `page.tsx` + `*-client.tsx`) y `supabase-multitenant-rls` — de esta última aplica **sólo su
invariante de lectura**: esta fase no toca tablas, policies ni queries nuevas.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Declarar `viewport-fit=cover` / `interactive-widget` | **Frontend Server (RSC)** — `app/(dashboard)/layout.tsx` | — | El export `viewport` **sólo** corre en Server Components (`generate-viewport.md:17`). Declararlo en el route group es lo que acota el radio (§1) |
| Reservar el alto de la barra | **Frontend Server (RSC)** — el `<main>` del layout | — | Un solo lugar, `(dashboard)/layout.tsx:57`, junto al `pt-14` que ya reserva el header. Las 13 pantallas no se tocan |
| Pintar la barra y resolver el destino activo | **Browser / Client** | — | Necesita `usePathname()`. Es un componente `'use client'` |
| Decidir push-vs-replace | **Browser / Client**, vía función **pura** en `lib/panel-history.ts` | — | Ya existe (`panelNavMode`). El componente **declara**, no decide (NAV-05) |
| Consumir la entrada propia (NAV-08) | **Browser / Client**, vía `consumeOwnedPanelEntry()` | — | Toca `window.history`; sólo puede vivir en el cliente |
| Guarda de cambios sin guardar | **Browser / Client**, vía `useNavigationGuard()` | — | Context montado en el layout (`(dashboard)/layout.tsx:54`) |
| Resolver el inventario del menú por rubro | **Shared (puro, framework-agnostic)** — `lib/verticals.ts` + `buildNavGroups` | Client (render) | `verticals.ts` es explícitamente framework-agnostic (`:1-3`). El gateo se preserva **por construcción** reusando `buildNavGroups` (§6) |
| Resolver `business` (logo, nombre, plan, slug) para Más | **Frontend Server (RSC)** — `/mas/page.tsx` | — | Patrón del repo: cada `page.tsx` resuelve por `owner_id`. El layout **no** pasa `business` a `children` |
| Terminología por rubro en el cliente | **Browser / Client** vía `useTerminology()` | — | El `VerticalProvider` ya envuelve (`(dashboard)/layout.tsx:48`) ⇒ no re-resolver el vertical en el cliente |
| Tokens de color y alto | **CDN / Static (CSS)** — `app/globals.css` + `app/themes.css` | — | Sin `tailwind.config`; custom properties, aditivas |
| Auth de `/mas` | **API/Backend boundary** — `(dashboard)/layout.tsx:22-24` | Edge (`proxy.ts`) **NO** | El guard real es el layout. `/mas` no pasa por `updateSession`, igual que sus 8 hermanas (§4) |

**Lo que esta tabla previene:** poner el `viewport` en el root layout (cambiaría landing, `/[slug]` y
CRM), poner la reserva de alto en cada pantalla (13 lugares en vez de 1), y reimplementar el filtro por
vertical en el cliente de Más (rompería el gateo de `canchas`).

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `next` | **16.2.7** (exacta, sin rango) | `export const viewport: Viewport`, `<Link>` con `replace`/`onNavigate`, route groups, RSC | Ya instalada. El tipo `Viewport` se importa de `'next'` [VERIFIED: `node_modules/next/package.json` → `16.2.7`; `generate-viewport.md:26` `import type { Viewport } from 'next'`] |
| `react` / `react-dom` | **19.2.4** | Server + Client Components | Ya instaladas [VERIFIED: package.json] |
| `lucide-react` | **^1.17.0** (resuelta 1.17.0) | Los 16 iconos de la barra y de Más | `components.json:13` la declara como `iconLibrary`. **Cero iconos nuevos de otro sistema** [VERIFIED: `require('lucide-react/package.json').version` → `1.17.0`] |
| `tailwindcss` + `@tailwindcss/postcss` | **^4** | Clases y arbitrary values con `env()` / `var()` | CSS-first, sin config (`components.json:7` → `""`) [VERIFIED: package.json] |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `sonner` | ^2.0.7 | **Sólo** el `toast.error` del logout fallido (§14 del UI-SPEC) | Ya montado, `<Toaster>` único y global en `app/layout.tsx:81`. **NO** para el aviso de MOB-05 |
| `@/components/ui/button` | — | Slot de acciones del header (declarado, vacío en esta fase) | `Button variant="ghost" size="icon"` |
| `vaul` | ^1.1.2 | — | **NO TOCAR.** `components/ui/drawer.tsx` carga el arreglo de teclado de dos quicks (§2) |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `export const viewport` en `(dashboard)/layout.tsx` | `<meta name="viewport">` crudo en el layout | Next **ya emite** un meta viewport desde el default (`default-metadata.js:23-32`) ⇒ habría **dos** metas y el navegador tomaría uno. Descartado: hay camino tipado (§1) |
| `export const viewport` en el route group | `generateViewport()` | Innecesario: el valor no depende del request. Los docs lo dicen explícito (`generate-viewport.md:66`: *"If the viewport doesn't depend on request information, it should be defined using the static viewport object"*). Y **no se pueden exportar los dos en el mismo segmento** (`:18`) |
| `interactiveWidget: 'resizes-visual'` | `'resizes-content'` | Reflowearía el panel entero con el teclado e **invalidaría las mediciones de los 4 quicks** (§2). Descartado con número, no con opinión |
| `interactiveWidget: 'resizes-visual'` | `'overlays-content'` | Dejaría el `fixed bottom-0` **flotando sobre el teclado** — exactamente el bug que §9 del UI-SPEC evita. Y en iOS es inerte igual (§2) |
| Reusar `buildNavGroups` | Reimplementar el filtro contra `resolveVertical(business).menu` en Más | **Prohibido por el ROADMAP** (Security/Integrity): un negocio de `canchas` vería "Equipo". §6 da la extracción mecánica |
| Exportar `buildNavGroups` desde `sidebar.tsx` | Extraerla a `components/dashboard/nav-groups.ts` | **Recomendado el segundo** (§6): acopla menos y hace auditable con un grep que las dos superficies leen la misma fuente |

**Installation:**

```bash
# Ninguna. Cero paquetes npm nuevos, cero bloques de registry, cero iconos externos.
```

## Package Legitimacy Audit

**No aplica a esta fase: instala CERO paquetes externos.**

| Package | Registry | Verdict | Disposition |
|---------|----------|---------|-------------|
| — | — | — | La fase no agrega dependencias |

**Verificado contra lo instalado** (no se consultó ningún registry porque no hay nada nuevo que
consultar): `next@16.2.7`, `react@19.2.4`, `lucide-react@1.17.0`, `@tailwindcss/postcss@^4`,
`sonner@^2.0.7`, `vaul@^1.1.2`, `vitest@^4.1.9`, `typescript@^5`, `eslint@^9`.
`components.json:24` → `"registries": {}` ⇒ **cero registries de terceros** [VERIFIED: components.json:24].

**Packages removed due to [SLOP] verdict:** none
**Packages flagged as suspicious [SUS]:** none

---

# Las siete incógnitas, cerradas

## §1 — El scoping del export `viewport` (H-1 / H-2 / T-9): **CONFIRMADO, con el runtime instalado**

Es la afirmación de mayor riesgo de la fase y el criterio 2 depende entera de ella. No se verificó con
la documentación (que es ambigua en esto): se verificó **leyendo el código que corre**.

### La cadena de evidencia, en orden causal

**(a) El default existe y trae dos claves.**

```js
// node_modules/next/dist/lib/metadata/default-metadata.js:23-32
function createDefaultViewport() {
    return {
        // name=viewport
        width: 'device-width',
        initialScale: 1,
        // visual metadata
        themeColor: null,
        colorScheme: null
    };
}
```

[VERIFIED: node_modules/next/dist/lib/metadata/default-metadata.js:23-32]

**(b) La acumulación arranca en ese default y recorre los segmentos de ESA ruta.**

```js
// node_modules/next/dist/lib/metadata/resolve-metadata.js:834-863
async function accumulateViewport(viewportItems) {
    let resolvedViewport = (0, _defaultmetadata.createDefaultViewport)();
    const resolversAndResults = prerenderViewport(viewportItems);
    let i = 0;
    while(i < resolversAndResults.length){
        ...
        resolvedViewport = mergeViewport({ resolvedViewport, viewport });
    }
    return resolvedViewport;
}
```

[VERIFIED: node_modules/next/dist/lib/metadata/resolve-metadata.js:834-863]

**(c) El merge es POR CLAVE, no reemplazo del objeto.** Esta es la línea que decide todo:

```js
// node_modules/next/dist/lib/metadata/resolve-metadata.js:315-347
function mergeViewport({ resolvedViewport, viewport }) {
    const newResolvedViewport = structuredClone(resolvedViewport);
    if (viewport) {
        for(const key_ in viewport){
            const key = key_;
            switch(key){
                ...
                case 'viewportFit':
                case 'interactiveWidget':
                    // always override the target with the source
                    newResolvedViewport[key] = viewport[key];
                    break;
                ...
```

[VERIFIED: node_modules/next/dist/lib/metadata/resolve-metadata.js:315-347, con `viewportFit` en :335 e `interactiveWidget` en :336]

⇒ **Las claves ausentes del export del segmento NO se tocan.** Exportar
`{ viewportFit: 'cover', interactiveWidget: 'resizes-visual' }` **suma** al default; **no borra**
`width: 'device-width'` ni `initialScale: 1`. Esto responde literalmente la pregunta "¿mergea,
reemplaza, o aplica sólo al subárbol?": **mergea por clave, y aplica sólo al subárbol** (por (d)).

**(d) Los items se recolectan segmento por segmento, del árbol de la ruta pedida.**

```js
// node_modules/next/dist/lib/metadata/resolve-metadata.js:448-474 (collectViewport)
const viewportExport = mod ? getDefinedViewport(mod, props, { route }) : null;
viewportItems.push(viewportExport);
```

Y `getDefinedViewport` (`:348-362`) devuelve `mod.generateViewport` envuelto, o `mod.viewport || null`.
⇒ Un segmento sin export aporta `null`, y `mergeViewport` con `viewport == null` devuelve el clone
intacto. **El árbol de `/[slug]` no contiene `app/(dashboard)/layout`**, así que su lista de items
nunca ve el export del dashboard.
[VERIFIED: node_modules/next/dist/lib/metadata/resolve-metadata.js:448-474 y :348-362]

**(e) El route group es un segmento de layout normal para esto.** Los docs lo dicen en el plano
conceptual —*"Opting specific route segments into sharing a layout, **while keeping others out**"*
[CITED: node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/route-groups.md:26]— y
la ordenación de metadata/viewport es la del árbol de layouts:
*"Metadata is evaluated in order, starting from the root segment down to the segment closest to the
final `page.js` segment"* y *"Metadata objects exported from multiple segments in the same route are
**shallowly** merged together"*
[CITED: node_modules/next/dist/docs/01-app/03-api-reference/04-functions/generate-metadata.md:1316-1328].
⇒ H-2 confirmado; el paréntesis del nombre no cambia nada del árbol de layouts, sólo la URL.

**(f) El `<head>` se arma con un orden de claves fijo.**

```js
// node_modules/next/dist/lib/metadata/metadata.js:211-248 (createViewportElements)
tags.push(<meta charSet="utf-8" />)
// luego, en este orden: width, height, initial-scale, minimum-scale,
// maximum-scale, user-scalable, viewport-fit, interactive-widget
if (viewportParts.length) tags.push(<meta name="viewport" content={viewportParts.join(', ')} />)
```

[VERIFIED: node_modules/next/dist/lib/metadata/metadata.js:211-248, `viewport-fit` en :237-239, `interactive-widget` en :240-242]

### El estado del repo, medido

| Hecho | Evidencia |
|---|---|
| `app/layout.tsx` **no** exporta `viewport` ni `generateViewport` — sólo `metadata` | [VERIFIED: app/layout.tsx:44 `export const metadata: Metadata = {...}`, único export además del default] |
| **Cero** `viewport` / `generateViewport` / `viewportFit` / `interactiveWidget` en todo `app/`, `components/`, `lib/` | [VERIFIED: `grep -rn "export const viewport\|generateViewport\|viewportFit\|interactiveWidget" app components lib` → sin salida] |
| `DashboardLayout` es `async function` ⇒ Server Component ✓ (requisito de `generate-viewport.md:17`) | [VERIFIED: app/(dashboard)/layout.tsx:20] |
| Ese mismo segmento **ya exporta `metadata`** (`robots: NOINDEX`) y eso **no estorba**: la restricción de los docs es sólo `viewport` **+** `generateViewport` en el mismo segmento | [VERIFIED: app/(dashboard)/layout.tsx:18] · [CITED: generate-viewport.md:18] |
| `app/[slug]/layout.tsx` usa `generateMetadata` y **no** exporta viewport | [VERIFIED: app/[slug]/layout.tsx:29] |

### La predicción exacta, para que el criterio 2 sea decidible

| Ruta | `<meta name="viewport" content="…">` esperado |
|---|---|
| `/dashboard`, `/mas` y las 13 del route group `(dashboard)` | `width=device-width, initial-scale=1, viewport-fit=cover, interactive-widget=resizes-visual` |
| `/[slug]` (booking público) | `width=device-width, initial-scale=1` — **sin cambio** |
| `/` (landing) | `width=device-width, initial-scale=1` — **sin cambio** |
| `/admin/*` (CRM) | `width=device-width, initial-scale=1` — **sin cambio** |
| `/login`, `/register`, `/onboarding`, `/suspendido` | `width=device-width, initial-scale=1` — **sin cambio** |

### ⚠ Corrección de método al criterio 2 (no al criterio)

El ROADMAP pide *"byte por byte iguales en su `<head>`"*. **El criterio es correcto; el método es
demasiado ancho y va a dar falsos rojos**, y conviene saberlo antes de escribir el verify:

1. El `<head>` de `/[slug]` lo produce un `generateMetadata` que **lee la base**
   (`app/[slug]/layout.tsx:29`) ⇒ título, favicon y OG cambian con los datos del negocio, no con esta
   fase.
2. En `npm run dev` el `<head>` lleva tags de build (preloads, chunks con hash) que cambian entre
   corridas por razones ajenas.

⇒ **El invariante decidible es la línea del meta viewport**, que es *exactamente* lo que esta fase
puede mover y lo único que puede mover. Forma recomendada, con el molde del quick `261006-mx6`
(`curl` contra el dev server + `grep -o` sobre el markup servido):

```bash
# ANTES y DESPUÉS, con el dev server corriendo (ver §7: derivar el puerto, no cablearlo)
for R in / <slug-de-prueba> admin login; do
  printf "%-12s " "/$R"
  curl -s "http://localhost:$PORT/$R" | grep -o '<meta name="viewport"[^>]*>'
done
# Esperado en las cuatro, antes Y después:
#   <meta name="viewport" content="width=device-width, initial-scale=1"/>

curl -s "http://localhost:$PORT/dashboard" | grep -o '<meta name="viewport"[^>]*>'
# Esperado DESPUÉS:
#   <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover, interactive-widget=resizes-visual"/>
```

Si se quiere además el diff del head completo, filtrar el ruido de dev antes de comparar — pero el
gate que el plan debe **afirmar** es el de arriba.

---

## §2 — `interactiveWidget` y el teclado (H-3): la decisión es correcta, y el argumento real es otro

### El tipo, con la línea exacta

```ts
// node_modules/next/dist/lib/metadata/types/extra-types.d.ts:45-54
export type ViewportLayout = {
    width?: string | number | undefined;
    height?: string | number | undefined;
    initialScale?: number | undefined;
    minimumScale?: number | undefined;
    maximumScale?: number | undefined;
    userScalable?: boolean | undefined;
    viewportFit?: 'auto' | 'cover' | 'contain' | undefined;          // :52
    interactiveWidget?: 'resizes-visual' | 'resizes-content' | 'overlays-content' | undefined;  // :53
};
```

[VERIFIED: node_modules/next/dist/lib/metadata/types/extra-types.d.ts:45-54]

⚠ **Deriva de líneas en el upstream, sin consecuencia:** el ROADMAP H-1 cita `:42-53` y el UI-SPEC §9
cita `:45-53`. El bloque real es **`:45-54`**, con `viewportFit` en **`:52`** e `interactiveWidget` en
**`:53`** (T-9 lo cita bien). El hecho —los dos existen tipados— está confirmado.

Y la documentación **sí** menciona `interactiveWidget` (contra lo que dice H-1 de "no documentado": lo
no documentado es `viewportFit`): aparece comentado en el ejemplo de
`generate-viewport.md:135` / `:146` como *"Also supported but less commonly used"*, **sin declarar su
default**.
[VERIFIED: node_modules/next/dist/docs/01-app/03-api-reference/04-functions/generate-viewport.md:134-147]

### Qué es cada valor, y cuál es el default

> *"`resizes-visual`: The visual viewport gets resized by the interactive widget. **This is the
> default.**"* · *"`resizes-content`: The viewport gets resized by the interactive widget."* ·
> *"`overlays-content`: Neither the viewport nor the visual viewport gets resized by the interactive
> widget."*

[CITED: https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Elements/meta/name/viewport]

Soporte: shipped en **Chrome 108** y **Firefox 133 (Android)**; en WebKit se implementó en agosto de
2026 pero **no había shipeado en Safari ni en Safari Technology Preview al 2026-09-11**
[CITED: https://www.bram.us/2026/09/11/webkit-supports-interactive-widget-and-hopefully-safari-will-too/].

⚠ **Conflicto de fuentes declarado:** un resultado de búsqueda de baja calidad afirma que Apple
introdujo `interactive-widget` en iOS 15. Va **contra** la fuente con fecha y autor de arriba y contra
el intent-to-ship de blink-dev. Me quedo con bram.us y lo marco MEDIUM, no HIGH.

**La consecuencia práctica es la misma por los dos caminos:** en iOS Safari, con el teclado abierto, el
**layout viewport no se encoge** — sólo el visual viewport — así que un `position: fixed; bottom: 0`
queda anclado al fondo del layout viewport y **termina debajo del teclado**
[CITED: https://www.bram.us/2021/09/13/prevent-items-from-being-hidden-underneath-the-virtual-keyboard-by-means-of-the-virtualkeyboard-api/].
Es **exactamente** el contrato observable que el UI-SPEC §9 escribe. ⇒ **`interactiveWidget:
'resizes-visual'` es un no-op declarado en los tres motores hoy**: default en Chrome/Firefox Android,
inerte-pero-equivalente en iOS. La decisión del UI-SPEC se sostiene.

### El argumento que el UI-SPEC no usó, y es el más fuerte: los cuatro quicks lo midieron

El UI-SPEC argumenta "es el default de Chrome, así que es lo que hay en producción". Correcto, pero hay
algo mejor: **las mediciones de los cuatro quicks se tomaron bajo ese default**, así que
`resizes-content` no sería "un riesgo" — sería **invalidar cuatro mediciones ya pagadas**.

| Quick | Qué se hizo, y dónde vive hoy | Lo medido |
|---|---|---|
| **`261005-x91`** | `repositionInputs={false}` en el `DrawerPrimitive.Root` de `components/ui/drawer.tsx:188`. Apaga el bloque entero del listener de teclado de vaul (`node_modules/vaul/dist/index.mjs:1115` sale temprano) ⇒ vaul **ya no escribe** `height`/`bottom` inline | A 412×823, swap QWERTY→numérico: `top` del drawer **-75.4 → 164.6**; la X pasa de inalcanzable (-66.4) a visible (173.6); 3 ciclos de teclado sin quedar clavado |
| **`261005-x91` (el costo ACEPTADO)** | — | Con el teclado arriba (QWERTY 320 ⇒ línea del teclado en **503**), los campos del fondo quedan **estructuralmente** debajo: `Notas` 655..687, checkbox "Avisar al cliente" 701..717, `Sesiones` 642..678. El quick lo escribe como riesgo medido y dice que depende de que **Chrome panee el visual viewport**, cosa que no se pudo medir headless |
| **`261005-vuy`** | Backstop de `visualViewport.resize` en `DrawerContent` con 3 guardas en orden (`components/ui/drawer.tsx:108-116`): sale si el teclado está arriba; sale si vaul no dejó inline; recién entonces `removeProperty('height'/'bottom')` — **nunca** `transform`. Y el `<Toaster position="top-center">` único + corrección CSS de desktop | `top` **-75.4 → 164.6**; con teclado arriba el inline de vaul queda **intacto** y el campo enfocado visible (top 297) |
| **`261006-fln`** | El atrás cierra el **campo fecha** abierto antes de navegar | — |
| **`261006-dzr`** | El atrás cierra el **selector** abierto en vez de navegar | — |
| **`261005-n41`** | Selector de hora propio 24h | — |
| **`261005-pbj`** | Bajar el teclado al confirmar la hora | — |

[VERIFIED: .planning/workstreams/panel-nav/quick/261005-x91-*/SUMMARY.md y 261005-vuy-*/SUMMARY.md, leídos esta sesión; y components/ui/drawer.tsx:52-62,91-116,164-188]

### Lo que el plan NO debe volver a pagar — constraints duros

1. **No tocar `components/ui/drawer.tsx`.** Carga el arreglo de dos quicks con un comentario que avisa
   que si se borra uno sin el otro el drawer sigue cubierto (`drawer.tsx:62`). La barra no necesita
   interactuar con él: la barra es `z-30`, el overlay del drawer `z-40`, el drawer `z-50`
   (`sidebar.tsx:262,267` para los del menú; el `Drawer` de alta usa su propia capa) ⇒ **los drawers
   tapan la barra, que es lo correcto**: el atrás cierra el overlay antes de navegar.
2. **No declarar `resizes-content`.** Reflowearía el layout viewport e invalidaría la tabla de arriba.
3. **No escribir un listener de `visualViewport` nuevo para la barra.** Ya hay uno, con guardas, para
   los drawers; un segundo dueño del mismo evento es la clase de bug que estos quicks arreglaron.
4. **No "arreglar" el costo medido del Task 1 de `261005-x91`** (campos del fondo bajo el teclado) en
   esta fase: es deuda aceptada y documentada, y está fuera de alcance (*"lo único que se puede mover
   de una pantalla es el padding que reserva el alto de la barra"*).

### El riesgo residual real, que esta perilla NO gobierna

Dos cosas, las dos sólo observables en un iPhone:

- **Safari desplaza el layout viewport** para mantener el campo enfocado a la vista ⇒ un elemento
  `fixed` puede **parecer moverse** aunque su anclaje no cambie.
  [CITED: resultados de búsqueda sobre el comportamiento de Safari iOS — MEDIUM]
- Hay un **bug reportado en iOS 26**: al cerrar el teclado, `visualViewport.offsetTop` no vuelve a 0 ⇒
  desalineación persistente de elementos `fixed`. [ASSUMED — reportado en foros de Apple vía búsqueda,
  no verificado contra una fuente primaria con fecha]

⇒ El punto 5 de §18 del UI-SPEC (celular real, Android Chrome **y** iOS Safari) **no es ceremonia**: es
el único instrumento que ve estos dos. Y el contrato que hay que confirmar es el que el UI-SPEC ya
escribió: con el teclado abierto la barra **no se ve**, no tapa campo ni submit, y al cerrarse vuelve
sin reflow.

---

## §3 — `env(safe-area-inset-*)` en Tailwind v4 CSS-first: **T-2 es FALSO, y eso es una buena noticia**

### La corrección

T-2 de `REQUIREMENTS.md` dice: *"⚠ **El repo NO usa `env(safe-area-inset-*)` en ningún lado**
(barrido: cero coincidencias)"*. **Es falso.** Hay **tres usos en dos archivos**:

| Archivo:línea | Forma | Qué enseña |
|---|---|---|
| `components/landing/whatsapp-float.tsx:36` | **clase Tailwind v4 arbitrary value**: `bottom-[calc(clamp(16px,4cqw,32px)+env(safe-area-inset-bottom))]` | **Es la sintaxis exacta que ya compila en este repo, sin `tailwind.config`.** Es el precedente que hay que espejar |
| `components/auth/mobile-login-hero.tsx:105` | `style={{ padding: '22px 24px calc(24px + env(safe-area-inset-bottom))' }}` | La escotilla de escape por `style` inline, también precedente |
| `components/auth/mobile-login-hero.tsx:182` | `padding: '12px 24px calc(28px + env(safe-area-inset-bottom))'` | Ídem |

[VERIFIED: `grep -rn "safe-area-inset" app components lib proxy.ts` → esas 3 líneas y nada más]

**Por qué importa y no es sólo pedantería:** el plan no tiene que inventar la sintaxis ni descubrir si
Tailwind v4 la soporta sin config — **ya hay un archivo en producción que lo prueba**. Y el que el
barrido de T-2 diera cero sugiere que buscó `safe-area` en `app/globals.css` (donde efectivamente no
está) y no en los componentes.

**Y hay un corolario que confirma la causalidad del UI-SPEC §9:** esas tres usos **hoy valen 0**,
porque nada declara `viewport-fit=cover`. Son código inerte. Declararlo en `(dashboard)` **no los
activa** (`mobile-login-hero` vive en el route group `(auth)` y `whatsapp-float` en el landing, los dos
fuera del árbol del dashboard) ⇒ cero efecto colateral, y el radio del cambio queda confirmado también
por este lado.

### Por qué hace falta `viewport-fit=cover`, citado

> *"The default value of `viewport-fit` is `auto`, which results in the automatic insetting behavior"*
> — *"Content is automatically inset within the display's safe area."*

[CITED: https://webkit.org/blog/7929/designing-websites-for-iphone-x/]

> *"The values are `0` if the viewport is a rectangle and no features — such as toolbars or dynamic
> keyboards — are occupying viewport space; otherwise, it is a `px` value greater than `0`."*
> — y: *"The second argument, if provided, is the fallback value, which is used if the environment
> variable referenced in the first argument is not supported or doesn't exist."*

[CITED: https://developer.mozilla.org/en-US/docs/Web/CSS/env]

⇒ Con `viewport-fit: auto` (el default) el área de layout **ya es** el safe area, o sea un rectángulo
sin features ocupándolo ⇒ los insets valen **0**. El orden de causalidad del UI-SPEC §9 (*"primero el
viewport, después el CSS"*) está confirmado por fuente, y el `, 0px` de fallback que el UI-SPEC pone en
cada `env()` es la práctica que MDN documenta.

### Las formas concretas que funcionan **acá** (no una receta genérica)

**Regla que hay que respetar y que el UI-SPEC no podía expresar porque escribe CSS en prosa: en una
clase de Tailwind el valor arbitrario NO puede tener espacios** (si fuera inevitable, se escriben como
`_`). Comas y `calc()`/`var()`/`env()` anidados sí van. `whatsapp-float.tsx:36` lo demuestra.

```css
/* 1) app/globals.css — en el MISMO bloque donde ya vive --radius */
/*    :root, [data-theme='forjo'] { ... }  →  globals.css:68-70 */
:root,
[data-theme='forjo'] {
  --radius: 0.4rem;              /* existente, globals.css:70 */
  --panel-nav-h: 3.5rem;         /* NUEVO — 56px, un solo lugar */
  --panel-nav-muted: var(--muted-foreground);   /* NUEVO — default forjo */
}
```

```css
/* 2) app/themes.css — DENTRO de los bloques de tema que ya existen, no en bloques nuevos.
      Así la cascada no depende del orden de inserción. Líneas de los bloques:
        [data-theme="modern"]       → themes.css:16
        .dark[data-theme="modern"]  → themes.css:59
        [data-theme="spa"]          → themes.css:87
        .dark[data-theme="spa"]     → themes.css:126                                   */
[data-theme="spa"]         { --panel-nav-muted: #6b6055; }
.dark[data-theme="spa"]    { --panel-nav-muted: var(--muted-foreground); }
[data-theme="modern"]      { --panel-nav-muted: #5c6578; }
.dark[data-theme="modern"] { --panel-nav-muted: var(--muted-foreground); }
```

**La cascada funciona, y está verificada, no asumida:**

| Selector | Especificidad | Gana porque |
|---|---|---|
| `:root` (globals.css:68) | (0,1,0) | Es el default |
| `[data-theme="spa"]` (themes.css:87) | (0,1,0) | **Misma** especificidad ⇒ decide el orden de fuente, y `app/layout.tsx:11-12` importa `globals.css` **y después** `themes.css` ⇒ themes gana [VERIFIED: app/layout.tsx:11-12] |
| `.dark[data-theme="spa"]` (themes.css:126) | (0,2,0) | Mayor especificidad ⇒ gana en modo oscuro sin depender del orden |

Y los tres atributos viven en el **mismo** elemento (`<html>`): `PaletteScript` escribe
`document.documentElement.dataset.palette / .theme / .font`
[VERIFIED: components/palette-script.tsx:27-35], y `next-themes` pone `.dark` en ese mismo nodo
(`app/layout.tsx:63`, `attribute="class"`). ⇒ `--panel-nav-muted: var(--muted-foreground)` declarado en
`:root` resuelve al `--muted-foreground` **del tema activo** (porque es el mismo elemento), que es
exactamente el motivo por el que hacen falta los dos overrides.

```tsx
/* 3) El <main> del layout — UN SOLO lugar (app/(dashboard)/layout.tsx:57) */
// HOY:
<main className="lg:pl-60 pt-14 lg:pt-0 min-h-screen">
// CON LA FASE (el pb es ADITIVO; el min-h-screen y el pt-14 no se tocan):
<main className="lg:pl-60 pt-14 lg:pt-0 min-h-screen pb-[calc(var(--panel-nav-h)+env(safe-area-inset-bottom,0px))] lg:pb-0">
```

```tsx
/* 4) La barra: el inset va DENTRO del elemento fijo, debajo de la caja de 56px */
<nav
  aria-label="Navegación principal"
  className="lg:hidden fixed bottom-0 left-0 right-0 z-30 bg-card border-t border-border
             pb-[env(safe-area-inset-bottom,0px)]
             pl-[env(safe-area-inset-left,0px)] pr-[env(safe-area-inset-right,0px)]"
>
  <div className="flex h-[var(--panel-nav-h)]"> … </div>
</nav>
```

```tsx
/* 5) El aviso de MOB-05 (Phase 3, superficie decidida acá).
      ⚠ El UI-SPEC §13 escribe el valor como CSS con espacios
      (`calc(var(--panel-nav-h) + env(...) + 0.5rem)`); como CLASE los espacios NO van: */
className="fixed left-1/2 -translate-x-1/2 z-40
           bottom-[calc(var(--panel-nav-h)+env(safe-area-inset-bottom,0px)+0.5rem)]"
```

**Gate de no-fuga, ya decidible:** hoy `grep -rn "panel-nav-muted\|panel-nav-h" app components lib`
devuelve **0 hits** [VERIFIED: medido]. Después de la fase debe dar hits **sólo** en `app/globals.css`,
`app/themes.css` y los componentes nuevos — es el §18.13 del UI-SPEC, y arranca de un cero medido.

---

## §4 — La ruta `/mas`: **la nota del §17 es correcta, con líneas**

### Confirmado punto por punto

| Afirmación del UI-SPEC §17 | Veredicto | Evidencia |
|---|---|---|
| `/mas` es ruta nueva | ✓ | `app/(dashboard)/` tiene 14 directorios de ruta: `abonos agenda appointments ayuda clients clinical-history consultorios dashboard equipo finances negocio servicios settings web`. **No hay `mas`** [VERIFIED: `ls "app/(dashboard)"`] |
| `/mas` no está en `KNOWN_PREFIXES` | ✓ | La lista es `'/login' '/register' '/dashboard' '/appointments' '/clients' '/finances' '/settings' '/onboarding' '/admin' '/auth' '/forgot-password' '/reset-password' '/api' '/_next'` — 14 entradas, `/mas` no está [VERIFIED: lib/auth/route-lists.ts:34-56] |
| `/mas` no está en `DASHBOARD_ROUTE_PREFIXES` | ✓ | La lista es `'/dashboard' '/appointments' '/clients' '/finances' '/settings' '/onboarding' '/admin'` — 7 entradas [VERIFIED: lib/auth/route-lists.ts:74-86] · y `grep -c "'/mas'" lib/auth/route-lists.ts` → **0** |
| Las 8 hermanas tampoco están y funcionan | ✓ | Cruzando los 14 directorios con las listas: **ausentes** `agenda`, `abonos`, `servicios`, `equipo`, `consultorios`, `negocio`, `web`, `ayuda` — **exactamente 8** (`clinical-history` es la novena ausente, no enumerada por el UI-SPEC, y tampoco pasa) |
| El guard real vive en `(dashboard)/layout.tsx` | ✓ | `getUser()` → `if (!user) redirect('/login')` [VERIFIED: app/(dashboard)/layout.tsx:22-24]; sin negocio → `/onboarding` (`:32`); suspendido → `/suspendido` (`:39`) |
| El archivo documenta con advertencias que tocar las listas rompe en silencio | ✓ | 4 bloques de advertencia: `:6-18` (la tabla de los 4 efectos + *"Antes de sumar una ruta acá: preguntate en cuál de las CUATRO va"*), `:59-65`, `:69-73`, `:89-95` [VERIFIED: lib/auth/route-lists.ts] |

El mecanismo exacto del salteo:

```ts
// proxy.ts:52-56
// Public booking pages — skip session handling entirely so the logged-in
// owner's credentials never leak into the anon booking flow.
if (!isKnownRoute(pathname) && pathname !== '/') {
  return NextResponse.next()
}
```

[VERIFIED: proxy.ts:52-56]

⇒ **Recomendación CONFIRMADA: no tocar `lib/auth/route-lists.ts` en esta fase.** Y la consecuencia
escrita, para que no se descubra después: `/mas` **no recibe el refresh de cookie** de `updateSession`.
No es un agujero — el `getUser()` del layout revalida contra Supabase en cada request — y es el
comportamiento que las 9 hermanas ya tienen en producción.

⚠ **Dato extra para quien algún día sí quiera tocarlas:** `isAuthRoute` / `isDashboardRoute` usan
`startsWith` **pelado** (`matchesPrefix`, `route-lists.ts:103-105`), mientras `isMaintExempt` /
`isKnownRoute` usan matcheo **por segmento** (`matchesSegment`, `:98-100`). La diferencia es
intencional y está documentada como el comportamiento de producción (`:89-95`). Hoy ningún prefijo
matchea `/mas` por ninguna de las dos vías.

### La forma mínima correcta de una pantalla nueva en `app/(dashboard)/`

**Molde exacto a copiar: `app/(dashboard)/abonos/page.tsx:9-20`** [VERIFIED].

```tsx
// app/(dashboard)/mas/page.tsx  — Server Component
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { MasClient } from './mas-client'

export default async function MasPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: business } = await supabase
    .from('businesses')
    .select('*')
    .eq('owner_id', user.id)   // PC-3: aislamiento por tenant
    .single()

  if (!business) redirect('/onboarding')

  return <MasClient business={business} />
}
```

Hechos que condicionan esta forma:

1. **Más TIENE que ser cliente.** Sus filas necesitan `usePathname()`, `useNavigationGuard()` y
   `panelNavMode` — los tres client-only. ⇒ split `page.tsx` + `mas-client.tsx`, que es además la
   convención del repo (`.claude/CLAUDE.md`).
2. **El layout NO pasa `business` a `children`.** Lo pasa sólo a `<Sidebar business={business} />`
   (`(dashboard)/layout.tsx:56`) ⇒ `/mas/page.tsx` **debe** re-resolverlo. Eso no es duplicación
   evitable: es el patrón de las 13 pantallas [VERIFIED: app/(dashboard)/layout.tsx:47-70].
3. **La terminología NO hay que re-resolverla en el cliente.** `VerticalProvider` ya envuelve
   (`(dashboard)/layout.tsx:48`) y `lib/use-terminology.tsx:22-29` expone `useVertical()` (todo el
   vertical: `key`, `menu`, `features`, `terminology`) y `useTerminology()` (sólo el mapa). Con
   default a `general` fuera del provider [VERIFIED: lib/use-terminology.tsx:6-9].
4. **`/mas` necesita exactamente un `h1`.** Medido: las 10 unidades de pantalla del panel tienen
   **1 `<h1>` cada una**, cero y dos nunca [VERIFIED: conteo sobre `app/(dashboard)/*/{page,*client}.tsx`].
   El patrón visible es `<PageEyebrow label="…" />` + `<h1 className="text-2xl font-bold mt-2
   font-[family-name:var(--font-heading)]">` [VERIFIED: app/(dashboard)/ayuda/page.tsx:50-51;
   appointments-client.tsx:273; finances-client.tsx:607]. El UI-SPEC eligió `sr-only` en su lugar, con
   **5 precedentes reales verificados**: `admin/page.tsx:78`, `pipeline-client.tsx:214`,
   `negocios-client.tsx:218`, `bandeja-client.tsx:194`, `planes-client.tsx:27` [VERIFIED: los 5].
   ⇒ `/mas` es la **única** pantalla del panel sin `PageEyebrow` ni `h1` visible. Es una divergencia
   deliberada del contrato, no un olvido — pero el plan debe escribirla así para que el ejecutor no
   "complete el patrón" por reflejo.
5. **Cero migraciones, cero RLS, cero queries nuevas.** `/mas` lee `businesses` por `owner_id`, igual
   que el layout que la envuelve.

---

## §5 — El mecanismo de historial: el código real, verbatim, y una rama que nadie enumeró

### El cableado del sidebar, tal cual está (es lo que la barra tiene que replicar)

```tsx
// components/dashboard/sidebar.tsx:144-175 — el <Link> de cada item de nav
<Link
  key={item.href}
  href={item.href}
  replace={panelNavMode({ from: pathname, to: item.href }) === 'replace'}   // :152
  onClick={() => setMobileOpen(false)}                                      // :153 ← se va con el drawer
  onNavigate={(e) => {                                                      // :161
    if (requestNavigation(item.href)) { e.preventDefault(); return }        // :162  1º el guard
    if (active && consumeOwnedPanelEntry()) e.preventDefault()              // :163  2º NAV-08
  }}
  aria-current={active ? 'page' : undefined}                                // :165
  className={cn(
    'flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50',
    active ? 'bg-primary text-primary-foreground'
           : 'text-muted-foreground hover:bg-secondary hover:text-foreground'
  )}
>
```

[VERIFIED: components/dashboard/sidebar.tsx:144-175] · con `const active = pathname === item.href`
(`:142`) y `const requestNavigation = useNavigationGuard()` (`:97`).

**El orden de T-5 está confirmado y es el que la barra debe copiar sin alterar:** el guard de cambios
sin guardar **primero** (si bloquea, se hace cargo él y no pasa nada más); recién después NAV-08, y
**sólo** si el destino es el activo.

### Las tres piezas, con su firma exacta

```ts
// lib/panel-history.ts:290
export const PANEL_ROOT = '/dashboard'

// lib/panel-history.ts:336-349 — las CUATRO ramas, puras y sobre pathnames
export function panelNavMode({ from, to, root = PANEL_ROOT }: { from: string; to: string; root?: string }): PanelNavMode {
  if (from === to) return 'replace'
  if (from === root) return 'push'
  if (to === root) return 'push'
  return 'replace'
}

// lib/panel-history.ts:551-557 — genérico: no recibe el param
export function consumeOwnedPanelEntry(): boolean {
  const actual: unknown = window.history.state
  if (isForeignOwnedEntry(actual)) return false
  if (panelViewEntryParam(actual) === null) return false
  window.history.back()
  return true
}
```

[VERIFIED: lib/panel-history.ts:290, :336-349, :551-557]

```ts
// components/dashboard/unsaved-changes-guard.tsx:74 — la firma del guard
requestNavigation: (href: string | null, proceed?: () => void) => boolean
// :293-295 — lo que el nav consume
export function useNavigationGuard() {
  return useContext(UnsavedChangesContext).requestNavigation
}
```

[VERIFIED: components/dashboard/unsaved-changes-guard.tsx:74, :293-295]

Las tres marcas, disjuntas y re-verificadas por su dueño antes de cada `back()`:
`frjView` (`lib/panel-history.ts:146`), `frjOverlay` (`lib/overlay-history.ts:88`),
`frjDirty` (`lib/dirty-history.ts:92`); y `panel-history.ts:217,243` las reconoce como ajenas
[VERIFIED].

El logout, que Más hereda tal cual (es un `<button>`, no un `<Link>`):

```tsx
// components/dashboard/sidebar.tsx:220
<button onClick={() => { if (!requestNavigation('/login', () => void handleLogout())) void handleLogout() }}>
```

[VERIFIED: components/dashboard/sidebar.tsx:219-225] · y `handleLogout` (`:99-103`) **no tiene rama de
error** — lo que justifica el `toast.error` que §14 del UI-SPEC agrega sólo en Más.

### ⚠ La rama que nadie enumeró, y que la UAT va a encontrar

El UI-SPEC §17 enumera **un** recorrido: `Inicio → Más → sección → atrás` cae en **Inicio** salteando
Más. Es correcto. Pero `panelNavMode` tiene **cuatro** ramas, y con `/mas` en el medio salen **cuatro**
recorridos. Los cuatro, computados contra el código de arriba:

| Recorrido | `panelNavMode({from, to})` | Resultado | ¿Enumerado en el upstream? |
|---|---|---|---|
| `/dashboard` → `/mas` | `from === root` ⇒ **push** | Más queda encima de Inicio ⇒ el atrás vuelve a Inicio ✓ | Sí (implícito en O-1: *"Más es una entrada de historial gratis"*) |
| `/mas` → `/servicios` | ninguna rama especial ⇒ **replace** | `/servicios` **pisa** `/mas` ⇒ el atrás cae en **Inicio** | **Sí** — es literalmente §17 |
| `/servicios` → `/mas` | ninguna ⇒ **replace** | `/mas` pisa la sección ⇒ el atrás cae en Inicio | No, pero es la simétrica y es coherente |
| **`/mas` → `/dashboard`** (tocar **Inicio** estando en Más) | **`to === root` ⇒ push** | Queda `/dashboard` → `/mas` → `/dashboard` ⇒ **el atrás cae en MÁS** | **NO. Nadie lo escribió.** |

**La cuarta no es un bug y no hay que arreglarla**: es la rama 3 de `panelNavMode`, decidida en v0.30
con motivo —*"sección → dashboard EMPUJA y no reemplaza: replace dejaría `/dashboard` sobre
`/dashboard` = atrás muerto"*
[VERIFIED: .planning/workstreams/panel-nav/STATE.md, bloque `## Decisions`; y el comentario de
`lib/panel-history.ts:311-317`]. Con `/mas` en el medio el `push` sigue siendo lo correcto: no hay dos
entradas idénticas y el atrás **siempre hace algo visible**.

⇒ **Acción para el plan: declarar las cuatro ramas por escrito en el PLAN y en los recorridos de UAT**,
la cuarta incluida, con su motivo. Si no, el dueño toca `Más → Inicio → atrás`, aterriza en Más, y lo
reporta como la regresión que la fase prometió no causar. El criterio 6 del ROADMAP dice *"la UAT de
v0.30 repetida desde la barra da lo mismo"* — y para este recorrido concreto "lo mismo" **es** caer en
Más, porque es la misma regla aplicada a una ruta nueva.

### La inmutabilidad del mecanismo (criterio 6), con los hashes ya fijados

| Archivo | Último commit que lo tocó | Líneas |
|---|---|---|
| `lib/panel-history.ts` | **`351a53b`** | 557 |
| `lib/overlay-history.ts` | **`32cf56c`** | 551 |
| `lib/dirty-history.ts` | **`351a53b`** | 422 |

[VERIFIED: `git log --format=%h -n 1 -- <file>` y `wc -l`, medido en HEAD `e7f7d7c` con el working tree
limpio bajo `lib/`, `components/` y `app/`]

⚠ **Este gate va en bash, NO en vitest**, y es una decisión ya tomada en la Phase 1:
*"El invariante de NAV-06 basado en git (los 3 archivos intocables en su commit original) vive como
gate de bash y NO como test: el CI clona a profundidad 1 y seria rojo en cada push por falta de
historia"* [VERIFIED: .planning/workstreams/panel-nav/STATE.md, `## Decisions`].

---

## §6 — `buildNavGroups()` y el inventario de los 4 verticales

### La función, tal cual está — y el bloqueante mecánico que el UI-SPEC no menciona

```ts
// components/dashboard/sidebar.tsx:43-49
const NAV_GROUPS: { section: string; keys: string[] }[] = [
  { section: 'PANEL',    keys: ['dashboard'] },
  { section: 'AGENDA',   keys: ['appointments', 'agenda', 'abonos', 'clients', 'patients'] },
  { section: 'GESTIÓN',  keys: ['servicios', 'equipo', 'consultorios', 'negocio', 'web'] },
  { section: 'REPORTES', keys: ['finances'] },
  { section: 'AJUSTES',  keys: ['settings'] },
]

// components/dashboard/sidebar.tsx:57-86
function buildNavGroups(business: Business): { section: string; items: NavItem[] }[] {
  const v = resolveVertical(business)
  const t = v.terminology
  const ITEMS: Record<string, NavItem> = { /* 13 entradas, :60-77 */ }
  const menu = new Set(v.menu)
  return NAV_GROUPS
    .map(g => ({
      section: g.section,
      items: g.keys.filter(k => menu.has(k)).map(k => ITEMS[k]).filter(Boolean),
    }))
    .filter(g => g.items.length > 0)      // :85  ← el que hace desaparecer PANEL entero
}
```

[VERIFIED: components/dashboard/sidebar.tsx:43-49 y :57-86]

⚠ **Deriva de líneas:** el ROADMAP M-4 cita `sidebar.tsx:43-48`; el bloque real es **`:43-49`**. El
UI-SPEC cita `:78-88` para la función; el real es **`:57-86`** con el `.filter()` en **`:85`** (que es
el número que el UI-SPEC cita bien). Sin consecuencia.

🚩 **EL BLOQUEANTE:** `buildNavGroups` **no está exportada** (`function buildNavGroups`, sin `export`,
`:57`) y vive en un archivo `'use client'` (`sidebar.tsx:1`). La regla no-negociable 1 de §11 del
UI-SPEC —*"Más NO reimplementa el filtro. Deriva de `buildNavGroups(business)` —la misma función del
sidebar"*— **no es ejecutable tal cual está el código**. Hay que mover algo, y el UI-SPEC no lo dice.

**Recomendación: extraer `NAV_GROUPS` + `buildNavGroups` + el tipo `NavItem` a
`components/dashboard/nav-groups.ts`** y que `sidebar.tsx` las importe.

| Opción | Pro | Contra |
|---|---|---|
| **A — extraer a `components/dashboard/nav-groups.ts`** ✅ | Las dos superficies importan **la misma** fuente, y eso se audita con un grep de una línea (`grep -rn "from '@/components/dashboard/nav-groups'"` debe dar 2 hits). Desacopla Más del componente que esta fase está encogiendo. Los imports de `lucide-react` se van con la función, así que el módulo queda autocontenido | Un archivo nuevo. El módulo **no** lleva `'use client'` propio: lo heredan sus dos consumidores, que sí son client |
| B — `export function buildNavGroups` en `sidebar.tsx` | Cero archivos nuevos, un diff de 7 caracteres | Más importa del componente del sidebar, que es justo lo que la fase está vaciando en mobile. Si mañana el drawer se borra del todo, el import queda raro |
| C — reimplementar el filtro en Más | — | **PROHIBIDO** por el ROADMAP (Security/Integrity): `canchas` vería "Equipo" |

**Nota:** `buildNavGroups` recibe `business` sólo para llamar a `resolveVertical(business)` (`:58`).
Cambiarle la firma a `(vertical: ResolvedVertical)` dejaría a Más usar `useVertical()` del context — es
**tentador y hay que resistirlo en esta fase**: cambiaría el call site del sidebar, que es el
superviviente de desktop (MOB-07). Mantener la firma `(business: Business)` y pasarle el `business` que
`/mas/page.tsx` ya resuelve.

### Los cuatro inventarios, computados (no en prosa)

Cruzando `NAV_GROUPS` (`sidebar.tsx:43-49`) con `menu` de cada vertical
(`lib/verticals.ts:58, 80, 101, 122`) y `ITEMS` (`sidebar.tsx:60-77`). **Valores verbatim de los
archivos.**

`menu` de cada vertical, literal:

- **salud** (`verticals.ts:58`): `['dashboard', 'appointments', 'agenda', 'abonos', 'patients', 'finances', 'servicios', 'equipo', 'consultorios', 'negocio', 'web', 'settings']` — 12 keys, **sin `clients`**
- **belleza** (`:80`): `['dashboard', 'appointments', 'agenda', 'abonos', 'clients', 'finances', 'servicios', 'equipo', 'consultorios', 'negocio', 'web', 'settings']` — 12
- **general** (`:101`): idéntica a belleza — 12
- **canchas** (`:122`): `['dashboard', 'appointments', 'agenda', 'abonos', 'clients', 'finances', 'servicios', 'consultorios', 'negocio', 'web', 'settings']` — 11, **sin `equipo` ni `patients`**

Terminología relevante, verbatim: salud `clients: 'Pacientes'`, `services: 'Prestaciones'`,
`locations: 'Consultorios'` (`:46,50,52`) · belleza `'Clientes'`, `'Servicios'`, `'Locales'`
(`:70,74,76`) · general `'Clientes'`, `'Servicios'`, `'Sucursales'` (`:91,95,97`) · canchas
`'Clientes'`, `appointments: 'Reservas'`, `services: 'Canchas'`, `locations: 'Sedes'`
(`:109,112,115,117`). [VERIFIED: lib/verticals.ts:40-125]

**Resultado del sidebar HOY (lo que Más + barra tienen que reproducir exactamente):**

| Grupo | salud | belleza | general | canchas |
|---|---|---|---|---|
| `PANEL` | Dashboard | Dashboard | Dashboard | Dashboard |
| `AGENDA` | Turnos · Agenda · Abonos · **Pacientes** | Turnos · Agenda · Abonos · Clientes | Turnos · Agenda · Abonos · Clientes | **Reservas** · Agenda · Abonos · Clientes |
| `GESTIÓN` | **Prestaciones** · Equipo · **Consultorios** · Negocio · Mi web | Servicios · Equipo · **Locales** · Negocio · Mi web | Servicios · Equipo · **Sucursales** · Negocio · Mi web | **Canchas** · *(sin Equipo)* · **Sedes** · Negocio · Mi web |
| `REPORTES` | Finanzas | Finanzas | Finanzas | Finanzas |
| `AJUSTES` | Configuración | Configuración | Configuración | Configuración |
| **Total destinos** | **12** | **12** | **12** | **11** |

**Lo que queda en Más (total − los 4 de la barra):**

| Rubro | Filas de menú | Detalle, en orden de `NAV_GROUPS` |
|---|---|---|
| salud | **8** ✓ | AGENDA: Abonos · GESTIÓN: Prestaciones, Equipo, Consultorios, Negocio, Mi web · REPORTES: Finanzas · AJUSTES: Configuración |
| belleza | **8** ✓ | AGENDA: Abonos · GESTIÓN: Servicios, Equipo, Locales, Negocio, Mi web · REPORTES: Finanzas · AJUSTES: Configuración |
| general | **8** ✓ | AGENDA: Abonos · GESTIÓN: Servicios, Equipo, Sucursales, Negocio, Mi web · REPORTES: Finanzas · AJUSTES: Configuración |
| **canchas** | **7** ✓ | AGENDA: Abonos · GESTIÓN: Canchas, Sedes, Negocio, Mi web · REPORTES: Finanzas · AJUSTES: Configuración |

**+ 3 filas de `CUENTA`** en los 4 ⇒ **11 filas** (10 en canchas). ⇒ **§11 del UI-SPEC y M-4 del ROADMAP
están CONFIRMADOS con los números exactos.**

### 🚩 La trampa de implementación más probable de toda la fase

**Hay que restar CINCO keys, no cuatro.** `clients` y `patients` son **dos keys distintas** que apuntan
al **mismo** destino:

```ts
// components/dashboard/sidebar.tsx:73-74
clients:  { href: '/clients', label: t.clients, icon: Users },
patients: { href: '/clients', label: t.clients, icon: Users },
```

[VERIFIED: components/dashboard/sidebar.tsx:73-74]

⇒ El set a restar es `{'dashboard', 'appointments', 'agenda', 'clients', 'patients'}`. **Si se resta
sólo `clients`, en `salud` Más mostraría "Pacientes" duplicado** (la barra ya lo tiene) y el inventario
daría 9 filas en vez de 8 — y el síntoma aparece **sólo en un rubro**, que es la peor forma de fallar.
Alternativa igualmente válida y más difícil de equivocar: restar **por `href`**, no por key
(`{'/dashboard','/appointments','/agenda','/clients'}`), porque los dos ITEMS colapsan al mismo href.
El plan tiene que elegir una y escribirla.

### ⚠ Las tres filas de `CUENTA` **no** están todas en el footer

M-3 / T-6 dicen *"el footer del sidebar tiene tres filas"* y citan `sidebar.tsx:181-241` / `:189,197`.
Medido:

| Fila | Dónde está realmente | Elemento |
|---|---|---|
| **Ver mi página** | `sidebar.tsx:182-190` — **DENTRO del `<nav>`** (`:131-191`), no en el footer | `<a href={...NEXT_PUBLIC_APP_URL}/${business.slug}} target="_blank" rel="noopener noreferrer">` con `ExternalLink` |
| **Ayuda** | `sidebar.tsx:202-214` — footer `<div className="p-3 border-t …">` (`:193`) | `<Link href="/ayuda">` con el **mismo** cableado de historial que los items de nav (`:204-209`) |
| **Cerrar sesión** | `sidebar.tsx:219-225` — footer | `<button>` |
| *(firma)* | `sidebar.tsx:227-245` — footer | `<div>` con SVG + `<a>` a forjo.studio |
| *(identidad)* | `sidebar.tsx:110-129` — **header del sidebar**, `<div className="p-5 border-b …">` | — |

[VERIFIED: components/dashboard/sidebar.tsx:110-129, :131-191, :182-190, :193-246]

**Cero consecuencia de diseño** (las tres van a `CUENTA` igual), pero la auditoría del inventario de
§18.7 tiene que mirar **dos** lugares del sidebar, no uno — y el ejecutor que copie "el footer" se
olvida de "Ver mi página".

**Y un detalle que sí es carne:** `Ayuda` en el sidebar lleva el cableado completo
(`replace={panelNavMode(...)}` + `onNavigate` con guard + consumo), con un comentario de 5 líneas
explicando por qué (`:197-201`: *"si no compartiera la política, salir de Clientes por Ayuda dejaría
Clientes debajo y el atrás caería ahí en vez del dashboard"*). ⇒ **Las filas de Más que son `<Link>`
—las 7/8 del menú **y** Ayuda— llevan el mismo cableado que los items de la barra.** No es opcional:
es el dialecto único que NAV-05 impone. `Ver mi página` (pestaña nueva) y `Cerrar sesión` (button) son
las dos excepciones legítimas.

---

## §7 — Qué se puede verificar de verdad en este repo

### La línea base, medida hoy (2026-10-08, HEAD `e7f7d7c`)

| Comando | Resultado medido |
|---|---|
| `npx vitest run` | **exit 0** · `Test Files 105 passed (105)` · `Tests 1619 passed \| 4 expected fail \| 1 skipped (1624)` · 72.43s |
| `./node_modules/.bin/tsc --noEmit` | **0 errores** (`grep -cE 'error TS'` → 0) |
| `./node_modules/.bin/eslint components/dashboard/sidebar.tsx` | **rc 0** |
| `grep -rn "panel-nav-muted\|panel-nav-h" app components lib` | **0 hits** |
| `grep -rn "safe-area-inset" app components lib proxy.ts` | **3 hits** (ver §3) |
| `ls "app/(dashboard)/mas"` | no existe |

[VERIFIED: las seis corridas esta sesión]

⇒ **El piso que el plan debe afirmar es `-ge 1619`.** (La memoria `canarios-de-reloj-en-la-suite` avisa
que 2 tests fallan a propósito fuera de la ventana [01:00, 23:30] AR; la corrida de hoy fue a las
**16:29** local y salió verde, así que el número es el bueno. Los `4 expected fail` son tests marcados
`fails: true`, no fallas.)

### Las dos trampas del runner, medidas en la config

```ts
// vitest.config.mts:45-55
export default defineConfig({
  plugins: [tsconfigPaths(), react()],
  test: {
    environment: 'node',                    // :48  ← NO hay jsdom
    setupFiles: ['./vitest.setup.ts'],
    projects: [
      { extends: true, test: { name: 'pure', exclude: [...defaultExclude, ...dbSuites] } },
      { extends: true, test: { name: 'db',   include: dbSuites, fileParallelism: false } },
    ],
  },
})
```

[VERIFIED: vitest.config.mts:45-55]

1. **`environment: 'node'`, sin jsdom, sin Testing Library, y el milestone prohíbe paquetes nuevos**
   ⇒ **ningún test de componente o de DOM es escribible en este repo.** No es una limitación a
   sortear: es la restricción que hizo que `panelNavMode` sea una función pura. Todo lo DOM-shaped de
   esta fase se verifica con **sonda headless manual** (documentada en el SUMMARY) o con **grep
   estático**.
2. **El proyecto `db` pega contra el Supabase LOCAL** y corre de a un archivo (`fileParallelism:
   false`). Si el Supabase local está caído, esas suites fallan y el piso de 1619 **no se alcanza** —
   y esta fase no toca la base. Escotilla para el ejecutor: `npx vitest run --project pure` aísla el
   carril paralelo. El verify del plan debería correr la suite completa igual (es el contrato del
   workstream), pero con esta nota para no perder una hora diagnosticando un rojo ajeno.

### Las dos sondas, con su molde probado en este mismo workstream

**(a) Medición de DOM a 375px / 320px.** Chrome está instalado:
`C:\Program Files\Google\Chrome\Application\chrome.exe` [VERIFIED: `ls`].

Receta probada, de la Phase 1 y del quick `260929-g4d`:

> *"la sonda montada en un **iframe de 375px** (⚠ Chrome headless **ignora `--window-size` con
> `--dump-dom`**), con la CSS real compilada desde `app/globals.css` vía `postcss` +
> `@tailwindcss/postcss`"*

[VERIFIED: .planning/workstreams/panel-nav/phases/01-…/01-04-SUMMARY.md:116]

Tooling disponible: `@tailwindcss/postcss@^4` declarado y `postcss@8.5.15` **resoluble**
(transitivo) [VERIFIED: `node -e "require('postcss/package.json').version"` → `8.5.15`]. ⚠ **No hay
binario `postcss` en `node_modules/.bin/`** (sólo `eslint`, `tsc`, `vitest`, `tsconfck`) ⇒ la
compilación de CSS se hace desde un script de node, no desde un CLI. Eso es lo que hizo la Phase 1.

**(b) Diff del markup servido (criterio 2).** Molde del quick `261006-mx6`:

```
curl -s http://localhost/login | grep -o '<form[^>]*>'
```

[VERIFIED: .planning/workstreams/panel-nav/quick/261006-mx6-*/SUMMARY.md:66]

⚠ **El puerto hay que derivarlo, no cablearlo.** `package.json` → `"dev": "next dev"` ⇒ default
**3000**; la sesión de `mx6` corría en **80** (arrancado a mano). [VERIFIED: package.json scripts]
⚠ Para la UAT **desde el celular**: `next.config.ts:53` tiene
`allowedDevOrigins: ["127.0.0.1", "192.168.0.7", "192.168.0.3"]`, con el comentario de que las IPs son
por DHCP y el router **ya cambió la asignación una vez**. Si la IP de la LAN no está en esa lista, el
teléfono pide `_next/*` desde otro origin, Next lo bloquea, **la página no hidrata** y los forms caen
al submit nativo. Es un paso previo de la UAT, no un bug de la fase. [VERIFIED: next.config.ts:38-53]

### Los 14 ítems de §18 del UI-SPEC → qué es automatizable y qué no

| # | Ítem | Automatizable | Cómo |
|---|---|---|---|
| 1 | Labels sin truncar, 4 rubros × 5 fuentes, 375 y 320 | **Sonda** (manual, documentada) | Chrome headless + iframe + CSS real; el eje fuente se fuerza con `data-font` en el `<html>` de la sonda. Afirmable además por **grep estático**: que el label lleve `truncate` |
| 2 | Áreas táctiles ≥44×44 (esperado 75×56) | **Sonda** | `getBoundingClientRect()` de los 5 ítems dentro del iframe de 375 |
| 3 | Zona segura real (franja de gestos pintada) | **MANUAL — iPhone con notch** | Irreducible: el inset vale 0 en Android y en todo emulador headless |
| 4 | `<head>` de los vecinos | **SÍ, y es un gate de bash** | `curl` + `grep -o '<meta name="viewport"[^>]*>'` en `/`, `/<slug>`, `/admin`, `/login` + la línea nueva en `/dashboard` y `/mas` (§1) |
| 5 | Teclado (Android Chrome **y** iOS Safari) | **MANUAL — los dos teléfonos** | Irreducible, y es donde viven los dos riesgos residuales de §2 |
| 6 | Nada tapado (Finanzas, formularios, final de Más) | **Sonda parcial + MANUAL** | La sonda puede medir que el `pb` existe y su valor computado; que el botón de alta de Finanzas sea alcanzable con el pulgar es UAT |
| 7 | Inventario rubro por rubro, los 4 verticales | **SÍ — test puro de vitest** | `buildNavGroups` es **pura** y framework-agnostic ⇒ un test en `environment: 'node'` puede afirmar los 4 inventarios (8/8/8/7) + que el set restado da el complemento exacto. **Es el único candado nuevo de vitest que esta fase puede escribir, y es el que protege el gateo de `canchas`** |
| 8 | Contraste (forjo claro · spa claro/clay · modern claro/amber) | **Calculable** (los hex están en el CSS) + **MANUAL** para los 3 temas con `color-mix` | Los números de §5 del UI-SPEC ya están calculados; la pasada visual confirma la aproximación del `color-mix` |
| 9 | Desktop intacto ≥1024 + banda 768-1023 | **Grep estático** + MANUAL | Que la barra lleve `lg:hidden` y **no** `md:hidden`; que `sidebar.tsx:279` siga `hidden lg:flex` |
| 10 | Un solo menú: ☰, overlay y drawer ya no existen | **SÍ — grep estático** | `grep -c "mobileOpen\|Menu\b" components/dashboard/sidebar.tsx` → 0; y que `Menu`/`X` salgan del import de lucide (`:26-27`) |
| 11 | Historial no tocado | **SÍ — gate de bash (git)** | `git status --porcelain --` + `git log --format=%h -n 1 --` contra los 3 hashes de §5. Y `grep -rE 'pushState\|replaceState\|history\.back'` sobre los componentes nuevos → 0 |
| 12 | Headings y landmarks de `/mas` (1 `h1`, sr-only, 5 `id` resueltos, 2 landmarks con nombres distintos) | **SÍ — grep estático + sonda** | Grep: exactamente un `<h1` en `mas-client.tsx`/`page.tsx` y que lleve `sr-only`; que no haya `<h2`/`<h3`. Sonda/DOM servido: que cada `aria-labelledby` resuelva (`document.getElementById(v) !== null`) — **un `aria-labelledby` roto no tira error, deja el grupo sin nombre en silencio** |
| 13 | Tokens nuevos sin fuga | **SÍ — grep estático** | Arranca de un **0 medido** (arriba) ⇒ el delta es exacto |
| 14 | Pipeline | **SÍ** | Los 4 comandos de abajo |

**La forma de los comandos, ya probada en Windows/Bash en este repo** (no inventar rutas nuevas):

```bash
# suite, con piso
cd "C:/Users/franc/Desktop/Forjo Studio/forjo-app" && OUT=$(npx vitest run 2>&1); RC=$?; echo "$OUT" | tail -20; \
  P=$(echo "$OUT" | grep -oE 'Tests +[0-9]+ passed' | grep -oE '[0-9]+' | tail -1); test "$RC" = "0" && test "$P" -ge 1619

# typecheck — ./node_modules/.bin/tsc, NUNCA `npx tsc` (puede salir 0 en falso)
cd "C:/Users/franc/Desktop/Forjo Studio/forjo-app" && TSC=$(./node_modules/.bin/tsc --noEmit 2>&1 | grep -v '^\.next/' | grep -E "error TS"); echo "$TSC"; test -z "$TSC"

# lint sobre los archivos de la fase
cd "C:/Users/franc/Desktop/Forjo Studio/forjo-app" && ./node_modules/.bin/eslint <files>; test "$?" = "0"

# build
cd "C:/Users/franc/Desktop/Forjo Studio/forjo-app" && OUT=$(npm run build 2>&1); RC=$?; test "$RC" = "0"

# inmutabilidad del mecanismo (criterio 6) — en BASH, no en vitest
cd "C:/Users/franc/Desktop/Forjo Studio/forjo-app" && \
  test -z "$(git status --porcelain -- lib/panel-history.ts lib/overlay-history.ts lib/dirty-history.ts)" && \
  test "$(git log --format=%h -n 1 -- lib/panel-history.ts)"   = "351a53b" && \
  test "$(git log --format=%h -n 1 -- lib/overlay-history.ts)" = "32cf56c" && \
  test "$(git log --format=%h -n 1 -- lib/dirty-history.ts)"   = "351a53b"
```

**Patrón de auditoría estática**, con la regla que la Phase 1 dejó escrita:

> *"El cableado se verifica por REGIÓN recortada (recorte + sinComentarios + guarda de 'no encontró
> nada'), nunca sobre el archivo entero: `clients-client.tsx` tiene ~1400 líneas y una aserción global
> pasaría por casualidad"*

[VERIFIED: .planning/workstreams/panel-nav/STATE.md, `## Decisions`]

⇒ Para afirmar "los 5 `<Link>` de la barra consumen `panelNavMode` y `consumeOwnedPanelEntry` en el
orden de T-5", recortar la región del `<Link>`, sacar comentarios con `sed`, y afirmar el **conteo** —
con guarda de que el recorte encontró algo.

### Lo irreducible

Cinco cosas sólo las ve un teléfono real, y son exactamente las que el ROADMAP pone como método
principal: **(3)** la franja de gestos pintada, **(5)** el teclado en los dos motores, **(6)** que el
botón de alta de Finanzas sea alcanzable, **(8)** la pasada de contraste en los 3 temas con `color-mix`,
y la **UAT de v0.30 repetida desde la barra**. El checkpoint humano **no** se auto-aprueba:
`.planning/config.json` tiene `auto_advance: true` global, pero
`.planning/workstreams/panel-nav/config.json` lo **sobreescribe a `false`**
[VERIFIED: los dos archivos, leídos esta sesión] ⇒ el ROADMAP tiene razón. Con
`human_verify_mode: "end-of-phase"` el checkpoint cae al final de la fase, que es lo correcto acá. Vale
igual la advertencia de la memoria `auto-advance-saltea-uat-visual`: si por cualquier motivo el
override no se aplicara, los `checkpoint:human-verify` se auto-aprueban **sin que nadie abra el
navegador**, y en esta fase eso equivale a no verificar nada de lo irreducible.

---

# Correcciones medidas al upstream

Ocho. Las tres primeras tienen consecuencia para el plan; las otras cinco son de dato.

## C-1 🔴 `T-2` es falso: el repo SÍ usa `env(safe-area-inset-*)`

Tres usos en dos archivos (§3). **Consecuencia:** hay precedente de sintaxis Tailwind v4 **en este
repo** (`whatsapp-float.tsx:36`) y el plan debe espejarlo en vez de inventar la forma. También explica
por qué `mobile-login-hero` y `whatsapp-float` no cambian con esta fase: viven fuera del route group.

## C-2 🔴 `buildNavGroups` no está exportada

Bloquea la regla no-negociable 1 de §11 del UI-SPEC. **Consecuencia:** el plan necesita una tarea
previa de extracción (§6, opción A recomendada). Sin ella, el ejecutor va a reimplementar el filtro —
que es exactamente lo que el ROADMAP prohíbe en su nota de Security/Integrity.

## C-3 🔴 El bloque de identidad de Más **no** es "verbatim": son cuatro cambios

§11 del UI-SPEC dice *"Reusa **verbatim** el markup de `sidebar.tsx:110-129`"* y acto seguido especifica
valores **distintos** de los que ese markup tiene:

| Propiedad | UI-SPEC §11 | `sidebar.tsx:110-129` real | Δ |
|---|---|---|---|
| Logo / fallback | **40×40** | `w-9 h-9` = **36×36** (`:114`, `:116`) | +4px |
| Radio del fallback | `rounded-lg` | `<img>` es `rounded-lg` (`:114`) pero el fallback es **`rounded-md`** (`:116`) | distinto entre sí |
| Nombre | **16px / 600** | `text-sm font-semibold` = **14px / 600** (`:121`) | +2px |
| Línea de plan | **14px / 400** | `text-xs text-muted-foreground` = **12px / 400** (`:122`) | +2px |
| Fuente del fallback | *(no especificada)* | `font-[family-name:var(--font-heading)] font-black text-base` (`:116`) | ver abajo |

[VERIFIED: components/dashboard/sidebar.tsx:110-129]

**Consecuencias, dos:**

1. El plan tiene que escribir esos valores como **cambios deliberados**, no como copia. Si el ejecutor
   copia y pega el markup (que es lo que "verbatim" le pide), entrega 36px y 14px y **nadie lo nota**:
   no lo ve `tsc`, ni la suite, ni el build, y la UAT visual no tiene con qué comparar. Los números del
   UI-SPEC son los que manda el contrato.
2. **Contradicción interna del UI-SPEC, chica y real:** §4 dice *"`--font-heading` **no se usa en esta
   superficie**"*, pero el fallback de inicial que §11 manda reusar **sí** usa `--font-heading`
   (`:116`). O el bloque de identidad renderiza `--font-heading` (y entonces §4 tiene que decirlo), o
   la clase se saca del fallback de Más (y entonces no es verbatim ni se parece al sidebar). **Es una
   decisión de una línea** y no toca O-1/O-2/O-3 — pero hay que tomarla en el plan, no en el editor.
   Recomendación: **conservar `--font-heading`** (el acento de marca de la inicial es el único uso de
   `--primary` de la superficie y conviene que se vea igual que en desktop) y corregir la frase de §4 a
   *"`--font-heading` no se usa en la barra ni en las filas de Más"*.

## C-4 🟡 Las tres filas de `CUENTA` están en **dos** lugares del sidebar, no en el footer

"Ver mi página" es un `<a>` dentro del `<nav>` (`:182-190`), no del footer. M-3 cita `:181-241` y
`:189,197`. Sin consecuencia de diseño; sí para la auditoría de inventario (§6).

## C-5 🟡 El `--font-mono` del eyebrow **no renderiza como mono hoy**

`app/globals.css:22` declara `--font-mono: var(--font-geist-mono)`, y `--font-geist-mono`
**no tiene ninguna declaración**: el conjunto completo de variables de fuente que la app crea está
enumerado en `app/layout.tsx:15-39` y es
`--font-grotesk, --font-archivo, --font-jakarta, --font-cormorant, --font-mulish, --font-orbitron,
--font-chakra, --font-sora, --font-manrope, --font-jetbrains-mono` — **`--font-geist-mono` no está**; y
`grep -rn "geist" app/*.css` devuelve **una sola línea**, la del consumidor (`globals.css:22`).
[VERIFIED: app/layout.tsx:15-42 y app/globals.css:22; `grep` exhaustivo sobre `app/ components/ lib/`]

Consecuencia esperada: `font-[family-name:var(--font-geist-mono)]` —que usa `sidebar.tsx:136` y unos
**50 call sites del CRM**— es una declaración *inválida en tiempo de valor computado*, y `font-family`
**hereda** ⇒ el eyebrow se pinta con `--font-sans`.
[CITED: https://developer.mozilla.org/en-US/docs/Web/CSS/env — comportamiento del fallback ausente;
el mecanismo "invalid at computed-value time" es de CSS Custom Properties] — **marcado [ASSUMED] en el
log: la consecuencia de render no se probó esta sesión.** Probe de un comando para cerrarlo:

```bash
# en la consola del navegador, con el panel abierto
getComputedStyle(document.querySelector('nav[aria-label="Navegación"] p')).fontFamily
# si sale la sans del negocio (Space Grotesk / Jakarta / …) ⇒ el mono nunca pintó
```

**Qué cambia si se confirma, y qué NO cambia:**

- **NO cambia ninguna decisión de diseño.** Más reusa el markup verbatim ⇒ Más y el sidebar siguen
  viéndose idénticos, que es todo lo que §11 regla 3 pide.
- **SÍ cambia dos afirmaciones del contrato:** §4 cuenta **3 familias** por pantalla (heading + sans +
  mono) y §19 C-8 declara la tercera como "deuda heredada que excede el máximo de 2 del proyecto". Si
  el mono no pinta, la pantalla renderiza **2** familias, el conflicto C-8 con el "máximo 2"
  **desaparece**, y el argumento de §7 para **no** clavar la familia del label se vuelve **más**
  fuerte (clavarla iría de 2 a 3, no de 3 a 4).
- **NO hay que arreglarlo en esta fase.** Declarar `--font-geist-mono` cambiaría el render de ~50 call
  sites del CRM de golpe. Es un quick aparte, con su propia UAT visual. Anotado como deuda.

## C-6 🟡 `T-8` / `M-2` dicen que la palabra más larga es "Reservas" — el UI-SPEC ya lo corrigió

El UI-SPEC §7 mide que es **"Pacientes"** (9 chars, peor en las 5 familias) y que el rubro crítico es
**salud**, no canchas. **Confirmo la corrección desde la fuente de los datos**: `salud` es el único
vertical cuyo `clients` es `'Pacientes'` (`verticals.ts:46`) y el único que usa la key `patients` en su
menú (`:58`). La corrección del UI-SPEC es correcta y debe ganarle a T-8/M-2.

## C-7 🟢 Deriva de números de línea (sin consecuencia)

| Citado | Real |
|---|---|
| `extra-types.d.ts:42-53` (ROADMAP H-1) / `:45-53` (UI-SPEC §9) | `ViewportLayout` = **`:45-54`**, `viewportFit` **`:52`**, `interactiveWidget` **`:53`** |
| `sidebar.tsx:43-48` (M-4) | `NAV_GROUPS` = **`:43-49`** |
| `sidebar.tsx:78-88` (ROADMAP, para `buildNavGroups`) | **`:57-86`**, con el `.filter()` en `:85` |
| `(dashboard)/layout.tsx:56` (M-9, para `main`) | **`:57`** — el UI-SPEC §10 ya lo había corregido ✓ |
| `sidebar.tsx:262-267` (T-7, para el drawer) | **`:266-276`** — el UI-SPEC §19 ya lo había corregido ✓ |

## C-8 🟢 `H-1` dice que `interactiveWidget` no está documentado — sí está

Lo **no** documentado es `viewportFit`. `interactiveWidget` aparece en el ejemplo de
`generate-viewport.md:134-147` como *"Also supported but less commonly used"*, **sin declarar su
default** — que es por lo que sigue haciendo falta MDN para el default (§2).

**Dos menores más, de cierre:** §9 del UI-SPEC remite a un **"§20"** que no existe (el documento tiene
§0-§19 + Checker Sign-Off; la verificación vive en **§18**). Y `business.font` **no es un tipo**:
`lib/types.ts:15` es `font?: string | null` y los 6 valores viven en un **comentario** (`:12`)
[VERIFIED: lib/types.ts:1-22] ⇒ el eje "5 familias" es una convención, no una garantía de compilación,
y un valor nuevo puede entrar **sin error de tipos** — exactamente el escenario que el `truncate` de §7
protege, y una razón más para no borrarlo.

---

# Architecture Patterns

## System Architecture Diagram

Flujo de un toque en la barra, y de donde sale cada cosa que se renderiza.

```
                        ┌─────────────────────────────────────────┐
  request /mas  ──────▶ │ proxy.ts (Edge)                         │
                        │  isMaintExempt? → no                    │
                        │  isKnownRoute('/mas')? → NO             │
                        │  ⇒ NextResponse.next()  (sin sesión)    │
                        └──────────────────┬──────────────────────┘
                                           │ (el guard real está abajo)
                        ┌──────────────────▼──────────────────────┐
                        │ app/layout.tsx  (RSC, root)             │
                        │  metadata ✓ · viewport ✗ (no exporta)   │
                        │  ⇒ el default aporta                    │
                        │     width=device-width, initial-scale=1 │
                        └──────────────────┬──────────────────────┘
                                           │  merge POR CLAVE
                        ┌──────────────────▼──────────────────────┐
                        │ app/(dashboard)/layout.tsx  (RSC async) │
                        │  export const viewport = {              │ ◀── EL ÚNICO lugar del cambio
                        │    viewportFit:'cover',                 │     de viewport (§1)
                        │    interactiveWidget:'resizes-visual' } │
                        │  getUser() → !user ⇒ /login   ◀─ GUARD  │
                        │  business por owner_id → vertical       │
                        │  <PaletteScript palette theme font/>    │
                        │  <UnsavedChangesProvider>               │
                        │    <Sidebar business/>  (desktop + barra)│
                        │    <main pt-14 **pb-[…+env(inset)]**>   │ ◀── la reserva de alto, 1 lugar
                        └──────────────────┬──────────────────────┘
                                           │
         ┌─────────────────────────────────┼─────────────────────────────────┐
         ▼                                 ▼                                 ▼
┌────────────────────┐     ┌──────────────────────────┐      ┌──────────────────────────┐
│ page.tsx (RSC)     │     │ PanelBottomNav (client)  │      │ MasPage (RSC)            │
│ de las 13 pantallas│     │  usePathname()           │      │  business por owner_id   │
│  cada una con su h1│     │  useTerminology()        │      │   └▶ MasClient (client)  │
└────────────────────┘     │  5 × <Link>              │      │      useTerminology()    │
                           │   replace=panelNavMode   │      │      buildNavGroups(biz) │
                           │   onNavigate:            │      │       − 5 keys de barra  │
                           │    1º requestNavigation  │      │      <nav "Secciones">   │
                           │    2º consumeOwnedPanel… │      │      8/8/8/7 + CUENTA ×3 │
                           │  lg:hidden · fixed · z-30│      └──────────────────────────┘
                           │  pb-[env(inset-bottom)]  │
                           └────────────┬─────────────┘
                                        │ toque
                      ┌─────────────────▼───────────────────┐
                      │ lib/panel-history.ts  (PURO)        │
                      │  panelNavMode → push | replace      │
                      │  consumeOwnedPanelEntry → back()    │
                      │  ⚠ CERO LÍNEAS NUEVAS (criterio 6)  │
                      └─────────────────────────────────────┘
                   convive, sin tocarse, con overlay-history (frjOverlay)
                   y dirty-history (frjDirty) — cada uno re-verifica SU marca
```

**Lo que el diagrama hace visible:** el cambio de viewport tiene **un** punto de entrada, la reserva de
alto **uno**, la decisión de historial **uno** (y es preexistente), y el inventario del menú **una**
fuente. Si alguno de esos cuatro se duplica, la fase falló aunque los píxeles estén bien.

## Recommended Project Structure

```
app/
├── layout.tsx                        # ← NO SE TOCA (sin viewport export: es lo que acota el radio)
├── globals.css                       # ← EDIT: --panel-nav-h, --panel-nav-muted en :root (:68-70)
├── themes.css                        # ← EDIT: --panel-nav-muted en los 4 bloques (:16,:59,:87,:126)
└── (dashboard)/
    ├── layout.tsx                    # ← EDIT: + export const viewport  ·  + pb en el <main> (:57)
    └── mas/                          # ← NUEVO (la única ruta nueva de la fase)
        ├── page.tsx                  #    RSC: business por owner_id (molde abonos/page.tsx:9-20)
        └── mas-client.tsx            #    'use client': grupos, filas, identidad, firma
components/
└── dashboard/
    ├── nav-groups.ts                 # ← NUEVO (C-2): NAV_GROUPS + buildNavGroups + NavItem
    ├── panel-bottom-nav.tsx          # ← NUEVO: la barra (+ el aviso de MOB-05 en Phase 3)
    ├── panel-top-bar.tsx             # ← NUEVO u EDIT de sidebar.tsx: el header de 2 líneas (§12)
    └── sidebar.tsx                   # ← EDIT: importa nav-groups · se va ☰/overlay/drawer/mobileOpen
lib/
├── panel-history.ts                  # ← INTOCABLE (351a53b)
├── overlay-history.ts                # ← INTOCABLE (32cf56c)
├── dirty-history.ts                  # ← INTOCABLE (351a53b)
├── verticals.ts                      # ← NO SE TOCA (el gateo vive acá)
└── auth/route-lists.ts               # ← NO SE TOCA (§4)
test/
└── panel-nav-groups.test.ts          # ← NUEVO: el único candado de vitest posible (§7, ítem 7)
```

**Nota sobre el header (§12):** hay dos caminos y el plan debe elegir. (a) **Editar el bloque de
`sidebar.tsx:253-258`** in-place: menos archivos, pero `sidebar.tsx` queda siendo el dueño de tres
superficies (desktop, header mobile, barra). (b) **Extraerlo a `panel-top-bar.tsx`**: deja
`sidebar.tsx` como "el sidebar de desktop" y nada más, que es lo que la fase lo convierte. Recomiendo
(b), pero con PC-6 presente: `sidebar.tsx` pierde ~60 de 284 líneas (☰ + overlay + drawer + header),
o sea ~21% — bien por debajo del 80% que habilitaría un `Write`, así que en los dos casos es `Edit`.

## Pattern 1 — El export `viewport` acotado al route group

**What:** declarar las dos claves de viewport en el layout del route group, nunca en el root.
**When to use:** siempre que una capacidad de viewport aplique a un subárbol y no a la app.

```tsx
// app/(dashboard)/layout.tsx — junto al export de metadata que ya existe (:18)
import type { Metadata, Viewport } from 'next'

export const metadata: Metadata = { robots: NOINDEX }

// viewport-fit=cover es lo que hace que env(safe-area-inset-*) deje de valer 0 (§3). Va ACÁ y no en
// el root a propósito: el merge es por clave y de raíz a hoja (resolve-metadata.js:315-347, :834-863),
// y app/layout.tsx no exporta viewport ⇒ /[slug], el landing y el CRM salen con el default intacto.
// interactiveWidget declara el comportamiento que YA está en producción (resizes-visual es el default
// de la plataforma): con el teclado arriba el layout viewport no cambia, así que la barra queda
// DETRÁS del teclado. 'resizes-content' reflowearía el panel e invalidaría las mediciones de los
// cuatro quicks de teclado de octubre (261005-x91, 261005-vuy, 261006-fln, 261006-dzr).
export const viewport: Viewport = {
  viewportFit: 'cover',
  interactiveWidget: 'resizes-visual',
}
```

[Source: `node_modules/next/dist/docs/01-app/03-api-reference/04-functions/generate-viewport.md:25-33` (forma del export) + el runtime citado en §1]

## Pattern 2 — El `<Link>` de la barra: el cableado de historial, replicado sin inventar

**What:** cada destino de la barra repite el contrato de `sidebar.tsx:152,161-164`, en el mismo orden.
**When to use:** todo `<Link>` del chrome de navegación del panel. Sin excepción (hasta `/ayuda` lo
lleva, `sidebar.tsx:204-209`).

```tsx
// components/dashboard/panel-bottom-nav.tsx (extracto)
const active = pathname === item.href

<Link
  href={item.href}
  // Misma regla pura que el sidebar (NAV-05: una sola forma de tocar el historial). NO es `replace`
  // a secas: eso reemplazaría también la entrada de /dashboard y el primer atrás saldría del panel.
  replace={panelNavMode({ from: pathname, to: item.href }) === 'replace'}
  onNavigate={(e) => {
    // ⚠ EL ORDEN ES CONTRATO (T-5). El guard de cambios sin guardar se evalúa PRIMERO: si bloquea,
    // él se hace cargo del diálogo y acá no pasa nada más.
    if (requestNavigation(item.href)) { e.preventDefault(); return }
    // NAV-08 — tocar el destino en el que YA estás cierra la subsección en vez de apilarla encima.
    // history.back() es ASÍNCRONO: hay que PREVENIR la navegación, nunca encadenarla.
    if (active && consumeOwnedPanelEntry()) e.preventDefault()
  }}
  aria-current={active ? 'page' : undefined}
  className={cn(
    'relative flex-1 min-w-0 flex flex-col items-center justify-center gap-1 px-1',
    'transition-colors duration-150 ease-out [-webkit-tap-highlight-color:transparent]',
    'active:bg-secondary',
    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-foreground',
    active ? 'text-foreground' : 'text-[var(--panel-nav-muted)]'
  )}
>
  {active && (
    <span aria-hidden className="absolute top-0 left-1/2 -translate-x-1/2 h-1 w-6 rounded-b-full bg-foreground" />
  )}
  <Icon className="w-6 h-6 flex-shrink-0" />
  <span className={cn('text-[11px] leading-[1.1] truncate', active ? 'font-semibold' : 'font-medium')}>
    {item.label}
  </span>
</Link>
```

⚠ **El `onClick={() => setMobileOpen(false)}` de `sidebar.tsx:153` NO se replica**: muere con el
drawer. Y el `hover:` va dentro de `@media (hover: hover)` (§8 del UI-SPEC) — en Tailwind v4 eso es
`[@media(hover:hover)]:hover:bg-secondary`, **sin espacios**.

## Pattern 3 — Restar la barra del menú, sin reimplementar el filtro

```tsx
// components/dashboard/mas-client.tsx (extracto)
// Las CINCO keys de la barra, no cuatro: `clients` y `patients` son dos keys distintas que apuntan al
// MISMO href (/clients) — sidebar.tsx:73-74. Restar sólo `clients` dejaría "Pacientes" DUPLICADO en
// salud (9 filas en vez de 8), y el síntoma aparecería en un solo rubro.
const EN_LA_BARRA = new Set(['dashboard', 'appointments', 'agenda', 'clients', 'patients'])

// Deriva de buildNavGroups — la MISMA función del sidebar — para que el gateo por rubro se preserve
// POR CONSTRUCCIÓN: si acá se reimplementara el filtro contra resolveVertical(business).menu, un
// negocio de canchas podría ver "Equipo", que es una ruta que no le corresponde.
const grupos = buildNavGroups(business)
  .map(g => ({ ...g, items: g.items.filter(i => !EN_LA_BARRA.has(keyDe(i))) }))
  .filter(g => g.items.length > 0)   // ← PANEL desaparece entero, sin una línea nueva
```

⚠ **Decisión que el plan tiene que tomar:** `NavItem` **no lleva su key** (`{ href, label, icon }`,
`sidebar.tsx:35`), así que `keyDe(i)` no existe. Dos salidas, las dos limpias: (i) restar por **href**
(`new Set(['/dashboard','/appointments','/agenda','/clients'])`) — **cuatro** valores, cero cambio de
tipo, y aprovecha que `clients`/`patients` colapsan al mismo href; (ii) agregar `key: string` a
`NavItem` en `nav-groups.ts`. **Recomiendo (i)**: es menos superficie y hace el bug de las 5 keys
imposible por construcción.

## Anti-Patterns to Avoid

- **Poner el `viewport` en `app/layout.tsx`.** Cambia el `<head>` del landing, de `/[slug]` y del CRM
  y rompe el criterio 2. Está medido que no hace falta (§1).
- **Emitir un `<meta name="viewport">` a mano.** Next ya emite uno desde el default
  (`default-metadata.js:23-32`) ⇒ quedarían dos.
- **Reimplementar el filtro por vertical en Más.** Prohibido por el ROADMAP; rompe el gateo de
  `canchas` (§6).
- **`md:hidden` en la barra.** La banda 768-1023px hoy no tiene sidebar, tiene hamburguesa — y la
  hamburguesa se va. Quedaría **sin ningún menú** (M-5, confirmado: `sidebar.tsx:253` / `:279`).
- **Tocar `components/ui/drawer.tsx`.** Carga el arreglo de teclado de dos quicks (§2).
- **Tocar `lib/auth/route-lists.ts`.** `/mas` quedaría siendo la única ruta del panel tratada distinto
  de sus 9 hermanas, y el archivo documenta con 4 advertencias que ese reflejo rompe en silencio (§4).
- **Escribir el gate de inmutabilidad como test de vitest.** El CI clona a profundidad 1 ⇒ rojo en cada
  push (decisión de la Phase 1, §5).
- **Dejar el drawer "por si acaso".** Riesgo (d) del ROADMAP: dos inventarios que divergen en el
  próximo destino que alguien agregue. El criterio 5 lo cierra.
- **Reservar el alto en cada pantalla.** 13 lugares en vez de 1, y el criterio deja de ser verificable
  de una sola vez.
- **"Arreglar" `--font-geist-mono` de paso.** Cambia el render de ~50 call sites del CRM (C-5).

# Don't Hand-Roll

| Problema | No construir | Usar en su lugar | Por qué |
|---|---|---|---|
| Declarar viewport-fit / interactive-widget | `<meta>` crudo, o `useEffect` que escriba el meta | `export const viewport: Viewport` en `(dashboard)/layout.tsx` | Tipado, con merge por clave probado, y cero meta duplicado (§1) |
| Decidir push vs replace | `<Link replace>` a ojo, o un `if` en el componente | `panelNavMode({ from, to })` (`lib/panel-history.ts:336`) | Son **4** ramas con 4 cicatrices de producción detrás; `replace` a secas saca al dueño del panel |
| Cerrar la subsección al tocar el destino activo | `history.back()` en el `onClick` | `consumeOwnedPanelEntry()` (`:551`) | Dos guardas (marca propia arriba + no-ajena) y `back()` es **asíncrono**: hay que prevenir, no encadenar |
| Avisar de cambios sin guardar | `window.confirm` / `beforeunload` | `useNavigationGuard()` (`unsaved-changes-guard.tsx:293`) | Ya corre el ciclo sentinel en producción, y el atrás llega `cancelable:false` (H-5) |
| Filtrar el menú por rubro | `resolveVertical(business).menu.filter(...)` en Más | `buildNavGroups(business)` | El gateo se preserva por construcción o no se preserva (ROADMAP, Security) |
| Terminología por rubro | `resolveVertical(business)` en el cliente | `useTerminology()` / `useVertical()` | El provider ya envuelve (`layout.tsx:48`); re-resolver abre dos fuentes de verdad |
| Alto de la zona de gestos | Un número cableado (`34px`, `pb-8`) | `env(safe-area-inset-bottom, 0px)` | Es una medida **física del hardware**: 0 en Android con botones, ~34 en iPhone X+ portrait, 44 lateral en landscape |
| Manejo de teclado de la barra | Listener propio de `visualViewport` | La perilla `interactiveWidget` + el listener con guardas que `drawer.tsx:108-116` ya tiene | Dos dueños del mismo evento es el bug que `261005-vuy` arregló |
| El aviso de MOB-05 | Un segundo `<Toaster>` de sonner, o mover `position` | Un `<div>` condicional dentro del componente de la barra (§13) | `position` es una prop evaluada en el render, no es responsiva, y el `<Toaster>` es uno y global (`app/layout.tsx:81`); montar un segundo **ya se descartó** en `261005-vuy` |
| Grupo vacío sin header | Un `if (items.length)` nuevo | El `.filter(g => g.items.length > 0)` que `buildNavGroups` **ya tiene** (`sidebar.tsx:85`) | Cero líneas nuevas |
| Nombre accesible de los grupos de Más | `<section>` con `aria-label` | `role="group"` + `aria-labelledby` al `id` del eyebrow | `<section>` con nombre se vuelve **landmark**; 5 landmarks nuevos son ruido. Precedente: `settings-client.tsx:382,3494` |
| `h1` de `/mas` | Omitirlo, o poner uno visible duplicando el header | `<h1 className="sr-only">Más</h1>` | 5 precedentes verificados en el CRM (§4) |

**Key insight:** en este repo **la navegación ya está resuelta y es frágil**. Tres módulos escriben en
la misma pila del navegador y conviven sólo porque cada uno re-verifica **su** marca justo antes de
cada `back()`. Toda solución casera acá no compite con "escribir menos código": compite con cuatro
quicks de teclado, tres cicatrices documentadas de historial y siete bugs que el dueño encontró en un
teléfono con el pipeline en verde. **El valor de esta fase está en cuánto reusa, no en cuánto escribe.**

---

# Runtime State Inventory

> Esta fase **no** es un rename ni una migración de datos, pero **sí elimina un mecanismo de UI vivo**
> (el drawer hamburguesa) y **agrega una ruta**. Las cinco categorías se responden explícitamente para
> que el planner no tenga que distinguir "investigado y no hay nada" de "no se chequeó".

| Categoría | Encontrado | Acción |
|---|---|---|
| **Datos almacenados** | **Ninguno.** La fase no lee ni escribe ninguna tabla nueva; `/mas` lee `businesses` por `owner_id` igual que las otras 13 pantallas. Cero migraciones (próxima libre **080**) | Ninguna |
| **Config de servicio vivo** | **Ninguno.** Nada en Vercel, Supabase, MercadoPago, Google ni Resend referencia la navegación del panel. No hay cron nuevo | Ninguna |
| **Estado registrado en el OS** | **Ninguno.** Nada de Task Scheduler / pm2 / systemd toca esto | Ninguna |
| **Secretos y env vars** | **Ninguno nuevo.** La fila "Ver mi página" consume `NEXT_PUBLIC_APP_URL` (`sidebar.tsx:183`), que **ya existe** y ya es pública. Cero env vars nuevas ⇒ cero pasos en Vercel | Ninguna |
| **Artefactos de build / instalados** | **Ninguno.** Cero paquetes npm, cero cambios de lockfile. ⚠ **Sí hay un artefacto a regenerar**: `tsconfig.tsbuildinfo` (build incremental) y `.next/` — se resuelven con `npm run build`, sin acción manual | Ninguna |

**La pregunta canónica, respondida:** después de mergear esta fase, **ningún sistema de runtime tiene
el estado viejo cacheado, almacenado ni registrado**. El único "estado viejo" que sobrevive es el
**historial del navegador del dueño** en una pestaña abierta durante el deploy — y ese caso lo cubre la
política vigente: el atrás sobre una entrada que ya no existe navega al pathname, que sigue existiendo.
Nada que migrar.

# Common Pitfalls

### Pitfall 1 — Restar 4 keys en vez de 5 (o restar por key sin agregar `key` a `NavItem`)

**Qué sale mal:** en `salud` Más muestra "Pacientes" además de la barra ⇒ 9 filas en vez de 8, y el
inventario del criterio 4 falla **sólo en un rubro**.
**Por qué pasa:** `clients` y `patients` son dos keys al mismo href (`sidebar.tsx:73-74`), y D-01 habla
de "cuatro destinos", que invita a un set de cuatro strings.
**Cómo evitarlo:** restar por **href** (4 valores) en vez de por key (5). Lo hace imposible.
**Señal temprana:** el test puro de los 4 inventarios (§7, ítem 7) da 9 en salud y 8 en belleza.

### Pitfall 2 — Espacios en un valor arbitrario de Tailwind

**Qué sale mal:** `pb-[calc(var(--panel-nav-h) + env(safe-area-inset-bottom,0px))]` **no genera CSS**.
No hay error: la clase simplemente no existe y el `<main>` queda sin padding ⇒ la barra tapa el último
elemento de cada pantalla, que es literalmente el criterio 3.
**Por qué pasa:** el UI-SPEC escribe los valores como CSS en prosa, con espacios; el §13 incluso tiene
`calc(var(--panel-nav-h) + env(...) + 0.5rem)`.
**Cómo evitarlo:** copiar la forma de `components/landing/whatsapp-float.tsx:36` — sin espacios.
**Señal temprana:** inspeccionar el `<main>` y ver `padding-bottom` ausente; o `grep` en el CSS
compilado.

### Pitfall 3 — Creer que el `<head>` de `/[slug]` tiene que ser byte-idéntico y perder horas

**Qué sale mal:** el verify del criterio 2 da rojo por el título o un preload con hash, y alguien
"arregla" el viewport que estaba bien.
**Por qué pasa:** el head de `/[slug]` lo arma un `generateMetadata` que lee la base
(`app/[slug]/layout.tsx:29`), y en dev hay tags de build.
**Cómo evitarlo:** afirmar **la línea del meta viewport** (§1). Es el único byte que esta fase puede
mover.

### Pitfall 4 — Agregar `/mas` a las listas de auth "por prolijidad"

**Qué sale mal:** cosas silenciosas. El archivo lo documenta con 4 advertencias
(`route-lists.ts:6-18, 59-65, 69-73, 89-95`): *"preguntate en cuál de las CUATRO va, y en cuáles NO
va. Casi nunca va en todas"*, y las dos familias de predicados **matchean distinto** (`startsWith`
pelado vs. por segmento).
**Cómo evitarlo:** no tocar el archivo. El guard real es `(dashboard)/layout.tsx:22-24` y las otras 9
rutas del panel ya funcionan así (§4).

### Pitfall 5 — Declarar `resizes-content` porque "suena mejor para que nada tape nada"

**Qué sale mal:** reflow del panel entero cada vez que se abre el teclado, y las mediciones de los
cuatro quicks de octubre pasan a ser inválidas.
**Cómo evitarlo:** `resizes-visual`, que es el default de la plataforma y el comportamiento ya en
producción (§2).
**Señal temprana:** con el teclado abierto el contenido "salta" y el drawer de alta se recalcula.

### Pitfall 6 — `md:hidden` en la barra

**Qué sale mal:** la banda 768-1023px queda **sin ningún menú** (hoy tiene hamburguesa, no sidebar).
**Cómo evitarlo:** `lg:hidden`, simétrico con `hidden lg:flex` del sidebar (`sidebar.tsx:279`).
**Señal temprana:** abrir el panel a 900px de ancho.

### Pitfall 7 — Copiar el bloque de identidad "verbatim" y entregar 36px / 14px

**Qué sale mal:** el contrato pide 40×40 y 16px/600; el markup real es `w-9 h-9` y `text-sm` (C-3).
Nada en el pipeline lo detecta.
**Cómo evitarlo:** que el PLAN liste los cuatro valores como cambios, con sus clases destino.

### Pitfall 8 — Un `aria-labelledby` que no resuelve

**Qué sale mal:** el grupo queda **sin nombre accesible**, en silencio. No hay error de consola, no
falla `tsc`, no falla la UAT visual.
**Por qué pasa:** el `<p>` del eyebrow de hoy (`sidebar.tsx:136`) **no tiene `id`**; agregárselo en Más
es obligatorio y es el único cambio respecto del verbatim.
**Cómo evitarlo:** derivar los 5 `id` del `section` de `NAV_GROUPS` (minúsculas, sin tilde) y afirmar
en la sonda que `document.getElementById(v) !== null` para cada `[role=group][aria-labelledby]`.

### Pitfall 9 — Dejar la suite en rojo por el Supabase local, no por el cambio

**Qué sale mal:** `npx vitest run` falla en las suites del proyecto `db` y se diagnostica la fase.
**Cómo evitarlo:** si el rojo está en suites DB-backed, `npx vitest run --project pure` lo confirma en
30 segundos. Esta fase no toca la base (§7).

### Pitfall 10 — `npx tsc` en vez de `./node_modules/.bin/tsc`

**Qué sale mal:** `npx tsc` puede salir **0 en falso** (memoria `worktree-nodemodules-y-npx-tsc-traps`).
**Cómo evitarlo:** la forma del §7. Hoy el baseline es **0 errores** medido con el binario local.

# Code Examples

Además de los Patterns 1-3, los dos que faltan.

### El header de dos líneas (§12), conservando posición y capa exactas

```tsx
// Reemplaza el bloque de sidebar.tsx:253-258. Visibilidad, posición, capa y superficie son
// IDÉNTICAS a las de hoy — lo único que cambia es el contenido: se va el ☰, entran las dos líneas.
// Las DOS son <p>: cada pantalla conserva su propio h1 (medido: appointments-client.tsx:273,
// finances-client.tsx:607). Meter un h1 acá rompería la jerarquía de las 13 pantallas.
<div className="lg:hidden fixed top-0 left-0 right-0 z-30 bg-card border-b border-border h-14
                flex items-center px-4
                pl-[calc(1rem+env(safe-area-inset-left,0px))]
                pr-[calc(1rem+env(safe-area-inset-right,0px))]">
  <div className="flex-1 min-w-0 flex flex-col justify-center">
    <p className="text-base font-semibold truncate">{business.name}</p>
    {titulo && (
      <p className="text-[11px] leading-[1.2] font-medium truncate text-[var(--panel-nav-muted)]">
        {titulo}
      </p>
    )}
  </div>
  {/* Slot de acciones: declarado, VACÍO en esta fase. Máximo 2 botones ghost/icon de 44×44, cada uno
      con aria-label verbo+objeto en español. Mover acciones de una pantalla acá está fuera de alcance. */}
  <div className="shrink-0" />
</div>
```

⚠ `titulo` sale del mapa `pathname → label` de §12, derivado del **mismo** `ITEMS`/`terminology` que
`buildNavGroups` ⇒ dice "Pacientes" en salud y "Reservas" en canchas. Y **cuando el pathname no está en
el mapa, la línea 2 no se renderiza** (nunca `undefined`, nunca un hueco). El mapa incluye `/mas` →
`Más` y `/dashboard` → `Inicio` (no "Dashboard": la mitigación de §14 para que dentro de mobile la
palabra sea una sola).

### El test puro de los 4 inventarios — el único candado de vitest que esta fase habilita

```ts
// test/panel-nav-groups.test.ts — environment: 'node', cero jsdom, cero paquetes nuevos.
// Es el candado del gateo por rubro: si Más reimplementara el filtro, o si el set restado cambiara,
// esto se pone rojo ANTES de que un negocio de canchas vea "Equipo".
import { describe, expect, it } from 'vitest'
import { buildNavGroups } from '@/components/dashboard/nav-groups'
import type { Business } from '@/lib/types'

const EN_LA_BARRA = new Set(['/dashboard', '/appointments', '/agenda', '/clients'])
const biz = (vertical: string) => ({ vertical, name: 'X', plan_status: 'trial' } as unknown as Business)

describe('el reparto barra / Más, rubro por rubro', () => {
  it.each([
    ['salud',   12, 8],
    ['belleza', 12, 8],
    ['general', 12, 8],
    ['canchas', 11, 7],   // ← sin 'equipo'
  ])('%s: %i destinos ⇒ %i filas en Más', (v, total, enMas) => {
    const items = buildNavGroups(biz(v)).flatMap(g => g.items)
    expect(items).toHaveLength(total)
    expect(items.filter(i => !EN_LA_BARRA.has(i.href))).toHaveLength(enMas)
    // los 4 destinos de la barra existen en los 4 verticales (D-01 sin excepciones, M-1)
    expect(items.filter(i => EN_LA_BARRA.has(i.href))).toHaveLength(4)
  })

  it('canchas NO expone Equipo', () => {
    const labels = buildNavGroups(biz('canchas')).flatMap(g => g.items).map(i => i.label)
    expect(labels).not.toContain('Equipo')
    expect(labels).toContain('Canchas')   // terminology: services = 'Canchas'
  })

  it('ningún grupo vacío sobrevive (PANEL desaparece al restar la barra)', () => {
    for (const v of ['salud', 'belleza', 'general', 'canchas']) {
      const grupos = buildNavGroups(biz(v))
        .map(g => ({ ...g, items: g.items.filter(i => !EN_LA_BARRA.has(i.href)) }))
        .filter(g => g.items.length > 0)
      expect(grupos.map(g => g.section)).not.toContain('PANEL')
      expect(grupos.every(g => g.items.length > 0)).toBe(true)
    }
  })
})
```

⚠ **Dos advertencias para el ejecutor.** (1) Hay que confirmar cómo `resolveVertical` resuelve el
vertical desde un `Business` parcial (`lib/verticals.ts:127-140` tiene un mapa de tipos legacy); el fake
de arriba asume que `vertical` manda. (2) Este test obliga a que `nav-groups.ts` **no** importe nada de
Next: hoy `buildNavGroups` sólo importa `lucide-react`, `@/lib/types` y `@/lib/verticals`
(`sidebar.tsx:3-32`) ⇒ la extracción deja el módulo testeable en `node`, pero si alguien le suma un
`next/link` ahí, el test muere. Vale un comentario en el archivo.

# State of the Art

| Enfoque viejo | Enfoque actual | Cuándo cambió | Qué implica acá |
|---|---|---|---|
| `export const metadata = { viewport: '...' }` | `export const viewport` / `generateViewport` | Next 14 (deprecado), hay codemod `metadata-to-viewport-export` | Poner `viewport` dentro de `metadata` dispara un **warning de build** explícito: *"Unsupported metadata viewport is configured in metadata export… Please move it to viewport export"* [VERIFIED: resolve-metadata.js:300-304] |
| Hamburguesa + drawer en mobile | Tab bar inferior fija | Patrón de plataforma desde iOS 7 / Material | Es el pedido del dueño (D-01) y la referencia explícita es la app de MercadoPago |
| `100vh` para alto de viewport | `100dvh` / `100svh` | Safari 15.4+, Chrome 108+ | **El UI-SPEC decide NO usarlos**: el `min-h-screen` de hoy se queda y el `pb` es aditivo. Introducir `dvh` sería un cambio de layout fuera de alcance |
| Posicionar a mano con `visualViewport` | `interactiveWidget` en el meta viewport | Chrome 108 (nov 2022), Firefox 133 (Android); WebKit implementado ago-2026, **sin shipear en Safari** al 2026-09-11 | §2: por eso el valor elegido es el que **no** cambia nada |
| Números cableados para la barra de gestos | `env(safe-area-inset-*)` + `viewport-fit=cover` | iOS 11 (iPhone X, 2017) | §3, con precedente en el repo |
| `tailwind.config.js` con `theme.extend` | Tailwind v4 CSS-first: `@theme` + custom properties | Tailwind v4 | `components.json:7` → `"config": ""`. Todo token nuevo va en `globals.css`/`themes.css` |

**Deprecado / desactualizado para esta fase:**

- **`middleware.ts`** → en este repo es **`proxy.ts`** (`.claude/CLAUDE.md`, y `proxy.ts:37` exporta
  `async function proxy`).
- **`viewport` dentro de `metadata`** → ver la tabla.
- **`poolOptions.singleFork` / `singleThread` de Vitest** → *"NO existe en Vitest 4 (verificado: no
  está ni en los tipos ni en el runtime instalado)"* [VERIFIED: vitest.config.mts:33-38]. Si un plan
  necesitara serializar tests, el mecanismo es `fileParallelism` / `maxWorkers`.
- **`vite-tsconfig-paths`** → Vitest 4 avisa en cada corrida que Vite ya resuelve paths nativamente con
  `resolve.tsconfigPaths`. Es ruido conocido, **no** es un error, y **no** es de esta fase.

---

# Assumptions Log

> Todo lo tagueado `[ASSUMED]` en este documento. El planner y discuss-phase usan esta tabla para
> decidir qué necesita confirmación antes de volverse una decisión cerrada. **Nada de la columna
> "framework" o "repo" está acá: eso está leído contra lo instalado.**

| # | Claim | Sección | Riesgo si está mal |
|---|---|---|---|
| **A1** | El eyebrow mono del sidebar **no renderiza en mono hoy** porque `--font-geist-mono` no tiene declaración ⇒ una pantalla del panel muestra **2** familias, no 3. La **ausencia de declaración** está verificada; la **consecuencia de render** no se probó en un navegador esta sesión | C-5 | **Bajo, y no toca diseño.** Si en realidad pintara mono (p. ej. porque algo externo define la variable), §4 y §19 C-8 del UI-SPEC quedan como están y no cambia nada más. Si no pinta —lo esperable— esas dos secciones afirman una familia inexistente. Probe de un comando en C-5. **Ningún plan debe depender de esto**: Más reusa el markup verbatim en los dos casos |
| **A2** | Hay un bug reportado en **iOS 26** donde `visualViewport.offsetTop` no vuelve a 0 al cerrar el teclado ⇒ desalineación persistente de elementos `fixed` | §2 | **Medio, y es riesgo de UAT, no de plan.** Viene de foros vía búsqueda, sin fuente primaria fechada. Si existe, aparece en el punto 5 de §18 (iOS Safari real) y el plan **no puede** mitigarlo desde el código de esta fase. Hay que mirarlo en el iPhone, no diseñar contra él |
| **A3** | iOS Safari **desplaza el layout viewport** para mantener el campo enfocado a la vista, lo que puede hacer que un `fixed` parezca moverse | §2 | **Medio.** Fuente secundaria (artículos técnicos), no spec. No cambia la decisión (`resizes-visual` es la única opción sensata igual), pero es el motivo por el que el punto 5 de §18 **no se puede saltear** |
| **A4** | `interactive-widget` **no shipeó** en Safari al 2026-09-11 | §2 | **Bajo.** Hay **conflicto de fuentes declarado** (un resultado de baja calidad dice iOS 15). Da igual para el plan: por los dos caminos el comportamiento de iOS equivale a `resizes-visual`. Sólo importaría si alguien quisiera `overlays-content`, que está descartado |
| **A5** | `resolveVertical` resuelve el vertical desde un `Business` parcial con sólo `{ vertical }` seteado, lo que hace válido el fake del test de los 4 inventarios | §Code Examples | **Bajo.** `lib/verticals.ts:127-140` tiene un mapa de tipos legacy que no leí en detalle. Si el fake no alcanza, el test se escribe con `type` en vez de `vertical`, o con los 4 `VERTICALS` directo. Es un ajuste de 2 líneas en el ejecutor, no una decisión |
| **A6** | El puerto del dev server para las sondas y el `curl`: `npm run dev` da **3000** por default, pero la sesión de `261006-mx6` corría en **80** | §7 | **Bajo.** Si el plan cablea un puerto, el verify falla con "connection refused" y se pierde tiempo. Mitigación escrita: derivar el puerto |

**Lo que NO es una suposición y conviene decir en voz alta:** el scoping del `viewport` (§1), el default
`resizes-visual` (§2, MDN), la sintaxis `env()` (§3, con precedente en el repo), la ausencia de `/mas`
en las listas de auth (§4), el cableado de historial (§5), los cuatro inventarios (§6) y la línea base
de tests/tsc/lint (§7) están **todos medidos o citados** contra lo instalado en este repo, hoy, en HEAD
`e7f7d7c`.

# Open Questions

### 1. El bloque de identidad: ¿`--font-heading` en el fallback de inicial, sí o no?

- **Lo que sabemos:** `sidebar.tsx:116` usa `font-[family-name:var(--font-heading)] font-black text-base`
  en el fallback. §11 del UI-SPEC manda reusar ese markup "verbatim"; §4 dice que `--font-heading` "no
  se usa en esta superficie". **Se contradicen** (C-3).
- **Lo que no está claro:** cuál de las dos frases gana.
- **Recomendación:** **conservar `--font-heading`** y entender la frase de §4 como "no se usa en la
  barra ni en las filas de Más". Motivo: la inicial es el único uso del acento `--primary` de la
  superficie (§5) y conviene que se vea idéntica a desktop. Es una decisión de **una línea de clase**,
  no reabre O-1/O-2/O-3, y puede cerrarla el planner sin volver a diseño.

### 2. El header: ¿se edita `sidebar.tsx` in-place o se extrae a `panel-top-bar.tsx`?

- **Lo que sabemos:** el bloque es `sidebar.tsx:253-258`; la fase le saca el ☰, el overlay, el drawer y
  el `mobileOpen` (`:93, 254-256, 261-276`), o sea ~60 de 284 líneas (~21%).
- **Lo que no está claro:** si conviene que `sidebar.tsx` siga siendo dueño de tres superficies.
- **Recomendación:** extraer (`panel-top-bar.tsx`), para que `sidebar.tsx` quede siendo exactamente lo
  que MOB-07 protege: el sidebar de desktop. En los dos casos es `Edit`, no `Write` (PC-6).

### 3. ¿`page.tsx` de `/mas` necesita `export const dynamic = 'force-dynamic'`?

- **Lo que sabemos:** `app/[slug]/page.tsx` lo usa a propósito (datos frescos del booking público).
  No verifiqué si las 13 pantallas del dashboard lo declaran o si el `getUser()` con cookies ya las
  hace dinámicas por construcción.
- **Lo que no está claro:** si `/mas` lo necesita.
- **Recomendación:** **espejar lo que haga `app/(dashboard)/abonos/page.tsx`**, que es el molde elegido,
  y no introducir una directiva que sus hermanas no tienen. Leer `abonos/page.tsx` completo antes de
  escribir — es una línea de verificación, no una decisión.

### 4. El aviso de MOB-05: ¿la constante única vive en la barra o en `lib/`?

- **Lo que sabemos:** §13 exige que la duración visible y la ventana lógica sean **el mismo valor desde
  un solo lugar** (`PANEL_EXIT_HINT_MS = 2000`), y que la implementación es Phase 3.
- **Lo que no está claro:** si esta fase ya declara la constante (donde va a vivir el `<div>`) o si la
  Phase 3 la trae entera.
- **Recomendación:** que **esta fase no la declare**. La Phase 3 la necesita del lado del historial
  también, y una constante exportada sin consumidor es basura que el linter no ve. Lo que esta fase sí
  deja listo es el **lugar** (el componente de la barra, con el `bottom-[calc(...)]` ya escrito).

### 5. ¿Qué hace la barra en `/clinical-history`?

- **Lo que sabemos:** `app/(dashboard)/clinical-history/` existe como ruta del route group, pero **no
  está en `NAV_GROUPS`** ni en ningún `menu` de vertical: el comentario de `verticals.ts:56-57` dice
  *"La Historia Clínica vive dentro de la ficha del paciente (sección colapsable), ya no como item de
  menú propio"*. Es la **novena** hermana ausente de las listas de auth (el UI-SPEC enumera 8).
- **Lo que no está claro:** qué muestra la línea 2 del header ahí, y qué ítem queda activo en la barra.
- **Recomendación:** cae en el caso por defecto que §12 ya definió —**la línea 2 no se renderiza**— y
  ningún ítem de la barra queda activo (ningún `href` matchea), lo cual es correcto: no es ninguna de
  las 5 secciones. **No hace falta ninguna regla nueva**; sólo hay que confirmar en la UAT que la barra
  no muestra un activo equivocado y que el header no deja un hueco. Vale un renglón en los recorridos.

# Environment Availability

| Dependencia | Requerida por | Disponible | Versión | Fallback |
|---|---|---|---|---|
| Node.js + npm | build, tests, lint | ✓ | — (sin `.nvmrc`) | — |
| `next` | todo | ✓ | **16.2.7** | — |
| `lucide-react` (con `MoreHorizontal`) | icono de Más | ✓ | **1.17.0** (`MoreHorizontal`, `MoreVertical`, `LayoutGrid` todos presentes, `typeof === 'object'`) | — |
| `vitest` | suite + el test de inventarios | ✓ | **4.1.9** | — |
| `typescript` (binario local) | typecheck | ✓ | `./node_modules/.bin/tsc` presente | ⚠ nunca `npx tsc` |
| `eslint` (binario local) | lint | ✓ | `./node_modules/.bin/eslint` presente | — |
| **Google Chrome** | sonda de DOM a 375/320px | ✓ | `C:\Program Files\Google\Chrome\Application\chrome.exe` | — |
| `@tailwindcss/postcss` + `postcss` | compilar la CSS real para la sonda | ✓ | `^4` declarado · `postcss@8.5.15` resoluble (transitivo) | ⚠ **no hay binario CLI** en `.bin/` ⇒ script de node |
| `curl` | diff del markup servido (criterio 2) | ✓ | disponible en Git Bash | `Invoke-WebRequest` en PowerShell |
| **Dev server** (`npm run dev`) | sonda + `curl` + UAT desde el celular | ✓ | puerto **3000** por default (⚠ A6) | — |
| **Supabase local** | suites del proyecto `db` de vitest | ✓ (hoy verde: 105/105 archivos) | vía Supabase CLI | `npx vitest run --project pure` si está caído |
| **Celular Android + Chrome** | UAT de teclado, zona segura, recorridos | **externo al entorno** | — | **sin fallback**: es el criterio que vale |
| **iPhone + Safari** | UAT de `safe-area-inset-bottom` real (~34px) y del teclado en WebKit | **externo al entorno** | — | **sin fallback**: en Android el inset es 0 y los riesgos A2/A3 no se ven |
| Migraciones / Supabase remoto | — | **no requerido** | — | Cero migraciones (PC-4) |

**Dependencias faltantes sin fallback:**

- **Un iPhone con notch.** Los puntos 3 y 5 de §18 (franja de gestos pintada; teclado en WebKit) y los
  riesgos A2/A3 **sólo** se observan ahí. En Android `env(safe-area-inset-bottom)` vale 0, así que toda
  la mitad "zona segura" de MOB-02 queda sin evidencia. **Esto es un hecho del entorno, no un
  bloqueante del plan**: el plan se ejecuta igual y el checkpoint queda pendiente.

**Dependencias faltantes con fallback:**

- CLI de `postcss`: se compila desde un script de node (es lo que hizo la Phase 1).
- Supabase local caído: `--project pure`.

# Security Domain

> `security_enforcement: true` y `security_asvs_level: 1` en `.planning/config.json` [VERIFIED].

### Categorías ASVS aplicables

| Categoría ASVS | Aplica | Control estándar en esta fase |
|---|---|---|
| V2 Authentication | **no** | La fase no toca login, registro, reset ni OAuth |
| V3 Session Management | **parcial** | `/mas` **no** pasa por `updateSession` del Edge (§4). El control es el `getUser()` del layout (`(dashboard)/layout.tsx:22-24`), que revalida contra Supabase en cada request — el mismo que protege a las otras 9 rutas sin prefijo. **No agregar nada** |
| V4 Access Control | **sí** | Dos controles, los dos por construcción: (1) `/mas` vive **dentro** del route group `(dashboard)` ⇒ hereda el guard de sesión, el rebote a `/onboarding` sin negocio y el corte a `/suspendido`; (2) el gateo por rubro se preserva reusando `buildNavGroups` — nunca reimplementando el filtro |
| V5 Input Validation | **no** | La fase **no lee ningún input del usuario**: cero `searchParams`, cero `params`, cero body. `usePathname()` se compara contra literales. (Esto cambia en la Phase 4, donde el tab **sí** viene de la URL) |
| V6 Cryptography | **no** | Nada |
| V7 Error Handling & Logging | **mínimo** | Una sola rama nueva: `toast.error('No pudimos cerrar la sesión. Probá de nuevo.')` (§14). Sin datos sensibles en el mensaje |
| V8 Data Protection | **no** | Cero tablas nuevas, cero policies, cero migraciones (PC-4). `/mas` lee `businesses` por `owner_id` |
| V14 Configuration | **sí** | El `export const viewport` es un cambio de **configuración de documento con radio**. El control es acotarlo al route group y **probarlo** (criterio 2, §1) — no confiar en la teoría del merge |

### Patrones de amenaza para este stack

| Patrón | STRIDE | Mitigación estándar |
|---|---|---|
| **Más reimplementa el filtro por vertical** ⇒ un negocio de `canchas` ve "Equipo" | Elevation of Privilege (leve) / incoherencia de producto | Reusar `buildNavGroups` (§6) + el **test puro de los 4 inventarios** como candado permanente. No es fuga cross-tenant: el panel resuelve `business` por `owner_id` y el ítem extra sólo mostraría una ruta que, si se visitara, igual filtra por `business_id` |
| **Ruta nueva sin guard de sesión** | Spoofing / broken access control | Vive en `(dashboard)` ⇒ el guard es heredado. Verificable: `curl` a `/mas` sin cookie debe dar el redirect a `/login` |
| **Agregar `/mas` a las listas de auth y romper otra ruta en silencio** | Tampering de configuración | No tocar `route-lists.ts`. `test/proxy-auth-routes.test.ts` es el guardia permanente de esas listas y ya existe |
| **`viewport-fit=cover` filtrándose al booking público** ⇒ contenido bajo el notch en `/[slug]` | Denial of Service (usabilidad) sobre la superficie que **cobra** | Acotado al route group (§1) + el gate de `curl`/`grep` del criterio 2. Es el riesgo (b) del ROADMAP y está cerrado con evidencia de código |
| **Tocar `globals.css`/`themes.css`, compartidos con landing y CRM** | Tampering | Los dos tokens son **nuevos** y nadie más los lee: hoy `grep` da **0 hits** (medido) ⇒ el delta es exacto y auditable (§18.13) |
| **Pérdida de trabajo del dueño** si la barra navegara sin pasar por el guard | Repudiation / pérdida de datos silenciosa | El orden de T-5 es contrato: `requestNavigation` **primero**. Auditado por región recortada (§7) |
| **Un `back()` sobre entrada ajena expulsa al dueño del sitio** | — (cicatriz documentada 3 veces en este repo) | No se escribe historial en esta fase: `consumeOwnedPanelEntry` ya trae sus dos guardas, y los 3 módulos quedan con **cero** diff (gate de git, §5) |
| **"Ver mi página" expone el slug** | Information Disclosure | **No aplica**: `NEXT_PUBLIC_APP_URL` y `business.slug` ya son públicos por definición (la URL del booking). Markup idéntico al de hoy (`sidebar.tsx:182-190`) |

**Veredicto de riesgo:** **bajo**. Superficie autenticada, sin esquema, sin policies, sin queries
nuevas, sin inputs del usuario y sin paquetes. Los dos invariantes a no perder son de **coherencia de
producto** (el gateo por rubro) y de **radio de configuración** (el viewport), y los dos tienen gate
automatizable.

# Sources

### Primarias (HIGH confidence) — leídas contra lo instalado, esta sesión

**Runtime y tipos de Next 16.2.7:**
- `node_modules/next/dist/lib/metadata/default-metadata.js:23-32` — `createDefaultViewport()`
- `node_modules/next/dist/lib/metadata/resolve-metadata.js:315-347` — `mergeViewport` (merge por clave)
- `node_modules/next/dist/lib/metadata/resolve-metadata.js:348-362` — `getDefinedViewport`
- `node_modules/next/dist/lib/metadata/resolve-metadata.js:448-474` — `collectViewport` (por segmento)
- `node_modules/next/dist/lib/metadata/resolve-metadata.js:834-863` — `accumulateViewport`
- `node_modules/next/dist/lib/metadata/resolve-metadata.js:300-304` — warning de `viewport` en `metadata`
- `node_modules/next/dist/lib/metadata/metadata.js:211-248` — `createViewportElements` (orden de claves)
- `node_modules/next/dist/lib/metadata/types/extra-types.d.ts:45-54` — `ViewportLayout`

**Docs instalados (`node_modules/next/dist/docs/`):**
- `01-app/03-api-reference/04-functions/generate-viewport.md:15-19, 25-33, 60-66, 134-147`
- `01-app/03-api-reference/04-functions/generate-metadata.md:1316-1328` — Ordering / Merging
- `01-app/03-api-reference/03-file-conventions/route-groups.md:6-32`
- `01-app/01-getting-started/02-project-structure.md:284-304`

**Repo (archivos abiertos con `Read`/`sed` esta sesión):**
- `app/layout.tsx:11-12, 15-42, 44-47, 63, 81` · `app/(dashboard)/layout.tsx` (completo, 71 líneas)
- `app/[slug]/layout.tsx:29, 111` · `app/(dashboard)/ayuda/page.tsx:46-51` · `app/(dashboard)/abonos/page.tsx:9-45`
- `components/dashboard/sidebar.tsx` (completo, 284 líneas)
- `components/dashboard/unsaved-changes-guard.tsx:74, 293-295`
- `components/palette-script.tsx` (completo) · `components/dashboard/page-eyebrow.tsx` (completo)
- `components/ui/drawer.tsx:52-62, 91-116, 164-188`
- `components/landing/whatsapp-float.tsx:36` · `components/auth/mobile-login-hero.tsx:105, 182`
- `lib/panel-history.ts:146, 166-260, 290-349, 520-557` · `lib/overlay-history.ts:88-122` · `lib/dirty-history.ts:92-104`
- `lib/auth/route-lists.ts` (completo, 125 líneas) · `proxy.ts:6-65`
- `lib/verticals.ts:1-140` · `lib/use-terminology.tsx` (completo) · `lib/types.ts:1-22`
- `app/globals.css:1-30, 61-215, 285-315` · `app/themes.css:16-250`
- `components.json` (completo) · `next.config.ts` (completo) · `vitest.config.mts` (completo) · `package.json` (scripts + deps)

**Artefactos de planificación:**
- `02-UI-SPEC.md` (completo, 1007 líneas) · `ROADMAP.md` (completo) · `REQUIREMENTS.md` (completo) · `STATE.md` (completo)
- `quick/261005-x91-*/SUMMARY.md` · `quick/261005-vuy-*/SUMMARY.md` · `quick/261006-mx6-*/SUMMARY.md:55-90`
- `phases/01-*/01-04-SUMMARY.md:105-135`
- `.planning/config.json` · `.planning/workstreams/panel-nav/config.json`

**Mediciones ejecutadas esta sesión:** `npx vitest run` · `./node_modules/.bin/tsc --noEmit` ·
`./node_modules/.bin/eslint components/dashboard/sidebar.tsx` · `git log --format=%h -n 1 -- <3 archivos>` ·
`git status --porcelain` · `node -e "require('lucide-react')"` · `node -e "require('postcss/package.json')"` ·
greps de `safe-area-inset`, `viewport`, `font-geist-mono`, `panel-nav-*`, `<h1`, `'/mas'`.

### Secundarias (MEDIUM confidence) — documentación oficial de plataforma, traída con WebFetch

- [MDN — `<meta name="viewport">`](https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Elements/meta/name/viewport) — los 3 valores de `interactive-widget` y **cuál es el default**; `viewport-fit=cover`
- [MDN — `env()`](https://developer.mozilla.org/en-US/docs/Web/CSS/env) — cuándo los insets valen 0; el 2º argumento de fallback
- [WebKit — Designing Websites for iPhone X](https://webkit.org/blog/7929/designing-websites-for-iphone-x/) — `viewport-fit` default `auto` ⇒ insetado automático dentro del safe area

### Terciarias (LOW confidence) — búsqueda, marcadas para validación

- [bram.us — WebKit supports interactive-widget… and hopefully Safari will too? (2026-09-11)](https://www.bram.us/2026/09/11/webkit-supports-interactive-widget-and-hopefully-safari-will-too/) — soporte de `interactive-widget` en Safari (**A4**, con conflicto de fuentes declarado)
- [bram.us — Prevent items from being hidden underneath the Virtual Keyboard (2021)](https://www.bram.us/2021/09/13/prevent-items-from-being-hidden-underneath-the-virtual-keyboard-by-means-of-the-virtualkeyboard-api/) — layout viewport vs. visual viewport en iOS con el teclado abierto (**A3**)
- [Intent to Ship: Android OSK resizes visual viewport by default (blink-dev)](https://groups.google.com/a/chromium.org/g/blink-dev/c/ge7xTu-VhJ0) — origen de la perilla en Chrome 108
- [HTMHell — Control the Viewport Resize Behavior on mobile with `interactive-widget`](https://www.htmhell.dev/adventcalendar/2024/4/)
- Foros de Apple sobre `visualViewport.offsetTop` en iOS 26 (**A2**) — sin fuente primaria fechada

# Metadata

**Confidence breakdown:**

| Área | Nivel | Motivo |
|---|---|---|
| Scoping del `viewport` (§1) | **HIGH** | Leído en el runtime instalado (3 funciones + el renderer), no en documentación. La predicción del `<head>` es derivable línea por línea |
| `interactiveWidget` — tipo y valor elegido (§2) | **HIGH** | Tipo verificado; el default citado de MDN; y el argumento decisivo son las mediciones de los 4 quicks, que están en el repo |
| `interactiveWidget` — comportamiento real en iOS (§2) | **MEDIUM** | Fuentes secundarias con conflicto declarado (A3/A4). No cambia la decisión, sí la obligación de UAT |
| `env(safe-area-inset-*)` en Tailwind v4 (§3) | **HIGH** | Hay **precedente compilando en este repo** (`whatsapp-float.tsx:36`), más dos fuentes oficiales para la causalidad |
| Cascada de `--panel-nav-muted` (§3) | **HIGH** | Especificidad + orden de import verificados en los archivos |
| `/mas` y las listas de auth (§4) | **HIGH** | Las 3 listas y los 2 predicados leídos completos; cruzados con los 14 directorios de ruta |
| Forma de una pantalla nueva (§4) | **HIGH** | Molde real (`abonos/page.tsx`) + conteo de `h1` + 5 precedentes de `sr-only` verificados |
| Mecanismo de historial (§5) | **HIGH** | Código citado verbatim; hashes de los 3 módulos fijados; las 4 ramas computadas |
| Inventarios de los 4 verticales (§6) | **HIGH** | **Computados** del cruce `NAV_GROUPS` × `menu` × `ITEMS`, con los valores verbatim; dan 8/8/8/7 exacto |
| `buildNavGroups` no exportada (§6) | **HIGH** | Medido. Es el bloqueante mecánico de la fase |
| Línea base de verificación (§7) | **HIGH** | Las 6 corridas se ejecutaron hoy, en este HEAD |
| Correcciones al upstream (C-1…C-8) | **HIGH**, excepto **C-5** que es **MEDIUM** (ver A1) | Cada una con archivo y línea |

**Research date:** 2026-10-08
**HEAD:** `e7f7d7c`
**Valid until:** ~2026-11-07 (30 días). Se **invalida antes** si: (a) se actualiza `next` (todo §1 y §2
se re-verifica contra el runtime nuevo); (b) alguien agrega un `export const viewport` en
`app/layout.tsx` (rompe el scoping de §1); (c) cambia `NAV_GROUPS` o el `menu` de un vertical (invalida
§6 — y para eso queda el test puro); (d) se declara `--font-geist-mono` (cierra A1/C-5); (e) se toca
alguno de los 3 módulos de historial (invalida los hashes de §5).







