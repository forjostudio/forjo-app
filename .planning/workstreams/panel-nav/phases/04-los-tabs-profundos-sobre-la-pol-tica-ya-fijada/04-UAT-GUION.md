---
audit_acknowledged:
  milestone: v0.31
  at: 2026-11-19
  gap_snapshot: "unknown::scenarios=0"
---

# Phase 4 — UAT en el teléfono y en producción: los tabs en la URL

**Fecha del guion:** 2026-11-17 · **Plan:** `04-05`
**Dónde se anotan los resultados:** en `04-UAT.md` (misma carpeta), con **fecha**, **motor** y el **commit
desplegado**, **sin reinterpretar** lo que se vio.

---

## La regla que gobierna todo este documento

- **Se anota lo que se vio, textual.** No la interpretación de por qué pasó. Si la pantalla hizo algo raro,
  se describe la pantalla y la URL, no la causa que uno sospecha.
- **Un fallo entra como gap nuevo, no se arregla en el momento.** Nadie toca código durante la UAT: el
  hallazgo vale más que el verde del pipeline, y arreglarlo a mano en el medio mezcla dos cosas que después no
  se pueden separar.
- **MOB-08 y MOB-09 se marcan en `/gsd-verify-work 4 --ws panel-nav`**, con lo que quedó anotado en
  `04-UAT.md`. No antes y no en otro lado.
- **Un pipeline verde NO es evidencia.** Todo lo automático de la fase está en verde (la sonda de la app, la
  estática, las suites, `tsc`, el build: sección `(g)` de `.planning/debug/tabs-en-la-url-medida.md`), y todo
  eso se midió en Chrome de **escritorio**. Este workstream ya tuvo siete bugs que aparecieron con el pipeline
  en verde. Chrome de Android, Safari de iOS y el OAuth real **sólo** los mide este guion.

**Qué cambió en esta fase, en una línea:** los tabs de `/negocio` (Datos · Cobros · Integraciones ·
Notificaciones/Mail), de `/settings` (Apariencia · Seguridad · Suscripción) y de `/finances` (Turnos · Ventas
· Egresos) ahora viven en la URL (`?tab=…`). El atrás desde un tab vuelve **al tab por defecto** (no al tab
anterior: es la regla de un nivel que eligió el dueño, D-01) y el atrás siguiente sale de la sección como en
la Phase 3. Y con un tab abierto, tocar la barra de abajo termina **igual que sin el tab** (decisión B1).

---

## Antes de empezar

1. **Producción, no local:** `https://gestion.forjo.studio`, **después** de que el orquestador suba `main` y
   el deploy de Vercel esté listo. Anotar en `04-UAT.md` el **commit desplegado** (el que muestra el deploy
   de Vercel, o el que te pasa el orquestador al presentar el checkpoint).
2. **Tres dispositivos:** un **Android** con Chrome, un **iPhone** con Safari y una **computadora** con la
   ventana a **1024 px o más** de ancho (con menos, el panel muestra la barra de abajo en vez del sidebar).
3. **Pestaña nueva por recorrido, siempre.** Lo que se mide es la forma de la pila del navegador; una
   pestaña arrastrada de antes del deploy conserva entradas viejas y puede correr el código viejo.
4. **Para el OAuth (bloque 4):** un **negocio de prueba de producción** (sin clientes reales), o la **rama de
   error** (cancelar en la pantalla de MercadoPago o de Google). ⚠ **NUNCA desconectar el MercadoPago de un
   negocio con clientes reales para probar esto:** con la cuenta desconectada las señas de sus clientes no se
   cobran.
5. **Para la fusión de clientes del 3.4 (b):** un par de clientes duplicados **de prueba** (dos fichas con el
   mismo nombre creadas para esto). ⚠ Fusionar **borra** la ficha duplicada y le pasa sus turnos a la otra:
   no hacerlo con clientes reales.

**Cómo se marca cada recorrido** (detalle en el bloque 9):

- ✅ **pasa**
- ❌ **falla** — con **lo que se vio**, textual
- ⚠ **no corrible** — con el **motivo**. También lleva su fila.

---

## Bloque 0 · El observable: mirar la barra de direcciones

Esto va **primero**, en cada recorrido. Convierte el fallo más caro de esta fase —que es silencioso— en un
chequeo de un vistazo, sin herramientas.

