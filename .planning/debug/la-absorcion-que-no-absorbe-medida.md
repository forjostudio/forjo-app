---
status: measured
trigger: "Plan 03-12 del workstream panel-nav: medir por que el hash esta en la URL y el atras no se absorbe (G3-2, re-armado al expirar la ventana; G3-3, entrada directa a Inicio) ANTES de que el plan 03-13 escriba un arreglo."
created: 2026-10-28T00:00:00Z
updated: 2026-10-28T00:00:00Z
---

# La absorción que no absorbe — medida (plan 03-12, 2026-10-28)

## El veredicto en un párrafo

**La hipótesis del plan queda REFUTADA para `G3-2` y `G3-3`, y CONFIRMADA sólo para la forma de
recarga del 1.3, donde además queda tapada.** En los dos fallos del teléfono `holding` vale `true`, la
decisión del armado es la correcta (`arm`, ninguna regla declina) y **ningún `popstate` llega al
documento**: el atrás de la **interfaz** del navegador **saltea** la entrada de Inicio
(`entradas_salteadas=1`) y aterriza en la página de afuera. Es la **intervención de historial de
Chrome**: una entrada empujada **sin activación del usuario** vuelve salteable a la de abajo, y el
sentinel se empuja exactamente así — al montar (1.3) y desde el temporizador (3.1). Con el mismo
servidor, el mismo modo estricto y **sólo el gesto cambiado** (una navegación a la entrada inmediata
anterior, que no respeta la intervención) los dos recorridos **pasan** con el aviso. ⇒ **`G3-2` y
`G3-3` son UNA sola causa, y no es la divergencia entre la referencia y la URL.** La recarga suma una
**segunda causa, independiente y de lógica**: la entrada preservada trae el `frjExit` de una instancia
muerta, la nueva tiene otro `id`, la **séptima regla declina sin acreditar** y el `popstate` se ignora
con `holding=false` — el sospechoso que el plan nombró, medido tal cual. **El doble montaje del
servidor de desarrollo queda DESCARTADO:** cero `popstate` sin gesto y un solo armado al montar en las
dos posiciones del modo estricto, con los mismos resultados. ⚠ Y la consecuencia que importa para el
plan `03-13`: **ninguna de las cuatro opciones de diseño que el plan planteó toca la causa de `G3-2` y
`G3-3`.** La que corresponde pide cambiar **cuándo** se arma el sentinel, y eso es una decisión del
dueño (más abajo, en (d)).

## (a) Qué se midió y con qué

- **La app real**, en **Chrome real** (`Chrome/155.0.8059.86`, headless, Node v24.15.0), por CDP, con
  la sonda `.planning/debug/probes/panel-exit-en-la-app.mjs` y el canal de diagnóstico de
  `lib/panel-branch.ts` (`recordExitDiag`) abierto **antes** del JS de la app con
  `Page.addScriptToEvaluateOnNewDocument` y espejado a la sonda por un binding (así no se pierden los
  registros de un documento que se va).
