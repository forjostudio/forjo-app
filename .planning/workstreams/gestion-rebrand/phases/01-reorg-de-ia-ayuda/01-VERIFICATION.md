---
phase: 01-reorg-de-ia-ayuda
verified: 2026-07-05T16:30:00Z
status: human_needed
score: 10/10 must-haves verificados
behavior_unverified: 0
overrides_applied: 0
human_verification:
  - test: "Cargar /negocio y confirmar que las 4 tabs se renderizan correctamente (Datos del negocio · Cobros · Integraciones · Notificaciones/Mails) con la tab Datos activa por defecto, que el contenido de cada tab es el correcto (behavior-frozen), y que en /settings solo aparecen 3 tabs (Apariencia · Seguridad · Suscripción)."
    expected: "Hub Negocio visible con 4 tabs; tab Datos seleccionada por defecto; contenido de Cobros/Integraciones/Notificaciones idéntico al que mostraba /settings antes; /settings con solo 3 tabs."
    why_human: "La reasignación de qué TabsContent muestra cada view depende de qué valor matchea el <Tabs value>; el gating entre TabsList de negocio vs config es lógica en tiempo de ejecución que grep no puede ejercitar."
  - test: "Verificar el flujo completo del OAuth de MercadoPago: iniciar 'Conectar con MercadoPago' desde /negocio → Integraciones, completar o cancelar el OAuth, y confirmar que el landing es /negocio (no /settings), que la tab activa es Integraciones, que el toast correcto aparece (conectado o error), y que la URL queda limpia en /negocio."
    expected: "Redirect final a /negocio?mp=connected|error, tab Integraciones activa, toast correspondiente, URL final = /negocio."
    why_human: "Requiere flujo OAuth real con MercadoPago (servicio externo) y verificación visual del toast + tab activa tras la redirección."
  - test: "Navegar a /ayuda desde el footer del sidebar (ícono HelpCircle) y desde el link '¿Necesitás ayuda? Ver la guía' en /settings. Verificar que en mobile el sidebar se cierra al hacer clic en el link Ayuda."
    expected: "Ambos accesos navegan a /ayuda. El drawer del sidebar se cierra en mobile. Las 7 preguntas son visibles con disclosures nativos; múltiples pueden quedar abiertas a la vez; el chevron rota al abrir/cerrar."
    why_human: "Verificación visual del disclosure nativo (<details>/<summary>), comportamiento del drawer mobile, y accesibilidad de foco por teclado."
  - test: "Verificar el gating por vertical: cargar el dashboard como negocio de rubro 'canchas' y confirmar que el grupo GESTIÓN no muestra la fila 'Equipo'. Cargar como negocio general y confirmar que GESTIÓN sí lo muestra."
    expected: "En canchas: GESTIÓN solo muestra Servicios · Consultorios · Negocio (Equipo ausente). En general/belleza/salud: GESTIÓN muestra Servicios · Equipo · Consultorios · Negocio."
    why_human: "El gating depende del menu[] del vertical resuelto en tiempo de ejecución; el filtro buildNavGroups() opera con datos reales del negocio autenticado."
---

# Fase 01: Reorg de IA + Ayuda — Reporte de Verificación

**Objetivo de la fase:** Reorganizar el chasis de navegación de la app (sidebar agrupado + hub Negocio / Configuración) sin cambiar el comportamiento de ningún flujo existente (behavior-frozen), y sumar la ayuda estática — la reorg deja el terreno listo para colgar las features de las fases siguientes.

**Verificado:** 2026-07-05T16:30:00Z
**Estado:** human_needed
**Re-verificación:** No — verificación inicial

---

## Logro del Objetivo

### Verdades Observables

