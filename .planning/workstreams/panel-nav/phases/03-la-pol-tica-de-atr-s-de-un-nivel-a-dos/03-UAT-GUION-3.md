# Phase 3 — UAT, RONDA 3: lo que la regla nueva cambió, y nada más

**Fecha del guion:** 2026-10-27 · **Ronda:** 3 · **Plan:** `03-10`
**Dónde se anotan los resultados:** en `03-UAT-2.md`, como sección **Ronda 3**, con fecha y motor,
**sin reinterpretar** lo que ya está anotado de las rondas 1 y 2.

---

## La regla que gobierna todo este documento

⚠ **Esto NO es la ronda 2 otra vez, y mucho menos la 1.** La ronda 2 se corrió el 2026-10-27 en Android
y quedó **interrumpida a propósito** en el ítem 19: corrieron **cuatro** recorridos —**7**, **8** y
**15** pasaron, y **19 falló** ⇒ gap **`G2-1`**— y los otros **seis** quedaron **sin correr** porque la
regla del plan `03-09` **cambia la pila**, así que medirlos antes habría medido el comportamiento
viejo. Cada uno de los diez ítems quedó con su resultado escrito en `03-UAT-GUION-2.md`.

Este guion **no re-corre los 21 ítems en Android**. Vuelve: el **gap**, lo que la regla nueva **toca**,
y las dos mitades que **nunca** se midieron. **Cada ítem que vuelve trae escrito su motivo medido**, y
cada uno que **no** vuelve también (bloque 5). Un ítem que vuelve sin motivo es tiempo del dueño
gastado por las dudas; un ítem excluido sin motivo es un agujero.

**Cuánto es:** **ocho recorridos en Android** (bloques 1 a 4) y **los 21 en iPhone** (bloque 6).

---

## Antes de empezar — lo que hay que levantar

1. **Docker + Supabase local.** `npx supabase start`, y después `npx supabase status` tiene que
   responder. El seed del negocio de prueba vive ahí.
2. **El dev server:** `npm run dev`. ⚠ Si el puerto quedó colgado de una sesión anterior (ya pasó:
   acepta la conexión TCP y no responde), **matar el proceso** antes.
3. **Desde el teléfono, en la misma red Wi-Fi:** `http://<IP-de-la-LAN>:3000/`.
   ⚠ **Paso previo obligatorio, ya sufrido:** la IP tiene que estar en `allowedDevOrigins` de
   `next.config.ts`. Hoy están listadas **`192.168.0.7`, `192.168.0.3` y `192.168.0.10`** (las IPs son
   por DHCP y el router ya cambió la asignación **dos** veces). Si `Get-NetIPAddress` dice una cuarta,
   **hay que agregarla**: sin eso el teléfono pide `_next/*` desde otro origen, Next lo bloquea, **la
   página no hidrata** y nada de esta fase funciona — **y no es un bug de la fase.**
4. **Login:** `test@forjo.local` / `Forjo1234!` (seed local, slug `negocio-prueba`).
5. ⚠ **PESTAÑA NUEVA POR RECORRIDO, siempre.** El estado runtime de esta fase **es la pila del
   navegador**: una pestaña abierta conserva entradas **sin las marcas nuevas** y corre **el bundle
   viejo**. Y lo que esta ronda mide es justamente **la forma de la pila**, así que una pestaña
   arrastrada no reproduce lo que el guion dice.
6. **Dos teléfonos: Android Chrome Y iPhone Safari.** El supuesto **A11** no se cierra con uno.

**Cómo se marca cada ítem:**

- ✅ **pasa**
- ❌ **falla** — con **lo que se vio**, textual, no con la interpretación de por qué
- ⚠ **no corrible** — con el motivo. **Un ítem que no se puede correr se declara, no se marca.**

---

## Bloque 0 · El observable: mirar la URL antes de cada ciclo del aviso

