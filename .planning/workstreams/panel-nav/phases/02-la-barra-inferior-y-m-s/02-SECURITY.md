---
phase: "02"
slug: "la-barra-inferior-y-m-s"
status: draft
# threats_open = cantidad de amenazas OPEN con severidad >= workflow.security_block_on (high)
threats_open: 1
asvs_level: 1
created: "2026-10-09"
---

# Phase 02 — Security

> Contrato de seguridad de la fase: registro de amenazas, riesgos aceptados y traza de auditoría.

**Base de la fase:** `49fa195` · **HEAD auditado:** `fc542e2` · **ASVS:** 1 · **block_on:** `high`
**Origen del registro:** los 4 `<threat_model>` de los PLAN (`register_authored_at_plan_time: true`).
`T-02-SC` aparece en los 4 planes con el mismo contenido y se cuenta como **una** entrada.

---

## Trust Boundaries

| Boundary | Descripción | Datos que la cruzan |
|----------|-------------|---------------------|
| Navegador ↔ Server Component del panel | `/mas` y el resto del route group `(dashboard)` se renderizan server-side con el cliente anon + cookies (RLS activo) | Fila de `businesses` del dueño autenticado |
| Route group `(dashboard)` ↔ resto de `app/` | El `export const viewport` y los tokens nuevos tienen que quedar **dentro** del panel y no alcanzar el landing, `/[slug]` ni el CRM | Metadata de viewport, custom properties CSS |
| Cliente ↔ pestaña nueva | "Ver mi página" abre el sitio público del negocio en otra pestaña | `window.opener` |
| Fase ↔ mecanismo de historial | La barra y `/mas` son escritores nuevos del historial del panel | `panelNavMode`, `consumeOwnedPanelEntry` |

---

## Threat Register

