# Phase 4 — Re-UAT corta en el teléfono y en producción: el cierre de los gaps

**Fecha del guion:** 2026-11-18 · **Plan:** `04-08`
**Qué cierra:** G-04-6, G-04-7 y G-04-8 de `04-UAT-CIERRE.md` (misma carpeta).
**Dónde se anotan los resultados:** en este mismo archivo, en `## Resultados`, con fecha, motores y el commit
desplegado, sin reinterpretar.

---

## La regla que gobierna todo este documento

- **Se anota lo que se vio, textual.** No la interpretación de por qué pasó: si la pantalla hizo algo raro, se
  describe la pantalla y la URL, no la causa que uno sospecha.
- **Un fallo entra como gap nuevo, no se arregla en el momento.** Nadie toca código durante la re-UAT.
- **MOB-08 y MOB-09 se marcan en `/gsd-verify-work 4 --ws panel-nav`**, con lo que quedó anotado acá. No antes y
  no en otro lado.
- **Un pipeline verde NO es evidencia.** Todo lo automático está en verde (sección `(j)` de
  `.planning/debug/tabs-en-la-url-medida.md`), pero se midió en un Chrome de escritorio contra el servidor de
  desarrollo. El salto de Finanzas lo viste vos en producción; sólo este guion lo cierra.

**Qué cambió, en una línea:** el primer toque de un tab de Finanzas ya no lleva la página arriba (G-04-6); un toque
decide con la URL del momento y un doble toque no consume dos veces (G-04-7, también el «Volver» de la ficha de
clientes); y la vuelta del OAuth con cualquier forma de URL deja Negocio en Integraciones con la URL limpia y los
tabs respondiendo (G-04-8).

---

## Antes de empezar

1. **Producción, no local:** `https://gestion.forjo.studio`, **después** del push y con el deploy de Vercel listo.
   Tené a la vista el **commit desplegado** (el que te pasa el orquestador al presentar el checkpoint) y anotalo
   abajo.
2. **Dos dispositivos:** un **Android** con Chrome y una **computadora** con Chrome con la ventana a **1024 px o
   más** de ancho (con menos, el panel muestra la barra de abajo en vez del menú de la izquierda).
3. **Cada recorrido de Finanzas empieza en una PESTAÑA NUEVA.** El salto sólo aparecía la primera vez en cada
   pestaña: en una pestaña ya usada el recorrido no mide nada.
4. **En escritorio no hay barra de abajo:** donde un recorrido dice «Más», en escritorio se usa el menú de la
   izquierda.
5. **Ningún recorrido conecta ni desconecta MercadoPago.** Los del bloque G8 son **URLs pegadas** en la barra de
   direcciones: no tocan ninguna cuenta. ⚠ No desconectes el MercadoPago de ningún negocio para esto.

**Cómo se marca cada recorrido:**

- ✅ **pasa**
- ❌ **falla** — con **lo que se vio**, textual
- ⚠ **no corrible** — con el **motivo**. También lleva su fila.

---

## G6 · El primer toque de un tab de Finanzas no mueve la página

### G6.1 · Android: entrando por Más, el primer toque de Ventas y de Egresos

1. Abrí una **pestaña nueva** y entrá a `gestion.forjo.studio` (quedás en Inicio).
2. Tocá **Más** en la barra de abajo → **Finanzas**.
3. Bajá hasta que los tabs **Turnos · Ventas · Egresos** queden a la vista y la parte de arriba (los números del
   mes) quede fuera de la pantalla.
4. Tocá **Ventas**.
5. Tocá **Egresos**.

**Pasa si:** en los dos toques la página se queda quieta: los tabs siguen en el mismo lugar de la pantalla y cambia
sólo la lista y el botón («Nueva venta», después «Nuevo egreso»).
**Falla si:** en algún toque —sobre todo el primero— la página sube sola hacia el inicio.

### G6.2 · Android: entrando por la tarjeta de Inicio, el primer toque de Egresos

1. Abrí una **pestaña nueva** y entrá a `gestion.forjo.studio` (Inicio).
2. Tocá la tarjeta **«Ingresos del mes»** → te lleva a **Finanzas**.
3. Bajá como en el G6.1 (tabs a la vista, los números del mes fuera de la pantalla).
4. Tocá **Egresos** primero.
5. Después tocá **Ventas**.

