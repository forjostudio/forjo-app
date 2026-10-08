---
phase: "2"
slug: "la-barra-inferior-y-m-s"
workstream: "panel-nav"
milestone: "v0.31 — La navegación mobile del panel"
mapped: "2026-10-08"
---

# Phase 2: La barra inferior y Más — Mapa de patrones

**Mapeado:** 2026-10-08 (HEAD de medición del research: `e7f7d7c`)
**Archivos a crear/modificar:** 10 (5 nuevos · 5 editados)
**Análogos encontrados:** 10 / 10
**Fuentes del inventario:** `02-UI-SPEC.md` (contrato aprobado, `16a5b1c`) + `02-RESEARCH.md` (`139abf0`) + `ROADMAP.md` §Phase 2. **No hay CONTEXT.md** para esta fase (el dueño salteó discuss-phase a propósito).

> **Cómo leer este documento.** Cada archivo nuevo tiene **un** análogo del repo y los **extractos
> concretos con `archivo:línea`** que hay que copiar. Donde el contrato **divergeba propósito** del
> análogo, la divergencia está marcada con ⚠ y con el valor que manda (el del UI-SPEC). Todos los
> análogos citados son **source trackeado por git** (verificado con `git ls-files`): cero rutas de
> mirrors o de `node_modules`.

---

## Clasificación de archivos

| Archivo nuevo/modificado | Rol | Flujo de datos | Análogo más cercano | Calidad del match |
|---|---|---|---|---|
| **NUEVO** `components/dashboard/nav-groups.ts` | utility / config de navegación (puro) | transform (business → grupos) | `components/dashboard/sidebar.tsx:35-86` (el bloque a extraer, tal cual) | **exact** (es un movimiento mecánico, no código nuevo) |
| **NUEVO** `components/dashboard/panel-bottom-nav.tsx` | component (client) | event-driven / request-response de navegación | `components/dashboard/sidebar.tsx:134-180` (el `<Link>` de nav, con `:152` y `:161-164`) | **exact** (mismo rol, mismo cableado de historial) |
| **NUEVO** `components/dashboard/panel-top-bar.tsx` | component (client) | presentacional (pathname → título) | `components/dashboard/sidebar.tsx:253-258` (el header mobile de hoy) | **exact** |
| **NUEVO** `app/(dashboard)/mas/page.tsx` | page / RSC | CRUD de lectura (1 query por `owner_id`) | `app/(dashboard)/abonos/page.tsx:9-20` | **exact** (molde nombrado por el research §4) |
| **NUEVO** `app/(dashboard)/mas/mas-client.tsx` | component (client) | transform + navegación | `components/dashboard/sidebar.tsx:108-246` (identidad + grupos + footer) | **exact** |
| **MOD** `app/(dashboard)/layout.tsx` | layout / RSC | config (export `viewport`) + layout | él mismo: `:18` (export `metadata` ya presente) y `:57` (el `pt-14` que ya reserva el header) | **exact** (patrón in-situ) |
| **MOD** `components/dashboard/sidebar.tsx` | component (client) | — (borrado de superficie mobile) | él mismo | **n/a** |
| **MOD** `app/globals.css` | config / tokens | static CSS | `app/globals.css:68-70` (bloque `:root, [data-theme='forjo']` donde vive `--radius`) | **exact** |
| **MOD** `app/themes.css` | config / tokens | static CSS | `app/themes.css:16, 59, 87, 126` (los 4 bloques de tema ya existentes) | **exact** |
| **NUEVO** `test/panel-nav-groups.test.ts` | test (puro, `environment: 'node'`) | transform | `test/verticals.test.ts:1-45` (puro, import `@/lib/...`) + `test/panel-history-sidebar.test.ts:26-40` (barrido estático de fuente) | **exact** (dos análogos, uno por tipo de aserción) |

**Sintaxis de arbitrary values con `env()`:** análogo transversal a 4 de estos archivos →
`components/landing/whatsapp-float.tsx:36`.

---

## Asignaciones de patrón

### 1. `components/dashboard/nav-groups.ts` (utility pura) — la extracción C-2

**Análogo:** `components/dashboard/sidebar.tsx:35-86` — **se mueve, no se reescribe.**
**Por qué existe este archivo:** `buildNavGroups` **no está exportada** (`function buildNavGroups`,
sin `export`, `:57`) y vive en un archivo `'use client'` (`:1`) ⇒ la regla no-negociable 1 de §11 del
UI-SPEC (*"Más NO reimplementa el filtro"*) **no es ejecutable** sin esto (RESEARCH C-2, 🔴).

**Bloque a mover, verbatim** (`sidebar.tsx:35-49`):

