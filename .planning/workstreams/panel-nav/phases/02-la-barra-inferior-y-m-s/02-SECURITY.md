---
phase: "02"
slug: "la-barra-inferior-y-m-s"
status: verified
# threats_open = cantidad de amenazas OPEN con severidad >= workflow.security_block_on (high)
threats_open: 0
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
| T-02-21 | Repudiation (de la verificación misma) | la fase marcada como verificada sin que nadie abra el teléfono | high | mitigate | **Re-declarada** sobre los controles que sí son estructurales — ver abajo. El override de `auto_advance` del workstream queda registrado como limitación conocida del tooling, no como mitigación | closed |
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

### Resolución: re-declarada sobre lo que sí es estructural (decisión del dueño, 2026-10-09)

Se evaluaron tres caminos. **(a)** poner `auto_advance: false` en el global cerraba la medición en una
línea, pero afecta a los otros workstreams —que lo tienen en `true` a propósito— y depende de que
alguien se acuerde de revertirlo. **(b)** arreglar el resolver es el arreglo de raíz, pero es tooling
de GSD, no código de este repo. Se eligió **(c)**.

**T-02-21 queda CLOSED apoyada en los controles que son estructurales, no en el flag:**

1. **El carve-out de `blocking-human`** existe en el workflow y no depende de ninguna config:
   `execute-phase.md:1144` y `execute-plan.md:227` (*"`gate="blocking-human"` → STOP … every mode,
   auto included"*). Es más fuerte que un flag porque no se puede apagar por configuración.
2. **El cierre de la fase en `human_needed`**, con los 13 ítems guionados en `02-UAT.md` y
   **MOB-01/02/03/07 revertidos a `Pending`** (`REQUIREMENTS.md:111-117`). La fase no puede marcarse
   completa mientras la UAT no pase: eso es exactamente lo que la amenaza protege.
3. **El registro honesto en los artefactos**: los cuatro SUMMARY escriben "UAT visual pendiente" y
   nunca "verificado", y `02-VERIFICATION.md` acota por escrito qué fue lo único mirado en pantalla.

**Limitación conocida, registrada y NO mitigada:** el `workflow.auto_advance` de un workstream **es
inerte** — `check auto-mode` lee el global incluso pasando `--ws`. Es un bug del tooling de GSD.
Mientras no se arregle, **un `config.json` de workstream no protege nada** y no debe citarse como
mitigación en ningún plan futuro.

**Regla dura que esta resolución deja escrita, obligatoria de la Phase 3 en adelante:**
**todo task con `<human-check>` declara `gate="blocking-human"` explícitamente.** Es la pata que
faltaba: el tracer de 02-01 no lo declaraba (`grep -cE 'gate="' 02-01-PLAN.md` → 0), y su checkpoint
apareció porque el ejecutor eligió devolverlo, no porque algo lo forzara. La Phase 3 ("La política de
atrás") sólo se puede verificar en un teléfono, así que ahí la regla es load-bearing.

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

## Residuos de durabilidad — los tres CERRADOS (2026-10-09)

Nunca fueron amenazas abiertas —la mitigación declarada estaba presente y el estado final era
correcto— pero en los tres el control había sido un **gate de plan en bash** que corrió una vez y
**no dejó candado permanente**, así que un refactor futuro pasaba el pipeline entero en verde. Se
promovieron a controles durables.

| ID | Amenaza | Qué pasaba | Cómo quedó cerrado |
|----|---------|-----------|--------------------|
| **R-1** | T-02-13 (high) | Desmontar `<PanelTopBar>` o `<PanelBottomNav>` del layout dejaba mobile sin header o sin menú — y como el drawer ya no existe, sin **ninguna** forma de navegar el panel desde el teléfono | **Candado nuevo**, `panel-nav-chrome.test.ts` bloque 10: el layout tiene que montar los **tres** hermanos. Probado con 3 mutaciones: borrar `<PanelBottomNav />` → rojo; comentar y borrar `<PanelTopBar business={business} />` → rojo las dos |
| **R-2** | T-02-15 (high) | Borrar `aria-current` de `sidebar.tsx` dejaba el menú de desktop sin señalar la ruta activa para un lector de pantalla; 131/131 en verde sobre 4 suites | **Candado nuevo**, mismo bloque 10. Mutación: `aria-current` → `data-noop` ⇒ rojo (`expected 0 to be greater than 0`) |
| **R-3** | T-02-10 (high) | La pata humana (forzar la falla del logout para ver el `toast.error`) no estaba agendada en ningún lado. Más es la **única** salida de sesión en mobile | **Agendada** como ítem **13** de `02-UAT.md`, con el paso concreto (cortar la red antes de tocar "Cerrar sesión") y el criterio: aparece el toast **y la app NO navega**. La pasada de lector de pantalla de T-02-12 ya estaba cubierta por el ítem 10 |

⚠ **Corrección de una medición propia del orquestador.** La primera confirmación de R-1 que se
registró —*"comentar `<PanelTopBar />` → 65/65 en verde"*— **no era válida**: el `sed` buscaba
`<PanelTopBar />` y el JSX real es `<PanelTopBar business={business} />`, así que la mutación
**nunca mutó nada** y el verde no medía la ausencia del componente. El residuo igual era real (lo
había medido el auditor con una mutación que sí aplicaba), y la mutación corregida se usó para
validar el candado nuevo. Es el mismo modo de falla que T-02-23 persigue, esta vez en el
instrumento de medición y no en el candado: **una mutación que no muta da un verde que no vale**.

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
| 2026-10-09 | 24 | **24** | **0** | Orquestador — T-02-21 re-declarada sobre controles estructurales (opción (c), decisión del dueño); R-1 y R-2 promovidos a candados permanentes y probados con mutación; R-3 agendado como ítem 13 de la UAT |

---

## Sign-Off

- [x] Todas las amenazas tienen disposición (mitigate / accept / transfer)
- [x] Riesgos aceptados documentados en el Accepted Risks Log
- [x] `threats_open: 0` confirmado
- [x] `status: verified` en el frontmatter

**Aprobación:** verificada 2026-10-09.

⚠ **Lo que esta firma NO dice.** `threats_open: 0` cubre el registro de amenazas de la fase, no la
fase entera: los **13 ítems de `02-UAT.md` siguen pendientes** y la verificación de la fase está en
`human_needed`. La seguridad deja de bloquear el avance; la UAT en teléfono sigue siendo el único
criterio que cierra la fase.
