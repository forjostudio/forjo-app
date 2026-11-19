---
audit_acknowledged:
  milestone: v0.31
  at: 2026-11-19
  gap_snapshot: "unknown::scenarios=0"
---

# Phase 3 — UAT, RONDA 2: lo que falta, y nada más

**Fecha del guion:** 2026-10-23 · **Ronda:** 2 · **Plan:** `03-08`
**Dónde se anotan los resultados:** en `03-UAT.md`, como sección **Ronda 2**, con fecha y motor, **sin
borrar la ronda 1** — que es lo que permite leer qué cambió entre una y otra.

---

## La regla que gobierna todo este documento

⚠ **Esto NO es la ronda 1 otra vez.** De los 21 ítems del guion original, **16 pasaron** y sus marcas ya
están registradas en `03-04-SUMMARY.md` (14 las puso el dueño a mano mientras probaba, commit `7c756a5`).
Este guion **no re-corre** los 21 en Android: cubre **lo que falta** más **lo que un arreglo de esta tanda
tocó por debajo**, y **cada ítem que vuelve trae escrito su motivo medido**. Un ítem que vuelve sin motivo
es tiempo del dueño gastado por las dudas; un ítem excluido sin motivo es un agujero. Por eso están las
dos listas: el bloque 4 (lo que vuelve, con su motivo) y el bloque 5 (lo que no vuelve, con el suyo).

**Lo que la ronda 1 dejó, textual:** 16 pasan · **5 fallan** (ítems 7, 8, 15, 19, 20) · **una colisión de
diseño** (bloque H) · y **dos mitades sin medir**: la parte de overlay del ítem 20 y **todo** el pase de
iPhone.

**Cuánto es:** **18 recorridos en Android** (bloques 1 a 4) y **los 21 en iPhone** (bloque 6).

---

## Antes de empezar — lo que hay que levantar

1. **Docker + Supabase local.** `npx supabase start`, y después `npx supabase status` tiene que responder.
   El seed del negocio de prueba vive ahí.
2. **El dev server:** `npm run dev`. ⚠ Si el puerto quedó colgado de una sesión anterior (ya pasó: acepta
   la conexión TCP y no responde), **matar el proceso** antes.
3. **Desde el teléfono, en la misma red Wi-Fi:** `http://<IP-de-la-LAN>:3000/`.
   ⚠ **Paso previo obligatorio, ya sufrido:** la IP tiene que estar en `allowedDevOrigins` de
   `next.config.ts`. Hoy están listadas **`192.168.0.7`, `192.168.0.3` y `192.168.0.10`** (las IPs son por
   DHCP y el router ya cambió la asignación **dos** veces). Si `Get-NetIPAddress` dice una cuarta, **hay
   que agregarla**: sin eso el teléfono pide `_next/*` desde otro origen, Next lo bloquea, **la página no
   hidrata** y nada de esta fase funciona — **y no es un bug de la fase.**
4. **Login:** `test@forjo.local` / `Forjo1234!` (seed local, slug `negocio-prueba`).
5. ⚠ **PESTAÑA NUEVA Y RECARGA, siempre.** El estado runtime de esta fase **es la pila del navegador**:
   una pestaña abierta conserva entradas **sin las marcas nuevas** y corre **el bundle viejo**, así que
   los recorridos **no reproducen** lo que el guion dice.
6. **Dos teléfonos: Android Chrome Y iPhone Safari.** A11 no se cierra con uno.

**Cómo se marca cada ítem:**

- ✅ **pasa**
- ❌ **falla** — con **lo que se vio**, textual, no con la interpretación de por qué
- ⚠ **no corrible** — con el motivo. **Un ítem que no se puede correr se declara, no se marca.**

---

## Bloque 0 · El observable: mirar la URL antes de cada ciclo del aviso y de cada salida de Inicio

Esto va **primero** en cada ciclo, y convierte el modo de falla más caro de esta fase —que es
**silencioso**— en un chequeo de un vistazo.

