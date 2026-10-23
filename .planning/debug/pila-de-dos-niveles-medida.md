---
status: measured
trigger: "Phase 3 del workstream panel-nav: medir la pila REAL del navegador para los recorridos de la política de dos niveles, antes de que 03-02, 03-03 y 03-04 escriban su mitad difícil. E-1..E-7 los agregó el plan 03-01 (Task 2); E-8 —la cadena de tres pasos del guard de salida— el plan 03-04; E-11 —la INTERSECCIÓN del sentinel de salida con la marca de la rama, que es el hueco que la UAT destapó— el plan 03-05; E-9, E-10 y E-12 —el sentinel enterrado contra el consumido, la decisión (a) del dueño y el degenerado con el sentinel al fondo— el plan 03-06."
created: 2026-10-13T00:00:00Z
updated: 2026-10-23T00:00:00Z
---

## Current Focus

veredicto: **LAS DOCE PILAS MEDIDAS COINCIDEN CON LAS ESPERADAS** (12/12, la sonda sale 0)

La sonda es `.planning/debug/probes/panel-back-stack.mjs`, es **re-ejecutable** y **falla con código
distinto de cero** si cualquier pila medida difiere de la esperada. Esto no es un informe de una
corrida: es un instrumento con gate, y los planes 03-02 y 03-03 lo pueden volver a correr cuando
quieran. Se corre **siempre** por el turno de pantalla:

```
node scripts/con-turno.mjs node .planning/debug/probes/panel-back-stack.mjs
```

## Con qué se midió

| Pieza | Valor medido |
|---|---|
| Navegador | **Chrome/154.0.8037.98** para E-1..E-8 (2026-10-13/14), **Chrome/155.0.8059.86** para E-11 (2026-10-23, plan 03-05) y **Chrome/155.0.8059.85** para **E-9 / E-10 / E-12** (2026-10-23, plan 03-06 — el binario instalado, leído por CDP en la corrida), `--headless=new`, perfil temporal propio. Las **ocho** primeras coinciden en **las dos** versiones (las corridas del 2026-10-23 las volvieron a medir en verde sobre 155), así que la pila del atrás no cambió de una a la otra. Los **cuatro** escenarios de la tanda de cierre de gaps están medidos **sólo** sobre 155 |
| Node | `v24.15.0` — el `WebSocket` global alcanza para CDP, **cero paquetes nuevos** |
| Servidor | `node:http` propio en `http://127.0.0.1:8731`, responde el mismo HTML a cualquier path |
| Puerto de depuración | `9334` |
| Dev server | **apagado y no usado** |
| Base de datos | **apagada y no usada** |
| Lectura de la pila | `Page.getNavigationHistory` (entradas + índice actual) + `history.state` por `Runtime.evaluate` |

El turno de pantalla esperó **~21 minutos** a dos suites de Playwright de otros proyectos de esta
máquina (forjo-tiendas y erp-forjo-studio) antes de tomar el turno. La espera imprimió su cartel con
el dueño vivo cada ~80 s. **La espera no es un rojo**, y queda anotada acá para que nadie la lea como
un cuelgue la próxima vez.

## ⚠ Qué es "la pila" en estas mediciones

Es la precisión que vuelve honestos los siete números, y es una **corrección medida** que el research
no tenía: ni `history.back()` ni `replaceState` **truncan las entradas de adelante**. Así que la sonda
mide tres cantidades por escenario y las compara por separado:

- **`abajo`** — las entradas desde la primera hasta la **actual inclusive**. Es el **camino del
  atrás**: lo único que el dueño puede recorrer apretando atrás. Es lo que los criterios de la fase
  llaman "la pila".
- **`actual`** — la entrada en la que está parado.
- **`adelante`** — las entradas que quedaron por encima. **No son basura en el camino del atrás**
  (están adelante, no debajo) y el dueño estuvo ahí de verdad. Se **declaran** en la expectativa en
  vez de ignorarse, igual que el caso de entrada directa que v0.30 declaró y aceptó.

## Las doce mediciones

### E-1 · MOB-04 nivel 1 — `Inicio → Más → Finanzas`