```ts
type NavItem = { href: string; label: string; icon: LucideIcon }

// Grupos LOCKED del sidebar agrupado (D-02 / UI-SPEC §A). […] El agrupado se hace acá y NO en
// lib/verticals.ts: cada key se filtra contra resolveVertical(business).menu, así el gating por rubro
// se preserva automáticamente […] Un grupo sin items sobrevivientes no renderiza nada, ni su header.
const NAV_GROUPS: { section: string; keys: string[] }[] = [
  { section: 'PANEL', keys: ['dashboard'] },
  { section: 'AGENDA', keys: ['appointments', 'agenda', 'abonos', 'clients', 'patients'] },
  { section: 'GESTIÓN', keys: ['servicios', 'equipo', 'consultorios', 'negocio', 'web'] },
  { section: 'REPORTES', keys: ['finances'] },
  { section: 'AJUSTES', keys: ['settings'] },
]
```

**Y la función, verbatim** (`sidebar.tsx:57-86`) — con el `.filter(g => g.items.length > 0)` de `:85`
intacto, que es lo que hace desaparecer el grupo `PANEL` entero **sin escribir una línea nueva**:

```ts
function buildNavGroups(business: Business): { section: string; items: NavItem[] }[] {
  const v = resolveVertical(business)
  const t = v.terminology
  const ITEMS: Record<string, NavItem> = {
    dashboard: { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
    appointments: { href: '/appointments', label: t.appointments, icon: Calendar },
    agenda: { href: '/agenda', label: 'Agenda', icon: CalendarClock },
    abonos: { href: '/abonos', label: 'Abonos', icon: Repeat },
    negocio: { href: '/negocio', label: 'Negocio', icon: Store },
    web: { href: '/web', label: 'Mi web', icon: Globe },
    servicios: { href: '/servicios', label: t.services, icon: Tag },
    equipo: { href: '/equipo', label: 'Equipo', icon: UserCog },
    consultorios: { href: '/consultorios', label: t.locations, icon: MapPin },
    clients: { href: '/clients', label: t.clients, icon: Users },
    patients: { href: '/clients', label: t.clients, icon: Users },   // ← :74 — MISMO href que clients
    finances: { href: '/finances', label: 'Finanzas', icon: BarChart3 },
    settings: { href: '/settings', label: 'Configuración', icon: Settings },
  }
  const menu = new Set(v.menu)
  return NAV_GROUPS
    .map(g => ({
      section: g.section,
      items: g.keys.filter(k => menu.has(k)).map(k => ITEMS[k]).filter(Boolean),
    }))
    .filter(g => g.items.length > 0)
}
```

**Reglas de la extracción (del research §6):**

| Regla | Detalle |
|---|---|
| Qué se exporta | `NAV_GROUPS`, `buildNavGroups` y el tipo `NavItem` — **named exports**, convención del repo para `lib/`/`components` (`export function createAdminClient()`) |
| Firma | **NO cambiarla.** Sigue siendo `(business: Business)`. Pasarla a `(vertical: ResolvedVertical)` tocaría el call site del sidebar, que es el superviviente de desktop (MOB-07) |
| `'use client'` | **El módulo NO lo lleva.** Lo heredan sus dos consumidores, que sí son client |
| Imports que se van con la función | los 13 iconos de `lucide-react` (`sidebar.tsx:10-29`, menos `Menu`, `X`, `ExternalLink`, `HelpCircle`, `LogOut` según qué quede en cada lado), `LucideIcon`, `Business` (`@/lib/types`), `resolveVertical` (`@/lib/verticals`) |
| Alias | siempre `@/components/dashboard/nav-groups` (PC-8) |
| Auditoría | `grep -rn "from '@/components/dashboard/nav-groups'"` debe dar **2 hits** (sidebar + mas-client); 3 si el top-bar también deriva su mapa de títulos de ahí |

🚩 **La trampa más probable de la fase** (research §6): `clients` y `patients` son **dos keys
distintas al mismo `href`** (`sidebar.tsx:73-74`). Restar sólo `clients` deja **"Pacientes"
duplicado en `salud`** (9 filas en vez de 8), y el síntoma aparece **en un solo rubro**.
**Recomendación del research: restar por `href`** (4 valores) y no por key (5).

---

### 2. `components/dashboard/panel-bottom-nav.tsx` (component client, `lg:hidden`)

**Análogo:** `components/dashboard/sidebar.tsx:134-180`.

**Patrón de imports** (`sidebar.tsx:1-33` — recortado a lo que la barra necesita):

```tsx
'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'
import { LayoutDashboard, Calendar, CalendarClock, Users, MoreHorizontal } from 'lucide-react'
import { useNavigationGuard } from '@/components/dashboard/unsaved-changes-guard'
import { consumeOwnedPanelEntry, panelNavMode } from '@/lib/panel-history'
```

⚠ `useRouter`, `createClient`, `getPlanLimits`, `Button`, `useState`, `Menu`, `X` **no** van: son del
drawer y del logout, que no viven en la barra.

**Patrón de consumo de historial — EL CONTRATO (T-5), verbatim de `sidebar.tsx:142,152,161-165`:**