| Momento | Qué tiene que mostrar la URL | Si no |
|---|---|---|
| Parado en un tab que **no** es el por defecto (Cobros, Integraciones, Notificaciones/Mail, Seguridad, Suscripción, Ventas, Egresos) | `?tab=` con el nombre del tab en minúsculas y sin tildes: `/negocio?tab=cobros`, `/settings?tab=suscripcion`, `/finances?tab=ventas` | el tab no vive en la URL: el atrás se lo va a comer ⇒ **fallo**, anotado antes de apretar atrás |
| Parado en el tab **por defecto** (Datos en Negocio, Apariencia en Configuración, Turnos en Finanzas) | la URL **limpia**, sin `?tab=`: `/negocio`, `/settings`, `/finances` | queda un `?tab=` colgado ⇒ **fallo** |
| Parado en **Inicio** con el aviso de salida armado | `…/dashboard#salir` (el hash de la Phase 3) | sin el hash el atrás va a salir sin avisar (ver el 6.3 y el bloque 7) |

---

## Bloque 1 · Los tabs entrando por Más (Android)

### 1.1 — Negocio: un nivel de tabs, y después Más e Inicio

1. Pestaña nueva, Inicio. Tocar **Más** en la barra de abajo → **Negocio**.
2. Tocar el tab **Cobros** → tocar **Integraciones** → tocar **Cobros** otra vez.
3. Apretar **atrás** → mirar la pantalla y la URL.
4. Apretar **atrás** otra vez → mirar.
5. Apretar **atrás** otra vez → mirar.

- **Pasa si:** en el paso 2 la URL va `/negocio?tab=cobros` → `?tab=integraciones` → `?tab=cobros`; el primer
  atrás cae en **Datos** con la URL `/negocio` limpia; el segundo en **Más**; el tercero en **Inicio**.
- **Falla si:** el primer atrás vuelve a Integraciones (o a otro tab que no sea Datos), sale de Negocio sin
  pasar por Datos, hace falta más de un atrás para pasar por Datos, la pantalla queda vacía, o algún atrás
  saca del sitio.

### 1.2 — Configuración: lo mismo con sus tres tabs

1. Pestaña nueva, Inicio → **Más** → **Configuración**.
2. Tocar **Seguridad** → tocar **Suscripción**.
3. Atrás → atrás → atrás.

- **Pasa si:** la URL va `/settings?tab=seguridad` → `?tab=suscripcion`; el primer atrás cae en **Apariencia**
  con `/settings` limpia; el segundo en **Más**; el tercero en **Inicio**.
- **Falla si:** el primer atrás vuelve a Seguridad, sale de Configuración sin pasar por Apariencia, queda una
  pantalla vacía, o algún atrás saca del sitio.

### 1.3 — Finanzas: el botón de alta sigue al tab de la URL

1. Pestaña nueva, Inicio → **Más** → **Finanzas** (abre en **Turnos**).
2. Tocar **Ventas** → mirar el botón de alta de arriba.
3. Tocar **Egresos** → mirar el botón.
4. Atrás → mirar el tab y el botón. Atrás → atrás.

- **Pasa si:** en Ventas el botón dice **«Nueva venta»** (y no «Nuevo egreso»); en Egresos dice **«Nuevo
  egreso»**; el primer atrás cae en **Turnos**, con `/finances` limpia y **ningún** botón de alta; el segundo
  atrás en **Más**; el tercero en **Inicio**.
- **Falla si:** el botón no corresponde al tab que se ve (p. ej. «Nueva venta» con Egresos abierto, o un botón
  de alta en Turnos), el primer atrás vuelve a Ventas, o algún atrás saca del sitio.

### 1.4 — Tocar el tab por defecto a mano (D-02)

1. Pestaña nueva, Inicio → **Más** → **Negocio** → tocar **Cobros**.
2. Tocar **Datos** (a mano, el tab, no el atrás).
3. Apretar **atrás**.

- **Pasa si:** al tocar Datos la URL queda `/negocio` limpia, y el atrás sale directo a **Más** (no queda un
  Datos arriba de otro Datos).
- **Falla si:** el atrás deja en Datos otra vez (hace falta un atrás de más), vuelve a Cobros, o saca del
  sitio.

---

## Bloque 2 · Desde Inicio, la otra profundidad

### 2.1 — (Android) Inicio → la tarjeta de Finanzas