Cierra **A4**. Veredicto: **OK**.

```
armada:          ["/dashboard","/mas","/finances"]
tras_un_atras:   "/mas"
tras_dos_atras:  "/dashboard"
abajo_al_final:  ["/dashboard"]
```

⇒ **el criterio 1 de la fase, medido:** el primer atrás deja **Más a la vista** y el segundo cae en
**Inicio**. Los dos niveles existen en la pila real, no sólo en el simulador puro de la suite.

### E-2 · D-02 — `Inicio → Turnos → Más`

Cierra **A4**. Veredicto: **OK**.

```
armada:         ["/dashboard","/appointments","/mas"]
escalones:      3
tras_un_atras:  "/appointments"
```

⇒ el atrás cae en **Turnos**, que es la decisión del dueño, y la pila tiene **tres** escalones. Queda
medido lo que el CONTEXT ordena no esconder: *"dos niveles" es la profundidad de Más y sus secciones,
**no** un techo de la pila*.

### E-3 · subir un nivel (D-03 — lo que implementa el plan 03-02)

Cierra **A4**. Veredicto: **OK**.

```
abajo:                       ["/dashboard","/mas"]
actual:                      "/mas"
adelante:                    ["/finances"]
marca_con_la_que_aterrizo:   {"frjUnder":"/dashboard"}
```

⇒ un retroceso **guardado** (leer la marca de la entrada de arriba y retroceder sólo si es nuestra)
deja **`/mas` como entrada actual** con Inicio debajo, y **la marca de la entrada de abajo sobrevive
al retroceso**: aterriza con `frjUnder: "/dashboard"`, que es exactamente el dato que 03-02 necesita
para decidir el salto siguiente. `/finances` queda **adelante**, no debajo.

### E-4 · el colapso normal (criterio 2)

Cierra **A5**. Veredicto: **OK**. Pila `[/dashboard, /mas, /finances]`, destino `/clients`.

```
rama_tomada:                       "retroceso-y-reemplazo"
marca_leida_en_la_entrada_de_mas:  "/dashboard"
abajo:                             ["/dashboard","/clients"]
actual:                            "/clients"
adelante:                          ["/finances"]
atras_cae_en:                      "/dashboard"
```

⇒ retroceder, **leer la marca** de la entrada de `/mas` (dice `/dashboard`), ver que **no** coincide
con el destino y **recién entonces** reemplazar, **diferido fuera del evento `popstate`**, deja el
atrás cayendo en **Inicio**. `/mas` ya no está debajo: el criterio 2, medido.

⚠ **La corrección medida:** el reemplazo **no trunca** las entradas de adelante, así que `/finances`
sobrevive como entrada de *forward*. Se declara y se vive con eso.

### E-5 · el colapso degenerado (§A-3.2 — el que decide la forma de 03-02)

Cierra **A6**. Veredicto: **OK**. Pila `[/dashboard, /appointments, /mas, /finances]`, destino
`/appointments` — o sea **la ruta que quedaría debajo**.

```
rama_tomada:                        "doble-retroceso"
marca_leida_en_la_entrada_de_mas:   "/appointments"
abajo:                              ["/dashboard","/appointments"]
actual:                             "/appointments"
marca_de_la_entrada_actual:         {"frjUnder":"/dashboard"}
dos_entradas_identicas_adyacentes:  false
```

⇒ retroceder, leer la marca de `/mas` (dice `/appointments`), ver que **coincide** con el destino y
retroceder **una segunda vez sin navegar** deja la entrada actual en `/appointments` y **no** produce
dos entradas idénticas adyacentes. **Es la forma que 03-02 tiene que implementar**, y es el motivo
medido por el que la marca guarda **la ruta** y no un booleano: con un booleano esta rama no se puede
detectar.

### E-6 · el sentinel de salida (MOB-05 / lo que implementa el plan 03-03)

Cierra **A7**. Veredicto: **OK**. Pila `[/dashboard, /dashboard#salir]` (sentinel armado) y una
navegación que **empuja** `/appointments`.

