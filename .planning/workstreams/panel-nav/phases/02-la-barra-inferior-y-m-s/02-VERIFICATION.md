---
phase: 02-la-barra-inferior-y-m-s
verified: 2026-10-09T23:35:00Z
status: passed
score: 6/6 criterios de éxito verificados
covered_files:
  - ".planning/workstreams/panel-nav/REQUIREMENTS.md"
  - ".planning/workstreams/panel-nav/phases/02-la-barra-inferior-y-m-s/02-01-PLAN.md"
  - ".planning/workstreams/panel-nav/phases/02-la-barra-inferior-y-m-s/02-01-SUMMARY.md"
  - ".planning/workstreams/panel-nav/phases/02-la-barra-inferior-y-m-s/02-02-PLAN.md"
  - ".planning/workstreams/panel-nav/phases/02-la-barra-inferior-y-m-s/02-02-SUMMARY.md"
  - ".planning/workstreams/panel-nav/phases/02-la-barra-inferior-y-m-s/02-03-PLAN.md"
  - ".planning/workstreams/panel-nav/phases/02-la-barra-inferior-y-m-s/02-03-SUMMARY.md"
  - ".planning/workstreams/panel-nav/phases/02-la-barra-inferior-y-m-s/02-04-PLAN.md"
  - ".planning/workstreams/panel-nav/phases/02-la-barra-inferior-y-m-s/02-04-SUMMARY.md"
  - ".planning/workstreams/panel-nav/phases/02-la-barra-inferior-y-m-s/02-GAP-FIX-2.md"
  - ".planning/workstreams/panel-nav/phases/02-la-barra-inferior-y-m-s/02-GAP-FIX.md"
  - ".planning/workstreams/panel-nav/phases/02-la-barra-inferior-y-m-s/02-UAT.md"
  - "app/(dashboard)/clients/clients-client.tsx"
  - "app/(dashboard)/clinical-history/clinical-history-client.tsx"
  - "app/(dashboard)/layout.tsx"
  - "app/(dashboard)/mas/mas-client.tsx"
  - "app/(dashboard)/mas/page.tsx"
  - "app/(dashboard)/web/web-client.tsx"
  - "app/globals.css"
  - "app/themes.css"
  - "components/dashboard/nav-groups.ts"
  - "components/dashboard/panel-bottom-nav.tsx"
  - "components/dashboard/panel-top-bar.tsx"
  - "components/dashboard/sidebar.tsx"
  - "test/panel-nav-chrome.test.ts"
  - "test/panel-nav-groups.test.ts"
covered_digest: "v1:sha256:27a01d839205c1cbcf5dcdb8d5b33a48b9cf644eb425dd6f794f02b198b89ee6"
behavior_unverified: 0
overrides_applied: 0
re_verification:
  previous_status: gaps_found
  previous_score: "5/6 (criterio 5 parcial: modo búsqueda de /clients sin acotar a mobile)"
  gaps_closed:
    - "MOB-07 / criterio 5: el modo búsqueda de /clients ya no desmonta el header en todos los anchos; lo oculta por CSS acotado a desktop (b8c1f3c). Con la mutación propia del candado nuevo en rojo las tres veces"
  gaps_remaining: []
  regressions: []
gaps: []
deferred: []
behavior_unverified_items: []
human_verification: []
---

# Phase 2: La barra inferior y Más — Informe de verificación (quinta pasada)

**Objetivo de la fase (ROADMAP):** que en el celular el panel se navegue desde una barra inferior fija con `Inicio · Turnos · Agenda · Clientes · Más` —por encima de la zona de gestos y sin tapar contenido de ninguna pantalla— y que Más contenga el resto del menú del negocio, agrupado como hoy y sin perder ni una fila; con el mecanismo de historial intacto y el desktop idéntico.

