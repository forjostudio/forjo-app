---
status: measured
trigger: "Phase 3 del workstream panel-nav: medir la pila REAL del navegador para los recorridos de la política de dos niveles, antes de que 03-02, 03-03 y 03-04 escriban su mitad difícil. E-1..E-7 los agregó el plan 03-01 (Task 2); E-8 —la cadena de tres pasos del guard de salida— el plan 03-04; E-11 —la INTERSECCIÓN del sentinel de salida con la marca de la rama, que es el hueco que la UAT destapó— el plan 03-05; E-9, E-10 y E-12 —el sentinel enterrado contra el consumido, la decisión (a) del dueño y el degenerado con el sentinel al fondo— el plan 03-06; E-13 —el ciclo de re-armado ×3 sin acumular y el origen medido del hash escalado— el plan 03-07."
created: 2026-10-13T00:00:00Z
updated: 2026-10-28T00:00:00Z
---

## Current Focus

veredicto: **LAS DIECIOCHO PILAS MEDIDAS COINCIDEN CON LAS ESPERADAS** (18/18, la sonda sale 0 —
medido el 2026-10-28, con `E-17` y `E-18` del plan 03-11 adentro)

⚠ **Y UN PIPELINE VERDE NO ES EVIDENCIA, con tres ocurrencias para probarlo:** la ronda 1 de la UAT
llegó con la sonda en **8/8** y encontró cinco fallos; la 2 con **13/13** y encontró `G2-1`; la 3 con
**16/16** y encontró `G3-1` **en el primer recorrido**. Este 18/18 sigue midiendo un espacio que **no
incluye** lo que el teléfono prueba.

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
| Navegador | **Chrome/154.0.8037.98** para E-1..E-8 (2026-10-13/14), **Chrome/155.0.8059.86** para E-11 (2026-10-23, plan 03-05) y **Chrome/155.0.8059.85** para **E-9 / E-10 / E-12** (2026-10-23, plan 03-06 — el binario instalado, leído por CDP en la corrida), `--headless=new`, perfil temporal propio. Las **ocho** primeras coinciden en **las dos** versiones (las corridas del 2026-10-23 las volvieron a medir en verde sobre 155), así que la pila del atrás no cambió de una a la otra. Los **cinco** escenarios de la tanda de cierre de gaps están medidos **sólo** sobre 155 — **E-13** (2026-10-23, plan 03-07) también sobre `Chrome/155.0.8059.85` |
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

## Las dieciocho mediciones

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

### E-13 · el CICLO de re-armado ×3 sin acumular, y de dónde sale el hash ESCALADO

Veredicto: **OK**. Lo agregó el plan **03-07**, y es el escenario de los gaps **G-5** y **G-6**.

Tiene **dos mitades** que son las dos caras del mismo mecanismo: la **A** mide que el ciclo sano
funciona repetido, y la **B** mide **el bug** —de dónde sale la tercera entrada de salida
(`dashboard#salir-3`) que el dueño reportó—.

**Mitad A — armar → consumir → re-armar, tres veces seguidas:**

```
mitad_A_hashes_empujados_en_las_tres_vueltas:            ["#salir","#salir","#salir"]
mitad_A_camino_del_atras_al_armar_en_cada_vuelta:        [["/dashboard","/dashboard#salir"],["/dashboard","/dashboard#salir"],["/dashboard","/dashboard#salir"]]
mitad_A_largos_del_camino_del_atras_al_armar:            [2,2,2]
mitad_A_el_camino_del_atras_crecio:                      false
mitad_A_sentinel_vivo_en_cada_vuelta:                    [1,1,1]
mitad_A_camino_del_atras_tras_consumir_en_cada_vuelta:   [["/dashboard"],["/dashboard"],["/dashboard"]]
mitad_A_actual_tras_consumir_en_cada_vuelta:             ["/dashboard","/dashboard","/dashboard"]
mitad_A_entradas_con_el_hash_escalado:                   []
```

⇒ **El hash empujado es SIEMPRE el base, las tres veces.** Al consumir la entrada, el navegador
restaura la URL de abajo —que no tiene hash—, así que el re-armado siguiente vuelve a derivar `#salir`
y no `#salir-2`. Es el dato que distingue *re-armar después de consumir* de *re-armar parado sobre la
entrada vieja*: lo segundo produciría el escalado.

