---
status: measuring
trigger: "Phase 4 del workstream panel-nav: los tabs de Finanzas, Negocio y Configuración pasan a vivir en la URL (?tab=). Este registro junta las mediciones de la fase en la APP REAL, con el RED de cada recorrido pegado antes que su GREEN."
created: 2026-11-17T00:00:00Z
updated: 2026-11-17T00:00:00Z
---

# Los tabs en la URL, medidos en la app real (Phase 4)

Qué registra: las corridas de `.planning/debug/probes/panel-exit-en-la-app.mjs` que juzgan los recorridos
`R-T-*` de la Phase 4 —el servidor de desarrollo de Next, el JS real del panel, el parche de Next sobre la
escritura del historial y un Chrome de verdad por CDP—, con el método de
`.planning/debug/pila-de-dos-niveles-medida.md` §«Con qué se midió» (la pila sale de
`Page.getNavigationHistory`; el state, de `history.state` por `Runtime.evaluate`). Cada `esperado` se
escribió en un commit `test(04-01)` ANTES del código que lo juzga y no se tocó después de medir.

Se corre siempre por el turno de pantalla:

```
node scripts/con-turno.mjs node .planning/debug/probes/panel-exit-en-la-app.mjs dev interfaz <ids separados por coma>
```

## (a) Finanzas en la URL (plan 04-01, task 1)

| Pieza | Valor medido |
|---|---|
| Servidor | `next dev` **propio** de la sonda en `http://127.0.0.1:3031` (no había un `next dev` del dueño vivo: sin `.next/dev/lock`); la sonda lo mató al salir y verificó el puerto libre |
| Navegador | `Chrome/157.0.8103.52`, `--headless=new`, perfil temporal propio; depuración en el 9335 |
| Node | `v24.15.0` |
| Gesto de atrás | `interfaz` (`chrome.tabs.goBack`: respeta la intervención de historial de Chrome) |
| Modo estricto | ACTIVO (`next.config.ts` sin `reactStrictMode`, huella `8ceb99aeabb6a8b16cbe0e6d836bf0aa1ae03578`) |
| Base | Supabase LOCAL de forjo-app (`negocio-prueba`, `test@forjo.local`), ya levantada: no hizo falta `supabase start` |
| Viewport | 390×844 mobile después del login (la barra de abajo es la del celular) |

**El instrumento se arregló una vez antes del RED válido (P-1).** La primera corrida con la app sin tocar
(commit `efb9ae4`) dio las tres en `FALLA`, pero en parte por el instrumento: con el código de antes —el
`useState`, que sí cambia de tab con un click— el tab medido seguía en Turnos y el botón de alta en
`ninguna`. El toque no llegaba: Finanzas entra con `loading` y después pinta las tarjetas por encima de
los tabs, que se corren hacia abajo, y el click calculado antes del corrimiento caía en otra cosa. Las
líneas de esa corrida, para que el arreglo no se lea como un ajuste del esperado:

```
  FALLA R-T-finanzas-por-mas      tab_en_ventas: medido="Turnos"  alta_en_ventas: medido="ninguna"   <- el toque no llegó
  FALLA R-T-finanzas-desde-inicio alta_en_egresos: medido="ninguna"                                  <- el toque no llegó
```

El arreglo (commit `2cf1d89`, `test(04-01)`, sólo la sonda) espera la posición QUIETA del tab (tres
lecturas iguales con el punto adentro del tab por `elementFromPoint`) y reintenta el toque hasta tres veces
si el tab no queda seleccionado. **Ningún `esperado` cambió.** Con el instrumento arreglado, el RED mide lo
que dice: el tab SÍ cambia (Ventas, «Nueva venta») pero la URL no, y el atrás se come el tab.

### El RED — la app sin tocar (código de `2cf1d89`), rc 1, 3 de 3 en FALLA

```
FALLA R-T-finanzas-por-mas · D-01 + D-04 por Mas: Inicio -> Mas -> Finanzas -> Ventas; la URL lleva ?tab=ventas con Nueva venta, el atras vuelve a Turnos sin alta, despues a Mas y despues a Inicio
      url_en_ventas: medido="/finances"  <-- NO COINCIDE
                     esperado="/finances?tab=ventas"
      tab_en_ventas: medido="Ventas"
      alta_en_ventas: medido="Nueva venta"
      marca_en_ventas: medido="{\"frjUnder\":\"/mas\"}"  <-- NO COINCIDE
                       esperado="{\"frjView\":\"tab\"}"
      url_tras_el_primer_atras: medido="/mas"  <-- NO COINCIDE
                                esperado="/finances"
      tab_tras_el_primer_atras: medido="ninguno"  <-- NO COINCIDE
                                esperado="Turnos"
      alta_tras_el_primer_atras: medido="ninguna"
      ruta_tras_el_segundo_atras: medido="/dashboard"  <-- NO COINCIDE
                                  esperado="/mas"
      ruta_tras_el_tercer_atras: medido="(afuera)"  <-- NO COINCIDE
                                 esperado="/dashboard"
      al entrar a Finanzas: pila=[(afuera), /dashboard, /mas, /finances] actual=3
      en Ventas: url=/finances tab=Ventas alta=Nueva venta estado={"frjUnder":"/mas"} pila=[(afuera), /dashboard, /mas, /finances] actual=3
      tras el primer atras: url=/mas tab=ninguno alta=ninguna pila=[(afuera), /dashboard, /mas, /finances] actual=2
      tras el segundo atras: url=/dashboard#salir pila=[(afuera), /dashboard, /dashboard#salir] actual=2
      tras el tercer atras: url=(afuera) pila=[(afuera), /dashboard, /dashboard#salir] actual=0
FALLA R-T-finanzas-desde-inicio · D-01 por la otra profundidad: la tarjeta Ingresos del mes de Inicio -> Finanzas -> Egresos; el atras vuelve a Turnos sin alta y el siguiente a Inicio
      url_en_egresos: medido="/finances"  <-- NO COINCIDE
                      esperado="/finances?tab=egresos"
      alta_en_egresos: medido="Nuevo egreso"
      url_tras_el_primer_atras: medido="/dashboard#salir"  <-- NO COINCIDE
                                esperado="/finances"
      alta_tras_el_primer_atras: medido="ninguna"
      ruta_tras_el_segundo_atras: medido="(afuera)"  <-- NO COINCIDE
                                  esperado="/dashboard"
      al entrar a Finanzas: pila=[(afuera), /dashboard, /finances] actual=2
      en Egresos: url=/finances alta=Nuevo egreso pila=[(afuera), /dashboard, /finances] actual=2
      tras el primer atras: url=/dashboard#salir alta=ninguna pila=[(afuera), /dashboard, /dashboard#salir] actual=2
      tras el segundo atras: url=(afuera) pila=[(afuera), /dashboard, /dashboard#salir] actual=0
FALLA R-T-finanzas-invalido · D-06 + D-07: /finances?tab=constructor, ?tab= y ?tab=turnos caen en Turnos con la URL saneada a /finances y sin agregar entradas
      url_tras_constructor: medido="/finances?tab=constructor"  <-- NO COINCIDE
                            esperado="/finances"
      tab_tras_constructor: medido="Turnos"
      entradas_del_saneo_constructor: medido=0
      url_tras_vacio: medido="/finances?tab="  <-- NO COINCIDE
                      esperado="/finances"
      url_tras_turnos_explicito: medido="/finances?tab=turnos"  <-- NO COINCIDE
                                 esperado="/finances"
      entradas_del_saneo_turnos: medido=0
      constructor: url=/finances?tab=constructor tab=Turnos entradas_agregadas=0 pila al cargar=[(afuera), /finances?tab=constructor] tras el saneo=[(afuera), /finances?tab=constructor] actual=1
      vacio: url=/finances?tab= tab=Turnos entradas_agregadas=0 pila al cargar=[(afuera), /finances?tab=constructor, /finances?tab=] tras el saneo=[(afuera), /finances?tab=constructor, /finances?tab=] actual=2
      turnos: url=/finances?tab=turnos tab=Turnos entradas_agregadas=0 pila al cargar=[(afuera), /finances?tab=constructor, /finances?tab=, /finances?tab=turnos] tras el saneo=[(afuera), /finances?tab=constructor, /finances?tab=, /finances?tab=turnos] actual=3
```

### El GREEN — con `f481059` (`feat(04-01)`), rc 0, 3 de 3 en OK

```
OK  R-T-finanzas-por-mas · D-01 + D-04 por Mas: Inicio -> Mas -> Finanzas -> Ventas; la URL lleva ?tab=ventas con Nueva venta, el atras vuelve a Turnos sin alta, despues a Mas y despues a Inicio
      url_en_ventas: medido="/finances?tab=ventas"
      tab_en_ventas: medido="Ventas"
      alta_en_ventas: medido="Nueva venta"
      marca_en_ventas: medido="{\"frjView\":\"tab\"}"
      url_tras_el_primer_atras: medido="/finances"
      tab_tras_el_primer_atras: medido="Turnos"
      alta_tras_el_primer_atras: medido="ninguna"
      ruta_tras_el_segundo_atras: medido="/mas"
      ruta_tras_el_tercer_atras: medido="/dashboard"
      al entrar a Finanzas: pila=[(afuera), /dashboard, /mas, /finances] actual=3
      en Ventas: url=/finances?tab=ventas tab=Ventas alta=Nueva venta estado={"frjView":"tab"} pila=[(afuera), /dashboard, /mas, /finances, /finances?tab=ventas] actual=4
      tras el primer atras: url=/finances tab=Turnos alta=ninguna pila=[(afuera), /dashboard, /mas, /finances, /finances?tab=ventas] actual=3
      tras el segundo atras: url=/mas pila=[(afuera), /dashboard, /mas, /finances, /finances?tab=ventas] actual=2
      tras el tercer atras: url=/dashboard#salir pila=[(afuera), /dashboard, /dashboard#salir] actual=2
OK  R-T-finanzas-desde-inicio · D-01 por la otra profundidad: la tarjeta Ingresos del mes de Inicio -> Finanzas -> Egresos; el atras vuelve a Turnos sin alta y el siguiente a Inicio
      url_en_egresos: medido="/finances?tab=egresos"
      alta_en_egresos: medido="Nuevo egreso"
      url_tras_el_primer_atras: medido="/finances"
      alta_tras_el_primer_atras: medido="ninguna"
      ruta_tras_el_segundo_atras: medido="/dashboard"
      al entrar a Finanzas: pila=[(afuera), /dashboard, /finances] actual=2
      en Egresos: url=/finances?tab=egresos alta=Nuevo egreso pila=[(afuera), /dashboard, /finances, /finances?tab=egresos] actual=3
      tras el primer atras: url=/finances alta=ninguna pila=[(afuera), /dashboard, /finances, /finances?tab=egresos] actual=2
      tras el segundo atras: url=/dashboard#salir pila=[(afuera), /dashboard, /dashboard#salir] actual=2
OK  R-T-finanzas-invalido · D-06 + D-07: /finances?tab=constructor, ?tab= y ?tab=turnos caen en Turnos con la URL saneada a /finances y sin agregar entradas
      url_tras_constructor: medido="/finances"
      tab_tras_constructor: medido="Turnos"
      entradas_del_saneo_constructor: medido=0
      url_tras_vacio: medido="/finances"
      url_tras_turnos_explicito: medido="/finances"
      entradas_del_saneo_turnos: medido=0
      constructor: url=/finances tab=Turnos entradas_agregadas=0 pila al cargar=[(afuera), /dashboard, /dashboard#salir, /finances?tab=constructor] tras el saneo=[(afuera), /dashboard, /dashboard#salir, /finances] actual=3
      vacio: url=/finances tab=Turnos entradas_agregadas=0 pila al cargar=[(afuera), /dashboard, /dashboard#salir, /finances, /finances] tras el saneo=[(afuera), /dashboard, /dashboard#salir, /finances, /finances] actual=4
      turnos: url=/finances tab=Turnos entradas_agregadas=0 pila al cargar=[(afuera), /dashboard, /dashboard#salir, /finances, /finances, /finances?tab=turnos] tras el saneo=[(afuera), /dashboard, /dashboard#salir, /finances, /finances, /finances] actual=5
```

Lo que se lee de las pilas, además de las claves:

- **D-01 por Más:** `[(afuera), /dashboard, /mas, /finances, /finances?tab=ventas]` — el toque a Ventas
  empujó UNA entrada con la marca `{"frjView":"tab"}`, y la entrada de la sección conservó lo suyo (el atrás
  cae en `/finances` y el siguiente en `/mas`, como en la Phase 3).
- **D-01 desde Inicio:** `[(afuera), /dashboard, /finances, /finances?tab=egresos]` — atrás a Turnos sin
  botón de alta, y el siguiente a Inicio (que arma su `#salir` al aterrizar, como siempre).
- **D-06/D-07:** `?tab=constructor`, `?tab=` y `?tab=turnos` terminan en `/finances` en Turnos con cero
  entradas agregadas. ⚠ **Límite declarado del conteo:** en `?tab=` y `?tab=turnos` el saneo ya había
  corrido cuando llegó el evento de carga (la pila «al cargar» ya dice `/finances`), así que la diferencia
  de largos no podría ver un empuje que ocurriera antes de la carga. Lo que lo cierra es el código: el
  saneo sólo escribe la causa que devuelve `resolveViewParam` (`stale`, un reemplazo sin `holding`), y el
  candado estático de `test/panel-tabs.test.ts` niega `'user-open'` fuera del handler. Las dos `/finances`
  adyacentes de esa pila son dos documentos que navegó la SONDA, no una entrada de la app.
- **El turno** esperó ~26 s a una corrida de Playwright de `erp-forjo-studio` cuyo PID ya estaba muerto, y
  se lo sacó solo. Una espera no es un cuelgue ni un rojo.

Commits: `efb9ae4` y `2cf1d89` (`test(04-01)`, la sonda), `f481059` (`feat(04-01)`, el código).

cierre (a): finanzas en la url

## (b) Un reemplazo no fabrica la marca (plan 04-01, task 2)

**El defecto (Patrón 3 del research):** una entrada AJENA —una URL pegada, el retorno del OAuth— recibe un
reemplazo nuestro (el cambio entre dos tabs no-default); si el reemplazo escribe `frjView`, la entrada pasa
a "ser nuestra" y el próximo consumo (el toque al tab por defecto, el «Volver» de clientes, tocar la sección
activa en el sidebar) hace un retroceso sobre ella: el dueño sale del sitio. **El arreglo** (`f3896d0`,
`fix(04-01)`, sólo `lib/panel-history.ts`): `holding` se lee una vez y la marca se escribe sólo con un
empuje o con `holding`; más `drop` en `panelViewUrl`/`applyPanelView` para el retorno del OAuth (04-02).

### Las suites, antes y después

| Momento | Ocho suites de historial | Suite pura entera |
|---|---|---|
| Base `85c99ae` (siete suites, 07:35 AR) | 7 archivos / **550** verdes | — (al planificar: 76 / 1724 + 3 expected-fail) |
| Verdes antes (tras el task 1, `f481059`, 07:38 AR) | 8 archivos / **589** verdes | — |
| Los casos rojos commiteados (`cf41e78`) | 8 archivos / 596 verdes + **9 rojos** (todos de aserción) | — |
| Verdes después (`f3896d0`, 08:22 AR) | 8 archivos / **605** verdes | **77** archivos / **1779** verdes + 3 expected-fail |

Los nueve rojos de `cf41e78`, todos de los que `<behavior>` marca «RED hoy» y ninguno más:

```
lib/panel-history.test.ts > panelViewUrl con `drop` … > ?mp=connected + tab integraciones + drop [mp, google] ⇒ /negocio?tab=integraciones
lib/panel-history.test.ts > panelViewUrl con `drop` … > los params ajenos sobreviven: ?mp=connected&x=1 ⇒ /negocio?x=1&tab=integraciones
lib/panel-history.test.ts > panelViewUrl con `drop` … > sin params restantes queda el pathname a secas, nunca un `?` colgando
lib/panel-history.test.ts > applyPanelView — UN REEMPLAZO NO CAMBIA QUIÉN EMPUJÓ LA ENTRADA … > un reemplazo SIN holding NO fabrica la marca sobre una entrada ajena
lib/panel-history.test.ts > applyPanelView — UN REEMPLAZO NO CAMBIA QUIÉN EMPUJÓ LA ENTRADA … > CAMBIO DECLARADO en /clients: sobre una ?c= pegada, tras la fusión «Volver» REEMPLAZA …
lib/panel-history.test.ts > applyPanelView — UN REEMPLAZO NO CAMBIA QUIÉN EMPUJÓ LA ENTRADA … > applyPanelView pasa `drop` al armado de URL
test/panel-tabs.test.ts > el simulador de pila — una entrada AJENA … > D-03: /negocio?tab=cobros PEGADA → Integraciones → Datos: cero retrocesos, la URL en /negocio
test/panel-tabs.test.ts > el simulador de pila — una entrada AJENA … > D-09 en la pila: /negocio?mp=connected → integraciones con drop, sin agregar entradas; …
test/panel-tabs.test.ts > el simulador de pila — una entrada AJENA … > D-08 sobre una entrada ajena: tras la URL pegada + Integraciones, consumeOwnedPanelEntry no retrocede
```

### Las tres mutaciones, vistas en rojo y restauradas (árbol limpio, huella verificada)

```
mutacion roja: [panelViewState(param, action === 'push' || holding ? to : null)]   M-1 -> panelViewState(param, to)
mutacion roja: [return 'user-switch']                                              M-2 -> return 'user-open'
mutacion roja: [for (const quitar of drop) sp.delete(quitar)]                      M-3 -> for (const quitar of drop) void quitar
```

- **M-1** pone en rojo 6 casos, todos de aserción: el reemplazo sin `holding`, el cambio de `/clients`, el
  `drop` del ejecutor, y D-03 / D-09 / D-08 del simulador.
- **M-2** pone en rojo 7 casos de `test/panel-tabs.test.ts` (la causa entre dos no-default, la composición
  con la acción, D-01, D-04, D-03, D-08 y el contrapuesto).
- **M-3** pone en rojo 5 casos (los tres de `panelViewUrl` con `drop`, el `drop` del ejecutor y D-09).
- ⚠ **Trampa del gate, medida acá y anotada para el 04-02:** la función `mutar` del gate le pasa los
  literales a `node -e` por `argv`, y en esta máquina el `node` de Volta pasa por `cmd`: el `||` del literal
  de M-1 se interpreta como operador del shell (lo mostró una corrida de diagnóstico: *"holding" no se
  reconoce como un comando interno o externo*). El «mutacion roja» de M-1 del gate pudo venir de un archivo
  roto y no de la aserción. Por eso M-1 se volvió a medir con un script que lee los literales de su propio
  archivo (una ocurrencia exacta, aplicada y restaurada): **6 rojos, los seis `AssertionError`**. M-2 y M-3
  se midieron igual con sus nombres de caso (los de arriba).

### El RED de la app — con el código de antes del arreglo, rc 1

El recorrido nuevo se escribió en `cf41e78` con su `esperado`. Su primera corrida dio `FALLA`, pero **no por
el defecto**: los toques a Egresos y a Turnos sobre la URL pegada no cambiaban el tab. Las vueltas del
instrumento (P-1, todas `test(04-01)` y sólo la sonda): `247fc8f` (el instrumento de la historia: el toque
llega y no hay ninguna escritura), `113d8c6` (excepciones y consola: cero), `13bad17` (el objetivo de cada
click en captura: los seis clicks caían en un `div` ajeno al tab) y `721acdd` (centrar una vez y leer sin
mover el scroll: seguía igual). La que lo cerró fue `b75dc81` (más la impresión de `7c01b0a`): con `mobile: true` el viewport VISUAL quedó **desplazado** respecto del de layout
(medido en el GREEN: escala 1, desplazamiento `(0,37)` y `(0,55)`) y el punto de `elementFromPoint` no era
el que tocaba `Input.dispatchMouseEvent`; `tocarTab` ahora convierte al viewport visual. **Ningún `esperado`
cambió.** Con el instrumento arreglado, el RED mide exactamente el defecto previsto —la marca fabricada en
el reemplazo y el toque a Turnos retrocediendo a la página de afuera—:

```
FALLA R-T-finanzas-url-pegada · D-03 + Patron 3 + D-04: /finances?tab=ventas PEGADA -> Egresos -> Turnos; la URL queda en /finances DENTRO del sitio, sin marca fabricada, y el atras sale de la seccion
      tab_al_entrar: medido="Ventas"
      alta_al_entrar: medido="Nueva venta"
      marca_tras_egresos: medido="{\"frjView\":\"tab\"}"  <-- NO COINCIDE
                          esperado="{\"frjView\":null}"
      ubicacion_tras_turnos: medido="(afuera)"  <-- NO COINCIDE
                             esperado="/finances"
      tab_tras_turnos: medido="ninguno"  <-- NO COINCIDE
                       esperado="Turnos"
      ruta_tras_el_atras: medido="(afuera)"
      React enganchado en el tab Egresos al entrar: true
      excepciones y errores de consola de la pagina: 0
      los toques y las escrituras del recorrido:
        diag sonda-historia doc=vmhmf4 metodo=replaceState url=/finances urlArg=/finances?tab=ventas estado=null
        diag sonda-historia doc=vmhmf4 metodo=replaceState url=/finances urlArg=/finances?tab=egresos estado={"claves":["__NA","__PRIVATE_NEXTJS_INTERNALS_TREE"]}
        diag sonda-historia doc=vmhmf4 metodo=replaceState url=/finances urlArg=/finances?tab=egresos estado={"claves":["__NA","__PRIVATE_NEXTJS_INTERNALS_TREE","frjView"],"frjView":"tab"}
        diag sonda-historia doc=vmhmf4 metodo=back url=/finances urlArg=(vacio) estado={"claves":["__NA","__PRIVATE_NEXTJS_INTERNALS_TREE","frjView"],"frjView":"tab"}
      al entrar: url=/finances?tab=ventas tab=Ventas alta=Nueva venta pila=[(afuera), /finances?tab=ventas] actual=1
      tras Egresos: url=/finances?tab=egresos estado={"frjView":"tab"} pila=[(afuera), /finances?tab=egresos] actual=1
      tras Turnos: url=(afuera) tab=ninguno pila=[(afuera), /finances?tab=egresos] actual=0
      tras el atras: url=(afuera) pila=[(afuera), /finances?tab=egresos] actual=0
```

El `back` de la última línea del instrumento ES el defecto: el toque a Turnos, con la entrada ajena ya
marcada como nuestra, consumió y sacó al dueño del sitio.

### El GREEN de la app — con `f3896d0`, rc 0, los cuatro en OK

```
OK  R-T-finanzas-por-mas · D-01 + D-04 por Mas: Inicio -> Mas -> Finanzas -> Ventas; la URL lleva ?tab=ventas con Nueva venta, el atras vuelve a Turnos sin alta, despues a Mas y despues a Inicio
OK  R-T-finanzas-desde-inicio · D-01 por la otra profundidad: la tarjeta Ingresos del mes de Inicio -> Finanzas -> Egresos; el atras vuelve a Turnos sin alta y el siguiente a Inicio
OK  R-T-finanzas-invalido · D-06 + D-07: /finances?tab=constructor, ?tab= y ?tab=turnos caen en Turnos con la URL saneada a /finances y sin agregar entradas
OK  R-T-finanzas-url-pegada · D-03 + Patron 3 + D-04: /finances?tab=ventas PEGADA -> Egresos -> Turnos; la URL queda en /finances DENTRO del sitio, sin marca fabricada, y el atras sale de la seccion
      tab_al_entrar: medido="Ventas"
      alta_al_entrar: medido="Nueva venta"
      marca_tras_egresos: medido="{\"frjView\":null}"
      ubicacion_tras_turnos: medido="/finances"
      tab_tras_turnos: medido="Turnos"
      ruta_tras_el_atras: medido="(afuera)"
      los objetivos de los clicks (en captura): 2
        click objetivo=button#base-ui-_R_6iuatpesht5r6lb_ tab=Egresos (0) seleccionado=false deshabilitado=false url=/finances?tab=ventas
        click objetivo=button#base-ui-_R_2iuatpesht5r6lb_ tab=Turnos (0) seleccionado=false deshabilitado=false url=/finances?tab=egresos
      tras Egresos: url=/finances?tab=egresos estado={"frjView":null} pila=[(afuera), /finances?tab=egresos] actual=1
      tras Turnos: url=/finances tab=Turnos pila=[(afuera), /finances] actual=1
      tras el atras: url=(afuera) pila=[(afuera), /finances] actual=0
```

Mismo entorno que `(a)`: `next dev` propio en el 3031 (sin servidor del dueño vivo), `Chrome/157.0.8103.52`,
node `v24.15.0`, gesto `interfaz`, modo estricto ACTIVO. El turno esperó ~14 min a una suite completa de
Playwright de `erp-forjo-studio` antes del RED válido: una espera, no un rojo.