Esto va **primero** en cada ciclo, y convierte el modo de falla más caro de esta fase —que es
**silencioso**— en un chequeo **de un vistazo**, sin herramientas y sin consola.

| Momento | Qué tiene que mostrar la URL | Si no |
|---|---|---|
| **Parado en Inicio, con el sentinel armado** | la URL **muestra el hash**: `…/dashboard#salir…` | **el sentinel NO está armado** y el atrás va a salir de una ⇒ se anota **fallo sin esperar a ver el resultado** del atrás |
| **Después de salir de Inicio hacia un destino** | **ninguna** entrada del camino del atrás puede quedar con ese hash | el ejecutor de dos pasos se negó: el atrás va a aterrizar en una entrada de la raíz **con hash**, que *se ve igual que Inicio*, y el atrás **siguiente** va a quedar muerto |

⚠ **La implicación vale en los dos sentidos, y eso es lo nuevo de esta ronda:** con el sentinel armado
la URL de Inicio **muestra** su hash, así que *tocar Inicio y mirar la barra de direcciones* es la
verificación del gap `G2-1` entera. **Y al revés:** si después de tocar Inicio la URL **no** muestra el
hash, el aviso **no** está armado y el atrás va a salir de una — eso ya es un **fallo**, y se anota
**antes** de apretar atrás.

---

## Bloque 1 · El gap (Android)

### 1.1 — El recorrido del dueño, textual

Entrar a Inicio, hacer **varias cosas** (Turnos, Clientes, Agenda) y **tocar Inicio**.

- **Tiene que:** aterrizar en **Inicio**, la URL **mostrar el hash**, el **primer** atrás **avisar y no
  salir**, y el **segundo** salir.
- *Antes (medido, textual del dueño):* *«al tocar inicio después de haber hecho otras cosas cae a
  /dashboard y la guarda de salir no está. Tengo que empezar a hacer atrás por todo lo que estuve
  tocando hasta que llega a la primer vez que toqué inicio y aparece #salir»*.
- *Motivo (**corregido el 2026-10-28**: la regla del plan `03-09` sola **no alcanzaba**, y este
  recorrido es el que lo destapó — gap `G3-1`):* esa regla hace que **sección → raíz** sea un
  **retroceso**, y es correcta; pero el hecho que lee —*la marca dice la raíz*— **se perdía en la
  cadena de `replace`** de sección a sección: la marca se escribía sólo cuando la política dice
  empujar, y el reemplazo deja que el router escriba su propio state encima. Con un paseo por **varias**
  secciones la entrada ya no tenía marca ⇒ el hecho era falso ⇒ el gesto **empujaba**. El plan `03-11`
  lo cierra haciendo que la marca **viaje** por encima del reemplazo. Medido en **E-17** (la forma
  vieja contra la nueva, en la misma corrida: plan `push` contra `up`, profundidad final `3` contra
  `1`), y la regla de un solo escalón sigue medida en **E-14**.

### 1.2 — Su mitad de pila, que es la otra cara del mismo gap

Repetir **tres veces** el ciclo `Inicio → Clientes → tocar Inicio`.

- **Tiene que:** seguir **avisando en la tercera vuelta**, y **no acumular** — el atrás, después de
  salir del aviso, **no** tiene que recorrer una por una las secciones que el dueño tocó.
- *Antes (medido como número):* la pila crecía **dos entradas por vuelta sin techo**, `3 → 5 → 7`.
  Ahora son `1, 1, 1`. Medido en **E-14**, las dos mitades en la misma corrida.
- ⚠ **ESTE ES EL RECORRIDO QUE SEPARÓ LAS HIPÓTESIS, el 2026-10-28, y PASÓ** (*«salió con el hash»*).
  Por eso vuelve: con **una sola** sección la marca estaba y el aviso se armó, lo que probó que el
  teléfono corría el bundle **nuevo** y que la regla `-1c` **sí** dispara — descartó la hipótesis de
  *la regla no está en el bundle* y confirmó que el defecto era la **cadena** de reemplazos (`G3-1`).
  Se re-corre igual, porque el arreglo del plan `03-11` **cambia la forma de la pila** y lo medido
  antes midió otra cosa.

