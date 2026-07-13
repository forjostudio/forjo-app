# Phase 1: Reorg de IA + Ayuda - Pattern Map

**Mapped:** 2026-07-05
**Files analyzed:** 6 (5 edit-in-place + 1 create)
**Analogs found:** 6 / 6 (todos tienen analog en el repo)

> Fase **behavior-frozen**: no se inventa ningún patrón nuevo salvo el disclosure `<details>`/`<summary>`
> de la FAQ (zero-install, sin dep nueva). Cada archivo copia un patrón ya existente en el repo.
> NO tocar `lib/verticals.ts` ni el motor de agenda/booking.

## File Classification

| Archivo (edit/create) | Rol | Data Flow | Analog más cercano | Match |
|-----------------------|-----|-----------|--------------------|-------|
| `components/dashboard/sidebar.tsx` (edit) | component (nav client) | request-response (navegación) | `components/crm/crm-sidebar.tsx` | exact (mismo rol + patrón agrupado) |
| `app/(dashboard)/settings/settings-client.tsx` (edit) | component (mega client) | event-driven (tabs client-side) | sí mismo (reasignación interna de `TabsContent` por `view`) | in-place |
| `app/(dashboard)/negocio/page.tsx` (edit) | page (server component) | request-response (fetch + props) | `app/(dashboard)/settings/page.tsx` | exact (misma familia, mismo `SettingsClient`) |
| `app/api/mercadopago/callback/route.ts` (edit) | route handler | request-response (OAuth redirect) | sí mismo (cambiar string de redirect) | in-place |
| `app/api/mercadopago/connect/route.ts` (edit) | route handler | request-response (OAuth redirect) | sí mismo (cambiar string de redirect) | in-place |
| `app/(dashboard)/ayuda/page.tsx` (create) | page (server component) | static-render (array TS local) | header de `settings-client.tsx` L795-805 + `PageEyebrow` | role-match (page estática nueva) |

## Pattern Assignments

### `components/dashboard/sidebar.tsx` (component, nav client) — EDIT

**Analog a espejar:** `components/crm/crm-sidebar.tsx` (NO importarlo — reproducir el patrón; el CRM
no es tenant-scoped y este sidebar sí lo es).

**Qué se conserva del sidebar actual (behavior-frozen):**
- `buildNav(business)` deriva los items desde `resolveVertical(business).menu` (L34-51). El mapeo
  key→{href,label,icon} y la terminología por vertical (`t.clients`, `t.services`, `t.locations`)
  **no cambian**. Los grupos se filtran contra este mismo `menu`.
- Estado activo actual = **`bg-primary text-primary-foreground`** (L100-102). El UI-SPEC ordena
  **mantener este tratamiento**, NO copiar el `bg-secondary`+barra-de-acento del CRM (L117-118 de crm-sidebar).
- Footer behavior-frozen (D-03): "Ver mi página" (L111-119), "Cerrar sesión" (L123-129) y la firma
  "hecho con Forjo Studio" (L131-149) quedan **idénticos**.

**Patrón de agrupado a copiar de `crm-sidebar.tsx`** — estructura de datos (L37-82):
```tsx
type NavGroup = { label: string; items: NavItem[] }
const NAV_GROUPS: NavGroup[] = [
  { label: 'OPERACIÓN', items: [ ... ] },
  ...
]
```
Aplicar la variante data-driven de D-01: array `{ section, keys[] }`, y por cada grupo hacer
`keys.map(k => ITEMS[k]).filter(Boolean)` filtrando contra `v.menu`. Un grupo sin items sobrevivientes
**no renderiza nada** (ni el header).

**Render de grupo a copiar** de `crm-sidebar.tsx` (L173-184) — header mono + items `space-y-0.5`:
```tsx
{NAV_GROUPS.map((group) => (
  <div key={group.label}>
    <p className="px-2 pt-4 pb-1 font-[family-name:var(--font-geist-mono)] text-[11px] tracking-wider uppercase text-muted-foreground">
      {group.label}
    </p>
    <div className="space-y-0.5">
      {group.items.map((item) => ( ...NavLink... ))}
    </div>
  </div>
))}
```