| Momento | Qué tiene que mostrar la URL | Si no |
|---|---|---|
| **Parado en Inicio, con el sentinel armado** | la URL **muestra el hash**: `…/dashboard#salir…` | **el sentinel NO está armado** y el atrás va a salir de una ⇒ se anota como **fallo sin esperar a ver el resultado** |
| **Después de salir de Inicio hacia un destino** | **ninguna** entrada del camino del atrás puede quedar con ese hash | **el ejecutor de dos pasos se negó**: el atrás va a aterrizar en una entrada de la raíz **con hash**, que *se ve igual que Inicio*, y el atrás **siguiente** va a quedar muerto |

Son los **dos lados opuestos** del mismo observable, y los dos se miran. El de arriba es por qué el
bloque 1 abre cada ciclo acá; el de abajo es por qué los ítems **1 a 5** del bloque 4 se verifican
**mirando la URL y no a ojo**.

---

## Bloque 1 · Los 5 fallos de la ronda 1, arreglados (Android)

El recorrido es el de la ronda 1 **textual** — no se reescribe con otras palabras, o los resultados dejan
de ser comparables entre rondas.

### 7 (G-1) — el cruce desde una pila de tres

`Inicio → Turnos → Más → Finanzas → tocar Clientes en la barra → atrás`

- **Tiene que:** caer en **Turnos**, **sin recargar**, y al primer atrás pasar algo visible.
- **Y además:** **nunca** aterrizar en una URL con el hash del sentinel.
- *Antes (medido):* *"recarga y queda en clientes, le tuve que hacer dos atrás y volvió a
  `dashboard#salir-3`"*.
- *Motivo del arreglo:* `03-05` (escritor único de la marca de la rama + regla de dirección) y `03-06`
  (la decisión (a) no arma el sentinel con algo nuestro debajo). Medido en **E-11**.
- ⚠ **Acá se pliega el ítem 6**, que pasó: es el mismo cruce con un escalón menos, y lo que el arreglo
  cambió —la marca que el reemplazo del colapso deja— se ve en el **atrás siguiente**, así que correr 7
  cubre a 6 con el recorrido más largo.
- ✅ **Resultado ronda 2:** pasa (2026-10-27, Android/Chrome). Cayó en **Turnos** sin recargar y el
  primer atrás hizo algo visible; ninguna URL del camino quedó con el hash del sentinel. Era **G-1**,
  y queda cerrado. **No vuelve** en la ronda 3: la regla del plan `03-09` no toca su camino (la marca
  dice Más ⇒ el hecho nuevo es falso por construcción, y su cobertura nueva está en **E-15** mitad B).

### 8 (G-2) — el degenerado, y el atrás muerto

`Inicio → Turnos → Más → Finanzas → tocar Turnos en la barra`

- **Tiene que:** quedar en Turnos, y el `atrás` caer en **Inicio** **cambiando de pantalla al primer
  toque**.
- *Antes (medido):* *"a la primera que toco atrás no hace nada"* — exactamente la entrada basura que el
  criterio 2 prohíbe.
- *Motivo del arreglo:* `03-06`. Medido en **E-12** (el degenerado con el primer atrás cambiando de
  pantalla).
- ✅ **Resultado ronda 2:** pasa (2026-10-27, Android/Chrome). Quedó en Turnos y el atrás cayó en
  **Inicio** cambiando de pantalla al primer toque. Era **G-2**. ⚠ **Con una consecuencia declarada,
  no un defecto:** *«por ahí hace como una pasadita rápida por la pantalla Más y cae en inicio»* — el
  colapso son **dos pasos** y el primero es un `history.back()` de verdad que aterriza en Más, así que
  el navegador la pinta (está escrito en `03-UAT-2.md`). **No vuelve** en la ronda 3, mismo motivo que
  el 7.

### 15 (G-3) — "Salir sin guardar" desde la rama de Más

`/web` con cambios sin guardar → tocar **Más** → *Salir sin guardar*

