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

## (f) El cierre (plan 03-13, 2026-10-28)

**Qué se implementó.** El **camino 1** que el dueño eligió (`03-DECISION-UAT-3.md`) para `G3-2` y
`G3-3`, y la **opción (A)** de (d) para la causa (ii) de la recarga:

- El sentinel se empuja **sólo con activación del usuario**. `armarSentinel` recibe el hecho
  `puedeEmpujar` **sin valor por omisión**; el efecto del armado y el oyente nuevo del toque lo
  contestan con `panelExitActivationNow(navigator.userActivation)`; los **dos** reintentos de adentro
  de un `popstate` (el retroceso ignorado y el del teclado) lo pasan en **falso**. Sin activación, la
  decisión `arm` queda **pendiente** y no empuja nada.
- El aviso **ya no vence**: la constante `PANEL_EXIT_HINT_MS` y su temporizador se **borraron**. Lo
  levanta **un** lugar (el atrás absorbido) y lo baja **un** lugar (el toque, `alTocar`, sobre `click`
  y `keyup` en la burbuja de `window`), que en el mismo gesto re-arma con la activación que leyó. Un
  toque que un link se lleva (`defaultPrevented`) baja el aviso y **no** arma
  (`panelExitTouchAction`).
- La recarga: la rama `none` del armado **asigna** `sentinelVivoRef.current = panelExitStillHolding(...)`
  —re-deriva en los dos sentidos— en vez de sólo encender.

**La corrección de la premisa de (A).** (d) pedía acreditar *salvo que la entrada de arriba sea de
otro dueño*. Leído contra el código, ese *otro dueño* **no** puede ser `isForeignOwnedEntry` a secas:
el predicado de la regla 0 incluye `isExitSentinelOwnedEntry`, que reconoce el `frjExit` de
**cualquier** `id` —justo la marca de la instancia muerta que la recarga preserva—. Con ese predicado,
(A) habría rechazado la entrada que venía a cerrar. Otro dueño quedó definido como *ajena **y sin**
marca de salida* (un overlay o el guard de cambios sin guardar); una marca de salida, de la instancia
que sea, es de este módulo. El caso con nombre propio (*instancia MUERTA*) está en la suite.

**La calibración** (`C-activacion`, sobre `/login` antes del login, Chrome/155 de escritorio, gesto
`interfaz`), medida dos veces con los mismos resultados:

| Fila | Qué | Resultado |
|---|---|---|
| 1 | click real y empuje a los 2-4 ms | **no salteada** (`entradas_salteadas=0`, `isActive=true` al empujar) |
| 2 | click real y empuje a los ~7010 ms | **no salteada**, con `isActive=false` y `hasBeenActive=true` al empujar |
| 3 | empuje SIN activación y un click real después | **no salteada**: una activación posterior **cura** la entrada |
| 4 | `isActive` adentro del `pointerdown` de un toque emulado / del `click` real | `false` / `true` |

⇒ La premisa vale (rama (a) descartada). **Rama (b):** el gate de `isActive` es **más estricto** que
el navegador —Chrome parece mirar la activación *pegajosa* del documento—: deja pendientes donde un
empuje habría servido, que es la dirección segura. La fila 3 explica por qué `R-1.3-con-toque` pasó
**ya** contra el código de antes del arreglo (el toque curó el empuje sin activación del montaje); lo
que el arreglo cambia ahí es que **sin** toque ya no hay un hash que mienta.

**Los once recorridos**, con el atrás de la interfaz, contra el `next dev` del dueño (puerto 80):

| Recorrido | Resultado | Lo medido |
|---|---|---|
| `C-activacion` | OK | las cuatro filas de arriba |
| `R-1.3-sin-toque` | OK | sin hash al entrar, armado `pendiente`, el atrás sale `(afuera)` — el costo declarado |
| `R-1.3-con-toque` | OK | toque ⇒ `arm` ⇒ `#salir` ⇒ el atrás `hint`, aviso visible |
| `R-1.3-recarga-logica` | OK | 3/3 `none` con `vivo_despues=true`; en una corrida extra, el par `1→25` por la **séptima** |
| `R-1.3-recarga-gesto` | OK | (i) y (ii) 3/3 absorbidos; pares `1→59`, `59→301`, `301→1` por la séptima |
| `R-1.1` | OK | Turnos, Clientes, Agenda, Inicio ⇒ `/dashboard#salir`, avisa, el segundo atrás sale |
| `R-3.1` | OK | el aviso sigue a 2,5 s y a 10 s (`transcurrido=10915 ms`), con el aviso el atrás sale; el toque lo baja, el hash vuelve y el atrás vuelve a avisar |
| `R-1.4` | OK | llegar con el atrás: sin hash, `pendiente`, sin aviso, el atrás siguiente sale; con un toque, avisa |
| `R-barra-con-aviso` | OK | el toque `drop` (gesto tomado), pila `[(afuera), /dashboard, /clients]` sin `#salir` |
| `R-barra-pendiente` | OK | el toque `none` (gesto tomado), la misma pila |
| `R-lateral` | OK | el retroceso del consumo `ignore` y el armado que le sigue `pendiente`, la misma pila |

El piso del tiempo de `R-3.1` quedó **probado en rojo**: con `MARGEN_MS = -9000` la sonda midió
`transcurrido=1007 ms` y salió `FALLA` sólo en `transcurrido_supera_la_espera` (rc 1).

**El hallazgo lateral, cerrado por estructura.** Ningún empuje sale de adentro de un `popstate`, así
que el cuarto momento de reintento ya no puede enterrar el sentinel bajo la navegación diferida: la
pila medida en `R-lateral` es `[(afuera), /dashboard, /clients]`, sin el `/dashboard#salir` de (c).

**Lo que sigue abierto.** **A11**: todo esto es Chrome de **escritorio**; Chrome de Android y Safari de
iOS los cierra la ronda 3 en el teléfono. Y los **costos declarados** del camino 1 (la entrada directa
sin tocar, la llegada con el atrás, el toque que un link se lleva, el atrás del teclado), escritos en
MOB-05, en el guion de la ronda 3 y en la entrada 20 de `.planning/WINDOWS.md`. El canal de
diagnóstico (`recordExitDiag`, ahora con un tercer call site, el del toque) **se queda** hasta el
cierre de la fase, que es donde se decide si sigue en producción.

## (g) G3-4 — el aterrizaje del login, medido (plan 03-14, 2026-10-29)

**Qué se midió.** El recorrido nuevo `R-login-con-activacion` de la sonda de la app real (último de la
lista): cierra la sesión del perfil desechable, entra por `/login` con historial limpio, tipea y hace un
**click real** en *Ingresar*, y mide el montaje del panel con la activación de ese click **todavía
vigente**. Lo acompaña el instrumento `SCRIPT_DE_LA_HISTORIA`, que envuelve en `History.prototype`
`pushState`, `replaceState`, `back`, `go` y `forward` y graba cada llamada con su **pila de JS** (los 16
marcos de arriba y los 8 de la base). Mismo servidor que todo el resto: el `next dev` del dueño en el
puerto 80, **modo estricto ACTIVO** (`reactStrictMode` ausente en `next.config.ts`, huella
`8ceb99ae…`), Chrome 155 headless, gesto `interfaz` (`chrome.tabs.goBack`). Corrida completa del
2026-10-29 18:08-18:13 (hora local), rc 1 con **los once de antes en `OK`** y este en `FALLA`.

**La guarda de llegada, cumplida al primer intento:** `intento 1: ms del click al primer armado=673
acciones=[arm,none] ids=[1,1] · VALE (armado con empuje)`. Con `/dashboard` ya compilado el aterrizaje
entra holgado dentro de la ventana de activación (~5 s): es la condición del teléfono. (Una corrida
aislada previa del mismo recorrido dio lo mismo con 791 ms.)

**Lo medido contra lo esperado** (el esperado es la propiedad DESPUÉS del arreglo):

| Clave | Medido | Esperado |
|---|---|---|
| `llegada_con_activacion` | `si` | `si` |
| `popstates_al_aterrizar` | **1** | 0 |
| `aviso_al_aterrizar` | **`si`** | `no` |
| `hash_al_aterrizar` | **`""`** | `#salir` |
| `atras_tras_un_toque_absorbido` | `si` | `si` |

`G3-4` **reproducido en Chrome de escritorio**, tal cual lo describió el dueño: el aviso aparece solo y
el hash se va. La pila al aterrizar: `[(afuera), /dashboard, /dashboard#salir] actual=1` — el sentinel
sigue en la pila, **adelante**: el navegador retrocedió una entrada.

**Los registros del aterrizaje, pegados**, con el tiempo relativo al click del login (`t0` = el
`sonda-click`, `isActive=true`):

