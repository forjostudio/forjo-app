---
phase: "04"
slug: "los-tabs-profundos-sobre-la-pol-tica-ya-fijada"
status: verified
# threats_open = cantidad de amenazas OPEN con severidad >= workflow.security_block_on (high)
threats_open: 0
asvs_level: 1
created: "2026-11-18"
---

# Phase 04 — Security

> Contrato de seguridad de la fase: registro de amenazas, riesgos aceptados y traza de auditoría.

**Base de la fase:** `85c99ae` · **HEAD auditado:** `ebe4f77` · **Código desplegado:** `c3da6d0`
(`git diff c3da6d0 HEAD -- app lib components test scripts` vacío) · **ASVS:** 1 · **block_on:** `high`
**Origen del registro:** los 8 `<threat_model>` de los PLAN (`register_authored_at_plan_time: true`): 56
entradas (T-04-01..T-04-48 más `T-04-SC` una vez por plan, con el plan como sufijo `@NN`), 45 `mitigate` y 11
`accept`; severidad 0 critical, 25 high, 18 medium, 13 low.

**Leyenda de la evidencia:** PT = `lib/panel-tabs.ts` · PH = `lib/panel-history.ts` · PB = `lib/panel-branch.ts` ·
UG = `components/dashboard/unsaved-changes-guard.tsx` · FC = `finances-client.tsx` · SC = `settings-client.tsx` ·
AC = `agenda-client.tsx` · FP/NP/SP = `finances|negocio|settings/page.tsx` · tPT = `test/panel-tabs.test.ts` · tPH =
`lib/panel-history.test.ts` · tPB = `test/panel-branch.test.ts` · tUC = `lib/unsaved-changes.test.ts` · AP =
`.planning/debug/probes/panel-exit-en-la-app.mjs` · GP = `.planning/debug/probes/g04-scroll-y-recarga.mjs` · RM =
`.planning/debug/tabs-en-la-url-medida.md` · DC = `04-DECISION-COMPOSICION.md` · DI = `deferred-items.md` · Pn/Sn =
`04-0n-PLAN/SUMMARY.md` · U = `04-UAT.md` · UGa = `04-UAT-GAPS.md` · GU = `04-UAT-GUION.md` · RQ/RD =
`REQUIREMENTS.md`/`ROADMAP.md` del workstream · W = `.planning/WINDOWS.md`. Líneas del HEAD auditado.

---

## Trust Boundaries

| Boundary | Descripción | Datos que la cruzan |
|----------|-------------|---------------------|
| URL (`?tab=`, `?mp=`, `?google=`) ↔ panel | La query la puede escribir cualquiera (un link pegado): el tab decide qué se **muestra**, nunca qué se **lee**; el negocio y sus secretos se resuelven en el server por `owner_id` antes de cualquier tab | Slug del tab, marcas de vuelta del OAuth |
| Panel ↔ historial del navegador | Los tabs escriben historial sólo por el helper (`applyPanelView`): push/replace/consumo con la política D-01; un retroceso sobre una entrada ajena saca al dueño del sitio | Marca `frjView`, `frjUnder`, la guarda de consumo en vuelo |
| Escritores del historial entre sí | `panel-history`, `panel-branch` (B1), `overlay-history`, `dirty-history` y la guarda de cambios sin guardar comparten la pila; la regla 0 impide escribir sobre la entrada de otro dueño | Dominio de la entrada |
| Retorno del OAuth (MercadoPago / Google) ↔ panel | El backend vuelve con `?mp=`/`?google=`; el cliente sólo limpia la query (un `applyPanelView` con `drop`) y pide el toast; el estado de la conexión sale de los secretos del server | Marcas de resultado del OAuth (sin tokens) |
| Sondas y orquestador ↔ máquina del dueño / producción | Las sondas corren por el turno de pantalla, en loopback, sin matar el `next dev` ajeno; el push a `main` (= deploy) sólo con la respuesta literal del dueño | Seed local, puerto CDP, `git push` |