1. Pestaña nueva, Inicio. Tocar la tarjeta **«Ingresos del mes»** (abre Finanzas).
2. Tocar **Ventas**.
3. Atrás → atrás.

- **Pasa si:** el primer atrás cae en **Turnos** con `/finances` limpia; el segundo en **Inicio** (no en Más:
  no se entró por Más).
- **Falla si:** el primer atrás sale de Finanzas sin pasar por Turnos, el segundo cae en Más, o algún atrás
  saca del sitio.

### 2.2 — (Escritorio) el sidebar, y el residuo declarado C-5

**(a)** Pestaña nueva, Inicio. **Negocio** por el sidebar → tocar **Cobros** → atrás → atrás.

- **Pasa si:** el primer atrás cae en **Datos** con `/negocio` limpia; el segundo en **Inicio**.
- **Falla si:** el primer atrás sale de Negocio sin pasar por Datos, o algún atrás saca del sitio.

**(b)** Pestaña nueva, Inicio. **Negocio** por el sidebar → tocar **Cobros** → **Finanzas** por el sidebar →
atrás.

- ⚠ **Expectativa nueva — no es regresión:** el atrás desde Finanzas cae en **Negocio** (Datos), no en
  Inicio. Es el residuo **C-5**, declarado por el dueño el 2026-11-17 con la decisión B1 (el sidebar no tiene
  el arreglo de la barra; cerrarlo reabría la enmienda de MOB-07). Un escalón más, nunca una expulsión.
- **Pasa si:** el atrás cae en Negocio (Datos) y un atrás más llega a Inicio.
- **Falla si:** algún atrás saca del sitio, o un atrás no hace nada visible.

### 2.3 — (Escritorio) tocar la sección activa vuelve al tab por defecto (D-08)

1. Pestaña nueva, Inicio → **Negocio** por el sidebar → tocar **Cobros**.
2. Tocar **«Negocio»** en el sidebar (la sección en la que ya estás).
3. Después: **Finanzas** por el sidebar → tocar **Ventas** → tocar **«Finanzas»** en el sidebar.

- **Pasa si:** en el paso 2 la pantalla vuelve a **Datos** con `/negocio` limpia; en el paso 3 vuelve a
  **Turnos** con `/finances` limpia y sin botón de alta.
- **Falla si:** tocar la sección activa no hace nada, deja el tab abierto, o deja `?tab=` en la URL.

---

## Bloque 3 · URL pegada, recargada y compartida (Android)

### 3.1 — Pegar `/negocio?tab=cobros` (D-03)

1. Pestaña **nueva**, pegar `gestion.forjo.studio/negocio?tab=cobros` en la barra de direcciones.
2. Mirar el tab. Apretar **atrás**.

- **Pasa si:** abre directo en **Cobros**; el atrás sale de la sección (a lo que hubiera antes en la pestaña, o
  cierra/sale) **sin pasar por Datos**.
- ⚠ **Expectativa de la fase — no es regresión:** que el atrás **no** pase por Datos es a propósito (D-03:
  entrar por URL no fabrica un tab por defecto por debajo, igual que la Phase 3 no fabrica un Inicio falso).
- **Falla si:** abre en otro tab o en una pantalla vacía, o el atrás pasa por Datos.

### 3.2 — Recargar en Egresos

1. Pestaña nueva → Más → **Finanzas** → tocar **Egresos**.
2. **Recargar** la página.

- **Pasa si:** después de recargar sigue en **Egresos**, con la URL `/finances?tab=egresos` y el botón
  **«Nuevo egreso»**.
- **Falla si:** recarga en Turnos o en otro tab, o el botón no corresponde a Egresos.

### 3.3 — Un tab inválido o de otro grupo (D-07)

1. Pestaña nueva, pegar `gestion.forjo.studio/negocio?tab=ventas`.
2. Pestaña nueva, pegar `gestion.forjo.studio/settings?tab=datos`.

- **Pasa si:** el primero abre **Datos** y la URL queda `/negocio` (sin `?tab=`); el segundo abre
  **Apariencia** y la URL queda `/settings`. Ninguno muestra una pantalla vacía.
- **Falla si:** alguno muestra una pantalla vacía, abre un tab que no es el por defecto, o deja el `?tab=`
  inválido en la URL.

### 3.4 — Una URL pegada no saca del sitio

**(a)** Pestaña nueva, pegar `gestion.forjo.studio/negocio?tab=cobros` → tocar **Integraciones** → tocar
**Datos**.