⇒ **El camino del atrás NO crece** (dos escalones en las tres vueltas) y **ninguna** entrada llegó a
tener el hash escalado. O sea: el ciclo repetido **no acumula entradas de salida**, que es exactamente
lo que el dueño midió que sí pasaba.

**Mitad B — el estado de la entrada PISADO por una escritura ajena:**

Se arma el sentinel y después se hace un `replaceState` con un state que **no** lleva nuestra clave y
**sin** url, que es literalmente lo que hace el router al sincronizar su propio estado. La URL se
queda con nuestro hash; el estado, no.

```
mitad_B_hash_en_la_url_con_el_estado_pisado:                   "#salir"
mitad_B_la_url_lleva_nuestro_hash:                             true
mitad_B_el_estado_lleva_nuestra_marca:                         false
mitad_B_camino_del_atras_con_el_estado_pisado:                 ["/dashboard","/dashboard#salir"]
mitad_B_las_cinco_reglas_viejas_dicen:                         "armar"
mitad_B_la_septima_regla_dice:                                 "no-armar"
mitad_B_hash_que_produce_armar_sobre_el_estado_pisado:         "#salir-2"
mitad_B_camino_del_atras_tras_armar_sobre_el_estado_pisado:    ["/dashboard","/dashboard#salir","/dashboard#salir-2"]
mitad_B_el_camino_del_atras_crecio_un_escalon:                 true
```

⇒ **ÉSTE ES EL ORIGEN MEDIDO DEL `#salir-3`.** Con la URL llevando nuestro hash pero el estado
perdido, *ya estoy armado* da **falso** (pregunta por el **estado**, no por la URL), *la entrada de
arriba es de otro dueño* da **falso** (el state ajeno no lleva ninguna de las marcas conocidas) y *hay
algo nuestro debajo* da **falso**: las **cinco** reglas viejas no detectan nada y el armado sigue
adelante. Y como el hash se **deriva del actual** (cicatriz 1), lo que empuja es `#salir-2` y una
entrada **más** en el camino del atrás — cada una con un atrás que no hace nada visible. Repetido, da
`#salir-3`.

⇒ **Y es el argumento de la SÉPTIMA regla, decidida midiendo:** *si la URL ya lleva nuestro hash, no
armar*. La entrada **ya es nuestra** aunque su estado lo haya pisado una escritura ajena; empujar otra
cuesta **dos** atrás. La medición muestra las dos respuestas una al lado de la otra: las cinco viejas
dicen `armar`, la séptima dice `no-armar`.

⇒ **QUÉ NO CIERRA E-13, y va declarado en vez de insinuado.** Mide la **semántica de la pila** del
re-armado, **no el cableado de React**. Esta sonda monta su **propio servidor estático** y **no corre
el código de la app**: no hay router de Next ni efectos en el medio. Así que **A1** (el orden del
efecto contra la escritura del router), **A2** (que no haya otro commit en vuelo) y **A11** (los dos
motores reales) siguen **abiertos** — E-13 **no puede cerrar** ninguno de los tres, y los cierra la
UAT del plan `03-08`. Un verde de acá **no** es un cierre de G-5 ni de G-6: es el piso sobre el que
las decisiones puras del plan `03-07` se pueden escribir sin adivinar.

### E-14 · G2-1 — el ciclo Inicio↔sección: la forma VIEJA contra la NUEVA, en la misma medición

Veredicto: **OK**. Lo agregó el plan **03-09**, y es el escenario del gap **G2-1** de la ronda 2.

Tiene **dos mitades** que son el bug y su arreglo medidos uno al lado del otro, con el **sentinel de
salida adentro del ciclo**: se entra a Inicio, se arma el sentinel, se sale de la raíz
**consumiéndolo** hacia una sección de la barra (plan 03-06), y de ahí el ciclo Inicio↔sección tres
veces.

**Mitad A — la forma vieja: tocar Inicio EMPUJA (lo que la política de rutas dice hoy):**