### 1.3 — El ítem 19, tal cual

El aviso entrando **directo** a Inicio (pestaña nueva **y** recarga, las dos formas), el ciclo **tres
veces**.

- **Tiene que:** el primer atrás **no sale** y avisa, las tres veces igual.
- *Motivo:* es el ítem que **falló** en la ronda 2 y es el gap `G2-1`. Vuelve **sin reescribir el
  recorrido**, para que los resultados sigan siendo comparables entre rondas.
- **Abrir cada ciclo con el bloque 0.**

---

## Bloque 2 · Lo que la regla nueva cambia, y hay que mirarlo A PROPÓSITO (Android)

Estos tres están **acá** y no en una nota al pie porque si el dueño los corre con el guion viejo los va
a reportar como bugs, y la ronda se traba en una discusión en vez de en un defecto.

### 2.1 — `Más → tocar Inicio → atrás`: **ya no vuelve a Más**

- **Qué pasa ahora:** tocar Inicio desde Más **consume** la entrada de Más, así que el dueño queda en
  Inicio **sin nada nuestro debajo** ⇒ la URL **muestra el hash** y el atrás **avisa para salir**.
- ⚠ **Es la consecuencia DECLARADA, no una regresión.** Está escrita con fecha **2026-10-27** debajo de
  MOB-05 en `REQUIREMENTS.md` y decidida por el dueño en `03-DECISION-UAT-2.md`. Es, además,
  **exactamente lo que el dueño pidió en `G2-1`**: *«parado en Inicio, el primer atrás avisa y no
  sale»*. La `decision (a)` **no** cambió (sigue siendo *armar sólo si no hay nada nuestro debajo*): lo
  que cambió es la **pila** que esa regla lee. Y MOB-04 por el lado del **gesto de atrás** tampoco: el
  atrás desde Más sigue cayendo en **Inicio**.
- **Qué sería un fallo acá:** que el atrás **salga sin avisar**, o que el **hash no aparezca**.
- *Motivo:* medido en **E-15** mitad A (la marca dice la raíz ⇒ retroceso, aterrizaje sin marca, armado
  en `armar`).

### 2.2 — `Más → una sección de Más → tocar Inicio`

- **Tiene que:** aterrizar en **Inicio** **sin pasar por una pantalla intermedia**, y el atrás tiene
  que hacer **algo visible al primer toque**.
- *Motivo:* acá la regla nueva **no participa** —la marca dice **Más**, así que el hecho nuevo es falso
  por construcción— y lo resuelve el **colapso de siempre**. Medido en **E-15** mitad B, incluido su
  caso degenerado.

### 2.3 — `Inicio → Turnos → Más → tocar Inicio` (la pila de **tres** escalones de D-02)

- **Tiene que:** el gesto **apila**, y el atrás vuelve a **Más**.
- ⚠ **Es el LÍMITE DECLARADO, no un bug.** La raíz **no** es la entrada inmediatamente de abajo, así
  que la regla nueva **no** se dispara. El aviso **no** aparece porque **hay algo nuestro debajo**, y
  el atrás **hace algo visible** (vuelve a Más) — la `decision (a)` funcionando. Lo que la fase promete
  es que **el ciclo no crece sin techo**, no que la pila nunca pase de dos escalones.
- *Motivo:* medido en **E-16** mitad B.

---

## Bloque 3 · Lo que faltó medir en la ronda 2 y la regla nueva no cambió (Android)

### 3.1 — El ítem 20: el re-armado al expirar la ventana

Apretar atrás una vez, **esperar a que el aviso desaparezca**, apretar atrás otra vez.

