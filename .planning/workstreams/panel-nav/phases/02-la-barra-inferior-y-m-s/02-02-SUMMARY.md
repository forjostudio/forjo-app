---
phase: "02-la-barra-inferior-y-m-s"
plan: "02"
subsystem: panel-nav
status: complete
tags: [mobile-nav, mas, inventario-por-vertical, a11y, logout, landmarks]
workstream: panel-nav

requires:
  - "components/dashboard/nav-groups.ts — buildNavGroups / NavItem (lo creó 02-01, CERO diff acá)"
  - "components/dashboard/panel-bottom-nav.tsx — el quinto destino apunta a /mas (CERO diff acá)"
  - "lib/panel-history.ts — panelNavMode / consumeOwnedPanelEntry (CERO diff)"
  - "components/dashboard/unsaved-changes-guard.tsx — useNavigationGuard (CERO diff)"
  - "app/(dashboard)/layout.tsx — reserva de alto y VerticalProvider ya montados (CERO diff acá)"
  - "app/layout.tsx — el <Toaster> único y global que muestra el error de logout (CERO diff, hash 962dd6d intacto)"
provides:
  - "app/(dashboard)/mas/page.tsx — la ruta /mas como Server Component, una sola lectura de businesses por owner_id"
  - "app/(dashboard)/mas/mas-client.tsx — MasClient: identidad, los grupos del rubro restando la barra por href, el grupo CUENTA con sus 3 filas y la firma"
  - "el quinto destino de la barra deja de ser un 404 (cierra el único estado intermedio declarado de la fase)"
affects:
  - "components/dashboard/panel-bottom-nav.tsx: su quinto destino ahora resuelve (sin tocar el archivo)"
  - "components/dashboard/sidebar.tsx: su drawer mobile ya es redundante — lo elimina 02-03"

tech-stack:
  added: []
  patterns:
    - "inventario de menú DERIVADO de buildNavGroups con la resta de la barra por HREF (4 valores) y no por key (5): dos items colapsan al mismo destino, así la duplicación es estructuralmente imposible"
    - "agrupación accesible con role=\"group\" + aria-labelledby a un id DERIVADO del section (minúsculas, sin tilde, prefijo mas-grupo-), escrito inline en los dos extremos del vínculo"
    - "dos landmarks de navegación coexistiendo en una pantalla con nombres distintos (Navegación principal / Secciones)"
    - "h1 visualmente oculto (sr-only) cuando el header de la superficie ya nombra la pantalla — patrón con 5 precedentes en el CRM, primero en el panel"
    - "logout con rama de error explícita: si signOut() falla se avisa con toast.error y NO se navega"

key-files:
  created:
    - app/(dashboard)/mas/page.tsx
    - app/(dashboard)/mas/mas-client.tsx
  modified: []

key-decisions:
  - "La resta de la barra se hace por HREF y no por key: clients y patients son dos keys al MISMO /clients, así que un set de cuatro keys dejaría Pacientes duplicado y SÓLO en salud (9 filas en vez de 8). Con cuatro hrefs el bug deja de ser evitable-si-te-acordás y pasa a ser imposible"
  - "El bloque de identidad implementa las CUATRO divergencias deliberadas del contrato (40×40, rounded-lg en logo y fallback, nombre 16px/600, plan 14px/400) contra el markup del sidebar, y cambia de header a TARJETA. Las cuatro quedaron con gate automático de conteo: ninguna vive sólo en prosa"
  - "El fallback de inicial CONSERVA bg-primary y --font-heading: es el único uso del acento de marca de toda la superficie y tiene que verse idéntico al de desktop (cierra la contradicción entre §4 y §11 del UI-SPEC)"
  - "La expresión del id de grupo se escribe INLINE en los dos extremos (el id del eyebrow y el aria-labelledby del div) y NO se centraliza en un helper: con el prefijo en un solo sitio, el único modo de falla que importa —el id puesto en un extremo y no en el otro— se vuelve invisible para cualquier barrido estático"
  - "Los grupos son role=\"group\" y no <section>: un <section> con nombre accesible se vuelve landmark, y cinco landmarks nuevos son ruido para quien navega por landmarks"
  - "Los 24px entre grupos se completan con space-y-2 en el <nav> en vez de tocar el eyebrow: el eyebrow se copia verbatim (cero clase, cero píxel) y ya trae 16px de pt-4, así que los 8px del wrapper son el resto y no un valor suelto"
  - "El logout no navega si signOut() falla: mandar a /login con la sesión viva haría que el proxy rebote al dashboard, que es justo el silencio que el contrato prohíbe en la única salida de mobile"
  - "La fila Ver mi página lleva DOS ExternalLink (20px a la izquierda como todas, 16px a la derecha como excepción única de chevron): es lo que manda el inventario en orden del UI-SPEC §11, donde la fila aparece con la flecha en los dos extremos, y la regla 4 prohíbe iconos nuevos"