**Grupos LOCKED (D-02 / UI-SPEC §A):** PANEL(`dashboard`) · AGENDA(`appointments`,`agenda`,`clients`/`patients`)
· GESTIÓN(`servicios`,`equipo`,`consultorios`,`negocio`) · REPORTES(`finances`) · AJUSTES(`settings`).
Grupo **MENSAJES excluido**.

**Link Ayuda nuevo (D-07):** en el footer (región de "Cerrar sesión"), icono `HelpCircle` (lucide),
mismo styling de fila que las demás (`flex items-center gap-3 px-3 py-2 rounded-lg text-sm ...`, ver L115),
`href="/ayuda"`. Importar `HelpCircle` en el bloque de `lucide-react` (L11-27).

**Accesibilidad (UI-SPEC §A):** agregar `focus-visible:ring-[3px] focus-visible:ring-ring/50` a las filas
(el sidebar actual no lo tiene; el CRM sí — ver `baseClass` en crm-sidebar L91). `aria-current="page"` en la activa.

---

### `app/(dashboard)/settings/settings-client.tsx` (component, tabs) — EDIT IN-PLACE

**Analog:** el propio archivo. La migración NAV-02 = **reasignar qué `TabsList`/`TabsContent` muestra cada
`view`**. El contenido de cada `<TabsContent>` NO se toca (behavior-frozen).

**Mecanismo de `view` ya existente** (L100, L140-143):
```tsx
type SettingsView = 'config' | 'negocio' | 'servicios' | 'equipo' | 'consultorios'
const SECTION_TAB: Record<string, string> = { negocio: 'business', servicios: 'services', equipo: 'professionals', consultorios: 'locations' }
const isSection = view !== 'config'
const [configTab, setConfigTab] = useState('appearance')
const tabValue = isSection ? SECTION_TAB[view] : configTab
```
Hoy `view="negocio"` → una sola tab `business`. Hay que convertir `negocio` en hub con **su propio
estado de tab** y su propia `TabsList` [Datos · Cobros · Integraciones · Notificaciones/Mails], y
reducir el `TabsList` de `config` a [Apariencia · Seguridad · Suscripción].

**`TabsList` actual de config a REDUCIR** (L807-817) — quitar Cobros/Integraciones/Notificaciones:
```tsx
<Tabs value={tabValue} onValueChange={isSection ? undefined : setConfigTab}>
  {!isSection && (
    <TabsList className="grid grid-cols-3 sm:grid-cols-4 lg:flex lg:flex-wrap w-full lg:w-fit h-auto">
      <TabsTrigger value="appearance">Apariencia</TabsTrigger>
      ... (mantener solo appearance, seguridad, suscripcion) ...
    </TabsList>
  )}
```
**`TabsList` nuevo del hub Negocio** a modelar con esa misma clase responsive
(`grid grid-cols-3 sm:grid-cols-4 lg:flex lg:flex-wrap w-full lg:w-fit h-auto`), triggers:
`business`("Datos del negocio") · `cobros`("Cobros") · `integraciones`("Integraciones") ·
`notificaciones`("Notificaciones/Mails"). Default = `business`.

**`TabsContent` que se MUEVEN (sin editar su cuerpo):** `cobros` (L1511-1549), `integraciones`
(L1552-1596), `notificaciones` (L1599-1635). Estos ya consumen `secrets` (`mpToken` L676 desde
`secrets.mp_access_token`; `resend_*` L704-705; etc.) y `mpConnectEnabled` (L1560). Al mostrarlos bajo
`negocio`, **la page `/negocio` debe pasar `secrets` y `mpConnectEnabled`** (ver siguiente archivo).