- **Tiene que:** aterrizar en **Más** —no en una sección de una prueba anterior— y tocar Más **desde una
  sección apila** (no lleva a Inicio).
- *Antes (medido):* *"cayó en agenda (que es donde estaba antes haciendo la otra prueba) y toqué Más ahí
  dentro de agenda y me llevó a inicio en vez de más"*.
- *Motivo del arreglo:* `03-05` — la marca de la rama **dice la verdad o no dice nada**, y ningún
  retroceso la escribe.
- ⚠ **Correrlo DOS veces:** primero **con la pila limpia** (pestaña nueva), y **después** repetirlo
  viniendo de otra prueba. El fallo de la ronda 1 apareció justamente **arrastrando estado** de un
  recorrido anterior, así que la pasada limpia sola no lo hubiera encontrado.
- ✅ **Resultado ronda 2:** pasa (2026-10-27, Android/Chrome). Aterrizó en **Más** —no en la sección de
  la prueba anterior— y tocar Más desde una sección apiló en vez de llevar a Inicio. Era **G-3**. **No
  vuelve** en la ronda 3, mismo motivo que el 7 y el 8: cruza desde la rama de Más y la regla nueva no
  participa.

### 19 (G-5) — el aviso entrando directo a Inicio, tres veces

Entrando **directo** a Inicio: **pestaña nueva** y **recarga**, las dos formas.

- **Tiene que:** el primer atrás **no sale** y avisa; y el ciclo repetido **tres veces** sigue funcionando
  igual las tres.
- **Abrir cada ciclo con el bloque 0** (mirar el hash en la URL antes de apretar).
- *Antes (medido):* *"para que funcione tengo que entrar a alguna sección y volver a inicio, sino sale de
  una sin aviso"* — el armado sólo reintentaba al cambiar el pathname.
- *Motivo del arreglo:* `03-07` — la **séptima** regla de armado (si la URL ya lleva nuestro hash, no
  armar) y el **cuarto momento de reintento**. Medido en **E-13** (el ciclo ×3 sin acumular).
- ⚠ **Acá se pliega el ítem 18**, que pasó: es el mismo ciclo sin la condición de entrada directa, y 19
  lo contiene.
- ❌ **Resultado ronda 2:** falla (2026-10-27, Android/Chrome) ⇒ **gap `G2-1`**. Lo que se vio,
  **textual del dueño**: *«al tocar inicio después de haber hecho otras cosas cae a /dashboard y la
  guarda de salir no está. Tengo que empezar a hacer atrás por todo lo que estuve tocando hasta que
  llega a la primer vez que toqué inicio y aparece #salir»*. La cadena de cuatro pasos está en
  `03-UAT-2.md` (gap **`G2-1`**); la arregló el plan `03-09` haciendo que **sección → raíz** sea un
  **retroceso**. ⚠ **Acá se interrumpió la ronda a propósito:** los ítems de abajo quedaron sin correr
  porque la regla nueva **cambia la pila**. **Vuelve tal cual** en el guion de la **ronda 3**
  (`03-UAT-GUION-3.md`, bloque 1).

### 20 (G-6) — el re-armado al expirar la ventana

Apretar atrás una vez, **esperar a que el aviso desaparezca**, apretar atrás otra vez.

- **Tiene que:** **volver a avisar**. No salir de una.
- *Antes (medido):* *"si toco atrás una vez, pasan 30 segundos, y toco el segundo atrás, sale de una"*.
- *Motivo del arreglo:* misma raíz que G-5 (`03-07`); el re-armado del temporizador al expirar ahora queda
  efectivo.
- ⚠ Su **segunda mitad** —la del overlay— **nunca se midió** y va en el **bloque 3**.
- ⏸ **Resultado ronda 2:** sin correr — **motivo:** la regla del plan `03-09` **cambia la pila**, así
  que correrlo antes habría medido el **comportamiento viejo**. **Vuelve** en el guion de la **ronda
  3** (`03-UAT-GUION-3.md`, bloque 3), junto con su mitad de overlay.