requirements-completed: []

coverage:
  - deliverable: "La ruta /mas existe como ruta real del route group (dashboard), con el nombre sin tilde, y resuelve el tenant por owner_id con UNA sola lectura, sin directiva de renderizado dinámico"
    human_judgment: false
    verification:
      - kind: command
        ref: "gate 1 del Task 1: directorio mas=1 · filtro por owner_id=1 · redirect a login=1 · lecturas de tabla=1 · directiva de render=0"
        status: pass
      - kind: command
        ref: "npm run build rc 0 y `/mas` presente en el route list como `ƒ /mas` (server-rendered on demand)"
        status: pass
  - deliverable: "El inventario sale de buildNavGroups restando la barra por HREF (4 valores) y da 8/8/8/7 filas de menú, sin Pacientes duplicado en salud, sin el grupo PANEL y sin Equipo en canchas"
    human_judgment: false
    verification:
      - kind: command
        ref: "gate 2 del Task 1: import del módulo=1 · resolveVertical=0 · ocurrencias de '/clients'=1 · los 4 hrefs presentes"
        status: pass
      - kind: command
        ref: "cómputo directo sobre el módulo puro con tsx (misma resta que el cliente) en los 4 verticales: salud 8 · belleza 8 · general 8 · canchas 7; clientes_en_mas=false y grupo_PANEL=false en los 4; equipo=false sólo en canchas"
        status: pass
  - deliverable: "El bloque de identidad trae los cuatro valores del contrato y conserva el acento de marca y la fuente de títulos"
    human_judgment: false
    verification:
      - kind: command
        ref: "gate 3 del Task 1: 40x40>=1 · restos de 36x36=0 · rounded-lg=5 · restos de rounded-md=0 · bg-primary>=1 · var(--font-heading)>=1 · nombre 16px/600 por combinación en la misma línea=1 · plan 14px en muted=1 · truncada en 12px=0"
        status: pass
  - deliverable: "La semántica: un solo h1 y oculto, sin h2/h3, cada grupo con nombre accesible por aria-labelledby a un id que existe, y los dos landmarks de navegación con nombres distintos"
    human_judgment: false
    verification:
      - kind: command
        ref: "gate 2 del Task 1: h1 totales=1 · h1 oculto=1 · h2/h3=0 · role=group>=1 · aria-labelledby>=1 · prefijo mas-grupo- (dos extremos)=4 · landmark Secciones=1 · landmark de la barra acá=0"
        status: pass
  - deliverable: "Todas las filas que son Link comparten el dialecto de historial del panel, con el guard primero, y el archivo no tiene mutaciones crudas de historial"
    human_judgment: false
    verification:
      - kind: command
        ref: "gate 3 del Task 1: panelNavMode>=1 · consumo>=1 · guard>=1 · guard ANTES del consumo=1 · pushState|replaceState|history.back=0"
        status: pass
  - deliverable: "El grupo CUENTA con sus tres filas (Ayuda cableada, Ver mi página externa y segura con su icono a la derecha, Cerrar sesión como button con el guard y su continuación) y la firma verbatim fuera del nav"
    human_judgment: false
    verification:
      - kind: command
        ref: "gate 1 del Task 2: eyebrow CUENTA=2 · id del grupo=2 · las 3 filas presentes por literal · Ayuda a /ayuda=1 · NEXT_PUBLIC_APP_URL=1 · target=_blank=2 · rel seguro=2 · ExternalLink=3 · guard del logout=1 · signOut=1"
        status: pass
      - kind: command
        ref: "gate 2 del Task 2: firma=1 · link a forjo=1 · formas del SVG=4 · destructive=0"
        status: pass
  - deliverable: "El logout avisa cuando falla, con el copy literal del contrato, y no navega si falló"
    human_judgment: false
    verification:
      - kind: command
        ref: "gate 2 del Task 2: copy del error ('No pudimos cerrar la sesión. Probá de nuevo.')=1 · toast.error=1"
        status: pass
  - deliverable: "Cero diff en los tres módulos de historial y en los otros cuatro intocables; /mas NO se agregó a las listas de rutas de auth"
    human_judgment: false
    verification:
      - kind: command
        ref: "git diff --stat 49fa195..HEAD sobre panel-history/overlay-history/dirty-history: sin salida. Hashes intactos: panel-history=351a53b · overlay-history=32cf56c · dirty-history=351a53b · app/layout=962dd6d · drawer=87ac7ba · route-lists=22d83eb · verticals=9c32ef5. '/mas' en route-lists.ts=0. git diff --stat del plan: sólo los 2 archivos nuevos, 339 inserciones, 0 borrados"
        status: pass
  - deliverable: "El pipeline del repo queda en el piso medido: tsc limpio, eslint rc 0 sobre los dos archivos nuevos, suite 105/1619 y build rc 0"
    human_judgment: false
    verification:
      - kind: command
        ref: "./node_modules/.bin/tsc --noEmit — 0 líneas 'error TS'"
        status: pass
      - kind: command
        ref: "./node_modules/.bin/eslint sobre page.tsx y mas-client.tsx — rc 0, sin hallazgos"
        status: pass
      - kind: command
        ref: "npx vitest run — rc 0 · Test Files 105 passed (105) · Tests 1619 passed | 4 expected fail | 1 skipped (1624)"
        status: pass
      - kind: command
        ref: "npm run build — rc 0, Next.js 16.2.7 compiló en 11.1s"
        status: pass
  - deliverable: "En un celular real: el inventario rubro por rubro contra el drawer de hoy, el nombre largo truncando, el scroll hasta la firma, el logout fallando, las dos pasadas de contraste del eyebrow y los cinco aria-labelledby con el lector de pantalla"
    human_judgment: true
    rationale: "NADIE lo miró todavía en un teléfono — la UAT visual está PENDIENTE. Es irreducible a comando en este repo: Vitest corre en environment:'node', sin jsdom ni Playwright, y ni el ancho de texto ni el árbol de accesibilidad ni el contraste renderizado son medibles acá. Los 9 puntos del human-check del plan quedaron registrados en .planning/WINDOWS.md (entrada 9, kind unrun-verify)."