- **Cambio de comportamiento DECLARADO en `/clients` (2026-11-17, plan 04-01):** sobre una `?c=` pegada, la
  fusión (`programmatic`) ya no marca la entrada, así que el «Volver» siguiente REEMPLAZA a `/clients` en vez
  de retroceder fuera del sitio. Lo fija el caso «CAMBIO DECLARADO en /clients» de
  `lib/panel-history.test.ts` y lo dice el docblock de `applyPanelView`.
- **Hallazgo fuera de alcance, medido y no tocado:** en un documento que nace en `/finances` a 390 px, el
  documento mide **407-415 px** de ancho (desborde horizontal de 17-25 px) — es lo que deja el viewport
  visual desplazado. Va a `deferred-items.md` de la fase.

cierre (b): el reemplazo no fabrica la marca

## (c) Negocio y Configuración en la URL, y el OAuth (plan 04-02, task 1)

| Pieza | Valor medido |
|---|---|
| Servidor | `next dev` **propio** de la sonda en `http://127.0.0.1:3031` en las dos corridas (no había un `next dev` del dueño vivo: sin `.next/dev/lock`); la sonda lo mató al salir y verificó el puerto libre |
| Navegador | `Chrome/157.0.8103.52`, `--headless=new`, perfil temporal propio; depuración en el 9335 |
| Node | `v24.15.0` |
| Gesto de atrás | `interfaz` (`chrome.tabs.goBack`) |
| Modo estricto | ACTIVO (`next.config.ts` sin `reactStrictMode`, huella `8ceb99aeabb6a8b16cbe0e6d836bf0aa1ae03578`) |
| Base | Supabase LOCAL de forjo-app ya levantada (`api local=200`; no hizo falta `supabase start`) |
| Viewport | 390×844 mobile; `R-T-sidebar-seccion-activa` corre a 1280×800 de escritorio y vuelve al celular en un `finally` |
| Sonda | `1b3e26f` (`test(04-02)`), con los `esperado` escritos antes del código |

Los siete recorridos, por el turno:

```
node scripts/con-turno.mjs node .planning/debug/probes/panel-exit-en-la-app.mjs dev interfaz R-T-negocio-por-mas,R-T-negocio-datos-consume,R-T-config-por-url,R-T-negocio-oauth-mp,R-T-negocio-oauth-google-error,R-T-sidebar-seccion-activa,R-T-secciones-sin-tab
```

### El RED — la app sin tocar (código de `1b3e26f`), rc 1, 6 en FALLA y el control de T-1 en OK

```
FALLA R-T-negocio-por-mas · MOB-08 criterio 1 / D-01 por Mas, la profundidad maxima: Inicio -> Mas -> Negocio -> Cobros -> Integraciones -> Cobros deja /negocio?tab=cobros con UNA entrada agregada; atras -> Datos -> Mas -> Inicio
      url_tras_los_tres_toques: medido="/negocio"  <-- NO COINCIDE
                                esperado="/negocio?tab=cobros"
      entradas_de_los_tres_toques: medido=0  <-- NO COINCIDE
                                   esperado=1
      url_tras_el_primer_atras: medido="/mas"  <-- NO COINCIDE
                                esperado="/negocio"
      tab_tras_el_primer_atras: medido="ninguno"  <-- NO COINCIDE
                                esperado="Datos"
      ruta_tras_el_segundo_atras: medido="/dashboard"  <-- NO COINCIDE
                                  esperado="/mas"
      ruta_tras_el_tercer_atras: medido="(afuera)"  <-- NO COINCIDE
                                 esperado="/dashboard"
      al entrar a Negocio: pila=[(afuera), /dashboard, /mas, /negocio] actual=3
      tras Cobros -> Integraciones -> Cobros: url=/negocio tab=Cobros estado={"frjUnder":"/mas"} pila=[(afuera), /dashboard, /mas, /negocio] actual=3
      tras el primer atras: url=/mas tab=ninguno pila=[(afuera), /dashboard, /mas, /negocio] actual=2
      tras el segundo atras: url=/dashboard#salir pila=[(afuera), /dashboard, /dashboard#salir] actual=2
      tras el tercer atras: url=(afuera) pila=[(afuera), /dashboard, /dashboard#salir] actual=0

FALLA R-T-negocio-datos-consume · D-02: Mas -> Negocio -> Cobros -> Datos; tocar Datos CONSUME la entrada del tab (el indice vuelve al de la seccion, la URL a /negocio) y el atras siguiente sale a Mas
      url_en_cobros: medido="/negocio"  <-- NO COINCIDE
                     esperado="/negocio?tab=cobros"
      indice_en_cobros_menos_el_de_la_seccion: medido=0  <-- NO COINCIDE
                                               esperado=1
      url_tras_datos: medido="/negocio"
      indice_tras_datos_menos_el_de_la_seccion: medido=0
      ruta_tras_el_atras: medido="/mas"
      indice de la seccion=3
      en Cobros: url=/negocio pila=[(afuera), /dashboard, /mas, /negocio] actual=3
      tras Datos: url=/negocio tab=Datos pila=[(afuera), /dashboard, /mas, /negocio] actual=3
      tras el atras: url=/mas pila=[(afuera), /dashboard, /mas, /negocio] actual=2

FALLA R-T-config-por-url · D-03 + D-06 + D-07 en Configuracion: /settings?tab=seguridad PEGADA abre Seguridad y el atras sale (sin Apariencia fabricada debajo); /settings?tab=ventas cae en Apariencia con la URL saneada a /settings sin agregar entradas
      tab_al_entrar: medido="Apariencia"  <-- NO COINCIDE
                     esperado="Seguridad"
      url_al_entrar: medido="/settings?tab=seguridad"
      ruta_tras_el_atras: medido="(afuera)"
      url_tras_ventas: medido="/settings?tab=ventas"  <-- NO COINCIDE
                       esperado="/settings"
      tab_tras_ventas: medido="Apariencia"
      entradas_del_saneo: medido=0
      al entrar: url=/settings?tab=seguridad tab=Apariencia pila=[(afuera), /settings?tab=seguridad] actual=1
      tras el atras: url=(afuera) pila=[(afuera), /settings?tab=seguridad] actual=0
      ventas al cargar: pila=[(afuera), /settings?tab=ventas] actual=1
      ventas tras el saneo: url=/settings?tab=ventas tab=Apariencia pila=[(afuera), /settings?tab=ventas] actual=1

FALLA R-T-negocio-oauth-mp · D-09 / T-2 (criterio 3 simulado con la URL exacta del backend): /negocio?mp=connected muestra el toast UNA vez y queda en /negocio?tab=integraciones con un reemplazo sin marca fabricada; Datos deja /negocio dentro del sitio y el atras sale
      url_tras_el_retorno: medido="/negocio"  <-- NO COINCIDE
                           esperado="/negocio?tab=integraciones"
      tab_tras_el_retorno: medido="Integraciones"
      toasts_mp: medido=0  <-- NO COINCIDE
                 esperado=1
      entradas_del_retorno: medido=0
      marca_tras_el_retorno: medido="null"  <-- NO COINCIDE
                             esperado="{\"frjView\":null}"
      ubicacion_tras_datos: medido="/negocio"
      ruta_tras_el_atras: medido="(afuera)"
      al cargar: pila=[(afuera), /negocio?mp=connected] actual=1
      tras el retorno: url=/negocio tab=Integraciones estado=null toasts=0 pila=[(afuera), /negocio] actual=1
      tras Datos: url=/negocio pila=[(afuera), /negocio] actual=1
      tras el atras: url=(afuera) pila=[(afuera), /negocio] actual=0

FALLA R-T-negocio-oauth-google-error · D-09, la rama de error: /negocio?google=error muestra el toast de error UNA vez y queda en /negocio?tab=integraciones
      url_tras_el_retorno: medido="/negocio"  <-- NO COINCIDE
                           esperado="/negocio?tab=integraciones"
      tab_tras_el_retorno: medido="Integraciones"
      toasts_google_error: medido=0  <-- NO COINCIDE
                           esperado=1
      al cargar: pila=[(afuera), /negocio?google=error] actual=1
      tras el retorno: url=/negocio tab=Integraciones estado=null toasts=0 pila=[(afuera), /negocio] actual=1

FALLA R-T-sidebar-seccion-activa · D-08 en ESCRITORIO: Inicio -> Negocio (sidebar) -> Cobros -> Negocio (sidebar) deja /negocio en Datos consumiendo la entrada del tab; con /negocio?tab=cobros PEGADA, el mismo toque deja /negocio en Datos sin salir del sitio
      url_tras_tocar_negocio: medido="/negocio"
      tab_tras_tocar_negocio: medido="Cobros"  <-- NO COINCIDE
                              esperado="Datos"
      indice_tras_tocar_negocio_menos_i1: medido=0  <-- NO COINCIDE
                                          esperado=-1
      url_pegada_tras_tocar_negocio: medido="/negocio"
      tab_pegada_tras_tocar_negocio: medido="Datos"
      en Cobros: url=/negocio pila=[(afuera), /dashboard, /negocio] actual=2
      tras tocar Negocio: url=/negocio tab=Cobros pila=[(afuera), /dashboard, /negocio] actual=2
      pegada al entrar: url=/negocio?tab=cobros tab=Datos pila=[(afuera), /negocio?tab=cobros] actual=1
      pegada tras tocar Negocio: url=/negocio tab=Datos pila=[(afuera), /negocio] actual=1

OK  R-T-secciones-sin-tab · T-1, control: /servicios?tab=cobros, /equipo?tab=cobros y /consultorios?tab=cobros dejan la URL como entro, sin ninguna TabsList y sin agregar entradas
      servicios_url_igual: medido="si"
      servicios_tabs_lists: medido=0
      equipo_url_igual: medido="si"
      equipo_tabs_lists: medido=0
      consultorios_url_igual: medido="si"
      consultorios_tabs_lists: medido=0
      entradas_agregadas: medido=0
      /servicios: url al cargar=/servicios?tab=cobros a los 3 s=/servicios?tab=cobros tabs-list=0 entradas agregadas=0 pila=[(afuera), /negocio, /servicios?tab=cobros] actual=2
      /equipo: url al cargar=/equipo?tab=cobros a los 3 s=/equipo?tab=cobros tabs-list=0 entradas agregadas=0 pila=[(afuera), /negocio, /servicios?tab=cobros, /equipo?tab=cobros] actual=3
      /consultorios: url al cargar=/consultorios?tab=cobros a los 3 s=/consultorios?tab=cobros tabs-list=0 entradas agregadas=0 pila=[(afuera), /negocio, /servicios?tab=cobros, /equipo?tab=cobros, /consultorios?tab=cobros] actual=4
```

**Lo que el RED nombró, además del tab:** con el código de antes los dos retornos del OAuth miden
`toasts=0` —el aviso «MercadoPago conectado» / «No se pudo conectar con Google Calendar» NUNCA se veía—
aunque el efecto sí corría (la query desaparecía: la limpieza va en el mismo efecto, después del toast).
Leído en `node_modules/sonner/dist/index.mjs` (2.0.7): `toast()` sólo publica a los suscriptores de ESE
momento (`publish` recorre `subscribers`), y el `<Toaster>` se suscribe en su propio `useEffect`; como
está montado DESPUÉS de `{children}` en `app/layout.tsx`, su efecto corre después del de la pantalla y,
en un documento nuevo —el retorno del OAuth lo es siempre—, el toast se pierde sin error. No es un
defecto del instrumento: el contador sí ve los toasts que llegan (ver el GREEN). Se arregló en el mismo
commit (`[Rule 1]`): el aviso se pide en la próxima tarea (`setTimeout(…, 0)`, sin limpieza a propósito:
el desmontaje simulado del modo estricto lo cancelaría y la segunda corrida ya no ve la query).

### El GREEN — con `3adb255` (`feat(04-02)`), rc 0, los siete en OK

```
OK  R-T-negocio-por-mas · MOB-08 criterio 1 / D-01 por Mas, la profundidad maxima: Inicio -> Mas -> Negocio -> Cobros -> Integraciones -> Cobros deja /negocio?tab=cobros con UNA entrada agregada; atras -> Datos -> Mas -> Inicio
      url_tras_los_tres_toques: medido="/negocio?tab=cobros"
      entradas_de_los_tres_toques: medido=1
      url_tras_el_primer_atras: medido="/negocio"
      tab_tras_el_primer_atras: medido="Datos"
      ruta_tras_el_segundo_atras: medido="/mas"
      ruta_tras_el_tercer_atras: medido="/dashboard"
      al entrar a Negocio: pila=[(afuera), /dashboard, /mas, /negocio] actual=3
      tras Cobros -> Integraciones -> Cobros: url=/negocio?tab=cobros tab=Cobros estado={"frjView":"tab"} pila=[(afuera), /dashboard, /mas, /negocio, /negocio?tab=cobros] actual=4
      tras el primer atras: url=/negocio tab=Datos pila=[(afuera), /dashboard, /mas, /negocio, /negocio?tab=cobros] actual=3
      tras el segundo atras: url=/mas pila=[(afuera), /dashboard, /mas, /negocio, /negocio?tab=cobros] actual=2
      tras el tercer atras: url=/dashboard#salir pila=[(afuera), /dashboard, /dashboard#salir] actual=2

OK  R-T-negocio-datos-consume · D-02: Mas -> Negocio -> Cobros -> Datos; tocar Datos CONSUME la entrada del tab (el indice vuelve al de la seccion, la URL a /negocio) y el atras siguiente sale a Mas
      url_en_cobros: medido="/negocio?tab=cobros"
      indice_en_cobros_menos_el_de_la_seccion: medido=1
      url_tras_datos: medido="/negocio"
      indice_tras_datos_menos_el_de_la_seccion: medido=0
      ruta_tras_el_atras: medido="/mas"
      indice de la seccion=3
      en Cobros: url=/negocio?tab=cobros pila=[(afuera), /dashboard, /mas, /negocio, /negocio?tab=cobros] actual=4
      tras Datos: url=/negocio tab=Datos pila=[(afuera), /dashboard, /mas, /negocio, /negocio?tab=cobros] actual=3
      tras el atras: url=/mas pila=[(afuera), /dashboard, /mas, /negocio, /negocio?tab=cobros] actual=2

OK  R-T-config-por-url · D-03 + D-06 + D-07 en Configuracion: /settings?tab=seguridad PEGADA abre Seguridad y el atras sale (sin Apariencia fabricada debajo); /settings?tab=ventas cae en Apariencia con la URL saneada a /settings sin agregar entradas
      tab_al_entrar: medido="Seguridad"
      url_al_entrar: medido="/settings?tab=seguridad"
      ruta_tras_el_atras: medido="(afuera)"
      url_tras_ventas: medido="/settings"
      tab_tras_ventas: medido="Apariencia"
      entradas_del_saneo: medido=0
      al entrar: url=/settings?tab=seguridad tab=Seguridad pila=[(afuera), /settings?tab=seguridad] actual=1
      tras el atras: url=(afuera) pila=[(afuera), /settings?tab=seguridad] actual=0
      ventas al cargar: pila=[(afuera), /settings?tab=ventas] actual=1
      ventas tras el saneo: url=/settings tab=Apariencia pila=[(afuera), /settings] actual=1

OK  R-T-negocio-oauth-mp · D-09 / T-2 (criterio 3 simulado con la URL exacta del backend): /negocio?mp=connected muestra el toast UNA vez y queda en /negocio?tab=integraciones con un reemplazo sin marca fabricada; Datos deja /negocio dentro del sitio y el atras sale
      url_tras_el_retorno: medido="/negocio?tab=integraciones"
      tab_tras_el_retorno: medido="Integraciones"
      toasts_mp: medido=1
      entradas_del_retorno: medido=0
      marca_tras_el_retorno: medido="{\"frjView\":null}"
      ubicacion_tras_datos: medido="/negocio"
      ruta_tras_el_atras: medido="(afuera)"
      al cargar: pila=[(afuera), /negocio?mp=connected] actual=1
      tras el retorno: url=/negocio?tab=integraciones tab=Integraciones estado={"frjView":null} toasts=1 pila=[(afuera), /negocio?tab=integraciones] actual=1
      tras Datos: url=/negocio pila=[(afuera), /negocio] actual=1
      tras el atras: url=(afuera) pila=[(afuera), /negocio] actual=0

OK  R-T-negocio-oauth-google-error · D-09, la rama de error: /negocio?google=error muestra el toast de error UNA vez y queda en /negocio?tab=integraciones
      url_tras_el_retorno: medido="/negocio?tab=integraciones"
      tab_tras_el_retorno: medido="Integraciones"
      toasts_google_error: medido=1
      al cargar: pila=[(afuera), /negocio?google=error] actual=1
      tras el retorno: url=/negocio?tab=integraciones tab=Integraciones estado={"frjView":null} toasts=1 pila=[(afuera), /negocio?tab=integraciones] actual=1

OK  R-T-sidebar-seccion-activa · D-08 en ESCRITORIO: Inicio -> Negocio (sidebar) -> Cobros -> Negocio (sidebar) deja /negocio en Datos consumiendo la entrada del tab; con /negocio?tab=cobros PEGADA, el mismo toque deja /negocio en Datos sin salir del sitio
      url_tras_tocar_negocio: medido="/negocio"
      tab_tras_tocar_negocio: medido="Datos"
      indice_tras_tocar_negocio_menos_i1: medido=-1
      url_pegada_tras_tocar_negocio: medido="/negocio"
      tab_pegada_tras_tocar_negocio: medido="Datos"
      en Cobros: url=/negocio?tab=cobros pila=[(afuera), /dashboard, /negocio, /negocio?tab=cobros] actual=3
      tras tocar Negocio: url=/negocio tab=Datos pila=[(afuera), /dashboard, /negocio, /negocio?tab=cobros] actual=2
      pegada al entrar: url=/negocio?tab=cobros tab=Cobros pila=[(afuera), /negocio?tab=cobros] actual=1
      pegada tras tocar Negocio: url=/negocio tab=Datos pila=[(afuera), /negocio] actual=1

OK  R-T-secciones-sin-tab · T-1, control: /servicios?tab=cobros, /equipo?tab=cobros y /consultorios?tab=cobros dejan la URL como entro, sin ninguna TabsList y sin agregar entradas
      servicios_url_igual: medido="si"
      servicios_tabs_lists: medido=0
      equipo_url_igual: medido="si"
      equipo_tabs_lists: medido=0
      consultorios_url_igual: medido="si"
      consultorios_tabs_lists: medido=0
      entradas_agregadas: medido=0
      /servicios: url al cargar=/servicios?tab=cobros a los 3 s=/servicios?tab=cobros tabs-list=0 entradas agregadas=0 pila=[(afuera), /negocio, /servicios?tab=cobros] actual=2
      /equipo: url al cargar=/equipo?tab=cobros a los 3 s=/equipo?tab=cobros tabs-list=0 entradas agregadas=0 pila=[(afuera), /negocio, /servicios?tab=cobros, /equipo?tab=cobros] actual=3
      /consultorios: url al cargar=/consultorios?tab=cobros a los 3 s=/consultorios?tab=cobros tabs-list=0 entradas agregadas=0 pila=[(afuera), /negocio, /servicios?tab=cobros, /equipo?tab=cobros, /consultorios?tab=cobros] actual=4
```

- **D-01, la profundidad máxima por Más:** `[…, /mas, /negocio, /negocio?tab=cobros{V}]` — Cobros empujó,
  Integraciones y el segundo Cobros reemplazaron (una sola entrada); los tres atrás cayeron en Datos, Más e
  Inicio (`/dashboard#salir`: el aviso de salida de la Phase 3 quedó armado al volver, como siempre).
- **D-09 (T-2):** el retorno quedó en `/negocio?tab=integraciones` con `{"frjView":null}` (un reemplazo, sin
  marca fabricada sobre la entrada ajena), sin entradas nuevas y con UN toast en modo estricto; Datos después
  reemplazó a `/negocio` y el atrás salió a la página de afuera (no hubo retroceso fuera del sitio en el toque).
- **D-08:** sobre la entrada nuestra, tocar Negocio en el sidebar consumió (índice −1, Datos); sobre la URL
  pegada, el `<Link>` reemplazó a `/negocio` limpia (Datos, índice igual, dentro del sitio).
- **T-1:** el control dio `OK` en las dos corridas: `/servicios`, `/equipo` y `/consultorios` con `?tab=cobros`
  dejan la URL como entró, sin `TabsList` y sin entradas.
- **El segundo gate del task 1** (T-1 por diff contra `85c99ae`, el esqueleto textual, `SECTION_TAB`, el
  `<Tabs>`, las dos `TabsList`, el corte, el `drop`, el crudo en cero, las páginas, lo bloqueado, la huella de
  `next.config.ts`, las ocho suites —605/605—, `tsc` limpio y eslint de settings exactamente
  `immutability=6, purity=2, set-state-in-effect=2`): rc 0.

cierre (c): negocio y configuracion en la url

## (d) Agenda y los candados del cableado (plan 04-02, task 2)

Mismo entorno que `(c)`: `next dev` propio en el 3031 (sin servidor del dueño vivo), `Chrome/157.0.8103.52`,
node `v24.15.0`, gesto `interfaz`, modo estricto ACTIVO.

### Los candados (`test/panel-tabs.test.ts`, el `describe` «el cableado de los tres grupos»), RED → GREEN

Con los candados escritos (`8b9f57d`, `test(04-02)`) y Agenda sin tocar, la suite dio **2 rojos, los dos de
aserción y los dos esperados**:

```
× (a) criterio 5: el fuente CRUDO de las tres pantallas no escribe el historial; el descontado tampoco navega la pila
    Expected: "app/(dashboard)/agenda/agenda-client.tsx: false"
    Received: "app/(dashboard)/agenda/agenda-client.tsx: true"
× (h) Agenda limpia su ?google= por el helper (D-10): un reemplazo stale que borra sólo google
    AssertionError: expected '.get(\'google\')\n    if (!g) return\…' to contain 'applyPanelView('
Tests  2 failed | 51 passed (53)
```

Con `cb0d519` (`feat(04-02)` de Agenda): las ocho suites de historial **8 / 615**, la pura entera **77 archivos**
en verde (rc 0, 08:56 AR: dentro de la ventana de los canarios de reloj).

**Un instrumento que medía cero, encontrado al escribir el caso (i):** el `sinComentarios` del molde saca los
comentarios de bloque ANTES que los de línea, y `settings-client.tsx` tiene un comentario de línea que nombra
`/api/google/*`: ese `/*` abría un bloque falso que se comía **24.933 caracteres** de código, incluidas las dos
`TabsList`. El (i) dio rojo por región vacía (la guarda de honestidad lo atajó); las aserciones negativas sobre
ese tramo habrían dado verde midiendo nada. El `describe` nuevo usa `sinComentariosFirme` (saca primero los
comentarios de línea entera) y un caso de honestidad afirma que el fuente descontado conserva
`{isNegocio && (`, el trigger de Suscripción y `function alElegirTab(`.

### Las cuatro mutaciones, vistas en rojo y restauradas

La salida del gate del plan (su `mutar`, con el árbol limpio después: `arbol limpio=0`):

```
mutacion roja: [, drop: ['mp', 'google']]
mutacion roja: [const txTab = tabResuelto.value]
mutacion roja: [isSection ? undefined :]
mutacion roja: [if (grupoDeTabs === null || vueltaDeOAuth) return]
```

Y se re-midieron
con un script que lee los literales de un ARCHIVO (en esta máquina el `node` de Volta puede pasar por `cmd`, la
lección del 04-01), para nombrar qué caso cae y de qué tipo:

```
M-4 rc=1 rojos=1 tipos=[AssertionError] restaurado=true :: [, drop: ['mp', 'google']]
    × (g) el retorno del OAuth en Negocio: un reemplazo del helper con drop, y la reconciliación cortada mientras dura
M-5 rc=1 rojos=2 tipos=[AssertionError] restaurado=true :: [const txTab = tabResuelto.value]
    × no sobrevive ninguna segunda fuente de verdad: ni el useState del tab ni su setter
    × (b) ninguna segunda fuente de verdad: sin el estado del tab de Negocio, de Configuración ni de Finanzas
M-6 rc=1 rojos=1 tipos=[AssertionError] restaurado=true :: [isSection ? undefined :]
    × (c) T-1 textual: la rama de las secciones, SECTION_TAB, el <Tabs> y las dos TabsList de siempre
M-7 rc=1 rojos=1 tipos=[AssertionError] restaurado=true :: [if (grupoDeTabs === null || vueltaDeOAuth) return]
    × (g) el retorno del OAuth en Negocio: un reemplazo del helper con drop, y la reconciliación cortada mientras dura
```

Las cuatro: mutacion roja (M-4, M-5, M-6, M-7), restauradas con la huella verificada y `git status` limpio.

### El barrido crudo del criterio 5 (el `grep` del ROADMAP, comentarios incluidos)