| # | Verdad | Estado | Evidencia |
|---|--------|--------|-----------|
| 1 | El sidebar muestra items agrupados en 5 secciones (PANEL · AGENDA · GESTIÓN · REPORTES · AJUSTES) data-driven, filtradas contra `resolveVertical(business).menu` | VERIFICADO | `NAV_GROUPS` array en `sidebar.tsx` L39-45; `buildNavGroups()` L53-77 filtra por `Set(v.menu)` |
| 2 | Cada item sigue linkeando exactamente al mismo href que antes (behavior-frozen) | VERIFICADO | El mapa `ITEMS` en `buildNavGroups()` replica los mismos hrefs (`/dashboard`, `/appointments`, `/agenda`, `/clients`, `/servicios`, `/equipo`, `/consultorios`, `/negocio`, `/finances`, `/settings`); ningún href nuevo |
| 3 | MENSAJES ausente del sidebar | VERIFICADO | `grep -c "MENSAJES" sidebar.tsx` = 0; el comentario menciona "grupo de mensajería" (no el literal) |
| 4 | Estado activo `bg-primary text-primary-foreground` preservado; sin patrón `before:bg-primary` del CRM | VERIFICADO | `sidebar.tsx` L139: `'bg-primary text-primary-foreground'`; grep de `before:bg-primary` = 0 resultados |
| 5 | Footer behavior-frozen: "Ver mi página", "Cerrar sesión" y "hecho con Forjo Studio" intactos | VERIFICADO | `sidebar.tsx` L159, L180, L191: las 3 cadenas presentes y wired |
| 6 | `lib/verticals.ts` sin cambios en la fase 1 | VERIFICADO | `git diff acc3833..84cea43 -- lib/verticals.ts` = 0 líneas; el archivo no fue tocado en ninguno de los 11 commits de la fase |
| 7 | `/negocio` es un hub con 4 tabs client-side (D-04); `/settings` queda con 3 tabs | VERIFICADO | `settings-client.tsx`: `isNegocio && (<TabsList>` con 4 triggers L825-832; `!isSection && (<TabsList>` con 3 triggers L835-841 |
| 8 | `negocio/page.tsx` pasa `getBusinessSecrets(business.id)` scoped al dueño autenticado | VERIFICADO | `negocio/page.tsx` L4: import de `getBusinessSecrets`; L20: `await getBusinessSecrets(business.id)` donde `business` se resolvió por `.eq('owner_id', user.id)` L12 |
| 9 | Redirects del OAuth de MercadoPago apuntan a `/negocio?mp=...`; cero residuales `/settings?mp=` | VERIFICADO | `callback/route.ts` L17/L69: `${base}/negocio?mp=error|connected`; `connect/route.ts` L9: `${base}/negocio?mp=error`; grep `/settings?mp=` = 0 resultados |
| 10 | Página `/ayuda` existe como server component con array TS `FAQ` de 7 entradas + disclosures nativos; cero dependencias nuevas | VERIFICADO | `ayuda/page.tsx` confirma `const FAQ: { pregunta: string; respuesta: string }[]` con 7 objetos (líneas 10/15/20/25/30/35/40); `<details className="group">` nativo; `git diff acc3833..84cea43 -- package.json` = vacío |

**Puntaje:** 10/10 verdades verificadas

### Requerimientos Cubiertos

| Requerimiento | Plan | Descripción | Estado | Evidencia |
|---------------|------|-------------|--------|-----------|
| NAV-01 | 01-01 | Sidebar agrupado en secciones PANEL·AGENDA·GESTIÓN·REPORTES·AJUSTES | SATISFECHO | `sidebar.tsx` `NAV_GROUPS` + `buildNavGroups()` |
| NAV-02 | 01-02 | Negocio = hub de 4 tabs; Configuración = 3 tabs; OAuth MP reruteado | SATISFECHO | `settings-client.tsx` + `negocio/page.tsx` + routes MP |
| HELP-01 | 01-03 | FAQ estática en `/ayuda`; dos accesos (sidebar footer + Configuración) | SATISFECHO | `ayuda/page.tsx` + `HelpCircle` link en sidebar + link en `settings-client.tsx` |

---

## Artefactos Requeridos

| Artefacto | Descripción | Estado | Detalles |
|-----------|-------------|--------|---------|
| `components/dashboard/sidebar.tsx` | Sidebar agrupado data-driven con `buildNavGroups()` | VERIFICADO | Existe, sustancial (241 líneas), wired: montado por el layout del dashboard |
| `app/(dashboard)/settings/settings-client.tsx` | Hub Negocio (4 tabs) + config reducida (3 tabs) + `?mp=` reubicado | VERIFICADO | `negocioTab`/`setNegocioTab` L149; `isNegocio` L145; TabsList del hub L825-832; `replaceState(null,'','/negocio')` L166 |
| `app/(dashboard)/negocio/page.tsx` | Carga de secrets server-side scoped al dueño | VERIFICADO | `getBusinessSecrets(business.id)` L20; `secrets={secrets}` en `<SettingsClient>` L25 |
| `app/api/mercadopago/callback/route.ts` | Redirect del OAuth a `/negocio?mp=connected|error` | VERIFICADO | Líneas 17 y 69 con `/negocio?mp=` |
| `app/api/mercadopago/connect/route.ts` | Redirect de error a `/negocio?mp=error` | VERIFICADO | Línea 9 con `/negocio?mp=error` |
| `app/(dashboard)/ayuda/page.tsx` | Server component FAQ estática con disclosures nativos | VERIFICADO | 72 líneas; 7 entradas FAQ; `<details>/<summary>` nativos; sin import de Accordion |

---

## Verificación de Links Clave