---

## Bloque 2 · El bloque H bajo la decisión (a) (Android)

Esto **no es un defecto arreglado**: el **bloque H** del guion de la ronda 1 es la **colisión de diseño**
que la UAT destapó (G-4), y el dueño la resolvió eligiendo la `decision (a)`. Se verifica que la decisión
**esté funcionando**, y se verifican sus **dos mitades**, porque una sola no prueba nada:

| Mitad | Recorrido | Tiene que |
|---|---|---|
| **(a) respeta MOB-04** | `Más → Inicio → atrás` | volver a **Más**, y **NO** saltar el aviso de salida. En Inicio **con algo nuestro debajo** el aviso **no** aparece |
| **(a) no rompió MOB-05** | entrando **directo** a Inicio (pestaña nueva) → `atrás` | el aviso **sí** aparece, y el segundo atrás sale de verdad |

*Motivo:* implementada en `03-06` como la **sexta** regla del armado, la **última** de las seis (las cinco
anteriores son de seguridad, ésta es de política). Medida en **E-10**, las dos mitades.

⚠ **El límite aceptado, para no confundirlo con un bug:** si lo que quedó debajo de la raíz es una
**entrada ajena** (otro sitio, no una pantalla nuestra), **no hay forma confiable de saberlo** y el aviso
**va a aparecer igual**. Está declarado en `.planning/WINDOWS.md` y debajo de MOB-05 en `REQUIREMENTS.md`.

---

## Bloque 3 · Lo único que nunca se midió en Android: la parte de overlay del ítem 20

Con un **overlay abierto en Inicio**:

1. el `atrás` **cierra el overlay** y el aviso de salida **no** aparece;
2. el `atrás` **siguiente** **vuelve a avisar**, en vez de salir de una.

⚠ **La ronda 1 se frenó acá, y textual:** *"no tengo overlays en inicio como para probar eso"*. Por eso
este bloque dice **qué usar**:

- **Primera opción — en Inicio, si hay algo que lo abra:** cualquier hoja, drawer o selector que la
  pantalla de Inicio pueda abrir. Es la forma que prueba el caso **exacto** (el overlay y el sentinel en
  la **misma** pantalla).
- **Si Inicio no tiene ninguno — se corre en la sección que sí lo tiene** y **se anota así, con el
  motivo**: el **alta de turno** (ítem 10), el **selector de hora** (11) o el **campo de fecha /
  calendario** (12) son los overlays que la ronda 1 ya usó y que pasaron. Eso **no** cubre el caso exacto
  —el aviso de salida vive en la raíz— así que la mitad 2 queda **declarada como no corrible**, no marcada.
- ⚠ **Y el ítem del teclado (13) en Inicio tampoco es corrible tal cual:** Inicio **no tiene campos de
  texto** (barrido medido en cero). Se corre donde haya un campo y se anota el lugar.

**Un ítem que no se puede correr se declara, no se marca.** Las dos cosas que ya se sabe que pueden no ser
corribles están nombradas de antemano acá arriba a propósito: que aparezcan como ⚠ con su motivo es un
resultado **legítimo** de esta ronda, y mucho mejor que un ✅ de algo que no se probó.

---

## Bloque 4 · Regresión dirigida: los que ya pasaron y vuelven, con su motivo MEDIDO

Agrupados por **el camino de código que cambió**, no por bloque de la ronda 1.

### 1, 2, 3, 4, 5 — el toque desde Inicio con el sentinel armado

- *Motivo:* los cinco empiezan con un **toque desde Inicio con el sentinel armado**, que es exactamente el
  gesto que el plan `03-06` pasa a ejecutar **en dos pasos** (consumir el sentinel, **después** navegar)
  donde antes era un empuje directo. Es el cambio de comportamiento **más amplio** de la tanda.
- ⚠ **Y su modo de falla es SILENCIOSO:** si el ejecutor de dos pasos se niega, la degradación es segura
  pero **deja el sentinel enterrado**; el atrás aterriza en una entrada de la raíz **con hash**, que **se
  ve igual que Inicio** ⇒ el ítem se marcaría ✅ y el atrás **siguiente** quedaría muerto.