```
armada:                                      ["/dashboard","/dashboard#salir","/appointments"]
marca_con_la_que_aterrizo_el_primer_atras:   {"frjExit":1}
actual_tras_el_primer_atras:                 "/dashboard#salir"
sentinel_vivo:                               1
pathname_sobre_el_sentinel:                  "/dashboard"
actual_tras_consumirlo:                      "/dashboard"
sentinel_tras_consumirlo:                    null
```

⇒ **la medición que le ahorra trabajo a 03-03.** El primer atrás vuelve a la entrada del sentinel
**con su marca viva**, y `location.pathname` sigue siendo `/dashboard` — o sea **Inicio a la vista**.
El segundo atrás **consume** el sentinel y llega a `/dashboard` **sin marca**.

⇒ **el sentinel que queda debajo de una sección NO produce el atrás muerto de C-5**: estar parado
sobre él **cuenta como armado**, y el retroceso que lo consume **es** el primer intento de salida. No
hace falta pisar el sentinel con un reemplazo.

### E-7 · entrada directa (cicatriz 2)

Cierra **A4**. Veredicto: **OK**. Pila `['/finances']`, índice 0, nada debajo.

```
indice:                            0
abajo:                             ["/finances"]
el_retroceso_guardado_se_nego:     true
sigue_parado_en:                   "/finances"
```

⇒ **la política no puede retroceder acá**, y el candado está medido: pedirle un retroceso guardado se
**niega** (la entrada no lleva nuestra marca) y el dueño **sigue parado** donde estaba. El caso de
"entrar directo" está aceptado y documentado desde v0.30; un retroceso sin marca lo **expulsaría del
sitio**, que es la cicatriz 2.

### E-8 · la cadena de TRES pasos (criterio 4 — lo que implementa el plan 03-04)

Cierra **A5 + A6 compuestos**: el disparador real del colapso no es la barra, es el **guard de salida
de cambios sin guardar**. Veredicto: **OK**. Pila `[/dashboard, /mas, /web, /web#sin-guardar]` —una
sección de la rama de Más con el sentinel de cambios sin guardar arriba, que es la pila EXACTA del
caso vivo— y destino `/clients` (un destino de la barra).

```
armada:                                         ["/dashboard","/mas","/web","/web#sin-guardar"]
marca_de_la_entrada_de_arriba_al_armar:         {"frjDirty":1}
la_marca_de_la_rama_con_el_sentinel_arriba:     null
la_marca_de_la_rama_tras_consumir_el_sentinel:  "/mas"
rama_tomada:                                    "dos-consumos-y-reemplazo"
marca_leida_en_la_entrada_de_mas:               "/dashboard"
abajo:                                          ["/dashboard","/clients"]
actual:                                         "/clients"
adelante:                                       ["/web","/web#sin-guardar"]
atras_cae_en:                                   "/dashboard"
dos_entradas_identicas_adyacentes:              false
mas_quedo_inmediatamente_debajo:                false
```

⇒ **LA MEDICIÓN QUE REHIZO EL DISEÑO DEL PROVIDER, y es el motivo por el que esta sonda se corre
ANTES de codear.** Las dos líneas del medio son el hallazgo: con el sentinel de cambios sin guardar
arriba la marca de la rama **no es legible** (`null`), y **tras consumirlo vuelve a ser legible**
(`/mas`). El motivo es mecánico y está en el código de los dos módulos: `dirtyHistoryState(id)`
devuelve `{ frjDirty: id }` **y nada más**, así que el `pushState` del sentinel crea una entrada
nueva **sin** la marca de la rama — que sigue viva, intacta, en la entrada de la sección de abajo.

⇒ **La consecuencia de diseño, escrita en vez de descubierta en la UAT.** El plan 03-04 pedía
calcular el plan de la rama **en el momento del click** y pasárselo al plan de salida. Medido, eso
daría `masDebajo: false` ⇒ la regla 0 ⇒ `panelNavMode('/web' → '/mas')` ⇒ **`push`**: "Salir sin
guardar" desde `/web` hacia Más aterrizaría en Más con **la política de UN nivel** —el atrás volvería
a `/web`— que es **exactamente el defecto que el criterio 4 prohíbe** y que el quick `261006-iey` ya
tuvo que arreglar una vez. Así que el provider **re-deriva** el plan de la rama en el `popstate` del
consumo, con la entrada de la sección a la vista. No es un mecanismo nuevo: es la forma que
`branchSecondStep` (`lib/panel-branch.ts`) ya tiene **por el mismo motivo** —"esa ruta sólo se puede
leer estando parado sobre la entrada de Más, o sea después del primer consumo"—, medida en E-5.

