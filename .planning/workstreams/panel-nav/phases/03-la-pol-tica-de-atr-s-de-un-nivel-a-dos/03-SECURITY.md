---
phase: "03"
slug: "la-pol-tica-de-atr-s-de-un-nivel-a-dos"
status: verified
# threats_open = cantidad de amenazas OPEN con severidad >= workflow.security_block_on (high)
threats_open: 0
asvs_level: 1
created: "2026-11-16"
---

# Phase 03 — Security

> Contrato de seguridad de la fase: registro de amenazas, riesgos aceptados y traza de auditoría.

**Base de la fase:** `06c083e^` · **HEAD auditado:** `f26581c` · **ASVS:** 1 · **block_on:** `high`
**Origen del registro:** los 17 `<threat_model>` de los PLAN (`register_authored_at_plan_time: true`): 145
entradas, 110 `mitigate` y 35 `accept`; severidad 1 critical, 75 high, 34 medium, 35 low.
Los IDs que se repiten entre planes llevan el plan como sufijo: `T-03-SC` (×9), `T-03-21/22/23` (03-04 y
03-05) y `T-03-57..61` (03-10 y 03-11). Son amenazas distintas con el mismo número, no duplicados.

**Leyenda de la evidencia:** PB = `lib/panel-branch.ts` · PH = `lib/panel-history.ts` · BN =
`components/dashboard/panel-bottom-nav.tsx` · UG = `components/dashboard/unsaved-changes-guard.tsx` · PMo =
`components/dashboard/plan-modal.tsx` · tPB = `test/panel-branch.test.ts` · tPH = `lib/panel-history.test.ts` ·
tNC = `test/panel-nav-chrome.test.ts` · tUC = `lib/unsaved-changes.test.ts` · SP =
`.planning/debug/probes/panel-back-stack.mjs` · AP = `.planning/debug/probes/panel-exit-en-la-app.mjs` · PM =
`.planning/debug/pila-de-dos-niveles-medida.md` · AM = `.planning/debug/la-absorcion-que-no-absorbe-medida.md` ·
RQ = `REQUIREMENTS.md` del workstream · W = `.planning/WINDOWS.md` · U2 = `03-UAT-2.md` · G2/G3 =
`03-UAT-GUION-2/3.md` · DU3 = `03-DECISION-UAT-3.md`. Los números de línea son los del HEAD auditado.

---

## Trust Boundaries

| Boundary | Descripción | Datos que la cruzan |
|----------|-------------|---------------------|
| Panel ↔ historial del navegador | La política de atrás escribe en el historial (`pushState`/`replaceState`, el sentinel `#salir`) y lee `popstate`: un retroceso sobre una entrada ajena saca al dueño del sitio | Marcas de rama (`frjUnder`), hash de salida, estado de overlays |
| Panel ↔ intervención de historial de Chrome | Una entrada empujada sin activación del usuario la saltea el atrás de la interfaz; la política sólo empuja con activación (camino 1, DU3) | `navigator.userActivation`, el orden toque/atrás |
| Escritores del historial entre sí | `panel-branch`, `overlay-history`, `dirty-history` y la guarda de cambios sin guardar comparten la misma pila; dos dueños por una entrada descuadran el conteo | Dominio de la entrada, `exitId` |
| Sondas de medición ↔ máquina del dueño | Las sondas levantan Chrome por CDP en loopback, con perfil descartable y el usuario del seed local; nunca matan el `next dev` del dueño ni tocan producción | Credenciales del seed, puerto CDP local |
| Canal de diagnóstico ↔ bundle de producción | `__forjoPanelDiag` / `recordExitDiag` graba decisiones sólo con `NODE_ENV` de desarrollo o test (WR-05) | Decisiones de navegación (sin datos del negocio) |

---

## Threat Register