| Threat ID | Categoría | Componente | Sev | Disp | Mitigación | Status |
|-----------|-----------|------------|-----|------|------------|--------|
| T-02-01 | Tampering | `export const viewport` desbordando el route group | high | mitigate | Un único `export const viewport` en todo `app/`, en `(dashboard)/layout.tsx:36-39`; `app/layout.tsx` sin diff. `curl` sobre `/`, `/[slug]` y `/login`: meta default sin una clave más | closed |
| T-02-02 | Elevation of Privilege | gateo de menú por rubro | medium | mitigate | `nav-groups.ts:98` `g.keys.filter(k => menu.has(k))` intacto. Mutación: filtro borrado → 9 rojos | closed |
| T-02-03 | Denial of Service | cuarto escritor del historial / orden del `onNavigate` | high | mitigate | `panel-bottom-nav.tsx:115-116` guard antes del consumo; 0 mutaciones crudas. Mutaciones: orden invertido → rojo; `history.back()` crudo → rojo | closed |
| T-02-04 | Information Disclosure | tokens nuevos filtrándose fuera del panel | low | mitigate | Tokens en `globals.css:85-86` y overrides dentro de los 4 bloques de tema existentes. Cero consumidores en landing, `/admin`, CRM y `app/[slug]` | closed |
| T-02-05 | Spoofing | `/mas` fuera de `updateSession` en el Edge | low | **accept** | `/mas` no entra a `lib/auth/route-lists.ts`, igual que sus 9 hermanas del panel (las 10 medidas una por una: todas 0). Guard real: `(dashboard)/layout.tsx:43-45` | closed |
| T-02-06 | Repudiation | — | low | **accept** | La fase no agrega acciones auditables: cero escrituras en base, cero mutación de estado del negocio | closed |
| T-02-07 | Elevation of Privilege | Más reimplementando el filtro por vertical | medium | mitigate | `mas-client.tsx:130` deriva de `buildNavGroups`; `resolveVertical` = 0. Mutación: import de `resolveVertical` → rojo | closed |
| T-02-08 | Spoofing | `/mas` sin guard de sesión | low | **accept** | Ídem T-02-05, más `mas/page.tsx:21-30`, que repite el guard con `.eq('owner_id', user.id)` | closed |
| T-02-09 | Information Disclosure | `window.opener` desde la pestaña nueva | medium | mitigate | Los dos `target="_blank"` con `rel="noopener noreferrer"` (`mas-client.tsx:267-270`, `:310-313`) | closed |
| T-02-10 | Repudiation | logout fallando en silencio en la única salida de mobile | high | mitigate | `mas-client.tsx:114-124`: `toast.error` en `:119` y `return` en `:120` que **no navega** si falla. ⚠ residuo **R-3** | closed |
| T-02-11 | Tampering | cuarto escritor del historial en las filas de Más | high | mitigate | Orden correcto en `mas-client.tsx:214-215` y `:253-254`; 0 mutaciones crudas | closed |
| T-02-12 | Denial of Service (a11y) | `aria-labelledby` que no resuelve | low | mitigate | `id` derivado vía `slugDeGrupo` en los dos extremos. Mutación: borrar el `id` derivado → rojo por igualdad de conjuntos | closed |
| T-02-13 | Denial of Service | mobile sin header, o el borrado mutilando `sidebarContent` | high | mitigate | Los tres hermanos montados (`layout.tsx:83`, `:86`, `:92`); `sidebarContent` con sus 5 filas y el bloque de desktop byte-idéntico. ⚠ residuo **R-1** | closed |
| T-02-14 | Elevation of Privilege | dos inventarios de destinos divergiendo | medium | mitigate | `sidebar.tsx`: `mobileOpen`/`bg-black/60`/`z-40`/`z-50`/`translate-x-` = 0 con y sin comentarios. Mutaciones: drawer de vuelta → 2 rojos; drawer **comentado** → rojo | closed |
| T-02-15 | Tampering | el borrado llevándose el cableado de historial de desktop | high | mitigate | `panelNavMode` ×2, `consumeOwnedPanelEntry` ×2, `useNavigationGuard` ×1, `aria-current` ×1, orden correcto; `panel-history-sidebar.test.ts` verde. ⚠ residuo **R-2** | closed |
| T-02-16 | Tampering | tocar `components/ui/drawer.tsx` por asociación de nombre | medium | mitigate | `git diff --stat 49fa195..HEAD -- components/ui/drawer.tsx` vacío | closed |
| T-02-17 | Information Disclosure | pathname renderizado crudo en el header | low | mitigate | `panel-top-bar.tsx:82` indexa un mapa literal; `:106` renderiza sólo si hay match. `grep` de `{pathname}` renderizado → 0 | closed |
| T-02-18 | Repudiation | — | low | **accept** | Ídem T-02-06 | closed |
| T-02-19 | Elevation of Privilege | gateo por rubro degradándose en un refactor futuro | medium | mitigate | `test/panel-nav-groups.test.ts`, 25 casos: 12/12/12/11 → 8/8/8/7, `canchas` sin "Equipo" y con "Canchas", guardas de honestidad por caso | closed |
| T-02-20 | Tampering | cuarto escritor del historial introducido después de la fase | high | mitigate | `test/panel-nav-chrome.test.ts` bloques 3 y 4, por región recortada y con comentarios descontados, con guardas de recorte no vacío | closed |
| **T-02-21** | **Repudiation (de la verificación misma)** | **la fase marcada como verificada sin que nadie abra el teléfono** | **high** | **mitigate** | **El control declarado existe como archivo pero es INERTE — ver abajo** | **open** |
| T-02-22 | Denial of Service (pipeline) | gate de inmutabilidad escrito como test de vitest | medium | mitigate | Los dos archivos nuevos: 0 ocurrencias de `git log`/`execSync`/`child_process` | closed |
| T-02-23 | Tampering | un candado rojo "arreglado" aflojando el candado | high | mitigate | Auditado con **13 mutaciones**, 11 muerden. El candado 8 ya no bendice la forma frágil. Ver abajo | closed |
| T-02-SC | Tampering (supply chain) | dependencias npm | low | **accept** | Cero archivos de paquetes en `git diff --name-only 49fa195..HEAD`. Cero endpoints, cero migraciones | closed |