```
$ grep -rE 'pushState|replaceState|history\.back' "app/(dashboard)/settings/settings-client.tsx" "app/(dashboard)/finances/finances-client.tsx" "app/(dashboard)/agenda/agenda-client.tsx"
(sin salida) · rc=1
```

### El RED de la app — Agenda sin tocar (código de `8b9f57d`), rc 1

```
OK  R-T-negocio-oauth-mp · D-09 / T-2 (criterio 3 simulado con la URL exacta del backend): /negocio?mp=connected muestra el toast UNA vez y queda en /negocio?tab=integraciones con un reemplazo sin marca fabricada; Datos deja /negocio dentro del sitio y el atras sale
      url_tras_el_retorno: medido="/negocio?tab=integraciones"
      tab_tras_el_retorno: medido="Integraciones"
      toasts_mp: medido=1
      entradas_del_retorno: medido=0
      marca_tras_el_retorno: medido="{\"frjView\":null}"
      ubicacion_tras_datos: medido="/negocio"
      ruta_tras_el_atras: medido="(afuera)"
      al cargar: pila=[(afuera), /negocio?tab=integraciones] actual=1
      tras el retorno: url=/negocio?tab=integraciones tab=Integraciones estado={"frjView":null} toasts=1 pila=[(afuera), /negocio?tab=integraciones] actual=1
      tras Datos: url=/negocio pila=[(afuera), /negocio] actual=1
      tras el atras: url=(afuera) pila=[(afuera), /negocio] actual=0

OK  R-T-secciones-sin-tab · T-1, control: /servicios?tab=cobros, /equipo?tab=cobros y /consultorios?tab=cobros dejan la URL como entro, sin ninguna TabsList y sin agregar entradas
      servicios_url_igual: medido="si"
      servicios_tabs_lists: medido=0
      equipo_url_igual: medido="si"
      equipo_tabs_lists: medido=0
      consultorios_url_igual: medido="si"
      consultorios_tabs_lists: medido=0
      entradas_agregadas: medido=0
      /servicios: url al cargar=/servicios?tab=cobros a los 3 s=/servicios?tab=cobros tabs-list=0 entradas agregadas=0 pila=[(afuera), /servicios?tab=cobros] actual=1
      /equipo: url al cargar=/equipo?tab=cobros a los 3 s=/equipo?tab=cobros tabs-list=0 entradas agregadas=0 pila=[(afuera), /servicios?tab=cobros, /equipo?tab=cobros] actual=2
      /consultorios: url al cargar=/consultorios?tab=cobros a los 3 s=/consultorios?tab=cobros tabs-list=0 entradas agregadas=0 pila=[(afuera), /servicios?tab=cobros, /equipo?tab=cobros, /consultorios?tab=cobros] actual=3

FALLA R-T-agenda-google · D-10: /agenda?google=connected muestra el toast UNA vez y deja /agenda por un reemplazo del helper, sin entradas agregadas y con {frjView:null}
      url_tras_limpiar: medido="/agenda"
      toasts_google: medido=0  <-- NO COINCIDE
                     esperado=1
      entradas_de_la_limpieza: medido=0
      marca_tras_limpiar: medido="null"  <-- NO COINCIDE
                          esperado="{\"frjView\":null}"
      al cargar: pila=[(afuera), /agenda?google=connected] actual=1
      tras limpiar: url=/agenda estado=null toasts=0 pila=[(afuera), /agenda] actual=1
```

Igual que en Negocio, con el código de antes el toast de Agenda NO se veía (`toasts=0`): es el mismo toast sin
suscriptor de sonner de `(c)`, y se arregló igual en el mismo commit (`[Rule 1]`). La marca medía `null` (la
escritura cruda dejaba un state nulo, sin nuestra clave): el RED del dialecto.

### El GREEN de la app — con `cb0d519`, rc 0, los tres en OK

```
OK  R-T-negocio-oauth-mp · D-09 / T-2 (criterio 3 simulado con la URL exacta del backend): /negocio?mp=connected muestra el toast UNA vez y queda en /negocio?tab=integraciones con un reemplazo sin marca fabricada; Datos deja /negocio dentro del sitio y el atras sale
      url_tras_el_retorno: medido="/negocio?tab=integraciones"
      tab_tras_el_retorno: medido="Integraciones"
      toasts_mp: medido=1
      entradas_del_retorno: medido=0
      marca_tras_el_retorno: medido="{\"frjView\":null}"
      ubicacion_tras_datos: medido="/negocio"
      ruta_tras_el_atras: medido="(afuera)"
      al cargar: pila=[(afuera), /negocio?tab=integraciones] actual=1
      tras el retorno: url=/negocio?tab=integraciones tab=Integraciones estado={"frjView":null} toasts=1 pila=[(afuera), /negocio?tab=integraciones] actual=1
      tras Datos: url=/negocio pila=[(afuera), /negocio] actual=1
      tras el atras: url=(afuera) pila=[(afuera), /negocio] actual=0

OK  R-T-secciones-sin-tab · T-1, control: /servicios?tab=cobros, /equipo?tab=cobros y /consultorios?tab=cobros dejan la URL como entro, sin ninguna TabsList y sin agregar entradas
      servicios_url_igual: medido="si"
      servicios_tabs_lists: medido=0
      equipo_url_igual: medido="si"
      equipo_tabs_lists: medido=0
      consultorios_url_igual: medido="si"
      consultorios_tabs_lists: medido=0
      entradas_agregadas: medido=0
      /servicios: url al cargar=/servicios?tab=cobros a los 3 s=/servicios?tab=cobros tabs-list=0 entradas agregadas=0 pila=[(afuera), /servicios?tab=cobros] actual=1
      /equipo: url al cargar=/equipo?tab=cobros a los 3 s=/equipo?tab=cobros tabs-list=0 entradas agregadas=0 pila=[(afuera), /servicios?tab=cobros, /equipo?tab=cobros] actual=2
      /consultorios: url al cargar=/consultorios?tab=cobros a los 3 s=/consultorios?tab=cobros tabs-list=0 entradas agregadas=0 pila=[(afuera), /servicios?tab=cobros, /equipo?tab=cobros, /consultorios?tab=cobros] actual=3

OK  R-T-agenda-google · D-10: /agenda?google=connected muestra el toast UNA vez y deja /agenda por un reemplazo del helper, sin entradas agregadas y con {frjView:null}
      url_tras_limpiar: medido="/agenda"
      toasts_google: medido=1
      entradas_de_la_limpieza: medido=0
      marca_tras_limpiar: medido="{\"frjView\":null}"
      al cargar: pila=[(afuera), /agenda?google=connected] actual=1
      tras limpiar: url=/agenda estado={"frjView":null} toasts=1 pila=[(afuera), /agenda] actual=1
```

cierre (d): un solo dialecto

## (e) La composición con la Phase 3, medida (plan 04-03)

Qué se preguntó: qué le pasa a la pila REAL cuando el dueño toca la barra (o el sidebar) con un tab —o la
ficha de un cliente— abierto arriba. El research (`04-RESEARCH.md` §«⚠ La composición con la Phase 3»,
tabla C-1..C-6) lo había DERIVADO del código sin medirlo (A1): con un tab arriba, el gesto lee el
`history.state` de la ENTRADA DEL TAB (`{"frjView":"tab"}`, sin `frjUnder`), así que `masDebajo` y
`raizDebajo` dan falso y la regla 0 de `panelBranchPlan` devuelve lo de `panelNavMode`.

**Con qué se midió.** `next dev` propio en el 3031 (no había servidor de este repo vivo; el de forjo-landing
en el 3000 no se tocó), Supabase local ya arriba (`auth/v1/health` = 200, no hizo falta `supabase start`),
`Chrome/157.0.8103.52`, node `v24.15.0`, gesto `interfaz` (el atrás de la interfaz por la extensión de
prueba), modo estricto ACTIVO. La app es la que dejó el 04-02 (`1c7a374`): nada de código cambió. Los seis
`esperado` son la pila DERIVADA, escritos en `b47555d` (`test(04-03)`) ANTES de esta corrida y no tocados
después. Una sola corrida, por el turno, en segundo plano, sin esperas ajenas; rc 0, puertos 3031 y 9335
libres al salir.

```
node scripts/con-turno.mjs node .planning/debug/probes/panel-exit-en-la-app.mjs dev interfaz R-C-2,R-C-3,R-C-4,R-C-5,R-C-6,R-C-ficha
```

Qué es «la pila» en estas líneas: `pila=[…]` es la NORMALIZADA (`pilaNormalizada`: las entradas hasta la
actual inclusive, sin `(afuera)`, sin las de hash `#salir…` y con `?c=<id>` → `?c=*`); `cruda=[…]` es
`Page.getNavigationHistory` tal cual, con las entradas de adelante; `estado` es la marca (`frj*`) de la
entrada de arriba; `aviso` es `si` sólo si la página está parada en `#salir`/`#salir-N`.

### Las seis líneas, tal cual

```
OK  R-C-2 · C-2 (movil): Inicio -> Mas -> Negocio -> Cobros -> tocar Inicio en la barra; derivado: Inicio se EMPUJA encima del tab, el aviso de salida no se arma y el atras vuelve al tab
      pila_tras_inicio: medido=["/dashboard","/mas","/negocio","/negocio?tab=cobros","/dashboard"]
      aviso_armado_en_inicio: medido="no"
      ruta_tras_un_atras: medido="/negocio?tab=cobros"
      en Cobros, antes del toque: url=/negocio?tab=cobros estado={"frjView":"tab"} aviso=no pila=[/dashboard, /mas, /negocio, /negocio?tab=cobros] cruda=[(afuera), /dashboard, /mas, /negocio, /negocio?tab=cobros] actual=4
      tras tocar Inicio: url=/dashboard estado={"frjUnder":"/negocio"} aviso=no pila=[/dashboard, /mas, /negocio, /negocio?tab=cobros, /dashboard] cruda=[(afuera), /dashboard, /mas, /negocio, /negocio?tab=cobros, /dashboard] actual=5
      tras el primer atras: url=/negocio?tab=cobros estado={"frjView":"tab"} aviso=no pila=[/dashboard, /mas, /negocio, /negocio?tab=cobros] cruda=[(afuera), /dashboard, /mas, /negocio, /negocio?tab=cobros, /dashboard] actual=4

OK  R-C-3 · C-3 (movil): Inicio -> Mas -> Negocio -> Cobros -> tocar Turnos en la barra; derivado: Turnos REEMPLAZA la entrada del tab, el atras cae en Negocio y el siguiente en Mas
      pila_tras_turnos: medido=["/dashboard","/mas","/negocio","/appointments"]
      ruta_tras_un_atras: medido="/negocio"
      ruta_tras_dos_atras: medido="/mas"
      en Cobros, antes del toque: url=/negocio?tab=cobros estado={"frjView":"tab"} aviso=no pila=[/dashboard, /mas, /negocio, /negocio?tab=cobros] cruda=[(afuera), /dashboard, /mas, /negocio, /negocio?tab=cobros] actual=4
      tras tocar Turnos: url=/appointments estado={} aviso=no pila=[/dashboard, /mas, /negocio, /appointments] cruda=[(afuera), /dashboard, /mas, /negocio, /appointments] actual=4
      tras el primer atras: url=/negocio estado={"frjUnder":"/mas"} aviso=no pila=[/dashboard, /mas, /negocio] cruda=[(afuera), /dashboard, /mas, /negocio, /appointments] actual=3
      tras el segundo atras: url=/mas estado={"frjUnder":"/dashboard"} aviso=no pila=[/dashboard, /mas] cruda=[(afuera), /dashboard, /mas, /negocio, /appointments] actual=2

OK  R-C-4 · C-4 (movil): Inicio -> Mas -> Negocio -> Cobros -> tocar Mas en la barra; derivado: Mas se EMPUJA encima del tab (no sube) y el atras vuelve al tab
      pila_tras_mas: medido=["/dashboard","/mas","/negocio","/negocio?tab=cobros","/mas"]
      ruta_tras_un_atras: medido="/negocio?tab=cobros"
      en Cobros, antes del toque: url=/negocio?tab=cobros estado={"frjView":"tab"} aviso=no pila=[/dashboard, /mas, /negocio, /negocio?tab=cobros] cruda=[(afuera), /dashboard, /mas, /negocio, /negocio?tab=cobros] actual=4
      tras tocar Mas: url=/mas estado={"frjUnder":"/negocio"} aviso=no pila=[/dashboard, /mas, /negocio, /negocio?tab=cobros, /mas] cruda=[(afuera), /dashboard, /mas, /negocio, /negocio?tab=cobros, /mas] actual=5
      tras el primer atras: url=/negocio?tab=cobros estado={"frjView":"tab"} aviso=no pila=[/dashboard, /mas, /negocio, /negocio?tab=cobros] cruda=[(afuera), /dashboard, /mas, /negocio, /negocio?tab=cobros, /mas] actual=4

OK  R-C-5 · C-5 (escritorio): Inicio -> Negocio (sidebar) -> Cobros -> Finanzas (sidebar); derivado: Finanzas REEMPLAZA la entrada del tab y el atras desde Finanzas cae en Negocio, no en Inicio
      pila_tras_finanzas: medido=["/dashboard","/negocio","/finances"]
      ruta_tras_un_atras: medido="/negocio"
      en Cobros, antes del toque: url=/negocio?tab=cobros estado={"frjView":"tab"} aviso=no pila=[/dashboard, /negocio, /negocio?tab=cobros] cruda=[(afuera), /dashboard, /negocio, /negocio?tab=cobros] actual=3
      tras tocar Finanzas: url=/finances estado={} aviso=no pila=[/dashboard, /negocio, /finances] cruda=[(afuera), /dashboard, /negocio, /finances] actual=3
      tras el primer atras: url=/negocio estado={"frjUnder":"/dashboard"} aviso=no pila=[/dashboard, /negocio] cruda=[(afuera), /dashboard, /negocio, /finances] actual=2

OK  R-C-6 · C-6 (escritorio): Inicio -> Negocio (sidebar) -> Cobros -> Inicio (sidebar); derivado: Inicio se EMPUJA encima del tab (igual que el residuo de escritorio ya declarado) y el atras vuelve al tab
      pila_tras_inicio: medido=["/dashboard","/negocio","/negocio?tab=cobros","/dashboard"]
      ruta_tras_un_atras: medido="/negocio?tab=cobros"
      en Cobros, antes del toque: url=/negocio?tab=cobros estado={"frjView":"tab"} aviso=no pila=[/dashboard, /negocio, /negocio?tab=cobros] cruda=[(afuera), /dashboard, /negocio, /negocio?tab=cobros] actual=3
      tras tocar Inicio: url=/dashboard estado={"frjUnder":"/negocio"} aviso=no pila=[/dashboard, /negocio, /negocio?tab=cobros, /dashboard] cruda=[(afuera), /dashboard, /negocio, /negocio?tab=cobros, /dashboard] actual=4
      tras el primer atras: url=/negocio?tab=cobros estado={"frjView":"tab"} aviso=no pila=[/dashboard, /negocio, /negocio?tab=cobros] cruda=[(afuera), /dashboard, /negocio, /negocio?tab=cobros, /dashboard] actual=3

OK  R-C-ficha · el hueco de hoy con ?c= (movil): Inicio -> Clientes -> abrir una ficha -> tocar Inicio en la barra; derivado: Inicio se EMPUJA encima de la ficha, el aviso no se arma y el atras vuelve a la ficha
      pila_tras_inicio: medido=["/dashboard","/clients","/clients?c=*","/dashboard"]
      aviso_armado_en_inicio: medido="no"
      ruta_tras_un_atras: medido="/clients?c=*"
      en la ficha, antes del toque: url=/clients?c=0000000a-0000-0000-0000-000000000001 estado={"frjView":"c"} aviso=no pila=[/dashboard, /clients, /clients?c=*] cruda=[(afuera), /dashboard, /clients, /clients?c=0000000a-0000-0000-0000-000000000001] actual=3
      tras tocar Inicio: url=/dashboard estado={"frjUnder":"/clients"} aviso=no pila=[/dashboard, /clients, /clients?c=*, /dashboard] cruda=[(afuera), /dashboard, /clients, /clients?c=0000000a-0000-0000-0000-000000000001, /dashboard] actual=4
      tras el primer atras: url=/clients?c=0000000a-0000-0000-0000-000000000001 estado={"frjView":"c"} aviso=no pila=[/dashboard, /clients, /clients?c=*] cruda=[(afuera), /dashboard, /clients, /clients?c=0000000a-0000-0000-0000-000000000001, /dashboard] actual=3
```

### Lo que ve el dueño, recorrido por recorrido

| Recorrido | Sin el tab (Phase 3, verificado) | Derivado (research) → medido | Lo que ve el dueño |
|---|---|---|---|
| `R-C-2` (celular) `Más → Negocio → Cobros → Inicio` | colapsa a `[/dashboard]` y el aviso se arma | empuja `[/dashboard, /mas, /negocio, /negocio?tab=cobros, /dashboard]`, aviso `no` → **igual** | el atrás desde Inicio vuelve a Cobros en vez de avisar; el aviso de salida no está (el síntoma de `G2-1` por otro camino); el atrás recorre Cobros, Datos y Más antes de volver al Inicio de abajo |
| `R-C-3` (celular) `… → Cobros → Turnos` | `[/dashboard, /appointments]` | reemplaza el tab: `[/dashboard, /mas, /negocio, /appointments]`; atrás → `/negocio`, otro → `/mas` → **igual** | desde Turnos el atrás pasa por Negocio y Más antes de llegar a Inicio: dos escalones de más |
| `R-C-4` (celular) `… → Cobros → Más` | sube a Más | empuja `[…, /negocio?tab=cobros, /mas]`; atrás → `/negocio?tab=cobros` → **igual** | Más se apila arriba del tab: el atrás desde Más vuelve a Cobros en vez de a Inicio |
| `R-C-5` (escritorio) `Inicio → Negocio → Cobros → Finanzas` (sidebar) | `[/dashboard, /finances]` | `[/dashboard, /negocio, /finances]`; atrás → `/negocio` → **igual** | el atrás desde Finanzas cae en Negocio (Datos) en vez de Inicio: rompe el «el atrás cae en el dashboard» de NAV-07 por un escalón |
| `R-C-6` (escritorio) `… → Cobros → Inicio` (sidebar) | empuja (residuo de escritorio ya declarado) | empuja `[/dashboard, /negocio, /negocio?tab=cobros, /dashboard]`; atrás → `/negocio?tab=cobros` → **igual** | lo mismo que hoy sin el tab: el residuo de escritorio declarado en la Phase 3, ahora con el tab abajo |
| `R-C-ficha` (celular) `Inicio → Clientes → ficha → Inicio` | — (nunca medido; hueco sin declarar) | empuja `[/dashboard, /clients, /clients?c=*, /dashboard]`, aviso `no`; atrás → `/clients?c=*` → **igual** | el mismo síntoma de `R-C-2`, que **ya existe hoy** con la ficha de un cliente: el atrás desde Inicio reabre la ficha y el aviso no se arma |

Las seis son **degradación segura**: la pila queda más larga, ningún atrás expulsó del sitio (ningún
`(afuera)` alcanzado en ninguna corrida). Y el mecanismo quedó a la vista en el `estado`: antes de cada toque
la entrada de arriba lleva `{"frjView":"tab"}` (o `{"frjView":"c"}` en la ficha), sin `frjUnder`; el destino
que se empuja nace con `{"frjUnder":"/negocio"}` (o `/clients`), así que la regla del armado
`algoNuestroDebajo` no arma.

C-1: medido en el 04-02 (R-T-negocio-por-mas OK)

composicion medida: como-se-derivo

### El residuo, declarado (decisión B1 del dueño)

Decisión del dueño del 2026-11-17: **B1** (`04-DECISION-COMPOSICION.md`). Con el criterio de la Phase 3
—se declara en vez de descubrirse en la próxima UAT; degradación segura: un escalón más, nunca una
expulsión—, lo que queda declarado con esta fecha es **un solo caso**:

- **C-5 (escritorio, sidebar):** `Inicio → Negocio → Cobros → Finanzas` deja `[/dashboard, /negocio,
  /finances]` y el atrás desde Finanzas cae en **Negocio** en vez de Inicio (`R-C-5`, arriba). Con el tab
  arriba, el sidebar lee la entrada del tab (`{"frjView":"tab"}`, sin `frjUnder`) y no tiene el hook de la
  rama: cae en la regla de rutas y reemplaza la entrada del tab. Cerrarlo es B2, que reabre la enmienda de
  MOB-07: descartado en esta fase.

Lo que **no** queda como residuo: C-2, C-3, C-4 y el hueco de la ficha `?c=` (`R-C-ficha`) los cierra el
plan `04-04` en la barra, y se miden ahí con sus `R-B1-*` (los `R-C-2/3/4/ficha` pasan a `obsoleto` con su
`esperado` intacto). C-6 sigue siendo el residuo de escritorio de la Phase 3 (entrada 16 de
`.planning/WINDOWS.md`), ahora con el tab abajo. El tercer retroceso encadenado que B1 introduce (tab →
sección → Más → Inicio) **no está medido todavía**: lo mide el 04-04 (`R-B1-inicio`) antes de darlo por
bueno.

Escrito en los cuatro lugares: el docblock de `lib/panel-tabs.ts`, esta subsección, el «RESIDUO ACEPTADO
el 2026-11-17» debajo de MOB-08 en `REQUIREMENTS.md` y su entrada `unmet-truth` de la fase 4 en
`.planning/WINDOWS.md`.

## (f) B1 en la barra (plan 04-04)

Qué se cerró: la decisión **B1** del dueño (2026-11-17, `04-DECISION-COMPOSICION.md`). Con una subsección
NUESTRA arriba —el tab Cobros de `/negocio` o la ficha `?c=` de `/clients`— el gesto de la barra la
**consume primero** y recién después decide con la pila real, así que termina **igual que sin la
subsección**. El mecanismo: el séptimo miembro `consume-view-then-navigate` de `PanelBranchPlan`, el hecho
`vistaArriba` (sin default) y la regla `-1d` en `panelBranchPlan` (después de la `-1b`, antes de la `-1c`);
en el ejecutor, la rama con el molde de `consume-exit-then-navigate` y un `reDecidir` opcional; en el hook de
la barra, `decidirDesdeElAterrizaje` re-lee la pila y re-decide con la misma política.

**Con qué se midió.** Igual que `(e)`: `next dev` propio en el 3031 (el de forjo-landing en el 3000 no se
tocó), Supabase local arriba, `Chrome/157.0.8103.52`, node `v24.15.0`, gesto `interfaz`, modo estricto
ACTIVO. Cada `R-B1-*` mide el MISMO gesto con y sin la subsección (el **control**), re-entrando directo entre
los dos; el `esperado` es la decisión del dueño, escrito en `f8fdb12` (`test(04-04)`) ANTES del arreglo.
Las dos corridas por el turno, en segundo plano (la primera esperó el turno del ERP).

```
node scripts/con-turno.mjs node .planning/debug/probes/panel-exit-en-la-app.mjs dev interfaz R-B1-inicio,R-B1-turnos,R-B1-mas,R-B1-ficha
```

### El RED — con el código de antes del arreglo (`f8fdb12`), rc 1, los cuatro en FALLA

Los cuatro controles dan la pila de la Phase 3 (`[/dashboard]` con el aviso armado, `[/dashboard,
/appointments]`, `[/dashboard, /mas]`, `[/dashboard]` con el aviso armado): el instrumento mide lo que dice.
Las variantes dan las pilas de `(e)`.