metrics:
  duration: "35 min"
  started: "2026-10-08T23:30:00Z"
  completed: "2026-10-09T00:05:00Z"
  tasks: 2
  files: 2

actuals:
  tokens: 5279
  tasks: 2
  commits: 2
  plan_head_before: "40be6d60aaca7d4982303036e33996e0fe9f8a7f"
---

# Phase 2 Plan 02: Más es un lugar — la ruta `/mas`, el inventario completo y las tres filas de CUENTA Summary

La pantalla Más existe como ruta real del panel: deriva el inventario del rubro de `buildNavGroups`
restándole la barra **por `href`** (8/8/8/7 filas de menú, medido en los cuatro verticales), le agrega
el grupo `CUENTA` con las tres filas que hoy sólo viven en el drawer que el plan siguiente elimina, y
cierra el 404 que la wave 1 había dejado declarado a propósito en el quinto destino de la barra.

## Accomplishments

1. **`app/(dashboard)/mas/page.tsx`** — Server Component con el molde exacto de `abonos/page.tsx`:
   `createClient()` → `auth.getUser()` → `redirect('/login')` → **una sola** lectura de `businesses`
   con `.eq('owner_id', user.id)` → `redirect('/onboarding')` → monta el cliente. Cero tablas nuevas,
   cero policies, cero migraciones, y **sin** la directiva de renderizado dinámico (la ruta ya es
   dinámica por las cookies que lee `createClient()`, y ninguna de las 13 pantallas la declara).
   El directorio se llama `mas` **sin tilde**: un `/más` viajaría percent-encoded en el historial y
   en `usePathname()`, y la Phase 3 tiene que comparar ese pathname contra un literal.

2. **El inventario, derivado y no escrito.** `buildNavGroups(business)` → `.map` que filtra los items
   cuyo `href` esté en `EN_LA_BARRA` (`/dashboard`, `/appointments`, `/agenda`, `/clients` — **cuatro
   hrefs**) → `.filter` de grupos con al menos un item. El grupo `PANEL` desaparece **entero** por el
   `.filter` que `buildNavGroups` ya traía, sin una línea nueva. El gateo por rubro se preserva por
   construcción: `resolveVertical` no aparece ni una vez en el cliente.

