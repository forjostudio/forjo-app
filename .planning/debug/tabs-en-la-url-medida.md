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