```
FALLA R-B1-inicio · B1 (movil): Mas -> Negocio -> Cobros -> tocar Inicio termina igual que Mas -> Negocio -> tocar Inicio (el retroceso TRIPLE tab -> seccion -> Mas -> Inicio)
      pila_del_control: medido=["/dashboard"]
      pila_igual_al_control: medido="no"  <-- NO COINCIDE
                             esperado="si"
      aviso_igual_al_control: medido="no"  <-- NO COINCIDE
                              esperado="si"
      control, en Negocio, antes del toque: url=/negocio estado={"frjUnder":"/mas"} aviso=no pila=[/dashboard, /mas, /negocio] cruda=[(afuera), /dashboard, /mas, /negocio] actual=3
      control, tras el toque: url=/dashboard#salir estado={"frjExit":67} aviso=si pila=[/dashboard] cruda=[(afuera), /dashboard, /dashboard#salir] actual=2
      variante, en Cobros, antes del toque: url=/negocio?tab=cobros estado={"frjView":"tab"} aviso=no pila=[/dashboard, /mas, /negocio, /negocio?tab=cobros] cruda=[(afuera), /dashboard, /mas, /negocio, /negocio?tab=cobros] actual=4
      variante, tras el toque: url=/dashboard estado={"frjUnder":"/negocio"} aviso=no pila=[/dashboard, /mas, /negocio, /negocio?tab=cobros, /dashboard] cruda=[(afuera), /dashboard, /mas, /negocio, /negocio?tab=cobros, /dashboard] actual=5
      aviso del control=si · aviso de la variante=no

FALLA R-B1-turnos · B1 (movil): Mas -> Negocio -> Cobros -> tocar Turnos termina igual que Mas -> Negocio -> tocar Turnos (colapsa a Inicio + Turnos)
      pila_del_control: medido=["/dashboard","/appointments"]
      pila_igual_al_control: medido="no"  <-- NO COINCIDE
                             esperado="si"
      control, en Negocio, antes del toque: url=/negocio estado={"frjUnder":"/mas"} aviso=no pila=[/dashboard, /mas, /negocio] cruda=[(afuera), /dashboard, /mas, /negocio] actual=3
      control, tras el toque: url=/appointments estado={"frjUnder":"/dashboard"} aviso=no pila=[/dashboard, /appointments] cruda=[(afuera), /dashboard, /appointments, /negocio] actual=2
      variante, en Cobros, antes del toque: url=/negocio?tab=cobros estado={"frjView":"tab"} aviso=no pila=[/dashboard, /mas, /negocio, /negocio?tab=cobros] cruda=[(afuera), /dashboard, /mas, /negocio, /negocio?tab=cobros] actual=4
      variante, tras el toque: url=/appointments estado={} aviso=no pila=[/dashboard, /mas, /negocio, /appointments] cruda=[(afuera), /dashboard, /mas, /negocio, /appointments] actual=4
      aviso del control=no · aviso de la variante=no

FALLA R-B1-mas · B1 (movil): Mas -> Negocio -> Cobros -> tocar Mas sube igual que Mas -> Negocio -> tocar Mas (D-03, no apila)
      pila_del_control: medido=["/dashboard","/mas"]
      pila_igual_al_control: medido="no"  <-- NO COINCIDE
                             esperado="si"
      control, en Negocio, antes del toque: url=/negocio estado={"frjUnder":"/mas"} aviso=no pila=[/dashboard, /mas, /negocio] cruda=[(afuera), /dashboard, /mas, /negocio] actual=3
      control, tras el toque: url=/mas estado={"frjUnder":"/dashboard"} aviso=no pila=[/dashboard, /mas] cruda=[(afuera), /dashboard, /mas, /negocio] actual=2
      variante, en Cobros, antes del toque: url=/negocio?tab=cobros estado={"frjView":"tab"} aviso=no pila=[/dashboard, /mas, /negocio, /negocio?tab=cobros] cruda=[(afuera), /dashboard, /mas, /negocio, /negocio?tab=cobros] actual=4
      variante, tras el toque: url=/mas estado={"frjUnder":"/negocio"} aviso=no pila=[/dashboard, /mas, /negocio, /negocio?tab=cobros, /mas] cruda=[(afuera), /dashboard, /mas, /negocio, /negocio?tab=cobros, /mas] actual=5
      aviso del control=no · aviso de la variante=no

FALLA R-B1-ficha · B1 (movil): Inicio -> Clientes -> ficha -> tocar Inicio termina igual que Inicio -> Clientes -> tocar Inicio (la ficha ?c= consumida primero)
      pila_del_control: medido=["/dashboard"]
      pila_igual_al_control: medido="no"  <-- NO COINCIDE
                             esperado="si"
      aviso_igual_al_control: medido="no"  <-- NO COINCIDE
                              esperado="si"
      control, en Clientes, antes del toque: url=/clients estado={"frjUnder":"/dashboard"} aviso=no pila=[/dashboard, /clients] cruda=[(afuera), /dashboard, /clients] actual=2
      control, tras el toque: url=/dashboard#salir estado={"frjExit":1} aviso=si pila=[/dashboard] cruda=[(afuera), /dashboard, /dashboard#salir] actual=2
      variante, en la ficha, antes del toque: url=/clients?c=0000000a-0000-0000-0000-000000000001 estado={"frjView":"c"} aviso=no pila=[/dashboard, /clients, /clients?c=*] cruda=[(afuera), /dashboard, /clients, /clients?c=0000000a-0000-0000-0000-000000000001] actual=3
      variante, tras el toque: url=/dashboard estado={"frjUnder":"/clients"} aviso=no pila=[/dashboard, /clients, /clients?c=*, /dashboard] cruda=[(afuera), /dashboard, /clients, /clients?c=0000000a-0000-0000-0000-000000000001, /dashboard] actual=4
      aviso del control=si · aviso de la variante=no
```

### El GREEN — con `b13f0a1` (`fix(04-04)`), rc 0, los cuatro en OK

```
OK  R-B1-inicio · B1 (movil): Mas -> Negocio -> Cobros -> tocar Inicio termina igual que Mas -> Negocio -> tocar Inicio (el retroceso TRIPLE tab -> seccion -> Mas -> Inicio)
      pila_del_control: medido=["/dashboard"]
      pila_igual_al_control: medido="si"
      aviso_igual_al_control: medido="si"
      control, en Negocio, antes del toque: url=/negocio estado={"frjUnder":"/mas"} aviso=no pila=[/dashboard, /mas, /negocio] cruda=[(afuera), /dashboard, /mas, /negocio] actual=3
      control, tras el toque: url=/dashboard#salir estado={"frjExit":1} aviso=si pila=[/dashboard] cruda=[(afuera), /dashboard, /dashboard#salir] actual=2
      variante, en Cobros, antes del toque: url=/negocio?tab=cobros estado={"frjView":"tab"} aviso=no pila=[/dashboard, /mas, /negocio, /negocio?tab=cobros] cruda=[(afuera), /dashboard, /mas, /negocio, /negocio?tab=cobros] actual=4
      variante, tras el toque: url=/dashboard#salir estado={"frjExit":1} aviso=si pila=[/dashboard] cruda=[(afuera), /dashboard, /dashboard#salir] actual=2
      aviso del control=si · aviso de la variante=si

OK  R-B1-turnos · B1 (movil): Mas -> Negocio -> Cobros -> tocar Turnos termina igual que Mas -> Negocio -> tocar Turnos (colapsa a Inicio + Turnos)
      pila_del_control: medido=["/dashboard","/appointments"]
      pila_igual_al_control: medido="si"
      control, en Negocio, antes del toque: url=/negocio estado={"frjUnder":"/mas"} aviso=no pila=[/dashboard, /mas, /negocio] cruda=[(afuera), /dashboard, /mas, /negocio] actual=3
      control, tras el toque: url=/appointments estado={"frjUnder":"/dashboard"} aviso=no pila=[/dashboard, /appointments] cruda=[(afuera), /dashboard, /appointments, /negocio] actual=2
      variante, en Cobros, antes del toque: url=/negocio?tab=cobros estado={"frjView":"tab"} aviso=no pila=[/dashboard, /mas, /negocio, /negocio?tab=cobros] cruda=[(afuera), /dashboard, /mas, /negocio, /negocio?tab=cobros] actual=4
      variante, tras el toque: url=/appointments estado={"frjUnder":"/dashboard"} aviso=no pila=[/dashboard, /appointments] cruda=[(afuera), /dashboard, /appointments, /negocio, /negocio?tab=cobros] actual=2
      aviso del control=no · aviso de la variante=no

OK  R-B1-mas · B1 (movil): Mas -> Negocio -> Cobros -> tocar Mas sube igual que Mas -> Negocio -> tocar Mas (D-03, no apila)
      pila_del_control: medido=["/dashboard","/mas"]
      pila_igual_al_control: medido="si"
      control, en Negocio, antes del toque: url=/negocio estado={"frjUnder":"/mas"} aviso=no pila=[/dashboard, /mas, /negocio] cruda=[(afuera), /dashboard, /mas, /negocio] actual=3
      control, tras el toque: url=/mas estado={"frjUnder":"/dashboard"} aviso=no pila=[/dashboard, /mas] cruda=[(afuera), /dashboard, /mas, /negocio] actual=2
      variante, en Cobros, antes del toque: url=/negocio?tab=cobros estado={"frjView":"tab"} aviso=no pila=[/dashboard, /mas, /negocio, /negocio?tab=cobros] cruda=[(afuera), /dashboard, /mas, /negocio, /negocio?tab=cobros] actual=4
      variante, tras el toque: url=/mas estado={"frjUnder":"/dashboard"} aviso=no pila=[/dashboard, /mas] cruda=[(afuera), /dashboard, /mas, /negocio, /negocio?tab=cobros] actual=2
      aviso del control=no · aviso de la variante=no

OK  R-B1-ficha · B1 (movil): Inicio -> Clientes -> ficha -> tocar Inicio termina igual que Inicio -> Clientes -> tocar Inicio (la ficha ?c= consumida primero)
      pila_del_control: medido=["/dashboard"]
      pila_igual_al_control: medido="si"
      aviso_igual_al_control: medido="si"
      control, en Clientes, antes del toque: url=/clients estado={"frjUnder":"/dashboard"} aviso=no pila=[/dashboard, /clients] cruda=[(afuera), /dashboard, /clients] actual=2
      control, tras el toque: url=/dashboard#salir estado={"frjExit":1} aviso=si pila=[/dashboard] cruda=[(afuera), /dashboard, /dashboard#salir] actual=2
      variante, en la ficha, antes del toque: url=/clients?c=0000000a-0000-0000-0000-000000000001 estado={"frjView":"c"} aviso=no pila=[/dashboard, /clients, /clients?c=*] cruda=[(afuera), /dashboard, /clients, /clients?c=0000000a-0000-0000-0000-000000000001] actual=3
      variante, tras el toque: url=/dashboard#salir estado={"frjExit":1} aviso=si pila=[/dashboard] cruda=[(afuera), /dashboard, /dashboard#salir] actual=2
      aviso del control=si · aviso de la variante=si
```

**El retroceso TRIPLE, medido** (lo que la Phase 3 nunca encadenó): en `R-B1-inicio` la variante sale de
`cruda=[(afuera), /dashboard, /mas, /negocio, /negocio?tab=cobros] actual=4` y, con UN toque en Inicio,
termina en `url=/dashboard#salir estado={"frjExit":1} aviso=si cruda=[(afuera), /dashboard,
/dashboard#salir] actual=2`: tab → sección → Más → Inicio sin perder un paso, y el sentinel de salida
empujado sobre la entrada ORIGINAL de Inicio (las tres de adelante quedaron truncadas por ese empuje), igual
que el control. En `R-B1-turnos` y `R-B1-mas` las entradas de adelante (`/negocio`, `/negocio?tab=cobros`)
quedan en `cruda` después de la actual, no alcanzables con el atrás, igual que en el control.

### Las suites, las dos mutaciones y los gates

- Los casos nuevos en rojo en `5366056` (`test(04-04)`): 12 rojos de 414 en `lib/panel-history.test.ts` +
  `test/panel-branch.test.ts` + `lib/unsaved-changes.test.ts`, todos casos nuevos o las tres cuentas que el
  plan actualiza a propósito (el `switch` del guard 6 → 7, los `if` de `panelBranchPlan` 6 → 7, los
  miembros propios del tipo 4 → 5). Con `b13f0a1`: las ocho suites de historial 630/630, la pura 77
  archivos / 1804 + 3 expected-fail.
- **MB1** (borrar `if (vistaArriba && from !== to) return 'consume-view-then-navigate'` de
  `lib/panel-history.ts`) ⇒ `lib/panel-history.test.ts` ROJA; **MB2** (`vistaArriba:
  panelViewEntryParam(estado) !== null && !isForeignOwnedEntry(estado)` → `vistaArriba: false` en
  `lib/panel-branch.ts`) ⇒ `test/panel-branch.test.ts` ROJA. Las dos restauradas con la huella verificada;
  árbol limpio.
- `panelNavMode` byte-idéntica a la del 04-03; cero temporizadores en `runBranchNavigation`; nada fuera del
  plan cambiado desde el 04-03 (sidebar, barra, `app/`, `lib/panel-tabs.ts`, los intocables); `tsc` sin
  errores; `eslint` rc 0 en los siete archivos.

cierre (f): b1 en la barra

### La no-regresión completa (plan 04-04, task 2)

**Las dos corridas**, por el turno, en segundo plano, una después de la otra (la de la app esperó el turno de
otro proyecto antes de arrancar), con la app de `b13f0a1` y la sonda de `ae032a9` (los `R-C-2/3/4/ficha` ya
retirados). Entorno: `negocio-prueba` en `trial|true` (consultado en el contenedor local antes de correr; no
hizo falta la receta del 03-17), `next dev` propio en el 3031, `Chrome/157.0.8103.52`, gesto `interfaz`,
modo estricto ACTIVO.

```
node scripts/con-turno.mjs node .planning/debug/probes/panel-exit-en-la-app.mjs dev interfaz
node scripts/con-turno.mjs node .planning/debug/probes/panel-back-stack.mjs
```

- **La sonda de la app, sin selección:** rc 1 · `recorridos medidos: 47 · coinciden con lo esperado: 46 · no
  coinciden: 1`. Los cinco retirados no corren (`R-login-con-activacion` y los cuatro `R-C-*` de B1, cada uno
  con su línea `recorrido retirado, no corre por omision`). Los 46 en `OK`: `C-activacion`, todos los de la
  Phase 3 (`R-1.*`, `R-3.1`, `R-barra-*`, `R-lateral`, `R-G3-5-*`, `R-G3-6-*`, `R-G3-7-*`, `R-G3-9-*`,
  `R-G3-10-primer-toque-atras-tarde`, `R-G3-10-atras-y-toque`, `R-G3-10-pronto-y-toque`, `R-G3-8-rebote` —el
  último—), los doce `R-T-*`, `R-C-5`, `R-C-6` y los cuatro `R-B1-*`. La única línea `FALLA`:

```
FALLA R-G3-10-primer-toque-atras-pronto · G3-10: el dialogo del plan abierto por el primer toque y cerrado con el ATRAS dentro de la ventana de activacion: el reintento de G3-7 arma y el atras siguiente avisa
      toque_que_abre: medido="regla-0-foreignOwnsTop"
      retroceso_del_cierre: medido="ignore"
      armado_tras_cerrar: medido="arm"
      hash_tras_cerrar: medido="#salir"
      atras_siguiente: medido="sale"  <-- NO COINCIDE
                       esperado="avisa"
        tupla: hash_antes=#salir es_nuestro=si estado_antes={"frjExit":1} largo_antes=3 largo_despues=3 entradas_salteadas=1 ruta_despues=(afuera) documento_nuevo=no aviso_visible=no absorbido=no
```

  ⚠ **No es una regresión de B1, y está medido con control, no supuesto.** Es `G3-10`, el **costo del camino 1
  que el dueño declaró el 2026-11-16** (`veredicto G3-10: otro`, `.planning/debug/la-absorcion-que-no-absorbe-medida.md`
  §(i), y la viñeta de `## El costo, declarado` de `03-DECISION-UAT-3.md`): con la activación viva el
  reintento de `G3-7` arma `#salir` y Chrome lo saltea. Su `esperado` (`avisa`) se dejó intacto a propósito en
  la Phase 3, así que da `FALLA` en toda corrida completa desde el 03-17 —la misma tupla en el 03-17 y en el
  quick `261116-t5o`—. Y re-medido HOY con el código de antes del arreglo (los tres archivos de `5366056`
  puestos en el árbol sólo para esa corrida y restaurados con `git checkout -- <archivo>`, árbol limpio
  verificado): `FALLA` idéntica (`atras_siguiente: medido="sale"`, `entradas_salteadas=1`,
  `ruta_despues=(afuera)`). El camino no pasa por nada que B1 tocó: es Inicio con un overlay, sin gesto de la
  barra ni subsección. **P-B1-2 no aplica** (nada «se puso rojo» con el arreglo).
- **La sonda estática:** rc 0 · `escenarios medidos: 18 · coinciden con lo esperado: 18 · no coinciden: 0`.
- **Las suites:** la pura 77 archivos / 1804 + 3 expected-fail, rc 0; las ocho de historial 630/630.

no-regresion (plan 04-04): sonda de la app 46/47 en OK, estatica 18/18, suites verdes

## (g) La no-regresión de la fase (plan 04-05)

Qué se preguntó: si la fase entera —los tres grupos de tabs, el OAuth, Agenda, B1 en la barra y todo lo de la
Phase 3— está en verde **en una sola tanda**, antes de que el dueño toque nada. Nada de código cambió en este
plan: se midió la app de `b4471c2` (la de `b13f0a1` del 04-04 más docs).

**El entorno (paso 0).** 2026-11-17, 11:44 hora de Argentina (dentro de [01:00, 23:30], la ventana de los
canarios de reloj). Pila local de forjo-app arriba (no hizo falta `supabase start`; no se paró ni reseteó
ninguna pila). `negocio-prueba` en `trial|true` (consultado en `supabase_db_forjo-app`; no hizo falta la receta
del 03-17). Sin `next dev` de este repo vivo (sin `.next/dev/lock`; el 3031 libre): la sonda levantó el suyo en
el 3031 y lo cerró al salir (3031 y 9335 libres). El de forjo-landing en el 3000 no se tocó. `Chrome/157.0.8103.52`,
node `v24.15.0`, gesto `interfaz`, modo estricto ACTIVO.

**Las corridas (paso 1).** Las dos sondas por el turno, en segundo plano, una después de la otra; la pura, la
completa, `tsc`, el build y los candados fuera del turno, en la misma tanda.

```
node scripts/con-turno.mjs node .planning/debug/probes/panel-exit-en-la-app.mjs dev interfaz
node scripts/con-turno.mjs node .planning/debug/probes/panel-back-stack.mjs
./node_modules/.bin/vitest run --project pure
npm test
./node_modules/.bin/tsc --noEmit
npm run build
```

### La sonda de la app — dos corridas completas, la primera cortada por el servidor de desarrollo

- **Primera corrida (11:45:43 → 11:59:22), rc 1, incompleta.** Midió 42 recorridos en `OK` hasta `R-B1-inicio`
  (incluidos los doce `R-T-*`, `R-C-5` y `R-C-6`) y la `FALLA` declarada de `R-G3-10-primer-toque-atras-pronto`,
  y se cortó en el control de `R-B1-turnos` con su guarda: `la sonda no pudo completar la medicion: no hay un
  destino visible de la barra para /appointments`. El log del `next dev` de la sonda dice por qué: `[browser]
  Uncaught ChunkLoadError: Failed to load chunk /_next/static/chunks/node_modules_next_1c72fmn._.js …
  at NegocioPage (app\(dashboard)\negocio\page.tsx:32:7)`. La página de Negocio no hidrató en esa carga, así
  que la barra no llegó a estar visible: un fallo del servidor de desarrollo de esa corrida, no del
  instrumento ni de la app (P-1 no aplicó: no hubo nada que arreglar en la sonda; ningún `esperado` se tocó).
- **Segunda corrida, sin cambiar nada (12:05:51 → 12:34:25, con ~20 min de espera del turno: lo tenía el
  `npx playwright test` del ERP), rc 1, completa:** `gesto=interfaz · modo=dev · recorridos medidos: 47 ·
  coinciden con lo esperado: 46 · no coinciden: 1`. Los cinco retirados no corren (`R-login-con-activacion` y
  `R-C-2`, `R-C-3`, `R-C-4`, `R-C-ficha`, cada uno con su línea `recorrido retirado, no corre por omision`).
  Los 46 en `OK`: `C-activacion`, todos los de la Phase 3 (`R-1.*`, `R-3.1`, `R-barra-*`, `R-lateral`,
  `R-G3-5-*`, `R-G3-6-*`, `R-G3-7-*`, `R-G3-9-*`, `R-G3-10-primer-toque-atras-tarde`, `R-G3-10-atras-y-toque`,
  `R-G3-10-pronto-y-toque`, `R-G3-8-rebote`), los **doce** `R-T-*`, `R-C-5`, `R-C-6` y los cuatro `R-B1-*`
  (`R-B1-inicio`, `R-B1-turnos`, `R-B1-mas`, `R-B1-ficha`). La única línea `FALLA`:

```
FALLA R-G3-10-primer-toque-atras-pronto · G3-10: el dialogo del plan abierto por el primer toque y cerrado con el ATRAS dentro de la ventana de activacion: el reintento de G3-7 arma y el atras siguiente avisa
      toque_que_abre: medido="regla-0-foreignOwnsTop"
      retroceso_del_cierre: medido="ignore"
      armado_tras_cerrar: medido="arm"
      hash_tras_cerrar: medido="#salir"
      atras_siguiente: medido="sale"  <-- NO COINCIDE
                       esperado="avisa"
        tupla: hash_antes=#salir es_nuestro=si estado_antes={"frjExit":1} largo_antes=3 largo_despues=3 entradas_salteadas=1 ruta_despues=(afuera) documento_nuevo=no aviso_visible=no absorbido=no
```

  ⚠ **No es una regresión de la Phase 4.** Es `G3-10`, el **costo del camino 1 que el dueño declaró el
  2026-11-16** (`veredicto G3-10: otro`, `.planning/debug/la-absorcion-que-no-absorbe-medida.md`), con su
  `esperado` (`avisa`) intacto a propósito: da `FALLA` en toda corrida completa desde el 03-17. La tupla es la
  MISMA que en el 03-17, en el quick `261116-t5o` y en la re-medición con control del 04-04 (`(f)`, `### La
  no-regresión completa`: el código de antes de B1 dio la misma `FALLA`): `entradas_salteadas=1`,
  `ruta_despues=(afuera)`. Las dos corridas de este plan la dieron igual. Ningún `esperado` se tocó y no se
  cambió código por ella.

### Lo demás

- **La sonda estática:** rc 0 · `escenarios medidos: 18 · coinciden con lo esperado: 18 · no coinciden: 0`.
- **La pura:** rc 0 · 77 archivos · `Tests 1804 passed | 3 expected fail (1807)` (piso: 77 / 1764).
- **La completa** (`npm test`, con el carril `db`, 12:00:17, dentro de la ventana de los canarios): rc 0 ·
  `Test Files 111 passed (111)` · `Tests 2111 passed | 4 expected fail | 1 skipped (2116)` (piso: 111 archivos y
  2030 + 1804 − 1724 = 2110 casos).
- **`tsc --noEmit`:** cero `error TS`.
- **`eslint`, archivo por archivo** (los 15 que la fase tocó desde `85c99ae`), contra la misma cuenta en
  `85c99ae` (por `--stdin`, sin escribir nada): **ningún problema nuevo**. Limpios: las dos páginas de
  `negocio`/`settings`, `finances/page.tsx`, `unsaved-changes-guard.tsx`, `lib/panel-branch.ts`,
  `lib/panel-history.ts`, `lib/panel-tabs.ts` y los seis archivos de test. Con deuda preexistente, igual o menor
  que en `85c99ae`: `agenda-client.tsx` `react-hooks/purity=1` (=); `finances-client.tsx`
  `react-hooks/exhaustive-deps=1`, `react-hooks/set-state-in-effect=1` (=); `settings-client.tsx`
  `@next/next/no-img-element=4`, `react-hooks/immutability=6`, `react-hooks/purity=2` (=) y
  `react-hooks/set-state-in-effect=2` (en `85c99ae`: 3).
- **El build** (`npm run build`, 12:02:11 → 12:04:18): rc 0 · `✓ Compiled successfully in 29.6s` · `✓
  Generating static pages using 11 workers (64/64)`; cero `useSearchParams() should be wrapped in a suspense` /
  `Missing Suspense boundary`. P-7 no aplicó (no había un `next dev` del dueño vivo).
- **El barrido CRUDO del criterio 5:** `grep -rE 'pushState|replaceState|history\.back'` sobre
  `settings-client.tsx`, `finances-client.tsx` y `agenda-client.tsx` → salida vacía.
- **Lo bloqueado desde `85c99ae`:** `git diff --name-only 85c99ae HEAD -- lib/overlay-history.ts
  lib/dirty-history.ts scripts/con-turno.mjs next.config.ts app/(dashboard)/servicios app/(dashboard)/equipo
  app/(dashboard)/consultorios app/api package.json package-lock.json supabase` → vacío (rc 0); huella de
  `next.config.ts` = `8ceb99aeabb6a8b16cbe0e6d836bf0aa1ae03578`.

**El gate del task 1 da rc 1, y sólo por esa línea:** exige `medidos = coinciden` y la sonda da 47 / 46 por la
`FALLA` declarada de `G3-10`. Con la primera corrida, además, `medidos` quedó vacío (la corrida no llegó al
resumen). Todo lo demás del gate cumple (R-T en `OK` 12, estática 18, pura, completa, TS, build, Suspense,
criterio 5, bloqueado, huella). P-8 no aplicó: no hay nada en rojo que no sea el costo declarado.

no-regresion (plan 04-05): sonda de la app 46/47 en OK, estatica 18/18, pura 77/1804, completa 111/2111, tsc limpio, build ok, criterio 5 en cero

## (h) El primer toque de un tab no mueve la página (plan 04-06, G-04-6)