- **Pasa si:** la pantalla queda en **Datos**, con `/negocio` limpia, **dentro del sitio** (es el defecto que
  el plan `04-01` cerró: antes, ese «volver a Datos» podía hacer un atrás que sacaba del sitio).
- **Falla si:** al tocar Datos la pestaña sale del sitio o vuelve a una página anterior a Forjo.

**(b)** `/clients` — sólo con dos clientes **duplicados de prueba** (ver «Antes de empezar», punto 5). Abrir
la ficha de uno de ellos, copiar la URL (`/clients?c=…`), pegarla en una pestaña **nueva**, tocar el botón de
**fusionar** de la ficha → **Fusionar**, cerrar el diálogo, y tocar **«Volver»**.

- **Pasa si:** «Volver» deja en el **listado de clientes** (`/clients`), dentro del sitio. Es un **cambio de
  comportamiento declarado** del plan `04-01` (2026-11-17): antes, ese «Volver» podía hacer un atrás que
  sacaba del sitio; ahora **reemplaza**.
- **Falla si:** «Volver» saca del sitio, no hace nada, o reabre la ficha borrada.
- Si no hay duplicados de prueba: ⚠ **no corrible** con ese motivo. No fusionar clientes reales.

---

## Bloque 4 · El retorno REAL del OAuth (criterio 3, sólo en producción, Android)

⚠ **El OAuth sólo vuelve de verdad en producción** (en local MercadoPago no vuelve): por eso este bloque es el
que cierra el criterio 3, y por eso **un ⚠ solo no alcanza** (ver al final del bloque).

⚠ **NUNCA desconectar el MercadoPago de un negocio con clientes reales para probar esto.** El botón
«Conectar» sólo aparece si la cuenta **no** está conectada: usar un **negocio de prueba de producción**, o la
rama de error.

### 4.1 — MercadoPago, la rama de error (cancelar)

1. En un negocio **sin** MercadoPago conectado: **Negocio** → **Integraciones** → **«Conectar con
   MercadoPago»**.
2. En la pantalla de MercadoPago, **cancelar** (no autorizar).
3. Mirar dónde vuelve, el toast y la URL. Apretar **atrás**.

- **Pasa si:** vuelve a Negocio en **Integraciones**, con la URL `/negocio?tab=integraciones` (sin `?mp=`
  colgado), el toast **«No se pudo conectar con MercadoPago»** aparece **una** vez, y el atrás sale de la
  sección.
- ⚠ El toast **aparece** — antes del plan `04-02` **nunca aparecía** (era un bug de producción: el `<Toaster>`
  se suscribía después de que la pantalla lo pedía). Verlo es parte del «pasa».
- **Falla si:** vuelve a Datos u otro tab, la URL queda con `?mp=error`, no aparece ningún toast, aparece dos
  veces, o el atrás vuelve a la misma pantalla de Integraciones.
- Si MercadoPago no vuelve al cancelar (se queda en su pantalla): ⚠ **no corrible** con ese motivo, textual.

### 4.2 — MercadoPago, conectar de verdad (sólo en un negocio de prueba, o si el dueño lo decide)

1. En un negocio **de prueba**: Negocio → Integraciones → «Conectar con MercadoPago» → **autorizar**.
2. Mirar dónde vuelve, el toast y la URL. Apretar **atrás**.

- **Pasa si:** vuelve en **Integraciones**, URL `/negocio?tab=integraciones`, el toast **«MercadoPago
  conectado»** aparece **una** vez, y la tarjeta dice «Conectado».
- ⚠ **Expectativa de la fase — no es regresión:** el atrás desde ahí vuelve a la **página de MercadoPago**
  (la que se visitó para autorizar), **igual que hoy**: esa entrada la empuja el navegador al ir a
  MercadoPago y no es del panel.
- **Falla si:** vuelve a otro tab, la URL queda con `?mp=connected`, el toast no aparece o aparece dos veces.
- ⚠ **NUNCA** en un negocio con clientes reales que ya tiene otra cuenta conectada.

### 4.3 — Google Calendar desde Integraciones (`?google=…`)

1. En un negocio **sin** Google Calendar conectado: Negocio → Integraciones → **«Conectar Google Calendar»**.
2. Autorizar (o **cancelar**, para la rama de error) en la pantalla de Google.
3. Mirar dónde vuelve, el toast y la URL. Apretar **atrás**.