| Desde | Hacia | Vía | Estado | Detalles |
|-------|-------|-----|--------|---------|
| `sidebar.tsx` | `lib/verticals.ts` | `resolveVertical(business)` en `buildNavGroups()` | WIRED | L54: `const v = resolveVertical(business)` + `Set(v.menu)` para gating |
| `sidebar.tsx` | `ayuda/page.tsx` | `<Link href="/ayuda">` en el footer | WIRED | L167-174: link con `HelpCircle` icono + `onClick setMobileOpen(false)` |
| `negocio/page.tsx` | `lib/business-secrets.ts` | `getBusinessSecrets(business.id)` | WIRED | L4 import; L20 call; `business.id` de `owner_id` |
| `callback/route.ts` | `settings-client.tsx` (hub negocio) | Redirect a `/negocio?mp=` consumido por `useEffect` gateado por `isNegocio` | WIRED | `callback` L17/L69; `settings-client` L159-167: `useEffect` gatea por `isNegocio`, lee `?mp=`, setea `negocioTab('integraciones')`, `replaceState('/negocio')` |
| `settings-client.tsx` | `ayuda/page.tsx` | `<Link href="/ayuda">` gateado por `!isSection` | WIRED | L1732-1738: link "¿Necesitás ayuda? Ver la guía" solo en view `config` |

---

## Trazado de Flujo de Datos (Nivel 4)

| Artefacto | Variable de datos | Fuente | Produce datos reales | Estado |
|-----------|-----------------|--------|---------------------|--------|
| `negocio/page.tsx` → `SettingsClient` | `secrets` (mp_access_token, resend_*, etc.) | `getBusinessSecrets(business.id)` — service-role, query a `business_secrets` por `business_id` | Sí — query real a Supabase | FLOWING |
| `ayuda/page.tsx` | `FAQ` array | Array TS estático en el módulo | N/A — contenido estático intencional | FLOWING (estático por diseño, D-08) |

---

## Anti-patrones Encontrados

| Archivo | Línea | Patrón | Severidad | Impacto |
|---------|-------|--------|-----------|---------|
| `settings-client.tsx` | 165, 179, 187, 188, 196, 205, 329, 444 | Errores pre-existentes de eslint (`react-hooks/set-state-in-effect`, `react-hooks/immutability`) — 10 errores en baseline de HEAD | Info | Pre-existentes: verificado que el conteo de problemas eslint no aumentó con las ediciones de esta fase (baseline 20 vs post-fase 20). Fuera de alcance de la fase 1. |

Sin marcadores de deuda (`TBD`, `FIXME`, `XXX`) en ninguno de los 6 archivos modificados/creados.

---

## Spot-checks Conductuales

| Comportamiento | Comando | Resultado | Estado |
|----------------|---------|-----------|--------|
| Grupos del sidebar correctos en código | `grep -n "PANEL\|AGENDA\|GESTIÓN\|REPORTES\|AJUSTES" sidebar.tsx` | 5 secciones en NAV_GROUPS L40-44 | PASS |
| MENSAJES ausente | `grep -c "MENSAJES" sidebar.tsx` | 0 | PASS |
| Estado activo bg-primary | `grep "bg-primary text-primary-foreground" sidebar.tsx` | L139 confirmado | PASS |
| Sin patrón CRM `before:bg-primary` | `grep "before:bg-primary" sidebar.tsx` | 0 resultados | PASS |
| Footer congelado | `grep "Ver mi página\|Cerrar sesión\|hecho con" sidebar.tsx` | L159, L180, L191 | PASS |
| `negocioTab` + `setNegocioTab` en settings-client | grep | L149: `useState('business')` | PASS |
| `Notificaciones/Mails` literal | grep | L830: `<TabsTrigger value="notificaciones">Notificaciones/Mails</TabsTrigger>` | PASS |
| `replaceState` apunta a `/negocio` (no `/settings`) | grep | L166: `replaceState(null, '', '/negocio')`; sin `/settings` residual | PASS |
| Sin `/settings?mp=` residual | `grep -r "/settings?mp=" app/api/mercadopago/` | 0 resultados | PASS |
| `getBusinessSecrets(business.id)` en negocio/page.tsx | grep | L20 confirmado | PASS |
| Callback MP: `/negocio?mp=error|connected` | grep | L17 y L69 en callback | PASS |
| FAQ = 7 entradas TS | análisis línea a línea | 7 objetos `{ pregunta, respuesta }` en L10/15/20/25/30/35/40 | PASS |
| Sin Accordion import | `grep "^import.*Accordion" ayuda/page.tsx` | 0 (menciones solo en comentarios) | PASS |
| Chevron sin color de acento | `grep "text-primary" ayuda/page.tsx` | 0 resultados | PASS |
| `<details>/<summary>` nativo | lectura directa L61-68 | Confirmado: sin shadcn Accordion ni @radix-ui | PASS |
| `package.json` sin cambios | `git diff acc3833..84cea43 -- package.json` | Vacío (0 líneas) | PASS |
| `lib/verticals.ts` sin cambios | `git diff acc3833..84cea43 -- lib/verticals.ts` | Vacío (0 líneas) | PASS |
| Sin phantom redirects por tabs migradas (D-05) | `grep -rn "redirect.*cobros\|redirect.*integraciones\|redirect.*notificaciones" app/` | 0 resultados | PASS |

