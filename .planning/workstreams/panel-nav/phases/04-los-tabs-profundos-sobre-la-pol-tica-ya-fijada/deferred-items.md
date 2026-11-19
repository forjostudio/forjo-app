# Phase 4 — lo encontrado fuera de alcance

## Deferred Items

- Finanzas desborda en horizontal a 390 px (17-25 px de más)
  status: open
  **Qué:** en un documento que nace en `/finances` con el viewport del teléfono (390×844, `mobile: true`), el
  documento mide 407-415 px de ancho (`document.documentElement.scrollWidth`). Es lo que dejó el viewport
  visual desplazado respecto del de layout en la sonda (`(0,37)` y `(0,55)`).
  **Dónde se midió:** `R-T-finanzas-url-pegada`, plan 04-01, task 2 (`.planning/debug/tabs-en-la-url-medida.md`
  `## (b)`, la línea «el viewport visual no es el de layout»).
  **Por qué no se tocó:** es layout de la pantalla, no routing; la Phase 4 es «cero pixel nuevo». No es causado
  por este plan (el tab en la URL no cambia el ancho del contenido). Candidato a un quick de polish mobile.

- eslint de `finances-client.tsx`: `react-hooks/set-state-in-effect` preexistente
  status: open
  **Qué:** el `useEffect(() => { fetchData() }, [fetchData])` (era la L383 en `85c99ae`) llama a un setState
  adentro del efecto. Estaba antes de la fase y el plan 04-01 no lo toca.

- El aviso de error del OAuth de Google en el login mobile probablemente tampoco se ve
  status: open
  **Qué:** `components/auth/mobile-login-hero.tsx` pide `toast.error('No pudimos entrar con Google…')` en un
  efecto de montaje que lee `?error=oauth`. Es el mismo patrón que el plan 04-02 midió en `/negocio` y `/agenda`
  (cero toasts con el código de antes): sonner sólo publica a los suscriptores de ese momento y el `<Toaster>`
  se suscribe en su propio efecto, montado DESPUÉS de las páginas en `app/layout.tsx`, así que en un documento
  nuevo el toast se pierde sin error.
  **Dónde se midió:** NO se midió en el login; se midió en `R-T-negocio-oauth-mp`, `R-T-negocio-oauth-google-error`
  y `R-T-agenda-google` (`.planning/debug/tabs-en-la-url-medida.md` `## (c)` y `## (d)`).
  **Por qué no se tocó:** fuera del alcance de la fase (es el login, no un tab). Candidato a un quick: medirlo
  primero (puede que el banner del form lo cubra) y, si se pierde, el mismo arreglo (pedirlo en la próxima tarea).

- El `sinComentarios` del molde se come código cuando un comentario de línea nombra `/*`
  status: open
  **Qué:** el descuento de comentarios de `test/panel-history-clients.test.ts` (y el del bloque de Finanzas de
  `test/panel-tabs.test.ts`, que lo copia) saca los de bloque ANTES que los de línea: un comentario de línea con
  `/api/google/*` abre un bloque falso hasta el próximo `*/`. En `settings-client.tsx` se comía 24.933 caracteres.
  **Dónde se midió:** al escribir el caso (i) del plan 04-02 (región vacía). El `describe` nuevo usa
  `sinComentariosFirme` y un caso de honestidad; los dos consumidores viejos no se tocaron.
  **Por qué no se tocó:** son suites de planes anteriores y hoy pasan con regiones no vacías; revisar si alguna
  aserción NEGATIVA suya cae sobre un tramo comido es un quick de tests, no de esta fase.

- `/clients` tiene el mismo boundary sin nodo desde v0.30, sin medir
  status: open
  **Qué:** `app/(dashboard)/clients/page.tsx` envuelve a `ClientsClient` en el mismo `<Suspense>` con fallback nulo
  que el plan 04-06 cambió en Finanzas, Negocio y Configuración, y su comentario repite la misma frase falsa (que el
  fallback no se dibuja nunca). Si el mecanismo de G-04-6 aplica, el cambio de estado del router que dispararía el
  scroll pendiente de una entrada blanda es abrir una ficha (un empuje de `?c=`) con el borde de arriba de la lista
  fuera de la pantalla.
  **Dónde se midió:** NO se midió. El patrón se leyó en el plan 04-06 (`.planning/debug/finanzas-primer-toque-scroll.md`,
  `blind_spots`); medirlo exige un recorrido nuevo de `g04-scroll-y-recarga.mjs` con la lista scrolleada.
  **Por qué no se tocó:** no se cambia sin medir (decisión del dueño, opción B, 2026-11-17); `app/(dashboard)/clients/**`
  está en la lista de intocables del cierre de gaps. Candidato a un quick: el recorrido primero, el mismo fallback
  con nodo (`space-y-…` del contenedor raíz de `ClientsClient`) después.