- **Pasa si:** vuelve en **Integraciones**, URL `/negocio?tab=integraciones` sin `?google=` colgado, el toast
  **«Google Calendar conectado»** (o **«No se pudo conectar con Google Calendar»** si se canceló) aparece
  **una** vez, y el atrás sale de la sección (o vuelve a la página de Google si se autorizó, igual que el 4.2).
- **Falla si:** vuelve a otro tab, queda `?google=` en la URL, no aparece el toast o aparece dos veces.

### 4.4 — Google Calendar desde Agenda (Agenda no gana tabs)

1. En un negocio **sin** Google Calendar conectado: **Agenda** → **«Conectar Google Calendar»**.
2. Autorizar o cancelar en Google.

- **Pasa si:** vuelve a **Agenda** con la URL `/agenda` **limpia** (sin `?google=` y sin `?tab=`), el toast
  aparece **una** vez, y Agenda se ve como siempre (sin ninguna fila de tabs nueva).
- **Falla si:** vuelve a Negocio, queda `?google=` en la URL, aparece un `?tab=`, el toast no aparece o aparece
  dos veces.

**La regla del bloque 4 (el criterio 3):** hace falta **al menos un ✅** de este bloque (el retorno real, en
producción). **Un ⚠ solo no cierra el criterio 3.** Si **ninguno** de los cuatro se pudo correr, el dueño
decide qué hacer y lo escribe en `04-UAT.md` en una **línea sola** que empieza con
`decision del dueno sobre el OAuth en produccion: ` seguida de qué decide y por qué. Esa línea es del dueño:
nadie la escribe por él.

---

## Bloque 5 · T-1 a mano, ruta por ruta (criterio 2, Android)

Las tres rutas comparten la misma pantalla (`settings-client.tsx`) con Negocio y Configuración, y **no** tenían
que moverse. El ROADMAP pide verificarlas **a mano, una por una**: cada una lleva su fila.

### 5.1 — `/servicios`

1. Pestaña nueva → Más → **Servicios**. Usar la pantalla como siempre: abrir un diálogo de alta o edición y
   cerrarlo con la **X**; abrirlo otra vez y cerrarlo con el **atrás**.
2. Pestaña nueva, pegar `gestion.forjo.studio/servicios?tab=cobros`.

- **Pasa si:** la URL **nunca** gana `?tab=`, no aparece ninguna fila de tabs nueva, el contenido es el de
  siempre, el atrás cierra el diálogo sin salir de la pantalla, y con `?tab=cobros` pegado no pasa nada
  distinto (Servicios, como siempre).
- **Falla si:** aparece un `?tab=` en la URL, una fila de tabs que antes no estaba, contenido de Negocio, o el
  atrás con el diálogo abierto sale de la pantalla.

### 5.2 — `/equipo`

Lo mismo que el 5.1, entrando por Más → **Equipo** (o el nombre del rubro para el equipo) y pegando
`gestion.forjo.studio/equipo?tab=cobros`.

- **Pasa si:** igual que el 5.1: sin `?tab=`, sin tabs nuevos, el contenido de siempre, el atrás cierra el
  diálogo, y `?tab=cobros` pegado no cambia nada.
- **Falla si:** igual que el 5.1.
- Si el negocio no tiene esta sección en Más: ⚠ **no corrible**, con el motivo.

### 5.3 — `/consultorios`

Lo mismo que el 5.1, entrando por Más → **Consultorios** (o el nombre del rubro para las sedes) y pegando
`gestion.forjo.studio/consultorios?tab=cobros`.

- **Pasa si:** igual que el 5.1.
- **Falla si:** igual que el 5.1.
- Si el negocio no tiene esta sección en Más: ⚠ **no corrible**, con el motivo.

---

## Bloque 6 · Lo que no se tiene que mover (criterio 5 / MOB-06, Android)

### 6.1 — El diálogo de «Nueva venta» y el atrás

1. Más → Finanzas → **Ventas** → **«Nueva venta»** (abre el diálogo).
2. Apretar **atrás**.

- **Pasa si:** el atrás **cierra el diálogo** y la pantalla sigue en **Ventas** con `/finances?tab=ventas`.
- **Falla si:** el atrás cambia de tab (cae en Turnos con el diálogo cerrado de un saque), sale de Finanzas, o
  el diálogo no se cierra.