- ⇒ **ESTOS CINCO SE VERIFICAN MIRANDO LA URL** (bloque 0), **no a ojo**. Medido en **E-9** (el entierro
  contra el consumo, en sus dos formas).

| # | Recorrido | Tiene que |
|---|---|---|
| **1** | `Inicio → Más → Finanzas → atrás` | queda **Más abierto**; un atrás más ⇒ **Inicio** |
| **2** | `Inicio → Turnos → atrás` | **Inicio**, sin pasar por Más |
| **3** | `Inicio → Turnos → Más → atrás` | **Turnos** (la pila de tres escalones es a propósito) |
| **4** | `Inicio → Más → Finanzas → tocar Más` | **Más** (no una segunda entrada de Más); y `atrás` ⇒ **Inicio** |
| **5** | tres secciones de Más seguidas (Finanzas → Configuración → Negocio, tocando Más en el medio) → `atrás` | **Inicio**, sin desandar pantallas ya dejadas |

- ⏸ **Resultado ronda 2:** sin correr — **motivo:** la regla del plan `03-09` **cambia la pila**, así
  que correrlos antes habría medido el **comportamiento viejo**. ⚠ Son justamente los ítems **de
  regresión de la pila**, así que medirlos con la regla vieja no decía nada de la nueva. **Su mitad que
  cambió —el regreso a Inicio— vuelve** en el guion de la **ronda 3**
  (`03-UAT-GUION-3.md`, bloque 1, con el recorrido del dueño); el toque **desde** Inicio no vuelve
  (bloque 5 del guion nuevo: lo resuelve el mismo camino de dos pasos, que va antes en el orden de
  reglas).

### 4 y 5, además — tocar Más dentro de su rama

- *Motivo:* son los **únicos dos** que ejecutan *tocar Más dentro de su rama* (subir un nivel), y el plan
  `03-05` cambia **qué queda escrito** en la entrada a la que ese gesto aterriza. Si la regla de dirección
  **suprimiera de más**, el síntoma es **visible** y es exactamente el de estos ítems: tocar Más desde
  Finanzas abriría una **segunda** entrada de Más y el atrás volvería a Finanzas en vez de a Inicio.
- ⏸ **Resultado ronda 2:** sin correr — **motivo:** la regla del plan `03-09` **cambia la pila**, así
  que correrlos antes habría medido el **comportamiento viejo**. **Vuelve** en el guion de la **ronda
  3** (`03-UAT-GUION-3.md`, bloque 2) el recorrido de *subir un nivel* que la regla nueva **sí** toca:
  `Más → una sección de Más → tocar Inicio`, donde la regla no participa y lo resuelve el colapso.

### 10, 11, 12, 13 — los cuatro quicks de octubre

- *Motivo:* el plan `03-07` agrega un **reintento del armado en todo retroceso resuelto como *ignorar***, y
  **cerrar un overlay produce justamente un retroceso ignorado**. Antes no se reintentaba ahí. Son la red
  de seguridad del criterio 4 y son **baratos** (abrir el overlay, apretar atrás), así que vuelven.
- ⚠ El del **teclado (13)** además toca la **rama de gracia del teclado**, que ahora tiene un hermano.

| # | Con qué abierto | Tiene que |
|---|---|---|
| **10** | el **overlay** del alta de turno | el atrás **cierra el overlay** y no navega |
| **11** | el **selector de hora** propio | el atrás lo cierra y no navega |
| **12** | el **campo de fecha / calendario** | el atrás lo cierra y no navega |
| **13** | el **teclado** arriba | el atrás **baja el teclado** y no navega, **ni aparece el aviso de salida** |