Qué se preguntó: si darle un NODO al `<Suspense>` de la página de Finanzas (un `div` vacío con la clase del
contenedor raíz de `FinancesClient`, `space-y-6 max-w-5xl`, y `aria-busy="true"`) apaga el salto al inicio del
primer toque de Ventas o Egresos después de una entrada blanda —la obs-1 del dueño en la UAT, diagnosticada en
`.planning/debug/finanzas-primer-toque-scroll.md`—, medido en la app real, con los esperados escritos y
commiteados ANTES de la primera corrida que los juzga (`c7a1a78`, `test(04-06): modo tras-el-fix de la sonda del
scroll`), y con Negocio sin tocar como control positivo en la misma corrida.

**El entorno.** 2026-11-17, 23:16 → 23:22 hora de Argentina. Pila local de forjo-app arriba (`/rest/v1/` 200; no
hizo falta `supabase start`; no se paró ni reseteó ninguna pila). Sin `next dev` de este repo vivo (sin
`.next/dev/lock`; 3031 y 9335 libres): la sonda levantó el suyo en el 3031 con `/login 200` al primer intento y lo
cerró al salir (3031 y 9335 libres). El de forjo-landing en el 3000 no se tocó. Turno libre en las dos corridas
(sin espera). `Chrome/157.0.8103.52`, node `v24.15.0`, modo estricto activo (`next.config.ts` sin tocar).

**Las corridas** (por el turno, en segundo plano, modo `tras-el-fix`):

```
# RED, las tres paginas sin tocar (huellas finances f079ef8df9a24c2b, negocio f7329e6119e061d6, settings ba61b06ee688be9c)
node scripts/con-turno.mjs node .planning/debug/probes/g04-scroll-y-recarga.mjs F-blanda-mas-movil,F-directa-movil,F-tarjeta-movil,F-sidebar-escritorio,N-negocio-borde-movil rojo-04-06 tras-el-fix
# verde de Finanzas, con 0777339 (finances 0368712e61af3350; negocio y settings sin tocar)
node scripts/con-turno.mjs node .planning/debug/probes/g04-scroll-y-recarga.mjs F-blanda-mas-movil,F-directa-movil,F-tarjeta-movil,F-sidebar-escritorio,N-negocio-borde-movil verde-finanzas-04-06 tras-el-fix
```

| recorrido | RED (sin tocar) | verde Finanzas (`0777339`) |
|---|---|---|
| `F-blanda-mas-movil` (Más → Finanzas, 390x844) | `FALLA`: Ventas 1404 → 147, `scrollTop=0` + `scrollIntoView()` desde `InnerScrollAndFocusHandlerOld.handlePotentialScroll < componentDidUpdate`; contenedor vacío 349 ms; 2º toque y re-entrada sin escritura | `OK`: Ventas 1404 → 1367 (−37 = recorte del viewport emulado), cero escrituras de Next; entrada con `hijos=1 visibles=0` (el nodo del fallback) 332 ms |
| `F-directa-movil` (carga dura, control) | `OK`: cero escrituras | `OK`: cero escrituras |
| `F-tarjeta-movil` (tarjeta «Ingresos del mes») | `FALLA`: Egresos 1404 → 147, las mismas dos escrituras; vacío 321 ms | `OK`: Egresos 1404 → 1349 (−55 = recorte), cero escrituras |
| `F-sidebar-escritorio` (1280x800) | `FALLA`: Ventas 830 → 115, las mismas dos escrituras; vacío 317 ms | `OK`: Ventas 830 → 830, cero escrituras |
| `N-negocio-borde-movil` (Más → Negocio, borde 40 px fuera) | `FALLA`: Cobros 187 → 0 con las mismas dos escrituras; vacío 363 ms | `FALLA` (control positivo, Negocio sin tocar): Cobros 187 → 0 con las mismas dos escrituras; `hijos=0` 364 ms |

La corrida RED dio exactamente lo escrito en el plan antes de correrla (los tres caminos blandos de Finanzas y
Negocio en `FALLA` con la pila `handlePotentialScroll`, la carga dura en `OK`): el instrumento discrimina (P-1 no
aplicó). En la de Finanzas, el contenedor de la página pasa de `hijos=0` a `hijos=1 visibles=0` durante la carga
del chunk —HAY nodo, de alto cero— y el primer toque deja de escribir en los tres caminos, mientras Negocio, en la
misma corrida y sin tocar, sigue escribiendo. Ningún `esperado_tras_el_fix` se tocó después de medir.

rojo (h): etiqueta=rojo-04-06 · modo=tras-el-fix · recorridos: 5 · coinciden con lo esperado tras el fix: 1
verde finanzas (h): etiqueta=verde-finanzas-04-06 · modo=tras-el-fix · recorridos: 5 · coinciden con lo esperado tras el fix: 4

### La corrida de las tres páginas (task 2) — 4/5: Negocio ya no escribe, pero el esperado `salto_toque1` no se cumple

Con `7a193a4` (las tres páginas con el boundary con nodo; huellas finances `0368712e61af3350`, negocio
`6380cdbcc48bc6cb`, settings `c3801bf0e8d32675`), 2026-11-17 23:24 → 23:27 hora de Argentina, mismo entorno
(servidor propio en el 3031 con `/login 200` al primer intento, turno libre, `Chrome/157.0.8103.52`, node `v24.15.0`):

```
node scripts/con-turno.mjs node .planning/debug/probes/g04-scroll-y-recarga.mjs F-blanda-mas-movil,F-directa-movil,F-tarjeta-movil,F-sidebar-escritorio,N-negocio-borde-movil verde-04-06 tras-el-fix
```

Veredicto impreso: `etiqueta=verde-04-06 · modo=tras-el-fix · recorridos: 5 · coinciden con lo esperado tras el fix: 4`
(rc 1). Los cuatro `F-*` en `OK`. `N-negocio-borde-movil` en `FALLA` por UNA clave:

```
FALLA N-negocio-borde-movil
      salto_toque1: medido="si"  <-- NO COINCIDE   (esperado="no")
      next_toque1: medido="no"
      next_toque2: medido="no"
      toque 1 (Cobros, borde fuera): y_antes=187 y_despues=0 llevo_al_inicio=si escritura_de_next=no
         antes: alto=1389 viewport=844 primera_top=-40 ruta=/negocio
         despues: alto=844 primera_top=147 ruta=/negocio?tab=cobros
         escrituras de scroll de la pagina: ninguna
```

Lo que dice el número: el arreglo SÍ cerró el mecanismo en Negocio —el contenedor pasa de `hijos=0` (RED) a
`hijos=1 visibles=0` en la entrada, y el primer toque ya no tiene NINGUNA escritura de scroll (en el RED tenía
`scrollTop=0` + `scrollIntoView()` desde `handlePotentialScroll`)—, pero el documento pasa de 1389 a 844 px al
mostrar Cobros (en local, sin cuenta de MercadoPago conectada, Cobros cabe en la pantalla: el máximo de scroll
queda en 0) y el navegador RECORTA el `scrollY` de 187 a 0. El clasificador `llevo_al_inicio` (borde de la página
de afuera a `>= 0`) no distingue ese recorte de un scroll de Next. El mismo `alto=1389 → 844` estaba en las tres
corridas (RED, verde de Finanzas y ésta) y en la corrida 2 del debug («además el alto bajó a 844 = viewport»);
el `esperado_tras_el_fix` de `salto_toque1` se escribió sin descontarlo. Ningún esperado se tocó: la ejecución
del plan 04-06 se detuvo acá para que se decida (regla del orquestador: un esperado que no coincide ⇒ parar).

### La decisión del dueño y el control del instrumento corregido (antes de volver a medir)

**La decisión** (2026-11-17, «A + control»): se corrige el INSTRUMENTO (P-1), no un esperado. En `3c25616`
(`test(04-06): la sonda descuenta el recorte por alto en llevo_al_inicio (P-1)`), `llevo_al_inicio` sale de una
función pura nueva, `clasificarToque`: un toque es `recorte_por_alto` —y entonces NO es salto— sólo si en ese toque
no hubo NINGUNA escritura de scroll de la página (la lista entera que graba la sonda, no sólo las de Next) Y el
máximo de scroll posible después del toque (`alto_despues - innerHeight`) es menor que `y_antes`. Con cualquier
escritura, o si el máximo alcanzaba, manda el criterio crudo de la corrida 3. El recorte se imprime aparte
(`recorte_por_alto: si`, informativo, no se juzga) y la línea `despues:` ahora trae su `viewport`. Ningún
`esperado_tras_el_fix` ni `esperado_si_HA` cambió (el diff del commit no toca ninguna de esas líneas).

**El control: que no haya quedado ciego.** Dos modos nuevos de la sonda, sin navegador (no pasan por el turno):

```
node .planning/debug/probes/g04-scroll-y-recarga.mjs --autotest
node .planning/debug/probes/g04-scroll-y-recarga.mjs --reclasificar rojo-04-06.txt verde-finanzas-04-06.txt verde-04-06.txt
```

1. `--autotest`, el clasificador con los números medidos: **5/5** (rc 0).

   | caso | entrada | salto | `recorte_por_alto` |
   |---|---|---|---|
   | RED de Negocio | 2 escrituras, 187 → 0, alto 1389 → 844, innerHeight 844 | `si` | `no` |
   | verde de Negocio | 0 escrituras, 187 → 0, alto 1389 → 844, innerHeight 844 | `no` | `si` |
   | sin escritura y sin recorte | 0 escrituras, 187 → 0, alto 1389 (máximo 545 ≥ 187) | `si` | `no` |
   | RED de `F-blanda` | 2 escrituras, 1404 → 147, alto 2248 | `si` | `no` |
   | `F-directa` (control) | 0 escrituras, 1404 → 1367, alto 2248 | `no` | `no` |

2. `--reclasificar` sobre los tres logs guardados de las corridas de hoy (re-lee cada toque —`y_antes`, mínimo,
   `primera_top`, alto de después, las líneas `ESCRITURA`— y le aplica el clasificador nuevo; el log viejo no traía
   el `viewport` de después y se usa el de antes, declarado en cada línea; un auto-chequeo verifica que el criterio
   crudo recalculado reproduce el `llevo_al_inicio` impreso en los 33 toques: cero errores del parser):
   - **RED (`rojo-04-06`): 11 toques, 0 cambian.** Los cuatro `FALLA` siguen `FALLA`: `F-blanda`, `F-tarjeta` y
     `F-sidebar` con salto `si` (1404 → 147, 1404 → 147, 830 → 115, dos escrituras cada uno) y **Negocio 187 → 0
     con salto `si`** (tenía las dos escrituras de `handlePotentialScroll`: no es recorte). `F-directa` sigue `OK`
     (sus dos toques sin salto). Como las claves `next_*` salen de la pila de las escrituras, que la corrección no
     toca, el veredicto reclasificado es el mismo: 1/5.
   - **verde de Finanzas (`verde-finanzas-04-06`): 11 toques, 0 cambian** (ahí Negocio, sin tocar, tenía las dos
     escrituras: sigue `si`, sigue `FALLA`, 4/5).
   - **verde de las tres páginas (`verde-04-06`): 11 toques, 1 cambia:** `N-negocio-borde-movil` toque 1 (Cobros),
     0 escrituras, 187 → 0, alto 844 = viewport ⇒ salto `si` → `no`, `recorte_por_alto: si`. Es el único toque de
     los 33 que la corrección mueve.

Conclusión del control: el clasificador corregido sigue viendo los cuatro saltos del RED —incluido el de Negocio
187 → 0, que es numéricamente idéntico al recorte pero tenía escritura de Next— y sólo deja de contar el toque sin
ninguna escritura cuyo máximo de scroll se achicó por debajo de `y_antes`. Recién con esto se vuelve a medir.

### La corrida final de las tres páginas (task 2, con el instrumento corregido) — 5/5

Con `3c25616` (el clasificador corregido) sobre `7a193a4` (las tres páginas con el boundary con nodo; huellas
finances `0368712e61af3350`, negocio `6380cdbcc48bc6cb`, settings `c3801bf0e8d32675`: las mismas de la corrida 4/5),
2026-11-17 23:37 → 23:39 hora de Argentina. Turno libre (tomado y soltado por esta corrida, sin espera). Pila local
arriba (`/rest/v1/` 200), sin `next dev` de este repo vivo: la sonda levantó el suyo en el 3031 con `/login 200` al
primer intento y lo cerró al salir (3031 y 9335 libres). El de forjo-landing en el 3000 no se tocó.
`Chrome/157.0.8103.52`, node `v24.15.0`.

```
node scripts/con-turno.mjs node .planning/debug/probes/g04-scroll-y-recarga.mjs F-blanda-mas-movil,F-directa-movil,F-tarjeta-movil,F-sidebar-escritorio,N-negocio-borde-movil verde-04-06 tras-el-fix
```

| recorrido | resultado | el primer toque |
|---|---|---|
| `F-blanda-mas-movil` | `OK` | Ventas 1404 → 1367, cero escrituras; entrada con el nodo del fallback 1840 ms; 2º toque y re-entrada sin escrituras |
| `F-directa-movil` (control) | `OK` | Ventas 1404 → 1367, cero escrituras |
| `F-tarjeta-movil` | `OK` | Egresos 1404 → 1349, cero escrituras; entrada 315 ms |
| `F-sidebar-escritorio` | `OK` | Ventas 830 → 830, cero escrituras; entrada 322 ms |
| `N-negocio-borde-movil` | `OK` | Cobros 187 → 0 con CERO escrituras y alto 1389 → 844 = viewport: `recorte_por_alto: si`, salto `no`; `next_toque1` y `next_toque2` en `no`; entrada 372 ms |

El `recorte_por_alto: si` informativo también aparece en los toques de Finanzas en móvil que bajan 37 o 55 px: el
viewport emulado crece de 844 a 881/899 (la barra de direcciones emulada) y el máximo de scroll se achica por debajo
de `y_antes`; esos toques ya daban salto `no` con el criterio crudo y siguen igual (`--reclasificar` sobre este log:
11 toques, 0 cambian, cero errores del parser). El único toque que la corrección movió en toda la fase es el de
Negocio, y el control de arriba muestra que el mismo 187 → 0 CON escritura sigue siendo salto.

verde (h): etiqueta=verde-04-06 · modo=tras-el-fix · recorridos: 5 · coinciden con lo esperado tras el fix: 5

cierre (h): el primer toque no mueve la pagina

## (i) Un toque, una decisión, y la vuelta del OAuth que no traba (plan 04-07, G-04-7 y G-04-8)

Qué se preguntó: si los dos gaps del code review que el dueño decidió cerrar en la fase (opción B) quedan cerrados
en los módulos puros y en el ejecutor —un dialecto—, con el RED de cada uno commiteado ANTES de su arreglo. El
contrato son los `red_tests` de `.planning/debug/doble-toque-tab.md` (G-04-7) y de
`.planning/debug/oauth-traba-tabs-negocio.md` (G-04-8).

### G-04-7 — un toque decide con la URL de ahora, y un consumo en vuelo no se repite

**El RED** (`1ed8ee3`, `test(04-07): el doble toque, rojo`; sólo `test/panel-tabs.test.ts`). `montarHistoria` ganó
el `popstate` (con `once`) y la opción `backAsincrono` con `procesar()`: el retroceso real es asíncrono y el
síncrono de antes no podía expresar E3. Corrida: 12 rojos, 55 verdes (los 53 de antes más las regresiones E1, E2 y
E4, que ya pasaban porque el `tocar` de la suite leía la URL —la versión arreglada, no la del handler—). Cada rojo
es de su aserción o, en los cinco casos de `toqueDeTab`, del símbolo ausente en SU caso (`toqueDeTab is not a
function`, import por namespace): ninguno es de carga del archivo.

rojo (i) G-04-7: 12 casos rojos: (f) el handler del toque en Negocio/Configuración y en Finanzas, y ningún router ni literal ?tab= en las pantallas · toqueDeTab existe y es una función del módulo de tabs · toqueDeTab: Ventas desde la URL limpia ⇒ from null, to ventas · toqueDeTab: Ventas con ?tab=ventas en la URL ⇒ from ventas, to ventas (la regla 2 la ve) · toqueDeTab: un ?tab= de prototipo cae al default (D-07) ⇒ from null, to egresos · toqueDeTab: un valor que no es del grupo ⇒ { ok: false } · toqueDeTab: Datos desde Cobros en Negocio ⇒ from cobros, to null (el default es la URL limpia) · E3: doble toque al default antes del recorrido ⇒ consume, none, UN solo retroceso y la URL en /finances · un empuje durante el consumo se descarta (none, la pila no cambia) y después del recorrido empuja · un popstate AJENO antes del nuestro suelta la guarda (nunca queda colgada) y después ningún toque queda bloqueado · candado del espejo: el `tocar` de ESTA suite pide el toque a toqueDeTab con la URL de ahora · candado de la guarda: en applyPanelView, la guarda antes de holding, y en consume el encendido y el oyente antes del retroceso

Lo que cada rojo decía antes del arreglo: E3 `'consume'` donde va `'none'` (el segundo toque consumía otra vez); el
empuje durante el consumo `'replace'` donde va `'none'`; el `popstate` ajeno, `0` oyentes donde va `1` (no había
guarda que soltar); (f) y el espejo, sin `toqueDeTab(`; la guarda, ausente en `applyPanelView`.

**El GREEN** (`43c2198`, `fix(04-07): un toque decide con la url de ahora y no consume dos veces`):
`toqueDeTab({ grupo, value, search })` en `lib/panel-tabs.ts`; la guarda `consumoEnVuelo` (no exportada) con
`soltarConsumo` en `applyPanelView`; los dos `alElegirTab` por `toqueDeTab` con `window.location.search`; el `tocar`
de la suite por el mismo helper. Las ocho suites de historial 8/644, `test/panel-tabs.test.ts` 67, `tsc` limpio,
la deuda de eslint de las dos pantallas sin cambios.

### G-04-8 — un solo criterio para la vuelta del OAuth, y una limpieza que escribe

**El RED** (`c06850e`, `test(04-07): la vuelta del oauth que traba, roja`; sólo tests). En `lib/panel-history.test.ts`,
la regla 2 con `cleansQuery`: un `it` por causa sobre `TODAS_LAS_CAUSAS` (`'replace'` para las seis que no son
`concurrent`, `'none'` para `concurrent`), más la regla 0 primero (`'none'`) y `null === null` (`'replace'`). En
`test/panel-tabs.test.ts`: la existencia y siete casos de `vueltaDeOAuthPendiente`, el ayudante `volverDelOAuth()`
(espejo del efecto) sobre las cinco URLs trabadas y los dos controles, el caso sin espejo (y su contrapuesto sin
nada que borrar) y el candado (g) extendido. Corrida: 24 rojos, 232 verdes en las dos suites; todo lo del task 1
siguió verde. Los rojos: la regla 2 y el sin espejo, `'none'` donde va `'replace'`; el predicado y las siete URLs,
`vueltaDeOAuthPendiente is not a function` en su caso (los dos controles también caen: el ayudante pide el
predicado); (g), el render con su propio `get('mp') !== null`.

rojo (i) G-04-8: 24 casos rojos: con la causa 'user-open', origen igual a destino y una limpieza de la query devuelve 'replace' · con la causa 'user-close', origen igual a destino y una limpieza de la query devuelve 'replace' · con la causa 'user-switch', origen igual a destino y una limpieza de la query devuelve 'replace' · con la causa 'programmatic', origen igual a destino y una limpieza de la query devuelve 'replace' · con la causa 'filter', origen igual a destino y una limpieza de la query devuelve 'replace' · con la causa 'stale', origen igual a destino y una limpieza de la query devuelve 'replace' · una limpieza de la query con null === null reemplaza · G-04-8: /negocio?mp= → Integraciones limpia sin agregar entradas ni retroceder, y Datos responde · G-04-8: /negocio?google= → Integraciones limpia sin agregar entradas ni retroceder, y Datos responde · G-04-8: /negocio?tab=integraciones&mp=connected → Integraciones limpia sin agregar entradas ni retroceder, y Datos responde · G-04-8: /negocio?tab=integraciones&google=connected → Integraciones limpia sin agregar entradas ni retroceder, y Datos responde · G-04-8: /negocio?tab=integraciones&mp= → Integraciones limpia sin agregar entradas ni retroceder, y Datos responde · G-04-8: /negocio?mp=connected → Integraciones limpia sin agregar entradas ni retroceder, y Datos responde · G-04-8: /negocio?tab=cobros&mp=connected → Integraciones limpia sin agregar entradas ni retroceder, y Datos responde · G-04-8 sin espejo: la limpieza con la vista ya en Integraciones reemplaza DENTRO del ejecutor · (g) el retorno del OAuth en Negocio: un reemplazo del helper con drop, y la reconciliación cortada mientras dura · vueltaDeOAuthPendiente existe y es una función del módulo de tabs · vueltaDeOAuthPendiente: «?mp=» ⇒ true · vueltaDeOAuthPendiente: «?google=» ⇒ true · vueltaDeOAuthPendiente: «?mp=connected» ⇒ true · vueltaDeOAuthPendiente: «?tab=integraciones» ⇒ false · vueltaDeOAuthPendiente: «» ⇒ false · vueltaDeOAuthPendiente: «?MP=x» ⇒ false · vueltaDeOAuthPendiente: «?xmp=1&tab=cobros» ⇒ false

Los cuatro casos de `false` del predicado caen sólo porque el símbolo no existía: son el contrapuesto de los tres
`true` y fijan que la presencia es exacta (sensible a mayúsculas, sin prefijos).

**El GREEN** (`6202bdd`, `fix(04-07): un solo criterio para la vuelta del oauth y una limpieza que escribe`):
`vueltaDeOAuthPendiente({ query })` en `lib/panel-tabs.ts`; `cleansQuery` (default `false`) en la regla 2 de
`panelHistoryAction`, calculado por `applyPanelView` sólo cuando hay `drop`; en `settings-client.tsx`, el render y
la guarda del efecto por el predicado y el comentario del «borde aceptado» reescrito. Las ocho suites de historial
8/670, `tsc` limpio.

### Sin regresión en la app real (task 3)

Qué se preguntó: si la guarda del consumo en vuelo, `toqueDeTab`, `vueltaDeOAuthPendiente` y la limpieza que escribe
dejaron igual todo lo que los tabs ya hacían en la app: los doce `R-T-*` (los dos handlers, el retorno del OAuth de
MercadoPago y de Google, Agenda y el sidebar) y los cuatro `R-B1-*` (el consumo del tab que la guarda ahora protege),
con los esperados de siempre, que este plan no tocó.

**El entorno.** 2026-11-17 23:58 → 2026-11-18 00:04 hora de Argentina, sobre `0e037c4` (los dos `fix(04-07)` más
docs). Turno libre (tomado y soltado por esta corrida, sin espera). Pila local de forjo-app arriba (`/rest/v1/` 200;
no hizo falta `supabase start`; no se paró ni reseteó ninguna pila). Sin `next dev` de este repo vivo (sin
`.next/dev/lock`; 3031 y 9335 libres): la sonda levantó el suyo en el 3031 (respondió 200) y lo cerró al salir
(3031 y 9335 libres). El de forjo-landing en el 3000 no se tocó. `Chrome/157.0.8103.52`, node `v24.15.0`, gesto
`interfaz`, modo estricto ACTIVO (`next.config.ts` sin tocar). Fuera de la ventana de los canarios de reloj, que
viven en el carril `db` y no en la pura.

```
node scripts/con-turno.mjs node .planning/debug/probes/panel-exit-en-la-app.mjs dev interfaz R-T-finanzas-por-mas,R-T-finanzas-desde-inicio,R-T-finanzas-invalido,R-T-finanzas-url-pegada,R-T-negocio-por-mas,R-T-negocio-datos-consume,R-T-config-por-url,R-T-negocio-oauth-mp,R-T-negocio-oauth-google-error,R-T-sidebar-seccion-activa,R-T-secciones-sin-tab,R-T-agenda-google,R-B1-inicio,R-B1-turnos,R-B1-mas,R-B1-ficha
./node_modules/.bin/vitest run --project pure
```

| recorrido | resultado |
|---|---|
| `R-T-finanzas-por-mas` | `OK` |
| `R-T-finanzas-desde-inicio` | `OK` |
| `R-T-finanzas-invalido` | `OK` |
| `R-T-finanzas-url-pegada` | `OK` |
| `R-T-negocio-por-mas` | `OK` |
| `R-T-negocio-datos-consume` | `OK` (el consumo del tab, con la guarda puesta) |
| `R-T-config-por-url` | `OK` |
| `R-T-negocio-oauth-mp` | `OK` (el toast UNA vez, `/negocio?tab=integraciones`) |
| `R-T-negocio-oauth-google-error` | `OK` |
| `R-T-sidebar-seccion-activa` | `OK` |
| `R-T-secciones-sin-tab` | `OK` |
| `R-T-agenda-google` | `OK` |
| `R-B1-inicio` | `OK` |
| `R-B1-turnos` | `OK` |
| `R-B1-mas` | `OK` |
| `R-B1-ficha` | `OK` |