```
mitad_A_hash_al_entrar_a_inicio:              "#salir"
mitad_A_profundidades_del_camino_del_atras:   [3,5,7]
mitad_A_crece_dos_por_vuelta:                 true
mitad_A_marca_de_la_entrada_de_inicio:        [{"frjUnder":"/clients"},{"frjUnder":"/clients"},{"frjUnder":"/clients"}]
mitad_A_accion_de_armado_en_cada_vuelta:      ["no-armar","no-armar","no-armar"]
mitad_A_el_sentinel_en_el_camino_del_atras:   []
```

**Mitad B — la forma nueva: el gesto lo resuelve el RETROCESO GUARDADO:**

```
mitad_B_hash_al_entrar_a_inicio:                            "#salir"
mitad_B_plan_en_cada_vuelta:                                ["up","up","up"]
mitad_B_profundidades_del_camino_del_atras:                 [1,1,1]
mitad_B_la_profundidad_crecio:                              false
mitad_B_marca_del_aterrizaje:                               [null,null,null]
mitad_B_accion_de_armado_en_cada_vuelta:                    ["armar","armar","armar"]
mitad_B_hashes_empujados_por_el_armado:                     ["#salir","#salir","#salir"]
mitad_B_hashes_escalados:                                   []
mitad_B_pares_adyacentes_con_el_mismo_pathname_al_armar:    [1,1,1]
```

⇒ **EL CRECIMIENTO DE DOS ENTRADAS POR CICLO, MEDIDO COMO NÚMERO: 3 → 5 → 7.** Dos entradas por
vuelta, **sin techo**. Y la cadena de cuatro pasos de **G2-1** al lado, cada paso con su número de
arriba:

1. la política de rutas dice `to === root ⇒ push`, así que **tocar Inicio desde una sección apila**
   una tercera entrada (`profundidades = [3,5,7]`);
2. ese empuje **marca** la entrada nueva de Inicio con la ruta que quedó debajo, o sea **la sección**
   (`marca_de_la_entrada_de_inicio = {frjUnder:"/clients"}` en las tres vueltas);
3. la **séptima regla** del armado (`algoNuestroDebajo`) lee esa marca y dice **no armar**
   (`accion_de_armado = "no-armar"` en las tres vueltas);
4. ⇒ **el aviso de salida nunca se arma.** Textual del dueño: *«al tocar inicio después de haber
   hecho otras cosas cae a /dashboard y la guarda de salir no está»*.

⇒ **Y la mitad B cierra las dos mitades de una.** La profundidad se queda **igual** en las tres
vueltas (`[1,1,1]`, contra `[3,5,7]`), el aterrizaje es la entrada **original** de Inicio y **no lleva
nuestra marca** (`[null,null,null]`), así que la séptima regla da falso y el armado dice **armar** —
el aviso **se re-arma solo**, sin tocar ninguna de las siete reglas. Y el hash que el armado empuja es
**siempre el base** las tres veces: **cero** hashes escalados, que es el síntoma que E-13 midió para
un armado de más.

⇒ **EL CANDADO DE LA CICATRIZ 1, CON EL OJO PUESTO DONDE IMPORTA.** Los pares adyacentes con el mismo
pathname en el camino del atrás son **exactamente uno** por vuelta, y ese uno es el par *raíz* /
*raíz con el hash del sentinel*: es **la condición de existencia** de la entrada del sentinel, **no**
un atrás muerto —consumirla **muestra el aviso**—. Un candado copiado de E-11, que compara por
pathname justamente para cazar el atrás muerto, daría acá un **falso rojo**.

⇒ **Un hecho del instrumento que salió midiendo, y queda escrito porque costó un rojo falso
(2026-10-27):** un `Page.navigate` a la **misma URL** en la que ya estamos **no es una navegación: es
una recarga**, y una recarga **PRESERVA `history.state`**. La mitad B aterrizaba sobre
`{frjUnder:"/clients"}` —la marca que había dejado la mitad A— y el armado daba `no-armar`: un rojo
que no era del diseño sino del punto de partida. Se cerró con un reinicio que **borra el estado**
(`reiniciarEnLimpio`). Es el mismo mecanismo por el que la marca **sobrevive al F5** del dueño, así
que no es una rareza del instrumento: es la semántica real.

### E-15 · la regla nueva DENTRO de la rama de Más, donde el colapso YA compite

Veredicto: **OK**. Lo agregó el plan **03-09**. Mide **cuál gana** en el cruce, con los **dos hechos
como números** en vez de un argumento.