⇒ **Y la aritmética de la cadena queda medida entera:** dos consumos encadenados —cada uno desde el
evento del anterior— más un reemplazo **diferido fuera del evento**, dejan `[Inicio, Clientes]`. El
atrás cae en **Inicio**, `/mas` **no** quedó inmediatamente debajo, no hay dos entradas idénticas
adyacentes, y lo que queda **adelante** (`/web`, `/web#sin-guardar`) no es basura en el camino del
atrás: está arriba, y el dueño estuvo ahí de verdad.

### E-9 · el sentinel NO se queda enterrado — la forma VIEJA contra la NUEVA, en la misma medición

Cierra **la causa medida de G-1 y G-2**. Veredicto: **OK**. Lo agregó el plan **03-06**.

Las **dos formas** van en el mismo escenario a propósito: es lo que lo vuelve una **medición** y no
una afirmación. La booleana de la forma vieja se declara en **verdadero**, porque ese valor **es el
bug** y tiene que quedar en el instrumento y no en un comentario.

**La forma VIEJA** — el destino se empuja **encima** del sentinel, que es lo que la app hacía:

```
vieja_abajo:                                            ["/dashboard","/dashboard#salir","/appointments"]
vieja_pathnames_del_camino_del_atras:                   ["/dashboard","/dashboard","/appointments"]
vieja_pares_de_pathnames_repetidos:                     ["/dashboard | /dashboard#salir"]
vieja_el_sentinel_quedo_enterrado:                      true
vieja_hay_dos_entradas_adyacentes_de_la_misma_pantalla: true
```

**La forma NUEVA** — se **consume** el sentinel y recién entonces se navega, en dos pasos:

```
nueva_consumio_el_sentinel_de_esta_instancia:          1
nueva_parado_tras_el_consumo:                          "/dashboard"
nueva_abajo:                                           ["/dashboard","/appointments"]
nueva_escalones:                                       2
nueva_el_sentinel_sobrevive_en_el_camino_del_atras:    []
nueva_marca_del_destino:                               {"frjUnder":"/dashboard"}
nueva_pathnames_del_camino_del_atras:                  ["/dashboard","/appointments"]
nueva_pares_de_pathnames_repetidos:                    []
nueva_atras_cae_en:                                    "/dashboard"
nueva_actual_tras_un_atras:                            "/dashboard"
```

⇒ **El atrás muerto de G-1 y G-2, medido.** La entrada del sentinel es **absorbente**: se empujó para
consumirla. Empujando el destino encima queda **enterrada**, y entonces el atrás aterriza en
`/dashboard#salir` —que en pantalla se ve **igual que Inicio**— con un atrás siguiente que no hace
**nada visible**. Es literalmente lo que el dueño midió: *recarga y vuelve a `dashboard#salir-3`*, y
*a la primera que toco atrás no hace nada*.

⇒ **Y por qué este par de pathnames repetidos NO está admitido y el de E-11 sí.** En E-11 el sentinel
es la entrada de **arriba** del par y su "nada visible" lo **cubre el aviso de MOB-05**: pararse sobre
él es el primer intento de salida. **Enterrado**, no lo cubre nada: el dueño ya pasó por arriba y el
aviso no va a aparecer. Mismo par de rutas, significado opuesto — y es por eso que el candado se
compara por **pathname** y la excepción se declara por **posición**, no por forma.

⇒ **Lo que la forma nueva deja:** dos escalones, el sentinel **fuera** del camino del atrás, el
destino marcado con la **ruta de la raíz** (que es lo que de verdad quedó debajo), el atrás cayendo en
la raíz, y **cero** pares de pathnames repetidos.