```text
sonda-historia t=+-217ms metodo=replaceState url=/login urlArg=/login            (la hidratación del login)
sonda-click    t=+0ms    url=/login defaultPrevented=false isActive=true
sonda-historia t=+629ms  metodo=replaceState url=/login urlArg=/dashboard        (el router: el push+refresh se commitea como REEMPLAZO)
sonda-historia t=+671ms  metodo=pushState    url=/dashboard urlArg=#salir        (el sentinel)
               pila: History.pushState ← usePanelBranch.useCallback[armarSentinel] ← usePanelBranch.useEffect
                     ← commitHookEffectListMount ← commitHookPassiveMountEffects ← commitPassiveMountOnFiber …
armado         t=+673ms  id=1 accion=arm regla=ninguna-ARMA vivo_antes=false vivo_despues=true
sonda-historia t=+676ms  metodo=back         url=/dashboard#salir estado={frjExit:1}
               pila: usePanelBranch.useEffect (la limpieza del desmontaje) ← commitHookEffectListUnmount
                     ← commitHookPassiveUnmountEffects ← disconnectPassiveEffect
                     ← recursivelyTraverseDisconnectPassiveEffects ← disconnectPassiveEffect …
               base (92 marcos): … recursivelyTraverseAndDoubleInvokeEffectsInDEV (x4)
                     ← commitDoubleInvokeEffectsInDEV ← flushPassiveEffects ← performWorkUntilDeadline
armado         t=+677ms  id=1 accion=none regla=regla-4-topIsOurs(E-6) vivo_antes=false vivo_despues=true
sonda-historia t=+707ms  metodo=replaceState url=/dashboard#salir urlArg=/dashboard#salir   (el router; CONSERVA el hash)
sonda-popstate t=+710ms  url=/dashboard estado={__NA, __PRIVATE_NEXTJS_INTERNALS_TREE}
sonda-historia t=+739ms  metodo=replaceState url=/dashboard urlArg=/dashboard    (el router, REACCIONANDO al popstate)
retroceso      t=+744ms  id=1 accion=hint regla=ninguna-AVISA holding=true
firma_doble_montaje: popstates_sin_gesto=1 retrocesos_sin_gesto=1 (acciones=[hint]) armados_al_entrar=2 (acciones=[arm,none]) ids=[1]
```

**El criterio H1, contra los números:**

1. Los armados del aterrizaje son un `arm` seguido de un `none` por la **regla 4** (`topIsOurs`) con el
   **mismo `id`** (1 y 1): la MISMA instancia, desmontada y re-montada, no un remontaje real (que traería
   otro `id`).
2. Entre ese `arm` y el `popstate` hay **un** `back` (+676 ms), y su pila pasa por la limpieza de efectos
   pasivos de React (`commitHookEffectListUnmount`, `disconnectPassiveEffect`,
   `recursivelyTraverseDisconnectPassiveEffects`) desde el efecto del desmontaje de `usePanelBranch` —
   **no** por la sonda—; y la base de la pila nombra el doble montaje de desarrollo
   (`recursivelyTraverseAndDoubleInvokeEffectsInDEV`, `commitDoubleInvokeEffectsInDEV`). Esto descarta
   la otra lectura posible de `disconnectPassiveEffect` (ocultar un árbol).
3. Un `retroceso` `hint` con `holding=true` y el mismo `id` (+744 ms).

**El criterio H2, contra los números:** el único `replaceState` entre el empuje del sentinel (+671) y el
`popstate` (+710) es el de +707 ms, y **conserva** `#salir` (`urlArg=/dashboard#salir`). El de +739 ms
llega **después** del `popstate`: es la reacción del router a ese `popstate`, no su causa. El `popstate`
queda atribuido, con su pila, al `back` del desmontaje. **H2 no se cumple.** El hash no lo pisa un
reemplazo: se va porque el navegador retrocedió a la entrada de abajo (`/dashboard`, sin hash).

**El contraste en la MISMA corrida (la hidratación):** `R-1.3-sin-toque`, la entrada directa, da
`firma_doble_montaje: popstates_sin_gesto=0 retrocesos_sin_gesto=0 (acciones=[]) armados_al_entrar=1
(acciones=[pendiente]) ids=[1]` — un solo armado, como en el `03-12`.

**⚠ LA PRECISIÓN DE ALCANCE del *descartado* de `(a)`-`(c)`:** el `03-12` midió `armados_al_entrar=1` y
`popstates_sin_gesto=0` con el modo estricto activo y concluyó *el doble montaje queda DESCARTADO*. Eso
**vale para la hidratación** —la entrada directa y la recarga, todos los recorridos que midieron el `03-12`
y el `03-13`— y **NO cubre el montaje en el cliente**. Lo explica la lectura de React 19.2.4 en desarrollo
(`node_modules/react-dom/cjs/react-dom-client.development.js`): el doble montaje sólo recorre las fibras
con la bandera `PlacementDEV`, que pone `placeSingleChild` con el reconciliador que rastrea efectos
(L6216-6220; el recorrido en L18653-18716); una hidratación no la pone, el montaje del layout
`(dashboard)` después de `router.push` sí. Y aun en el montaje en el cliente, la limpieza del desmontaje
**sólo** retrocede si había un sentinel vivo: sin activación (el armado `pendiente` de siempre en el
servidor de desarrollo, donde el login más la compilación tardaban más que la ventana) no había nada que
consumir. Por eso ninguna sonda lo vio.

**Una observación lateral, sin consecuencia para `G3-4`:** el `router.push('/dashboard')` seguido de
`router.refresh()` se commitea como un **reemplazo** de la entrada de `/login` (+629 ms), no como un
empuje: la pila queda `[(afuera), /dashboard, …]` sin `/login`. No es la causa (no hay `popstate` ahí) y
no se toca: es el login, fuera de la rama H1.

**Las reglas de PARAR, aplicadas:** P-1 no (armó al primer intento); P-2 no (el aviso y el hash se
reproducen enteros); P-3 no (el veredicto encaja y ninguna regla bloqueada resulta mal: `panelExitArmAction`
devolvió `arm` y después `none` por la regla 4, y `panelExitPopAction` `hint`, que es lo correcto **para
los hechos que recibieron** — lo que estaba mal es que la limpieza retrocediera en un remontaje); P-4 no
(el `id` y la pila coinciden: no hace falta mover `reactStrictMode`).

veredicto: H1

**La rama del arreglo que sale de acá:** el consumo del sentinel en la limpieza del desmontaje se difiere
a un microtask y se decide con una función pura nueva (`panelExitUnmountAction({ sigueMontada,
nuestroArriba })`), leyendo en ese instante si la instancia sigue montada y si nuestra entrada está
arriba. React desconecta y reconecta en la misma llamada síncrona, así que el microtask corre después
del remontaje — y eso se MIDE con un registro `desmontaje` del canal, no se supone.

### El cierre (plan 03-14)

**El arreglo** (commit `feat(03-14)`, `lib/panel-branch.ts`): `panelExitUnmountAction` pura (`keep` si la
instancia sigue montada; `consume` sólo con la instancia desmontada de verdad y nuestra entrada arriba;
si no, `keep`), la referencia `montadaRef`, y la limpieza del desmontaje que agenda **un**
`queueMicrotask` que lee en ese instante `history.state`, la marca y `montadaRef`, decide, graba un
registro `desmontaje` y retrocede sólo con `consume`. Las reglas bloqueadas, intactas por recorte: 7
`none` / 4 `ignore`, `panelNavMode` 6/5, `panelBranchPlan` 6/2, `branchCarryMark` 4, `history.back()` en
2, un `pushState`, cero tiempo, cero ancho. El login no se tocó.

**La sonda de la app después del arreglo** (corrida completa del 2026-10-29 18:18-18:24, rc 0):
**12/12 en `OK`** —los once de antes más `R-login-con-activacion`—. El aterrizaje, con el tiempo
relativo al click:

```text
intento 1: ms del click al primer armado=1133 acciones=[arm,none] ids=[1,1] · VALE (armado con empuje)
armado     t=+1133ms id=1 accion=arm  regla=ninguna-ARMA          vivo_despues=true
armado     t=+1138ms id=1 accion=none regla=regla-4-topIsOurs(E-6) vivo_despues=true
desmontaje t=+1140ms id=1 accion=keep sigue_montada=true nuestro_arriba=true vivo_despues=true
llegada_con_activacion=si · popstates_al_aterrizar=0 · aviso_al_aterrizar=no · hash_al_aterrizar=#salir
atras_tras_un_toque_absorbido=si · accion_del_desmontaje=keep · desmontaje_despues_del_remontaje=si
```

**El orden medido del registro `desmontaje`:** llega **después** del `armado` `none` del remontaje (+1140
contra +1138 ms) y con `sigue_montada=true`: el microtask corre después de que React reconecta, como
decía la lectura. **P-5 no aplica.** Ningún `back` en el aterrizaje, ningún `popstate`. Una corrida
aislada del mismo recorrido antes de la completa dio lo mismo (3414 ms del click al armado, justo después
de la recarga en caliente del `next dev` del dueño, igual dentro de la ventana).

**La sonda estática** (`panel-back-stack.mjs`, sin tocar): 18/18, rc 0. **La suite completa**: 110
archivos, 1994 pasados + 4 expected-fail + 1 salteado (base 1984 + los 10 casos nuevos), 0 fallados.

**Lo que sigue abierto:** todo esto es Chrome de escritorio. Que el teléfono aterrice igual es el
recorrido **1.6** de la ronda 3, que corre el dueño. ⚠ Y una precisión de alcance: el doble montaje es
**sólo de desarrollo**. En producción React no lo hace, así que el defecto era del entorno donde el dueño
prueba con el teléfono (su `next dev`); el arreglo es correcto en los dos (en producción la limpieza
sólo corre en un desmontaje real, y ahí decide igual que antes).

## (h) Los gaps del code review, medidos (plan 03-15, 2026-10-30)

**Qué se midió.** Los cuatro gaps del code review de la fase (`03-REVIEW.md`: CR-01 → `G3-5`, CR-02 →
`G3-6`, WR-02 → `G3-7`, WR-04 → `G3-8`) salen de LEER el código; acá se miden en la app real con once
recorridos nuevos de la sonda (`.planning/debug/probes/panel-exit-en-la-app.mjs`), cada uno con su control
o su guarda de llegada. Mismo entorno que `(g)`: el `next dev` del dueño en el puerto 80 (pid 13260),
**modo estricto ACTIVO** (`reactStrictMode` ausente, huella `8ceb99ae…`), Chrome 155.0.8059.86 headless,
gesto `interfaz` (`chrome.tabs.goBack`), node v24.15.0. Los instrumentos nuevos: `sonda-tecla` (cada
keydown/keyup en la burbuja de window, con `isActive`), `sonda-router` (envuelve
`window.next.router.push`/`.replace` con su pila), la bandera `__forjoSondaDescartaSentinelDeCambios` en
`SCRIPT_DE_LA_HISTORIA` (la precondición FORZADA de `G3-6`, apagada por omisión) y la aceptación de los
diálogos `beforeunload` del editor de `/web`.