```tsx
const pathname = usePathname()
const requestNavigation = useNavigationGuard()   // :97
const active = pathname === item.href            // :142

<Link
  key={item.href}
  href={item.href}
  // :152 — NO es `replace` a secas: eso reemplazaría también la entrada del dashboard y el primer
  // atrás sacaría del panel. La regla pura vive en lib/panel-history.ts (NAV-05).
  replace={panelNavMode({ from: pathname, to: item.href }) === 'replace'}
  // :161-164 — EL ORDEN ES CONTRATO. 1º el guard de cambios sin guardar (si bloquea, él se hace
  // cargo y acá no pasa nada más); 2º NAV-08, y sólo si el destino es el activo. history.back() es
  // ASÍNCRONO: hay que PREVENIR la navegación, no encadenarla.
  onNavigate={(e) => {
    if (requestNavigation(item.href)) { e.preventDefault(); return }
    if (active && consumeOwnedPanelEntry()) e.preventDefault()
  }}
  aria-current={active ? 'page' : undefined}   // :165
>
```

⚠ **El `onClick={() => setMobileOpen(false)}` de `sidebar.tsx:153` NO se replica**: muere con el
drawer. Es la **única** línea del cableado que no se copia.

**Firmas exactas de las tres piezas que se consumen** (research §5 — **no se tocan**):

```ts
// lib/panel-history.ts:290
export const PANEL_ROOT = '/dashboard'
// lib/panel-history.ts:336-349 — las CUATRO ramas
export function panelNavMode({ from, to, root = PANEL_ROOT }): PanelNavMode {
  if (from === to) return 'replace'
  if (from === root) return 'push'
  if (to === root) return 'push'      // ← la rama que nadie enumeró: /mas → /dashboard EMPUJA
  return 'replace'
}
// lib/panel-history.ts:551-557
export function consumeOwnedPanelEntry(): boolean
// components/dashboard/unsaved-changes-guard.tsx:74
requestNavigation: (href: string | null, proceed?: () => void) => boolean
// :293-295
export function useNavigationGuard()
```

**Patrón de estados y clases** (divergencias **medidas** respecto del análogo, §5/§8 del UI-SPEC):

| Qué | El sidebar hoy (`:166-171`) | La barra (contrato) | Por qué diverge |
|---|---|---|---|
| activo | `bg-primary text-primary-foreground` | `text-foreground` + indicador `h-1 w-6 bg-foreground` | `--primary` no llega a 3:1 vs `--card` en **8 de 40** combinaciones |
| inactivo | `text-muted-foreground` | `text-[var(--panel-nav-muted)]` | `--muted-foreground` falla AA en **5 de 40** sobre `--card` |
| foco | `focus-visible:ring-[3px] focus-visible:ring-ring/50` | `focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-foreground` | `--ring` **es** `--primary` ⇒ invisible en 8 de 40. `ring-inset` obligatorio o se recorta en los ítems del borde |
| hover | `hover:bg-secondary` | `[@media(hover:hover)]:hover:bg-secondary` + `active:bg-secondary` + `[-webkit-tap-highlight-color:transparent]` | en touch un `:hover` queda pegajoso; el `active:` es el feedback táctil, no opcional |

**Clases del contenedor fijo** (research §3, forma que **ya compila** en este repo):

```tsx
<nav
  aria-label="Navegación principal"
  className="lg:hidden fixed bottom-0 left-0 right-0 z-30 bg-card border-t border-border
             pb-[env(safe-area-inset-bottom,0px)]
             pl-[env(safe-area-inset-left,0px)] pr-[env(safe-area-inset-right,0px)]"
>
  <div className="flex h-[var(--panel-nav-h)]"> … </div>
</nav>
```

⚠ `lg:hidden`, **nunca `md:hidden`** (la banda 768-1023px quedaría sin ningún menú — M-5,
confirmado contra `sidebar.tsx:253` / `:279`). `z-30` = exactamente la del header de hoy (`:253`).

**Patrón de comentarios** (PC-9, obligatorio): cabecera densa en español explicando el *por qué*, y
secciones con barras Unicode. Moldes: `sidebar.tsx:37-42` y `sidebar.tsx:147-160`.

---

### 3. `components/dashboard/panel-top-bar.tsx` (component client) — el header de 2 líneas

**Análogo:** `components/dashboard/sidebar.tsx:253-258` — **el header mobile de hoy, verbatim en
superficie, con el ☰ removido y una línea 2 agregada.**

```tsx
// sidebar.tsx:253-258 — HOY
<div className="lg:hidden fixed top-0 left-0 right-0 z-30 bg-card border-b border-border h-14 flex items-center px-4 gap-3">
  <Button variant="ghost" size="icon" onClick={() => setMobileOpen(true)}>
    <Menu className="w-5 h-5" />
  </Button>
  <span className="font-semibold">{business.name}</span>
</div>
```

