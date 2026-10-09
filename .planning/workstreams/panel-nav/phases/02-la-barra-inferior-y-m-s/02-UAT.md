---
status: testing
phase: 02-la-barra-inferior-y-m-s
source: [02-VERIFICATION.md, 02-04-SUMMARY.md]
started: 2026-10-09T15:10:00Z
updated: 2026-10-09T15:10:00Z
---

## Current Test

number: 7
name: A.4 — Tres pasadas de contraste
expected: |
  En forjo claro, en spa claro con paleta `clay` y en modern claro con paleta
  `amber`: el destino activo de la barra se distingue del inactivo, el foco se ve,
  y los títulos de grupo de Más (AGENDA, GESTIÓN, REPORTES, AJUSTES, CUENTA) se
  leen sin esfuerzo. La pasada de `modern` + `amber` es la que más importa: ahí el
  color de acento mide 2.15:1 y es donde se confirma que el indicador NO depende
  del acento.
awaiting: user response

## Orden de ejecución (decisión del dueño, 2026-10-09)

El dueño tiene **Android** a mano; el iPhone llega después. Los tests que dependen de iOS se
ejecutan **al final**, en una segunda tanda:

- **Test 1 (A.1)** — diferido entero: `env(safe-area-inset-bottom)` vale **0 en Android**, así que
  sólo un iPhone prueba el cálculo del inset.
- **Test 2 (A.2)** y **Test 5 (A.3c)** — se parten: la pasada de **Android Chrome** va ahora, la de
  **iOS Safari** queda para la segunda tanda. Ninguno de los dos se marca `pass` hasta tener las dos.

El resto (3, 4, 6, 7, 8, 9, 10, 11, 12, 13) se hace entero en Android.

## Preparación (antes de empezar)

- **El dev server del puerto 80 está COLGADO** (PID 2576: acepta la conexión TCP y no
  responde). Hay que matarlo y levantarlo de nuevo antes de agarrar el teléfono.
- Desde el celular: `http://192.168.0.3/` — la IP ya está en `allowedDevOrigins`
  (`next.config.ts`). Si el router cambió la asignación por DHCP, hay que sumar la IP
  nueva ahí o la página **no hidrata** y los forms caen al submit nativo.
- Seed local: `test@forjo.local` / `Forjo1234!`, slug `negocio-prueba`, `plan_status`
  en **`trial`** hasta el 2026-10-15 ⇒ sirve para el escenario **con banner** (A.3b).
- Varios ítems piden rubros distintos (`salud`, `belleza`, `general`, `canchas`) y
  temas/paletas distintos. Conviene agruparlos por cuenta para no repetir logins.

## Tests

### 1. A.1 — Franja de gestos en un iPhone (SÓLO la mitad de abajo)
expected: El `bg-card` de la barra cubre la zona de gestos (el *home indicator*) y el último label no queda debajo; en Android no hay hueco ni doble reserva.
scope: |
  ⚠ ACOTADO por el dueño durante la UAT (2026-10-09), y es correcto: **la mitad de
  ARRIBA no aplica**. En una pestaña del navegador la app nunca pinta debajo del
  notch — arriba está el chrome del browser. Coincide con lo que la fase ya declaró:
  el plan 02-03 dice que NO pone los insets laterales y acepta por escrito que "en un
  iPhone con notch, en landscape, el contenido puede quedar a ras del notch". Esta
  fase reserva ÚNICAMENTE `env(safe-area-inset-bottom)`.
  El notch recién importa el día que esto corra como app de pantalla completa (PWA en
  modo standalone, o nativa), donde la app sí ocupa de borde a borde.
why_human: `env(safe-area-inset-bottom)` vale 0 en Android y en todo emulador headless; sólo un iPhone real lo ve. La wave 1 lo confirmó en UN teléfono Android con captura del dueño; falta el iPhone.
result: [pending]

### 2. A.2 — Teclado abierto en Android Chrome **y** iOS Safari
result: pass (Android) — pendiente la pasada de iOS Safari
notes: |
  Probado en Android: buscador de /clients, drawer de alta de turno y el diálogo
  "Nueva venta" de Finanzas (el largo, con el buscador de cliente anidado al pie).
  Buen funcionamiento en los tres: la barra no tapa el campo ni el submit y el
  contenido no salta al cerrar el teclado.
  HALLAZGO LATERAL, fuera del alcance de la fase: el diálogo de Finanzas pierde el
  borrador al tocar afuera. Registrado como todo propio
  (`.planning/todos/pending/2026-10-09-guarda-de-borrador-en-los-dialogos-de-finanzas.md`);
  el arreglo es reusar `guardDraftOnDismiss`, que ya usan el alta de turno y el de abono.