**Verificado:** 2026-10-09 (reloj de Buenos Aires: 08:31 al correr las suites, dentro de la ventana de los canarios) · **Base de la fase:** `49fa195` · **HEAD:** `b8c1f3c`
**Estado:** `passed` — los 6 criterios verificados, 4/4 requisitos satisfechos, sin gaps ni ítems humanos pendientes. La fase se puede marcar completa.
**Re-verificación:** Sí — **quinta pasada**, acotada al único gap de la cuarta.

## Qué cambió respecto de la cuarta pasada

| | Cuarta pasada (`3e94363`) | Esta pasada (`b8c1f3c`) |
|---|---|---|
| Estado | `gaps_found`, 5/6 | `passed`, 6/6 |
| `/clients` | modo búsqueda desmontaba las tres filas del header en TODOS los anchos | las tres filas se ocultan por CSS sólo bajo `lg` |
| Candado | ningún test sobre el modo búsqueda | bloque 10: repliegue obligado a llevar `hidden` + `lg:`, guarda de honestidad y prohibición del desmontaje condicional |
| Suite | 1687 casos | 1688 casos |

`git diff 3e94363..b8c1f3c --name-only` toca exactamente dos archivos de código: `app/(dashboard)/clients/clients-client.tsx` (+23/-6) y `test/panel-nav-chrome.test.ts` (+27). Sidebar, layout, barra, Más, header y los tres módulos de historial: sin cambios en este tramo.

## Qué verifiqué yo en esta pasada

| Comando / lectura | Resultado |
|---|---|
| `./node_modules/.bin/tsc --noEmit` | rc 0, sin salida |
| `npx vitest run` completo | rc 0 · `Test Files 107 passed (107)` · `Tests 1688 passed \| 4 expected fail \| 1 skipped (1693)`. Corrida limpia, sin flake |
| `git diff 49fa195..HEAD -- lib/panel-history.ts lib/overlay-history.ts lib/dirty-history.ts` | **vacío** |
| `git status --porcelain -- app components lib test` tras mis mutaciones | vacío (restaurado desde copia) |
| `02-UAT.md` | `status: complete` |
| `02-SECURITY.md` | `status: verified`, `threats_open: 0` |

### El arreglo en `clients-client.tsx`, leído línea por línea

- `modoBusqueda = searchFocused || search.trim() !== ''` (línea 256) y sólo se usa en **tres** lugares más: las tres filas (773, 790, 808). Ningún `{!modoBusqueda && …}` queda. El `<Input>` del buscador, las tabs de filtro y la lista no dependen de `modoBusqueda`.
- Fila 1 (título): `cn('flex items-center justify-between gap-2', modoBusqueda && 'hidden lg:flex')`.
- Fila 2 (Exportar/Importar): `cn('grid grid-cols-2 gap-2', modoBusqueda && 'hidden lg:grid')`.
- Fila 3 ("Nuevo cliente"): `className={cn('w-full gap-1.5 sm:w-auto', modoBusqueda && 'hidden lg:inline-flex')}`.
- **Inercia en desktop (>=1024px):** cada fila vuelve a su display original por la variante `lg:`. Comprobé la resolución de `tailwind-merge`, que es donde este patrón suele romperse: `cn()` es el mismo en el componente y en `Button` (`cn(buttonVariants({ variant, size, className }))`, con el `inline-flex` en la base del cva y el `className` al final), así que `hidden` pisa a `inline-flex` por ser posterior y `lg:inline-flex` sobrevive como variante distinta. En las filas 1 y 2 `hidden` pisa a `flex`/`grid` igual, y `lg:flex`/`lg:grid` restituyen. Con `modoBusqueda` falso la expresión `&&` aporta `false` y `cn` lo descarta: las clases quedan idénticas a las de antes del cambio. A >=1024px no hay ningún efecto visual de `modoBusqueda`.
- **Mobile (<1024px):** con foco o con texto, las tres filas quedan en `display: none` y el buscador, las tabs y la lista siguen montados. Es el mismo resultado visual que tenía el desmontaje (el `space-y-3` no deja margen fantasma: un hijo `display:none` no genera caja). Además el buscador **no se remonta**, así que conserva el foco; es mejor que antes. La UAT en dispositivo real de A.2 (Android + iOS) pasó con el modo búsqueda, y ese comportamiento visual en mobile no cambió.
- Las clases son literales en el fuente, así que Tailwind v4 las ve en el escaneo (no hay concatenación dinámica).
- **Separación entre filas en desktop:** se mantienen tres hijos directos del `space-y-3`, que es la razón por la que no se usó un envoltorio. Correcto.

