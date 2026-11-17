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