**Mitad A — la pila de dos escalones de la rama (raíz y Más encima):**

```
mitad_A_marca_de_la_entrada_de_mas:           {"frjUnder":"/dashboard"}
mitad_A_hecho_nuevo_la_marca_dice_la_raiz:    true
mitad_A_hecho_de_la_rama_la_marca_dice_mas:   false
mitad_A_plan:                                 "up"
mitad_A_camino_del_atras_tras_el_retroceso:   ["/dashboard"]
mitad_A_actual:                               "/dashboard"
mitad_A_marca_del_aterrizaje:                 null
mitad_A_accion_de_armado_del_aterrizaje:      "armar"
```

**Mitad B — la sección abierta por Más (raíz, Más y una sección encima):**

```
mitad_B_marca_de_la_seccion:                      {"frjUnder":"/mas"}
mitad_B_hecho_nuevo_la_marca_dice_la_raiz:        false
mitad_B_hecho_de_la_rama_la_marca_dice_mas:       true
mitad_B_plan:                                     "collapse-then-replace"
mitad_B_rama_que_tomo_el_colapso:                 "doble-retroceso"
mitad_B_marca_leida_en_la_entrada_de_mas:         "/dashboard"
mitad_B_camino_del_atras:                         ["/dashboard"]
mitad_B_actual:                                   "/dashboard"
mitad_B_pares_adyacentes_con_el_mismo_pathname:   0
mitad_B_accion_de_armado_del_aterrizaje:          "armar"
```

⇒ **LA REGLA NUEVA NO LE ROBA EL GESTO AL COLAPSO, y no es una promesa: son dos booleanos
contrapuestos en la misma medición.** Dentro de la rama de Más la marca dice **Más**, así que el hecho
nuevo es **falso** `por construcción` y la decisión sigue cayendo en `collapse-then-replace` —
incluido su **caso degenerado** (la ruta debajo de Más coincide con el destino ⇒ `doble-retroceso`, el
camino de E-5), sin dejar dos entradas con el mismo pathname pegadas.

⇒ Y en la **pila de dos escalones** de la rama la marca dice la **raíz**, así que el hecho nuevo es
**verdadero**: el gesto es el retroceso, el dueño queda en la raíz con **un** escalón y el armado del
aterrizaje dice **armar**. Es `Más → tocar Inicio` resuelto como retroceso, que es la **consecuencia
declarada** de este plan: ese recorrido ya **no** vuelve a Más con el atrás — avisa para salir, y el
dueño lo decidió así el **2026-10-27** (`03-DECISION-UAT-2.md`).

### E-16 · las DOS formas en las que la regla NO se dispara, y qué ve el dueño en cada una

Veredicto: **OK**. Lo agregó el plan **03-09**. Es la **degradación segura** y el **límite honesto**,
medidos en vez de prometidos.

**Mitad A — la marca PERDIDA** (el estado de la entrada de arriba pisado por un reemplazo blando
ajeno: un `replaceState` con un state que no lleva nuestra clave y **sin** url, que es literalmente lo
que hace el router al sincronizar el suyo — el molde de E-13 mitad B):

```
mitad_A_marca_con_el_estado_pisado:               {"router":"ajeno"}
mitad_A_hecho_nuevo_la_marca_dice_la_raiz:        false
mitad_A_hecho_de_la_rama_la_marca_dice_mas:       false
mitad_A_plan:                                     "push"
mitad_A_el_plan_pide_un_retroceso:                false
mitad_A_camino_del_atras_antes:                   ["/dashboard","/clients"]
mitad_A_camino_del_atras_despues:                 ["/dashboard","/clients","/dashboard"]
mitad_A_el_camino_del_atras_crecio_un_escalon:    true
mitad_A_marca_de_la_entrada_nueva:                {"frjUnder":"/clients"}
mitad_A_accion_de_armado:                         "no-armar"
```

⇒ **SIN EL HECHO, JAMÁS UN RETROCESO.** Los dos hechos en falso ⇒ la decisión **empuja**: cero
retrocesos, la pila **un escalón más larga** y el dueño **dentro** del sitio. Un `back()` sobre una
entrada que no empujamos nosotros lo **expulsaría** (cicatriz 2, ya sufrida tres veces en este repo).
Y lo que se **declara en vez de esconder**: en esa entrada nueva el armado dice **no armar**, porque
el marcado anota la sección debajo. Con la marca perdida el dueño pierde **el aviso**, nunca **el
sitio**.