3. **El reparto, computado contra el módulo puro en los cuatro verticales** (no en prosa):

   | Rubro | Filas de menú | Detalle |
   |---|---|---|
   | salud | **8** | Abonos · **Prestaciones** · Equipo · **Consultorios** · Negocio · Mi web · Finanzas · Configuración |
   | belleza | **8** | Abonos · Servicios · Equipo · **Locales** · Negocio · Mi web · Finanzas · Configuración |
   | general | **8** | Abonos · Servicios · Equipo · **Sucursales** · Negocio · Mi web · Finanzas · Configuración |
   | canchas | **7** | Abonos · **Canchas** · **Sedes** · Negocio · Mi web · Finanzas · Configuración — **sin Equipo** |

   En los cuatro: `clientes_en_mas=false` (o sea **`Pacientes` NO aparece duplicado en salud**) y
   `grupo_PANEL=false`. Más las 3 filas de `CUENTA` ⇒ **11 filas** (10 en canchas).

4. **El bloque de identidad con las cuatro divergencias deliberadas** del markup del sidebar: 40×40
   (contra 36), `rounded-lg` en el `<img>` **y** en el fallback (contra `rounded-md`), nombre a
   **16px/600** (contra 14px) y línea de plan a **14px/400** (contra 12px), más el cambio de
   contenedor de header a tarjeta (`bg-card border border-border rounded-lg p-4`). El fallback
   **conserva** `bg-primary`, `--font-heading` y `font-black`. Va fuera del `<nav>` y no es
   clickeable.

5. **La semántica que nadie ve:** un solo `h1`, con el texto `Más` y `sr-only`; cero `h2`/`h3`; cada
   grupo en un `<div role="group" aria-labelledby="mas-grupo-{slug}">` con el `id` en el `<p>` del
   eyebrow —la expresión escrita **inline en los dos extremos** a propósito— y los dos landmarks de
   navegación con nombres distintos (`Secciones` acá, `Navegación principal` en la barra).

6. **El grupo `CUENTA`** al final del `<nav>`: **Ayuda** (`<Link>` con el cableado completo),
   **Ver mi página** (`<a>` a la URL pública en pestaña nueva, con `rel="noopener noreferrer"` y la
   excepción única de chevron: un `ExternalLink` de 16px a la derecha) y **Cerrar sesión**
   (`<button>` con el guard y su propia continuación). Y **fuera** del `<nav>`, la firma reusada
   verbatim del footer del sidebar, SVG de cuatro formas incluido.

7. **La rama de error del logout, que el análogo no tiene:** si `signOut()` rechaza o devuelve error,
   `toast.error('No pudimos cerrar la sesión. Probá de nuevo.')` y **no se navega**. Mandar a `/login`
   con la sesión viva haría que el proxy rebote al dashboard, que es exactamente el silencio que el
   contrato prohíbe en la única salida de mobile. Sin rojo y sin confirmación propia.

## La trampa de las cinco keys, cerrada con evidencia

Restar por key habría dejado `Pacientes` duplicado **sólo en salud** (9 filas en vez de 8), pasando
en los otros tres rubros, en `tsc`, en el build y en cualquier UAT que no abra una cuenta de salud.
Se restó por **href** y se midió: `ocurrencias de '/clients' = 1` en el archivo (dos serían el
síntoma estático de haber restado por key), y el cómputo directo sobre el módulo puro da
`clientes_en_mas=false` en los cuatro verticales. El candado de vitest que lo fija vive en 02-04.

## Tasks Completed

| Task | Nombre | Commit | Archivos |
|---|---|---|---|
| 1 | La ruta `/mas` — identidad, los grupos del rubro restándole la barra, y la semántica | `60d8acc` | `app/(dashboard)/mas/page.tsx` (nuevo), `app/(dashboard)/mas/mas-client.tsx` (nuevo) |
| 2 | El grupo CUENTA y la firma | `c9e44cb` | `app/(dashboard)/mas/mas-client.tsx` |

Diff total del plan (`40be6d6..c9e44cb`): **2 archivos, 339 inserciones, 0 borrados**.

## Pipeline

