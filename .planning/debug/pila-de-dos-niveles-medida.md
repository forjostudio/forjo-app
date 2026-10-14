---
status: measured
trigger: "Phase 3 del workstream panel-nav: medir la pila REAL del navegador para los recorridos de la política de dos niveles, antes de que 03-02, 03-03 y 03-04 escriban su mitad difícil. E-1..E-7 los agregó el plan 03-01 (Task 2); E-8 —la cadena de tres pasos del guard de salida— el plan 03-04."
created: 2026-10-13T00:00:00Z
updated: 2026-10-14T00:00:00Z
---

## Current Focus

veredicto: **LAS OCHO PILAS MEDIDAS COINCIDEN CON LAS ESPERADAS** (8/8, la sonda sale 0)

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
| Navegador | **Chrome/154.0.8037.98**, `--headless=new`, perfil temporal propio |
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

## Las ocho mediciones

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
- **Cualquiera de los tres** puede re-correr la sonda: si una pila deja de coincidir, el arreglo **no
  es ajustar la expectativa** — es rehacer el diseño contra lo medido y actualizar este documento.