- IN-02: `router.refresh()` en `/negocio?tab=integraciones` puede llevar la página arriba
  status: open
  **Qué:** después de un toque de tab (un pushState que deja el árbol del router en `__PAGE__`), un `router.refresh()`
  en Integraciones —el de desconectar una cuenta— crea un `scrollRef` NUEVO por la clave de la página
  (`__PAGE__` contra `__PAGE__?{"tab":"integraciones"}`) y, con el borde de arriba fuera, el handler de scroll de Next
  escribe `scrollTop=0` + `scrollIntoView()`. Es un mecanismo distinto del de G-04-6: el fallback con nodo NO lo cubre.
  **Dónde se midió:** emulado con `window.next.router.refresh()` en la corrida 5 del debug
  (`.planning/debug/finanzas-primer-toque-scroll.md`, `related_finding_IN02`; recorrido `IN02-refresh-corto`,
  390x480: y 187 → 147). A 390x844 Integraciones no desborda y no se ve. El botón real de desconectar no se tocó
  (no hay cuenta conectada en local).
  **Por qué no se tocó:** decisión aparte (aceptarlo, o preservar el `scrollY` alrededor del refresh), y el arreglo
  vive en `settings-client.tsx`, prohibido en el plan 04-06.

- `html { scroll-behavior: smooth }` sin `data-scroll-behavior`
  status: open
  **Qué:** `app/globals.css` pone `scroll-behavior: smooth` en `<html>` (con `prefers-reduced-motion: no-preference`)
  y el `<html>` de `app/layout.tsx` no lleva `data-scroll-behavior="smooth"`. Next 16 ya no apaga el scroll suave
  durante sus transiciones si ese atributo no está (`node_modules/next/dist/docs/01-app/02-guides/upgrading/version-16.md`
  L972-995); el log de `next dev` lo avisa en cada corrida de la sonda («Detected scroll-behavior: smooth…»).
  **Dónde se midió:** corridas 2 y 5 del debug (el salto de G-04-6 era animado y aterrizaba en el div de la página,
  147/115 px, en vez de y=0) y corrida 6 (sin el scroll pendiente no hay salto ninguno).
  **Por qué no se tocó:** da la FORMA animada del salto, no su causa; con el boundary con nodo (plan 04-06) el salto
  ya no ocurre. Tocar `app/layout.tsx`/`app/globals.css` cambia cómo se ven TODAS las navegaciones del panel y de la
  página pública: candidato a un quick que lo mida antes.