### E-10 · la DECISIÓN (a) del dueño — el sentinel se arma SÓLO si no hay nada nuestro debajo

Cierra **la colisión que la UAT destapó** (ítem **H** / **G-4**). Veredicto: **OK**. Lo agregó el plan
**03-06**.

Parado en Inicio **con historia debajo**, MOB-04 (`Más → Inicio → atrás` vuelve a Más) y MOB-05 (en
Inicio el atrás avisa antes de salir) **no pueden ser verdad a la vez**. El dueño eligió **(a)**: el
sentinel se arma **sólo si no hay nada nuestro debajo**. El escenario escribe **las seis condiciones
en orden** —como lo hacen los otros— y compara la acción contra el valor esperado.

```
mitad_1_abajo:                                       ["/dashboard"]
mitad_1_marca_de_la_rama_de_la_entrada_de_arriba:    null
mitad_1_hay_algo_nuestro_debajo:                     false
mitad_1_accion_de_armado:                            "armar"
mitad_2_abajo:                                       ["/dashboard","/appointments","/dashboard"]
mitad_2_marca_de_la_rama_de_la_entrada_de_arriba:    "/appointments"
mitad_2_hay_algo_nuestro_debajo:                     true
mitad_2_accion_de_armado:                            "no-armar"
mitad_2_el_atras_cae_en:                             "/appointments"
parados_sobre_el_nuestro_con_marca_de_rama_presente: "no-armar"
```

⇒ **La pregunta "¿hay algo nuestro debajo?" se contesta con lo que YA existe.** `frjUnder` guarda **la
ruta** que quedó debajo —no un booleano—, justamente para el caso degenerado; así que estando en la
raíz la respuesta es *la entrada de arriba lleva nuestra marca de rama*. Una cuarta clave en la pila
sería un cuarto dueño sin necesidad, y la regla 0 tiene **tres** a propósito.

⇒ **Los dos tramos de la mitad 2 son EMPUJES**, que es lo que la política dice para ellos
(`from === root` ⇒ push, `to === root` ⇒ push). Con un reemplazo la marca no queda donde la mitad
necesita y la medición no mediría la decisión.

⇒ **Y la respuesta sólo vale porque la marca ya dice la verdad** (plan `03-05`, medido en E-11). Con
la marca escribiéndose tras cada retroceso, después de `Inicio → Turnos → atrás` la entrada de Inicio
quedaría marcada **sin tener nada debajo**, (a) decidiría *no armar* y el atrás saldría del panel
**sin avisar** — un G-5 nuevo fabricado por el arreglo. Por eso `03-05` va antes.

⇒ **El orden de las seis reglas es el argumento, y la última línea lo mide.** Las cinco anteriores son
de **seguridad** (nadie a quien avisar, lugar equivocado, ventana abierta, ya armado, la entrada de
arriba es de otro dueño) y la de (a) es de **política**. Parados **sobre nuestro propio sentinel** la
cuarta devuelve antes, así que la de (a) **nunca** lee la marca de la rama ahí — donde ese dato no
significa nada, porque el state del sentinel lleva **sólo su propia clave**.

### ⚠ EL LÍMITE ACEPTADO DE LA DECISIÓN (a), escrito en vez de descubierto en la próxima UAT

La decisión (a) cierra el caso en que lo que quedó debajo es una entrada **nuestra**. **No cierra —y
no puede cerrar— el caso en que sea una entrada AJENA** (otro sitio, o la pestaña recién abierta en
otra página). Ahí el aviso de salida **va a aparecer igual** aunque el atrás sí saque del panel, o
peor: no se va a armar cuando tendría que armarse.

**Por qué no se puede:** no hay API confiable para preguntarle al navegador "¿hay algo debajo?".
`history.length` cuenta **también las entradas de adelante** (el *forward*), así que un historial de
largo 3 puede ser una entrada debajo y una arriba, o dos arriba y ninguna debajo — y la sonda ya lo
dejó medido en la definición misma de *abajo* / *actual* / *adelante* de este documento. Lo único que
la app puede saber con certeza es lo que **ella misma empujó**, que es exactamente lo que `frjUnder`
registra.