**La corrida que vale** es la del 2026-10-30 01:50-01:52 (hora local, unos 2 min sin espera del turno), los once en una invocación por el
turno: los once reportan, los dos controles de escritorio en `OK`, el login afirmado, cero fallos del
instrumento. **Dos corridas anteriores pararon en P-1 y se arregló el INSTRUMENTO, nunca un `esperado`:**
(1) `DOMStorage.setDOMStorageItem` tiraba *«Frame not found for the given storage id»* con la página de
afuera (`data:`) de turno → el `localStorage` del origen se prepara ahora parado en `public/file.svg`; (2)
en `R-G3-8-rebote` el login no salía de `/login` a 390 px (el formulario mobile vive en una hoja) → el
envío va con el ancho de escritorio por omisión, como `loguearse` y `R-login-con-activacion`. Los
recorridos que alcanzaron a correr en esas dos corridas dieron **las mismas líneas** que la que vale (y una corrida suelta de `R-G3-8-rebote`, para validar el segundo arreglo, dio `OK` con los mismos números).

**Los doce de antes, con la sonda modificada** (los instrumentos nuevos no rompen nada), en una segunda
invocación por el turno terminada a las 01:57: **12/12 en `OK`**, rc 0, cero `FALLA`, cero fallos del
instrumento (`C-activacion`, `R-1.3-sin-toque`, `R-1.3-con-toque`, `R-1.3-recarga-logica`,
`R-1.3-recarga-gesto`, `R-1.1`, `R-3.1`, `R-1.4`, `R-barra-con-aviso`, `R-barra-pendiente`, `R-lateral`,
`R-login-con-activacion`).

### `G3-5` (CR-01) — el atrás de teclado en escritorio

```text
OK  R-G3-5-escritorio-control · G3-5, el control en ESCRITORIO: un toque arma, el atras de la interfaz avisa y el segundo sale
      hash_armado: medido="#salir"
      aviso_tras_el_atras: medido="si"
      segundo_atras_ruta: medido="(afuera)"
FALLA R-G3-5-teclado-flecha-primero · G3-5 (CR-01): el atras de TECLADO compuesto en escritorio, soltando la flecha antes que Alt: avisa, el aviso se queda y el segundo sale
      aviso_tras_el_atras: medido="si"
      toques_que_bajan_el_aviso: medido=1  <-- NO COINCIDE
      aviso_tras_soltar: medido="no"  <-- NO COINCIDE
      hash_tras_soltar: medido="#salir"  <-- NO COINCIDE
      segundo_atras_ruta: medido="(afuera)"
        diag sonda-tecla keydown key=Alt code=AltLeft altKey=true isActive=true url=/dashboard#salir
        diag sonda-tecla keydown key=ArrowLeft code=ArrowLeft altKey=true isActive=true url=/dashboard#salir
        diag sonda-popstate url=/dashboard
        diag retroceso id=1 accion=hint regla=ninguna-AVISA holding=true
        diag sonda-tecla keyup key=ArrowLeft code=ArrowLeft altKey=true isActive=true url=/dashboard
        diag toque     id=1 url=/dashboard accion=drop-and-arm hechos={"activacion":true,"atRoot":true,"gestoTomado":false,"hintOpen":true}
        diag armado    id=1 url=/dashboard#salir accion=arm regla=ninguna-ARMA vivo_despues=true
        diag sonda-tecla keyup key=Alt code=AltLeft altKey=false isActive=true url=/dashboard#salir
        diag toque     id=1 url=/dashboard#salir accion=arm hechos={"activacion":true,"hintOpen":false}
        diag armado    id=1 url=/dashboard#salir accion=none regla=regla-4-topIsOurs(E-6)
      el segundo atras: hash_antes=#salir es_nuestro=si entradas_salteadas=1 ruta_despues=(afuera) aviso_visible=no absorbido=no
        pila antes: [(afuera), /dashboard, /dashboard#salir] actual=2 · pila despues: actual=0
FALLA R-G3-5-teclado-alt-primero · G3-5 (CR-01): el atras de TECLADO compuesto en escritorio, soltando Alt antes que la flecha: avisa, el aviso se queda y el segundo sale
      aviso_tras_el_atras: medido="si"
      toques_que_bajan_el_aviso: medido=1  <-- NO COINCIDE
      aviso_tras_soltar: medido="no"  <-- NO COINCIDE
      hash_tras_soltar: medido="#salir"  <-- NO COINCIDE
      segundo_atras_ruta: medido="(afuera)"
        (el mismo orden con los keyup invertidos: keyup Alt -> toque drop-and-arm -> armado arm; keyup ArrowLeft
         altKey=false -> toque arm -> armado none regla-4; el segundo atras: entradas_salteadas=1 ruta_despues=(afuera))
OK  R-G3-5-tecla-tras-el-aviso · G3-5, el camino 1 con teclado: con el aviso visible, una letra apretada y soltada lo baja y re-arma; el atras siguiente avisa
      aviso_tras_el_atras: medido="si"
      accion_de_la_tecla: medido="drop-and-arm"
      hash_tras_la_tecla: medido="#salir"
      atras_siguiente_absorbido: medido="si"
        (keydown KeyA y keyup KeyA con isActive=true, los DOS sobre /dashboard despues del popstate; el atras
         siguiente: entradas_salteadas=0 ruta_despues=/dashboard aviso_visible=si)
```

**La guarda, cumplida en los dos órdenes:** dos `sonda-tecla` keydown antes del `sonda-popstate` y dos
keyup después. La activación de cada keyup: `isActive=true` en los cuatro. La acción de cada toque: el
primer keyup `drop-and-arm` (baja el aviso y re-empuja `#salir` con activación), el segundo `arm` (ya
armado: `none` por la regla 4).

**La firma de CR-01, juzgada parte por parte:** (a) un `toque` posterior al `popstate` con `drop-and-arm`
y la activación en verdadero — **SÍ**, en los dos; (b) seguido de un `armado` `arm` — **SÍ**; (c) **el
segundo atrás que no sale — NO**: en los dos órdenes el segundo atrás **sale** del panel
(`segundo_atras_ruta="(afuera)"`) y lo hace **salteando una entrada** (`entradas_salteadas=1`: desde
`/dashboard#salir` aterriza en la página de afuera, pasando por arriba de `/dashboard`). La firma está
incompleta en los dos recorridos que fallan, así que no encaja en la regla (1); tampoco en la (2) (los dos
dan `FALLA`).

**Lo que la medición sí muestra, dicho como hallazgo y no como veredicto:** el defecto medido NO es el
«botón muerto» que describe CR-01 (el dueño nunca sale), sino **otro**: al soltar las teclas el aviso
**se va** y el hash vuelve, y el segundo atrás sale **sin aviso visible** porque el navegador saltea
`/dashboard`. El contraste está en la misma corrida: con la tecla `KeyA` apretada **después** del
`popstate` (`R-G3-5-tecla-tras-el-aviso`) el `#salir` re-empujado **sí** absorbe (`entradas_salteadas=0`).
La diferencia entre los dos es **dónde** cayó el keydown: en el atajo de teclado los dos keydown caen
sobre la entrada `#salir` ANTES del retroceso, y sobre `/dashboard` —la entrada a la que el retroceso
volvió— no llega ningún evento que dé activación (un keyup no la da) aunque `isActive` siga en verdadero.
Leído contra la intervención de historial de Chrome (memoria `intervencion-historial-chrome-y-gestos-cdp`),
encaja con que Chrome marca salteable la entrada desde la que se empuja cuando no recibió una activación
**desde que quedó como actual**, que no es lo mismo que la activación transitoria que lee
`panelExitActivationNow`. Eso es una pregunta NUEVA sobre la premisa del camino 1 (la calibración
`C-activacion` midió un click y un empuje en la misma entrada, nunca una activación anterior a un
retroceso de la misma página), y no tiene firma escrita: por eso es `otro` y no se arregla en este plan.

veredicto G3-5: otro

### `G3-6` (CR-02) — «Salir sin guardar» sin sentinel de cambios hacia otra sección

```text
OK  R-G3-6-con-sentinel · G3-6 (CR-02): «Salir sin guardar» desde /web (marca /mas) hacia Turnos con el sentinel de cambios: aterriza en Turnos y el atras vuelve a Inicio
      dialogo_visible: medido="si"
      ruta_final: medido="/appointments"
      ruta_tras_un_atras: medido="/dashboard"
      precondicion_en_el_click: medido="con-sentinel" (arriba={"frjDirty":true,"frjUnder":null,"url":"/web#sin-guardar"})
OK  R-G3-6-camino-real · G3-6 (CR-02): el atras desde /web sucia, «Seguir editando», y despues «Salir sin guardar» hacia Turnos: aterriza en Turnos y el atras vuelve a Inicio
      dialogo_visible: medido="si"
      ruta_final: medido="/appointments"
      ruta_tras_un_atras: medido="/dashboard"
      precondicion_en_el_click: medido="con-sentinel" (arriba={"frjDirty":true,"frjUnder":null,"url":"/web#sin-guardar"})
OK  R-G3-6-sin-sentinel · G3-6 (CR-02), la precondicion FORZADA: «Salir sin guardar» desde /web sucia SIN el sentinel de cambios hacia Turnos: ¿aterriza en Turnos?
      dialogo_visible: medido="si"
      ruta_final: medido="/appointments"
      atras_del_colapso: medido=1
      atras_del_sentinel_de_cambios: medido=0
      replace_del_router: medido="n=1 desde_un_commit=no"
      escritura_de_appointments: medido="si"
      precondicion_en_el_click: medido="sin-sentinel" (arriba={"frjDirty":false,"frjUnder":"/mas","url":"/web#sin-guardar"})
      el envoltorio del router: envuelto · llamadas con /appointments despues del click=1
        diag sonda-historia metodo=back url=/web#sin-guardar
             funciones: consumeOwnedBranchEntry <- runBranchNavigation <- UnsavedChangesProvider.useCallback[ejecutarPlanDeRama] <- confirmLeave <- onClick
        diag sonda-popstate url=/mas estado={"frjUnder":"/dashboard"}
        diag sonda-historia metodo=replaceState url=/mas urlArg=/mas            (el router, reaccionando al popstate)
        diag sonda-router   metodo=replace href=/appointments url=/mas
             funciones: UnsavedChangesProvider.useCallback[navegarYa] <- segundoPaso
        diag sonda-historia metodo=replaceState url=/mas urlArg=/appointments   (desde commitHookEffectListMount: el replace SI escribe)
        diag sonda-historia metodo=replaceState url=/appointments urlArg=(vacio) (writePanelUnder <- applyBranchMarkRequest: la marca)
      al final: url=/appointments pila=[(afuera), /dashboard, /appointments, /web#sin-guardar] actual=2
```