**Lo que se conserva idéntico:** `lg:hidden fixed top-0 left-0 right-0 z-30 bg-card border-b
border-border h-14 flex items-center px-4`. **El `h-14` no se toca** ⇒ el `pt-14` del `main` tampoco
(§12).
**Lo que cambia:** se va el `<Button>` + `Menu`; el `<span>` pasa a un bloque `flex-1 min-w-0` con
dos `<p>` (nombre 16px/600 `truncate` · sección 11px/500 `--panel-nav-muted` `truncate`), más
`pl-/pr-[env(safe-area-inset-left/right,0px)]` y un slot de acciones `shrink-0` **vacío**.
⚠ **Las dos líneas son `<p>`, ninguna es heading** — el `h1` es de la pantalla, no del header.

**Fuente del título de sección:** el mapa `pathname → label` de §12 del UI-SPEC, derivado de la
**misma** terminología que `buildNavGroups`. Patrón para leerla en cliente sin re-resolver el
vertical (`lib/use-terminology.tsx:22-29`, provider ya montado en `(dashboard)/layout.tsx:48`):

```tsx
// lib/use-terminology.tsx:27-29
export function useTerminology(): VerticalTerminology {
  return useContext(VerticalContext).terminology
}
// call site de referencia: app/(dashboard)/clients/clients-client.tsx:23,227 → useVertical()
```

Pathname no mapeado ⇒ **la línea 2 no se renderiza** (header de una línea, centrada). Nunca
`undefined`, nunca hueco.

**Decisión abierta que el plan debe cerrar** (research §"Nota sobre el header"): (a) editar
`sidebar.tsx:253-258` in-place o (b) extraer a `panel-top-bar.tsx`. El research **recomienda (b)**.
En los dos casos el cambio sobre `sidebar.tsx` es `Edit`, no `Write`: pierde ~60 de 284 líneas
(~21%, muy por debajo del 80% de PC-6).

---

### 4. `app/(dashboard)/mas/page.tsx` (page / RSC)

**Análogo:** `app/(dashboard)/abonos/page.tsx:9-20` — el molde nombrado por el research §4.

```tsx
// app/(dashboard)/abonos/page.tsx:1-20 (recortado al patrón)
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { AbonosClient } from './abonos-client'

export default async function AbonosPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: business } = await supabase
    .from('businesses')
    .select('*')
    .eq('owner_id', user.id)        // ← PC-3: aislamiento por tenant
    .single()

  if (!business) redirect('/onboarding')
  // …
}
```

**Hechos que condicionan la forma (research §4):**

1. El layout **no pasa `business` a `children`** — sólo a `<Sidebar business={business} />`
   (`app/(dashboard)/layout.tsx:56`) ⇒ `/mas/page.tsx` **debe** re-resolverlo. No es duplicación
   evitable: es el patrón de las 13 pantallas.
2. Split obligatorio `page.tsx` + `mas-client.tsx`: las filas necesitan `usePathname()`,
   `useNavigationGuard()` y `panelNavMode`, los tres client-only.
3. **Cero migraciones, cero RLS, cero queries nuevas.** Una sola lectura de `businesses` por
   `owner_id`.
4. **`/mas` NO se agrega a `lib/auth/route-lists.ts`.** Sus 9 hermanas tampoco están y funcionan; el
   guard real es `(dashboard)/layout.tsx:22-24`. El archivo tiene 4 bloques de advertencia de que ese
   reflejo rompe en silencio.
5. La ruta es **`/mas` sin tilde** (un `/más` viajaría `%C3%A1s` en el historial y en `usePathname()`).

**Patrón de comentario de cabecera:** `abonos/page.tsx:6-8` (español, dice qué espeja y por qué el
aislamiento es así).

---

### 5. `app/(dashboard)/mas/mas-client.tsx` (component client)

**Análogo:** `components/dashboard/sidebar.tsx:108-246` — los tres bloques, en orden.

**(a) Bloque de identidad** — `sidebar.tsx:110-129`:

```tsx
<div className="p-5 border-b border-border">
  <div className="flex items-center gap-3">
    {business.logo_url ? (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={business.logo_url} alt={business.name} className="w-9 h-9 rounded-lg object-cover flex-shrink-0" />
    ) : (
      <div className="w-9 h-9 rounded-md flex items-center justify-center bg-primary text-primary-foreground font-[family-name:var(--font-heading)] font-black text-base flex-shrink-0">
        {business.name.charAt(0).toUpperCase()}
      </div>
    )}
    <div className="min-w-0">
      <p className="font-semibold text-sm truncate">{business.name}</p>
      <p className="text-xs text-muted-foreground truncate">
        {business.plan_status === 'active'
          ? `Plan ${getPlanLimits(business.plan || 'basic').name}`
          : (business.type || '')}
      </p>
    </div>
  </div>
</div>
```

🔴 **El UI-SPEC dice "verbatim" pero manda OTROS valores (RESEARCH C-3). Mandan los del contrato:**