**Esto queda ACEPTADO por el dueño**, y es la misma razón por la que el caso de **entrada directa**
está aceptado y documentado desde v0.30 (**E-7** de este mismo documento: con una sola entrada no hay
nada debajo y la política no puede retroceder). Lo que **no** estaba permitido era dejarlo sin
escribir: va declarado acá, en el docblock del sentinel de `lib/panel-branch.ts`, y en el registro de
imprecisiones de `.planning/WINDOWS.md` (plan `03-08`).

### E-11 · la INTERSECCIÓN que faltaba — el sentinel de salida al fondo × la marca de la rama (el recorrido D7 de la UAT)

Cierra **el hueco que la UAT nombró**, y no uno de los supuestos del research: la intersección de la
**marca de la rama** (`frjUnder`) con el **sentinel de salida** (`frjExit`) en la **misma** pila.
Veredicto: **OK**. Lo agregó el plan **03-05**.

Pila armada: `Inicio` **con el sentinel armado** → `Turnos` → `Más` → `Finanzas`, y destino `/clients`
—o sea un destino de la barra que **no** es la ruta de abajo, para tomar la rama de
retroceso-y-reemplazo y no la degenerada—.

```
armada:                                              ["/dashboard","/dashboard#salir","/appointments","/mas","/finances"]
abajo:                                               ["/dashboard","/dashboard#salir","/appointments","/clients"]
actual:                                              "/clients"
adelante:                                            ["/finances"]
marca_de_la_entrada_actual:                          {"frjUnder":"/appointments"}
ruta_que_leyo_el_segundo_paso_en_la_entrada_de_mas:  "/appointments"
rama_tomada:                                         "retroceso-y-reemplazo"
marca_que_DERIVARIA_el_par_de_rutas:                 "/mas"
ruta_real_de_abajo:                                  "/appointments"
la_derivada_y_la_real_coinciden:                     false
pathnames_del_camino_del_atras:                      ["/dashboard","/dashboard","/appointments","/clients"]
pares_de_pathnames_repetidos:                        ["/dashboard | /dashboard#salir"]
pares_..._que_no_son_el_del_sentinel:                []
atras_cae_en:                                        "/appointments"
actual_tras_un_atras:                                "/appointments"
actual_tras_dos_atras:                               "/dashboard#salir"
marca_de_la_entrada_del_sentinel:                    {"frjExit":1}
el_sentinel_sigue_al_fondo:                          ["/dashboard#salir"]
```

⇒ **LA MENTIRA DEL PAR DE RUTAS, MEDIDA COMO NÚMERO.** Son las tres líneas del medio, y son el
corazón de G-3. El efecto de marcado ve el tramo *(`/mas` → `/clients`)*, y la política de rutas lo
declara **empuje** (`from === more`), así que **derivaría `/mas`**. Pero el reemplazo del colapso
**pisó** la entrada de Más: lo que queda debajo es **lo que había debajo de Más** —`/appointments`—,
un dato que el segundo paso **ya leyó**. Las dos rutas **no coinciden**, y eso queda afirmado como
valor esperado literal: el día que alguien "simplifique" la propagación, el candado lo dice en vez de
dar verde.

⇒ **El candado del atrás muerto se compara por PATHNAME, no por ruta completa**, y acá se ve por qué:
`/dashboard` y `/dashboard#salir` son rutas **distintas** y pantallas **iguales**. Comparadas como lo
hace E-5 —por ruta completa— el candado **pasaría en falso** sobre exactamente el atrás que no hace
nada visible. El único par de pathnames repetidos admitido es el del **sentinel**, que es una entrada
**absorbente** (existe para comerse el primer atrás en la raíz) y cuyo "nada visible" lo cubre el
aviso de MOB-05; cualquier otro par es el defecto, y la clave que los cuenta fuera del sentinel está
medida en `[]`.

⇒ **Y la asimetría que hace falta para que todo esto sea honesto:** la sección de la barra se marca
con el **pathname** de la raíz (`/dashboard`) y **no** con la ruta completa de la entrada de abajo
(`/dashboard#salir`). Es lo que hace la app: la marca la escribe un efecto que observa
`usePathname()`, y el pathname **no ve el hash**.