---

## Verificación Humana Requerida

### 1. Hub Negocio: renderizado de 4 tabs y contenido behavior-frozen

**Test:** Abrir `/negocio` en el dashboard. Verificar que aparecen 4 tabs (Datos del negocio · Cobros · Integraciones · Notificaciones/Mails), que "Datos del negocio" está activa por defecto, y que el contenido de cada tab (formularios, campos, lógica de guardado) es idéntico al que mostraba `/settings` antes de la migración. Luego abrir `/settings` y confirmar que solo aparecen 3 tabs (Apariencia · Seguridad · Suscripción).

**Esperado:** Hub Negocio con 4 tabs visible; contenido de Cobros/Integraciones/Notificaciones funcionando igual que antes; Configuración con solo 3 tabs.

**Por qué humano:** El split de TabsList por view opera en tiempo de ejecución; la identidad del contenido (behavior-frozen) requiere comparación visual con el estado anterior.

---

### 2. OAuth de MercadoPago: landing en /negocio → tab Integraciones

**Test:** Desde `/negocio`, ir a la tab Integraciones y hacer clic en "Conectar con MercadoPago". Completar o cancelar el flujo de OAuth en MercadoPago. Verificar que el redirect final aterriza en `/negocio` (no `/settings`), que la tab activa es "Integraciones", que aparece el toast correspondiente ("MercadoPago conectado" o "No se pudo conectar"), y que la URL queda limpia en `/negocio`.

**Esperado:** Landing en `/negocio`, tab Integraciones activa, toast visible, URL = `/negocio`.

**Por qué humano:** Requiere flujo OAuth real con el servicio externo de MercadoPago; el toast y el estado de la tab post-redirect son comportamiento en tiempo de ejecución.

---

### 3. Página /ayuda: disclosures, dos accesos y drawer mobile

**Test:** (a) Hacer clic en el link "Ayuda" del footer del sidebar (ícono HelpCircle) → confirmar que navega a `/ayuda`. En mobile, confirmar que el drawer se cierra. (b) Ir a `/settings` y hacer clic en "¿Necesitás ayuda? Ver la guía" → confirmar que navega a `/ayuda`. (c) En `/ayuda`, abrir varias preguntas simultáneamente; confirmar que múltiples pueden quedar abiertas, el chevron rota al abrir/cerrar, y el foco por teclado (Tab + Enter/Space) funciona correctamente.

**Esperado:** Ambos accesos llevan a `/ayuda`; drawer mobile se cierra; múltiples disclosures abiertos simultáneamente; chevron rota; foco visible.

**Por qué humano:** Comportamiento del drawer mobile, interacción de disclosures nativos, y accesibilidad de foco requieren verificación visual en el navegador.

---

### 4. Gating por vertical en el sidebar agrupado

**Test:** Cargar el dashboard como negocio de rubro "canchas" y verificar que el grupo GESTIÓN NO muestra "Equipo". Cargar como negocio de rubro general/belleza/salud y verificar que GESTIÓN sí muestra "Equipo".

**Esperado:** En canchas, GESTIÓN = Servicios · Consultorios · Negocio. En otros rubros, GESTIÓN incluye Equipo.

**Por qué humano:** El gating depende del `menu[]` del vertical resuelto con datos reales del negocio autenticado; requiere cuentas de prueba con distintos rubros.

---

## Resumen de Brechas

Sin brechas. Los 10 must-haves son verificados y todos los checks automatizables resultaron PASS. Los 4 items de verificación humana son comportamientos en tiempo de ejecución (OAuth externo, drawer mobile, disclosures interactivos, gating con datos reales) que no se pueden confirmar por grep/lectura de código — no constituyen brechas sino validaciones de integración end-to-end.

La fase logra su objetivo: el chasis de navegación está reorganizado (sidebar agrupado en 5 grupos, hub Negocio/Configuración split), el comportamiento de los flujos existentes está congelado en el código, y la ayuda estática existe como ruta `/ayuda` con cero dependencias nuevas.

---

_Verificado: 2026-07-05T16:30:00Z_
_Verificador: Claude (gsd-verifier)_