Sonda rc 0; la pura completa rc 0 · `Test Files 77 passed (77)` · `Tests 1844 passed | 3 expected fail (1847)` (piso:
77 / 1820). P-5 no aplicó: ningún `FALLA`.

**El punto ciego, declarado.** La ventana real del doble toque (cuánto tarda el commit de la transición entre la
escritura de un toque y el render que la ve) no se mide por CDP en esta sonda, ni tampoco dos toques dentro de esa
ventana. La cubren el candado de fuente (los dos `alElegirTab` y el `tocar` de la suite llaman a `toqueDeTab` con la
URL de ahora; la guarda va antes de `holding` y se enciende antes del retroceso), la pila con el ejecutor REAL y el
retroceso asíncrono (`test/panel-tabs.test.ts`), y el recorrido de la re-UAT del 04-08.

verde (i): gesto=interfaz · modo=dev · recorridos medidos: 16 · coinciden con lo esperado: 16 · no coinciden: 0

cierre (i): un toque decide con la url de ahora y la vuelta del oauth no traba los tabs · pura 77/1844

## (j) La no-regresión del cierre de gaps (plan 04-08)

Qué se preguntó: si el cierre de los tres gaps (G-04-6 del 04-06; G-04-7 y G-04-8 del 04-07) convive en verde con
todo lo que la fase y la Phase 3 ya tenían, **en una sola tanda**, antes de que el dueño toque nada. Nada de código
cambió en este plan: se midió la app de `83fc45c` (los `fix(04-06)` y `fix(04-07)` más docs).

**El entorno (paso 0).** 2026-11-18, hora de Argentina. Pila local de forjo-app arriba (no hizo falta `supabase
start`; no se paró ni reseteó ninguna pila). `negocio-prueba` en `trial|true` (consultado en
`supabase_db_forjo-app` al empezar y de nuevo al arrancar la completa). Sin `next dev` de este repo vivo (sin
`.next/dev/lock`): cada sonda levantó el suyo en el 3031 (200 al primer intento) y lo cerró al salir (3031 y 9335
libres). El de forjo-landing en el 3000 no se tocó. Turno libre al empezar, sin espera. `Chrome/157.0.8103.52`,
node `v24.15.0`, gesto `interfaz`, modo estricto ACTIVO. `.next/types/validator.ts` entero (no hubo que apartarlo).
`main` al día con `origin/main` (`git rev-list --count main..origin/main` = 0).

**Las corridas (paso 1).** Las tres sondas por el turno, en segundo plano, una después de la otra; la pura, `tsc`,
eslint, el build, la completa y los candados fuera del turno. **La tanda empezó a las 00:08, fuera de la ventana
[01:00, 23:30] de los canarios de reloj:** las sondas, la pura (sin canarios: viven en el carril `db`), `tsc`,
eslint, el build y los candados no dependen de la hora y corrieron enseguida; la completa se programó para arrancar
sola a las 01:01 y corrió dentro de la ventana, sin ningún cambio en el árbol entre las dos partes.

```
node scripts/con-turno.mjs node .planning/debug/probes/g04-scroll-y-recarga.mjs F-blanda-mas-movil,F-directa-movil,F-tarjeta-movil,F-sidebar-escritorio,N-negocio-borde-movil cierre-04-08 tras-el-fix
node scripts/con-turno.mjs node .planning/debug/probes/panel-exit-en-la-app.mjs dev interfaz
node scripts/con-turno.mjs node .planning/debug/probes/panel-back-stack.mjs
./node_modules/.bin/vitest run --project pure
./node_modules/.bin/tsc --noEmit
npm run build
npm test
```

### La sonda del scroll (00:08:21 → 00:10:18), rc 0

| recorrido | resultado | el primer toque |
|---|---|---|
| `F-blanda-mas-movil` | `OK` | Ventas 1404 → 1367, cero escrituras de Next; Egresos 1367 → 1349; re-entrada Ventas 1404 → 1367 |
| `F-directa-movil` (control) | `OK` | Ventas 1404 → 1367, cero escrituras |
| `F-tarjeta-movil` | `OK` | Egresos 1404 → 1349, cero escrituras; Ventas 1349 → 1349 |
| `F-sidebar-escritorio` | `OK` | Ventas 830 → 830, cero escrituras |
| `N-negocio-borde-movil` | `OK` | Cobros 187 → 0 con CERO escrituras (`recorte_por_alto`, como en `(h)`); Integraciones 0 → 0 |

Los 37/18/55 px de los toques en móvil son el `recorte_por_alto: si` informativo ya explicado en `(h)` (el viewport
emulado crece y el máximo de scroll se achica): `llevo_al_inicio=no` y `escritura_de_next=no` en todos.

`etiqueta=cierre-04-08 · modo=tras-el-fix · recorridos: 5 · coinciden con lo esperado tras el fix: 5`

### La sonda de la app (00:10:18 → 00:22:35), rc 1 sólo por la FALLA declarada

`gesto=interfaz · modo=dev · recorridos medidos: 47 · coinciden con lo esperado: 46 · no coinciden: 1`. Los cinco
retirados no corren (`R-login-con-activacion`, `R-C-2`, `R-C-3`, `R-C-4`, `R-C-ficha`, cada uno con su línea). Sin
`ChunkLoadError`; una sola corrida, completa. Los 46 en `OK`: `C-activacion`, todos los de la Phase 3 (`R-1.*`,
`R-3.1`, `R-barra-*`, `R-lateral`, `R-G3-5-*`, `R-G3-6-*`, `R-G3-7-*`, `R-G3-9-*`, `R-G3-10-primer-toque-atras-tarde`,
`R-G3-10-atras-y-toque`, `R-G3-10-pronto-y-toque`, `R-G3-8-rebote`), los **doce** `R-T-*`, `R-C-5`, `R-C-6` y los
**cuatro** `R-B1-*`. La única línea `FALLA` es la declarada:

```
FALLA R-G3-10-primer-toque-atras-pronto · G3-10: el dialogo del plan abierto por el primer toque y cerrado con el ATRAS dentro de la ventana de activacion: el reintento de G3-7 arma y el atras siguiente avisa
      atras_siguiente: medido="sale"  <-- NO COINCIDE
                       esperado="avisa"
```

⚠ **No es una regresión del cierre.** Es `G3-10`, el costo del camino 1 que el dueño declaró el 2026-11-16, con su
`esperado` intacto a propósito; la misma tupla que en `(g)`. Ningún `esperado` se tocó.

### Lo demás

- **La sonda estática** (00:22:35 → 00:22:42): rc 0 · `escenarios medidos: 18 · coinciden con lo esperado: 18 · no
  coinciden: 0`.
- **La pura** (00:22:58): rc 0 · `Test Files 77 passed (77)` · `Tests 1844 passed | 3 expected fail (1847)` (piso:
  77 / 1844 de `cierre (i)`).
- **La completa** (`npm test`, con el carril `db`, 01:01:11 → 01:03:29, dentro de la ventana): rc 0 · `Test Files 111
  passed (111)` · `Tests 2151 passed | 4 expected fail | 1 skipped (2156)` (piso: 111 archivos y 2111 + 1844 − 1804 =
  2151 casos).
- **`tsc --noEmit`** (00:23:11): rc 0, cero `error TS`.
- **`eslint`, archivo por archivo:** `settings-client.tsx` `react-hooks/immutability=6,react-hooks/purity=2,react-hooks/set-state-in-effect=2`
  y `finances-client.tsx` `react-hooks/set-state-in-effect=1` (la deuda medida, sin cambios); las tres `page.tsx`,
  `lib/panel-tabs.ts`, `lib/panel-history.ts`, sus dos suites y la sonda `g04-scroll-y-recarga.mjs`: rc 0.
- **El build** (`npm run build`, 00:23:21 → 00:24:10): rc 0 · `✓ Compiled successfully in 14.0s` · `✓ Generating
  static pages using 11 workers (64/64)`; cero `useSearchParams() should be wrapped in a suspense` / `Missing
  Suspense boundary`. P-7 no aplicó (no había un `next dev` de forjo-app vivo).
- **El barrido CRUDO del criterio 5:** `grep -E 'pushState|replaceState|history\.back'` sobre `finances-client.tsx`,
  `settings-client.tsx` y `agenda-client.tsx` → salida vacía.
- **Lo bloqueado desde `974a131`:** `git diff --name-only 974a131 HEAD -- lib/overlay-history.ts lib/dirty-history.ts
  lib/panel-branch.ts scripts/con-turno.mjs next.config.ts package.json package-lock.json supabase components
  app/(dashboard)/clients app/(dashboard)/agenda app/(dashboard)/mas app/(dashboard)/servicios app/(dashboard)/equipo
  app/(dashboard)/consultorios app/api` → vacío (rc 0). **Fuera del cierre** (lo que cambió en `app components lib
  scripts test` desde `974a131`, menos los nueve archivos del cierre) → vacío. Huella de `next.config.ts` =
  `8ceb99aeabb6a8b16cbe0e6d836bf0aa1ae03578`.

P-8 no aplicó: no hay nada en rojo que no sea el costo declarado de G3-10.

no-regresion (plan 04-08): sonda del scroll 5/5, sonda de la app 46/47 en OK, estatica 18/18, pura 77/1844, completa 111/2151, tsc limpio, build ok, criterio 5 en cero

## (k) obs-G1: el alto mínimo de los tabs de Finanzas (quick 261118-jdq)

Qué se preguntó: si darle a cada panel de los tabs de Finanzas (Turnos · Ventas · Egresos) el alto de la pantalla
como mínimo —opción A del dueño, 2026-11-18— apaga el recorte del navegador al cambiar a un tab corto (obs-G1 de la
re-UAT del 04-08: «cada vez que voy a ventas hace un salto ahí porque se achica»), sin regresar G-04-6.

La geometría: con `min-h-dvh` en el panel activo, `alto_documento >= borde_del_panel + 100dvh + lo_de_abajo`, así que
`scroll_máximo = alto_documento - innerHeight >= borde_del_panel + (100dvh - innerHeight) + lo_de_abajo`, y el tab
tocado tiene que estar a la vista (`scrollY < borde_del_panel - 24`): el máximo nunca baja del scroll del toque.
`dvh` y no `vh`/`svh`/`calc`: es el viewport visible, la misma unidad que el envoltorio y el `<main>` de
`app/(dashboard)/layout.tsx` (su comentario explica por qué); sobra margen (`lo_de_abajo + 24` ≈ 96 px en móvil,
56 px en escritorio) aun con el `innerHeight` inflado a 881/899/916 por el desborde horizontal del móvil emulado.

**El entorno (paso 0).** 2026-11-18, hora de Argentina (rojo 14:20, verde 14:25-14:32). Pila local de forjo-app
arriba (la API contestó 200; no hizo falta `supabase start`; sin `db reset`, sin escrituras: sólo `select`). Turno
libre al empezar, sin espera. Sin `next dev` de este repo vivo: cada sonda levantó el suyo en el 3031 (`/login 200`
al primer intento) y lo cerró al salir (3031 y 9335 libres). El de forjo-landing en el 3000 no se tocó.
`Chrome/157.0.8103.52`, node `v24.15.0`.

La distribución de `negocio-prueba` (turnos con `status <> 'cancelled'` por mes; consulta de sólo lectura en
`supabase_db_forjo-app`):

```
2026-03|1
2026-04|3
2026-05|5
2026-06|8
2026-07|18
2026-08|15
2026-09|22
2026-10|5
manual_sales|0
expenses|0
```

Noviembre 2026 tiene 0 turnos: por eso el caso no se veía en los `F-*`. `irAlMesConTurnos` retrocedió dos veces con
el botón real «Mes anterior» y eligió, en los tres recorridos y en las dos corridas,
`mes con turnos: septiembre 2026 turnos=22 ventas=0 egresos=0 pasos=2`.

### El rojo (con el `test` 4f114ba, sin el arreglo; `paneles con alto minimo: 0`), rc 0

```
node scripts/con-turno.mjs node .planning/debug/probes/g04-scroll-y-recarga.mjs G1-ventas-movil,G1-egresos-movil,G1-ventas-escritorio rojo-obs-g1 hipotesis
```

`finances-client.tsx huella=06bada07cc49a23c paneles con alto minimo: 0`

```
COINCIDE-CON-LA-HIPOTESIS G1-ventas-movil · obs-G1 movil 390x844: Inicio -> Mas -> Finanzas -> retroceder al mes con turnos (>= 10, 0 ventas, 0 egresos) -> Ventas (desde Turnos) -> Egresos
      recorte_toque1: medido="si"
      salto_toque1: medido="no"
      next_toque1: medido="no"
      salto_toque2: medido="no"
      next_toque2: medido="no"
      mes con turnos: septiembre 2026 turnos=22 ventas=0 egresos=0 pasos=2
      toque 1 (Ventas, desde Turnos): tab=Ventas modo=centro y_antes=1886 y_despues=1605 min_durante=1605 delta=-281 llevo_al_inicio=no escritura_de_next=no (criterio viejo salto_al_inicio=no) se_movio=si seleccionado=true (161 ms)
         antes: alto=4008 viewport=844 tab_top=409 primera_top=-1739 primera=div.space-y-6.max-w-5xl vv={"escala":1,"dx":0,"dy":0} ruta=/finances
         despues: alto=2504 viewport=899 tab_top=690 primera_top=-1458 ruta=/finances?tab=ventas
         recorte_por_alto: si (informativo, no se juzga: sin escrituras de scroll en el toque y el maximo de scroll despues, 1605, es menor que y_antes=1886; el navegador recorto scrollY)
         posicion pedida: {"ok":true,"pedido":1886,"max":3164,"tabAbs":2295,"primeraAbs":147}
         cambios de scrollY del documento: [1605]
         escrituras de scroll de la pagina: ninguna
      toque 2 (Egresos): tab=Egresos modo=centro y_antes=1605 y_despues=1588 min_durante=1588 delta=-17 llevo_al_inicio=no escritura_de_next=no (criterio viejo salto_al_inicio=no) se_movio=si seleccionado=true (145 ms)
         antes: alto=2504 viewport=899 tab_top=690 primera_top=-1458 primera=div.space-y-6.max-w-5xl vv={"escala":1,"dx":0,"dy":55} ruta=/finances?tab=ventas
         despues: alto=2504 viewport=916 tab_top=707 primera_top=-1441 ruta=/finances?tab=egresos
         recorte_por_alto: si (informativo, no se juzga: sin escrituras de scroll en el toque y el maximo de scroll despues, 1588, es menor que y_antes=1605; el navegador recorto scrollY)
         posicion pedida: {"ok":true,"pedido":1605,"max":1605,"tabAbs":2295,"primeraAbs":147}
         cambios de scrollY del documento: [1588]
         escrituras de scroll de la pagina: ninguna

COINCIDE-CON-LA-HIPOTESIS G1-egresos-movil · obs-G1 movil 390x844: Inicio -> tarjeta «Ingresos del mes» -> Finanzas -> retroceder al mes con turnos (>= 10, 0 ventas, 0 egresos) -> Egresos (desde Turnos) -> Ventas
      recorte_toque1: medido="si"
      salto_toque1: medido="no"
      next_toque1: medido="no"
      salto_toque2: medido="no"
      next_toque2: medido="no"
      mes con turnos: septiembre 2026 turnos=22 ventas=0 egresos=0 pasos=2
      toque 1 (Egresos, desde Turnos): tab=Egresos modo=centro y_antes=1886 y_despues=1588 min_durante=1588 delta=-298 llevo_al_inicio=no escritura_de_next=no (criterio viejo salto_al_inicio=no) se_movio=si seleccionado=true (174 ms)
         antes: alto=4008 viewport=844 tab_top=409 primera_top=-1739 primera=div.space-y-6.max-w-5xl vv={"escala":1,"dx":0,"dy":0} ruta=/finances
         despues: alto=2504 viewport=916 tab_top=707 primera_top=-1441 ruta=/finances?tab=egresos
         recorte_por_alto: si (informativo, no se juzga: sin escrituras de scroll en el toque y el maximo de scroll despues, 1588, es menor que y_antes=1886; el navegador recorto scrollY)
         posicion pedida: {"ok":true,"pedido":1886,"max":3164,"tabAbs":2295,"primeraAbs":147}
         cambios de scrollY del documento: [1588]
         escrituras de scroll de la pagina: ninguna
      toque 2 (Ventas): tab=Ventas modo=centro y_antes=1588 y_despues=1588 min_durante=1588 delta=0 llevo_al_inicio=no escritura_de_next=no (criterio viejo salto_al_inicio=no) se_movio=no seleccionado=true (146 ms)
         antes: alto=2504 viewport=916 tab_top=707 primera_top=-1441 primera=div.space-y-6.max-w-5xl vv={"escala":1,"dx":0,"dy":72} ruta=/finances?tab=egresos
         despues: alto=2504 viewport=899 tab_top=707 primera_top=-1441 ruta=/finances?tab=ventas
         posicion pedida: {"ok":true,"pedido":1588,"max":1588,"tabAbs":2295,"primeraAbs":147}
         cambios de scrollY del documento: []
         escrituras de scroll de la pagina: ninguna

COINCIDE-CON-LA-HIPOTESIS G1-ventas-escritorio · obs-G1 escritorio 1280x800: Inicio -> sidebar Finanzas -> retroceder al mes con turnos (>= 10, 0 ventas, 0 egresos) -> Ventas (desde Turnos) -> Egresos
      recorte_toque1: medido="si"
      salto_toque1: medido="no"
      next_toque1: medido="no"
      salto_toque2: medido="no"
      next_toque2: medido="no"
      mes con turnos: septiembre 2026 turnos=22 ventas=0 egresos=0 pasos=2
      toque 1 (Ventas, desde Turnos): tab=Ventas modo=centro y_antes=1094 y_despues=850 min_durante=850 delta=-244 llevo_al_inicio=no escritura_de_next=no (criterio viejo salto_al_inicio=no) se_movio=si seleccionado=true (248 ms)
         antes: alto=3026 viewport=800 tab_top=387 primera_top=-979 primera=div.space-y-6.max-w-5xl vv={"escala":1,"dx":0,"dy":0} ruta=/finances
         despues: alto=1650 viewport=800 tab_top=631 primera_top=-735 ruta=/finances?tab=ventas
         recorte_por_alto: si (informativo, no se juzga: sin escrituras de scroll en el toque y el maximo de scroll despues, 850, es menor que y_antes=1094; el navegador recorto scrollY)
         posicion pedida: {"ok":true,"pedido":1094,"max":2226,"tabAbs":1481,"primeraAbs":115}
         cambios de scrollY del documento: [850]
         escrituras de scroll de la pagina: ninguna
      toque 2 (Egresos): tab=Egresos modo=centro y_antes=850 y_despues=850 min_durante=850 delta=0 llevo_al_inicio=no escritura_de_next=no (criterio viejo salto_al_inicio=no) se_movio=no seleccionado=true (144 ms)
         antes: alto=1650 viewport=800 tab_top=631 primera_top=-735 primera=div.space-y-6.max-w-5xl vv={"escala":1,"dx":0,"dy":0} ruta=/finances?tab=ventas
         despues: alto=1650 viewport=800 tab_top=631 primera_top=-735 ruta=/finances?tab=egresos
         posicion pedida: {"ok":true,"pedido":850,"max":850,"tabAbs":1481,"primeraAbs":115}
         cambios de scrollY del documento: []
         escrituras de scroll de la pagina: ninguna
```

`etiqueta=rojo-obs-g1 · recorridos: 3 · coinciden con la hipotesis: 3`

El recorte de obs-G1, con números: el documento baja de 4008 a 2504 px (móvil) y de 3026 a 1650 px (escritorio) al
pasar de Turnos (22 turnos) a un tab vacío, y el navegador recorta `scrollY` 281/298 px en móvil y 244 px en
escritorio, sin ninguna escritura de scroll de nadie. La leyenda «informativo, no se juzga» del renglón
`recorte_por_alto` es la de `imprimirToque` (sin tocar): en los `G1-*` el recorte SÍ se juzga, por su `esperado`.

### El verde (con el `fix` 05733dc; `paneles con alto minimo: 3`), rc 0

```
node scripts/con-turno.mjs node .planning/debug/probes/g04-scroll-y-recarga.mjs F-blanda-mas-movil,F-directa-movil,F-tarjeta-movil,F-sidebar-escritorio,N-negocio-borde-movil,G1-ventas-movil,G1-egresos-movil,G1-ventas-escritorio verde-obs-g1 tras-el-fix
```

`finances-client.tsx huella=e6cc85d19b8be539 paneles con alto minimo: 3`

| recorrido | toque 1: y_antes → y_despues | alto antes → después | recorte_por_alto (toque 1) | escrituras de Next |
|---|---|---|---|---|
| `F-blanda-mas-movil` | Ventas 1630 → 1630 (re-entrada 1630 → 1630) | 3008 → 3008 | no | 0 |
| `F-directa-movil` (control) | Ventas 1630 → 1630 | 3008 → 3008 | no | 0 |
| `F-tarjeta-movil` | Egresos 1630 → 1630 | 3008 → 3008 | no | 0 |
| `F-sidebar-escritorio` | Ventas 1074 → 1074 | 2346 → 2346 | no | 0 |
| `N-negocio-borde-movil` | Cobros 187 → 0 | 1389 → 844 | si (informativo, Negocio queda fuera del alcance) | 0 |
| `G1-ventas-movil` | Ventas 1886 → 1886 (toque 2 Egresos 1858 → 1858) | 4008 → 3264 | no | 0 |
| `G1-egresos-movil` | Egresos 1886 → 1886 (toque 2 Ventas 1850 → 1850) | 4008 → 3264 | no | 0 |
| `G1-ventas-escritorio` | Ventas 1094 → 1094 (toque 2 Egresos 1094 → 1094) | 3026 → 2366 | no | 0 |

De yapa: los 37/18/55 px del recorte del viewport emulado en los `F-*` móviles (`(h)`, `(j)`) también desaparecen
(delta 0 en todos los toques de Finanzas): con noviembre en 0 turnos el panel de Turnos ahora mide una pantalla, así
que el inflado del `innerHeight` (844 → 881/899/916) ya no achica el máximo por debajo del toque.