**`?mp=` useEffect a REUBICAR (D-06)** — hoy (L145-153) fuerza `setConfigTab('integraciones')` y
`replaceState(..., '/settings')`, asumiendo que Integraciones vive en `/settings`:
```tsx
useEffect(() => {
  const mp = new URLSearchParams(window.location.search).get('mp')
  if (!mp) return
  if (mp === 'connected') toast.success('MercadoPago conectado')
  else if (mp === 'error') toast.error('No se pudo conectar con MercadoPago')
  setConfigTab('integraciones')
  window.history.replaceState(null, '', '/settings')
}, [])
```
Reubicarlo al render del hub Negocio: setear la **tab de Negocio** en `'integraciones'` y
`replaceState(null, '', '/negocio')`. Los redirects del backend pasan a `/negocio?mp=...` (abajo).

**Header ya parametrizado por `view`** (L795-805) — el eyebrow y el `<h1>` ya distinguen `negocio`;
mantener. `PageEyebrow` de `@/components/dashboard/page-eyebrow`.

---

### `app/(dashboard)/negocio/page.tsx` (page, server) — EDIT

**Analog directo:** `app/(dashboard)/settings/page.tsx` (misma familia; ya carga todo lo que las tabs
migradas necesitan).

**Estado actual** (`negocio/page.tsx` L14-23): solo pasa `business`, arrays vacíos y `mpConnectEnabled`.
NO pasa `secrets` → las tabs Cobros/Integraciones/Notificaciones no tendrían los valores del dueño.

**Patrón a copiar de `settings/page.tsx`** (L1-4, L23) — carga de secretos server-side:
```tsx
import { getBusinessSecrets } from '@/lib/business-secrets'
...
const secrets = await getBusinessSecrets(business.id)
...
<SettingsClient business={business} secrets={secrets} mpConnectEnabled={mpConnectConfigured()} view="negocio" ... />
```
Añadir a `negocio/page.tsx`: `getBusinessSecrets(business.id)` y pasar `secrets`. Los arrays de
servicios/profesionales/locations pueden seguir vacíos (el hub Negocio no muestra esas tabs). Mantener
el guard de sesión existente (`getUser()` → `redirect('/login')`; `business` por `owner_id` →
`redirect('/onboarding')`) — patrón multi-tenant estándar del dashboard.

---

### `app/api/mercadopago/callback/route.ts` (route handler) — EDIT L16, L68

**Analog:** el propio archivo. Cambio mecánico de string del redirect.
- L16: `${base}/settings?mp=error` → `${base}/negocio?mp=error`
- L68: `${base}/settings?mp=connected` → `${base}/negocio?mp=connected`
- Actualizar el comentario de cabecera (L7): "Vuelve a **/negocio** con ?mp=connected|error".

No cambia la lógica de state/CSRF, el canje de code, ni el upsert a `business_secrets` (patrón
owner-only RLS intacto).

---

### `app/api/mercadopago/connect/route.ts` (route handler) — EDIT L9

**Analog:** el propio archivo.
- L9: `${base}/settings?mp=error` → `${base}/negocio?mp=error`.

Sin otros cambios (state en cookie, `buildMpAuthUrl` intactos).

---

### `app/(dashboard)/ayuda/page.tsx` (page, server) — CREATE

**Analogs de patrón:** header de `settings-client.tsx` (L795-805) + `PageEyebrow`
(`components/dashboard/page-eyebrow.tsx`). Nuevo disclosure = `<details>`/`<summary>` nativo
(zero-install, NO shadcn Accordion — flag de dep resuelto en UI-SPEC §Registry).

**Estructura:** server component que declara un array TS local
`const FAQ: { pregunta: string; respuesta: string }[] = [...]` (D-08, versionado en git) y lo mapea.