- La guarda de consumo en vuelo no se extendió a `consumeOwnedPanelEntry` (plan 04-07, G-04-7)
  status: resolved (quick 261118-kat, cerrado por mitigación; medido en .planning/debug/tabs-en-la-url-medida.md ## (l))
  **Qué:** la guarda (`consumoEnVuelo` en `lib/panel-history.ts`) vive sólo en `applyPanelView`. `consumeOwnedPanelEntry`
  —el menú, NAV-08, y el primer paso de B1— es OTRA función: compartir la guarda no es «el mismo helper» sino una
  segunda lectura de la memoria del módulo.
  **Por qué no se hizo:** el segundo paso de B1 (`consume-view-then-navigate`, `lib/panel-branch.ts`, intocable en
  el cierre) engancha su propio `popstate` ANTES de ese consumo y re-decide DENTRO de ese evento, antes que cualquier
  oyente que la guarda enganchara después: extenderla exige medir ese orden primero. Además, los stubs de `window`
  de su suite no tienen `addEventListener`.
  **Lo que queda sin cubrir:** el caso cruzado —consumir un tab y tocar la barra o el sidebar antes de que llegue el
  retroceso— es derivado y sin medir.
  **El «Volver» de clientes SÍ hereda la guarda por construcción** (pasa por el mismo `applyPanelView`), pero ninguna
  sonda lo recorre directo: lo prueba la re-UAT del 04-08.
  **Cierre:** la guarda se comparte (`87868c4`): `consumeOwnedPanelEntry` chequea el consumo en vuelo por identidad del
  state antes de sus dos guardas y enciende la guarda con el mismo bloque que la rama `consume`. El orden de B1 se midió
  en el simulador con los ejecutores reales (`NR-b1-control`, `NR-b1-reentrada`, `NR-b1-triple`, verdes antes y después);
  el cruce, rojo 4/4 antes (K3a/K3b por el menú y por B1) y verde después; R-B1 4/4 y R-T 12/12 en la app.

- obs-G1: con 0 ventas, el tab Ventas de Finanzas achica la página y el navegador recorta el scroll (re-UAT del 04-08)
  status: resolved (quick 261118-jdq, 05733dc; medido en .planning/debug/tabs-en-la-url-medida.md ## (k))
  **Qué:** el dueño, en Android Chrome durante el G6.1 en producción (`c3da6d0`, 2026-11-18): «Algo que por ahí me
  gustaria es que ya se fije el alto de la ventana con los turnos que aparecen, porque sino cada vez que voy a ventas
  hace un salto ahi porque se achica. Igual es porque hay 0 ventas cargadas.» No es un scroll de la app: el tab nuevo
  deja el documento más corto que el `scrollY` de ese momento y el navegador lo recorta (el mismo `recorte_por_alto`
  que la sonda mide en Negocio → Cobros, `## (h)` de `.planning/debug/tabs-en-la-url-medida.md`).
  **Dónde se vio:** `04-UAT-GAPS.md` § «Observaciones fuera del "pasa si"». El G6.1 pasó igual (✅).
  **Por qué no se tocó:** la Phase 4 es «cero pixel nuevo» y el plan 04-08 no cambia código. Decisión del dueño
  (2026-11-18): resolverlo DESPUÉS como un `/gsd-quick` separado — alto mínimo del contenedor de los tabs de Finanzas =
  alto de la pantalla (CSS), y medir antes con la sonda del scroll que el primer toque sigue sin moverse.
  **Cierre:** `min-h-dvh` en los tres paneles de Finanzas (`05733dc`). Rojo 3/3 con el código de antes (septiembre
  2026, 22 turnos, 0 ventas / 0 egresos: el documento baja 4008 → 2504 px y `scrollY` se recorta 281/298 px en móvil,
  244 px en escritorio) → verde 8/8 en `tras-el-fix` (los tres `G1-*` con delta 0 y sin recorte), sin regresar G-04-6
  (los cinco recorridos del 04-06 en OK, cero escrituras de Next). Falta la UAT en el teléfono, junto con R2-WR-01.

- R2-WR-01: la guarda de consumo en vuelo podría quedar encendida sin `popstate` (code review ronda 2, `04-REVIEW-2.md`)
  status: resolved (quick 261118-kat, cerrado por mitigación; medido en .planning/debug/tabs-en-la-url-medida.md ## (l))
  **Qué:** `consumoEnVuelo` (`lib/panel-history.ts:933-938`, `:1024`, `:1045-1049`) sólo se apaga con un `popstate`;
  mientras está encendida, todo `applyPanelView` del documento devuelve `'none'` (tabs, reconciliación, ficha `?c=`).
  Caminos derivados SIN MEDIR: (a) bfcache — un retroceso que cruza de documento (p. ej. Safari tras recargar, donde las
  entradas podrían no compartir documento) y después «adelante»: llega `pageshow`, no `popstate`; (b) un `back()` que
  tira o que el navegador ignora. El docblock dice «nunca queda colgada» sin medirlo.
  **Decisión del dueño (2026-11-18):** cerrar la fase y resolverlo DESPUÉS en un `/gsd-quick` que MIDA primero (Chrome
  desmintió el caso hermano WR-04); si reproduce: soltar también en `pageshow`, `try` alrededor del `back()`, corregir
  el docblock. Sale en el mismo push que obs-G1.
  **Cierre:** caso 2 (`back()` que tira) reprodujo en el simulador (K2-a: la guarda quedaba encendida con su oyente y
  el toque siguiente daba `none`) y se arregló con el `try`/`catch` (`87868c4`). Caso 1 (bfcache) NO reprodujo en Chrome
  157 (K1-bfcache-cruce: el cruce se armó pero ningún documento entró a la bfcache, `BroadcastChannelOnMessage`); la
  salida por `pageshow` con `persisted` se puso igual por decisión del dueño (A), verificada sólo en el simulador
  (`C-pageshow-*`). Docblock corregido. Residuo sin medir: Safari de iOS, Android real, la pestaña restaurada y el
  retroceso ignorado en silencio.

- R2-IN-04: doble toque en una fila de Clientes apila `?c=A` sobre `?c=A` (code review ronda 2)
  status: open
  **Qué:** `app/(dashboard)/clients/clients-client.tsx:1055` — el `user-open` toma `from: selectedId` del render, el
  mismo defecto que WR-02 tenía en los tabs. Fuera del alcance del cierre (archivo intocable en 04-06..08). Candidato a
  ir junto con R2-WR-01 (mismo helper `toqueDeTab`/URL de ahora). Sin medir.

- Decisión del dueño (2026-11-18, secure-phase): el cruce guarda ↔ `consumeOwnedPanelEntry` va al MISMO quick de R2-WR-01
  status: resolved (quick 261118-kat, cerrado por mitigación; medido en .planning/debug/tabs-en-la-url-medida.md ## (l))
  **Qué:** el residuo de T-04-39 de arriba («La guarda de consumo en vuelo no se extendió a `consumeOwnedPanelEntry`»)
  en los DOS sentidos: (a) consumir un tab y tocar la barra o el sidebar antes del `popstate`; (b) la inversa
  (`04-REVIEW-2.md` IN-03): primero el retroceso de `consumeOwnedPanelEntry`/B1 y después un toque al tab por defecto.
  **Registro:** `04-SECURITY.md` AR-04-06 (y AR-04-05 para R2-WR-01), aceptados con vencimiento en ese quick, que mide
  los tres casos primero y arregla los que reproduzcan.
  **Cierre:** los dos sentidos reprodujeron en el simulador: (a) K3a-nav08 2 retrocesos y `/dashboard` (esperado 1 y
  `/finances`), K3a-b1 3 retrocesos y `/afuera`; (b) K3b-nav08 el tab volvía a consumir (2 retrocesos), K3b-b1 3
  retrocesos y `/afuera`. Con la guarda compartida (`87868c4`) los cuatro dan verde, sin regresar B1 (NR-b1-* 3/3,
  R-B1 4/4 en la app).
  **Corrección (2026-11-18, quick 261118-pjd):** el cierre por la barra no cubría el doble toque. Con un consumo en
  vuelo, `consumeOwnedPanelEntry` devuelve `true` sin retroceder, pero B1 ya había enganchado su segundo paso: dos
  toques a Inicio dejaban dos re-decisores en el mismo `popstate` (CR-01 del review del quick 261118-kat).
  `CR-b1-doble` daba 3 retrocesos y `/afuera` (con dos fichas, 4); con un solo segundo paso de B1 pendiente
  (`5d7ee5f`), 2 y `/dashboard` (con dos fichas, 3). Medido en .planning/debug/tabs-en-la-url-medida.md ## (m).

- Review del quick 261118-kat (CR-01, WR-01..04, IN-01..03): un solo segundo paso de B1, el try de la rama, el criterio de llegada de la guarda y los candados de `pageshow`
  status: resolved (quick 261118-pjd; medido en .planning/debug/tabs-en-la-url-medida.md ## (m))
  **Qué:** `261118-kat-REVIEW.md`: CR-01 (doble toque a Inicio en la barra ⇒ fuera del sitio), WR-01 (el
  `replaceState` del `HistoryUpdater` de Next en la ventana del recorrido suelta la guarda antes de tiempo), WR-02 (un
  `back()` que tira deja colgado el segundo paso de las ramas de dos pasos), WR-03/IN-01 (el `pageshow` con disparo
  único se gastaba con un `pageshow` no persistido; los candados no medían la limpieza), WR-04 (el docblock del
  retroceso ignorado en silencio), IN-02 (el comentario de obs-G1 subestimaba el blanco), IN-03 (el drenaje de los
  tests por nombre de función). Más `UP-doble`, visto por lectura al planificar: `consumeOwnedBranchEntry` no leía la
  guarda y dos toques a Inicio desde una sección con la marca de la rama retrocedían dos veces.
  **Decisión del dueño (2026-11-18):** arreglar ANTES del push conjunto (obs-G1 + R2-WR-01 + éste), RED primero y
  sólo lo que reproduce; CR-01 con un solo segundo paso de B1 (el nuevo reemplaza al anterior); WR-02 con un `try` en
  las tres ramas; `UP-doble`: «medirlo y arreglarlo si da rojo»; WR-01: opción A en el checkpoint («llegó» = cambiaron
  el state Y la URL).
  **Cierre:** los cinco reprodujeron (rojos commiteados en `ba97254` antes de medir) y quedaron arreglados en
  `5d7ee5f`: `CR-b1-doble` 3/`afuera` → 2/`dashboard`, `CR-b1-doble-fichas` 4 → 3, `CR-b1-silencio` 4/`afuera` →
  2/`dashboard`; `K2-c-b1` 2/`dashboard` → 1/`finances` y el segundo paso desenganchado en las tres ramas; `W1-menu`
  2/`dashboard` → 1/`finances`, `W1-b1` 3/`afuera` → 2/`dashboard`; `C-pageshow-no-persistido` en verde; `UP-doble`
  2/`afuera` → 1/`dashboard` (con `C-retroceso-unico-rama` rojo antes del `fix`). Mutaciones: M1 pone rojo
  `C-pageshow-no-persistido`, M2 pone rojo `P0-normal`. Sin regresión: pura 77/1876, 8 suites 702, R-T 12/12, R-B1
  4/4, estática 18/18, scroll 8/8. Residuo: teléfono real, Safari iOS/Android, el `HistoryUpdater` real en la
  ventana (y el borde declarado de A: un reemplazo que cambie la URL), el doble toque sobre el colapso (cubierto por
  lectura, sin medir) y R2-IN-04.

- Review del quick 261118-pjd (CR-01 X2, WR-01 S4, IN-01..04): la familia back() cerrada
  status: resolved (quick 261119-32l; medido en .planning/debug/tabs-en-la-url-medida.md ## (n))
  **Qué:** `261118-pjd-REVIEW.md`: CR-01 (BLOCKER, preexistente: `consumeOwnedExitSentinel` no pasaba por la guarda
  del consumo en vuelo, y dos toques a la barra desde Inicio con el aviso armado sacaban al dueño del sitio), WR-01
  (con la guarda colgada, el `up` y el colapso del guard de cambios sin guardar devolvían «se hizo cargo» sin hacer
  nada), IN-01 (el `true` de `consumeOwnedBranchEntry` sin retroceso, sin documentar), IN-02 (la URL del sentinel
  difiere de la de Inicio sólo en el hash), IN-03 (semánticas distintas ante dos toques: B1 con el último, el
  colapso y la salida con todos), IN-04 (el stub de `test/panel-branch.test.ts`: filtro por nombre de función, sin
  `location.search`).
  **Decisión del dueño (2026-11-19):** D-01, todo `history.back()` del panel pasa por la guarda compartida, empezando
  por el sentinel; D-02, un candado de fuente con la lista cerrada, que mida de verdad y con su mutación probada; D-03,
  el guard sucio no puede devolver «se hizo cargo» sin hacer nada, sin tocar su código ni `lib/dirty-history.ts`;
  D-04, IN-01, IN-03 (decidir y justificar) e IN-04, con IN-02 declarado; D-05, el registro. En el checkpoint P-4,
  opción A: la aserción vieja que contaba los retrocesos del módulo pasa de 2 a 0 con su título.
  **Cierre:** los tres reprodujeron (rojos commiteados en `2a38661` antes de medir) y quedaron arreglados en
  `a85adc0`: `X2-exit-doble` 2/`afuera` → 1/`dashboard` con una navegación, `X2-destinos` 2/`afuera` →
  1/`dashboard`, `CO2-doble-colapso` dos `replace` → uno, `CO-mixto` y `CO3-colapso-y-mas` sin el `replace` colgado,
  `S4-guard-up` y `S4-guard-colapso` `se-hizo-cargo` → `degrado` con la navegación de la regla de rutas; IN-03 decidido
  como unificación (el último toque gana en las tres ramas y sobre `up`). `C-back-cerrado`: cuatro retrocesos en
  `lib/panel-history.ts`, cero en `lib/panel-branch.ts`; M1 y M2 lo ponen rojo. Sin regresión: 361/361 en las dos
  suites, pura 77/1888, 8 suites 714, `panel-tabs` 123, build verde, app 47 medidos / 46 coinciden (sólo la FALLA
  declarada), R-T 12/12, R-B1 4/4, estática 18/18, scroll 8/8. Residuo: teléfono real, Safari iOS/Android, el
  retroceso ignorado en silencio sin medir en ningún motor (con el sentinel como productor más) y R2-IN-04.