**Mitad B — la raíz que NO está inmediatamente debajo** (la pila de **tres** escalones que D-02 acepta
a propósito: raíz, una sección de la barra, Más encima):

```
mitad_B_marca_de_la_entrada_de_arriba:        {"frjUnder":"/appointments"}
mitad_B_hecho_nuevo_la_marca_dice_la_raiz:    false
mitad_B_hecho_de_la_rama_la_marca_dice_mas:   false
mitad_B_plan:                                 "push"
mitad_B_camino_del_atras:                     ["/dashboard","/appointments","/mas","/dashboard"]
mitad_B_atras_cae_en:                         "/mas"
mitad_B_accion_de_armado:                     "no-armar"
mitad_B_pathname_antes_del_atras:             "/dashboard"
mitad_B_pathname_tras_el_atras:               "/mas"
mitad_B_el_atras_hace_algo_visible:           true
```

⇒ **EL LÍMITE DE LA REGLA, MEDIDO Y DECLARADO.** La marca de la entrada de arriba dice **la sección**,
no la raíz, así que el hecho nuevo es **falso** y el gesto **sigue empujando**: un retroceso de un
paso aterrizaría en **Turnos** y no en Inicio. Y lo que ve el dueño desde ahí está bien en los dos
frentes: el atrás **hace algo visible** (vuelve a **Más**), que es el invariante del criterio 2, y el
armado dice **no armar** porque hay algo nuestro debajo — la **decisión (a)** funcionando, no un
agujero.

### E-17 · G3-1 — la CADENA de `replace` cruzada con la regla `-1c` y con el sentinel de salida

Veredicto: **OK** (2026-10-28). Lo agregó el plan **03-11**. Es `G3-1` entero medido como números, con
**tres mitades en la misma corrida** — y la pieza que lo hizo visible es nueva: el **reemplazo del
`<Link>` tal como es** (`reemplazarComoElRouter`), o sea un reemplazo que cambia la ruta **y escribe
el state del router encima**. Los dieciséis escenarios anteriores medían marcas **por separado** y
**ninguno** tenía dos reemplazos seguidos: por eso ninguno podía ver este gap.

**Mitad A — la forma de hoy** (`Inicio → Turnos → Clientes → Agenda → tocar Inicio`, sin propagar):

```
mitad_A_hash_al_entrar_a_inicio:                  "#salir"
mitad_A_marca_en_la_primera_seccion:              {"frjUnder":"/dashboard"}
mitad_A_marca_tras_el_primer_reemplazo:           {"router":"ajeno"}
mitad_A_marca_tras_los_dos_reemplazos:            {"router":"ajeno"}
mitad_A_hecho_nuevo_la_marca_dice_la_raiz:        false
mitad_A_hecho_de_la_rama_la_marca_dice_mas:       false
mitad_A_plan:                                     "push"
mitad_A_profundidades_antes_y_despues:            [2,3]
mitad_A_camino_del_atras_despues:                 ["/dashboard","/agenda","/dashboard"]
mitad_A_marca_de_la_entrada_de_inicio:            {"frjUnder":"/agenda"}
mitad_A_accion_de_armado:                         "no-armar"
mitad_A_el_sentinel_en_el_camino_del_atras:       []
```

⇒ **EL GAP, EN DOS LÍNEAS.** La primera sección **sí** tiene la marca (la escribió el empuje del
segundo paso del sentinel) y **después del primer reemplazo ya no está**: el router escribió su propio
state encima y **nadie la vuelve a escribir**. Parado en Agenda el hecho de la regla `-1c` es **falso**
⇒ el gesto **empuja** ⇒ la entrada nueva de Inicio queda marcada con `/agenda` ⇒ la séptima regla dice
**no armar** ⇒ **cero** entradas con el hash en el camino del atrás. Es textual lo que el dueño
reportó: *«toqué inicio y sale sin el hash, y atrás me lleva a donde estaba antes»*.

**Mitad B — la marca VIAJANDO** (el mismo recorrido, leyendo antes de cada reemplazo y propagando
después):