| Propiedad | El análogo real | **El contrato (manda)** |
|---|---|---|
| logo / fallback | `w-9 h-9` = 36px (`:114`,`:116`) | **40×40** |
| radio del fallback | `rounded-md` (`:116`), mientras el `<img>` es `rounded-lg` | **`rounded-lg` en los dos** |
| nombre | `text-sm font-semibold` = 14px/600 (`:121`) | **16px / 600** |
| línea de plan | `text-xs` = 12px/400 (`:122`) | **14px / 400** |
| fuente del fallback | `font-[family-name:var(--font-heading)] font-black text-base` | **se conserva** (recomendación del research; §4 del UI-SPEC hay que leerlo como "ni la barra ni las filas") |
| contenedor | `p-5 border-b border-border` | **`bg-card border border-border rounded-lg p-4`** (en Más es una tarjeta, no un header) |

⚠ Si el ejecutor copia y pega, entrega 36px y 14px y **nadie lo nota**: no lo ve `tsc`, ni la suite,
ni el build. Estos 4 números tienen que estar escritos en el PLAN como cambios deliberados.

**(b) Grupos y filas** — `sidebar.tsx:131-180`. El eyebrow de grupo se copia **verbatim** de `:136`:

```tsx
<p className="px-2 pt-4 pb-1 font-[family-name:var(--font-geist-mono)] text-[11px] tracking-wider uppercase text-muted-foreground">
  {group.section}
</p>
```

Con **un solo** cambio: le agrega `id={`mas-grupo-${slug(group.section)}`}` para que el
`aria-labelledby` del `<div role="group">` resuelva (un `aria-labelledby` roto no tira error: deja el
grupo sin nombre, en silencio). Divergencias de la fila respecto del sidebar (§11): `min-h-12`,
`px-3 py-3`, icono `w-5 h-5` (el sidebar usa `w-4 h-4` en `:173`), label 14px/500 `--foreground`,
eyebrow en `--panel-nav-muted`.
⚠ El eyebrow **sigue siendo `<p>`**, no se convierte en `h2` (y `/mas` no introduce `h2`/`h3`).

**Resta de la barra sin reimplementar el filtro** (research Pattern 3):

```tsx
// Las keys de la barra colapsan a CUATRO hrefs: clients y patients apuntan al mismo /clients
// (nav-groups.ts, ex sidebar.tsx:73-74). Restar por href hace imposible el bug de las 5 keys.
const EN_LA_BARRA = new Set(['/dashboard', '/appointments', '/agenda', '/clients'])

const grupos = buildNavGroups(business)
  .map(g => ({ ...g, items: g.items.filter(i => !EN_LA_BARRA.has(i.href)) }))
  .filter(g => g.items.length > 0)   // PANEL desaparece entero, sin una línea nueva
```

**(c) Las 3 filas de `CUENTA` están en DOS lugares del sidebar, no en el footer (RESEARCH C-4):**

| Fila | Dónde está realmente | Extracto |
|---|---|---|
| **Ver mi página** | `sidebar.tsx:182-190` — **DENTRO del `<nav>`**, no en el footer | `<a href={`${process.env.NEXT_PUBLIC_APP_URL}/${business.slug}`} target="_blank" rel="noopener noreferrer">` + `<ExternalLink className="w-4 h-4 flex-shrink-0" />` ⚠ en Más el `ExternalLink` va **a la derecha**, 16px |
| **Ayuda** | `sidebar.tsx:202-214` (footer) | `<Link href="/ayuda">` con el **cableado completo** (`:204-209`): `replace={panelNavMode(...)}` + `onNavigate` con guard + consumo. Su comentario `:197-201` explica por qué no es opcional |
| **Cerrar sesión** | `sidebar.tsx:219-225` (footer) | `<button onClick={() => { if (!requestNavigation('/login', () => void handleLogout())) void handleLogout() }}>` — el guard con su **propia continuación** |
| *(firma)* | `sidebar.tsx:227-245` (footer) | `<div>` + SVG de la marca F + `<a>` a forjo.studio — **se reusa verbatim, SVG incluido** |

⇒ El ejecutor que copie "el footer" **se olvida de Ver mi página**. Y **todas** las filas que son
`<Link>` (las 7/8 del menú **y** Ayuda) llevan el mismo cableado que los ítems de la barra: es el
dialecto único que NAV-05 impone.

**El logout en Más suma una rama que el análogo NO tiene** (`handleLogout`, `sidebar.tsx:99-103`, no
tiene rama de error): `toast.error('No pudimos cerrar la sesión. Probá de nuevo.')`. Patrón de toast:
`sonner` ya montado, `<Toaster>` único y global en `app/layout.tsx:81`.

**Patrón del `h1` oculto** — 5 precedentes reales en el CRM, todos verificados:

```tsx
// app/(crm)/admin/page.tsx:78 · pipeline-client.tsx:214 · negocios-client.tsx:218
// bandeja-client.tsx:194 · planes-client.tsx:27
<h1 className="sr-only">Más</h1>
```

⚠ `/mas` es la **única** pantalla del panel **sin** `PageEyebrow` ni `h1` visible (las otras usan
`<PageEyebrow label=…/>` + `<h1 className="text-2xl font-bold mt-2 font-[family-name:var(--font-heading)]">`,
p. ej. `app/(dashboard)/ayuda/page.tsx:50-51`). Es divergencia **deliberada** del contrato: el plan
tiene que escribirla así para que el ejecutor no "complete el patrón" por reflejo.