expected: Con el formulario largo de Finanzas, el drawer de alta de turno (enfocando el último campo) y el buscador de `/clients` (que ahora vive dentro de un `absolute inset-0`): la barra no se ve ni tapa el campo ni el submit, y al cerrar el teclado el contenido vuelve sin saltar.
why_human: Lo exige el criterio 3 del ROADMAP ("lo prueba en el teléfono"). `interactiveWidget='resizes-visual'` es el default y está declarado, pero iOS Safari desplaza el layout viewport por su cuenta, y este repo ya pagó 4 quicks de teclado. El cambio estructural suma una variable que ningún headless ve: cómo se comporta `dvh` con el teclado abierto en cada motor.
result: [pending]

### 3. A.3 — Nada tapado
result: pass
notes: |
  Probado en celular real (Android), incluido el scroll DENTRO de la lista de
  /clients, que es lo que valida el arreglo estructural del alto. Nada tapado.
expected: Botones de alta de Finanzas, footers de Negocio y Configuración, final de Más (la firma), y final de la lista y de la ficha en `/clients` y `/clinical-history` — scrolleando **DENTRO** de la lista y **DENTRO** de la ficha, no arrastrando la página. Todo completamente visible y alcanzable con el pulgar con la barra presente. **Si hace falta arrastrar la página para ver la última fila, el arreglo no tomó efecto.**
result: [pending]

### 4. A.3b — `/clients` con banners visibles
result: pass
notes: |
  Probado en celular real con el banner ámbar de `trial` visible. El último
  cliente queda sobre la barra y la página no se arrastra (sin doble scroll).
  Confirma en pantalla la medición del cierre de raíz del residuo (solape 1px
  con 0, 1, 2 y 3 banners; `docScr` 0).
expected: Con el banner de período de prueba (`plan_status='trial'`) a 375px, y después sumando el de MercadoPago caído: el último cliente de la lista queda visible y tocable por encima de la barra con uno y con dos banners, y la página **no se puede arrastrar** (sin doble scroll). El solape medido en la sonda es 1px con 0, 1, 2 y 3 banners.
why_human: Es el estado por defecto de todo negocio nuevo, y la altura real del banner depende de la fuente y del ancho. Las dos sondas usaron bloques de altura fija, no el banner real.
result: [pending]

### 5. A.3c — `/clients` con la barra de URL visible
result: pass (Android Chrome) — pendiente la pasada de iOS Safari
notes: |
  Probado con la barra de URL visible y sin scrollear antes. La zona de scroll de
  la lista termina exactamente donde empieza la barra, con barra de scroll interna
  visible (confirma que scrollea la LISTA y no el documento, o sea el
  `absolute inset-0`), y el final de la lista queda por encima de la barra.
  Confirma en pantalla la decisión `vh` → `dvh`.
expected: En Android Chrome e iOS Safari, sin haber scrolleado la página antes: el final de la lista queda por encima de la barra. El mecanismo usa `dvh` a propósito (con `vh` el solape medido por proxy era de 60px; con `dvh`, 0).
why_human: Ningún headless tiene barra de URL; los 60px son una simulación. Hay que ver que `dvh` se comporta como dice la especificación, en particular en iOS Safari.
result: [pending]

### 6. A.3d — Las 12 pantallas que FLUYEN (ítem nuevo de la tercera pasada)
result: pass
notes: |
  Recorridas en celular real. Es el ítem que cubría el riesgo más ancho de la
  fase: el `<main>` pasó de contenedor de bloque a contenedor flex y su envoltorio
  a `relative grow`, para las 15 pantallas, y ninguna de las dos sondas había
  renderizado una pantalla real (midieron cajas con CSS real y contenido sintético).
expected: `/abonos`, `/agenda`, `/appointments`, `/ayuda`, `/consultorios`, `/dashboard`, `/equipo`, `/finances`, `/mas`, `/negocio`, `/servicios`, `/settings` (y `/web`): cada una se ve igual que antes de la fase en ancho, padding y sticky; la última fila queda por encima de la barra; los banners y el `TestModeBanner` (sticky) siguen pegados bajo el header; ningún scroll horizontal nuevo.
why_human: El `<main>` pasó de contenedor de bloque a contenedor **flex** y su envoltorio a `relative grow`. Es el ancestro común de las 15 pantallas y lo más ancho que tocó la fase. Las dos sondas midieron cajas con CSS real pero contenido sintético: **ninguna renderizó una pantalla real** (el dev server estaba colgado).
result: [pending]

### 7. A.4 — Tres pasadas de contraste
expected: **forjo claro**, **spa claro con paleta `clay`** y **modern claro con paleta `amber`**. En las tres: foco visible, activo distinguible del inactivo, y el eyebrow de grupo de Más legible (5.02:1 el peor caso medido). Mirar también la línea de plan del bloque de identidad (WR-05, sigue en `--muted-foreground`: 3.41:1 en spa claro).
why_human: Los números salen de cálculo y spa/modern usan `color-mix` (aproximado); el criterio de diseño es visual.
result: [pending]