```
mitad_B_hash_al_entrar_a_inicio:                          "#salir"
mitad_B_la_propagacion_escribio_en_cada_tramo:            [true,true]
mitad_B_marca_tras_el_primer_reemplazo:                   {"frjUnder":"/dashboard"}
mitad_B_marca_tras_los_dos_reemplazos:                    {"frjUnder":"/dashboard"}
mitad_B_hecho_nuevo_la_marca_dice_la_raiz:                true
mitad_B_hecho_de_la_rama_la_marca_dice_mas:               false
mitad_B_plan:                                             "up"
mitad_B_profundidades_antes_y_despues:                    [2,1]
mitad_B_parado_tras_el_retroceso:                         "/dashboard"
mitad_B_marca_del_aterrizaje:                             null
mitad_B_accion_de_armado:                                 "armar"
mitad_B_hash_empujado_por_el_armado:                      "#salir"
mitad_B_pares_adyacentes_con_el_mismo_pathname_al_armar:  1
```

⇒ **LO QUE SE PERDIÓ, VOLVIÓ.** La marca sobrevive la **cadena entera** —dice la raíz después de los
**dos** reemplazos, no después de uno—, el plan pasa a ser el **retroceso**, el dueño aterriza en la
entrada **original** de Inicio (sin nada nuestro debajo), el armado **procede** y el hash empujado es
el **base** y nunca el escalado. El **único** par adyacente con el mismo pathname es el par
raíz / raíz-con-el-hash, que es la **condición de existencia** de la entrada del sentinel y **no** un
atrás muerto.

**Mitad C — la marca que NUNCA se leyó** (ya pisada antes del primer reemplazo):

```
mitad_C_valor_leido:                          null
mitad_C_la_propagacion_escribio:              false
mitad_C_marca_tras_el_reemplazo:              {"router":"ajeno"}
mitad_C_hecho_nuevo_la_marca_dice_la_raiz:    false
mitad_C_plan:                                 "push"
mitad_C_profundidades_antes_y_despues:        [2,3]
```

⇒ **SIN VALOR LEÍDO NO SE INVENTA NINGUNO**, y la abstención queda **medida** en vez de prometida: la
propagación devuelve *no escribió*, el hecho queda falso, el gesto empuja y la pila queda **un escalón
más larga**. La degradación segura de toda la fase: un escalón más, **nunca** el dueño fuera del sitio.

**El contraste, en la misma corrida y como números** —que es lo que el gap pedía—:

```
contraste_plan_A_contra_B:                        ["push","up"]
contraste_profundidad_final_A_contra_B:           [3,1]
contraste_la_marca_sobrevivio_la_cadena_A_B_C:    [false,true,false]
```

⇒ **La única diferencia entre los dos recorridos del dueño es UN REEMPLAZO.** Medido por contraste en
el mismo motor y el mismo día: `Inicio → Clientes → tocar Inicio` (una sola sección) **pasa**, y
`Inicio → Turnos → Clientes → Agenda → tocar Inicio` **falla**. Acá eso queda como `[3,1]` de
profundidad final y `["push","up"]` de plan.

**Probado en rojo, y con el rojo que salió escrito:** con la propagación mutada a un no-op, la sonda
**no puede completar la medición** y sale **1** — `la entrada de arriba NO lleva nuestra marca: un
back() acá seria sobre entrada ajena`, que es el retroceso guardado **negándose**. O sea que el verde
de la mitad B **depende** de que la marca haya viajado, y el modo de falla sin ella es la **negativa**
y no una expulsión.

### E-18 · G3-1 dentro de la rama de Más: la propagación no le roba el gesto al colapso

Veredicto: **OK** (2026-10-28). Lo agregó el plan **03-11**. La propagación se escribió **general**
—viaja cualquier ruta leída, porque *un reemplazo no cambia lo que hay debajo* es cierto para
cualquier valor—, así que el costo de esa generalidad se **mide** acá en vez de suponerse.

**Mitad A — D-03 por encima del reemplazo** (raíz, Más y una sección de Más por **empuje**, y de ahí
**dos** secciones más de Más por **reemplazo**, propagando):