**Landmarks:** `<nav aria-label="Secciones">` en Más (espeja `sidebar.tsx:131`
`aria-label="Navegación"`) vs `<nav aria-label="Navegación principal">` en la barra. **Nombres
distintos obligatorios**: en `/mas` los dos coexisten.

---

### 6. `app/(dashboard)/layout.tsx` (MOD — layout RSC)

**Análogo: él mismo.** Dos ediciones, las dos in-situ.

**(a) El export `viewport`** — se suma junto al `metadata` que ya existe (`:1`, `:18`):

```tsx
// app/(dashboard)/layout.tsx:1 (HOY)
import type { Metadata } from 'next'
// :18 (HOY)
export const metadata: Metadata = { robots: NOINDEX }
```

```tsx
// CON LA FASE
import type { Metadata, Viewport } from 'next'

export const viewport: Viewport = {
  viewportFit: 'cover',
  interactiveWidget: 'resizes-visual',
}
```

Por qué acá y no en el root (research §1, leído del runtime instalado): el merge de viewport es
**por clave** partiendo del default (`resolve-metadata.js:315-347`, `:834-863`) y se acumula sobre
**el árbol de ESA ruta** ⇒ `app/layout.tsx`, que **no** exporta viewport, deja landing, `/[slug]` y
CRM intactos. `DashboardLayout` es `async function` (`:20`) ⇒ Server Component ✓. Exportar `metadata`
**y** `viewport` en el mismo segmento es legal; lo prohibido es `viewport` + `generateViewport`.

**(b) La reserva de alto — UN SOLO lugar, la `:57`** (⚠ **no** la `:56`, **no** el
`<div className="p-4 sm:p-6 lg:p-8">` de la `:63`):

```tsx
// app/(dashboard)/layout.tsx:57 — HOY
<main className="lg:pl-60 pt-14 lg:pt-0 min-h-screen">
// CON LA FASE (el pb es ADITIVO; el pt-14 y el min-h-screen NO se tocan)
<main className="lg:pl-60 pt-14 lg:pt-0 min-h-screen pb-[calc(var(--panel-nav-h)+env(safe-area-inset-bottom,0px))] lg:pb-0">
```

El `lg:pb-0` es obligatorio, simétrico al `lg:pt-0` que ya está. Y es donde se monta
`<PanelBottomNav />` (hermano de `<Sidebar business={business} />`, `:56`).

---

### 7. `components/dashboard/sidebar.tsx` (MOD — borrado de la superficie mobile)

**Análogo: él mismo.** `Edit`, nunca `Write` (PC-6: ~21% del archivo).

| Qué se borra | Líneas |
|---|---|
| estado `mobileOpen` | `:93` |
| el `onClick={() => setMobileOpen(false)}` de los dos `<Link>` | `:153`, `:205` |
| header mobile con el ☰ | `:252-258` |
| overlay mobile | `:260-263` |
| drawer mobile | `:265-276` |
| imports `Menu`, `X` de lucide | `:26-27` |
| `useState` (si no queda otro uso) | `:33` |
| `NAV_GROUPS` + `buildNavGroups` + `NavItem` (se van a `nav-groups.ts`) | `:35-49`, `:57-86` |

**Qué queda INTACTO:** el desktop `hidden lg:flex … lg:w-60 … z-20` (`:279-281`) y todo
`sidebarContent` (`:108-248`). Ese es el criterio 5 / MOB-07.
**Gate de "un solo menú" (§18.10):** `grep -c "mobileOpen\|Menu\b" components/dashboard/sidebar.tsx`
→ **0**.

---

### 8. `app/globals.css` + `app/themes.css` (MOD — los 2 tokens nuevos)

**Análogo:** el bloque `:root, [data-theme='forjo']` de `app/globals.css:68-70`, donde ya vive
`--radius`; y los 4 bloques de tema **ya existentes** de `themes.css`.

```css
/* app/globals.css:68-70 — HOY */
:root,
[data-theme='forjo'] {
  --radius: 0.4rem;
  /* + NUEVO */
  --panel-nav-h: 3.5rem;                         /* 56px, un solo lugar (§10) */
  --panel-nav-muted: var(--muted-foreground);    /* default forjo: 5.44 / 5.02 ✓ */
}
```

```css
/* app/themes.css — DENTRO de los bloques que YA existen, no en bloques nuevos:
   [data-theme="modern"] :16 · .dark[data-theme="modern"] :59
   [data-theme="spa"]    :87 · .dark[data-theme="spa"]    :126                      */
[data-theme="spa"]         { --panel-nav-muted: #6b6055; }
.dark[data-theme="spa"]    { --panel-nav-muted: var(--muted-foreground); }
[data-theme="modern"]      { --panel-nav-muted: #5c6578; }
.dark[data-theme="modern"] { --panel-nav-muted: var(--muted-foreground); }
```