*Status: open · closed · open — por debajo del umbral `high` (no bloqueante)*
*Sólo las `open` con severidad ≥ `high` cuentan para `threats_open`*

---

## T-02-21 — por qué queda abierta

La mitigación que el plan 02-04 declara es: *"El workstream tiene `auto_advance: false`"*. **Es cierta
sobre el archivo y falsa sobre el efecto.** Medido con el binario real
(`node .claude/gsd-core/bin/gsd-tools.cjs`, no `npx gsd-tools`, que resuelve a otro paquete):

1. `.planning/workstreams/panel-nav/config.json` → `{"workflow":{"auto_advance":false}}`. El archivo existe con el valor declarado.
2. `query check auto-mode` → `{"active": true, "source": "auto_advance", "auto_advance": true}` — lee el **global** (`.planning/config.json:26`). **Y devuelve `true` también pasando `--ws panel-nav`.** El override del workstream **no lo lee nadie**: es un **bug del tooling de GSD**, no de la fase.
3. La segunda pata tampoco estaba armada: el carve-out de `blocking-human` **existe** (`execute-phase.md:1144`, `execute-plan.md:227`), pero el task tracer de 02-01 **no declara `gate=`** en ningún lado (`grep -cE 'gate="' 02-01-PLAN.md` → **0**).

**Lo que sostuvo el buen resultado en esta corrida no fue un control, fue la forma del plan:** los 4
planes son `autonomous: true`, así que no existió ningún checkpoint `human-verify` que auto-aprobar.
El checkpoint del tracer apareció porque **el ejecutor eligió devolverlo**, no porque un gate lo
forzara. Un control de Repudiation que sólo funciona cuando no hay checkpoints no es un control.

