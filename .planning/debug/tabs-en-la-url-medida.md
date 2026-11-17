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