⇒ **Dónde cae el atrás, que es el síntoma que el dueño midió:** `/appointments` —**Turnos**—, que es
lo que D7 esperaba. El sentinel sigue **al fondo** con su clave viva (`{frjExit: 1}`), así que el
atrás **no** aterriza en una entrada del sentinel en medio del colapso: el `dashboard#salir-3` de la
UAT era el síntoma, no el diseño.

### E-12 · el DEGENERADO con el sentinel al fondo — el primer atrás CAMBIA DE PANTALLA

Cierra **G-2** (*"a la primera que toco atrás no hace nada"*). Veredicto: **OK**. Lo agregó el plan
**03-06**.

Es el caso degenerado del criterio 2 —el destino de la barra coincide con la ruta que quedaría
debajo— pero con el sentinel de salida en el recorrido. **E-5** medía el degenerado **sin** sentinel;
éste, **con** él. Y la pila se arma **con el helper nuevo** (saliendo de la raíz **consumiendo** el
sentinel), que es el punto: así nunca queda enterrado.

Pila armada: `Inicio` **con el sentinel armado** → `Turnos` → `Más` → `Finanzas`, y destino
`/appointments` —o sea justo la ruta que quedaría debajo—.

```
armada:                              ["/dashboard","/appointments","/mas","/finances"]
el_sentinel_quedo_enterrado_al_armar: []
rama_tomada:                         "doble-retroceso"
marca_leida_en_la_entrada_de_mas:    "/appointments"
abajo:                               ["/dashboard","/appointments"]
actual:                              "/appointments"
adelante:                            ["/mas","/finances"]
marca_de_la_entrada_actual:          {"frjUnder":"/dashboard"}
pathnames_del_camino_del_atras:      ["/dashboard","/appointments"]
pares_de_pathnames_repetidos:        []
atras_cae_en:                        "/dashboard"
pathname_antes_del_atras:            "/appointments"
pathname_tras_el_atras:              "/dashboard"
el_primer_atras_cambia_de_pathname:  true
actual_tras_un_atras:                "/dashboard"
```

⇒ **La clave de G-2 es la antepenúltima línea, y no la pila.** Lo que el dueño midió no fue una pila
mal armada: fue un **gesto que no produjo nada visible**. Por eso el escenario mide el `pathname`
**antes y después** del atrás y afirma que son **distintos**. Un atrás que no cambia de pantalla es
exactamente la entrada basura que el **criterio 2** prohíbe.

⇒ **El sentinel no aparece en `armada`**, y ésa es la prueba de que el helper hizo su trabajo: la
primera línea del escenario lo empuja y la segunda lo **consume** al salir de la raíz. Comparado con
E-11 —donde la salida fue un empuje encima y `armada` arranca con `["/dashboard","/dashboard#salir",…]`—
se ve el cambio exacto que el plan `03-06` introduce.

⇒ **La rama tomada es la de doble retroceso**, no la de retroceso-y-reemplazo: el destino coincidía
con la ruta de abajo, así que reemplazar habría dejado `[…, /appointments, /appointments]`. Con los dos
retrocesos la pila queda en dos escalones, `adelante` conserva `/mas` y `/finances` —el dueño estuvo
ahí de verdad— y la entrada actual queda marcada con la **ruta de la raíz**.

### ⚠ POR QUÉ EL 8/8 ERA VERDAD Y NO ALCANZABA (la lección de método de esta tanda)

Esta sonda dio **8/8** y la UAT en el teléfono del dueño falló en **5 ítems más una colisión de
diseño**. Las dos cosas son ciertas a la vez, y la explicación no es que la medición estuviera mal:
**el 8/8 medía un espacio que no incluía lo que la UAT probó.**

Ningún escenario de los ocho cruzaba el **sentinel de salida** con la **rama**:

- **E-6** probaba el sentinel **aislado**, sobre una pila limpia de tres entradas.
- **E-8** cruzaba la rama con el sentinel de **cambios sin guardar** (`frjDirty`), que es **otra**
  marca y **otro** dueño.