| Threat ID | Plan | Categoría | Componente | Sev | Disp | Evidencia | Status |
|-----------|------|-----------|------------|-----|------|-----------|--------|
| T-03-01 | 03-01 | Denial of Service (del dueño, contra su propia sesión) | un retroceso sobre una entrada ajena ⇒ el dueño fuera del sitio (la cicatriz 2, ya sufrida tres veces en es… | high | mitigate | PH:495-496 las ramas nuevas devuelven push; tPH:659,1039 entrada directa ⇒ push; PM E-7 | closed |
| T-03-02 | 03-01 | Tampering | la rama `from === to` desplazada de primera en un refactor ⇒ dos entradas idénticas = atrás muerto | medium | mitigate | PH:492-497; gate de secuencia re-corrido = SEQ_OK; tPH:514 /mas→/mas replace | closed |
| T-03-03 | 03-01 | Repudiation (de la verificación misma) | la forma de la pila aceptada por razonamiento en vez de por medición | high | mitigate | SP E-1..E-18, exitCode=1 en SP:2149,2155; PM «Lo que esta sonda NO puede cerrar» | closed |
| T-03-04 | 03-01 | Tampering | la sonda convertida en código de la app (en `lib/` o `scripts/` del build) ⇒ superficie nueva en producción | low | mitigate | sondas `.mjs` en .planning/debug/probes; 0 imports desde app/lib/components; SP importa sólo `node:*` | closed |
| T-03-SC@01 | 03-01 | Tampering (supply chain) | dependencias npm | low | **accept** | archivos de paquetes sin diff 06c083e^..HEAD | closed |
| T-03-05 | 03-02 | Denial of Service (del dueño, contra su propia sesión) | un retroceso sin marca ⇒ el dueño fuera del sitio (cicatriz 2). El caso vivo es "entró directo a `/finances… | high | mitigate | PH:702 regla 0; PH:1063-1064 las dos guardas; tPH:1039, barrido tPH:1182 | closed |
| T-03-06 | 03-02 | Tampering | dos dueños por la misma entrada ⇒ se descuadra el conteo de retrocesos y queda un atrás muerto o uno de más | high | mitigate | clave nueva `frjUnder` PH:231; hook sólo en BN:108; tPH:734 | closed |
| T-03-07 | 03-02 | Tampering | la marca agregada al predicado de la regla 0 ⇒ `applyPanelView` se abstiene sobre cualquier entrada marcada… | medium | mitigate | `frjUnder` en el predicado = 0 (PH:356-358); tPH:728,800,991 | closed |
| T-03-08 | 03-02 | Tampering | la escritura de la marca propagando el estado actual ⇒ la URL cambia sin que el router se entere y sin un e… | high | mitigate | PH:920 `replaceState(panelUnderState(route), '')`, 2 args, literal fresco; 0 spreads de state; tPH:852 | closed |
| T-03-09 | 03-02 | Repudiation (de la verificación) | la cadena de dos pasos aceptada por razonamiento | high | mitigate | PM E-3/E-4/E-5; A1/A2/A11 derivados a la UAT y corridos (U2) | closed |
| T-03-10 | 03-02 | Elevation of Privilege | — | low | **accept** | racional en la fila del PLAN | closed |
| T-03-SC@02 | 03-02 | Tampering (supply chain) | dependencias npm | low | **accept** | sin diff en archivos de paquetes | closed |
| T-03-11 | 03-03 | Denial of Service (del gesto del dueño) | el atrás absorbido sin aviso visible ⇒ botón muerto: el gesto no hace nada y no dice por qué | high | mitigate | el aviso es hermano de `<nav lg:hidden>` (BN:155-263); `drawsExitHint:true` BN:110; PB:727; tNC:969 | closed |
| T-03-12 | 03-03 | Tampering | dos dueños por la misma entrada ⇒ el doble empuje cuesta dos atrás y el doble consumo se come una entrada a… | high | mitigate | instancia única BN:108; `nextBranchId` PB:1276; re-derivación PB:1628-1683; chequeo de id PB:311 | closed |
| T-03-13 | 03-03 | Tampering | el sentinel pisado por `applyPanelView` ⇒ su dueño no lo reconoce, no lo consume y queda basura más un atrá… | high | mitigate | PH:357 incluye el sentinel de salida; tPH:806; anti-deriva tPB:955 | closed |
| T-03-14 | 03-03 | Tampering | la ventana del aviso duplicada en dos constantes ⇒ lo que el dueño ve y lo que el código acepta se desincro… | medium | mitigate | **reemplazada por el 03-13 (DU3)**: constante de ventana y timer borrados; tPB:320,329; una subida/una bajada PB:1797,1851 | closed |
| T-03-15 | 03-03 | Denial of Service (del gesto) | el teclado se come el atrás y gasta el aviso ⇒ el segundo atrás sale del sitio sin que el dueño haya querid… | medium | mitigate | `keyboardGuards`→`rearm` PB:782,1783-1789; PB:1128 | closed |
| T-03-16 | 03-03 | Repudiation (de la verificación) | la forma del sentinel debajo de una sección aceptada por razonamiento ⇒ un atrás muerto en cada salida de I… | high | mitigate | PM E-6; PB:730 | closed |
| T-03-17 | 03-03 | Information Disclosure | el hash del sentinel coincidiendo con el identificador de un elemento ⇒ el navegador scrollea hasta él al a… | low | mitigate | barrido de ids `salir` = 0; PB:516-518 | closed |
| T-03-SC@03 | 03-03 | Tampering (supply chain) | dependencias npm | low | **accept** | cero dependencias nuevas | closed |
| T-03-18 | 03-04 | Denial of Service (pérdida de trabajo del dueño) | "Salir sin guardar" aterrizando con la política vieja ⇒ el dueño descartó trabajo y terminó en el lugar equ… | high | mitigate | UG:241-271 switch exhaustivo (`never` en :271), delega en UG:261; tUC:140; U2 ronda 2 ítem 15 pasó | closed |
| T-03-19 | 03-04 | Tampering | el provider retrocediendo por su cuenta ⇒ doble consumo ⇒ el dueño fuera del sitio | high | mitigate | 0 llamadas crudas de historial en UG; tPB:1301; tNC bloque 4 | closed |
| T-03-20 | 03-04 | Repudiation (de la verificación) | la fase marcada como verificada sin que nadie haya abierto el teléfono | high | mitigate | 03-04-PLAN:280 `gate="blocking-human"`; 03-04-SUMMARY:256 no auto-aprobado | closed |
| T-03-21@04 | 03-04 | Repudiation | los tres casos medidos del plan de salida reescritos al ampliarlo ⇒ se pierden las tres mediciones que just… | medium | mitigate | 5cde71d +84/−0 en tUC; el −5 posterior (1c78363) sólo actualiza conteos 5→6; casos medidos tUC:53,58,65 intactos | closed |
| T-03-22@04 | 03-04 | Tampering (de los artefactos) | un requisito completo contradiciendo al código en silencio (MOB-07 vs D-05) | medium | mitigate | RQ:325-346 enmienda fechada de MOB-07 vs criterio 6 | closed |
| T-03-23@04 | 03-04 | Repudiation | MOB-05 quedando como "pendiente silencioso" o marcado como hecho antes de verificarse | medium | mitigate | «decisión abierta» 0 hits en RQ; MOB-04/05/06 `- [ ]` RQ:57,144,273 | closed |
| T-03-SC@04 | 03-04 | Tampering (supply chain) | dependencias npm | low | **accept** | cero dependencias nuevas | closed |
| T-03-21@05 | 03-05 | Spoofing (de la pila) | `branchMarkDecision` / el efecto de marcado | high | mitigate | regla de dirección primero, sin default PB:1376-1389; tPB:621-677 | closed |
| T-03-22@05 | 03-05 | Tampering | la entrada a la que se vuelve | high | mitigate | idempotencia PH:918; tPH:871,882 | closed |
| T-03-23@05 | 03-05 | Repudiation (de la medición) | `.planning/debug/probes/panel-back-stack.mjs` | high | mitigate | SP E-11; PM §E-11 | closed |
| T-03-24 | 03-05 | Elevation of privilege | el canal de propagación a nivel de módulo | medium | mitigate | PB:209-219 siempre descarta, compara con el destino; tPB:763,772 | closed |
| T-03-25 | 03-05 | Denial of service (del gesto) | el rastreo del retroceso | medium | mitigate | guarda una ruta, no un booleano (PB:126-147); tPB:718 | closed |
| T-03-26 | 03-05 | Tampering (del contrato de diseño) | `lib/panel-branch.ts` | medium | mitigate | **reemplazada por el 03-13**: un timer → cero timers; tPB:329 | closed |
| T-03-27 | 03-05 | Information disclosure | — | low | **accept** | sin datos de tenant, 0 migraciones | closed |
| T-03-28 | 03-06 | Denial of service (del gesto) | la entrada del sentinel enterrada | high | mitigate | PH:689 sexto miembro; PB:367-389; PM E-9, E-12 | closed |
| T-03-29 | 03-06 | Spoofing (del gesto) | el retroceso deliberado del consumo | high | mitigate | PB:1971 el dominio se libera antes de delegar; tPB:1259,1277 | closed |
| T-03-30 | 03-06 | Elevation of privilege | `runBranchNavigation` desde el provider del guard | high | mitigate | PB:371 sin `exitId` ⇒ false; UG:261 llamado sin `exitId`; tPB:1184,1292 | closed |
| T-03-31 | 03-06 | Tampering | el listener del segundo paso | high | mitigate | `once:true` PB:382,427; remoción manual PB:387,431; tPB:1129,1199 | closed |
| T-03-32 | 03-06 | Repudiation (de la decisión) | la regla de (a) | medium | mitigate | PB:487-491,679-686; PM §límite; W entrada 15; tPB:1075 | closed |
| T-03-33 | 03-06 | Tampering (del contrato de diseño) | `lib/panel-branch.ts` | medium | mitigate | viewport 0; timers 0 (parte del timer reemplazada por el 03-13); tPB:356 | closed |
| T-03-34 | 03-06 | Information disclosure | — | low | **accept** | sin datos de tenant | closed |
| T-03-35 | 03-07 | Denial of service (de la guarda) | el efecto del armado | high | mitigate | 4 llamadas de armado PB:1711,1779,1787,1856; tPB:1702 | closed |
| T-03-36 | 03-07 | Spoofing (del dominio) | la variable de la instancia dueña | high | mitigate | `instanciasVivas` PB:1302,1542-1546; `branchOwnerDecision` pura PB:1327; tPB:1321-1356 | closed |
| T-03-37 | 03-07 | Tampering | el estado de la entrada del sentinel | high | mitigate | séptima regla PB:735; PB:614; PM E-13; tPB:1398-1500 | closed |
| T-03-38 | 03-07 | Elevation of privilege | el reintento en el camino del aviso | high | mitigate | la rama del aviso termina sin re-armar PB:1791-1797; tPB:1715,1729 | closed |
| T-03-39 | 03-07 | Repudiation (de la verificación) | el guion de la UAT | high | mitigate | observable PB:472-478; G2 Bloque 0; tPB:1795 | closed |
| T-03-40 | 03-07 | Tampering (de la decisión del dueño) | la negativa correcta del armado | medium | mitigate | par adyacente tPB:1368-1389 | closed |
| T-03-41 | 03-07 | Information disclosure | — | low | **accept** | sin datos de tenant | closed |
| T-03-42 | 03-08 | Repudiation (de la verificación) | el checkpoint de la UAT | critical | mitigate | 03-08-PLAN:222 blocking-human; `.planning/config.json:26` `auto_advance:true`; 03-08-SUMMARY:265 no auto-aprobado; sin 03-VERIFICATION.md; resultados del dueño U2:416-444, 521-531, 638-650, 730-738; MOB-04/05/06 sin marcar (RQ:57,144,273) hasta /gsd-verify-work | closed |
| T-03-43 | 03-08 | Tampering (de la evidencia del dueño) | `03-04-SUMMARY.md` | high | mitigate | 03-04-SUMMARY marcas 14→18 vs 7c756a5, 0 líneas de marca borradas | closed |
| T-03-44 | 03-08 | Denial of service (del verificador) | el alcance del guion de la ronda 2 | high | mitigate | G2 Bloque 4 (motivo por ítem) + Bloque 5 (exclusiones nombradas) | closed |
| T-03-45 | 03-08 | Information disclosure (de un falso verde) | los ítems que vuelven por el camino nuevo de salida de Inicio | high | mitigate | G2 Bloque 0 (l.52); la URL observable en 7 lugares | closed |
| T-03-46 | 03-08 | Denial of service (de la cobertura) | el pase de iPhone | high | mitigate | G2/G3 Bloque 6; U2:438-444 iPhone «esta ok» | closed |
| T-03-47 | 03-08 | Tampering (del registro) | `.planning/WINDOWS.md` | medium | mitigate | W: id12 arreglado, id13 abierto, id14 reemplaza al 13; tabla vs JSON 0 diferencias; cabecera 18/2/20 | closed |
| T-03-48 | 03-08 | Elevation of privilege (de una decisión de fase a hecho del proyecto) | `REQUIREMENTS.md` | medium | mitigate | RQ:57,144,273 sin marcar | closed |
| T-03-49 | 03-08 | Information disclosure | — | low | **accept** | sólo docs | closed |
| T-03-50 | 03-09 | Denial of service (del gesto) | `panelNavMode` rama 3 / el ciclo Inicio↔sección | high | mitigate | regla -1c PH:699; tPH:1200,1220; PM E-14 | closed |
| T-03-51 | 03-09 | Spoofing (de la pila) | la entrada de Inicio apilada + `panelExitArmAction` regla 7 | high | mitigate | PH:699; PM E-14 acción de armado por vuelta | closed |
| T-03-52 | 03-09 | Elevation of privilege | el retroceso de la regla nueva | high | mitigate | `raizDebajo` sin default PH:669; PH:702; PH:1063-1064; PM E-16 | closed |
| T-03-53 | 03-09 | Tampering (del criterio 6) | `panelBranchPlan` como decisión compartida | medium | **accept** | declarado PH:604-617, UG, PM §residuo de desktop, W entrada 16; tPB:906 | closed |
| T-03-54 | 03-09 | Repudiation (de la medición) | `.planning/debug/probes/panel-back-stack.mjs` | high | mitigate | SP y PM E-14/E-15/E-16 | closed |
| T-03-55 | 03-09 | Tampering | la entrada original de Inicio tras el retroceso | medium | mitigate | PB:1389; tPH:1200 | closed |
| T-03-56 | 03-09 | Information disclosure | — | low | **accept** | sin datos de tenant | closed |
| T-03-57@10 | 03-10 | Repudiation (de la verificación) | el checkpoint de la ronda 3 | high | mitigate | 03-10-PLAN:214 blocking-human; auto_advance:true | closed |
| T-03-58@10 | 03-10 | Spoofing (del resultado) | los ítems que se verifican *a ojo* | high | mitigate | G3 Bloque 0 (l.142) | closed |
| T-03-59@10 | 03-10 | Tampering (del registro) | `.planning/WINDOWS.md` | medium | mitigate | mitades de W consistentes (0 diferencias) | closed |
| T-03-60@10 | 03-10 | Information disclosure | el guion y los documentos | low | **accept** | sin datos de tenant | closed |
| T-03-61@10 | 03-10 | Denial of service (del proceso) | el alcance de la ronda 3 | medium | mitigate | G3 bloques 1-3 (8 recorridos) + Bloque 5 con motivos | closed |
| T-03-57@11 | 03-11 | Spoofing (de la pila) | la entrada de sección sin marca después de la cadena de `replace` | high | mitigate | PB:267-284 llamado en PB:1960 sobre la misma lectura; PM E-17 | closed |
| T-03-58@11 | 03-11 | Tampering | el canal de propagación con un pedido rancio | high | mitigate | PB:209-219 + regla de misma ruta PB:280; tPB:2160 | closed |
| T-03-59@11 | 03-11 | Elevation of privilege | el retroceso que la regla `-1c` dispara con una marca propagada | high | mitigate | se abstiene sin valor leído PB:281; escritor único PH:913; back() = 2 | closed |
| T-03-60@11 | 03-11 | Denial of service (del gesto) | la pila que crece sin techo tras un paseo por varias secciones | high | mitigate | PM profundidad E-17 | closed |
| T-03-61@11 | 03-11 | Tampering (del criterio 6) | el camino del guard de cambios sin guardar | medium | **accept** | declarado PB:177-187, PM §residuo de la guarda, RQ MOB-04, W entrada 18 | closed |
| T-03-62 | 03-11 | Repudiation (de la medición) | `.planning/debug/probes/panel-back-stack.mjs` | high | mitigate | SP y PM E-17/E-18 | closed |
| T-03-63 | 03-11 | Tampering | el arreglo que colapsa un no-defecto declarado | medium | mitigate | PM E-18; G3 2.1 (l.289), 2.3 (l.313) | closed |
| T-03-64 | 03-11 | Information disclosure | — | low | **accept** | sin datos de tenant | closed |
| T-03-65 | 03-12 | Repudiation (de la medición) | la sonda de la app real, si mide sin estar logueada | high | mitigate | AP:722-728 la aserción de llegada tira | closed |
| T-03-66 | 03-12 | Repudiation (de la medición) | el recorrido del temporizador, si no prueba que el tiempo pasó | high | mitigate | piso de tiempo en la página AP:1730-1732 (la ventana temporizada se fue con el 03-13) | closed |
| T-03-67 | 03-12 | Tampering | el canal de diagnóstico, si puede tirar | medium | mitigate | try/catch PB:1251-1266; tPB:2308,2331 | closed |
| T-03-68 | 03-12 | Denial of service | el canal de diagnóstico, si crece sin techo | low | mitigate | `PANEL_EXIT_DIAG_MAX=200` PB:1204,1262; tPB:2297 | closed |
| T-03-69 | 03-12 | Information disclosure | el registro del diagnóstico | low | **accept** | registra decisiones solamente | closed |
| T-03-70 | 03-12 | Spoofing | el usuario sembrado que la sonda usa para loguearse | medium | mitigate | credenciales del seed AP:112-113; sólo 127.0.0.1 AP:98-102,177 (reusar el `next dev` del dueño: T-03-84) | closed |
| T-03-71 | 03-12 | Tampering | `next.config.ts`, mutado para el discriminador | high | mitigate | next.config.ts sin `reactStrictMode`; 3 IPs de LAN en :56; último cambio 2fc3fcc | closed |
| T-03-72 | 03-12 | Elevation of privilege | — | low | **accept** | back() = 2 confirmado | closed |
| T-03-73 | 03-12 | Tampering (del criterio 6) | — | low | **accept** | PH: 0 commits en el rango del 03-12 | closed |
| T-03-74 | 03-12 | Information disclosure | la superficie multi-tenant | low | **accept** | 0 migraciones | closed |
| T-03-75 | 03-13 | Spoofing (de la pila) | el empuje sin activación que el navegador saltea, con el hash a la vista | high | mitigate | PB:1670 `if (accion === 'arm' && puedeEmpujar)`; PB:1711,1825; PB:1779,1787 pasan false; tPB:1774 | closed |
| T-03-76 | 03-13 | Elevation of privilege (de la pila) | el toque que navega y además arma: el sentinel enterrado bajo la sección o pisado por el `replace` del router | high | mitigate | listeners en burbuja PB:1871-1872; `defaultPrevented` PB:997,1831; Enter/espacio PB:1816; tPB:2502-2509 | closed |
| T-03-77 | 03-13 | Tampering | el hallazgo lateral: el re-armado adentro del `popstate` del consumo de la barra entierra el sentinel | high | mitigate | sin push desde popstate; reintento por estado PB:1778; tPB:1715,1839 | closed |
| T-03-78 | 03-13 | Spoofing | (A): un hash rancio o ajeno tratado como nuestro sentinel | high | mitigate | formas exactas del hash PB:614-622; PB:855; tPB:1539,1567 | closed |
| T-03-79 | 03-13 | Denial of service (del gesto) | el cartel que el dueño no se ganó | medium | **accept** | costo de DU3 | closed |
| T-03-80 | 03-13 | Tampering | lo que el dueño ve y lo que el código acepta, separados (la regla de MOB-05) | high | mitigate | 0 timers; PB:1797/1851; PB:1986; tPB:338,2659 | closed |
| T-03-81 | 03-13 | Denial of service (del aviso) | entrar directo, recargar, volver con el atrás o bajar el teclado sin tocar: el atrás sale sin aviso | medium | **accept** | DU3; RQ:144; G3 1.3-1.5; W entrada 20 | closed |
| T-03-82 | 03-13 | Repudiation (de la medición) | una sonda verde que no ve la regla del navegador | high | mitigate | AP C-activacion (l.1501, rama de parada l.1529); aserción `sonda-click` AP:666-684 | closed |
| T-03-83 | 03-13 | Repudiation (de la aprobación) | el recibo del checkpoint | high | mitigate | 03-13-PLAN:845 blocking-human; U2:416-444 | closed |
| T-03-84 | 03-13 | Tampering | `next.config.ts` y el servidor de desarrollo del dueño | medium | mitigate | AP:210-214 sólo sonda de vida `kill(pid,0)`; mata sólo a su propio hijo AP:223-224 | closed |
| T-03-85 | 03-13 | Elevation of privilege | un camino nuevo que retroceda | low | **accept** | back() = 2 | closed |
| T-03-86 | 03-13 | Tampering (del criterio 6) | el mecanismo en escritorio | low | **accept** | viewport 0 en los 4 archivos | closed |
| T-03-87 | 03-13 | Information disclosure | el registro `toque` del canal de diagnóstico | low | **accept** | sólo dev, acotado | closed |
| T-03-88 | 03-13 | Information disclosure | la superficie multi-tenant | low | **accept** | 0 migraciones | closed |
| T-03-SC@13 | 03-13 | Tampering | instalaciones de paquetes | low | **accept** | sin instalaciones | closed |
| T-03-89 | 03-14 | Spoofing (de la pila) | la limpieza del desmontaje que consume el sentinel recién empujado durante el remontaje simulado (`G3-4`, s… | high | mitigate | PB:1907 microtask; PB:941 `sigueMontada` primero; tPB:2754-2832; medido en 4c9ac4b (`R-login-con-activacion` retirado por decisión del dueño, 9f0c647; el arreglo se queda) | closed |
| T-03-90 | 03-14 | Elevation of privilege (de la pila) | un `history.back()` diferido que aterriza sobre una entrada ajena (la del router, después de un desmontaje… | high | mitigate | marca re-leída dentro del microtask PB:1909-1910; tPB:2766,2793 | closed |
| T-03-91 | 03-14 | Tampering | tiempo reintroducido en el ciclo del aviso para diferir | high | mitigate | timers = 0 en PB | closed |
| T-03-92 | 03-14 | Repudiation (de la medición) | un recorrido verde sobre un aterrizaje sin activación (`pendiente`), o un arreglo sobre una hipótesis sin m… | high | mitigate | AP:2036 «NO REPRODUCE…», AP:2105 `llegada_con_activacion`; AM (g) H1 | closed |
| T-03-93 | 03-14 | Information disclosure | la contraseña en la URL si la rama H2 toca el login y pierde `method=post` | high | mitigate | (auth) sin tocar en el 03-14; `method="post"` en login:92, register:138, forgot:124, reset:118; forms-no-get-leak verde | closed |
| T-03-94 | 03-14 | Tampering | `next.config.ts` y el `next dev` del dueño | medium | mitigate | next.config.ts sin cambios desde 2fc3fcc | closed |
| T-03-95 | 03-14 | Information disclosure | el instrumento `sonda-historia` graba pilas y URLs | low | **accept** | sólo sonda, perfil descartable | closed |
| T-03-96 | 03-14 | Information disclosure | el registro `desmontaje` del canal de diagnóstico | low | **accept** | sólo dev, acotado | closed |
| T-03-97 | 03-14 | Repudiation (de la aprobación) | el recibo del checkpoint | high | mitigate | 03-14-PLAN:491; aprobado U2:521-531 | closed |
| T-03-98 | 03-14 | Spoofing | el cierre de sesión de la sonda | low | **accept** | perfil descartable, usuario del seed | closed |
| T-03-SC@14 | 03-14 | Tampering | instalaciones de paquetes | low | **accept** | sin instalaciones | closed |
| T-03-99 | 03-15 | Repudiation (de la medición) | un veredicto sobre un recorrido cuyo control o guarda no pasó, o un arreglo sobre una hipótesis sin medir | high | mitigate | AM líneas de veredicto 706, 759, 802, 826 | closed |
| T-03-100 | 03-15 | Denial of service (del gesto) | `alTocar` con el `keyup` de Alt+flecha: el atrás de teclado en escritorio nunca sale (`G3-5`, el botón muerto) | high | mitigate | `panelExitKeyStep` PB:1046; AP R-G3-5-* en los dos órdenes de soltado; U2:645 4.3 pasó | closed |
| T-03-101 | 03-15 | Tampering (de la navegación) | `confirmLeave` sin sentinel con el colapso: el dueño descarta su trabajo y termina en Más (`G3-6`) | high | mitigate | medido `veredicto G3-6: descartado` AM:759; el dueño eligió no arreglar (U2:597); UG sin cambios | closed |
| T-03-102 | 03-15 | Elevation of privilege (de la pila) | un reintento de armado que entierra `#salir` bajo una navegación, o un retroceso nuevo sobre una entrada aj… | high | mitigate | PB:890; R-lateral; back 2 / push 1 | closed |
| T-03-103 | 03-15 | Tampering | tiempo reintroducido en el ciclo del aviso por alguno de los arreglos | high | mitigate | 0 timers; tNC:996, tPB:329 | closed |
| T-03-104 | 03-15 | Information disclosure | el canal `recordExitDiag` / `globalThis.__forjoPanelDiag` en el build de producción (WR-05) | medium | mitigate | el gate es la primera sentencia PB:1250; PB:1236; sin flag público; tPB:2379-2427 (residuo declarado: el bundle de prod no se midió con un build) | closed |
| T-03-105 | 03-15 | Tampering | `next.config.ts`, los intocables y el `next dev` del dueño | medium | mitigate | intocables sin diff 1814109..HEAD | closed |
| T-03-106 | 03-15 | Spoofing (de la medición) | la precondición forzada de `G3-6` (el descarte de un empuje del sentinel de cambios) confundida con un cami… | medium | mitigate | AP:329-344 `pushState-descartado`, apagado por omisión | closed |
| T-03-107 | 03-15 | Information disclosure | los instrumentos `sonda-router`, `sonda-tecla` y el cierre de sesión de `R-G3-8-rebote` | low | **accept** | sólo sonda | closed |
| T-03-108 | 03-15 | Repudiation (de la aprobación) | el recibo del checkpoint | high | mitigate | 03-15-PLAN:891; paró en P-4, nunca auto-aprobado (U2:576-599) | closed |
| T-03-SC@15 | 03-15 | Tampering | instalaciones de paquetes | low | **accept** | sin instalaciones | closed |
| T-03-109 | 03-16 | Denial of service (del gesto) | `alTocar` con los keyup del atajo de atrás: el aviso se baja al soltar y el segundo atrás sale sin aviso a… | high | mitigate | PB:1046,1075; keydown en captura PB:1873; U2:614,645 | closed |
| T-03-110 | 03-16 | Denial of service (del camino 1) | un arreglo de `G3-5` que se coma también las teclas nuevas: el aviso no se baja nunca con el teclado | high | mitigate | tPB:2567,2576; AP R-G3-5-tecla-tras-el-aviso / -escritorio-control | closed |
| T-03-111 | 03-16 | Repudiation (de la decisión) | un arreglo justificado por un veredicto que la medición no dio, o un `esperado` ajustado para dar verde | high | mitigate | AM:706 intacto; `esperado` de la sonda vs 993fbc5 y f7adc9d: sólo agregados; AM:929,1001 | closed |
| T-03-112 | 03-16 | Elevation of privilege (de la pila) | el reintento de `G3-7` entierra `#salir` bajo una navegación (`R-lateral`) | high | mitigate | PB:1661-1666,1776-1778,1823; R-lateral | closed |
| T-03-113 | 03-16 | Spoofing (del aviso) | el reintento de `G3-7` empuja un `#salir` que Chrome marca salteable (activación anterior al retroceso del… | high | mitigate | P-8 declarado PB:884-888; U2:620 no observado | closed |
| T-03-114 | 03-16 | Tampering | tiempo reintroducido en el ciclo del aviso, o un empuje desde adentro de un `popstate` | high | mitigate | `alRetroceder` PB:1725-1798: sin push, sin lectura de activación | closed |
| T-03-115 | 03-16 | Tampering | los intocables, los archivos de `G3-6`, la decisión de WR-05, `next.config.ts` y el `next dev` del dueño | medium | mitigate | sin diff 993fbc5..HEAD; gate del diagnóstico byte-idéntico | closed |
| T-03-116 | 03-16 | Information disclosure | un call site nuevo del canal de diagnóstico por los keyup filtrados | low | mitigate | `recordExitDiag` = 5; el keyup que no es toque sale temprano PB:1818 | closed |
| T-03-117 | 03-16 | Repudiation (de la aprobación) | el recibo del checkpoint | high | mitigate | 03-16-PLAN:616; aprobado U2:638-650 | closed |
| T-03-SC@16 | 03-16 | Tampering | instalaciones de paquetes | low | **accept** | sin instalaciones | closed |
| T-03-118 | 03-17 | Denial of service (de la venta) | el `PlanModal` cortado en el teléfono: la X, el título y los «Elegir» fuera de la pantalla y sin scroll (`G… | high | mitigate | PMo:53,58 (fa70f25); AM (i) rojo→verde; U2 3.4 pasó en producción (2026-11-16) | closed |
| T-03-119 | 03-17 | Tampering (de los 33 diálogos) | un arreglo en `components/ui/dialog.tsx` que cambie todos los diálogos del panel | medium | mitigate | components/ui/dialog.tsx: 0 commits de la fase, sin diff vs f7adc9d | closed |
| T-03-120 | 03-17 | Repudiation (del veredicto) | declarar `G3-10` costo del camino 1 sin medirlo, o con un `esperado` ajustado después de ver la medición | high | mitigate | `esperado` escrito en afcba67 (test) antes de cd63fec (veredicto), sin cambios desde | closed |
| T-03-121 | 03-17 | Spoofing (del aviso) | el reintento tras cerrar con el atrás empuja un `#salir` que Chrome marca salteable: la URL dice armado y e… | high | mitigate | R-G3-10-pronto FALLA ⇒ AM:1284 `otro`; U2:692-694; DU3:43-52 | closed |
| T-03-122 | 03-17 | Tampering (de datos) | la preparación del entorno escribe `has_web_custom` | high | mitigate | 03-17-SUMMARY:92-96: contenedor local, claim con `set local` en una transacción, chequeo con SELECT | closed |
| T-03-123 | 03-17 | Elevation of privilege | el claim `service_role` seteado a mano en `psql` | low | **accept** | receta de dev local | closed |
| T-03-124 | 03-17 | Tampering | los intocables y la lógica del aviso (`lib/panel-branch.ts`, `lib/panel-history.ts`, `lib/overlay-history.t… | high | mitigate | sólo PMo cambió en app/components/lib desde f7adc9d | closed |
| T-03-125 | 03-17 | Denial of service (de las otras pilas y del turno) | `supabase start` o una corrida de pantalla que pise otra pila o le quite la CPU a otro proyecto | medium | mitigate | 03-17-SUMMARY:97-101 contenedores registrados antes y después | closed |
| T-03-126 | 03-17 | Repudiation (de la aprobación) | el recibo del checkpoint | high | mitigate | 03-17-PLAN:650; aprobado U2 § «Re-prueba tras el 03-17» (3.4 ✅) | closed |
| T-03-127 | 03-17 | Tampering (de producción) | el push a `main` que despliega a `gestion.forjo.studio` | medium | mitigate | el orquestador subió f8fa76f (CI verde, deploy listo) antes de presentar el 3.4 | closed |
| T-03-128 | 03-17 | Information disclosure | el canal de diagnóstico del panel | low | **accept** | PB sin cambios desde f7adc9d | closed |
| T-03-SC@17 | 03-17 | Tampering | instalaciones de paquetes | low | **accept** | sin instalaciones | closed |

*Status: open · closed · open — debajo del umbral `high` (no bloquea)*
*Severidad: critical > high > medium > low — sólo las abiertas con severidad >= `high` cuentan en threats_open*
*Disposición: mitigate (requiere implementación) · accept (riesgo documentado) · transfer (tercero)*

### Mitigaciones reemplazadas a propósito

Un plan posterior reemplazó la mitigación original por decisión del dueño; el estado actual cubre la amenaza:

- **T-03-14, T-03-26, T-03-33 (la parte del timer):** pedían exactamente un timer o una constante de ventana. El
  03-13 (DU3, 2026-10-28) borró los dos: el ciclo tiene **cero** timers (tPB:320,329).
- **T-03-66:** la ventana temporizada ya no existe; el piso de tiempo en la página se queda para el R-3.1.
- **T-03-70:** pedía que la sonda usara sólo un servidor propio; T-03-84 la deja reusar el `next dev` del dueño,
  siempre en loopback y sin matarlo nunca.
- **T-03-89:** `R-login-con-activacion` salió del conjunto por omisión de la sonda por decisión del dueño
  (`9f0c647`), porque `f75e739` pasó el login a `window.location.assign`. El arreglo `panelExitUnmountAction` se
  queda en el código.
- **T-03-101:** el arreglo dependía de que `G3-6` se confirmara; la medición lo descartó, así que no hubo cambio de
  código, como decía el plan.

---

## Accepted Risks Log

| Risk ID | Threat Ref | Racional | Aceptado por | Fecha |
|---------|------------|----------|--------------|-------|
| AR-03-01 | T-03-SC (×9: planes 01, 02, 03, 04, 13, 14, 15, 16, 17) | Cero paquetes nuevos; las sondas usan el `WebSocket` global de Node y CDP; archivos de paquetes sin diff en toda la fase | Plan (milestone: cero dependencias) | 2026-10-13 → 2026-11-16 |
| AR-03-02 | T-03-10 | El gateo por rubro sigue en el inventario del menú; la marca de rama no decide visibilidad | Plan 03-02 | 2026-10-13 |
| AR-03-03 | T-03-27, 34, 41, 56, 60@10, 64, 74, 88 | Superficie autenticada; cero cambios de esquema, policies, queries o migraciones: el riesgo es a la integridad de la sesión, no al aislamiento por tenant | Planes 03-05..03-13 | 2026-10-13 → 2026-10-28 |
| AR-03-04 | T-03-49 | El plan es sólo docs + checkpoint, sin código de producción | Plan 03-08 | 2026-10-15 |
| AR-03-05 | T-03-53 | Residuo de desktop (2026-10-27): salir de una pantalla con cambios hacia Inicio desde el sidebar acorta el atrás un paso; arreglarlo con una consulta de viewport está prohibido | Dueño | 2026-10-27 |
| AR-03-06 | T-03-61@11 | El `replace` propio de la guarda pierde la marca en una pantalla con cambios: el atrás queda un paso más largo, nunca expulsa. Declarado en 4 lugares + W entrada 18 | Plan 03-11 | 2026-10-28 |
| AR-03-07 | T-03-69, 87, 96 | El canal de diagnóstico registra sólo decisiones, es inerte salvo que algo de afuera lo abra, tope de 200 y desde el 03-15 sólo en desarrollo | Planes 03-12..03-15 | 2026-10-28 → 2026-10-30 |
| AR-03-08 | T-03-72, 85 | Ningún camino nuevo de `back()`: el conteo sigue en 2 (PB:312, PB:1926) | Planes 03-12, 03-13 | 2026-10-28 |
| AR-03-09 | T-03-73 | `panel-history.ts` sin tocar en el 03-12 | Plan 03-12 | 2026-10-28 |
| AR-03-10 | T-03-79 | Con un hash viejo, la opción (A) puede mostrar un aviso que el dueño no ganó; nunca lo expulsa | Dueño (DU3) | 2026-10-28 |
| AR-03-11 | T-03-81 | Costo del camino 1: entrar directo a Inicio, recargar, llegar con el atrás o cerrar el teclado sin tocar sale sin aviso (regla del navegador). `G3-10` (cerrar el diálogo con el atrás) se suma a este costo | Dueño (DU3, 2026-10-28; `G3-10` 2026-11-16) | 2026-11-16 |
| AR-03-12 | T-03-86 | Sin consulta de viewport; D-05 deja el aviso también en desktop | Plan 03-13 | 2026-10-28 |
| AR-03-13 | T-03-95, 98, 107 | Instrumentos de la sonda y logout en un perfil de Chrome descartable con el usuario local del seed | Planes 03-14, 03-15 | 2026-10-29 → 2026-10-30 |
| AR-03-14 | T-03-123 | El claim `service_role` sólo con `set local` dentro de una transacción en la base local de desarrollo | Plan 03-17 | 2026-11-16 |
| AR-03-15 | T-03-128 | `panel-branch.ts` sin tocar en el 03-17; el canal de diagnóstico sin cambios | Plan 03-17 | 2026-11-16 |

*Los riesgos aceptados no vuelven a aparecer en auditorías futuras.*

---

## Superficie de seguridad nueva

**Ninguna.** Los commits propios de la fase (first-parent, sin el merge de `origin/main` `643e99e`) tocan sólo
`lib/panel-branch.ts`, `lib/panel-history.ts`, `lib/unsaved-changes.ts`, sus tests,
`components/dashboard/{panel-bottom-nav,unsaved-changes-guard,plan-modal}.tsx`, los dos clientes de booking
(`76f98f3`, el autoscroll de `/web`) y `next.config.ts` una vez (`2fc3fcc`, la IP de la LAN en `allowedDevOrigins`,
sólo dev; sha1 `8ceb99ae…` sin cambios desde entonces). Cero archivos en `app/api/`, cero migraciones (la próxima
libre sigue siendo la **081**), cero archivos de paquetes, cero policies, cero service role en código de la app.
Re-medido por el orquestador en el HEAD auditado: `history.back()` = 2 llamadas reales, `pushState` = 1, timers =
0, consultas de viewport = 0 en los 4 archivos, intocables sin diff contra `f7adc9d`.

### Flag sin registro (aviso, no bloquea)

- **03-12-SUMMARY `threat_flag: test-only-surface`:** AP lanza Chrome con `--enable-unsafe-extension-debugging` y
  `--remote-debugging-pipe` (AP:2548-2552). Ninguna fila del 03-12 nombra esos flags; las más cercanas son T-03-04,
  T-03-95 y T-03-107. Verificado en el código: perfil y directorio de extensión temporales (AP:2514-2515), borrados
  al salir (AP:2639-2640), CDP en 127.0.0.1 en su propio puerto 9335. Sólo sonda, nunca en la app.

### Fuera del registro

Ítems del code review (`03-REVIEW.md`) que no son amenazas del registro y quedan sin atender por decisión del
dueño: WR-01, WR-03, WR-04 (= `G3-8`, medido y descartado) y los IN-*.

---

## Security Audit Trail

| Fecha | Amenazas | Cerradas | Abiertas | Corrida por |
|-------|----------|----------|----------|-------------|
| 2026-11-16 | 145 | **145** | **0** | `gsd-security-auditor` (opus), estático: grep/read/git + `vitest --project pure` sobre 9 suites (572/572) + re-medición independiente del orquestador de los conteos estructurales |

---

## Sign-Off

- [x] Todas las amenazas tienen disposición (mitigate / accept / transfer)
- [x] Riesgos aceptados documentados en el Accepted Risks Log
- [x] `threats_open: 0` confirmado
- [x] `status: verified` en el frontmatter

**Aprobación:** verificada 2026-11-16.

⚠ **Lo que esta firma NO dice.** `threats_open: 0` cubre el registro de amenazas de la fase, no la fase entera:
MOB-04, MOB-05 y MOB-06 siguen **sin marcar** hasta `/gsd-verify-work 3 --ws panel-nav`. La seguridad deja de
bloquear el avance; la verificación del objetivo y la UAT siguen siendo lo que cierra la fase.