---

## Threat Register

| Threat ID | Category | Component | Severity | Disposition | Mitigation / evidencia | Status |
|-----------|----------|-----------|----------|-------------|------------------------|--------|
| T-04-01 | DoS (self) | `resolveTab` con `?tab=__proto__`/`constructor` | medium | mitigate | `new Map(` ×3 en PT:68,79,89; PT:110-113; tPT:39,59-65; AP:2829-2833 `R-T-finanzas-invalido` OK (RM (i)) | closed |
| T-04-02 | DoS/Tampering | `applyPanelView` fabricando la marca en un replace | high | mitigate | `holding` leído una vez (PH:1026); marca sólo con push o holding (PH:1061); tPH:431-480; tPT:328-410; RM:235 RED → RM:267 GREEN; M-1 en rojo (S01:153) | closed |
| T-04-03 | Tampering | escribir sobre la entrada de otro dueño | high | mitigate | Regla 0 PH:109; `isForeignOwnedEntry` PH:400-402 sin `frjView`; overlay/dirty-history sin diff | closed |
| T-04-04 | Info disclosure | el tab como elector de lecturas | low | accept | P01:546; FP:11-15 resuelve por `owner_id`, la página no lee `searchParams` (AR-04-01) | closed |
| T-04-05 | Spoofing (gesto) | empuje sin activación del usuario | medium | mitigate | FC:279 y SC:1034 descartan `reason !== 'none'`; reconciliaciones sólo `stale`/`programmatic` (PH:862,870), que nunca empujan (PH:141-151) | closed |
| T-04-06 | Repudiation (medición) | `esperado` ajustado o RED nunca visto | high | mitigate | `efb9ae4`→`f481059`, `cf41e78`→`f3896d0` (test antes); 0 `esperado` borrados en AP; RM §(a)/(b) | closed |
| T-04-07 | Tampering | intocables y archivos fuera del plan | high | mitigate | Diff de intocables vacío desde `85c99ae`; `next.config.ts` sha1 `8ceb99ae…03578` | closed |
| T-04-08 | DoS (otras pilas/turno) | `supabase start` y corridas de pantalla | medium | mitigate | Contenedores anotados (S01:140); ⚠ una corrida fuera del turno, accidental y cortada (S01:186-188), autodeclarada; el resto por el turno (S02:164 … S08:117) — ver Audit Trail | closed |
| T-04-SC@01 | Tampering | paquetes | low | accept | P01:551; sin diff de paquetes (AR-04-04) | closed |
| T-04-09 | Tampering (3 rutas) | el par `tabValue`/`onTabChange` (T-1) | high | mitigate | SC:1046-1047; tPT:610-629 (c)(d); `R-T-secciones-sin-tab` OK; U 5.1-5.3 ✅ | closed |
| T-04-10 | DoS (silencioso) | el OAuth borrando el tab o escribiendo dos veces | high | mitigate | Un escritor: SC:1135 (`drop`) + corte SC:1069; tPT:674-701 (g); M-4/M-7 en rojo (S02:172-179); U 4.2-4.4 ✅ | closed |
| T-04-11 | Spoofing | redirect abierto en el retorno del OAuth | medium | mitigate | `app/api/**` sin diff; el cliente sólo limpia la query (SC:1135, AC:303) | closed |
| T-04-12 | Info disclosure | el tab como elector de secretos | high | mitigate | NP:14 `.eq('owner_id', user.id)`, NP:22 `getBusinessSecrets(business.id)`; SP:13-17,24; sin `searchParams` (tPT:631-653 (e)) | closed |
| T-04-13 | DoS (self) | entrada ajena consumida al tocar Datos o la sección activa | high | mitigate | Patrón 3 (PH:1061) + guardas PH:1216-1217; tPT:399; `R-T-negocio-oauth-mp`, `R-T-sidebar-seccion-activa` OK | closed |
| T-04-14 | Repudiation | candados que miden cero | high | mitigate | tPT:584-588, `sinComentariosFirme` tPT:568; M-4..M-7 en rojo; `1b3e26f`→`3adb255`, `8b9f57d`→`cb0d519` | closed |
| T-04-15 | Tampering | intocables | high | mitigate | El 04-02 sólo tocó su plan (`3adb255`, `cb0d519`) | closed |
| T-04-16 | DoS (pilas/turno) | sondas | medium | mitigate | S02:164: cuatro corridas por el turno | closed |
| T-04-SC@02 | Tampering | paquetes | low | accept | P02:422; sin diff (AR-04-04) | closed |
| T-04-17 | Repudiation (decisión) | decisión sin números o tomada por el ejecutor | high | mitigate | P03:208 `checkpoint:decision gate="blocking-human"`; DC:33 «B1» con la tabla DC:16-23 | closed |
| T-04-18 | Repudiation (medición) | `esperado` ajustados | high | mitigate | `b47555d` antes de `9d4f37a`; RM:765 `composicion medida: como-se-derivo` | closed |
| T-04-19 | Tampering (alcance) | reescribir el criterio 1 o MOB-08 | medium | mitigate | RD:618 y RQ:373 «PRECISADO el 2026-11-17» sobre el texto original; MOB-08/09 marcados recién en `d503d74` | closed |
| T-04-20 | Tampering | código cambiado en un plan de medición | high | mitigate | El 04-03 sólo tocó docs y PT (diferencia de una línea en blanco) | closed |
| T-04-21 | Tampering (registro) | W editado a mano | low | mitigate | Entrada 21 con la forma del CLI; 21 filas = 21 ids JSON | closed |
| T-04-22 | DoS (pilas/turno) | sonda del 04-03 | medium | mitigate | S03:66-67, una corrida por el turno | closed |
| T-04-SC@03 | Tampering | paquetes | low | accept | P03:367; sin diff (AR-04-04) | closed |
| T-04-23 | DoS (self) | retroceso sobre entrada ajena en B1 | high | mitigate | PH:1216-1217, PH:1252-1253; PB:1528 `vistaArriba` exige marca propia; PB:419; tPB:1322-1333; `R-B1-*` OK | closed |
| T-04-24 | Tampering (Phase 3) | el plan de la rama | high | mitigate | `panelNavMode` byte-idéntica; `panelBranchPlan` sólo aditiva; MB1/MB2 en rojo (S04:95-97); estática 18/18, app 46/47; retroceso triple (S04:81-85) | closed |
| T-04-25 | DoS (gesto muerto) | el segundo paso de B1 que no llega | medium | mitigate | Oyente antes del consumo (PB:416), desenganche si se niega (PB:420), sin `reDecidir` se niega antes (PB:408); tPB:1271-1320; 0 timers | closed |
| T-04-26 | Elevation (alcance) | B1 sin la decisión | high | mitigate | P04:42, P04:238-239; DC (`70b1fd8`) antes de `f8fdb12` | closed |
| T-04-27 | Repudiation | retirar R-C-* reescribiendo su `esperado` | medium | mitigate | `obsoleto` en AP:3296,3329,3366,3465; 0 `esperado` borrados desde `b47555d` | closed |
| T-04-28 | Tampering (desktop) | que B1 cambie el escritorio | medium | mitigate | `panel-bottom-nav.tsx`/`sidebar.tsx` sin diff; `lg:hidden` (panel-bottom-nav.tsx:165); R-C-5/6 OK | closed |
| T-04-SC@04 | Tampering | paquetes | low | accept | P04:335; sin diff (AR-04-04) | closed |
| T-04-29 | Repudiation (aprobación) | el recibo del checkpoint de la UAT | high | mitigate | P05:257 `blocking-human`; U 0 filas en `974a131` y 30 en `7917c5d`; OAuth real ✅ (U 4.2-4.4) | closed |
| T-04-30 | Tampering (producción) | el push de `974a131` | medium | mitigate | Push del orquestador tras confirmación del dueño; Tests y Vercel success | closed |
| T-04-31 | DoS (cobros reales) | probar el OAuth desconectando MP de un negocio real | high | mitigate | Prohibido en GU:40-46,221-222,252; 4.2 en negocio de prueba (U:29) | closed |
| T-04-32 | Repudiation (no-regresión) | fase con algo en rojo | high | mitigate | P05:123 (P-8); RM:1070; rc 1 sólo por la FALLA declarada `R-G3-10` (AR-03-11 de la Phase 3), anunciada en GU:350-352 | closed |
| T-04-33 | DoS (entorno) | build o suite contra el `next dev` del dueño | medium | mitigate | P05:120 (P-7); S05:62,119-120 | closed |
| T-04-SC@05 | Tampering | paquetes | low | accept | P05:320; sin diff (AR-04-04) | closed |
| T-04-34 | Repudiation (medición) | `esperado_tras_el_fix` | high | mitigate | `c7a1a78` (sólo GP) antes de `0777339`; 0 `esperado_*` borrados; RM:1110 `rojo (h)` 1/5; el cambio de instrumento P-1 lo decidió el dueño con control contra la corrida roja (`3c25616`, `9afe20b`) | closed |
| T-04-35 | Info disclosure | el fallback de las páginas | low | accept | P06:360; FP:30, NP:36, SP:49: `div` vacío con `aria-busy`, sin datos (AR-04-02) | closed |
| T-04-36 | Tampering (alcance) | `searchParams` en la página | medium | mitigate | tPT:631-653 (e) `not.toContain('searchParams')` en las tres | closed |
| T-04-37 | DoS (entorno) | la sonda contra el `next dev` ajeno | medium | mitigate | GP:135-137, AP:209-211 sólo `process.kill(pid,0)` sobre el ajeno; matan su hijo (GP:148, AP:223); 3031 en loopback | closed |
| T-04-SC@06 | Tampering | paquetes | low | accept | P06:363; sin diff (AR-04-04) | closed |
| T-04-38 | DoS (pantalla) | `?mp=` vacío o `?tab=integraciones&mp=…` traba los tabs | medium | mitigate | Mismo predicado en SC:1014 y SC:1119; PT:180-182; `cleansQuery` PH:123; 5 URLs + 2 controles en tPT:362-382; (g); UGa G8.1/G8.2 ✅ | closed |
| T-04-39 | DoS (dueño fuera del sitio) | dos consumos seguidos antes del retroceso | high | mitigate | PH:1024 (guarda primero), PH:1045-1048; E3 con `backAsincrono` tPT:765; candado del orden tPT:871-893; RM:1324 16/16; UGa G7.1 ✅. Residuo fuera de la mitigación declarada (cruce con `consumeOwnedPanelEntry`): AR-04-06 — **cerrado 2026-11-18 por mitigación (quick 261118-kat, `87868c4`)**: la guarda se comparte con `consumeOwnedPanelEntry` (K3a/K3b rojo 4/4 → verde, NR-b1-* 3/3, R-B1 4/4; RM ## (l)). **Corrección y cierre 2026-11-18 (quick 261118-pjd, `5d7ee5f`; RM ## (m)): el caso 3 por la barra seguía ABIERTO por el doble toque (CR-01): `CR-b1-doble` 3 retrocesos y `/afuera`, `CR-b1-doble-fichas` 4; con un solo segundo paso de B1 pendiente, 2/`dashboard` y 3/`dashboard` — cerrado por mitigación. WR-01 (opción A del dueño: «llegó» = state Y URL): `W1-menu` 2/`dashboard` → 1/`finances`, `W1-b1` 3/`afuera` → 2/`dashboard`. `UP-doble` (dos toques a Inicio desde una sección con la marca de la rama): 2 retrocesos y `/afuera` → 1 y `/dashboard`, cerrado por mitigación con la guarda compartida en `consumeOwnedBranchEntry` (`C-retroceso-unico-rama`).** **Además 2026-11-19 (quick 261119-32l, `a85adc0`; RM ## (n)): el consumo del sentinel de salida no pasaba por la guarda (CR-01 del review de 261118-pjd): `X2-exit-doble`, dos toques a la barra desde Inicio con el aviso armado, 2 retrocesos y `/afuera` → 1 y `/dashboard` con UNA navegación; `X2-destinos` 2/`afuera` → 1/`dashboard`. Cerrado por mitigación: `consumeOwnedExitSentinel` y el desmontaje del sentinel delegan en `consumeOwnedExitEntry` (la cuarta copia de la guarda, `C-retroceso-unico-salida`), y un solo segundo paso pendiente en todo `runBranchNavigation` (el último toque gana: `CO2-doble-colapso`, `CO-mixto`, `CO3-colapso-y-mas`). Candado anti `back()` suelto: `C-back-cerrado` con la lista cerrada de cuatro retrocesos en `lib/panel-history.ts` y cero en `lib/panel-branch.ts`, probado por mutación (M1 en `writePanelUnder` y M2 en `soltarSegundoPasoPendiente` lo ponen rojo).** | closed |
| T-04-40 | DoS (tabs muertos) | la guarda encendida sin que llegue `popstate` | medium | mitigate | Lo que está: la guarda sólo se enciende con `holding` (PH:1045), sondas sin flujo trabado (RM (i) 16/16, (j) 46/47). Lo hecho (quick 261118-kat, `87868c4`): `try`/`catch` alrededor del `back()` que suelta la guarda (K2-a rojo → verde), salida por `pageshow` con `persisted` como mitigación defensiva (K1 no reprodujo en Chrome 157; `C-pageshow-*` en el simulador) y el docblock corregido con el número y el residuo del retroceso ignorado en silencio (R2-WR-01, `04-REVIEW-2.md`; RM ## (l)). AR-04-05 cerrado. **Además 2026-11-18 (quick 261118-pjd, `5d7ee5f`; RM ## (m)): WR-02 — el `back()` que tira dejaba colgado el segundo paso en las tres ramas de dos pasos (`K2-c-b1` 2/`dashboard`, lo correcto 1/`finances`; `K2-c-b1-unidad`, `K2-c-exit`, `K2-c-colapso` sin desenganchar): `try`/`catch` que desengancha y relanza en las tres, verde. IN-01: el `pageshow` va sin disparo único (`C-pageshow-no-persistido` rojo → verde). Los candados de `pageshow` probados por mutación: M1 (sin el condicional de `persisted`) pone rojo `C-pageshow-no-persistido`, M2 (sin sacar el oyente) pone rojo `P0-normal`. WR-04: el residuo del retroceso ignorado en silencio con su radio (`CR-b1-silencio` 4/`afuera` → 2/`dashboard`).** **Además 2026-11-19 (quick 261119-32l, `a85adc0`; RM ## (n)): con la guarda colgada, el `up` y el colapso del guard de cambios sin guardar devolvían «se hizo cargo» sin hacer nada (WR-01 del review de 261118-pjd, S4): `S4-guard-up` y `S4-guard-colapso` daban `se-hizo-cargo` sin navegación; con `consumoEnVueloDesdeArriba` el consumidor sin `reDecidir` se niega y el guard degrada a la regla de rutas (`push /dashboard`, `replace /agenda`; `S4-control` verde antes y después), sin tocar el código del guard ni `lib/dirty-history.ts`. El radio del residuo suma un productor: un retroceso del sentinel ignorado en silencio también deja la guarda colgada (IN-02, la nota del hash, declarada); sigue sin medirse en ningún motor real.** | closed (mitigado, quick 261118-kat) |
| T-04-41 | Tampering (segundo dialecto) | guarda o criterio acotados por pantalla | medium | mitigate | La guarda en el ejecutor (PH:933-1049), el criterio en PT:154-182; candados del espejo `tocar` (tPT:863) y `volverDelOAuth` (tPT:696-700) | closed |
| T-04-42 | Spoofing (aviso) | `?mp=connected` pegada muestra el toast | low | accept | P07:365; SC:1128-1134 sólo pide el toast; el estado sale de los secretos del server (NP:45) (AR-04-03) | closed |
| T-04-43 | Info disclosure | la query decidiendo lecturas | low | mitigate | Páginas sin `searchParams` (e); PT puro, sin `window` fuera de comentarios | closed |
| T-04-SC@07 | Tampering | paquetes | low | accept | P07:367; sin diff (AR-04-04) | closed |
| T-04-44 | Tampering (producción) | `git push origin main` del cierre | high | mitigate | P08:24,34,199,213,224 (`blocking-human`, «push autorizado», sin `--force`); fast-forward `974a131..c3da6d0`; CI 44304086090 y Vercel success | closed |
| T-04-45 | Repudiation (re-UAT) | el recibo del task 3 | high | mitigate | P08:237 `blocking-human`; UGa 0 filas en `c3da6d0` y 8 en `573531c`; `c3da6d0` en `origin/main` | closed |
| T-04-46 | DoS (cobros reales) | probar el retorno del OAuth | high | mitigate | UGa:40 «No desconectes el MercadoPago»; G8 = URLs pegadas (S08:206) | closed |
| T-04-47 | Repudiation (no-regresión) | pedir el push con algo en rojo | high | mitigate | RM:1418; la única FALLA es la declarada de G3-10 (S08:125) | closed |
| T-04-48 | DoS (entorno) | build y suite del cierre | medium | mitigate | S08:115-117,130 | closed |
| T-04-SC@08 | Tampering | paquetes | low | accept | P08:293; sin diff (AR-04-04) | closed |

---

## Accepted Risks Log

| Risk ID | Threat Ref | Racional | Aceptado por | Fecha |
|---------|------------|----------|--------------|-------|
| AR-04-01 | T-04-04 | El tab sólo elige qué `TabsContent` se muestra; el negocio se resuelve por `owner_id` en el server y la página no lee `searchParams` | Plan 04-01 | 2026-11-17 |
| AR-04-02 | T-04-35 | El fallback del `<Suspense>` es un `div` vacío con `aria-busy`, sin ningún dato del negocio | Plan 04-06 | 2026-11-17 |
| AR-04-03 | T-04-42 | Una URL `?mp=connected` pegada sólo dispara el toast; la tarjeta muestra el estado real de los secretos del server y la cuenta no cambia | Plan 04-07 | 2026-11-17 |
| AR-04-04 | T-04-SC (×8: planes 01..08) | Cero paquetes nuevos; `package.json`/`package-lock.json` sin diff en toda la fase | Plan (milestone: cero dependencias) | 2026-11-17 → 2026-11-18 |
| AR-04-05 | T-04-40 (R2-WR-01) | La guarda de consumo en vuelo podría quedar encendida sin `popstate` (bfcache tras un retroceso que cruza de documento, o un `back()` que tira) y dejar los tabs sin responder hasta salir de la página. Derivado, sin medir; Chrome desmintió el caso hermano WR-04. **Vence con el `/gsd-quick` de R2-WR-01**, que mide primero y, si reproduce, suelta la guarda en `pageshow`, envuelve el `back()` en `try` y corrige el docblock (DI). **Cerrado 2026-11-18 (quick 261118-kat): cerrado por mitigación — caso 2 (el `back()` que tira) reprodujo en el simulador (K2-a: `oyentes: 1`, `siguiente: 'none'`) y se arregló con el `try`/`catch` (`87868c4`, verde); caso 1 (bfcache) NO reprodujo en Chrome 157 (K1-bfcache-cruce: cruzó de documento pero sin bfcache, `BroadcastChannelOnMessage`) y la salida por `pageshow` con `persisted` se puso por decisión del dueño (A), verificada sólo en el simulador; residuo sin medir: Safari iOS, Android real, pestaña restaurada, retroceso ignorado en silencio (RM ## (l)).** | Dueño | 2026-11-18 |
| AR-04-06 | T-04-39 (residuo) | La guarda no cubre `consumeOwnedPanelEntry` (menú NAV-08, primer paso de B1): consumir un tab y tocar la barra o el sidebar antes del `popstate` —o la dirección inversa, `04-REVIEW-2.md` IN-03— podría hacer un doble `back()`. Fuera de alcance a propósito en el 04-07 (P07:36,48; PH:1003-1007), sin medir. **Vence con el mismo quick de R2-WR-01**, que mide los dos sentidos del cruce. **Cerrado 2026-11-18 (quick 261118-kat): cerrado por mitigación — caso 3 reprodujo en los dos sentidos (K3a-nav08 2 retrocesos y `/dashboard`, K3a-b1 3 y `/afuera`, K3b-nav08 el tab volvía a consumir, K3b-b1 3 y `/afuera`); con la guarda compartida (`87868c4`) los cuatro dan verde sin regresar B1 (NR-b1-* 3/3, R-B1 4/4, R-T 12/12; RM ## (l)).** **Corregido 2026-11-18 (quick 261118-pjd): el cierre por la barra NO cubría el doble toque (CR-01 del review del quick 261118-kat): `CR-b1-doble` 3 retrocesos y `/afuera`, `CR-b1-doble-fichas` 4, y el mismo molde en `up` (`UP-doble` 2 y `/afuera`). Con un solo segundo paso de B1 pendiente y la guarda compartida también en `consumeOwnedBranchEntry` (`5d7ee5f`) dan 2/`dashboard`, 3/`dashboard` y 1/`dashboard`, sin regresar B1 (R-B1 4/4 con el retroceso triple, R-T 12/12, estática 18/18, scroll 8/8; RM ## (m)) — cerrado por mitigación.** | Dueño | 2026-11-18 |

---

## Superficie de seguridad nueva

Cero migraciones, cero policies, cero cambios en `app/api`, cero queries modificadas (el diff de la fase no toca
ninguna línea con `.from(`, `business_id`, `owner_id`, `getBusinessSecrets` ni cliente admin). El aislamiento por
tenant no cambia: la query de la URL decide qué se muestra entre datos que el server ya filtró por el negocio del
dueño.

### Flags sin registro

Ninguno: los `## Threat Flags` de 04-03..04-08 dicen «sin superficie nueva» o remiten a ids registrados.

### Fuera del registro

- R2-IN-04 (doble toque en una fila de Clientes apila `?c=A` sobre `?c=A`, `clients-client.tsx:1055`): existía
  desde v0.30 en un archivo intocable para esta fase; anotado en DI, sin medir.
- obs-G1 (recorte de scroll con 0 ventas) e IN-02 de la ronda 1: UX/scroll, no seguridad.

---

## Security Audit Trail

| Fecha | Amenazas | Cerradas | Abiertas | Corrida por |
|-------|----------|----------|----------|-------------|
| 2026-11-18 | 56 | **55** + 1 aceptada (T-04-40 → AR-04-05) | **0** bloqueantes (1 medium abierta antes de la aceptación del dueño) | `gsd-security-auditor` (opus), estático: grep/read/git + `vitest --project pure` sobre 5 suites (520/520) + `gh` (CI y Vercel de `974a131` y `c3da6d0`) |
| 2026-11-18 | 56 | **56** (T-04-40 mitigada; AR-04-05 y AR-04-06 cerrados por mitigación) | **0** | quick 261118-kat: K/NR 9/9 y C 3/3 en el simulador (rojo 5 K + 2 C antes del `fix`), K1 no reprodujo en Chrome 157 (mitigación defensiva por decisión del dueño), pura 77/1857, 8 suites 683, `tsc`/eslint/build verdes, R-T 12/12, R-B1 4/4 (sólo la FALLA declarada), estática 18/18, scroll 8/8 |
| 2026-11-18 | 56 | **56** (T-04-39 y T-04-40 con el review del quick 261118-kat cerrado; AR-04-06 corregido y cerrado por mitigación) | **0** | quick 261118-pjd: 14 + 4 casos en el simulador y el stub (12 rojos antes del `fix`: CR-01, WR-02, WR-01, IN-01 y `UP-doble` reprodujeron), `UP-doble` 2/`afuera` → 1/`dashboard` con `C-retroceso-unico-rama` rojo antes del `fix`, WR-01 opción A del dueño, M1/M2 rojas, 521/521 en las tres suites, pura 77/1876, 8 suites 702, `tsc`/eslint verdes, build verde (fuera del gate tras apartar `.next/dev/types` corrupto), R-T 12/12, R-B1 4/4 (sólo la FALLA declarada), estática 18/18, scroll 8/8 |
| 2026-11-19 | 56 | **56** (T-04-39 y T-04-40 con el review del quick 261118-pjd cerrado: CR-01 X2, WR-01 S4, IN-01..04) | **0** | quick 261119-32l: 9 casos en el simulador + 2 candados de fuente + `C-oyentes-de-la-guarda` (9 rojos antes del `fix` en `2a38661`: CR-01, IN-03 y WR-01 reprodujeron; controles verdes), arreglo `a85adc0` (FX + FU + FW), 361/361 en las dos suites, M1/M2 rojas en `C-back-cerrado`, pura 77/1888, 8 suites 714, `panel-tabs` 123, `tsc`/eslint verdes, build verde, app 47 medidos / 46 coinciden (sólo la FALLA declarada), R-T 12/12, R-B1 4/4, estática 18/18, scroll 8/8; una tercera línea vieja del candado del desmontaje editada por decisión del dueño (P-4, opción A) |

- **Incidente registrado (T-04-08):** el 2026-11-17 entre 07:42 y 07:47 una corrida de pantalla se lanzó fuera del
  turno, accidentalmente, y se cortó; quedó autodeclarada en S01:186-188 y corregida. Todas las demás corridas de la
  fase pasaron por `scripts/con-turno.mjs`. Sin exposición hoy.
- **T-04-32/T-04-47:** el único rojo tolerado de la sonda de la app es `R-G3-10-primer-toque-atras-pronto`, el riesgo
  AR-03-11 aceptado en la Phase 3 (`03-SECURITY.md`).

---

## Sign-Off

- [x] Todas las amenazas tienen disposición (mitigate / accept / transfer)
- [x] Riesgos aceptados documentados en el Accepted Risks Log
- [x] `threats_open: 0` confirmado
- [x] `status: verified` en el frontmatter

**Aprobación:** verificada 2026-11-18.

⚠ **Lo que esta firma NO dice.** AR-04-05 y AR-04-06 son aceptaciones **con vencimiento**: el quick de R2-WR-01
tiene que medirlas y, si reproducen, cerrarlas por mitigación (y actualizar este archivo). No son riesgos
permanentes.

**2026-11-18 (quick 261118-kat): el vencimiento se cumplió.** AR-04-05 y AR-04-06 quedaron medidos y cerrados por
mitigación (`87868c4`; `.planning/debug/tabs-en-la-url-medida.md` ## (l)). Lo que sigue sin medir está declarado ahí.