**Las precondiciones:** los dos caminos reales llegan al click **`con-sentinel`** (el atrás de
`R-G3-6-camino-real` lo absorbe el sentinel de cambios, «Seguir editando» lo re-empuja desde adentro del
`popstate`, y en el click sigue arriba). Ningún camino real medido produjo el sentinel ausente.

**La firma de CR-02 en el forzado, juzgada:** (a) el `replace` del router a `/appointments` llamado fuera
de un commit de React — **SÍ** (`desde_un_commit=no`: la pila es `navegarYa <- segundoPaso`, adentro del
`popstate` del colapso); (b) ninguna escritura de la historia con `/appointments` después — **NO**: hay
una (`replaceState urlArg=/appointments`, desde un commit del router); (c) cero `back` del módulo del
sentinel de cambios — sí (`0`). El envoltorio del router **no** está ciego (vio la llamada). Con la parte
(b) en contra, la firma **no** se reproduce: el `replace` pedido desde adentro del `popstate` del colapso
**sí escribe** y el dueño aterriza en Turnos. La lección 3 del encabezado de `lib/panel-branch.ts` (y el
comentario del guard) siguen valiendo para el caso donde se midieron; para ESTE camino —el `popstate` del
colapso de la rama, con el router en `/mas`— la medición dice que no se pierde.

**Las reglas, en orden:** (1) no — ningún camino real `con-sentinel` en `FALLA`; (2), (3), (4) no — ningún
camino real llegó `sin-sentinel`; (5) no — el forzado da `OK`; **(6) sí** — los dos caminos reales
`con-sentinel` en `OK` y el forzado en `OK` (el `replace` desde el `popstate` del colapso sí escribe).

veredicto G3-6: descartado

### `G3-7` (WR-02) — cerrar el diálogo del plan de Inicio abierto antes de armar

```text
FALLA R-G3-7-autoabierto-x · G3-7 (WR-02): el dialogo del plan AUTO-ABIERTO al entrar (CTA de la landing), cerrado con la X: el sentinel queda armado y el atras avisa
      dialogo_abierto: medido="si"
      hash_tras_cerrar: medido=""  <-- NO COINCIDE
      absorbido: medido="no"  <-- NO COINCIDE
      aviso_visible: medido="no"  <-- NO COINCIDE
        diag armado    id=1 url=/dashboard accion=pendiente regla=ninguna-ARMA            (al entrar: sin activacion)
        diag sonda-click url=/dashboard#modal defaultPrevented=false isActive=true          (la X)
        diag toque     id=1 url=/dashboard#modal accion=arm hechos={"activacion":true,"atRoot":true,"gestoTomado":false,"hintOpen":false}
        diag armado    id=1 url=/dashboard#modal estado={"frjOverlay":1} accion=none regla=regla-0-foreignOwnsTop
        diag sonda-popstate url=/dashboard                                                  (el back del overlay)
        diag retroceso id=1 url=/dashboard accion=ignore regla=regla-4-holding-false holding=false
        diag armado    id=1 url=/dashboard accion=pendiente regla=ninguna-ARMA            (el reintento sin poder empujar)
      el atras siguiente: ruta_despues=(afuera) aviso_visible=no absorbido=no
FALLA R-G3-7-autoabierto-fondo · G3-7 (WR-02): el dialogo del plan AUTO-ABIERTO al entrar, cerrado tocando el FONDO: el sentinel queda armado y el atras avisa
      dialogo_abierto: medido="si"
      hash_tras_cerrar: medido=""  <-- NO COINCIDE
      absorbido: medido="no"  <-- NO COINCIDE
      aviso_visible: medido="no"  <-- NO COINCIDE
        (la misma secuencia: toque arm -> armado none regla-0-foreignOwnsTop -> retroceso ignore -> armado pendiente)
FALLA R-G3-7-primer-toque · G3-7 (WR-02): el dialogo del plan abierto por el PRIMER toque en Inicio (el boton del banner), cerrado con la X: el atras avisa
      dialogo_abierto: medido="si"
      hash_tras_cerrar: medido=""  <-- NO COINCIDE
      absorbido: medido="no"  <-- NO COINCIDE
      aviso_visible: medido="no"  <-- NO COINCIDE
        (el primer toque, en «Activar plan»: sonda-click isActive=true -> toque arm -> armado none regla-0-foreignOwnsTop,
         con url=/dashboard#modal: el overlay ya habia empujado su entrada antes de que corriera el oyente del toque;
         despues el cierre con la X da la misma secuencia de arriba)
```

**La firma de WR-02, juzgada en los tres:** el `armado` del toque que cierra declina por la **regla 0**
(`foreignOwnsTop`, con `frjOverlay` arriba) — sí; el `retroceso` del cierre es `ignore` — sí (por la regla 4,
`holding=false`); el `armado` siguiente queda `pendiente` — sí; y el atrás sale sin aviso — sí
(`ruta_despues=(afuera)`, `aviso_visible=no`). Los tres `FALLA` traen la firma entera y **ninguno** falla
sin ella: regla (1). Un dato que el code review no tenía: en `R-G3-7-primer-toque` el **primer** toque
—el que abre el diálogo— ya declina por la regla 0, porque el empuje del overlay ocurre antes de que el
oyente del toque del hook corra (la actualización de un evento discreto se commitea al final del
despacho de React, que es anterior a la burbuja de `window`).

veredicto G3-7: confirmado

### `G3-8` (WR-04) — el estado de módulo que sobrevive a salir del panel

```text
OK  R-G3-8-rebote · G3-8 (WR-04): la sesion vencida en medio de un replace de la barra rebota a /login; al volver, ninguna marca miente sobre la entrada de abajo
      ruta_al_volver: medido="/dashboard"
      marca_falsa_al_volver: medido="no"
      en Clientes: url=/clients marca=/dashboard pila=[(afuera), /dashboard, /clients] actual=2
      documento_nuevo_en_el_rebote: medido="no"
        diag sonda-click url=/clients defaultPrevented=true isActive=true      (Turnos en la barra, con la sesion borrada)
        diag toque     id=1 url=/clients accion=none hechos={"atRoot":false,"gestoTomado":true}
      al volver: url=/dashboard#salir marca=null debajo_real=/dashboard miente=no pila=[(afuera), /dashboard, /dashboard, /dashboard#salir] actual=3
      tras tocar Turnos: url=/appointments marca=/dashboard debajo_real=/dashboard miente=no pila=[(afuera), /dashboard, /dashboard, /appointments] actual=3
```

**Los números que lo deciden:** el rebote **no** recargó el documento (`documento_nuevo_en_el_rebote=no`:
la redirección a `/login` fue una navegación blanda, así que el estado de módulo SÍ sobrevivió, que es la
precondición de WR-04); y el login **siempre** aterriza en `/dashboard` (`al volver: url=/dashboard#salir`),
así que el primer commit del panel al volver corre `applyBranchMarkRequest('/dashboard')`, que descarta
cualquier pedido vivo (el destino pedido era `/appointments`, y la función lo pone en `null` en toda
corrida). Ninguna de las dos fotos tiene una marca que mienta: al volver no hay marca, y tras tocar Turnos
la marca dice `/dashboard` con `/dashboard` debajo. Regla (2).

veredicto G3-8: descartado

### Lo que esta medición NO cierra

- **El acelerador real del navegador.** La combinación de teclado por CDP no navega: el atrás de los
  recorridos de `G3-5` es el de la interfaz (`chrome.tabs.goBack`) con el orden de los eventos de teclado
  COMPUESTO alrededor. Que el atajo real (Alt+flecha izquierda en Windows) produzca el mismo orden y la
  misma marca de entrada salteable es el recorrido 4.3 del dueño.