### 6.2 — Agenda: el aviso de cambios sin guardar

1. **Agenda** → editar un horario (sin guardar).
2. Apretar **atrás**.

- **Pasa si:** aparece el aviso de cambios sin guardar **como siempre**, y elegir quedarse deja la edición
  intacta.
- **Falla si:** el atrás sale sin avisar, el aviso aparece dos veces, o la URL gana un `?tab=` o un
  `?google=`.

### 6.3 — Inicio: el aviso de salida, como en la Phase 3

1. Pestaña nueva, Inicio. **Un toque** en un lugar sin botones (el fondo, entre tarjetas).
2. Mirar la URL (bloque 0). Apretar **atrás**. Apretar **atrás** otra vez.

- **Pasa si:** después del toque la URL muestra `…/dashboard#salir`; el primer atrás **avisa y no sale**; el
  segundo **sale**.
- ⚠ **Expectativa ya declarada en la Phase 3 — no es regresión de esta fase:** cerrar el diálogo del plan de
  Inicio con el **atrás** (en vez de la X) deja el aviso sin armar y el atrás siguiente sale (`G3-10`, el
  costo del camino 1 declarado por el dueño el 2026-11-16). Con un toque después, avisa. La sonda lo sigue
  mostrando en `FALLA` a propósito (`R-G3-10-primer-toque-atras-pronto`).
- **Falla si:** con el hash en la URL el primer atrás sale, o el aviso aparece sin apretar atrás.

---

## Bloque 7 · Los gestos de la barra con un tab abierto (decisión B1 del dueño, Android)

**La decisión del dueño fue B1** (2026-11-17, `04-DECISION-COMPOSICION.md`): con un tab —o la ficha de un
cliente— abierto, tocar la barra de abajo termina **igual que sin el tab**. El plan `04-04` lo implementó y lo
midió en Chrome de escritorio, incluido un retroceso **triple** (tab → sección → Más → Inicio) que la Phase 3
nunca encadenó. **Que no se sienta lento** también es parte de cada «pasa».

### 7.1 — Cobros abierto → tocar Inicio

1. Pestaña nueva, Inicio → **Más** → **Negocio** → **Cobros**.
2. Tocar **Inicio** en la barra. Mirar la URL.
3. Apretar **atrás**.

- **Pasa si:** aterriza en **Inicio** con `…/dashboard#salir` en la URL, sin pasar a la vista por Negocio ni
  Más, y el primer atrás **muestra el aviso de salida** (no vuelve a Cobros). Sin demora visible.
- **Falla si:** el atrás vuelve a Cobros, a Negocio o a Más; la URL no muestra el hash; se ven pantallas
  intermedias parpadeando; tarda de forma notoria; o algún atrás saca del sitio.

### 7.2 — Cobros abierto → tocar Turnos

1. Pestaña nueva, Inicio → Más → Negocio → **Cobros**.
2. Tocar **Turnos** en la barra → apretar **atrás**.

- **Pasa si:** el atrás desde Turnos va **directo a Inicio** (no pasa por Negocio ni Más).
- **Falla si:** el atrás pasa por Negocio, Cobros o Más, o saca del sitio.

### 7.3 — Cobros abierto → tocar Más

1. Pestaña nueva, Inicio → Más → Negocio → **Cobros**.
2. Tocar **Más** en la barra → apretar **atrás**.

- **Pasa si:** vuelve a **Más** (sube, no se apila sobre Cobros) y el atrás desde Más va a **Inicio**.
- **Falla si:** el atrás desde Más vuelve a Cobros o a Negocio, o saca del sitio.

### 7.4 — La ficha de un cliente abierta → tocar Inicio

1. Pestaña nueva, Inicio → **Clientes** → abrir la ficha de un cliente (la URL muestra `?c=`).
2. Tocar **Inicio** en la barra. Mirar la URL. Apretar **atrás**.

- **Pasa si:** aterriza en **Inicio** con `…/dashboard#salir`, y el primer atrás **muestra el aviso de
  salida** (no reabre la ficha).
- **Falla si:** el atrás reabre la ficha o vuelve a Clientes, la URL no muestra el hash, o algún atrás saca
  del sitio.

---

## Bloque 8 · El pase de iPhone / Safari

Todo lo medido de esta fase fue Chrome de **escritorio**. En Safari nada está medido. Mismos pasos, mismo
«pasa si» y mismo «falla si» que el recorrido que repiten.