```
OK  G1-ventas-movil · obs-G1 movil 390x844: Inicio -> Mas -> Finanzas -> retroceder al mes con turnos (>= 10, 0 ventas, 0 egresos) -> Ventas (desde Turnos) -> Egresos
      recorte_toque1: medido="no"
      salto_toque1: medido="no"
      next_toque1: medido="no"
      recorte_toque2: medido="no"
      salto_toque2: medido="no"
      next_toque2: medido="no"
      mes con turnos: septiembre 2026 turnos=22 ventas=0 egresos=0 pasos=2
      toque 1 (Ventas, desde Turnos): tab=Ventas modo=centro y_antes=1886 y_despues=1886 min_durante=1886 delta=0 llevo_al_inicio=no escritura_de_next=no (criterio viejo salto_al_inicio=no) se_movio=no seleccionado=true (149 ms)
         antes: alto=4008 viewport=844 tab_top=409 primera_top=-1739 primera=div.space-y-6.max-w-5xl vv={"escala":1,"dx":0,"dy":0} ruta=/finances
         despues: alto=3264 viewport=899 tab_top=409 primera_top=-1739 ruta=/finances?tab=ventas
         posicion pedida: {"ok":true,"pedido":1886,"max":3164,"tabAbs":2295,"primeraAbs":147}
         cambios de scrollY del documento: []
         escrituras de scroll de la pagina: ninguna
      toque 2 (Egresos): tab=Egresos modo=centro y_antes=1858 y_despues=1858 min_durante=1858 delta=0 llevo_al_inicio=no escritura_de_next=no (criterio viejo salto_al_inicio=no) se_movio=no seleccionado=true (140 ms)
         antes: alto=3264 viewport=899 tab_top=437 primera_top=-1711 primera=div.space-y-6.max-w-5xl vv={"escala":1,"dx":0,"dy":0} ruta=/finances?tab=ventas
         despues: alto=3264 viewport=916 tab_top=437 primera_top=-1711 ruta=/finances?tab=egresos
         posicion pedida: {"ok":true,"pedido":1858,"max":2365,"tabAbs":2295,"primeraAbs":147}
         cambios de scrollY del documento: []
         escrituras de scroll de la pagina: ninguna

OK  G1-egresos-movil · obs-G1 movil 390x844: Inicio -> tarjeta «Ingresos del mes» -> Finanzas -> retroceder al mes con turnos (>= 10, 0 ventas, 0 egresos) -> Egresos (desde Turnos) -> Ventas
      recorte_toque1: medido="no"
      salto_toque1: medido="no"
      next_toque1: medido="no"
      recorte_toque2: medido="no"
      salto_toque2: medido="no"
      next_toque2: medido="no"
      mes con turnos: septiembre 2026 turnos=22 ventas=0 egresos=0 pasos=2
      toque 1 (Egresos, desde Turnos): tab=Egresos modo=centro y_antes=1886 y_despues=1886 min_durante=1886 delta=0 llevo_al_inicio=no escritura_de_next=no (criterio viejo salto_al_inicio=no) se_movio=no seleccionado=true (152 ms)
         antes: alto=4008 viewport=844 tab_top=409 primera_top=-1739 primera=div.space-y-6.max-w-5xl vv={"escala":1,"dx":0,"dy":0} ruta=/finances
         despues: alto=3264 viewport=916 tab_top=409 primera_top=-1739 ruta=/finances?tab=egresos
         posicion pedida: {"ok":true,"pedido":1886,"max":3164,"tabAbs":2295,"primeraAbs":147}
         cambios de scrollY del documento: []
         escrituras de scroll de la pagina: ninguna
      toque 2 (Ventas): tab=Ventas modo=centro y_antes=1850 y_despues=1850 min_durante=1850 delta=0 llevo_al_inicio=no escritura_de_next=no (criterio viejo salto_al_inicio=no) se_movio=no seleccionado=true (130 ms)
         antes: alto=3264 viewport=916 tab_top=445 primera_top=-1703 primera=div.space-y-6.max-w-5xl vv={"escala":1,"dx":0,"dy":0} ruta=/finances?tab=egresos
         despues: alto=3264 viewport=899 tab_top=445 primera_top=-1703 ruta=/finances?tab=ventas
         posicion pedida: {"ok":true,"pedido":1850,"max":2348,"tabAbs":2295,"primeraAbs":147}
         cambios de scrollY del documento: []
         escrituras de scroll de la pagina: ninguna

OK  G1-ventas-escritorio · obs-G1 escritorio 1280x800: Inicio -> sidebar Finanzas -> retroceder al mes con turnos (>= 10, 0 ventas, 0 egresos) -> Ventas (desde Turnos) -> Egresos
      recorte_toque1: medido="no"
      salto_toque1: medido="no"
      next_toque1: medido="no"
      recorte_toque2: medido="no"
      salto_toque2: medido="no"
      next_toque2: medido="no"
      mes con turnos: septiembre 2026 turnos=22 ventas=0 egresos=0 pasos=2
      toque 1 (Ventas, desde Turnos): tab=Ventas modo=centro y_antes=1094 y_despues=1094 min_durante=1094 delta=0 llevo_al_inicio=no escritura_de_next=no (criterio viejo salto_al_inicio=no) se_movio=no seleccionado=true (176 ms)
         antes: alto=3026 viewport=800 tab_top=387 primera_top=-979 primera=div.space-y-6.max-w-5xl vv={"escala":1,"dx":0,"dy":0} ruta=/finances
         despues: alto=2366 viewport=800 tab_top=387 primera_top=-979 ruta=/finances?tab=ventas
         posicion pedida: {"ok":true,"pedido":1094,"max":2226,"tabAbs":1481,"primeraAbs":115}
         cambios de scrollY del documento: []
         escrituras de scroll de la pagina: ninguna
      toque 2 (Egresos): tab=Egresos modo=centro y_antes=1094 y_despues=1094 min_durante=1094 delta=0 llevo_al_inicio=no escritura_de_next=no (criterio viejo salto_al_inicio=no) se_movio=no seleccionado=true (144 ms)
         antes: alto=2366 viewport=800 tab_top=387 primera_top=-979 primera=div.space-y-6.max-w-5xl vv={"escala":1,"dx":0,"dy":0} ruta=/finances?tab=ventas
         despues: alto=2366 viewport=800 tab_top=387 primera_top=-979 ruta=/finances?tab=egresos
         posicion pedida: {"ok":true,"pedido":1094,"max":1566,"tabAbs":1481,"primeraAbs":115}
         cambios de scrollY del documento: []
         escrituras de scroll de la pagina: ninguna
```

`etiqueta=verde-obs-g1 · modo=tras-el-fix · recorridos: 8 · coinciden con lo esperado tras el fix: 8`

### Lo demás

- **`--autotest`** del clasificador: `autotest del clasificador: 5/5` (antes y después del arreglo).
- **La sonda de la app**, por el turno, en el mismo gate (`node scripts/con-turno.mjs node .planning/debug/probes/panel-exit-en-la-app.mjs dev interfaz R-T-finanzas-por-mas,R-T-finanzas-desde-inicio,R-T-finanzas-invalido,R-T-finanzas-url-pegada`):
  rc 0 · `gesto=interfaz · modo=dev · recorridos medidos: 4 · coinciden con lo esperado: 4 · no coinciden: 0`.
- **`tsc --noEmit`**: cero `error TS`.
- **eslint, archivo por archivo:** `finances-client.tsx` `react-hooks/set-state-in-effect=1` (la deuda medida, sin
  cambios); la sonda, `test/panel-tabs.test.ts` y `finances/page.tsx`: rc 0.
- **La pura:** rc 0 · `Test Files 77 passed (77)` · `Tests 1845 passed | 3 expected fail (1848)` (piso 77 / 1845).
- **Las 8 suites de historial:** rc 0 · 8 archivos · 671 casos (piso 671).
- **`panel-tabs`:** el candado obs-G1 fue ROJO con el `test` (`Tests 1 failed | 84 passed (85)`, el rojo es el
  obs-G1) y VERDE con el `fix` (85 passed).
- **El build** (`npm run build`): rc 0 · `✓ Compiled successfully in 13.2s` · `✓ Generating static pages using 11
  workers (64/64)`; cero avisos de Suspense. P-7 no aplicó.
- **El criterio 5 CRUDO** sobre `finances-client.tsx`, `settings-client.tsx` y `agenda-client.tsx`: vacío. El único
  archivo de la app cambiado desde la base es `app/(dashboard)/finances/finances-client.tsx`; `components/ui/tabs.tsx`
  y `finances/page.tsx` intactos; `next.config.ts` = `8ceb99aeabb6a8b16cbe0e6d836bf0aa1ae03578`.

### Lo que NO cierra

- **El teléfono real** (Android Chrome / iOS Safari): esto es Chrome headless con emulación móvil. La UAT del dueño
  va junto con R2-WR-01, después del push conjunto (nada se pusheó).
- **Negocio → Cobros** sigue con su `recorte_por_alto` informativo (187 → 0): el dueño acotó el arreglo a Finanzas.
- **El desborde horizontal de Finanzas a 390 px** (el `innerHeight` 881/899/916 del emulado) sigue abierto en su
  propia entrada de `deferred-items.md`.
- **El costo aceptado:** un tab vacío deja hasta una pantalla de blanco debajo de su aviso.

cierre (k): el tab corto de finanzas ya no achica la pagina · rojo 3/3 · verde 8/8

## (l) R2-WR-01: la guarda de consumo en vuelo, medida antes de arreglar (quick 261118-kat)

Qué se preguntó: si la guarda de consumo en vuelo del 04-07 (`consumoEnVuelo` de `applyPanelView`, G-04-7) puede
quedar encendida o ser salteada por alguno de los tres caminos que nombran el code review de la ronda 2
(`04-REVIEW-2.md` WR-01) y su cruce con `consumeOwnedPanelEntry` (IN-03):

1. **bfcache, sin `popstate`:** el retroceso del consumo cruza de documento y la página vuelve con «adelante» desde la
   bfcache (llega `pageshow`, no `popstate`), con la guarda encendida: ningún tab responde.
2. **Un `back()` que tira:** la guarda queda encendida y el toque siguiente da `none`.
3. **El cruce con `consumeOwnedPanelEntry`, en los dos sentidos:** (a) consumir un tab y, antes del `popstate`, tocar
   la sección activa del menú (NAV-08) o Inicio en la barra (B1); (b) la inversa, primero el menú o B1 y después el
   tab por defecto.

Decisión del dueño (2026-11-18, no se reabre): medir PRIMERO los tres y arreglar sólo los que reproduzcan; el que no
reproduce se cierra con el número, como WR-04.

**El entorno (paso 0).** 2026-11-18, hora de Argentina (simulador 15:24; K1 ~15:45, después de esperar el turno
~22 min detrás de `forjo-tiendas`, PID 49748). Pila local de forjo-app arriba (la API contestó 200; no hizo falta
`supabase start`; ninguna escritura en la base). Sin `next dev` de este repo vivo: la sonda levantó el suyo en el
3031 (`/login 200` al primer intento) y lo cerró al salir (3031 y 9335 libres). El de forjo-landing en el 3000 no se
tocó. `Chrome/157.0.8103.52`, node `v24.15.0`. HEAD de la medición: `13b378b` (el `test` con los esperados, sin
ningún cambio en `lib/`).

### El caso 2 y el caso 3: el simulador fiel, con los ejecutores REALES

El simulador de `test/panel-tabs.test.ts` se volvió fiel al DOM antes de medir (un oyente quitado durante el despacho
no corre; el mismo oyente no se engancha dos veces) y se drena entre casos: los 85 casos de antes siguieron 85/85.
Los nueve casos corren `applyPanelView`, `consumeOwnedPanelEntry` y `runBranchNavigation` de verdad, con el retroceso
ASÍNCRONO (`backAsincrono`) y B1 espejado de `decidirDesdeElAterrizaje`/`handleNavigate`.

```
./node_modules/.bin/vitest run --project pure test/panel-tabs.test.ts
```

`Tests  5 failed | 89 passed (94)` — los cinco rojos son los K de los casos 2 y 3, cada uno por su aserción (cero
`TypeError`/`ReferenceError`); `K2-b` y los tres `NR-b1-*` en verde, así que el simulador representa B1 (no hay
P-1b). Las tuplas medidas contra las esperadas, tal cual del error de la aserción:

```
K2-a: un back() que tira no deja la guarda encendida
  {
-   "oyentes": 0,
-   "siguiente": "consume",
+   "oyentes": 1,
+   "siguiente": "none",
    "tiro": true,
-   "url": "/finances",
+   "url": "/finances?tab=ventas",
  }

K3a-nav08: tab por defecto y, antes del popstate, la sección activa del menú
  {
    "consumo": "consume",
    "prevenido": true,
-   "retrocesos": 1,
-   "url": "/finances",
+   "retrocesos": 2,
+   "url": "/dashboard",
  }

K3a-b1: tab por defecto y, antes del popstate, Inicio en la barra
  {
    "consumo": "consume",
    "navegaciones": [],
-   "retrocesos": 2,
+   "retrocesos": 3,
    "seHizoCargo": true,
-   "url": "/dashboard",
+   "url": "/afuera",
  }

K3b-nav08: la sección activa del menú y, antes del popstate, el tab por defecto
  {
    "prevenido": true,
-   "retrocesos": 1,
-   "toque": "none",
-   "url": "/finances",
+   "retrocesos": 2,
+   "toque": "consume",
+   "url": "/dashboard",
  }

K3b-b1: Inicio en la barra y, antes del popstate, el tab por defecto
  {
    "navegaciones": [],
-   "retrocesos": 2,
+   "retrocesos": 3,
    "seHizoCargo": true,
-   "toque": "none",
-   "url": "/dashboard",
+   "toque": "consume",
+   "url": "/afuera",
  }
```

En verde con el código de hoy: `K2-b` (`{ tiro: true, siguiente: 'consume', url: '/finances' }`: el menú no tiene
guarda, así que un retroceso que tira no deja nada encendido), `NR-b1-control` (2 retrocesos, `/dashboard`),
`NR-b1-reentrada` (dos fichas apiladas: 3 retrocesos, `/dashboard`, el segundo consumo sale del `popstate` del primero)
y `NR-b1-triple` (Cobros con Más debajo: 3 retrocesos, `/dashboard`).

Lo que dicen los números: el caso 2 reproduce (la guarda queda encendida con su oyente colgado y el toque siguiente
da `none`). El caso 3 reproduce en los dos sentidos y por las dos puertas: por el menú, un retroceso de más saca al
dueño de Finanzas a Inicio; por B1, el tercer retroceso sale del sitio (`/afuera`, la cicatriz 2).

### El caso 1: K1 en Chrome por CDP (el cruce forzado)

```
node scripts/con-turno.mjs node .planning/debug/probes/g04-scroll-y-recarga.mjs K1-bfcache-cruce medicion-r2wr01 hipotesis
```

rc 0. Log: `/tmp/tmp.C8dNWivaMl/k1-medicion.txt` (copia en el scratchpad de la sesión).

```
NO-COINCIDE K1-bfcache-cruce · R2-WR-01 caso 1, movil 390x844: carga dura de /finances (A), carga dura de /finances?tab=ventas (B) con la marca de tab forzada, Turnos (el consumo cruza de B a A), adelante (B vuelve de la bfcache?) y Egresos
      cruzo_de_documento: medido="si"
      b_vuelve_de_la_cache: medido="no"   <-- la hipotesis decia "si"
      tab_responde: medido="si"   <-- la hipotesis decia "no"
      forzado: la sonda escribio history.replaceState({ frjView: 'tab' }) sobre /finances?tab=ventas (documento B, hidratado=si); leida de vuelta: frjView="tab" claves=[__NA, __PRIVATE_NEXTJS_INTERNALS_TREE, frjView]; justo antes del toque: frjView="tab"
      pila antes del toque: [(afuera), /dashboard, /finances, /finances?tab=ventas] actual=3
      bfcache: navegacion=consumo (B -> A) loader=76EAE3D213661626AF89AD12A50E6658 motivos=[Circumstantial/BroadcastChannelOnMessage]
      bfcache: navegacion=adelante (A -> B) loader=771E1523E9CFE16F07253702EC471068 motivos=[Circumstantial/BroadcastChannelOnMessage]
      tras el consumo: url=/finances marca de documento=null notRestoredReasons(A)={"src":null,"id":null,"url":"http://127.0.0.1:3031/finances","name":null,"reasons":[{"reason":"broadcastchannel-message"}],"children":[]}
      tras adelante: url=/finances?tab=ventas documento=null pageshow propios de B=null marca="tab" pageshow persistido por el canal=no documento nuevo=si
      notRestoredReasons (documento final): {"src":null,"id":null,"url":"http://127.0.0.1:3031/finances?tab=ventas","name":null,"reasons":[{"reason":"broadcastchannel-message"}],"children":[]}
      cache-control del documento: no-cache, must-revalidate
         DOCUMENTO-NUEVO doc=u3tzk6 ruta=/finances estado={"claves":["__NA","__PRIVATE_NEXTJS_INTERNALS_TREE"]}
         pageshow doc=u3tzk6 persisted=false ruta=/finances
         DOCUMENTO-NUEVO doc=vczplt ruta=/finances estado={"claves":["__NA","__PRIVATE_NEXTJS_INTERNALS_TREE","frjView"],"frjView":"tab"}
         pageshow doc=vczplt persisted=false ruta=/finances?tab=ventas
      tras Egresos (hidratado=si): 2 escrituras de historia
         historia doc=vczplt replaceState en=/finances?tab=ventas urlArg=/finances?tab=egresos estado={"frjView":"tab"} pila: History.<computed> [as replaceState] < History.replaceState < applyPanelView < alElegirTab < TabsRoot.TabsRoot.useStableCallback[onValueChange] < trampoline < TabsList.TabsList.useStableCallback[onTabActivation]
         historia doc=vczplt replaceState en=/finances?tab=egresos urlArg=/finances?tab=egresos estado={"frjView":"tab"} pila: History.<computed> [as replaceState] < History.replaceState < http://127.0.0.1:3031/_next/static/chunks/node_modules_next_dist_client_0r5nbpw._.js:14340:28 < Object.react_stack_bottom_frame < runWithFiberInDEV < commitHookEffectListMount < commitMutationEffectsOnFiber
      url final: /finances?tab=egresos
```

`etiqueta=medicion-r2wr01 · recorridos: 1 · coinciden con la hipotesis: 0`

El motivo, con números: el cruce SÍ se armó (el consumo aterrizó en un documento nuevo de `/finances`, doc `u3tzk6`),
pero ninguno de los dos documentos entra a la bfcache: Chrome reporta `Circumstantial/BroadcastChannelOnMessage` en
las dos navegaciones (y `notRestoredReasons` = `broadcastchannel-message` en A y en B). Al volver con «adelante», B es
un DOCUMENTO NUEVO (doc `vczplt`, `pageshow persisted=false`, sin la marca de documento que la sonda le había dejado),
con el state de la entrada restaurado (`frjView: "tab"`) pero con la memoria del módulo recién nacida: la guarda arranca
apagada y Egresos responde (`replaceState` desde `applyPanelView`). El `cache-control` del documento es
`no-cache, must-revalidate` (no es `no-store`). El que bloquea la bfcache es un mensaje de `BroadcastChannel` recibido
mientras la página estaba oculta: no se miró qué lo manda (la sesión de Supabase sincroniza pestañas por ese canal, y
eso vale también para producción, pero no se midió acá).

veredictos (l): caso 1=no-reproduce · caso 2=reproduce · caso 3a=reproduce · caso 3b=reproduce

decision caso 1 (dueno, 2026-11-18): A

### El arreglo (task 3)

Banderas: **F1** encendida por la decisión del dueño (A: mitigación defensiva aunque el caso 1 no reprodujo en Chrome
157), **F2** y **F3** encendidas por lo medido arriba (caso 2 y caso 3, los dos sentidos). Se aplicó el diseño del plan
tal cual, en `lib/panel-history.ts` y nada más (`lib/panel-branch.ts` intacto):

- **F2:** en la rama `consume` de `applyPanelView`, el oyente y el retroceso van en un `try`; el `catch` llama a
  `soltarConsumo()` y relanza el mismo error. `soltarConsumo()` apaga primero la memoria y después saca sus dos oyentes.
- **F3:** una memoria nueva, `estadoDelConsumo` (no exportada). `consumeOwnedPanelEntry` empieza con el chequeo del
  consumo en vuelo: con el mismo state devuelve `true` sin retroceder; con otro state suelta la guarda y sigue. Después
  van sus dos guardas sin cambios y el MISMO bloque de encendido que la rama `consume`.
- **F1:** `soltarAlVolverDeLaCache(e)` suelta la guarda sólo si `e.persisted`; cada bloque de encendido engancha el
  `pageshow` de disparo único y `soltarConsumo()` lo saca.
- **Docblocks:** sin la garantía de que la guarda no se traba; con el número de K1; con el residuo del retroceso ignorado
  en silencio; con la guarda compartida y el orden de oyentes de B1; IN-05 corregido en `consumeOwnedPanelEntry`.
- **La única aserción vieja cambiada:** la cuenta de oyentes del B1 en `test/panel-branch.test.ts` (ahora cuenta los
  que no son de la guarda, incluido el de `pageshow`). Se agregaron drenajes de la guarda en su `afterEach` y en el
  preludio de NAV-08 de `lib/panel-history.test.ts` (IN-02), cuyo stub ahora tiene el par de enganche.

**Los candados nuevos, antes del arreglo** (`9e4df17`):

```
./node_modules/.bin/vitest run --project pure test/panel-tabs.test.ts
Tests  7 failed | 90 passed (97)
```

Los siete rojos: los cinco K de arriba (idénticos) más `C-retroceso-unico` (`expected -1 to be greater than -1`: el
menú no leía `consumoEnVuelo`) y `C-pageshow-tab` (`{ tras: 'none', oyentes: 1 }` contra `{ tras: 'replace', oyentes: 0 }`).
`C-pageshow-menu` en verde antes del arreglo, como se predijo (el menú no tenía guarda). Log:
`C:/Users/franc/AppData/Local/Temp/claude/19a1c3eef8049c86/e3541fb4-9838-45ba-8edf-fb689e438b9e/scratchpad/kat-candados-rojo.txt`.

**El verde, con el arreglo** (`87868c4`):

- Gate 1 (estático, suites y build), rc 0: `panel-tabs` 97/97 (los nueve K/NR y los tres C en verde, el bloque K y el
  describe G-04-7 idénticos desde su commit), pura 77 archivos / 1857 casos, las 8 suites de historial 683, `tsc` sin
  `error TS`, eslint por archivo rc 0, `npm run build` rc 0 sin avisos de Suspense, `next.config.ts` con su huella,
  cero intocables cambiados. Log: `C:/Users/franc/AppData/Local/Temp/claude/19a1c3eef8049c86/e3541fb4-9838-45ba-8edf-fb689e438b9e/scratchpad/kat-t3-gate1.txt`.
- Gate 2 (por el turno), rc 0: la app `recorridos medidos: 47 · coinciden con lo esperado: 46 · no coinciden: 1` con
  R-T 12/12 y R-B1 4/4 en `OK` y la única FALLA la declarada `R-G3-10-primer-toque-atras-pronto`; la estática 18/18; el
  scroll `verde-r2wr01 · tras-el-fix` 8/8 con `paneles con alto minimo: 3`. K1 no se volvió a correr (sólo corre si
  el caso 1 reprodujo). ⚠ La sonda de la app devolvió rc 127 por el envoltorio del turno (las corridas anteriores daban
  1 por la FALLA declarada); la salida está completa y el gate no juzga ese código. No se investigó: la herramienta del
  turno no vive en este repo. Logs: `C:/Users/franc/AppData/Local/Temp/claude/19a1c3eef8049c86/e3541fb4-9838-45ba-8edf-fb689e438b9e/scratchpad/kat-t3-logs/`
  (`app.txt`, `estatica.txt`, `scroll.txt`) y el resumen en `kat-t3-gate2.txt` del mismo scratchpad.

### Lo que NO cierra

- **El caso 1 en la app:** la salida por `pageshow` sólo la fija el simulador (`C-pageshow-tab`, `C-pageshow-menu`). En
  Chrome 157 el panel no entra a la bfcache (`BroadcastChannelOnMessage`), así que no hay cómo verla acá.
- **Safari de iOS, Chrome de Android reales y la pestaña descartada y restaurada:** sin medir. Lo de acá es Chrome de
  escritorio headless con emulación móvil.
- **El retroceso que el navegador ignora en silencio** (sin tirar y sin recorrer): deja la guarda encendida hasta el
  próximo recorrido o una recarga. Declarado en el docblock, sin medir, fuera de los tres casos decididos.
- **El teléfono real:** la UAT corta va con obs-G1, después del push conjunto (nada se pusheó).
- **R2-IN-04** (doble toque en una fila de Clientes): sigue abierto, fuera de alcance.

cierre (l): la guarda de consumo en vuelo · caso 1=mitigado · caso 2=mitigado · caso 3=mitigado

## (m) CR-01 del review de R2-WR-01: un solo segundo paso de B1, el try de la rama y los candados de pageshow (quick 261118-pjd)

Qué se preguntó: si los hallazgos del code review del quick 261118-kat (`261118-kat-REVIEW.md`) reproducen con el
código de hoy, medidos con los esperados commiteados ANTES de la corrida que los juzga:

1. **CR-01 (critical, en prod desde B1):** con un consumo en vuelo, `consumeOwnedPanelEntry` devuelve `true` sin
   retroceder, pero B1 ya enganchó su segundo paso; dos toques a Inicio en la barra dejan dos re-decisores que corren
   en el mismo `popstate` y retroceden cada uno.
2. **WR-02:** un `back()` que tira dentro de una rama de dos pasos de `runBranchNavigation` deja su segundo paso
   enganchado y el siguiente atrás del sistema navega solo.
3. **WR-01:** el `replaceState` del `HistoryUpdater` de Next (`app-router.js:38-67`) en la ventana del recorrido cambia
   la identidad del state sin cambiar la URL, y la guarda se suelta antes de tiempo.
4. **WR-03 / IN-01:** un `pageshow` no persistido gasta el oyente `{ once: true }` sin soltar nada; y ningún candado
   medía que no quede vivo un oyente de `pageshow`.
5. **UP-doble** (visto por lectura al planificar): `consumeOwnedBranchEntry` no lee la guarda, así que dos toques a
   Inicio desde una sección con la marca de la rama, antes del recorrido, retroceden dos veces.

Decisión del dueño (2026-11-18, no se reabre): arreglar el review ANTES del push conjunto (obs-G1 + R2-WR-01 + éste),
RED primero, arreglo sólo de lo que reproduce; CR-01 con un solo segundo paso de B1 pendiente (el nuevo reemplaza al
anterior); WR-02 con un `try` en las tres ramas; WR-01 se mide primero y, si reproduce, su diseño lo decide el dueño;
`UP-doble`: «medirlo y arreglarlo si da rojo».

La referencia del revisor (su simulador `scratchpad/rev/guard.run.mjs`, re-corrido al planificar contra `73ff6cc`;
no es un artefacto del repo, el veredicto lo da la suite), en la pila
`/afuera → /dashboard → /finances{frjUnder} → /finances?tab=ventas{frjView}`:

| Escenario | HEAD `73ff6cc` |
|---|---|
| A — tab por defecto, `replaceState` de Next en la ventana, sección activa del menú | 2 retrocesos, `/dashboard` |
| B — igual que A, con Inicio en la barra (B1) | 3, `/afuera` |
| C — doble toque a Inicio en la barra | 3, `/afuera` |
| D — menú y después B1 | 2, `/dashboard` ✔ |
| E — B1 con un `back()` que tira y después un atrás del sistema | 2, `/dashboard` (correcto: 1, `/finances`) |