- ⏸ **Resultado ronda 2:** sin correr — **motivo:** la regla del plan `03-09` **cambia la pila**, así
  que correrlos antes habría medido el **comportamiento viejo**. **No vuelven** en Android en la
  **ronda 3** (`03-UAT-GUION-3.md`, bloque 5): ya pasaron en la ronda 1 y la regla nueva no toca el
  armado ni el retroceso **ignorado**. Lo que les queda es **iPhone**, en el bloque 6.

### 16 — la cadena de tres pasos

`/web` con cambios sin guardar → tocar un **destino de la barra** → *Salir sin guardar* ⇒ aterriza en el
destino y el `atrás` cae en **Inicio**.

- *Motivo:* es la **cadena de tres pasos** que termina en el **reemplazo del colapso**, y el plan `03-05`
  cambia **la marca que ese reemplazo deja**; además el provider del guard usa el **mismo** ejecutor que
  la barra. Su síntoma si está mal es **visible**: el atrás volvería a `/web`.
- ⏸ **Resultado ronda 2:** sin correr — **motivo:** la regla del plan `03-09` **cambia la pila**, así
  que correrlo antes habría medido el **comportamiento viejo**. **No vuelve** tal cual en la **ronda 3**
  (`03-UAT-GUION-3.md`, bloque 5): su destino es **Más**, no la raíz, así que el hecho nuevo es falso.
  Lo que **sí** vuelve del guard es el caso que la regla **cambia** —hacia **Inicio desde el
  sidebar**—, en el bloque 4 del guion nuevo.

### 21 — el aviso en escritorio (D-05)

- *Motivo:* la decisión (a) **no tiene gate de ancho de pantalla**, así que cambia el aviso en
  **escritorio** igual que en el teléfono.
- **Alcanza con la mitad que (a) cambia:** que el aviso **no** aparezca con una sección debajo, y **sí**
  entrando directo, con su ancla **centrada sobre la columna de contenido**.
- **Y que el recorrido del sidebar siga dando exactamente lo de hoy** (criterio 6).
- ⏸ **Resultado ronda 2:** sin correr — **motivo:** la regla del plan `03-09` **cambia la pila**, así
  que correrlo antes habría medido el **comportamiento viejo**. ⚠ Y acá el cambio es **del criterio**:
  el 6 quedó con una **revisión acotada** fechada el 2026-10-27 y un **residuo aceptado** de un solo
  caso. **Vuelve** en el guion de la **ronda 3** (`03-UAT-GUION-3.md`, bloque 4) con su forma nueva:
  el residuo se corre para **verlo**, no para arreglarlo, más su gemelo sin cambios sin guardar.

---

## Bloque 5 · Lo que NO vuelve en Android, y por qué

Esto va escrito porque **un ítem excluido sin motivo es un agujero**, y porque ya pasó una vez en esta
fase que un ítem sin registrar se leyera como no corrido cuando en realidad había pasado.

| # | Por qué no vuelve |
|---|---|
| **6** | **plegado** en el **7**: el mismo cruce con un escalón menos, y 7 lo cubre con el recorrido más largo (bloque 1) |
| **18** | **plegado** en el **19**: el mismo ciclo del aviso sin la condición de entrada directa, y 19 lo contiene (bloque 1) |
| **9** | *(tocar Clientes en la barra con una ficha abierta ⇒ cierra la ficha, NAV-08)* — ese gesto pide que el destino **sea** la ruta actual, y la rama nueva del plan `03-06` pide que **no** lo sea: son **mutuamente excluyentes por construcción**. Y el candado estático del orden de tres pasos del menú sigue verde en la suite |
| **14** | *(`/agenda` con cambios sin guardar, tocando otro destino)* — `/agenda` es un destino de la **barra**, no una sección de la rama de Más, así que el hecho de la rama es **siempre falso** ahí y la decisión cae en las ramas de rutas de siempre, **intactas**. El gesto tampoco sale de la raíz, así que el camino nuevo de dos pasos no participa |
| **17** | *(`/agenda` con cambios sin guardar, con el atrás del sistema)* — el mismo motivo que el 14. Lo único que lo roza es el reintento del armado de `03-07`, que en `/agenda` **se niega por no estar en la raíz** — una regla que no se tocó |