| Gate | Resultado |
|---|---|
| `./node_modules/.bin/tsc --noEmit` | **rc 0**, cero líneas `error TS` |
| `./node_modules/.bin/eslint "app/(dashboard)/mas/page.tsx" "app/(dashboard)/mas/mas-client.tsx"` | **rc 0**, sin hallazgos |
| `npx vitest run` | **rc 0** · `Test Files 105 passed (105)` · `Tests 1619 passed \| 4 expected fail \| 1 skipped (1624)` |
| `npm run build` | **rc 0** · `✓ Compiled successfully in 11.1s` · **`ƒ /mas` presente en el route list** |
| Cero diff en los 3 módulos de historial | `git diff --stat 49fa195..HEAD` sin salida; los 7 hashes base intactos |
| `/mas` en `lib/auth/route-lists.ts` | **0** ocurrencias (no se tocó el archivo) |

⚠ **`npx tsc` no se usó en ningún momento:** en este repo resuelve a `tsc@2.0.4` del registro, que no
es el compilador y siempre sale 0. Todas las corridas fueron con `./node_modules/.bin/tsc`.

## Deviations from Plan

### 1. [Decisión de implementación, dentro del contrato] Los 24px entre grupos salen del wrapper, no del eyebrow

- **Encontrado durante:** Task 1.
- **El choque:** el plan manda copiar el eyebrow **verbatim** ("cero clase, cero píxel", con `pt-4` =
  16px) y el UI-SPEC §11 pide **24px** entre grupos. Las dos cosas a la vez no entran si el espaciado
  tiene que vivir en el eyebrow.
- **Resolución:** el eyebrow quedó verbatim (sólo se le agregó el `id`, que es el único cambio que el
  contrato autoriza) y los 8px que faltan se pusieron como `space-y-2` en el `<nav>` que envuelve los
  grupos ⇒ 16 + 8 = 24px. Queda comentado en el archivo para que nadie lo lea como un valor suelto.
- **Verificación:** el gate del eyebrow no cambia (sigue siendo el `<p>` verbatim con su `id`); el
  espaciado real es parte de la UAT visual pendiente.

### 2. [Observación de infraestructura, NO del cambio] La suite tuvo dos corridas con un worker caído

- **Encontrado durante:** el gate de la suite del Task 2.
- **Qué pasó:** dos corridas consecutivas de `npx vitest run` salieron **rc 1** con
  `Error: [vitest-pool]: Worker forks emitted error` / `Worker exited unexpectedly`, **0 casos
  fallados** y conteos distintos entre sí (104/105 archivos, 1613 y 1610 casos) — o sea, un fork del
  pool murió y se perdieron los casos del archivo que estaba corriendo.
- **Por qué no es de este plan:** el cambio del Task 2 es JSX en un archivo que **ningún test
  importa**, y el mismo comando había dado verde limpio minutos antes con el Task 1 ya commiteado.
  Las dos corridas siguientes dieron **rc 0 · 105/105 · 1619**, dos veces seguidas.
- **Qué NO se hizo:** no se aflojó el piso, no se ignoró el rc y no se tocó la config del runner. Se
  volvió a correr hasta tener la corrida limpia que el gate exige, y se deja anotado acá porque es un
  flake del pool de forks en Windows que puede volver a aparecer en los planes siguientes.

**Total de desviaciones:** 2 — 1 decisión de implementación dentro del contrato, 1 observación de
infraestructura sin cambio de código. **Impacto:** ninguno sobre el comportamiento ni sobre el
alcance. Cero desviaciones de las Reglas 1-3 (no hubo bugs, ni funcionalidad crítica faltante, ni
bloqueantes) y cero de la Regla 4 (ninguna decisión arquitectónica).

## Authentication Gates

Ninguno. El plan no toca credenciales ni servicios externos.

## Known Stubs

Ninguno nuevo. **Y se cerró uno:** la entrada 7 de `.planning/WINDOWS.md` —*"el 5º destino de la barra
apunta a `/mas`, ruta que todavía no existe: 404 hasta el plan 02-02"*— quedó marcada como `fixed`,
porque es exactamente lo que este plan construyó.

Queda **abierta** la entrada 8 (el `react-hooks/purity` preexistente de
`app/(dashboard)/layout.tsx`), que este plan no toca y que sigue diferida en `deferred-items.md`.

## Threat Flags