- **Tiene que:** **volver a avisar**. No salir de una.
- *Antes (medido):* *«si toco atrás una vez, pasan 30 segundos, y toco el segundo atrás, sale de una»*.

### 3.2 — La parte de overlay del 20, que NUNCA se midió en ninguna ronda

Con un **overlay abierto**:

1. el atrás **cierra el overlay** y el aviso **no** aparece;
2. el atrás **siguiente** **vuelve a avisar**, en vez de salir de una.

⚠ **Cuál overlay usar, dicho acá porque la ronda 1 se frenó en** *«no tengo overlays en inicio como
para probar eso»*:

- **Primera opción — en Inicio**, cualquier hoja, drawer o selector que la pantalla pueda abrir. Es la
  forma que prueba el caso **exacto** (el overlay y el sentinel en la **misma** pantalla).
- **Si Inicio no tiene ninguno — se corre en la sección que sí lo tiene y se anota así, con el
  motivo**: el **alta de turno**, el **selector de hora** o el **campo de fecha / calendario**. Eso
  **no** cubre el caso exacto —el aviso de salida vive en la raíz— así que la mitad 2 queda
  **declarada como no corrible**, no marcada.

**Un ítem que no se puede correr se declara, no se marca.**

---

## Bloque 4 · El residuo de escritorio, verificado como lo que es (escritorio ≥1024px)

### 4.1 — El residuo

Salir de **`/web` con cambios sin guardar** hacia **Inicio desde el sidebar**, eligiendo *Salir sin
guardar*.

- **Qué va a pasar:** aterriza en Inicio y el atrás queda **un escalón más corto** que antes.
- ⚠ **Está ACEPTADO y FECHADO (2026-10-27): se corre para VERLO, no para arreglarlo.** Es el único caso
  de residuo que la revisión acotada del criterio 6 declara (ROADMAP del workstream, y entrada propia
  en `.planning/WINDOWS.md`).
- **Lo que SÍ sería un fallo:** que el dueño termine **fuera del sitio**, o que el atrás **no haga nada
  visible**.
- *Motivo:* el guard de cambios sin guardar es el **único** camino por el que la regla puede correr en
  escritorio (la barra se oculta a ≥1024px y ese camino pide la pantalla **sucia**).

### 4.2 — Su gemelo barato

El mismo recorrido del **sidebar** pero **sin** cambios sin guardar.

- **Tiene que:** dar **exactamente lo de hoy** (criterio 6).

---

## Bloque 5 · Lo que NO vuelve en Android, y por qué

| # | Por qué no vuelve |
|---|---|
| **7**, **8** y **15** | **pasaron** en la ronda 2 y la regla nueva **no toca su camino**: los tres cruzan desde una sección **de la rama de Más** hacia un destino de la barra, donde el hecho nuevo es **falso por construcción** (la marca dice Más) y la decisión sigue siendo el colapso. Su cobertura nueva está en **E-15** mitad B |
| **1-5** | el toque **desde** Inicio con el sentinel armado sigue resolviéndose por el **mismo** camino de dos pasos (consumir el sentinel y recién entonces navegar), que la regla nueva **no** modifica: va **antes** en el orden de reglas. Su mitad que sí cambió —el **regreso** a Inicio— está en el **bloque 1**, con el recorrido del dueño |
| **10-13** | los cuatro quicks de octubre (overlay, selector de hora, calendario y teclado) ya **pasaron** en Android, y la regla nueva no toca el armado ni el retroceso **ignorado**. Lo que les queda es **iPhone** (bloque 6) |
| **16** | la cadena de tres pasos del guard hacia **Más**: su destino es Más, **no la raíz**, así que el hecho nuevo es falso y el camino es el de siempre. Lo que **sí** vuelve del guard es el **bloque 4**, que es el caso que la regla **sí** cambia |

---

## Bloque 6 · El pase completo de iPhone / Safari (A11)