---

## Bloque 6 · El pase completo de iPhone / Safari (A11)

**Los 21 ítems. Todos.** Porque en Safari **nada** de esta fase se verificó: **A11 está abierto para el
conjunto entero** y todo lo medido en este repo sobre el retroceso fue **Chrome sin pantalla**. Acá no hay
regresión dirigida que valga: no hay ronda previa de la cual recortar.

**Qué mirar distinto en iOS** (el precedente es la Phase 2, que sí corrió sus 13 ítems en los dos motores):

1. **El atrás de iOS es un gesto de borde, no un botón.** Se dispara arrastrando desde el borde izquierdo,
   es **continuo** (se puede soltar a mitad de camino) y puede entregar un `popstate` en un momento
   distinto al del botón de Android. Es la variable que ningún motor sin pantalla mide.
2. **La franja de gestos del notch / el home indicator.** La Phase 2 ya midió que en una **pestaña del
   navegador** esto **no aplica** —en iOS la barra de direcciones de Safari vive **abajo**, así que entre
   la app y la barrita del home está el chrome de Safari—. Se verifica que siga siendo así y que la barra
   inferior no pelee con ese espacio.
3. **La barra de direcciones de Safari, abajo y sobre el ancla del aviso.** El aviso de salida se ancla
   **8px arriba de la barra inferior**, y ahí abajo está la toolbar de Safari, que además **se colapsa y
   se expande al scrollear** (medido en la Phase 2: la barra se mueve). Hay que ver que el aviso **se vea
   completo y no quede tapado**, antes y después de scrollear.
4. **Que el aviso quede legible en una sola línea** con la tipografía y el ancho de iOS.
5. **El teclado**, que en iOS desplaza el layout viewport por su cuenta y ya costó cuatro quicks en este
   repo.

---

## Bloque 7 · Qué cierra cada cosa, y dónde se anotan los resultados

### Los tres supuestos que SÓLO esta UAT puede cerrar

| Supuesto | Qué es | Por qué nada más lo cierra |
|---|---|---|
| **A1** | el **orden** del efecto que escribe la marca contra la escritura del router | si está mal, D-03 y el criterio 2 **degradan a apilar EN SILENCIO**: no lo ve `tsc`, ni la suite, ni el build |
| **A2** | que **no haya otro commit del router en vuelo** cuando el nuestro aterriza | es una carrera de runtime real, y la sonda no corre el código de la app |
| **A11** | **los dos motores reales** (Chrome Android y Safari iOS) | todo lo medido acá fue Chrome de escritorio sin pantalla |

⚠ **Y el recordatorio que esta fase ya pagó:** en la ronda 1 la **sonda daba 8/8** y el teléfono encontró
**cinco fallos más una colisión**. Un pipeline verde **no es evidencia**: mide un espacio que no incluye lo
que el teléfono prueba.

### Dónde se anota

En **`03-UAT.md`**, como sección **Ronda 2**, con **fecha y motor**, **sin borrar la ronda 1**.

### La condición de cierre — el motivo de cada requisito es distinto

| Requisito | Se marca si | Por qué eso y no más |
|---|---|---|
| **MOB-04** | pasan los **bloques 1 a 4** | los cinco fallos son suyos, y el bloque H es la colisión que la decisión (a) reconcilia |
| **MOB-05** | pasan los **bloques 1 a 4** | los fallos 19 y 20 son del aviso, y el bloque 2 prueba que (a) no lo rompió |
| **MOB-06** | pasan los **bloques 3, 4 y 6** | **su parte de Android ya está afirmada**: el bloque E de la ronda 1 (ítems 10-13) se corrió y pasó. Le falta **iPhone** y la parte de overlay del 20 |

**Si algo falla**, los tres **vuelven a quedar sin marcar** y los fallos nuevos entran como **gaps de una
tanda nueva**. El hallazgo vale más que el verde del pipeline.