**El entorno (paso 0).** 2026-11-18, ~20:40 hora de Argentina. node `v24.15.0`. HEAD al empezar: `73ff6cc`. HEAD de la
medición: `ba97254` (el `test(quick-261118-pjd)` con los esperados; ningún cambio en `lib/` fuera de
`lib/panel-history.test.ts`). Sin navegador ni servidor: no pasa por el turno ni necesita Supabase.

### Lo medido: 14 casos en el simulador fiel y 4 en el stub del ejecutor

El simulador de `test/panel-tabs.test.ts` aprendió a contar los oyentes de `pageshow` (`oyentesPageshowDelStub`) antes
de los casos: siguió 97/97. `test/panel-branch.test.ts` y `lib/panel-history.test.ts` drenan ahora despachando el
evento del recorrido (sin filtrar por nombre, IN-03) y el candado de orden de B1 nombra al `segundoPaso`.

```
./node_modules/.bin/vitest run --project pure test/panel-tabs.test.ts test/panel-branch.test.ts lib/panel-history.test.ts
```

`Tests  12 failed | 508 passed (520)` — los doce rojos son casos nuevos, cada uno por su aserción (cero
`TypeError`/`ReferenceError`); ningún caso viejo en rojo. Las tuplas medidas contra las esperadas, tal cual del error
de la aserción:

```
CR-b1-doble: dos toques a Inicio en la barra antes del recorrido
  {
    "navegaciones": [],
-   "retrocesos": 2,
+   "retrocesos": 3,
    "s1": true,
    "s2": true,
-   "url": "/dashboard",
+   "url": "/afuera",
  }

CR-b1-doble-fichas: dos toques a Inicio en la barra con dos fichas apiladas
  {
    "navegaciones": [],
-   "retrocesos": 3,
+   "retrocesos": 4,
    "s1": true,
    "s2": true,
-   "url": "/dashboard",
+   "url": "/afuera",
  }

CR-b1-silencio: el retroceso ignorado en silencio, tres toques a la barra y después un atrás del sistema
  {
    "navegaciones": [],
-   "retrocesos": 2,
+   "retrocesos": 4,
    "s1": true,
    "s2": true,
    "s3": true,
-   "url": "/dashboard",
+   "url": "/afuera",
  }

CR-b1-reemplazo-unidad: dos toques a B1 antes del recorrido dejan un solo segundo paso, el último
  {
-   "primeroDesenganchado": true,
+   "primeroDesenganchado": false,
    "r1": true,
    "r2": true,
    "reDecidio": 0,
    "retrocesos": 1,
  }

K2-c-b1: B1 con un back() que tira no deja su segundo paso enganchado
  {
    "navegaciones": [],
-   "oyentes": 0,
-   "retrocesos": 1,
+   "oyentes": 1,
+   "retrocesos": 2,
    "tiro": true,
-   "url": "/finances",
+   "url": "/dashboard",
  }

K2-c-b1-unidad: B1 con un back() que tira desengancha su segundo paso y no re-decide
  {
    "reDecidio": 0,
-   "segundoPasoDesenganchado": true,
+   "segundoPasoDesenganchado": false,
    "tiro": true,
  }

K2-c-exit: el sentinel con un back() que tira desengancha su segundo paso y no navega
  {
    "navego": 0,
-   "segundoPasoDesenganchado": true,
+   "segundoPasoDesenganchado": false,
    "tiro": true,
  }

K2-c-colapso: el colapso con un back() que tira desengancha su segundo paso y no navega
  {
    "navego": 0,
-   "segundoPasoDesenganchado": true,
+   "segundoPasoDesenganchado": false,
    "tiro": true,
  }

W1-menu: el tab por defecto, el replaceState de Next en la ventana y la sección activa del menú
  {
    "consumo": "consume",
    "prevenido": true,
-   "retrocesos": 1,
-   "url": "/finances",
+   "retrocesos": 2,
+   "url": "/dashboard",
  }

W1-b1: el tab por defecto, el replaceState de Next en la ventana e Inicio en la barra
  {
    "consumo": "consume",
    "navegaciones": [],
-   "retrocesos": 2,
+   "retrocesos": 3,
    "seHizoCargo": true,
-   "url": "/dashboard",
+   "url": "/afuera",
  }

C-pageshow-no-persistido: un pageshow no persistido no suelta la guarda ni gasta su salida
  {
    "consumo": "consume",
-   "despues": "replace",
-   "oyentes": 0,
+   "despues": "none",
+   "oyentes": 1,
    "oyentesPageshow": 0,
    "primero": "none",
-   "vivosPageshow": 1,
+   "vivosPageshow": 0,
  }

UP-doble: dos toques a Inicio desde una sección con la marca de la rama, antes del recorrido
  {
    "navegaciones": [],
-   "retrocesos": 1,
+   "retrocesos": 2,
    "s1": true,
    "s2": true,
-   "url": "/dashboard",
+   "url": "/afuera",
  }
```

En verde con el código de hoy (los candados de no-regresión): `NR-menu-y-barra` (`{ s1: true, s2: true, retrocesos: 2,
url: '/dashboard', navegaciones: [] }`, el D del revisor), `UP-control` (un toque desde la sección: 1 retroceso,
`/dashboard`; el simulador sí arma el `up`), `P0-normal`, `P0-catch-tab`, `P0-catch-menu` y `P0-pageshow` (cero
oyentes de `popstate` y de `pageshow` en las tres salidas de la guarda), el candado de orden de B1
(`enganchados[0].fn.name === 'segundoPaso'`) y los 151 `it` de `lib/panel-history.test.ts` con el `afterEach` que ahora
exige cero oyentes en cada caso de NAV-08.

Lo que dicen los números:
- **CR-01 reproduce, y es peor que la referencia:** dos toques ⇒ 3 retrocesos y `/afuera` (fuera del sitio); con dos
  fichas apiladas, 4; con el retroceso ignorado en silencio y tres toques, el próximo atrás del sistema dispara los tres
  re-decisores: 4 retrocesos y `/afuera`. La unidad lo confirma: el segundo toque no desengancha al primero.
- **WR-02 reproduce en las tres ramas:** el segundo paso queda enganchado (unidad: `segundoPasoDesenganchado: false` en
  B1, en el sentinel y en el colapso); en la pila, el atrás del sistema dispara la re-decisión de B1: 2 retrocesos y
  `/dashboard` en vez de `/finances`.
- **WR-01 reproduce, como en la referencia:** por el menú, 2 retrocesos y `/dashboard` (fuera de la sección); por la
  barra, 3 y `/afuera` (fuera del sitio, la cicatriz 2).
- **IN-01 reproduce:** el `pageshow` no persistido se lleva el oyente `{ once: true }` (`vivosPageshow: 0`) y la guarda
  queda sin su salida por la bfcache: el `pageshow` persistido de después ya no la suelta (`despues: 'none'`, el oyente
  de `popstate` sigue vivo).
- **UP-doble reproduce:** dos toques a Inicio desde `/finances` con la marca ⇒ 2 retrocesos y `/afuera`.

veredictos (m): CR-01=reproduce · WR-02=reproduce · WR-01=reproduce · IN-01=reproduce · UP=reproduce

decision WR-01 (dueno, 2026-11-18): A

### El arreglo (task 3)

Banderas: FCR=FW2=FI1=FUP=1 (los cuatro reprodujeron) y FW1=1 (WR-01 reprodujo y el dueño eligió **A** en el
checkpoint del 2026-11-18: «llegó» = cambiaron el state Y la URL). HEAD al arreglar: `4ae9a12`; el entorno, el
mismo de arriba (node `v24.15.0`), 2026-11-19 ~00:45 hora de Argentina.

- **El instrumento de A, neutral** (`341e12d`, `test`): el stub de NAV-08 de `lib/panel-history.test.ts` recibe
  `location`. Con el código de antes, las tres suites dieron EXACTAMENTE los 12 rojos de arriba (`12 failed | 508
  passed (520)`).
- **El candado de FUP, antes del arreglo** (`54a5e08`, `test`): `C-retroceso-unico-rama` en `test/panel-tabs.test.ts`.
  Rojo con el código de antes, por su aserción:
  ```
  AssertionError: expected -1 to be greater than -1
   ❯ test/panel-tabs.test.ts:1629:21
      1629|     expect(enVuelo).toBeGreaterThan(-1)
  ```
  (`consumeOwnedBranchEntry` no nombraba `consumoEnVuelo`).
- **El `fix`** (`5d7ee5f`):
  - CR-01: `segundoPasoB1Pendiente` en `lib/panel-branch.ts` (memoria no exportada entre `consumeOwnedExitSentinel`
    y `runBranchNavigation`): el toque nuevo desengancha al pendiente; el que corre se suelta ANTES de `reDecidir`.
  - WR-02: un `try` por rama de dos pasos (sentinel, B1, colapso) cuyo `catch (e)` desengancha el segundo paso (en
    B1 también apaga la memoria) y hace `throw e`: 3 `catch (e)` y 3 `throw e` en `runBranchNavigation`.
  - IN-01: el `pageshow` va sin disparo único en los bloques de encendido; el condicional de `persisted` queda.
  - WR-01 (A): `urlDelConsumo` (`pathname` + `search`), cargada en los bloques de encendido y apagada en
    `soltarConsumo`; el chequeo devuelve `true` si el state O la URL siguen siendo los del consumo.
  - UP-doble (FUP): `consumeOwnedBranchEntry` empieza con el MISMO chequeo que `consumeOwnedPanelEntry` y enciende la
    guarda con el MISMO bloque que la rama `consume`; sus dos guardas, iguales y en su orden.
  - Docblocks: WR-04 (el radio del retroceso ignorado en silencio, con `CR-b1-silencio`), WR-01 (state Y URL, con
    los `W1-*` y el borde declarado), IN-01 (por qué sin disparo único), la guarda compartida con
    `consumeOwnedBranchEntry` (con `UP-doble`), el encabezado y la frase del «nunca retrocede». IN-02: sólo el
    comentario de obs-G1 en `finances-client.tsx`.
  - Las tres aserciones viejas declaradas de `test/panel-branch.test.ts` (`up`: 0 oyentes; colapso: 1 y 1) dieron
    rojo con el `fix` puesto (`expected [...] to have a length of +0 but got 2`, y `1 but got 3` dos veces: los
    oyentes de la guarda) y pasan a contar los que no son de la guarda con el mismo filtro que ya usaba el caso de B1, con la misma
    cantidad. Ninguna otra línea de ese archivo cambió; ningún esperado cambió.

Con el arreglo, las tres suites: `Tests  521 passed (521)` — los 14 casos de `panel-tabs`, los 4 de `panel-branch`
y `C-retroceso-unico-rama` en verde sin tocar un esperado: `CR-b1-doble` 2 retrocesos y `/dashboard`,
`CR-b1-doble-fichas` 3 y `/dashboard`, `CR-b1-silencio` 2 y `/dashboard`, `CR-b1-reemplazo-unidad` con el primero
desenganchado, los `K2-c-*` con el segundo paso desenganchado (`K2-c-b1`: 1 retroceso y `/finances`), `W1-menu` 1
y `/finances`, `W1-b1` 2 y `/dashboard`, `C-pageshow-no-persistido` con la guarda viva tras el `pageshow` no
persistido y suelta tras el persistido, `UP-doble` 1 y `/dashboard`.

Las mutaciones (sobre el árbol de trabajo, revertidas con Edit, sin commitear; `git diff --quiet HEAD --
lib/panel-history.ts` = 0 después de cada una). Logs en `C:\Users\franc\AppData\Local\Temp\tmp.JP4cU02P7t\`
(`m1.txt`, `m2.txt`):
- M1 (el condicional de `persisted` reemplazado por la llamada directa a `soltarConsumo()`): `panel-tabs` 1 rojo,
  `C-pageshow-no-persistido` (`Tests  1 failed | 111 passed (112)`).
- M2 (sin la línea que saca el oyente de `pageshow` en `soltarConsumo`): `panel-tabs` + `lib/panel-history.test.ts`
  10 rojos (`Tests  10 failed | 274 passed (284)`): `P0-normal`, `P0-catch-tab`, `P0-catch-menu`, `P0-pageshow`,
  `C-pageshow-no-persistido` y cinco casos de NAV-08 por el `afterEach` que exige cero oyentes.

mutacion M1 (sin el condicional de persisted): C-pageshow-no-persistido=rojo
mutacion M2 (sin sacar el oyente de pageshow): P0-normal=rojo

**Los dos gates del task 3:**
- **El primero (estático, suites y build):** `tsc` sin errores; eslint rc 0 en `lib/panel-branch.ts`,
  `lib/panel-history.ts` y las tres suites, y en `finances-client.tsx` sólo la deuda medida (`467:21 error`); pura
  `77` archivos / `1876` casos, 0 fallas; las 8 suites `702`, 0 fallas; `panel-tabs` `112`, 0 fallas; `panelNavMode`
  y `panelBranchPlan` byte-idénticas; `lib/panel-branch.ts` cambió sólo en `runBranchNavigation` y su memoria; cero
  temporizadores. Dos ítems del gate NO dieron su verde tal cual y se declaran:
  - **`pageshow` sin disparo único = 3, el gate exige 2.** El conteo del plan es de un bloque de encendido por
    función y asumía dos bloques; con FUP (`UP-doble` reprodujo) `consumeOwnedBranchEntry` lleva el TERCER bloque,
    idéntico línea por línea a los otros dos porque así lo exige `C-retroceso-unico-rama`. Es un defecto del
    conteo del gate con FUP (lo correcto es 2 + FUP = 3), no del código: `pageshow` con disparo único = 0.
  - **El build dentro del gate:** la primera corrida cayó en el `tsc` del build por `.next/dev/types/routes.d.ts`
    corrupto (basura después del final del archivo, `ops<LayoutRoute extends LayoutRoutes>` en la L141; fechado
    2026-11-18 16:29, de un `next dev` anterior). Con ningún `next dev` de forjo-app vivo, los tres archivos de
    `.next/dev/types/` se apartaron al scratchpad (`apartado-next-dev-types/`), y dos builds sueltos dieron
    `rc=0` (`Compiled successfully`, `Finished TypeScript`, 64/64 páginas, 0 avisos de Suspense). En el medio hubo
    dos corridas con errores de `next/font/google` (`queries have exactly one entry`) que no se repitieron, y la
    re-corrida del gate entero tuvo un worker del build caído (`exited with code: 3221226505`, un crash de Windows
    con otras suites de la máquina corriendo): entorno, no código (P-7).
- **El segundo (por el turno, en segundo plano):** logs en `C:\Users\franc\AppData\Local\Temp\tmp.4jcriXdRPu\`
  (`app.txt`, `estatica.txt`, `scroll.txt`). App: `recorridos medidos: 47 · coinciden con lo esperado: 46 · no
  coinciden: 1`, la única FALLA es la declarada `R-G3-10-primer-toque-atras-pronto`; R-T 12/12, R-B1 4/4 (con el
  retroceso triple de `R-B1-inicio`). Estática: 18/18. Scroll: `etiqueta=verde-pjd · modo=tras-el-fix ·
  recorridos: 8 · coinciden con lo esperado tras el fix: 8`, `paneles con alto minimo: 3`.

**Lo que NO cierra:**
- El teléfono real: la UAT corta va después del push conjunto (obs-G1 + R2-WR-01 + éste).
- Safari de iOS y Chrome de Android reales: todo lo de acá es el simulador y Chrome de escritorio headless.
- El `HistoryUpdater` real de Next dentro de la ventana del recorrido: los `W1-*` lo emulan; las sondas de la app no
  arman la ráfaga. Y el borde declarado de A: un reemplazo en la ventana que cambie la URL suelta la guarda antes de
  tiempo, como antes.
- R2-IN-04 (doble toque en una fila de Clientes), fuera de alcance.
- El doble toque sobre el COLAPSO (dos toques desde Más → sección antes del recorrido): sin medir; con FUP queda
  cubierto por lectura por la misma guarda.

cierre (m): CR-01=arreglado · WR-02=arreglado · WR-01=arreglado · IN-01=arreglado · UP=arreglado

## (n) La familia back(): todo atrás del panel por la guarda compartida (quick 261119-32l)

Qué se preguntó: si los hallazgos de la revisión de verificación del quick 261118-pjd (`261118-pjd-REVIEW.md`)
reproducen con el código de hoy, medidos con los esperados commiteados ANTES de la corrida que los juzga:

1. **CR-01 / X2 (critical, preexistente):** con el sentinel de salida arriba (Inicio, aviso armado), dos toques a un
   destino de la barra antes del recorrido. `consumeOwnedExitSentinel` no lee la guarda del consumo en vuelo: cada toque
   engancha su segundo paso y retrocede; el primer retroceso consume el sentinel y el segundo la entrada de Inicio.
2. **IN-03:** semánticas distintas ante dos toques: B1 se queda con el último, el colapso y la salida con todos.
3. **WR-01 / S4:** con la guarda colgada (un retroceso que el navegador ignoró en silencio), el `up` o el colapso del
   guard de cambios sin guardar devuelven «se hizo cargo» sin retroceder ni navegar.
4. **D-01 / D-02:** ¿todo retroceso del panel pasa por la guarda compartida? Un candado de fuente con la lista cerrada.

Decisión del dueño (**2026-11-19**, no se reabre):
- **D-01:** todo `history.back()` del panel (`lib/panel-history.ts` y `lib/panel-branch.ts`) que consuma una entrada
  propia pasa por la guarda compartida (mismo chequeo de consumo en vuelo, mismo bloque de encendido, candado anti-deriva),
  empezando por `consumeOwnedExitSentinel` (el BLOCKER). RED primero con `X2-exit-doble` más un control verde.
- **D-02:** candado estructural anti `back()` suelto: un test de fuente con la lista cerrada y contada, que mide de verdad
  (no cero) y con su mutación probada.
- **D-03:** con la guarda colgada, el `up` del guard sucio no puede devolver «se hizo cargo» sin hacer nada. RED primero;
  arreglo que respete `unsaved-changes-guard.tsx` y el aviso, sin tocar `lib/dirty-history.ts`.
- **D-04:** IN-01 (docblock y call sites de `consumeOwnedBranchEntry`), IN-03 (decidir y justificar la semántica ante dos
  toques), IN-04 (el stub de `test/panel-branch.test.ts`). IN-02 queda declarado.
- **D-05:** el registro: esta sección, `04-SECURITY.md`, `deferred-items.md`; y el SUMMARY con la tabla de call sites.

**Los `back()` del panel al planificar** (`grep` sobre `lib/`, líneas de `e07bffd`):

| # | Sitio | Qué consume | ¿Pasa por la guarda? | Candado de hoy |
|---|---|---|---|---|
| 1 | `lib/panel-history.ts:1145` | rama `consume` de `applyPanelView` (tab por defecto, «Volver» de clientes) | SÍ | `C-retroceso-unico` |
| 2 | `lib/panel-history.ts:1348` | `consumeOwnedPanelEntry` (menú NAV-08, primer paso de B1) | SÍ | `C-retroceso-unico` |
| 3 | `lib/panel-history.ts:1418` | `consumeOwnedBranchEntry` (`up`, el colapso y su `second-consume`) | SÍ | `C-retroceso-unico-rama` |
| 4 | `lib/panel-branch.ts:312` | `consumeOwnedExitSentinel`: el sentinel de salida, primer paso de `consume-exit-then-navigate` | **NO** (el BLOCKER) | ninguno |
| 5 | `lib/panel-branch.ts:2065` | el desmontaje del sentinel (`usePanelBranch`, microtask, `panelExitUnmountAction`, G3-4) | **NO** (sin doble consumo conocido, pero consume una entrada PROPIA) | `test/panel-branch.test.ts:3001` y `:3006` exigen el literal del retroceso crudo |
| — | `lib/overlay-history.ts:498, :548`; `lib/dirty-history.ts:343, :369, :385, :391, :419` | sus propias marcas | fuera de alcance | intocables |

**El entorno (paso 0).** 2026-11-19, 02:40 hora de Argentina. node `v24.15.0`. HEAD al empezar: `e07bffd`. HEAD de la
medición: `2a38661` (el `test(quick-261119-32l)` con los esperados; ningún cambio en `lib/`, `components/` ni `app/`).
Sin navegador ni servidor: no pasa por el turno ni necesita Supabase.

### Lo medido: 9 casos en el simulador fiel y 2 candados de fuente

`test/panel-branch.test.ts` cambió de forma NEUTRAL antes de medir (IN-04): el filtro de los oyentes de la guarda pasó a
ser por identidad (`DE_LA_GUARDA`, llenado una vez en un `beforeAll` con un consumo real del menú), el stub de `location`
tiene `search: ''`, y `C-oyentes-de-la-guarda` fija que la guarda engancha exactamente dos oyentes. Corrido antes del
commit: 238/238 en verde.

```
./node_modules/.bin/vitest run --project pure test/panel-tabs.test.ts test/panel-branch.test.ts
```

`Tests  9 failed | 352 passed (361)` — los nueve rojos son casos nuevos, cada uno por su aserción (cero
`TypeError`/`ReferenceError`); ningún caso viejo en rojo. Verdes, como tenían que estar: `X2-control`, `S4-control` y
`C-oyentes-de-la-guarda`. Log: `scratchpad/32l/medicion-antes.txt` de la sesión. Las tuplas medidas contra las
esperadas, tal cual del error de la aserción:

```
X2-exit-doble: dos toques a un destino de la barra desde Inicio con el aviso armado, antes del recorrido  — ROJO
  {
    "navegaciones": [
      "push /finances",
+     "push /finances",
    ],
-   "retrocesos": 1,
+   "retrocesos": 2,
    "s1": true,
    "s2": true,
-   "url": "/dashboard",
+   "url": "/afuera",
  }

X2-control: un solo toque  — VERDE  { s1: true, retrocesos: 1, url: '/dashboard', navegaciones: ['push /finances'] }

X2-destinos: /finances y después /clients desde Inicio con el aviso armado  — ROJO
  {
    "navegaciones": [
+     "push /finances",
      "push /clients",
    ],
-   "retrocesos": 1,
-   "url": "/dashboard",
+   "retrocesos": 2,
+   "url": "/afuera",
  }

CO2-doble-colapso: dos toques a /agenda desde una sección de Más  — ROJO
  {
    "navegaciones": [
      "replace /agenda",
+     "replace /agenda",
    ],
    "retrocesos": 1,
    "url": "/mas",
  }

CO-mixto: el colapso a /agenda y después Inicio  — ROJO
  {
-   "navegaciones": [],
+   "navegaciones": [
+     "replace /agenda",
+   ],
    "retrocesos": 2,
    "url": "/dashboard",
  }

CO3-colapso-y-mas: el colapso a /agenda y después Más  — ROJO
  {
-   "navegaciones": [],
+   "navegaciones": [
+     "replace /agenda",
+   ],
    "retrocesos": 1,
    "url": "/mas",
  }

S4-guard-up: up ignorado en silencio y después «Descartar» hacia Inicio  — ROJO
  {
-   "navegaciones": [
-     "push /dashboard",
-   ],
-   "p": "degrado",
+   "navegaciones": [],
+   "p": "se-hizo-cargo",
    "retrocesos": 0,
    "url": "/finances",
  }

S4-guard-colapso: colapso ignorado en silencio y después «Descartar» hacia /agenda  — ROJO
  {
-   "navegaciones": [
-     "replace /agenda",
-   ],
-   "p": "degrado",
+   "navegaciones": [],
+   "p": "se-hizo-cargo",
    "retrocesos": 0,
  }

S4-control: «Descartar» hacia Inicio sin guarda colgada  — VERDE  { p: 'se-hizo-cargo', retrocesos: 1, url: '/dashboard', navegaciones: [] }

C-back-cerrado  — ROJO (por construcción)
  {
    "historia": [
      "applyPanelView",
      "consumeOwnedBranchEntry",
-     "consumeOwnedExitEntry",
      "consumeOwnedPanelEntry",
    ],
-   "rama": [],
+   "rama": [
+     "consumeOwnedExitSentinel",
+     "usePanelBranch",
+   ],
  }

C-retroceso-unico-salida  — ROJO (por construcción): expected '' not to be '' (`consumeOwnedExitEntry` no existe)

C-oyentes-de-la-guarda (test/panel-branch.test.ts)  — VERDE
```

Lectura: X2 reproduce exactamente lo que midió el revisor (2 retrocesos, `/afuera`, dos empujes). IN-03 reproduce en las
tres formas, incluida la que sólo cierra la unificación (`CO-mixto`: el retroceso a Inicio Y el `replace` a `/agenda`
pedidos a la vez). S4 reproduce en el `up` y en el colapso: el guard recibe «se hizo cargo» y no navega. Los dos
candados de fuente están rojos por construcción, que es lo que tienen que estar antes del arreglo (verdes querría decir
que no miden).

veredictos (n): CR-01=reproduce · IN-03=reproduce · WR-01=reproduce · C-back=rojo