Ninguno. El plan agrega **una ruta autenticada** al route group y **una lectura de `businesses` por
`owner_id`** — la misma que ya hacen las otras 13 pantallas. Cero migraciones (próxima libre: 080),
cero policies, cero `GRANT`, cero service role, cero superficie anónima nueva, cero env vars nuevas
(`NEXT_PUBLIC_APP_URL` ya existía y ya era pública) y cero paquetes npm. Los dos `target="_blank"`
viajan con su `rel="noopener noreferrer"`.

## UAT visual — PENDIENTE

**Nadie miró esta pantalla en un teléfono.** Los 9 puntos del `human-check` del plan quedaron sin
correr y están registrados en `.planning/WINDOWS.md` (entrada 9, `kind: unrun-verify`). Lo que falta:

1. Tocar **Más** en la barra: pantalla completa, barra visible, ítem **Más** activo.
2. **El inventario rubro por rubro** (criterio duro de la fase): `salud` 8 filas con **Pacientes
   ausente de Más**, `canchas` 7 **sin Equipo**, idealmente `belleza` y `general` con 8. Sin headers
   de grupo vacíos y sin el grupo `PANEL`. El cómputo ya dio los cuatro números; lo que falta es
   verlos en pantalla contra el drawer de hoy.
3. Las **tres filas de `CUENTA`** en los cuatro rubros, con **Ver mi página** abriendo pestaña nueva.
4. La identidad a **40×40**, nombre a 16px y **el plan** debajo.
5. **Nombre de ≥40 caracteres**: tiene que truncar, no empujar el layout. (Ningún comando de este
   repo puede medir ancho de texto: sin jsdom, sin Playwright.)
6. **Scroll** hasta la firma, alcanzable y no debajo de la barra, con **un solo** scroll.
7. **Cerrar sesión** funcionando, y —si se puede forzar— el aviso de error del logout.
8. Las **dos pasadas de contraste** del eyebrow de grupo: **forjo claro** (peor caso 5.02:1, el único
   tema sin `color-mix`) y **spa claro con paleta `clay`**.
9. Con el **lector de pantalla**: cada fila bajo el nombre de su grupo, y los dos landmarks de
   navegación con nombres distintos. Es lo único que confirma que los cinco `aria-labelledby`
   resuelven de verdad — uno roto no tira error, deja el grupo sin nombre en silencio.

⚠ Paso previo: la IP de la LAN tiene que estar en `allowedDevOrigins` (`next.config.ts`) o la página
no hidrata y los links caen al submit nativo.

## Los 9 supuestos marcados del probe de bordes — siguen abiertos

La fila **8** (`MOB-03 / unclassified`) es la que le tocaba a este plan y sigue **`unresolved`**: el
motor del probe nunca evaluó qué significa "sin filas" ni "sin grupos" para el inventario de Más. Lo
que este plan aporta es cobertura adicional (el reparto 8/8/8/7 computado, las 3 filas de `CUENTA`, el
grupo `PANEL` desapareciendo por el `.filter`), **no** el cierre del supuesto. El verificador que
necesite decidir sobre uno de estos bordes y no encuentre evidencia **se abstiene** (`human_needed`):
no lo infiere del verde de estos gates. La tabla completa de las 9 filas vive en `02-01-PLAN.md`.

## Next

Quedan dos planes en la fase. **Listo para `02-03`** (el header de dos líneas y el borrado de la
superficie mobile del sidebar: ahí desaparece el drawer hamburguesa, que es lo que hace obligatorias
las tres filas de `CUENTA` que este plan acaba de poner). Después, `02-04`: el candado de vitest del
inventario sobre los cuatro verticales, la negación por región del bloque de identidad, el cierre de
MOB-01/02/03/07 y el guion de UAT de la fase completa.

⚠ **Este plan NO marcó requisitos como completos.** MOB-03 lo declaran varios planes de la fase y lo
cierra `02-04` (a la wave 1 le pasó marcarlos y tuvo que revertirlo).

## Self-Check: PASSED

- `app/(dashboard)/mas/page.tsx` — **FOUND** en disco (1537 bytes)
- `app/(dashboard)/mas/mas-client.tsx` — **FOUND** en disco (19577 bytes)
- Commit `60d8acc` — **FOUND** en `git log`
- Commit `c9e44cb` — **FOUND** en `git log`
- Los 9 `acceptance_criteria` del Task 1 y los 11 del Task 2: **re-corridos y en verde** (ver Pipeline)
- `commits` del frontmatter: **MEDIDO** con `git rev-list --count 40be6d6..HEAD` = **2**