**Por qué la cascada funciona** (research §3, verificado): `:root` y `[data-theme="spa"]` tienen la
**misma** especificidad (0,1,0) ⇒ decide el orden de fuente, y `app/layout.tsx:11-12` importa
`globals.css` **y después** `themes.css`. `.dark[data-theme="spa"]` es (0,2,0) ⇒ gana sin depender
del orden. Los tres atributos viven en el **mismo** `<html>` (`components/palette-script.tsx:27-35`
+ `next-themes` con `attribute="class"`).

**Por qué es seguro tocar archivos compartidos con landing y CRM:** los tokens son **nuevos** y nadie
más los lee. Gate con línea base medida: hoy `grep -rn "panel-nav-muted\|panel-nav-h" app components lib`
→ **0 hits**; después, hits **sólo** en los 2 CSS y los componentes nuevos.
⚠ **No hay `tailwind.config`** (PC-7): todo token es custom property, y en un arbitrary value de
Tailwind **el valor no puede tener espacios** (si fuera inevitable, `_`).

---

### 9. `test/panel-nav-groups.test.ts` (NUEVO — el único candado de vitest de la fase)

**Dos análogos, uno por tipo de aserción.**

**(a) Test puro de módulo** — `test/verticals.test.ts:1-6`:

```ts
import { describe, it, expect } from 'vitest'
import { getVerticalLabel, RUBRO_PLACEHOLDERS, type VerticalKey } from '@/lib/verticals'
// describe/it/expect, import desde @/…, SIN Supabase ni creds ⇒ cae solo en el carril `pure`
```

**(b) Barrido estático de fuente** (para lo que es DOM-shaped y no se puede montar) —
`test/panel-history-sidebar.test.ts:26-34`:

```ts
const read = (rel: string) => readFileSync(join(process.cwd(), rel), 'utf8')

/** Borra comentarios JSX, de bloque y de línea, en ese orden. Preserva el `//` de las URLs. */
function sinComentarios(src: string): string {
  return src
    .replace(/\{\s*\/\*[\s\S]*?\*\/\s*\}/g, '')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/[^\n]*/g, '$1')
}
```

⚠ **La regla de honestidad de ese archivo (`:21-24`) es obligatoria:** cada barrido descuenta
comentarios **antes** de afirmar, y afirma **primero que encontró algo** — un recorte vacío (función
renombrada, archivo movido) tiene que **fallar**, no pasar. `sidebar.tsx` está lleno de comentarios
que nombran `push`, `replace` y `preventDefault`.

**Qué afirma el test nuevo** (research §7, ítem 7 — `buildNavGroups` es **pura** y
framework-agnostic): los 4 inventarios resueltos de Más (**8 / 8 / 8 / 7**), que el complemento de
`EN_LA_BARRA` es exacto, y que en **canchas** no aparece `equipo`. Es **el único candado nuevo de
vitest que esta fase puede escribir** y es el que protege el gateo de `canchas`.

**Restricciones del runner** (`vitest.config.mts:45-55`): `environment: 'node'`, **sin jsdom**, sin
Testing Library, y el milestone prohíbe paquetes nuevos ⇒ **ningún test de componente o de DOM es
escribible**. Piso de la suite a afirmar: **`-ge 1619`** (`Test Files 105 passed`). El gate de
inmutabilidad del historial va **en bash, NO en vitest** (el CI clona a profundidad 1).

---

## Patrones compartidos

### S-1 · `env(safe-area-inset-*)` en Tailwind v4 — el precedente que YA compila acá

**Fuente:** `components/landing/whatsapp-float.tsx:36`
**Aplica a:** la barra, el `main` del layout, el header, y el aviso de MOB-05 (Phase 3).

```tsx
className="… bottom-[calc(clamp(16px,4cqw,32px)+env(safe-area-inset-bottom))] …"
```

**Regla:** en un arbitrary value **el valor NO puede tener espacios**; comas y `calc()`/`var()`/
`env()` anidados sí van. ⚠ El §13 del UI-SPEC escribe `calc(var(--panel-nav-h) + env(...) + 0.5rem)`
**con espacios** — como clase **no compila**. La forma correcta:

```tsx
bottom-[calc(var(--panel-nav-h)+env(safe-area-inset-bottom,0px)+0.5rem)]
```

Escotilla de escape por `style` inline, también con precedente:
`components/auth/mobile-login-hero.tsx:105,182`.
**Corolario:** esos 3 usos hoy valen **0** (nada declara `viewport-fit=cover`) y **siguen valiendo 0**
después de la fase: viven fuera del árbol del dashboard. Orden de causalidad: **primero el viewport,
después el CSS**.

### S-2 · El dialecto único de navegación del panel (NAV-05)

**Fuente:** `components/dashboard/sidebar.tsx:152,161-164` (+ `:204-209` para Ayuda)
**Aplica a:** **todo** `<Link>` de chrome de navegación que esta fase escriba — los 5 de la barra y
las 8/9 filas de Más. Las dos únicas excepciones legítimas: `Ver mi página` (`<a target="_blank">`,
`:182-190`) y `Cerrar sesión` (`<button>`, `:219-225`).

### S-3 · `page.tsx` RSC + `*-client.tsx`

**Fuente:** `app/(dashboard)/abonos/page.tsx:9-20` + `abonos-client.tsx:1` (`'use client'` seguido de
cabecera densa en español).
**Aplica a:** `/mas`. `business` se re-resuelve por `owner_id`; la terminología se consume del
provider ya montado (`lib/use-terminology.tsx:22-29`), **nunca** se re-resuelve el vertical en el
cliente.

### S-4 · Comentarios densos en español (PC-9)

**Fuentes:** `sidebar.tsx:37-42` (el *por qué* de `NAV_GROUPS`), `sidebar.tsx:147-160` (el *por qué*
del cableado), `abonos/page.tsx:6-8`, `lib/panel-history.ts:1-40`.
**Aplica a:** los 5 archivos nuevos. Secciones con barras Unicode: `// ── Constants ───────`.