⚠ **Lo distinto de iOS:** el atrás es el **gesto de borde** (arrastrar desde el borde izquierdo; se puede
soltar a mitad de camino: si se suelta, no cuenta como atrás). La barra de direcciones de Safari está **abajo**:
el bloque 0 se mira ahí. El gesto de borde **no** es un toque: para el aviso de Inicio hace falta tocar la
pantalla, como en la Phase 3.

### 8.1 — = 1.1 en iPhone

- **Pasa si:** lo mismo que el 1.1 (Cobros → Integraciones → Cobros; atrás a Datos, a Más, a Inicio).
- **Falla si:** lo mismo que el 1.1.

### 8.2 — = 1.3 en iPhone

- **Pasa si:** lo mismo que el 1.3 (el botón de alta sigue al tab; atrás a Turnos sin botón, a Más, a Inicio).
- **Falla si:** lo mismo que el 1.3.

### 8.3 — = 3.1 en iPhone

- **Pasa si:** lo mismo que el 3.1 (abre en Cobros; el atrás sale sin pasar por Datos — expectativa de la
  fase, no regresión).
- **Falla si:** lo mismo que el 3.1.

### 8.4 — = 7.1 en iPhone (B1, el retroceso triple)

- **Pasa si:** lo mismo que el 7.1 (Inicio con `#salir` en la barra de abajo de Safari; el primer atrás —con el
  gesto de borde— muestra el aviso y no vuelve a Cobros; sin demora visible).
- **Falla si:** lo mismo que el 7.1.

### 8.5 — = 4.1 en iPhone, si se puede

- **Pasa si:** lo mismo que el 4.1 (vuelve en Integraciones, `?tab=integraciones`, el toast de error una vez).
- **Falla si:** lo mismo que el 4.1.
- Si no hay un negocio sin MercadoPago conectado a mano en el iPhone: ⚠ **no corrible**, con el motivo.

---

## Bloque 9 · Qué cierra esto y dónde se anota

**Dónde:** en `04-UAT.md`, primero la **fecha** (`AAAA-MM-DD`), los **motores** (p. ej. «Android Chrome
1xx, iPhone Safari iOS 1x, Windows Chrome 1xx») y el **commit desplegado**. Después, **una fila por
recorrido corrido**, empezando por su id:

```
| 1.1 | Android Chrome | ✅ | Datos → Más → Inicio, URL limpia en Datos |
| 4.1 | Android Chrome | ❌ | volvió a /negocio en Datos, URL /negocio?mp=error, sin toast |
| 5.2 | Android Chrome | ⚠ | el negocio no tiene Equipo en Más |
```

- ✅ **pasa** · ❌ **falla**, con **lo que se vio, textual** · ⚠ **no corrible**, con **el motivo** (también
  lleva fila: un recorrido que no se pudo correr se declara, no se saltea).
- El **bloque 5** lleva sus **tres** filas (T-1 se verifica ruta por ruta: criterio 2).
- El **bloque 4** necesita **al menos un ✅** (el retorno real en producción: criterio 3). Si ninguno se pudo
  correr, un ⚠ solo **no** cierra: el dueño escribe la línea sola
  `decision del dueno sobre el OAuth en produccion: <qué decide y por qué>`, que queda como su decisión.
- Los recorridos con dos partes (2.2, 3.4) van en **una** fila cada uno, con lo que se vio de las dos.

**La condición de cierre:**

| Requisito | Se marca si | Por qué |
|---|---|---|
| **MOB-08** (Negocio y Configuración) | pasan los bloques 1, 2, 3, 5 y 7 en Android/escritorio, al menos un ✅ del bloque 4 (o la línea de decisión del dueño), y el bloque 8 en iPhone | los tabs de `settings-client.tsx`, T-1, el OAuth real y Safari |
| **MOB-09** (Finanzas y el botón de alta) | pasan el 1.3, el 2.1, el 2.3, el 3.2 y el 6.1, y el 8.2 en iPhone | el botón tiene que seguir al tab de la URL en todos los caminos de entrada |

**Se marcan en `/gsd-verify-work 4 --ws panel-nav`, no acá.** Si algo falla, MOB-08 y MOB-09 quedan sin
marcar y el fallo entra como **gap nuevo**, con lo que se vio — no se interpreta ni se arregla en el momento.