**Matiz de registro:** el auditor concluyó, leyendo `02-01-SUMMARY.md:114` (*"NADIE lo miró todavía en
un teléfono"*), que nadie verificó nada. Es incorrecto por cronología: el dueño **sí** verificó dos
ítems en un teléfono real con captura (que la barra pinte la franja de gestos y que los destinos
naveguen), **después** de que ese SUMMARY se escribiera. No cambia el veredicto.

**Por qué importa hacia adelante:** la Phase 3 del mismo workstream ("La política de atrás") es
exactamente una fase que **sólo se puede verificar en un teléfono**. Con un plan `autonomous: false`,
el flag inerte muerde.

**Cómo se cierra** (cualquiera de las tres; re-medir `check auto-mode --pick active` → `false`):

- **(a)** poner `auto_advance: false` en el **global** `.planning/config.json` mientras dure el workstream. ⚠ Afecta a los otros workstreams, que hoy lo tienen en `true` a propósito.
- **(b)** arreglar/reportar el resolver para que el `workflow.auto_advance` del workstream sobreescriba al global. Es el arreglo correcto de raíz, pero es tooling de GSD, no código del repo.
- **(c)** re-declarar T-02-21 sobre las patas que **sí** son estructurales (el carve-out de `blocking-human` + el cierre en `human_needed`), registrar el override inerte como limitación conocida, y **declarar `gate="blocking-human"` en todo task con `<human-check>`** de la Phase 3 en adelante.

---

## T-02-23 — auditada con mutación, no por existencia

La fase rozó esta amenaza **cuatro veces**: un candado de 02-04 medía el helper del test en vez de la
producción (lo detectó su propio ejecutor); el code review encontró dos más que no mordían (WR-01,
WR-02); y el candado 8 **estuvo verde las dos veces que la cuenta de alturas que él mismo exigía se
rompió** — bendecía la forma frágil.

Auditada con **13 mutaciones** sobre producción, todas revertidas sin commitear (tree final limpio).
**11 muerden.** Entre ellas: volver al `calc` que enumera el chrome (2 rojos), `h-dvh` en mobile
(2 rojos), pantalla bloqueada sin `absolute inset-0`, `grow` borrado del envoltorio, espacio dentro del
valor arbitrario, drawer de vuelta y drawer **comentado**, `md:hidden` en la barra. Las dos que no
mordieron **no son aflojamientos**: una pegó en un comentario (el candado los descuenta a propósito) y
la otra es el residuo R-2.

Los dos candados que el review marcó como no-mordientes se reescribieron **por igualdad** en vez de por
cota, con el modo de falla viejo documentado en el archivo.

---

## Accepted Risks Log

| Risk ID | Threat Ref | Razón | Aceptado por | Fecha |
|---------|-----------|-------|--------------|-------|
| AR-02-01 | T-02-05, T-02-08 | `/mas` no se agrega a `lib/auth/route-lists.ts`, igual que sus 9 hermanas del panel que ya corren en producción. El guard real es el del layout del route group, que `/mas` hereda, más su propio guard en `page.tsx`. Medido: las 10 rutas dan 0 en route-lists | Registro de plan (02-01, 02-02) | 2026-10-09 |
| AR-02-02 | T-02-06, T-02-18 | La fase no agrega ninguna acción auditable: cero escrituras en base, cero mutaciones de estado del negocio, cero endpoints | Registro de plan (02-01, 02-03) | 2026-10-09 |
| AR-02-03 | T-02-SC | Cero paquetes nuevos en toda la fase, verificado con `git diff` sobre `package.json` y `package-lock.json`. Cero bloques de registry, cero iconos fuera de `lucide-react@1.17.0` | Registro de plan (los 4) | 2026-10-09 |

---

## Residuos de durabilidad

No son amenazas abiertas —la mitigación declarada **está presente y el estado final es correcto**—
pero en los tres casos el control fue un **gate de plan en bash** que corrió una vez y **no dejó
candado permanente**, así que un refactor futuro pasa el pipeline entero en verde.

| ID | Amenaza | Qué pasa hoy si se rompe | Medición |
|----|---------|--------------------------|----------|
| **R-1** | T-02-13 (high) | Desmontar `<PanelTopBar>` o `<PanelBottomNav>` del layout deja mobile sin header o sin menú | **Medido por el orquestador: comentar `<PanelTopBar />` → 65/65 tests en verde.** Candidato a caso nuevo en `panel-nav-chrome.test.ts` que afirme los tres hermanos montados |
| **R-2** | T-02-15 (high) | Borrar `aria-current` de `sidebar.tsx:107` deja el menú de desktop sin señalar la ruta activa | 131/131 verde sobre 4 suites. El conteo era gate de plan de 02-03, no candado |
| **R-3** | T-02-10 (high) | La pata humana de T-02-10 (forzar la falla del logout para ver el `toast.error`) **no está entre los 12 ítems de `02-UAT.md`**: no está agendada. La pata de código sí está presente y verificada. T-02-12 (low) tiene el mismo problema con la pasada de lector de pantalla |

---

## Unregistered Flags

**Ninguno.** `git diff --stat 49fa195..HEAD -- app components lib proxy.ts supabase` → 13 archivos,
todos de chrome/UI. Cero endpoints (`app/api/`), cero migraciones (la próxima libre sigue siendo la
**080**), cero archivos de paquetes, cero policies, cero service role. La única ruta nueva es `/mas`,
autenticada, con el guard estándar y `.eq('owner_id', user.id)`: el invariante de
`supabase-multitenant-rls` se respeta y no hay ninguna query nueva de datos de negocio.

---

## Security Audit Trail

| Fecha | Amenazas | Cerradas | Abiertas | Corrida por |
|-------|----------|----------|----------|-------------|
| 2026-10-09 | 24 | 23 | 1 | `gsd-security-auditor` (opus) + verificación independiente del orquestador |

---

## Sign-Off

- [x] Todas las amenazas tienen disposición (mitigate / accept / transfer)
- [x] Riesgos aceptados documentados en el Accepted Risks Log
- [ ] `threats_open: 0` confirmado — **NO: queda 1 abierta (T-02-21, high)**
- [ ] `status: verified` en el frontmatter

**Aprobación:** pendiente — bloqueada por T-02-21