**Pasa si:** igual que el G6.1: en los dos toques la página se queda quieta y cambia sólo la lista y el botón.
**Falla si:** igual que el G6.1: en algún toque —sobre todo el primero— la página sube sola hacia el inicio.

### G6.3 · Escritorio: entrando por la tarjeta de Inicio

1. Abrí una **pestaña nueva** y entrá a `gestion.forjo.studio` (Inicio).
2. Hacé clic en la tarjeta **«Ingresos del mes»** → **Finanzas**.
3. Bajá hasta que los tabs queden a la vista y los números del mes fuera de la pantalla.
4. Clic en **Ventas**.
5. Clic en **Egresos**.

**Pasa si:** igual que el G6.1: en los dos clics la página se queda quieta y cambia sólo la lista y el botón.
**Falla si:** igual que el G6.1: en algún clic —sobre todo el primero— la página sube sola hacia el inicio.

### G6.4 · Escritorio: entrando por el menú de la izquierda

1. Abrí una **pestaña nueva** y entrá a `gestion.forjo.studio` (Inicio).
2. Clic en **Finanzas** en el menú de la izquierda.
3. Bajá hasta que los tabs queden a la vista y los números del mes fuera de la pantalla.
4. Clic en **Ventas**.
5. Clic en **Egresos**.

**Pasa si:** igual que el G6.1: en los dos clics la página se queda quieta y cambia sólo la lista y el botón.
**Falla si:** igual que el G6.1: en algún clic —sobre todo el primero— la página sube sola hacia el inicio.

---

## G7 · Un doble toque no apila ni saca de la sección

### G7.1 · Android: doble toque en Ventas y en Turnos

1. Desde Inicio, tocá **Más** → **Finanzas** (quedás en Turnos).
2. Tocá **Ventas DOS veces seguidas, rápido**.
3. Atrás (el gesto o el botón de Android).
4. Atrás otra vez.
5. Volvé a entrar: **Finanzas** → tocá **Ventas** una vez.
6. Ahora tocá **Turnos DOS veces seguidas, rápido**.

**Pasa si:** el primer atrás (paso 3) deja **Turnos** (sin botón de alta) y el segundo (paso 4) vuelve a **Más**; y
el doble toque en Turnos (paso 6) te deja en **Turnos DENTRO de Finanzas**.
**Falla si:** el primer atrás deja **Ventas** (quedó Ventas arriba de Ventas), o el doble toque en Turnos te saca de
Finanzas (a Más, a Inicio o fuera del sitio).

### G7.2 · Android: doble «Volver» en una ficha de clientes

1. Desde Inicio, tocá **Clientes** en la barra de abajo.
2. Abrí la ficha de un cliente.
3. Tocá **«Volver»** DOS veces seguidas, rápido.
4. Atrás (el gesto o el botón de Android).

**Pasa si:** después del doble «Volver» quedás en la **lista de Clientes** (no saliste de la sección), y el atrás
siguiente vuelve a **Inicio** como siempre.
**Falla si:** el doble «Volver» te saca de Clientes, o el atrás te deja en la ficha.

---

## G8 · La vuelta del OAuth pegada no traba los tabs de Negocio

### G8.1 · Android o escritorio: `?mp=` vacío

1. Abrí una **pestaña nueva** y pegá en la barra de direcciones `gestion.forjo.studio/negocio?mp=`.
2. Tocá **Datos**.
3. Tocá **Cobros**.

**Pasa si:** abre en **Integraciones** con la barra de direcciones en `/negocio?tab=integraciones` (sin `mp`);
Datos muestra Datos con la URL `/negocio`; y Cobros muestra Cobros.
**Falla si:** la pantalla se queda en Integraciones al tocar otro tab, o la URL conserva `mp=`.

### G8.2 · Android o escritorio: `?tab=integraciones&mp=connected`

1. Abrí una **pestaña nueva** y pegá en la barra de direcciones
   `gestion.forjo.studio/negocio?tab=integraciones&mp=connected`.
2. Tocá **Datos**.

**Pasa si:** aparece el aviso «MercadoPago conectado» **UNA vez** (lo pide esa URL; no cambia nada de la cuenta: la
tarjeta muestra el estado real), la URL queda `/negocio?tab=integraciones`, y Datos responde.
**Falla si:** el tab no responde, la URL conserva `mp=`, o el aviso sale dos veces.

---

## Fecha, motor y commit desplegado

fecha:
motores:
commit desplegado:

## Resultados

| Recorrido | Motor | Resultado | Lo que se vio |
|---|---|---|---|