**Header a modelar** sobre L795-805 de settings-client:
```tsx
<div className="space-y-6 max-w-3xl">
  <div>
    <PageEyebrow label="Ayuda" />
    <h1 className="text-2xl font-bold mt-2 font-[family-name:var(--font-heading)]">Ayuda</h1>
    <p className="text-sm text-muted-foreground mt-1">Cómo usar Forjo Gestión</p>
  </div>
  ...
</div>
```

**Disclosure nativo (UI-SPEC §C — contrato exacto):** un `<details className="group ...">` por ítem,
dentro de contenedor `rounded-lg border border-border divide-y divide-border`:
```tsx
<details className="group">
  <summary className="flex items-center justify-between gap-3 px-4 py-3 cursor-pointer select-none list-none font-semibold text-sm hover:bg-secondary/50 focus-visible:ring-[3px] focus-visible:ring-ring/50 rounded-lg [&::-webkit-details-marker]:hidden">
    {pregunta}
    <ChevronDown className="w-4 h-4 text-muted-foreground group-open:rotate-180 transition-transform" />
  </summary>
  <p className="px-4 pb-4 text-sm leading-relaxed text-muted-foreground">{respuesta}</p>
</details>
```
Chevron `lucide ChevronDown`, **nunca** color de acento. Múltiples abiertos permitidos (disclosures
independientes). Draft de 7 preguntas en UI-SPEC §Copywriting L166-173 (Claude redacta, user revisa).

**Segundo acceso (D-07):** link "¿Necesitás ayuda? Ver la guía" → `/ayuda` desde Configuración
(`/settings`) — el planner elige placement (ej. footer de una tab de config).

## Shared Patterns

### Gating por vertical (aislamiento de rubro, NO tocar `verticals.ts`)
**Source:** `components/dashboard/sidebar.tsx` L50 (`v.menu.map(key => ITEMS[key]).filter(Boolean)`).
**Apply to:** el array de grupos del sidebar — cada `keys[]` se filtra contra `resolveVertical(business).menu`.
Es el mismo `.filter(Boolean)` ya usado; solo se aplica por grupo. Grupo vacío → no renderiza.

### Guard de sesión multi-tenant (server components del dashboard)
**Source:** `app/(dashboard)/settings/page.tsx` L8-18 y `negocio/page.tsx` L7-12.
**Apply to:** `negocio/page.tsx` (mantener) y `ayuda/page.tsx` (la ayuda vive dentro del route group
`(dashboard)`; el `layout.tsx` ya provee sesión/chrome — la page de ayuda puede ser estática sin fetch,
pero queda protegida por el layout). No requiere `.eq('business_id', ...)` porque no lee datos de negocio.

### Escritura de secretos owner-only (business_secrets)
**Source:** `mercadopago/callback/route.ts` L55-66 y `settings-client.tsx` L729/767/784.
**Apply to:** nada nuevo — las tabs migradas conservan su lógica. Solo se documenta para que el executor
NO altere el patrón al mover los `TabsContent`.

### Redirect base de OAuth
**Source:** `connect/route.ts` L8 y `callback/route.ts` L9 — `(process.env.NEXT_PUBLIC_APP_URL || 'https://gestion.forjo.studio').replace(/\/$/, '')`.
**Apply to:** ambos route handlers — solo cambia el path `/settings` → `/negocio`, el `base` no se toca.

## No Analog Found

Ninguno. El único elemento sin componente previo (disclosure de FAQ) se resuelve con HTML nativo
`<details>`/`<summary>` estilado con Tailwind, con contrato de interacción completo en UI-SPEC §C.

## Metadata

**Analog search scope:** `components/dashboard/`, `components/crm/`, `app/(dashboard)/settings/`,
`app/(dashboard)/negocio/`, `app/api/mercadopago/`.
**Files scanned:** sidebar.tsx, crm-sidebar.tsx, page-eyebrow.tsx, settings-client.tsx,
negocio/page.tsx, settings/page.tsx, mercadopago/callback/route.ts, mercadopago/connect/route.ts.
**Pattern extraction date:** 2026-07-05