### 8. A.5 — La UAT de v0.30 repetida DESDE LA BARRA
expected: sección → atrás del sistema → **Inicio**; el atrás cierra overlay, selector, calendario y teclado antes de navegar; los cambios sin guardar preguntan antes de descartar; tocar el destino actual con una subsección abierta la cierra en vez de apilar.
why_human: Criterio 6 en su parte conductual. El modo de falla del historial es silencioso y el repo ya tuvo 7 bugs que sólo aparecieron en un teléfono. El mecanismo está intacto por diff vacío, pero la conducta **desde el origen nuevo** (la barra y `/mas`) no se miró.
result: [pending]

### 9. C — Inventario de Más, rubro por rubro, en pantalla
expected: salud 8 · belleza 8 · general 8 · canchas 7, más `CUENTA` (Ayuda, "Ver mi página" en pestaña nueva, Cerrar sesión) y el bloque de identidad (nombre de ≥40 caracteres truncando, firma alcanzable, logout con su rama de error). La barra dice **Pacientes** en salud y **Reservas** en canchas. Ningún label truncado, con el eje de las 5 familias tipográficas (mínimo `geometrica` y `bauhaus` con el ítem activo).
why_human: El inventario está probado puro contra los 4 verticales, pero que el `VerticalProvider` entregue el rubro correcto en runtime y que los labels se lean bien sólo se ve abriendo las cuentas en un teléfono.
result: [pending]

### 10. D — Header de dos líneas y menú único
expected: La línea 2 cambia por sección y por terminología; dice **"Inicio"** en la raíz (el sidebar de desktop sigue diciendo "Dashboard" **a propósito**, §14, no es bug); un nombre largo trunca; **no hay botón de menú en ninguna pantalla mobile**; y con el lector de pantalla cada fila se anuncia bajo el nombre de su grupo, con los dos landmarks con nombres distintos.
why_human: Terminología en runtime, lector de pantalla y orientación a mitad de scroll no se ven con `grep`.
result: [pending]

### 11. E.1 — Banda de 900px y desktop ≥1024px
expected: A **900px**: barra y header presentes, sin botón de menú. A **≥1024px**: cero barra, cero header mobile, sidebar idéntico al de hoy, sin padding inferior extra, `/clients` y `/clinical-history` a pantalla completa **sin hueco de 56px abajo** (conservan `lg:h-screen`), y **"Cerrar sesión" del sidebar funcionando** — es el único camino de código que ningún test ejecuta.
result: [pending]

### 12. E.2 — `<meta name="viewport">` servido en `/dashboard` y `/admin`
expected: `/dashboard` trae `viewport-fit=cover, interactive-widget=resizes-visual`; `/admin` sigue con `width=device-width, initial-scale=1` y **nada más**.
why_human: El plan 02-04 sólo pudo medir 4 de las 6 rutas servidas; `/dashboard` y `/admin` devolvieron 307 sin sesión. Evidencia estática que lo acompaña sin sustituirlo: un único `export const viewport` en todo `app/`, en `app/(dashboard)/layout.tsx`.
result: [pending]

### 13. R-3 — El logout fallando: que el aviso de error aparezca
expected: Forzando la falla de `signOut()` (por ejemplo cortando la red del teléfono justo antes de tocar "Cerrar sesión" en Más): aparece el toast **"No pudimos cerrar la sesión. Probá de nuevo."** y **la app NO navega a `/login`** — seguís dentro del panel, con la sesión viva.
why_human: Es la pata humana de **T-02-10** (`high`, Repudiation: "una sesión que el dueño cree cerrada y no lo está"). La pata de código está presente y verificada (`mas-client.tsx:114-124`: el `toast.error` y el `return` que no navega), pero **ningún test ejecuta esa rama** y la auditoría de seguridad detectó que tampoco estaba agendada acá. Más es la **única** salida de sesión en mobile: si falla en silencio y navega igual, el dueño deja la sesión abierta creyendo que la cerró.
result: [pending]

## Los DOS recorridos que NO son bugs

Están declarados por escrito para que no se reporten como fallas:

1. **`Más → Inicio → atrás` cae en Más.** Es la cuarta rama de `panelNavMode` (`to === root ⇒ push`), decisión declarada del plan 02-01.
2. **`Más → sección → atrás` cae en Inicio**, salteando Más. El atrás es de **un** nivel en esta fase, a propósito; los dos niveles son la Phase 3 (MOB-04).

## Summary

total: 13
passed: 5
issues: 0
pending: 8
skipped: 0
blocked: 0

## Gaps