- **El servidor** fue el `next dev` **del dueño**, vivo en el puerto 80 (el mismo que abre el
  teléfono). La sonda iba a levantar el suyo en el 3031, pero **Next 16 no deja un segundo `next dev`
  sobre el mismo directorio** (candado en `.next/dev/lock`; medido: *"Another next dev server is
  already running"*). Así que se midió **el mismo entorno en el que el dueño midió los dos fallos**.
- **El modo estricto** se movió como **única variable** editando `next.config.ts` (la clave
  `reactStrictMode: false`), dejando que el servidor se reinicie solo, y se restauró verificando la
  **huella** del archivo: `8ceb99aeabb6a8b16cbe0e6d836bf0aa1ae03578` antes y después.
- **El gesto de atrás**, que resultó ser **la variable que decide todo**. Calibrado contra una página
  propia (`/a` → `/b` → `pushState('#x')`):

  | Método | Sin activación | Con activación | Activación + dos empujes |
  |---|---|---|---|
  | Alt+Izquierda por CDP (headless y con ventana) | no navega | no navega | — |
  | botón atrás del mouse por CDP | `/b` | `/b` | — |
  | `Page.navigateToHistoryEntry` (**`entrada`**) | `/b` | `/b` | — |
  | `history.back()` | `/b` | `/b` | — |
  | **`chrome.tabs.goBack`** (**`interfaz`**, `NavigationController::GoBack`) | **`/a` — SALTEA `/b`** | `/b` | `/b#x` |

  `interfaz` es el atrás de la interfaz del navegador —el del teléfono—, invocado desde una extensión
  de prueba que la sonda escribe en un directorio temporal y carga con `Extensions.loadUnpacked` por la
  tubería de CDP. Es el **único** de los cinco que respeta la intervención.
- **El recorte, declarado igual que la sonda estática declara los suyos:** esto es **Chrome de
  escritorio**. Cierra el **cableado de React**, el **orden de los efectos**, el **temporizador real**,
  la carrera del retroceso asíncrono de la limpieza **y** la intervención de historial de Chrome
  **tal como la implementa Chrome de escritorio**. **No cierra A11**: Chrome de Android y Safari de
  iOS siguen siendo del teléfono. Que Chrome de Android aplique la misma regla es lo esperable (vive en
  el código compartido del navegador) pero **no está medido acá**; que WebKit tenga una regla parecida,
  tampoco.

## (b) Los números, pegados

Las cuatro corridas finales: los dos gestos × las dos posiciones del modo estricto, contra el mismo
servidor y la misma sesión. Las líneas salen de la salida de la sonda tal cual (filtradas a las que
llevan la medición; la salida completa trae además cada registro del canal).

| Corrida | R-1.3-nueva | R-1.3-recarga (3 vueltas) | R-3.1 |
|---|---|---|---|
| gesto `interfaz` · estricto ACTIVO (default) | FALLA — sale del sitio | FALLA 0/3 — sale del sitio | FALLA — el 2º atrás sale |
| gesto `entrada` · estricto ACTIVO | OK | FALLA 0/3 — `holding=false`, se ignora | OK |
| gesto `interfaz` · estricto APAGADO | FALLA — sale del sitio | FALLA 0/3 — sale del sitio | FALLA — el 2º atrás sale |
| gesto `entrada` · estricto APAGADO | OK | FALLA 1/3 (2 vueltas pasan: los `id` coincidieron) | OK |

```text
=== sonda-app-dev-interfaz
gesto=interfaz · el ATRAS DE LA INTERFAZ (chrome.tabs.goBack: respeta la intervencion de historial)
modo=dev · modo estricto ACTIVO · reactStrictMode en next.config.ts: ausente (default: true)
FALLA R-1.3-nueva · entrada DIRECTA a Inicio en una pestana limpia, sentinel armado, UN atras
hash_al_entrar: medido="#salir"
absorbido: medido="no"  <-- NO COINCIDE
ruta_despues: medido="(afuera)"  <-- NO COINCIDE
aviso_visible: medido="no"  <-- NO COINCIDE
firma_doble_montaje: popstates_sin_gesto=0 retrocesos_sin_gesto=0 (acciones=[]) armados_al_entrar=1 (acciones=[arm]) ids=[51]
tupla: hash_antes=#salir es_nuestro=si estado_antes={"frjExit":51} largo_antes=3 largo_despues=3 entradas_salteadas=1 ruta_despues=(afuera) documento_nuevo=no aviso_visible=no absorbido=no
gesto: accion=sin-registro regla=sin-registro
FALLA R-1.3-recarga · la otra forma del 1.3: RECARGA parado en Inicio armado, UN atras — tres vueltas
vuelta_1_absorbido: medido="no"  <-- NO COINCIDE
vuelta_2_absorbido: medido="no"  <-- NO COINCIDE
vuelta_3_absorbido: medido="no"  <-- NO COINCIDE
  frjExit de la entrada preservada=1 id de la instancia nueva=1 coinciden=si
  primer armado: accion=none regla=regla-4-topIsOurs(E-6) · ultimo armado: accion=none regla=regla-4-topIsOurs(E-6) vivo_despues=true
  firma_doble_montaje: popstates_sin_gesto=0 retrocesos_sin_gesto=0 (acciones=[]) armados_al_entrar=1 (acciones=[none]) ids=[1]
  tupla: hash_antes=#salir es_nuestro=si estado_antes={"frjExit":1} largo_antes=3 largo_despues=3 entradas_salteadas=1 ruta_despues=(afuera) documento_nuevo=no aviso_visible=no absorbido=no
  gesto: accion=sin-registro regla=sin-registro
  frjExit de la entrada preservada=1 id de la instancia nueva=1 coinciden=si
  primer armado: accion=none regla=regla-4-topIsOurs(E-6) · ultimo armado: accion=none regla=regla-4-topIsOurs(E-6) vivo_despues=true
  firma_doble_montaje: popstates_sin_gesto=0 retrocesos_sin_gesto=0 (acciones=[]) armados_al_entrar=1 (acciones=[none]) ids=[1]
  tupla: hash_antes=#salir es_nuestro=si estado_antes={"frjExit":1} largo_antes=3 largo_despues=3 entradas_salteadas=1 ruta_despues=(afuera) documento_nuevo=no aviso_visible=no absorbido=no
  gesto: accion=sin-registro regla=sin-registro
  frjExit de la entrada preservada=1 id de la instancia nueva=157 coinciden=no
  primer armado: accion=none regla=septima-urlYaLlevaNuestroHash(E-13) · ultimo armado: accion=none regla=septima-urlYaLlevaNuestroHash(E-13) vivo_despues=false
  firma_doble_montaje: popstates_sin_gesto=0 retrocesos_sin_gesto=0 (acciones=[]) armados_al_entrar=1 (acciones=[none]) ids=[157]
  tupla: hash_antes=#salir es_nuestro=si estado_antes={"frjExit":1} largo_antes=3 largo_despues=3 entradas_salteadas=1 ruta_despues=(afuera) documento_nuevo=no aviso_visible=no absorbido=no
  gesto: accion=sin-registro regla=sin-registro
FALLA R-3.1 · el re-armado al EXPIRAR la ventana: atras, esperar la ventana entera, atras otra vez
primer_atras_absorbido: medido="si"
transcurrido_supera_la_ventana: medido="si"
aviso_desaparecio: medido="si"
hash_volvio: medido="si"
segundo_atras_absorbido: medido="no"  <-- NO COINCIDE
  tupla: hash_antes=#salir es_nuestro=si estado_antes={"frjExit":29} largo_antes=4 largo_despues=4 entradas_salteadas=0 ruta_despues=/dashboard documento_nuevo=no aviso_visible=si absorbido=si
  gesto: accion=hint regla=ninguna-AVISA
transcurrido=2903 ms dentro de la pagina (ventana=2000 ms, margen=900 ms)
  tupla: hash_antes=#salir es_nuestro=si estado_antes={"frjExit":29} largo_antes=3 largo_despues=3 entradas_salteadas=1 ruta_despues=(afuera) documento_nuevo=no aviso_visible=no absorbido=no
  gesto: accion=sin-registro regla=sin-registro
gesto=interfaz · modo=dev · recorridos medidos: 3 · coinciden con el guion: 0 · no coinciden: 3
=== sonda-app-dev-entrada
gesto=entrada · navegacion a la entrada inmediata anterior (NO respeta la intervencion)
modo=dev · modo estricto ACTIVO · reactStrictMode en next.config.ts: ausente (default: true)
OK  R-1.3-nueva · entrada DIRECTA a Inicio en una pestana limpia, sentinel armado, UN atras
hash_al_entrar: medido="#salir"
absorbido: medido="si"
ruta_despues: medido="/dashboard"
aviso_visible: medido="si"
firma_doble_montaje: popstates_sin_gesto=0 retrocesos_sin_gesto=0 (acciones=[]) armados_al_entrar=1 (acciones=[arm]) ids=[1]
tupla: hash_antes=#salir es_nuestro=si estado_antes={"frjExit":1} largo_antes=3 largo_despues=3 entradas_salteadas=0 ruta_despues=/dashboard documento_nuevo=no aviso_visible=si absorbido=si
gesto: accion=hint regla=ninguna-AVISA
FALLA R-1.3-recarga · la otra forma del 1.3: RECARGA parado en Inicio armado, UN atras — tres vueltas
vuelta_1_absorbido: medido="no"  <-- NO COINCIDE
vuelta_2_absorbido: medido="no"  <-- NO COINCIDE
vuelta_3_absorbido: medido="no"  <-- NO COINCIDE
  frjExit de la entrada preservada=1 id de la instancia nueva=21 coinciden=no
  primer armado: accion=none regla=septima-urlYaLlevaNuestroHash(E-13) · ultimo armado: accion=none regla=septima-urlYaLlevaNuestroHash(E-13) vivo_despues=false
  firma_doble_montaje: popstates_sin_gesto=0 retrocesos_sin_gesto=0 (acciones=[]) armados_al_entrar=1 (acciones=[none]) ids=[21]
  tupla: hash_antes=#salir es_nuestro=si estado_antes={"frjExit":1} largo_antes=3 largo_despues=3 entradas_salteadas=0 ruta_despues=/dashboard#salir documento_nuevo=no aviso_visible=no absorbido=no
  gesto: accion=ignore regla=regla-4-holding-false
  frjExit de la entrada preservada=21 id de la instancia nueva=1 coinciden=no
  primer armado: accion=none regla=septima-urlYaLlevaNuestroHash(E-13) · ultimo armado: accion=none regla=septima-urlYaLlevaNuestroHash(E-13) vivo_despues=false
  firma_doble_montaje: popstates_sin_gesto=0 retrocesos_sin_gesto=0 (acciones=[]) armados_al_entrar=1 (acciones=[none]) ids=[1]
  tupla: hash_antes=#salir es_nuestro=si estado_antes={"frjExit":21} largo_antes=3 largo_despues=3 entradas_salteadas=0 ruta_despues=/dashboard#salir documento_nuevo=no aviso_visible=no absorbido=no
  gesto: accion=ignore regla=regla-4-holding-false
  frjExit de la entrada preservada=1 id de la instancia nueva=5 coinciden=no
  primer armado: accion=none regla=septima-urlYaLlevaNuestroHash(E-13) · ultimo armado: accion=none regla=septima-urlYaLlevaNuestroHash(E-13) vivo_despues=false
  firma_doble_montaje: popstates_sin_gesto=0 retrocesos_sin_gesto=0 (acciones=[]) armados_al_entrar=1 (acciones=[none]) ids=[5]
  tupla: hash_antes=#salir es_nuestro=si estado_antes={"frjExit":1} largo_antes=3 largo_despues=3 entradas_salteadas=0 ruta_despues=/dashboard#salir documento_nuevo=no aviso_visible=no absorbido=no
  gesto: accion=ignore regla=regla-4-holding-false
OK  R-3.1 · el re-armado al EXPIRAR la ventana: atras, esperar la ventana entera, atras otra vez
primer_atras_absorbido: medido="si"
transcurrido_supera_la_ventana: medido="si"
aviso_desaparecio: medido="si"
hash_volvio: medido="si"
segundo_atras_absorbido: medido="si"
  tupla: hash_antes=#salir es_nuestro=si estado_antes={"frjExit":1} largo_antes=4 largo_despues=4 entradas_salteadas=0 ruta_despues=/dashboard documento_nuevo=no aviso_visible=si absorbido=si
  gesto: accion=hint regla=ninguna-AVISA
transcurrido=2913 ms dentro de la pagina (ventana=2000 ms, margen=900 ms)
  tupla: hash_antes=#salir es_nuestro=si estado_antes={"frjExit":1} largo_antes=3 largo_despues=3 entradas_salteadas=0 ruta_despues=/dashboard documento_nuevo=no aviso_visible=si absorbido=si
  gesto: accion=hint regla=ninguna-AVISA
gesto=entrada · modo=dev · recorridos medidos: 3 · coinciden con el guion: 2 · no coinciden: 1
=== sonda-app-sin-estricto-interfaz
gesto=interfaz · el ATRAS DE LA INTERFAZ (chrome.tabs.goBack: respeta la intervencion de historial)
modo=dev-sin-estricto · modo estricto APAGADO · reactStrictMode en next.config.ts: false
FALLA R-1.3-nueva · entrada DIRECTA a Inicio en una pestana limpia, sentinel armado, UN atras
hash_al_entrar: medido="#salir"
absorbido: medido="no"  <-- NO COINCIDE
ruta_despues: medido="(afuera)"  <-- NO COINCIDE
aviso_visible: medido="no"  <-- NO COINCIDE
firma_doble_montaje: popstates_sin_gesto=0 retrocesos_sin_gesto=0 (acciones=[]) armados_al_entrar=1 (acciones=[arm]) ids=[1]
tupla: hash_antes=#salir es_nuestro=si estado_antes={"frjExit":1} largo_antes=3 largo_despues=3 entradas_salteadas=1 ruta_despues=(afuera) documento_nuevo=no aviso_visible=no absorbido=no
gesto: accion=sin-registro regla=sin-registro
FALLA R-1.3-recarga · la otra forma del 1.3: RECARGA parado en Inicio armado, UN atras — tres vueltas
vuelta_1_absorbido: medido="no"  <-- NO COINCIDE
vuelta_2_absorbido: medido="no"  <-- NO COINCIDE
vuelta_3_absorbido: medido="no"  <-- NO COINCIDE
  frjExit de la entrada preservada=1 id de la instancia nueva=2 coinciden=no
  primer armado: accion=none regla=septima-urlYaLlevaNuestroHash(E-13) · ultimo armado: accion=none regla=septima-urlYaLlevaNuestroHash(E-13) vivo_despues=false
  firma_doble_montaje: popstates_sin_gesto=0 retrocesos_sin_gesto=0 (acciones=[]) armados_al_entrar=1 (acciones=[none]) ids=[2]
  tupla: hash_antes=#salir es_nuestro=si estado_antes={"frjExit":1} largo_antes=3 largo_despues=3 entradas_salteadas=1 ruta_despues=(afuera) documento_nuevo=no aviso_visible=no absorbido=no
  gesto: accion=sin-registro regla=sin-registro
  frjExit de la entrada preservada=1 id de la instancia nueva=1 coinciden=si
  primer armado: accion=none regla=regla-4-topIsOurs(E-6) · ultimo armado: accion=none regla=regla-4-topIsOurs(E-6) vivo_despues=true
  firma_doble_montaje: popstates_sin_gesto=0 retrocesos_sin_gesto=0 (acciones=[]) armados_al_entrar=1 (acciones=[none]) ids=[1]
  tupla: hash_antes=#salir es_nuestro=si estado_antes={"frjExit":1} largo_antes=3 largo_despues=3 entradas_salteadas=1 ruta_despues=(afuera) documento_nuevo=no aviso_visible=no absorbido=no
  gesto: accion=sin-registro regla=sin-registro
  frjExit de la entrada preservada=1 id de la instancia nueva=43 coinciden=no
  primer armado: accion=none regla=septima-urlYaLlevaNuestroHash(E-13) · ultimo armado: accion=none regla=septima-urlYaLlevaNuestroHash(E-13) vivo_despues=false
  firma_doble_montaje: popstates_sin_gesto=0 retrocesos_sin_gesto=0 (acciones=[]) armados_al_entrar=1 (acciones=[none]) ids=[43]
  tupla: hash_antes=#salir es_nuestro=si estado_antes={"frjExit":1} largo_antes=3 largo_despues=3 entradas_salteadas=1 ruta_despues=(afuera) documento_nuevo=no aviso_visible=no absorbido=no
  gesto: accion=sin-registro regla=sin-registro
FALLA R-3.1 · el re-armado al EXPIRAR la ventana: atras, esperar la ventana entera, atras otra vez
primer_atras_absorbido: medido="si"
transcurrido_supera_la_ventana: medido="si"
aviso_desaparecio: medido="si"
hash_volvio: medido="si"
segundo_atras_absorbido: medido="no"  <-- NO COINCIDE
  tupla: hash_antes=#salir es_nuestro=si estado_antes={"frjExit":1} largo_antes=4 largo_despues=4 entradas_salteadas=0 ruta_despues=/dashboard documento_nuevo=no aviso_visible=si absorbido=si
  gesto: accion=hint regla=ninguna-AVISA
transcurrido=2915 ms dentro de la pagina (ventana=2000 ms, margen=900 ms)
  tupla: hash_antes=#salir es_nuestro=si estado_antes={"frjExit":1} largo_antes=3 largo_despues=3 entradas_salteadas=1 ruta_despues=(afuera) documento_nuevo=no aviso_visible=no absorbido=no
  gesto: accion=sin-registro regla=sin-registro
gesto=interfaz · modo=dev-sin-estricto · recorridos medidos: 3 · coinciden con el guion: 0 · no coinciden: 3
=== sonda-app-sin-estricto-entrada
gesto=entrada · navegacion a la entrada inmediata anterior (NO respeta la intervencion)
modo=dev-sin-estricto · modo estricto APAGADO · reactStrictMode en next.config.ts: false
OK  R-1.3-nueva · entrada DIRECTA a Inicio en una pestana limpia, sentinel armado, UN atras
hash_al_entrar: medido="#salir"
absorbido: medido="si"
ruta_despues: medido="/dashboard"
aviso_visible: medido="si"
firma_doble_montaje: popstates_sin_gesto=0 retrocesos_sin_gesto=0 (acciones=[]) armados_al_entrar=1 (acciones=[arm]) ids=[1]
tupla: hash_antes=#salir es_nuestro=si estado_antes={"frjExit":1} largo_antes=3 largo_despues=3 entradas_salteadas=0 ruta_despues=/dashboard documento_nuevo=no aviso_visible=si absorbido=si
gesto: accion=hint regla=ninguna-AVISA
FALLA R-1.3-recarga · la otra forma del 1.3: RECARGA parado en Inicio armado, UN atras — tres vueltas
vuelta_1_absorbido: medido="si"
vuelta_2_absorbido: medido="si"
vuelta_3_absorbido: medido="no"  <-- NO COINCIDE
  frjExit de la entrada preservada=1 id de la instancia nueva=1 coinciden=si
  primer armado: accion=none regla=regla-4-topIsOurs(E-6) · ultimo armado: accion=none regla=regla-4-topIsOurs(E-6) vivo_despues=true
  firma_doble_montaje: popstates_sin_gesto=0 retrocesos_sin_gesto=0 (acciones=[]) armados_al_entrar=1 (acciones=[none]) ids=[1]
  tupla: hash_antes=#salir es_nuestro=si estado_antes={"frjExit":1} largo_antes=3 largo_despues=3 entradas_salteadas=0 ruta_despues=/dashboard documento_nuevo=no aviso_visible=si absorbido=si
  gesto: accion=hint regla=ninguna-AVISA
  frjExit de la entrada preservada=1 id de la instancia nueva=1 coinciden=si
  primer armado: accion=none regla=regla-4-topIsOurs(E-6) · ultimo armado: accion=none regla=regla-4-topIsOurs(E-6) vivo_despues=true
  firma_doble_montaje: popstates_sin_gesto=0 retrocesos_sin_gesto=0 (acciones=[]) armados_al_entrar=1 (acciones=[none]) ids=[1]
  tupla: hash_antes=#salir es_nuestro=si estado_antes={"frjExit":1} largo_antes=3 largo_despues=3 entradas_salteadas=0 ruta_despues=/dashboard documento_nuevo=no aviso_visible=si absorbido=si
  gesto: accion=hint regla=ninguna-AVISA
  frjExit de la entrada preservada=1 id de la instancia nueva=2 coinciden=no
  primer armado: accion=none regla=septima-urlYaLlevaNuestroHash(E-13) · ultimo armado: accion=none regla=septima-urlYaLlevaNuestroHash(E-13) vivo_despues=false
  firma_doble_montaje: popstates_sin_gesto=0 retrocesos_sin_gesto=0 (acciones=[]) armados_al_entrar=1 (acciones=[none]) ids=[2]
  tupla: hash_antes=#salir es_nuestro=si estado_antes={"frjExit":1} largo_antes=3 largo_despues=3 entradas_salteadas=0 ruta_despues=/dashboard#salir documento_nuevo=no aviso_visible=no absorbido=no
  gesto: accion=ignore regla=regla-4-holding-false
OK  R-3.1 · el re-armado al EXPIRAR la ventana: atras, esperar la ventana entera, atras otra vez
primer_atras_absorbido: medido="si"
transcurrido_supera_la_ventana: medido="si"
aviso_desaparecio: medido="si"
hash_volvio: medido="si"
segundo_atras_absorbido: medido="si"
  tupla: hash_antes=#salir es_nuestro=si estado_antes={"frjExit":1} largo_antes=4 largo_despues=4 entradas_salteadas=0 ruta_despues=/dashboard documento_nuevo=no aviso_visible=si absorbido=si
  gesto: accion=hint regla=ninguna-AVISA
transcurrido=2911 ms dentro de la pagina (ventana=2000 ms, margen=900 ms)
  tupla: hash_antes=#salir es_nuestro=si estado_antes={"frjExit":1} largo_antes=3 largo_despues=3 entradas_salteadas=0 ruta_despues=/dashboard documento_nuevo=no aviso_visible=si absorbido=si
  gesto: accion=hint regla=ninguna-AVISA
gesto=entrada · modo=dev-sin-estricto · recorridos medidos: 3 · coinciden con el guion: 2 · no coinciden: 1
```

**Los dos gates nuevos, probados en rojo (2026-10-28):** con la espera bajada a propósito
(`MARGEN_MS = -1500`) la sonda midió `transcurrido=509 ms` y `R-3.1` salió `FALLA` en
`transcurrido_supera_la_ventana` (rc 1); con la credencial rota la sonda salió con rc 1 y *"no se pudo
llegar a Inicio: ruta=/login contenedor_del_aviso=false"*, **cero** recorridos medidos. Los dos
restaurados y verificados por huella del archivo (`425e4e0fbd27209c619b50fb4d14b90fb9e4437d`).

## (c) La causa, nombrada

**1. `G3-3` (1.3, pestaña nueva) — la intervención de historial.** El armado al entrar dice
`accion=arm regla=ninguna-ARMA vivo_antes=false vivo_despues=true`: ninguna de las siete reglas
declinó y la referencia quedó en `true`. El atrás de la interfaz da `entradas_salteadas=1
ruta_despues=(afuera)` y **ningún registro de retroceso** (`gesto: accion=sin-registro`): no hubo
`popstate` en el documento porque el navegador nunca aterrizó en la entrada de Inicio. Con el gesto
`entrada`, el mismo recorrido da `accion=hint regla=ninguna-AVISA holding=true`. **La única
diferencia es si el gesto respeta la intervención.** El sentinel se empuja en un efecto, al montar, sin
que el dueño haya tocado nada ⇒ Chrome marca salteable la entrada de Inicio.

**2. `G3-2` (3.1) — la misma causa, por el temporizador.** Partiendo del camino del 1.2 (con toques
reales), el primer atrás **avisa** (`accion=hint`, `entradas_salteadas=0`); a los `2903 ms` medidos
dentro de la página el temporizador re-arma (`accion=arm regla=ninguna-ARMA vivo_despues=true`, el hash
vuelve a la URL, el aviso desaparece) y el segundo atrás de la interfaz **saltea** Inicio
(`entradas_salteadas=1 ruta_despues=(afuera)`, sin registro de retroceso). Con el gesto `entrada` el
segundo atrás avisa. El empuje del temporizador sale de un `setTimeout`, segundos después del último
toque. ⚠ La calibración muestra que dos empujes **inmediatamente** después de un toque no vuelven
salteable al primero; el re-armado, varios segundos después, sí. La lectura —que la activación que
protege un empuje **expira**— es una **inferencia** de esos dos números, no una medición de la regla
de Chrome.

**3. La forma de recarga del 1.3 — DOS causas apiladas.**
- **(i) la misma intervención:** con el gesto `interfaz` las tres vueltas salen del sitio
  (`entradas_salteadas=1`) **incluso en las vueltas en que los `id` coincidieron y la referencia quedó
  en `true`** (`regla-4-topIsOurs(E-6) vivo_despues=true` y sale igual).
- **(ii) un defecto de lógica, el sospechoso que el plan nombró, medido tal cual:** una recarga
  **preserva** el estado de la entrada (`frjExit` de la instancia del documento anterior) y el módulo
  se re-inicializa con **otro** `id`. Los pares medidos (preservado → nuevo): `1→21`, `21→1`, `1→5`,
  `1→157`, `1→2`, `1→43`, `1→19`, `19→1`, `1→313`, `1→149`, `1→181`, `1→37`, `37→108`, `108→1`; y
  coincidieron **por azar** `1→1` varias veces. El `id` depende de cuántos renders se descartaron antes
  del montaje, así que la coincidencia es **lotería**. Sin coincidencia: `topIsOurs=false` ⇒ la
  **séptima** regla (`urlYaLlevaNuestroHash`) declina **sin acreditar** ⇒ `vivo_despues=false` ⇒ el
  atrás llega como `accion=ignore regla=regla-4-holding-false` ⇒ la rama de ignorar re-arma (`arm`) ⇒
  el primer atrás **no hace nada visible**. Con coincidencia, avisa. ⚠ La caminata pila abajo que el
  plan temía **no** ocurre: después del pop la URL ya no lleva el hash y el reintento **arma**.

**¿`G3-2` y `G3-3` son una causa o dos?** **Una sola causa**: la intervención de historial sobre un
sentinel empujado sin activación. **No** dos, y **no** la divergencia referencia/URL: en los dos
`holding` era `true`. La forma de recarga del 1.3 tiene **dos causas** —esa misma y la de lógica— y
las dos tienen que arreglarse por separado: cerrar sólo la de lógica deja la recarga saliendo igual en
el teléfono, y cerrar sólo la intervención deja el primer atrás de la recarga comiéndose el gesto en
silencio.

**El ítem 20 de la ronda 1, ponderado** (`item 20`, en ASCII para los gates). El ítem 20 (*«si toco atrás una vez, pasan 30 segundos, y
toco el segundo atrás, sale de una»*) ya fallaba **antes** de que existiera `branchCarryMark`, así que
cualquier historia que dependiera de la propagación nueva estaría explicando otro fallo. La causa
medida **no depende de la propagación**: depende de que el re-armado del temporizador empuje sin
activación, y ese camino existe desde el plan `03-03`. Es **consistente** con el ítem 20 —y también con
el `G-5` de la ronda 1 (*"tengo que entrar a alguna sección y volver a inicio, sino sale de una sin
aviso"*: entrar a una sección y volver es **tocar**)—, pero esas rondas no se re-midieron con este
instrumento: es una lectura, no una medición.

**¿El doble montaje del servidor de desarrollo está implicado?** **No: queda DESCARTADO.** La firma
del doble montaje —un `popstate` sin gesto al entrar, producto de la limpieza que retrocede sobre el
sentinel recién empujado— midió **`popstates_sin_gesto=0`** y **`armados_al_entrar=1`** en **todas** las
corridas, con el modo estricto activo y apagado. Los resultados de las dos posiciones son los mismos
recorrido por recorrido (la única diferencia, en la recarga con `entrada`, es cuántas vueltas
coincidieron los `id` por azar). ⇒ **El teléfono no estuvo midiendo un artefacto del servidor de
desarrollo.** Lo que el teléfono midió es lo que va a pasar en producción.

**Un hallazgo lateral, medido y NO arreglado:** tocar un destino de la barra parado en Inicio armado
consume el sentinel (`consume-exit-then-navigate`), el `popstate` de ese consumo llega con
`holding=false` (el dominio se soltó a propósito, T-03-29) ⇒ `ignore` ⇒ el **cuarto momento de
reintento** re-arma (`arm`) **antes** de que la navegación diferida empuje el destino. La pila queda
`[(afuera), /dashboard, /dashboard#salir, /clients]`: el sentinel **enterrado** de `E-9`, devuelto por
el reintento del plan `03-07`. Hoy no se ve —el colapso del 1.2 aterriza justo sobre él y el recorrido
pasa—, pero el plan `03-13` tiene que pesarlo, porque cualquier cambio en cuándo se arma lo mueve.

## (d) La decisión de diseño, con sus alternativas y el costo de cada una

La pregunta que el plan dejó planteada —**¿la absorción tiene que consultar la URL como evidencia de
que estamos absorbiendo, igual que el armado en su séptima regla?**— resulta **contestar sólo el
defecto de lógica de la recarga**. Las cuatro opciones, contra lo medido:

- **(A) acreditar *seguimos absorbiendo* en el ARMADO cuando la séptima regla declina.** **Resuelve:**
  la causa (ii) de la recarga — medida: la séptima declina con un `frjExit` ajeno al `id` y deja la
  referencia en `false`. **Costo:** si el hash es rancio o ajeno, el `popstate` siguiente devuelve
  *avisar*, y *avisar* **no navega** (el navegador ya hizo el pop): el peor caso es un cartel que el
  dueño no se ganó, nunca una expulsión. Se acota exigiendo que el hash sea una de las formas
  **exactas** del derivador y que la entrada de arriba no sea de **otro** dueño de la pila. **No toca
  `G3-2` ni `G3-3`:** ahí la referencia ya vale `true`. ⇒ **ELEGIDA para la causa (ii), y sólo para
  esa.** Es la que el plan `03-13` puede implementar sin decisión nueva.
- **(B) agregar un hecho de URL a la decisión del `popstate`.** **Costo:** en el `popstate` el hash ya
  se fue; medir el instante correcto exige **cachear el hash previo**, una segunda fuente de verdad que
  puede derivar de la primera — lo que la regla de la constante única existe para prevenir. Y para
  `G3-2`/`G3-3` es irrelevante: **no llega ningún `popstate`**. ⇒ **Descartada.**
- **(C) re-derivar *estamos absorbiendo* en cada `popstate`.** **Costo:** imposible por construcción
  —la entrada ya fue consumida— y, otra vez, sin `popstate` no hay dónde. ⇒ **Descartada.**
- **(D) no declinar en la séptima regla y re-armar igual.** **Costo:** es el bug que la séptima vino a
  cerrar —el hash escala y las entradas de salida se acumulan, `dashboard#salir-3`, **E-13 mitad B**—.
  ⇒ **Descartada.**

⚠ **LO QUE NINGUNA DE LAS CUATRO CUBRE: `G3-2` y `G3-3`.** El navegador saltea una entrada empujada
sin activación del usuario, y ningún cambio en **cómo se absorbe** alcanza a una entrada que el
navegador **nunca visita**. Lo que hay que decidir es **cuándo se arma**, y tiene costo de producto, así
que **no se elige acá** (regla 4: es del dueño):

- **Camino 1 — armar sólo con activación del usuario:** en vez de al montar y al expirar el
  temporizador, el armado se dispara en el primer toque o tecla del dueño estando en Inicio (y el
  temporizador, al expirar, deja el armado **pendiente** en vez de empujar). **Costo:** si el dueño
  entra a Inicio y aprieta atrás **sin tocar nada**, sale sin aviso — y eso no tiene arreglo, es la
  regla del navegador. Lo mismo después de que el aviso expira: sin un toque nuevo, el siguiente atrás
  sale. MOB-05 pasaría a prometer *el aviso después de que tocaste la pantalla*.
- **Camino 2 — aceptar el límite y declararlo**, como la `decision (a)` aceptó el de la entrada ajena:
  dejar el mecanismo como está y escribir que en la entrada directa y después de que el aviso expira el
  primer atrás puede salir. **Costo:** los dos recorridos del guion (1.3 y 3.1) quedan **fuera** de lo
  que MOB-05 promete.
- Cualquier otro camino tiene que pasar esta misma vara: **la medición dice que el navegador no visita
  la entrada**, así que un arreglo que no cambie *cuándo* se empuja no puede funcionar.

⇒ **El plan `03-13` tal como está escrito (implementar una de A-D para `G3-2` y `G3-3`) arreglaría el
fallo equivocado.** Puede tomar **(A)** para la recarga ya; para `G3-2` y `G3-3` necesita la decisión
del dueño entre el camino 1 y el 2 antes de planearse, y un escenario que **cubra la intervención**
—la sonda de la app con `interfaz` ya lo hace; la estática no puede—.

## (e) La regla de la constante única, y cómo la opción elegida NO la rompe

MOB-05 exige que la duración **visible** del aviso y la ventana **lógica** sean el **mismo** valor,
desde **un** lugar (`PANEL_EXIT_HINT_MS`), consumido por **un** temporizador que al expirar hace las dos
cosas. **(A) no agrega un número, no agrega un temporizador y no agrega una segunda fuente** de *estamos
absorbiendo*: cambia **quién escribe** la única referencia que ya existe (`sentinelVivoRef`), en la
rama `none` del armado. `PANEL_EXIT_HINT_MS` sigue siendo un valor en un lugar, y los dos gates que lo
cuentan siguen midiendo **1** temporizador y **2** usos de la constante en el fuente sin comentarios
(medidos hoy, después de agregar el canal de diagnóstico).

Y la misma vara para el camino 1, si el dueño lo elige: el armado *pendiente* tiene que vivir en el
**mismo** temporizador —al expirar oculta el aviso y deja el armado pendiente, todo en el mismo
callback— y el oyente del toque **no** puede traer un número propio ni un segundo temporizador. Un
oyente que re-arme con su propio retardo re-crea, del otro lado, el bug de los dos números.

## Qué consume esto

- **Plan `03-13`** — la causa (ii) de la recarga con la opción **(A)** elegida y acotada; la
  intervención de historial como causa de `G3-2` y `G3-3`, con la decisión del dueño pendiente entre
  el camino 1 y el 2; el hallazgo lateral del sentinel enterrado por el cuarto reintento; y los
  escenarios que hacen pasar el tiempo, cubren la entrada directa y re-montan sobre una entrada que
  sobrevive (en la sonda estática, para la **lógica**) más la sonda de la app con el gesto `interfaz`
  (para la **intervención**, que la estática no puede ver).
- **La ronda 3 del teléfono** — A11 sigue abierto: que Chrome de Android y Safari de iOS se comporten
  como Chrome de escritorio es lo que el teléfono confirma o refuta.
- Enlazado desde `.planning/debug/pila-de-dos-niveles-medida.md`, sección *La sonda de la app real*.