### S-5 · Named exports, alias `@/*`, kebab-case de archivo

`export function` para helpers y componentes; `export default async function` sólo para páginas;
`@/components/...` / `@/lib/...` siempre (PC-8); nombres de archivo en kebab-case.

---

## Sin análogo

Nada de esta fase queda sin análogo. Las dos capacidades **nuevas para el repo** tienen, igual, un
anclaje concreto:

| Capacidad | Rol | Flujo | Anclaje (en lugar de análogo) |
|---|---|---|---|
| `export const viewport` (`viewportFit` / `interactiveWidget`) | config / RSC | — | **Cero usos en el repo** (`grep` → sin salida). Molde: `generate-viewport.md:25-33` + el `export const metadata` que el **mismo archivo** ya tiene (`(dashboard)/layout.tsx:18`). Tipos: `extra-types.d.ts:45-54` (`viewportFit` `:52`, `interactiveWidget` `:53`) |
| Barra inferior fija con indicador de activo | component | event-driven | No hay tab bar en el repo. Todo su cableado sale de `sidebar.tsx` y toda su medida del UI-SPEC §6/§8 |

---

## Prohibiciones (cambian qué análogo es el correcto)

| No tocar | Por qué | Evidencia |
|---|---|---|
| `lib/panel-history.ts` · `lib/overlay-history.ts` · `lib/dirty-history.ts` | **Cero diff** (criterio 6). Los componentes nuevos los **consumen**, no los modifican | gate de bash: `git log --format=%h -n 1 --` → `351a53b` / `32cf56c` / `351a53b` |
| `components/ui/drawer.tsx` | Carga el arreglo de teclado de dos quicks de octubre, con advertencia en `:62` | research §2 |
| `lib/auth/route-lists.ts` | `/mas` quedaría siendo la única ruta tratada distinto de sus 9 hermanas; 4 bloques de advertencia en el archivo | research §4 |
| `lib/verticals.ts` | El gateo por rubro vive ahí y se preserva **por construcción** reusando `buildNavGroups` | research §6 |
| `app/layout.tsx` | Sin `viewport` export es lo que acota el radio del cambio | research §1 |
| `components/ui/drawer.tsx` + `Dialog` como forma de Más | O-1 descarta el panel deslizante; O-3 descarta el modal | UI-SPEC §2 |
| Las 13 pantallas | Lo único que se mueve de una pantalla es el **padding** del §10 | ROADMAP |
| `--font-geist-mono` ("arreglarlo de paso") | Cambiaría el render de ~50 call sites del CRM | research C-5 |
| `md:hidden` en la barra | La banda 768-1023px quedaría sin ningún menú | M-5 |
| Migraciones / paquetes npm / registries | Cero. Próxima migración libre: **080**. `components.json:24` → `"registries": {}` | PC-4 / research |

---

## Metadata

**Alcance de la búsqueda de análogos:** `app/(dashboard)/**`, `app/(crm)/admin/**`,
`components/dashboard/**`, `components/landing/**`, `components/auth/**`, `components/ui/**`,
`lib/**`, `test/**`, `app/*.css`
**Archivos leídos para extraer extractos:** `components/dashboard/sidebar.tsx` (284 líneas, completo),
`app/(dashboard)/layout.tsx` (71, completo), `app/(dashboard)/abonos/page.tsx:1-35`,
`app/(dashboard)/abonos/abonos-client.tsx:1-30`, `components/landing/whatsapp-float.tsx:28-45`,
`app/globals.css:60-80`, `app/themes.css` (4 bloques), `lib/use-terminology.tsx:1-29`,
`test/verticals.test.ts:1-45`, `test/panel-history-sidebar.test.ts:1-40`
**Verificación de source trackeado:** `git ls-files` sobre los 10 análogos → los 10 trackeados;
cero rutas de mirror
**Fecha de extracción:** 2026-10-08