- **macOS:** Cmd+[ y Cmd+flecha izquierda (esta máquina es Windows).
- **El botón lateral «atrás» del mouse** (dispara `auxclick`, no `click`; no se midió).
- **Android y Safari de iOS** (A11): todo esto es Chrome de escritorio headless.
- **`G3-8`:** que el pedido de marca estuviera VIVO en el instante del rebote no lo muestra ningún
  registro (el canal no graba `marcaPedida`); el descarte sale de la ruta de aterrizaje del login, medida,
  y de la lectura de `applyBranchMarkRequest`. Un login que devolviera a la ruta pedida —el caso que
  WR-04 imagina— no existe hoy en la app.
- **`G3-6`:** el sentinel de cambios ausente con la pantalla sucia sólo se produjo FORZADO; ningún camino
  real medido lo produjo (ni el atrás con «Seguir editando»). Los caminos que el comentario del guard
  enumera (el `replace` del sidebar, el `replaceState` crudo de Agenda) no se recorrieron.

### Las reglas de PARAR, aplicadas

- **P-1** aplicó dos veces al instrumento (arriba) y se cerró arreglando la sonda; en la corrida que vale,
  todas las guardas y los dos controles pasaron.
- **P-2 no:** ninguna regla bloqueada resultó mal para los hechos que recibió (`panelExitTouchAction` dio
  `drop-and-arm` con el aviso abierto y la activación en verdadero, que es su regla; `panelExitArmAction`
  declinó por la regla 0 con el overlay arriba, que es la suya). Lo que la medición de `G3-5` pone en
  duda es el **hecho** que se le pasa (`panelExitActivationNow`) en una secuencia que la calibración no
  cubrió, no una regla.
- **P-3 no evaluado:** `G3-7` es el único `confirmado` y su arreglo propuesto vive en `lib/panel-branch.ts`.
- **⚠ P-4 SÍ: `veredicto G3-5: otro` ⇒ el plan 03-15 termina acá**, con esta sección escrita y el
  reporte. Ningún arreglo de gap se escribe en este plan —tampoco el de `G3-7`, confirmado—: una medición
  que no encaja en ninguna firma escrita es una pregunta nueva, y la contesta el dueño al re-planificar. El
  WR-05 (el canal sólo en desarrollo) ya quedó entregado en el task 1 (commits `ddf96f9` RED y `68cf232`
  GREEN) y no lo toca esta parada.

### El cierre (plan 03-16)

El dueño contestó las dos preguntas de la parada el 2026-10-30 (`03-UAT-2.md` § «Los veredictos del 03-15 —
decisión del dueño»): **`G3-5` → que el aviso se quede**; **`G3-7` → arreglarlo**. Los arreglos salen de esa
decisión, no de un veredicto nuevo: las cuatro líneas de veredicto de arriba quedan como están (`G3-5` sigue
en `otro`).

**`G3-5` — el arreglo** (`lib/panel-branch.ts`): `panelExitKeyStep` (pura) cuenta un keyup como toque sólo
si su keydown llegó DESPUÉS del último `popstate` —el retroceso vacía el conjunto, la repetición no suma—;
`panelExitKeyId` (pura) es la identidad de la tecla (`code`, o `key` si viene vacío) en un solo lugar; y el
cableado: `teclasRef`, un oyente `keydown` en captura en el mismo efecto que el retroceso y el toque, el paso
del `popstate` como primera sentencia de `alRetroceder` (antes del candado del dominio), y en `alTocar` el
paso del keyup antes del filtro de Enter y `if (!paso.esToque) return` antes del canal y de la decisión. Lo
bloqueado, intacto por recorte (7 `none` / 4 `ignore`, `panelNavMode` 6/5, `panelBranchPlan` 6/2,
`branchCarryMark` 4, `panelExitTouchAction` 6, desmontaje 1/2, `history.back()` 2, un empuje, el canal en
5, cuatro armados, cero tiempo, cero ancho).

**El RED** (`npx vitest run --project pure` sobre los tres archivos): rc 1, **16 fallados / 400 pasados
(416)** — los nueve de `panelExitKeyStep`, los tres de `panelExitKeyId` y las cuatro auditorías del cableado.
GREEN: 416/416. Commits: `1ac48d8` (RED, `test(03-16)`), `d9e7962` (GREEN, `feat(03-16)`).

**El tracer, de punta a punta** (2026-10-30, 07:51-07:57 hora local, una invocación por el turno contra el
`next dev` del dueño, puerto 80; editar el módulo le disparó una recarga en caliente, sin reiniciarlo):
rc 0, **10/10 en `OK`**, cero fallos del instrumento.

```text
OK  R-1.1 · el recorrido del dueno, textual: entrar, tocar Turnos, Clientes y Agenda, tocar Inicio; avisa y despues sale
OK  R-3.1 · el aviso que SE QUEDA: no vence a los 2,5 s ni a los 10 s, con el aviso el atras sale; un toque lo baja y re-arma
OK  R-1.4 · llegar a Inicio CON EL ATRAS: sin hash, armado pendiente y el atras siguiente sale (la consecuencia declarada); con un toque, avisa
OK  R-barra-con-aviso · tocar Clientes en la barra con el aviso VISIBLE: el aviso se va y la pila queda sin #salir enterrado
OK  R-barra-pendiente · tocar Clientes en la barra recien entrado directo (armado pendiente): la sesion abre sin armar y la pila queda sin #salir
OK  R-lateral · el hallazgo lateral del plan 03-12: tocar Clientes parado en Inicio ARMADO; el consumo se ignora y el armado queda pendiente, sin #salir enterrado
OK  R-G3-5-escritorio-control · G3-5, el control en ESCRITORIO: un toque arma, el atras de la interfaz avisa y el segundo sale
OK  R-G3-5-teclado-flecha-primero · G3-5 (CR-01): el atras de TECLADO compuesto en escritorio, soltando la flecha antes que Alt: avisa, el aviso se queda y el segundo sale
      toques_que_bajan_el_aviso: medido=0
      aviso_tras_soltar: medido="si"
      hash_tras_soltar: medido=""
        diag sonda-tecla doc=9b5mep keyup key=ArrowLeft code=ArrowLeft repeat=false altKey=true metaKey=false isActive=true url=/dashboard
        diag sonda-tecla doc=9b5mep keyup key=Alt code=AltLeft repeat=false altKey=false metaKey=false isActive=true url=/dashboard
        (ningun registro toque ni armado despues de los dos keyup: en (h) cada uno traia toque drop-and-arm / arm)
      tras soltar y 2500 ms quietos: url=/dashboard aviso=visible
        tupla: hash_antes=(ninguno) es_nuestro=no estado_antes={} largo_antes=3 largo_despues=3 entradas_salteadas=0 ruta_despues=(afuera) documento_nuevo=no aviso_visible=no absorbido=no
OK  R-G3-5-teclado-alt-primero · G3-5 (CR-01): el atras de TECLADO compuesto en escritorio, soltando Alt antes que la flecha: avisa, el aviso se queda y el segundo sale
      toques_que_bajan_el_aviso: medido=0
      aviso_tras_soltar: medido="si"
      hash_tras_soltar: medido=""
      tras soltar y 2500 ms quietos: url=/dashboard aviso=visible
        tupla: hash_antes=(ninguno) es_nuestro=no estado_antes={} largo_antes=3 largo_despues=3 entradas_salteadas=0 ruta_despues=(afuera) documento_nuevo=no aviso_visible=no absorbido=no
OK  R-G3-5-tecla-tras-el-aviso · G3-5, el camino 1 con teclado: con el aviso visible, una letra apretada y soltada lo baja y re-arma; el atras siguiente avisa
      accion_de_la_tecla: medido="drop-and-arm"
      hash_tras_la_tecla: medido="#salir"
      atras_siguiente_absorbido: medido="si"
        (keydown y keyup KeyA sobre /dashboard despues del popstate -> toque drop-and-arm -> armado arm; el atras
         siguiente: entradas_salteadas=0 ruta_despues=/dashboard aviso_visible=si)
```

**El hecho de `(h)`, re-chequeado: el segundo atrás sale DESPUÉS de que el aviso estuvo a la vista.**

| Recorrido de teclado | `aviso_tras_soltar` | `hash_antes` del segundo atrás | `entradas_salteadas` |
|---|---|---|---|
| antes (`(h)`, 03-15) | `no` | `#salir` | 1 (Chrome salteó Inicio) |
| después (03-16), los dos órdenes | `si` | `(ninguno)` | 0 (de Inicio a la página de afuera) |

Los dos controles (`R-G3-5-escritorio-control`, `R-G3-5-tecla-tras-el-aviso`) en `OK`: P-6 no aplica. P-1 y
P-5 tampoco. Lo que esta medición no cierra de `G3-5` sigue igual que arriba: el acelerador real del
navegador, macOS y el botón lateral del mouse (fuera por construcción: dispara `auxclick`, y el módulo
escucha `click` y `keyup`) son el 4.3 del dueño.

cierre G3-5: arreglado

**`G3-7` — el arreglo** (`lib/panel-branch.ts`): `panelExitForeignRetry` (pura) pide el reintento sólo si el
armado del toque declinó SÓLO por la entrada ajena —el contrafáctico es `panelExitArmAction` sobre los
mismos hechos con `foreignOwnsTop` en falso, sin un segundo dialecto de sus siete reglas—; la referencia
`reintentoTrasAjenaRef` (la escribe el armado, la apaga cada toque antes de decidir, la lee y apaga la rama
`ignore` ANTES de su armado sin empuje) y el estado `reintentoDelArmado`, que la rama `ignore` sube y que
entra en las dependencias del efecto del armado (`[armarSentinel, pathname, reintentoDelArmado]`): el
empuje sale de ese commit con la activación leída ahí, nunca de adentro del `popstate`, sin temporizador.
Los mismos candados que `G3-5`, intactos (el empuje sigue en 1, `armarSentinel({` en 4, `history.back()`
en 2, el canal en 5, cero lecturas de la activación y cero empujes en `alRetroceder`).

**El RED**: rc 1, **12 fallados / 416 pasados (428)** — los ocho de `panelExitForeignRetry` (la regla que pide,
un contrapuesto por regla, el contrafáctico de punta a punta y su contrapuesto con el aviso abierto, la
pureza) y las cuatro auditorías del cableado. GREEN: 428/428. Commits: `2ff59b3` (RED, `test(03-16)`),
`7722984` (GREEN, `feat(03-16)`).

**El tracer** (2026-10-30, 07:59-08:04 hora local, una invocación por el turno contra el mismo `next dev`,
que recargó en caliente): rc 0, **10/10 en `OK`**, `R-lateral` incluido, cero fallos del instrumento, y
**ningún `R-G3-7` con la firma de P-8** (la intervención que el plan declaró como riesgo NO apareció:
`entradas_salteadas=0` en el atrás siguiente de los tres).

```text
OK  R-1.1 · el recorrido del dueno, textual: entrar, tocar Turnos, Clientes y Agenda, tocar Inicio; avisa y despues sale
OK  R-3.1 · el aviso que SE QUEDA: no vence a los 2,5 s ni a los 10 s, con el aviso el atras sale; un toque lo baja y re-arma
OK  R-1.4 · llegar a Inicio CON EL ATRAS: sin hash, armado pendiente y el atras siguiente sale (la consecuencia declarada); con un toque, avisa
OK  R-barra-con-aviso · tocar Clientes en la barra con el aviso VISIBLE: el aviso se va y la pila queda sin #salir enterrado
OK  R-barra-pendiente · tocar Clientes en la barra recien entrado directo (armado pendiente): la sesion abre sin armar y la pila queda sin #salir
OK  R-lateral · el hallazgo lateral del plan 03-12: tocar Clientes parado en Inicio ARMADO; el consumo se ignora y el armado queda pendiente, sin #salir enterrado
      retroceso_del_consumo: medido="ignore"
      armado_tras_el_consumo: medido="pendiente"
        (el toque que el link se lleva: toque none gestoTomado=true -> retroceso ignore -> armado pendiente -> armado none
         regla-2-atRoot en /clients; sin armado arm: la referencia apagada, ningun #salir enterrado)
OK  R-G3-5-tecla-tras-el-aviso · G3-5, el camino 1 con teclado: con el aviso visible, una letra apretada y soltada lo baja y re-arma; el atras siguiente avisa
OK  R-G3-7-autoabierto-x · G3-7 (WR-02): el dialogo del plan AUTO-ABIERTO al entrar (CTA de la landing), cerrado con la X: el sentinel queda armado y el atras avisa
      hash_tras_cerrar: medido="#salir"
      absorbido: medido="si"
      aviso_visible: medido="si"
        diag toque     doc=af6mxx id=1 url=/dashboard#modal accion=arm hechos={"participates":true,"activacion":true,"atRoot":true,"gestoTomado":false,"hintOpen":false} vivo_antes=false vivo_despues=false
        diag armado    doc=af6mxx id=1 duena=1 vivas=1 url=/dashboard#modal estado={"claves":["__NA","__PRIVATE_NEXTJS_INTERNALS_TREE","frjOverlay"],"frjOverlay":1} accion=none regla=regla-0-foreignOwnsTop vivo_antes=false vivo_despues=false
        diag retroceso doc=af6mxx id=1 duena=1 vivas=1 url=/dashboard estado={"claves":["__NA","__PRIVATE_NEXTJS_INTERNALS_TREE"]} accion=ignore regla=regla-4-holding-false holding=false
        diag armado    doc=af6mxx id=1 duena=1 vivas=1 url=/dashboard estado={"claves":["__NA","__PRIVATE_NEXTJS_INTERNALS_TREE"]} accion=pendiente regla=ninguna-ARMA vivo_antes=false vivo_despues=false
        diag armado    doc=af6mxx id=1 duena=1 vivas=1 url=/dashboard#salir estado={"claves":["__NA","__PRIVATE_NEXTJS_INTERNALS_TREE"]} accion=arm regla=ninguna-ARMA vivo_antes=false vivo_despues=true
      tupla: hash_antes=#salir es_nuestro=si estado_antes={"frjExit":1} largo_antes=3 largo_despues=3 entradas_salteadas=0 ruta_despues=/dashboard documento_nuevo=no aviso_visible=si absorbido=si
OK  R-G3-7-autoabierto-fondo · G3-7 (WR-02): el dialogo del plan AUTO-ABIERTO al entrar, cerrado tocando el FONDO: el sentinel queda armado y el atras avisa
      hash_tras_cerrar: medido="#salir"
        (la misma secuencia: toque arm -> armado none regla-0-foreignOwnsTop -> retroceso ignore -> armado pendiente -> armado arm)
      tupla: hash_antes=#salir es_nuestro=si estado_antes={"frjExit":1} largo_antes=3 largo_despues=3 entradas_salteadas=0 ruta_despues=/dashboard documento_nuevo=no aviso_visible=si absorbido=si
OK  R-G3-7-primer-toque · G3-7 (WR-02): el dialogo del plan abierto por el PRIMER toque en Inicio (el boton del banner), cerrado con la X: el atras avisa
      hash_tras_cerrar: medido="#salir"
        (el primer toque, que abre el dialogo, sigue declinando por la regla 0; el cierre con la X da la misma secuencia
         de arriba, terminando en armado arm con url=/dashboard#salir)
      tupla: hash_antes=#salir es_nuestro=si estado_antes={"frjExit":1} largo_antes=3 largo_despues=3 entradas_salteadas=0 ruta_despues=/dashboard documento_nuevo=no aviso_visible=si absorbido=si
```

**El armado del reintento, en los tres:** `retroceso ignore` → `armado pendiente` (el de la rama `ignore`, sin
poder empujar) → `armado arm` (el del efecto, disparado por `reintentoDelArmado`, con `url=/dashboard#salir`
y `vivo_despues=true`). Antes del arreglo (`(h)`) la secuencia terminaba en el `pendiente`, con
`hash_tras_cerrar=""` y el atrás siguiente afuera sin aviso. P-1, P-5, P-6 y P-8 no aplican.

**Lo que esta medición NO cierra de `G3-7`:**

- cerrar el diálogo con el **atrás del teléfono** en vez de la X o el fondo (ningún recorrido lo mide). Por
  lectura: con el diálogo auto-abierto el último armado fue el de la entrada, sin activación, así que la
  referencia está apagada y el armado queda pendiente como antes; con el diálogo abierto por el PRIMER toque,
  ese toque dejó la referencia encendida, y el atrás que cierra pide el reintento: el efecto empuja sólo si la
  activación de aquel toque sigue vigente al leerla (`isActive`), y si no queda pendiente. Sin medir;
- **Android** (el 3.3 y el 1.5 del dueño) y **Safari de iOS**: todo esto es Chrome de escritorio headless;
- que la ausencia de la intervención en este caso (la activación del click llegó ANTES del retroceso del
  overlay, igual que en `G3-5`) sea propia de Chrome: el motivo exacto por el que acá Chrome no salteó
  Inicio y en `(h)` sí no está medido, sólo el resultado.

cierre G3-7: arreglado

**La no-regresión completa, con los dos arreglos puestos** (2026-10-30, hora local; todo por el turno salvo
la suite, `tsc` y `eslint`; el `next dev` del dueño sin reiniciar):

- **Los doce de antes** (08:06-08:11): rc 0, 12/12 en `OK`, cero `FALLA`, cero fallos del instrumento.
- **Los once `R-G3-*`** (08:11-08:13): rc 0, los once reportados, los once en `OK` —los cuatro de `G3-5`, los
  tres de `G3-7` y los de `G3-6` y `G3-8` con lo que midió `(h)`—.
- **La estática** (`panel-back-stack.mjs`, sin tocar desde `993fbc5`): 18/18 `OK`, rc 0. Las líneas
  `esperado` de la sonda de la app, iguales a `993fbc5`.
- **La suite completa** (`npx vitest run`, 08:14:08-08:15:10, adentro de la ventana [01:00, 23:30] de los
  canarios de reloj): **110 archivos, 2030 pasados + 4 expected-fail + 1 salteado**, rc 0 (2002 de base + 16
  de `G3-5` + 12 de `G3-7`). `tsc --noEmit` sin `error TS`; `eslint` sobre lo tocado rc 0; `next.config.ts`
  con la huella `8ceb99aeabb6a8b16cbe0e6d836bf0aa1ae03578`; los intocables y los archivos de `G3-6` sin
  cambios desde `993fbc5`.

```text
OK  C-activacion · la calibracion del navegador sobre /login, antes del login: ¿un empuje con activacion es salteable?
OK  R-1.3-sin-toque · entrada DIRECTA a Inicio, SIN tocar nada, UN atras: el costo declarado de la decision (sale sin aviso)
OK  R-1.3-con-toque · entrada DIRECTA a Inicio, UN toque neutro, UN atras: el hash aparece y el atras avisa y no sale
OK  R-1.3-recarga-logica · la RECARGA del 1.3 por la opcion (A): tres recargas parado en Inicio armado; el armado acredita (none con vivo_despues)
OK  R-1.3-recarga-gesto · la RECARGA del 1.3 con el atras de la interfaz: (i) sin tocar despues de recargar, (ii) con un toque — tres vueltas cada una
OK  R-1.1 · el recorrido del dueno, textual: entrar, tocar Turnos, Clientes y Agenda, tocar Inicio; avisa y despues sale
OK  R-3.1 · el aviso que SE QUEDA: no vence a los 2,5 s ni a los 10 s, con el aviso el atras sale; un toque lo baja y re-arma
OK  R-1.4 · llegar a Inicio CON EL ATRAS: sin hash, armado pendiente y el atras siguiente sale (la consecuencia declarada); con un toque, avisa
OK  R-barra-con-aviso · tocar Clientes en la barra con el aviso VISIBLE: el aviso se va y la pila queda sin #salir enterrado
OK  R-barra-pendiente · tocar Clientes en la barra recien entrado directo (armado pendiente): la sesion abre sin armar y la pila queda sin #salir
OK  R-lateral · el hallazgo lateral del plan 03-12: tocar Clientes parado en Inicio ARMADO; el consumo se ignora y el armado queda pendiente, sin #salir enterrado
OK  R-login-con-activacion · G3-4: loguearse por el formulario con la activacion del click VIGENTE al aterrizar; sin aviso, sin popstate, con #salir, y el atras tras un toque avisa
OK  R-G3-5-escritorio-control · G3-5, el control en ESCRITORIO: un toque arma, el atras de la interfaz avisa y el segundo sale
OK  R-G3-5-teclado-flecha-primero · G3-5 (CR-01): el atras de TECLADO compuesto en escritorio, soltando la flecha antes que Alt: avisa, el aviso se queda y el segundo sale
OK  R-G3-5-teclado-alt-primero · G3-5 (CR-01): el atras de TECLADO compuesto en escritorio, soltando Alt antes que la flecha: avisa, el aviso se queda y el segundo sale
OK  R-G3-5-tecla-tras-el-aviso · G3-5, el camino 1 con teclado: con el aviso visible, una letra apretada y soltada lo baja y re-arma; el atras siguiente avisa
OK  R-G3-6-con-sentinel · G3-6 (CR-02): «Salir sin guardar» desde /web (marca /mas) hacia Turnos con el sentinel de cambios: aterriza en Turnos y el atras vuelve a Inicio
OK  R-G3-6-camino-real · G3-6 (CR-02): el atras desde /web sucia, «Seguir editando», y despues «Salir sin guardar» hacia Turnos: aterriza en Turnos y el atras vuelve a Inicio
OK  R-G3-6-sin-sentinel · G3-6 (CR-02), la precondicion FORZADA: «Salir sin guardar» desde /web sucia SIN el sentinel de cambios hacia Turnos: ¿aterriza en Turnos?
OK  R-G3-7-autoabierto-x · G3-7 (WR-02): el dialogo del plan AUTO-ABIERTO al entrar (CTA de la landing), cerrado con la X: el sentinel queda armado y el atras avisa
OK  R-G3-7-autoabierto-fondo · G3-7 (WR-02): el dialogo del plan AUTO-ABIERTO al entrar, cerrado tocando el FONDO: el sentinel queda armado y el atras avisa
OK  R-G3-7-primer-toque · G3-7 (WR-02): el dialogo del plan abierto por el PRIMER toque en Inicio (el boton del banner), cerrado con la X: el atras avisa
OK  R-G3-8-rebote · G3-8 (WR-04): la sesion vencida en medio de un replace de la barra rebota a /login; al volver, ninguna marca miente sobre la entrada de abajo
```

no-regresion (plan 03-16): los doce de antes 12/12 OK · los once R-G3-* 11/11 OK (G3-5 4/4, G3-6 3/3, G3-7 3/3, G3-8 1/1) · estatica 18/18 · suite 110 archivos 2030 pasados + 4 xfail + 1 salteado, rc 0 (08:14-08:15) · tsc y eslint limpios · next.config.ts 8ceb99ae intacto

## (i) El modal de planes y el cierre con el atrás, medidos (plan 03-17, 2026-11-16)

Los dos hallazgos que el dueño abrió el 2026-11-16 al re-probar el 03-16 **en producción** (`03-UAT-2.md`,
«Re-prueba tras el 03-16»), con su decisión tal cual: **«arreglar el modal y medir»**. `G3-9` se arregla
(medido RED → GREEN); `G3-10` se mide y no se arregla (la lógica del aviso no se toca).

**Qué se midió y con qué.** La sonda de la app (`.planning/debug/probes/panel-exit-en-la-app.mjs`), por el
turno de pantalla, con el gesto `interfaz` (el atrás de la interfaz, `chrome.tabs.goBack`) y el modo estricto
ACTIVO (`next.config.ts` sin `reactStrictMode`, huella `8ceb99ae`). **El servidor:** el `next dev` del dueño
estaba muerto (candado `.next/dev/lock` vencido), así que cada corrida levantó **su propio `next dev` en el
3031** y lo mató al salir (`puerto 3031 libre al salir: si`). **La base:** la pila local de Supabase de
forjo-app levantada con `supabase start` (CLI 2.107.0; sólo `start`, las pilas de `erp-forjo-studio` no se
tocaron); `negocio-prueba` en `trial`, con `has_web_custom` puesto en true con el claim `service_role` en una
transacción y afirmado con el SELECT (`trial|true`). Navegador `Chrome/157.0.8103.52`, node `v24.15.0`.

### `G3-9` — el modal de planes cortado en el celular

**Lo que el instrumento mide** (`medirElModalDelPlan`, commit `a5a95bb`, `test(03-17)`, ANTES del arreglo):
abre el modal desde «Activar plan» a un alto dado y mide el popup, el título y la X contra `[0, innerHeight]`
(la X es tocable si su centro está en la pantalla Y `elementFromPoint` cae en ella), busca el contenedor con
scroll del diálogo, lo scrollea con un **gesto real** (primero el dedo, `synthesizeScrollGesture`; si no se
movió, la rueda; nunca un `scrollTop` asignado), mide el último «Elegir» y el pie, y cierra con la X midiendo
el atrás siguiente.

**El RED** (2026-11-16, 16:23-16:26 hora local, el modal sin tocar): rc 1, los tres `R-G3-7` en `OK`, los tres
`R-G3-9` en `FALLA`. El popup medía **934,3 px** a los tres altos y quedaba corrido hacia arriba: la X y el
título afuera de la pantalla, sin ningún contenedor con scroll.

```text
FALLA R-G3-9-modal-360x640 · G3-9: el modal de planes a 360x640 (alto corto): la X y el titulo a la vista, la lista se scrollea con un gesto real hasta el ultimo Elegir, el pie se ve; cerrado con la X, el atras avisa
      x_visible_al_abrir: medido="no"  <-- NO COINCIDE
      titulo_visible_al_abrir: medido="no"  <-- NO COINCIDE
      dialogo_dentro_de_la_pantalla: medido="no"  <-- NO COINCIDE
      llega_al_ultimo_boton: medido="no"  <-- NO COINCIDE
      pie_visible_al_final: medido="no"  <-- NO COINCIDE
      cierra_con_la_x: medido="no"  <-- NO COINCIDE
      atras_tras_cerrar: medido="no-medido"  <-- NO COINCIDE
      medida al abrir: viewport=360x640 innerHeight=640 dialogo top=-147.1 bottom=787.1 alto=934.3 · x top=-139.1 bottom=-111.1 tocable=no · titulo top=-131.1 bottom=-115.1 · contenedor_con_scroll=ninguno scrollHeight=null clientHeight=null
      tras el gesto de scroll: forma=ninguna scrollTop null -> null · ultimo Elegir top=666.1 bottom=698.1 tocable=no · pie top=739.1 bottom=771.1
FALLA R-G3-9-modal-375x667 · G3-9: el modal de planes a 375x667 (alto corto): la X y el titulo a la vista, la lista se scrollea con un gesto real hasta el ultimo Elegir, el pie se ve; cerrado con la X, el atras avisa
      x_visible_al_abrir: medido="no"  <-- NO COINCIDE
      titulo_visible_al_abrir: medido="no"  <-- NO COINCIDE
      dialogo_dentro_de_la_pantalla: medido="no"  <-- NO COINCIDE
      llega_al_ultimo_boton: medido="no"  <-- NO COINCIDE
      pie_visible_al_final: medido="no"  <-- NO COINCIDE
      cierra_con_la_x: medido="no"  <-- NO COINCIDE
      atras_tras_cerrar: medido="no-medido"  <-- NO COINCIDE
      medida al abrir: viewport=375x667 innerHeight=667 dialogo top=-133.6 bottom=800.6 alto=934.3 · x top=-125.6 bottom=-97.6 tocable=no · titulo top=-117.6 bottom=-101.6 · contenedor_con_scroll=ninguno scrollHeight=null clientHeight=null
      tras el gesto de scroll: forma=ninguna scrollTop null -> null · ultimo Elegir top=679.6 bottom=711.6 tocable=no · pie top=752.6 bottom=784.6
FALLA R-G3-9-modal-390x844 · G3-9, el control: el modal de planes a 390x844 (donde los R-G3-7 tocaron la X): entero, la X tocable, el ultimo Elegir y el pie a la vista; cerrado con la X, el atras avisa
      x_visible_al_abrir: medido="no"  <-- NO COINCIDE
      titulo_visible_al_abrir: medido="no"  <-- NO COINCIDE
      dialogo_dentro_de_la_pantalla: medido="no"  <-- NO COINCIDE
      llega_al_ultimo_boton: medido="si"
      pie_visible_al_final: medido="no"  <-- NO COINCIDE
      cierra_con_la_x: medido="no"  <-- NO COINCIDE
      atras_tras_cerrar: medido="no-medido"  <-- NO COINCIDE
      medida al abrir: viewport=390x844 innerHeight=844 dialogo top=-45.1 bottom=889.1 alto=934.3 · x top=-37.1 bottom=-9.1 tocable=no · titulo top=-29.1 bottom=-13.1 · contenedor_con_scroll=ninguno scrollHeight=null clientHeight=null
      tras el gesto de scroll: forma=ninguna scrollTop null -> null · ultimo Elegir top=768.1 bottom=800.1 tocable=si · pie top=841.1 bottom=873.1
```

**⚠ El control dio `no`, y eso disparó P-1: el «hecho medido» del control resultó falso, no el instrumento.**
El plan esperaba la X tocable a 390x844 antes del arreglo porque los `R-G3-7` «ya tocaron la X» ahí. Se midió
a dónde cae ese click con una copia DESCARTABLE de la sonda (un recorrido de diagnóstico en el scratchpad, no
commiteado, 16:27-16:28): el `clickReal` de los `R-G3-7` sobre la X a 390x844 apunta al centro de la X en
`y=-23,1` (afuera de la pantalla, `elementFromPoint` = `null`), y los cuatro eventos (`pointerdown`,
`mousedown`, `pointerup`, `click`) llegan a **`<html>`**, con `enLaX=false` y `enElPopup=false`; el diálogo se
cierra igual porque es un click **afuera del popup** (el cierre por el fondo). O sea: a 390x844 el modal ya
estaba cortado y los `R-G3-7-*-x` medían, sin saberlo, un cierre por click afuera — que pasa por el mismo
oyente del toque y por eso no invalida `G3-7`. El instrumento nuevo mide bien (nada que arreglarle); P-9 no
aplica (los dos altos cortos dan `x_visible_al_abrir: medido="no"`). Con el arreglo, el click de los `R-G3-7`
cae en la X de verdad (la X queda en `y=24..52` a los tres altos).

**El arreglo** (commit `fa70f25`, `fix(03-17)`, sólo `components/dashboard/plan-modal.tsx`): el patrón de
scroll por caller de «Editar servicio» y «Mover» — `DialogContent` con
`grid max-h-[calc(100svh-2rem)] grid-rows-[auto_minmax(0,1fr)_auto] gap-0 sm:max-w-2xl`, el header con
`pb-3 pr-8`, la lista de planes como la ÚNICA fila que scrollea
(`-mx-4 min-h-0 overflow-y-auto overscroll-contain px-4 py-1`) y el pie con `mt-4`.
`components/ui/dialog.tsx` byte-idéntico.

**El GREEN** (16:28-16:31, misma invocación de seis recorridos): rc 0, **6/6 en `OK`**, el scroll movido por un
gesto real en los tres altos (la **rueda**: el dedo sintético de CDP no movió la lista en este Chrome headless,
sin emulación táctil; la sonda lo registra y cae a la rueda, como el plan prevé) y el atrás después de la X
**avisa** en los tres (`entradas_salteadas=0`).

```text
OK  R-G3-9-modal-360x640 · G3-9: el modal de planes a 360x640 (alto corto): la X y el titulo a la vista, la lista se scrollea con un gesto real hasta el ultimo Elegir, el pie se ve; cerrado con la X, el atras avisa
      medida al abrir: viewport=360x640 innerHeight=640 dialogo top=16 bottom=624 alto=608 · x top=24 bottom=52 tocable=si · titulo top=32 bottom=48 · contenedor_con_scroll=<div.grid> scrollHeight=814 clientHeight=500
      tras el gesto de scroll: forma=rueda scrollTop 0 -> 314 · ultimo Elegir top=507.3 bottom=539.3 tocable=si · pie top=576 bottom=608
      tupla: hash_antes=#salir es_nuestro=si estado_antes={"frjExit":1} largo_antes=3 largo_despues=3 entradas_salteadas=0 ruta_despues=/dashboard documento_nuevo=no aviso_visible=si absorbido=si
OK  R-G3-9-modal-375x667 · G3-9: el modal de planes a 375x667 (alto corto): la X y el titulo a la vista, la lista se scrollea con un gesto real hasta el ultimo Elegir, el pie se ve; cerrado con la X, el atras avisa
      medida al abrir: viewport=375x667 innerHeight=667 dialogo top=16 bottom=651 alto=635 · x top=24 bottom=52 tocable=si · titulo top=32 bottom=48 · contenedor_con_scroll=<div.grid> scrollHeight=814 clientHeight=527
      tras el gesto de scroll: forma=rueda scrollTop 0 -> 287 · ultimo Elegir top=534.3 bottom=566.3 tocable=si · pie top=603 bottom=635
      tupla: hash_antes=#salir es_nuestro=si estado_antes={"frjExit":1} largo_antes=3 largo_despues=3 entradas_salteadas=0 ruta_despues=/dashboard documento_nuevo=no aviso_visible=si absorbido=si
OK  R-G3-9-modal-390x844 · G3-9, el control: el modal de planes a 390x844 (donde los R-G3-7 tocaron la X): entero, la X tocable, el ultimo Elegir y el pie a la vista; cerrado con la X, el atras avisa
      medida al abrir: viewport=390x844 innerHeight=844 dialogo top=16 bottom=828 alto=812 · x top=24 bottom=52 tocable=si · titulo top=32 bottom=48 · contenedor_con_scroll=<div.grid> scrollHeight=814 clientHeight=704
      tras el gesto de scroll: forma=rueda scrollTop 0 -> 110 · ultimo Elegir top=711.3 bottom=743.3 tocable=si · pie top=780 bottom=812
      tupla: hash_antes=#salir es_nuestro=si estado_antes={"frjExit":1} largo_antes=3 largo_despues=3 entradas_salteadas=0 ruta_despues=/dashboard documento_nuevo=no aviso_visible=si absorbido=si
OK  R-G3-7-autoabierto-x · G3-7 (WR-02): el dialogo del plan AUTO-ABIERTO al entrar (CTA de la landing), cerrado con la X: el sentinel queda armado y el atras avisa
OK  R-G3-7-autoabierto-fondo · G3-7 (WR-02): el dialogo del plan AUTO-ABIERTO al entrar, cerrado tocando el FONDO: el sentinel queda armado y el atras avisa
OK  R-G3-7-primer-toque · G3-7 (WR-02): el dialogo del plan abierto por el PRIMER toque en Inicio (el boton del banner), cerrado con la X: el atras avisa
```

| Alto | Diálogo top / bottom (alto) | X tocable | Contenedor con scroll | Último «Elegir» | Pie |
|------|-----------------------------|-----------|-----------------------|-----------------|-----|
| 360x640 | -147,1 / 787,1 (934,3) → **16 / 624 (608)** | no → **sí** | ninguno → **la lista** (814 / 500) | no → **sí** (scrollTop 0 → 314) | no → **sí** |
| 375x667 | -133,6 / 800,6 (934,3) → **16 / 651 (635)** | no → **sí** | ninguno → **la lista** (814 / 527) | no → **sí** (0 → 287) | no → **sí** |
| 390x844 | -45,1 / 889,1 (934,3) → **16 / 828 (812)** | no → **sí** | ninguno → **la lista** (814 / 704) | sí → **sí** (0 → 110) | no → **sí** |

Commits: `a5a95bb` (`test(03-17)`, el instrumento, antes del arreglo) y `fa70f25` (`fix(03-17)`, el modal).

cierre G3-9: arreglado

### Auditoría: los otros diálogos sin alto máximo (sólo lectura)

Cada `<DialogContent` bajo `app/` y `components/` (salvo la primitiva), con la etiqueta de apertura leída
entera; se clasifica por si su `className` trae `max-h-`. Los tres acotados son `plan-modal` (este plan),
«Editar servicio» (`settings-client.tsx:3290`) y «Mover» (`categorias-manager.tsx:1050`). **Ninguno de los de
abajo se tocó:** cuál arreglar (y si con el mismo patrón por caller) lo decide el dueño.

auditoria de dialogos: 33 call sites, 3 con alto maximo en el popup, 30 sin (solo lectura, sin tocar)

- `app/(crm)/admin/pipeline/pipeline-client.tsx:334` — «Nuevo deal», un formulario (CRM, escritorio)
- `app/(dashboard)/abonos/abonos-client.tsx:625`
- `app/(dashboard)/agenda/agenda-client.tsx:1664`
- `app/(dashboard)/agenda/agenda-client.tsx:1685` — «Copiar horario», ya anotado como candidato al patrón en `settings-client.tsx`
- `app/(dashboard)/appointments/appointments-client.tsx:482`
- `app/(dashboard)/appointments/appointments-client.tsx:498`
- `app/(dashboard)/clients/clients-client.tsx:1146`
- `app/(dashboard)/clients/clients-client.tsx:1162` — «Fusionar duplicados», contenido mediano
- `app/(dashboard)/clients/clients-client.tsx:1229` — «Nuevo cliente», un formulario
- `app/(dashboard)/clients/clients-client.tsx:1290` — «Importar clientes», el más largo (~190 líneas de contenido): el candidato más obvio
- `app/(dashboard)/finances/finances-client.tsx:1102` — «Nueva venta / Editar venta», formulario largo (~135 líneas)
- `app/(dashboard)/finances/finances-client.tsx:1242` — «Nuevo egreso», un formulario
- `app/(dashboard)/finances/finances-client.tsx:1283` — «Nuevo gasto fijo», un formulario
- `app/(dashboard)/finances/finances-client.tsx:1325`
- `app/(dashboard)/finances/finances-client.tsx:1342`
- `app/(dashboard)/finances/finances-client.tsx:1359`
- `app/(dashboard)/finances/finances-client.tsx:1369`
- `app/(dashboard)/settings/settings-client.tsx:3743`
- `app/(dashboard)/settings/settings-client.tsx:4040`
- `app/(dashboard)/settings/settings-client.tsx:4060` — «Editar profesional», un formulario
- `app/(dashboard)/web/web-client.tsx:655`
- `app/(dashboard)/web/web-client.tsx:693`
- `components/crm/confirm-dialog.tsx:365` — el confirmar del CRM, contenido variable
- `components/crm/extend-trial-dialog.tsx:139` — un formulario (CRM)
- `components/crm/plan-price-card.tsx:159` — un formulario (CRM)
- `components/dashboard/canchas-manager.tsx:438`
- `components/dashboard/clinical-history-panel.tsx:254`
- `components/dashboard/nuevo-abono-form.tsx:176` — «Nuevo abono», el formulario va en un componente aparte
- `components/dashboard/nuevo-turno-form.tsx:190` — «Nuevo turno», el formulario va en un componente aparte
- `components/dashboard/unsaved-changes-guard.tsx:406`

La X compartida es `size="icon-sm"` (28 px, por debajo de los 44 px de touch target de CLAUDE.md) y vive en
`components/ui/dialog.tsx`; los «Elegir» también quedan por debajo. Ninguno se tocó en este plan (la X es de la
primitiva compartida; los botones no son parte del hallazgo): va como observación para el dueño.

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