```
mitad_A_valores_leidos_antes_de_cada_reemplazo:   ["/mas","/mas"]
mitad_A_la_propagacion_escribio_en_cada_tramo:    [true,true]
mitad_A_marca_tras_los_dos_reemplazos:            {"frjUnder":"/mas"}
mitad_A_hecho_de_la_rama_la_marca_dice_mas:       true
mitad_A_hecho_nuevo_la_marca_dice_la_raiz:        false
mitad_A_plan_con_la_propagacion:                  "up"
mitad_A_plan_sin_la_propagacion:                  "push"
mitad_A_parado_tras_el_retroceso:                 "/mas"
mitad_A_marca_del_aterrizaje:                     {"frjUnder":"/dashboard"}
mitad_A_camino_del_atras_tras_el_retroceso:       ["/dashboard","/mas"]
mitad_A_accion_de_armado:                         "no-armar"
```

⇒ **D-03 SE SOSTIENE POR ENCIMA DEL REEMPLAZO, y eso es una mejora medida y no un efecto colateral.**
Dentro de la rama la marca sigue diciendo **Más** después de los dos reemplazos, así que tocar Más
desde ahí **sube** — que es literalmente lo que D-03 pide — y **sin** la propagación el mismo gesto
habría **apilado**. El armado dice *no armar* porque no estamos en la raíz: el aviso es de MOB-05 y
vive en Inicio.

**Mitad B — la propagación no le roba el gesto al colapso** (desde esa misma pila, un destino **de la
barra**):

```
mitad_B_la_propagacion_escribio_en_cada_tramo:        [true,true]
mitad_B_hecho_de_la_rama_la_marca_dice_mas:           true
mitad_B_hecho_nuevo_la_marca_dice_la_raiz:            false
mitad_B_plan:                                         "collapse-then-replace"
mitad_B_rama_del_colapso:                             "retroceso-y-reemplazo"
mitad_B_marca_leida_en_la_entrada_de_mas:             "/dashboard"
mitad_B_camino_del_atras:                             ["/dashboard","/clients"]
mitad_B_marca_del_destino:                            {"frjUnder":"/dashboard"}
mitad_B_pares_adyacentes_con_el_mismo_pathname:       0
```

⇒ **EL COLAPSO SIGUE SIENDO EL DUEÑO DE ESE GESTO.** El hecho nuevo sigue **falso** (la marca dice
Más, no la raíz) ⇒ la decisión sigue siendo **colapsar y reemplazar**, y no quedan dos entradas con el
mismo pathname pegadas: **cero** pares adyacentes, o sea ningún atrás muerto (criterio 2).

**El límite declarado de D-02, re-afirmado acá** (pila de **tres** escalones, **todo por empuje y sin
ningún reemplazo en el camino**):

```
limite_marca_de_la_entrada_de_arriba:         {"frjUnder":"/appointments"}
limite_hecho_nuevo_la_marca_dice_la_raiz:     false
limite_plan:                                  "push"
limite_camino_del_atras:                      ["/dashboard","/appointments","/mas","/dashboard"]
limite_atras_cae_en:                          "/mas"
limite_accion_de_armado:                      "no-armar"
```

⇒ **NO ES UN DEFECTO Y SE MIDE PARA QUE NADIE LO "ARREGLE" DE PASO.** Sin ningún reemplazo en el
camino la propagación **no participa**: la marca de arriba dice la **sección** y no la raíz, el hecho
es **falso**, el gesto **sigue empujando** y el atrás desde ahí **sigue cayendo en Más**. MOB-04 lo
registra con fecha y el bloque **2.3** del guion de la ronda 3 le avisa al dueño que es lo esperado.

### ⚠ EL RESIDUO DEL CAMINO DEL GUARD, declarado acá con su fecha (2026-10-28) en vez de descubierto en la ronda 4

**El alcance exacto, y es chico a propósito:** el **guard de cambios sin guardar** ejecuta su propio
reemplazo (`case 'replace': navegar(href, plan)`) y **no** pasa por el gesto de la barra, así que en
una pantalla **sucia** que sale por el guard la marca **se sigue perdiendo** y el gesto siguiente hacia
Inicio queda **un escalón más largo** — **nunca** una expulsión. Es exactamente la forma de la mitad C
de **E-17**, que es donde queda medida.

**Por qué no se cableó allá:** exigiría una **segunda** lectura del estado en el mismo gesto —dos
verdades que pueden diferir, que es la lección 1 de este módulo— más un **parámetro nuevo** en el
ejecutor compartido. Se **acepta** con el mismo criterio con el que se aceptó el residuo de escritorio
del plan 03-09: es la **degradación segura** de toda la fase, no una expulsión.