**Los 21 ítems del guion de la ronda 1. Todos.** El motivo es que en **Safari nada** de esta fase se
verificó, y todo lo medido en este repo sobre el retroceso fue **Chrome de escritorio sin pantalla**.
Acá no hay regresión dirigida que valga: no hay ronda previa de la cual recortar.

**Qué mirar distinto en iOS:**

1. **El atrás de iOS es un gesto de borde, no un botón.** Se dispara arrastrando desde el borde
   izquierdo, es **continuo** (se puede soltar a mitad de camino) y puede entregar su `popstate` en un
   momento distinto al del botón de Android. Es la variable que ningún motor sin pantalla mide.
2. **La franja de gestos del notch / el home indicator.** En una **pestaña del navegador** esto no
   aplica —la barra de direcciones de Safari vive **abajo**—. Se verifica que siga siendo así.
3. **La barra de direcciones de Safari, abajo y sobre el ancla del aviso.** El aviso se ancla 8px
   arriba de la barra inferior, y la toolbar de Safari **se colapsa y se expande al scrollear**. Hay
   que ver que el aviso **se vea completo y no quede tapado**, antes y después de scrollear.
4. **Que el aviso quede legible en UNA sola línea** con la tipografía y el ancho de iOS.
5. **El teclado**, que en iOS desplaza el layout viewport por su cuenta y ya costó cuatro quicks en
   este repo.

⚠ **El bloque 0 vale igual en iPhone:** el **hash** en la URL es el mismo observable, y en Safari la
barra de direcciones está abajo — hay que mirarla ahí.

---

## Bloque 7 · Qué cierra esto, y dónde se anota

### Los tres supuestos que SÓLO esta UAT puede cerrar

| Supuesto | Qué es | Por qué nada más lo cierra |
|---|---|---|
| **A1** | el **orden** del efecto que escribe la marca contra la escritura del router | si está mal, la marca **no se escribe** y la política degrada a **apilar en silencio**: no lo ve `tsc`, ni la suite, ni el build |
| **A2** | que **no haya otro commit del router en vuelo** cuando el nuestro aterriza | es una carrera de runtime real, y la sonda **no corre el código de la app** |
| **A11** | **los dos motores reales** (Chrome Android y Safari iOS) | todo lo medido en este repo fue Chrome de escritorio sin pantalla |

⚠ **Un pipeline verde NO es evidencia.** La ronda 1 llegó con la sonda en **8/8** y encontró **cinco
fallos más una colisión de diseño**; la ronda 2 llegó con **13/13** y encontró **`G2-1`**. Hoy la sonda
da 16/16, y eso sigue midiendo un espacio que no incluye lo que el teléfono prueba.

### Dónde se anota

En **`03-UAT-2.md`**, como sección **Ronda 3**, con **fecha y motor**, **sin reinterpretar** lo que ya
está escrito de las rondas anteriores.

### La condición de cierre — el motivo de cada requisito es distinto

| Requisito | Se marca si | Por qué eso y no más |
|---|---|---|
| **MOB-04** | pasan los bloques **1 a 4** en Android **y** el bloque **6** en iPhone | el gap `G2-1` es suyo, los tres recorridos del bloque 2 son los que la regla nueva le cambió, y A11 sigue abierto para el conjunto entero |
| **MOB-05** | pasan los bloques **1 a 4** en Android **y** el bloque **6** en iPhone | el fallo 19 es del aviso, el 20 es su re-armado, y la consecuencia declarada del bloque 2 sale de **su** decisión |
| **MOB-06** | pasa el bloque **6** en iPhone, más la **parte de overlay** del bloque 3 | su parte de Android ya está afirmada (`cero regresion`, bloque E de la ronda 1): le debe **sólo iPhone** |

**Si algo falla**, los tres **vuelven a quedar sin marcar**, el fallo se anota **con lo que se vio** y
entra como **gap de una ronda nueva** — no se interpreta ni se arregla en el momento. El hallazgo vale
más que el verde del pipeline.