### Mutaciones propias sobre el candado nuevo (bloque 10)

Cada una sobre `clients-client.tsx`, corrida de `panel-nav-chrome`, revertida:

| Mutación | Resultado |
|---|---|
| M1. Fila 3 sin `lg:` (`'hidden'` a secas) | **rojo**: `el repliegue "hidden" no tiene variante de desktop` |
| M2. Fila 2 sin `hidden` (`'lg:grid'` a secas) | **rojo**: `esconde pero no declara con qué display vuelve en desktop` |
| M3. Fila 1 vuelta al desmontaje `{!modoBusqueda && <div …>` | **rojo**: `el header volvió a DESMONTARSE por modoBusqueda` |

El candado muerde donde dice morder. (La cuarta mutación del orquestador, renombrar `modoBusqueda`, la cubre la guarda `repliegues.length > 0`; no la repetí.)

## Verdades observables (criterios de éxito del ROADMAP)

| # | Criterio | Estado | Evidencia |
|---|---|---|---|
| 1 | La barra existe y navega en todas las pantallas y rubros; `aria-current`; labels de la terminología; 375px sin truncar | VERIFICADO (código + UAT) | `panel-bottom-nav.tsx` sin cambios desde la tercera pasada. UAT 9 (C) y 10 (D) en celular real |
| 2 | Zona segura real: `viewport-fit=cover` sólo en `(dashboard)/layout.tsx`; destinos >=44x44 | VERIFICADO | Un único `export const viewport` en `app/`. UAT 12 (E.2). UAT 1 (A.1): `skipped` con motivo, ver nota |
| 3 | Nada queda tapado: alto reservado, último elemento alcanzable, teclado decidido y probado | VERIFICADO (código + UAT) | Mecanismo del alto sin cambios. UAT 2-6 pasan (A.2 en los dos motores reales) |
| 4 | Más reproduce el inventario exacto: 8/8/8/7 + Ayuda / Ver mi página / Cerrar sesión | VERIFICADO (código + UAT) | 11/11/11/10 filas; `panel-nav-groups.test.ts` lo fija contra los 4 verticales; UAT 9 y 10; candado de las filas de cuenta mordido en la cuarta pasada, sin cambios en `mas-client.tsx` desde entonces |
| 5 | Desktop idéntico y un solo menú en mobile | **VERIFICADO** | Sidebar, barra `lg:hidden`, `lg:h-screen` conservados; UAT 11 (E.1) en desktop; el residuo de `/clients` queda cerrado (arriba) y blindado por el candado |
| 6 | Historial intacto y auditable | VERIFICADO (código + UAT) | Diff vacío sobre los tres módulos; suites de la Phase 1 dentro de las 107 verdes; UAT 8 (A.5) y 13 (R-3) |

**Puntaje:** 6/6. Ningún truth quedó `PRESENT_BEHAVIOR_UNVERIFIED`.

### Sobre el test 1 (A.1), `skipped` con motivo: no es gap

La franja de gestos de iOS no aplica en una pestaña de Safari (entre la app y el home indicator está el chrome del navegador). En Android sí aplicaba y pasó. El código reserva `env(safe-area-inset-bottom)` y pinta el `bg-card` debajo, que es lo que el criterio 2 pide. Dictamen de la cuarta pasada, sin cambios.

### Una cosa que ningún test ni grep puede decir