G-1, G-2, G-3 y G-4 caen **todos** en esa intersección. Un instrumento con gate no certifica "el
código está bien": certifica **"estos nueve recorridos son éstos"**. Cuando un gate verde convive con
un teléfono rojo, la pregunta correcta no es "¿el gate miente?" sino **"¿qué no está midiendo?"** — y
la respuesta, acá, se escribió como escenario nuevo en vez de como nota al pie. Es la misma lección
que la memoria *medir-antes-de-aceptar-un-fix-propuesto* ya tiene **cinco** veces en este mismo
workstream, vista desde el otro lado: **medir no alcanza si lo medido no es lo que falla.**

## Lo que esta sonda NO puede cerrar

Tres supuestos del `## Assumptions Log` del research **siguen abiertos a propósito**, y van **ruteados
a la UAT del plan 03-04**. Declararlos es lo que impide que este documento afirme haber cerrado algo
que no cerró:

| # | Supuesto | Por qué esta sonda no alcanza |
|---|---|---|
| **A1** | El `useEffect` que escribe la marca corre **después** de la escritura del router de Next, así que el router no la pisa | Es semántica de **React y del router**, no de la pila del navegador. La sonda mide `history` crudo con su propio servidor estático: no hay router de Next en el medio, así que no puede observar ese orden. Se cierra con la app de verdad |
| **A2** | Un `replaceState` **sin** URL no provoca ningún commit del router, y por lo tanto nada que pueda borrar la marca | El **camino de código** está verificado leyendo Next (`if (url)`); lo que **no** está verificado es que no haya **otro commit en vuelo** en el momento de escribir. Eso sólo aparece con el router montado y navegando |
| **A11** | Lo medido vale en **Safari/iOS y Chrome Android reales** | **Todo** lo medido en este repo sobre el retroceso fue **Chrome de escritorio headless**, incluida esta sonda (`Chrome/154.0.8037.98`). Los dos motores reales sólo se cierran con **el teléfono del dueño** |

**Y el recordatorio de método, que vale más que los siete números de arriba:** el modo de falla de esta
fase es **silencioso** (la URL cambia y la vista no, o el atrás no hace nada) y **no lo ve `tsc`, ni la
suite, ni el build**. El único criterio que cierra la fase es la UAT en un teléfono real.

## Qué consume esto

- **Plan 03-02** — E-3 (subir un nivel), E-4 (el colapso normal) y **E-5** (el degenerado, que es el
  que le fija la forma: doble retroceso sin navegar, y la marca guardando **la ruta**).
- **Plan 03-03** — E-6 (el sentinel de salida: no hace falta pisarlo con un reemplazo).
- **Plan 03-04** — **E-8**, que es el que le fijó la forma al provider del guard de salida: con el
  sentinel de cambios sin guardar arriba la marca de la rama **no es legible**, así que el plan de la
  rama se **re-deriva** después del consumo y no en el click. Y A1, A2 y A11, que esta sonda **no**
  cierra.
- **Plan 03-05** — **E-11**, que es el que mide la **intersección** que los ocho anteriores no
  tocaban (el sentinel de salida al fondo × la marca de la rama × el colapso) y deja la **mentira del
  par de rutas** medida como número. Es la base de los otros tres planes de la tanda de cierre de
  gaps: la decisión (a) del dueño se contesta **leyendo** esta marca, así que la marca tenía que
  dejar de mentir primero.
- **Plan 03-06** — **E-9** (el sentinel enterrado contra el consumido, las **dos** formas en la misma
  medición, que es la causa de G-1 y G-2), **E-10** (las dos mitades de la **decisión (a)** del dueño,
  más el candado del orden entre *ya estoy armado* y (a)) y **E-12** (el **degenerado** con el
  sentinel al fondo, y la clave de G-2: que el **primer** atrás cambia de pathname). Y el **límite
  aceptado de (a)** —la entrada **ajena**—, escrito en su propia sección de arriba.
- **Cualquiera de los cinco** puede re-correr la sonda: si una pila deja de coincidir, el arreglo
  **no es ajustar la expectativa** — es rehacer el diseño contra lo medido y actualizar este
  documento.