**Queda escrito en los CUATRO lugares donde se puede leer**, los cuatro con esta fecha: el docblock
del canal en `lib/panel-branch.ts`, este documento, la precisión de **MOB-04** en
`REQUIREMENTS.md` y la entrada **18** de `.planning/WINDOWS.md`.

**Y los TRES no-defectos de la fase siguen intactos, uno por uno:**

- la **pila de tres escalones** de D-02 —`Inicio → Turnos → Más → tocar Inicio`— **sigue empujando** y
  su atrás **sigue volviendo a Más**: ahí no hay ningún reemplazo en el camino y la propagación no
  participa. Medido arriba, en el bloque del límite de **E-18**;
- `Más → tocar Inicio → atrás` **sigue avisando para salir** (decisión del dueño del 2026-10-27): ese
  recorrido tampoco tiene un reemplazo en el camino;
- el **residuo de escritorio** de la revisión acotada del criterio 6 queda **tal como está**, ni
  ampliado ni tapado.

### ⚠ EL RESIDUO DE ESCRITORIO DE G2-1, declarado acá con su fecha en vez de descubierto en la próxima UAT

**Revisión ACOTADA del criterio 6, aceptada el 2026-10-27. No es una renuncia.**

Hasta este plan, el criterio 6 —*escritorio no se entera*— se sostenía **por construcción** a través
del hecho: `masDebajo` pregunta si la marca **dice Más**, y en escritorio nada navega a `/mas`, así
que el hecho era **siempre falso**. Con la regla nueva eso **ya no alcanza**: el hecho nuevo pregunta
si la marca **dice la raíz**, y en escritorio la marca **sí** puede decir la raíz.

Lo que sostiene el criterio 6 ahora son **dos hechos del cableado**, no el hecho de la pila:

- la **barra inferior se oculta a ≥1024px**, así que sus links **no se pueden tocar** y su
  `handleNavigate` **nunca corre** en escritorio;
- el **guard de cambios sin guardar** sólo computa un plan de rama cuando la pantalla está **sucia**.

⇒ **El residuo es UN SOLO CASO:** salir de una pantalla **con cambios sin guardar** hacia **Inicio**
**desde el sidebar**, donde el atrás queda **un escalón más corto**. Se **acepta**.

⇒ **Y lo que NO se hace para taparlo: un chequeo del ancho de la pantalla.** Gatear esta política por
viewport es exactamente lo que **NAV-05** y el criterio 6 existen para prohibir. El residuo se
**declara** en los tres lugares donde se puede leer —el docblock de la regla en `lib/panel-history.ts`,
el guard **donde se produce** y este documento—, y hay un gate que cuenta **cero** consultas de ancho
en los cuatro archivos de la política y sus consumidores.

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
- **Plan 03-07** — **E-13**, que es el que mide el **ciclo** de re-armado repetido ×3 sin acumular
  entradas (mitad A) y el **origen medido del hash escalado** (mitad B): con el estado de la entrada
  **pisado** por una escritura ajena, las **cinco** reglas viejas dicen `armar` y la **séptima** dice
  `no-armar`. Esa medición **es** el argumento de la séptima regla. Y lo que E-13 **no puede cerrar**
  —el cableado de React, o sea A1, A2 y A11— va a la UAT del plan `03-08`.
- **Plan 03-09** — **E-14** (el ciclo Inicio↔sección: la forma vieja con su crecimiento de **dos
  entradas por vuelta sin techo** y su aviso ausente, contra la nueva con profundidad fija y el aviso
  armándose solo), **E-15** (que la regla nueva **no le roba** el gesto al colapso dentro de la rama
  de Más, incluido el degenerado) y **E-16** (las **dos** formas en las que la regla **no** se
  dispara: la marca perdida y la raíz que no está inmediatamente debajo). Más el **residuo de
  escritorio** con su fecha, en su propia sección de arriba.
- **Cualquiera de los siete** puede re-correr la sonda: si una pila deja de coincidir, el arreglo
  **no es ajustar la expectativa** — es rehacer el diseño contra lo medido y actualizar este
  documento.