El cierre de este gap se verificó por código, por resolución de clases y por mutaciones; **no** hay una captura de `/clients` en una ventana de escritorio con el buscador enfocado posterior a `b8c1f3c`. Pedí ese ojo en la cuarta pasada como lo único que requería ojos. No lo convierto en bloqueo: el cambio deja `modoBusqueda` sin ningún efecto bajo `lg:` por construcción (las clases resultantes son idénticas a las previas al commit `4850a62`), y es el tipo de equivalencia que la resolución de clases demuestra mejor que una captura. Queda como mirada opcional de cortesía, sin impacto en el estado.

## Cobertura de requisitos

| Requisito | Planes | Estado | Evidencia |
|---|---|---|---|
| MOB-01 | 02-01, 02-03, 02-04 | SATISFECHO | criterio 1; UAT 9, 10 |
| MOB-02 | 02-01, 02-04 | SATISFECHO | criterios 2 y 3; UAT 2-6, 12 (A.1 no aplica en pestaña) |
| MOB-03 | 02-02, 02-04 | SATISFECHO | criterio 4; 11/11/11/10 filas; UAT 9 |
| MOB-07 | 02-01, 02-03, 02-04 | **SATISFECHO** | sidebar, barra `lg:hidden`, `lg:h-screen`, `lg:static`, `lg:-m-8` conservan el desktop (UAT 11) y el repliegue de `/clients` está acotado a mobile y vigilado por el candado |

Sin huérfanos: `REQUIREMENTS.md` mapea exactamente MOB-01/02/03/07 a la Phase 2. Los cuatro siguen en `Pending` en la tabla de trazabilidad y en los checkboxes; marcarlos al cerrar la fase le corresponde al orquestador. No toqué `REQUIREMENTS.md`.

## Anti-patrones

Sin `TBD|FIXME|XXX` ni stubs en los dos archivos tocados desde la cuarta pasada. Los comentarios nuevos son explicativos. `02-SECURITY.md` en `verified`, `threats_open: 0`; el cambio es estado local de UI sin datos ni red.

## Deuda registrada (no es gap, ninguna cuenta)

1. Los tres todos de la UAT, fuera del alcance: guarda de borrador faltante en casi todos los diálogos del panel; zoom de iOS en 16 de 88 inputs; densidad del header de `/clients`.
2. Deuda documental del UI-SPEC (§4 ~110, §10, §11 regla 3, "13 pantallas" que son 15).
3. Punto ciego del candado 8: `h-[90vh]`.
4. El 1px del `border-t` de la barra (57px visuales vs 56 reservados).
5. `--font-geist-mono` no está definido en el repo.
6. Falso positivo por orden de atributos del bloque 6 (refinamiento).
7. A >=1024px `lg:h-screen` deja que el documento arrastre la altura de los banners (preexistente).
8. `@source not "../.planning"` en `globals.css`: correcto y necesario.
9. Duda del `onBlur` con campo vacío en iOS: no concluyente; A.2 pasó en iPhone.
10. Una limitación del candado nuevo, menor: la guarda recorre cadenas `modoBusqueda && '…'` con comillas simples; si alguien cambiara a comillas dobles o a template literal, la guarda de honestidad lo delataría (cero repliegues encontrados), no pasaría en silencio.

## Resumen

La fase entrega su objetivo: barra inferior fija, Más con el inventario exacto (11/11/11/10, ninguna fila perdida), zona segura, alto sin banners ni doble scroll, historial intacto por diff vacío, desktop idéntico, y una UAT de 13 ítems resuelta en dispositivos reales sin un solo problema. El único gap de la cuarta pasada (el modo búsqueda de `/clients` cambiaba el desktop) está cerrado en `b8c1f3c`: se oculta por CSS bajo `lg:`, sin efecto a >=1024px, sin romper el modo búsqueda en mobile, y con un candado que probé con tres mutaciones propias (tres rojos). tsc limpio, 1688 casos verdes, seguridad `verified` con 0 amenazas abiertas. Veredicto: **`passed`**.

---

_Verificado: 2026-10-09 (quinta pasada)_
_Verificador: Claude (gsd-verifier)_
