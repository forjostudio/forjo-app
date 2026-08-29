# Phase 19 — UI Review

**Audited:** 2026-08-29
**Baseline:** `19-UI-SPEC.md` (aprobado 6/6, **con la enmienda del 2026-08-26** a la fila `Guardando (savingHours)`)
**Screenshots:** **NO capturados.** Hay dev server en `localhost:3000` pero devuelve **307** (redirect a `/login`): la pantalla auditada vive detrás de sesión y el capturador CLI sin login sólo fotografía el login. Auditoría **de código contra contrato**.
**UAT visual:** 1 de 3 checks humanos pasó (la línea de chips, 2026-08-27). Todo lo que sólo se resuelve con ojos queda marcado como **NO VERIFICADO**.

---

## Pillar Scores

| Pillar | Score | Key Finding |
|--------|-------|-------------|
| 1. Copywriting | 3/4 | Copy fiel al contrato casi palabra por palabra; `Ver todos (N)` cuenta el chip comodín, así que N ≠ cantidad de servicios |
| 2. Visuals | 3/4 | Anatomía exacta a la del contrato; los dos `role="status"` se montan junto con su contenido ⇒ el anuncio que el spec promete probablemente no ocurre |
| 3. Color | 3/4 | Cero hex y cero acento en el código nuevo (contrato cumplido); la fila que la fase retocó sigue usando `text-red-400` crudo en vez de `--destructive` |
| 4. Typography | 4/4 | Exactamente 2 tamaños y 2 pesos en el código nuevo; ninguna de las clases prohibidas aparece |
| 5. Spacing | 3/4 | Escala del contrato respetada al pie; el reparto de los ~74px liberados y las ~2 filas a 375px siguen SIN verificar con ojos |
| 6. Experience Design | 2/4 | **BLOCKER:** "Duración del turno" y "Descanso entre turnos" los guarda el MISMO botón pero quedaron fuera de `hoursDirty` y fuera del congelamiento de CR-01 |

**Overall: 18/24**

---

## Top 3 Priority Fixes

1. **BLOCKER — los dos `Select` de duración/descanso están fuera del contrato de guardado** (`agenda-client.tsx:1311`, `:1329`). Los persiste el mismo `saveHours` (`:835`) pero (a) no llaman a `setHoursDirty(true)`, así que cambiarlos no enciende "Cambios sin guardar", y (b) no llevan `disabled={savingHours}`, así que un cambio hecho con el RPC en vuelo se pierde en silencio (el `update` de `:835` usa el valor capturado al empezar) y encima `setHoursDirty(false)` de `:826` borraría la señal si la hubiera. Es exactamente el modo de falla de CR-01, en dos controles que el fix no alcanzó. *Fix:* `onValueChange={v => { setSlotDuration(Number(v)); setHoursDirty(true) }}` (ídem buffer) + `disabled={savingHours}` en los dos `SelectTrigger`.
2. **WARNING — los `role="status"` no van a anunciar nada.** El chip comodín (`:319-325`) y "Cambios sin guardar" (`:1488-1490`) se **montan** con su texto adentro. Una live region tiene que existir en el DOM *antes* de que cambie su contenido para que el lector la locute; montada de cero, la mayoría de los SR no dicen nada. El contrato afirma lo contrario ("cuando reaparece, un lector de pantalla lo anuncia"). *Fix:* renderizar el contenedor `role="status"` siempre y condicionar sólo el hijo (`<span role="status" className="inline-flex min-h-11 items-center">{wildcard && <span …/>}</span>`), que además refuerza el "cero layout shift" que ya buscaba el `min-h-11`.
3. **WARNING — `Ver todos (${total})` cuenta el chip comodín** (`:352`, `total = shown.length + (wildcard ? 1 : 0)`, `:286`). Un negocio con 7 servicios y ninguno marcado lee "Ver todos (8)". Que el comodín cuente para el **umbral** está bien y es lo que pide el spec; que cuente en el **número que se le muestra al dueño** no lo pide nadie y el número deja de significar "tus servicios". *Fix:* `Ver todos (${shown.length})`, dejando `total` sólo para decidir `collapsible`.

---

## Detailed Findings

### Pillar 1: Copywriting (3/4)

Lo que cumple, verificado string por string contra la tabla de Copywriting Contract:

- Línea guía (`:1369-1371`), empty state + link `Ir a Servicios` (`:1373-1376`), `Cualquier servicio` (`:322`), `{nombre} · inactivo` (`:329`), el `aria-label` largo del inactivo (`:333`), `Ver menos` (`:352`), `Cambios sin guardar` (`:1489`), el toast de quitar un inactivo (`:340`) y los dos toasts de copiar día (`:751-753`) están **literales**, con voseo, sin emojis y sin admiraciones.
- La terminología sale de `term.services.toLowerCase()` y **evita el artículo** antes de la interpolación, como manda la regla de género (`:1370`, `:752`).
- Bloque D (`booking-client.tsx:414`): la copy de `service_not_scheduled` es exacta y el comentario documenta por qué no dice "intentá de nuevo". El código de error viaja solo, no se interpola el mensaje de la base. ✓
- Bloque C (`settings-client.tsx:1305-1317`): **supera** el contrato. El spec pedía una frase; el código emite tres según cuántas franjas quedan comodín, porque la frase única mentía en el caso mixto (WR-03). Ninguna de las tres dice "se rompe" ni "queda sin servicio". ✓
- Las 5 copies de rechazo del guardado (`:451-457`) respetan "nunca el mensaje de la base".

**WARNING-01 — `Ver todos (N)` incluye el comodín** (`:352` + `:286`). Ver fix #3.
**WARNING-02 — `not_deployed` y `reload` dan al dueño dos textos casi idénticos** (`:452` vs `:455`: "Recargá la página y probá de nuevo" / "Probá de nuevo en un momento") para dos causas opuestas. No es incorrecto —el diagnóstico real va a consola a propósito— pero "probá de nuevo en un momento" promete que el tiempo lo arregla, y una migración sin aplicar no se arregla esperando. Sugerido: "No se pudieron guardar los horarios. Si sigue pasando, avisanos."
**Deuda declarada, no penalizada:** "Cualquier servicio" queda literal en canchas/salud porque `term` no tiene singular. Está anotado en el spec como deuda menor y el gate de canchas lo esquiva.

### Pillar 2: Visuals (3/4)

- La anatomía es la del contrato: `div.space-y-1` → fila de horas → `p` de error → `BlockServicesLine` (`:1435-1452`). El error queda pegado a los inputs. ✓
- Los tres portadores del estado marcado están los tres (`Check` + `bg-secondary` + `text-foreground`, `:245-246`), y el comodín se distingue por **forma + glifo + palabra** (`border-dashed` + `Asterisk` + el texto), nunca por color. ✓
- `ServiceChip` y `BlockServicesLine` están definidos **fuera** de `AgendaClient` (`:212`, `:259`), como pedía el riesgo #1 del spec. ✓
- Iconos decorativos con `aria-hidden` (`:252`, `:321`). La `×` recibió su `aria-label` y su anillo de foco (`:1428-1432`). ✓

**WARNING-03 — las live regions probablemente no locutan.** Ver fix #2. Afecta a los dos únicos anuncios de la fase.
**WARNING-04 — la fila que la fase retocó sigue con jerarquía de color heredada.** La `×` pasa a `hover:text-red-400` (`:1430`) y el error usa `text-red-400` (`:1437`) — rojo crudo de la paleta de Tailwind en la misma fila donde ahora conviven chips 100% tokenizados. Contraste visual inconsistente entre lo nuevo y lo viejo. Preexistente, pero la línea de la `×` se tocó en esta fase, así que la ocasión estuvo.
**NO VERIFICADO (necesita ojos):** que el bloque de chips lea como "peso secundario" y no como campos vacíos (D-14/AGENDA-06) en una cuenta real con 0 mapeos; que el `Check` a `size-3` sea legible a 12px; que el borde `dashed` se distinga del sólido en dark. El único check humano que pasó (2026-08-27) cubre la línea de chips en general, no estos tres detalles.

### Pillar 3: Color (3/4)

- **Código nuevo: cero hex, cero `text-neutral-*`, cero acento.** Grep sobre `:178-360` (todo el código nuevo de chips): 0 hits de `#`, `text-primary`, `text-red-`, `text-[`.
- Los estados usan exactamente los pares del contrato: sin marcar `border-border bg-transparent text-muted-foreground` (`:246`), marcado `border-foreground/30 bg-secondary text-foreground` (`:245`). ✓
- `--warning` se usa en **un solo lugar** de toda la fase (`:1489`), como exige el contrato, y el token existe en las tres capas de `globals.css` (`:40`, `:90`, `:156`, `:309` — incluido el override que evita heredar el ámbar de `.dark`). ✓
- `disabled:opacity-50` (`:236`) es la **única** opacidad, y sólo durante el guardado. No contradice la prohibición de atenuar chips: apaga la línea entera, no un chip contra otro. Está justificado en el docblock. ✓

**WARNING-05 — `text-red-400` sigue puenteando `--destructive`** (`:1430`, `:1437`). El propio spec exige "cada color como clase de token […] es lo que hace que funcione en 5 themes × 5 paletas × dark". `red-400` es un valor fijo que no responde ni al tema ni a la paleta. Preexistente y fuera del alcance declarado, pero es la única grieta de color de la pantalla.
**NO VERIFICADO (necesita ojos):** los contrastes que el spec da como medidos (4.99:1 / 13.1:1 / 6.68:1 / 12.3:1). Son derivaciones sobre tokens, no medidas del render; `border-foreground/30` en particular es un alfa sobre `--secondary` y su contraste real de **borde** (no de texto) no está en la tabla. Se resuelve con un contraste medido en el navegador, en light y dark, en las 5 paletas.

### Pillar 4: Typography (4/4)

Grep sobre el código nuevo (`:178-360`): **0 hits** de `text-base`, `text-lg`, `text-[`, `font-semibold`, `font-bold`, `italic`. Los únicos hits en el bloque de render son líneas preexistentes que el contrato declara intocables (el chip del día `font-semibold`/`text-primary` en `:1386-1389`, "Agregar bloque" `text-primary` en `:1459`).

Distribución real del código nuevo: **2 tamaños** (`text-xs` en chips, comodín, trigger, línea guía, indicador sucio; `text-sm` en los inputs de hora preexistentes) y **2 pesos** (`font-medium` en chips y trigger; default en la línea guía y el error). Es exactamente la tabla del contrato, sin excepciones. La excepción declarada de `text-xs` a 12px sigue mitigada por área táctil de 44px y contraste AA por token.

Único apunte sin peso: el `· inactivo` va con el mismo `font-medium` que el nombre, así que el sufijo pesa lo mismo que el dato. Es lo que el contrato pide (una sola clase para el chip) y no cuento como hallazgo.

### Pillar 5: Spacing (3/4)

- El grupo es `flex flex-wrap items-center gap-x-2 gap-y-0` (`:303`), literal. ✓
- Pill `h-7 … gap-1 px-3` (`:243`) dentro de un botón `min-h-11 min-w-11` (`:236`), icono `size-3` (`:252`). Los cuatro valores del contrato. ✓
- Trigger `min-h-11 … px-1` (`:349`). ✓
- Comodín con `min-h-11` (`:320`) para que la altura de la línea no cambie al aparecer/desaparecer. ✓
- **El stepper se borró de verdad:** no queda ningún `<input type="number">` ni `Minus` en la fila; los dos inputs de hora quedaron `min-w-0 flex-1` (`:1414`, `:1423`) y no se agregó ningún control en el espacio liberado. ✓
- `Minus` **sigue importado** (`:20`) — el spec pedía verificar antes de borrar el import; si no lo usa nadie más en el archivo es un import muerto (cosmético, y eslint no lo marcó como hallazgo nuevo).

**WARNING-06 — la fila del error usa `pl-0.5` (2px)** (`:1437`), fuera de la escala de 4. Preexistente y no tocado, pero queda inmediatamente arriba de una línea nueva que sí respeta la escala.
**NO VERIFICADO (necesita ojos, y es el corazón del contrato de spacing):** que a **375px reales** entren ~3 chips por fila y que el umbral de 6 dé las ~2 filas prometidas; que los inputs de hora efectivamente pasen de ~78px a ~115px; que **nunca** haya scroll horizontal con un nombre largo tipo "Masaje descontracturante". Todo eso es aritmética de ~85px por chip hecha en el spec, no una medición. Es el check humano #2 que sigue pendiente y **no se puede cerrar leyendo código**.

### Pillar 6: Experience Design (2/4)

Lo que está bien: el congelamiento de CR-01 se aplicó donde dice la enmienda (toggle de día `:1388`, los dos inputs `:1411`/`:1419`, la `×` `:1428`, `BlockServicesLine` `:1448`, "Agregar bloque" `:1458`, "Copiar a otros días" `:1465`, el botón de guardar `:1485`), el botón cambia de texto a "Guardando..." (`:1486`), `hoursDirty` cubre los **seis** mutadores del editor (`:615`, `:629`, `:645`, `:660`, `:676`, `:736`) y se apaga sólo tras éxito (`:826`), el error de guardado no toca el estado local (`:815`), el `Set` de expandido se resetea al eliminar bloque (`:643`) y al cambiar de consultorio (`:604`), y `applyCopyDay` clona el array (`:748`) evitando el aliasing del riesgo #2. El fallo mudo del `update` de duración/descanso ahora sí se chequea (`:838`) con copy que dice la verdad completa.

**BLOCKER-01 — dos controles del mismo guardado quedaron fuera del contrato.** `slotDuration` (`:1311`) y `bufferMinutes` (`:1329`) los persiste `saveHours` en `:835`, pero:
- no encienden `hoursDirty` ⇒ el dueño cambia la duración del turno, se va de la pantalla y **no ve ninguna señal**. El indicador que la fase agregó para no perder configuración no cubre el control más viejo de la card.
- no llevan `disabled={savingHours}` ⇒ con el RPC en vuelo el `Select` sigue vivo; el `update` de `:835` usa el valor capturado al arrancar y el nuevo se **pierde sin ruido**, con `hoursDirty` ya apagado en `:826`. Es la misma pérdida silenciosa de CR-01, en los dos controles que el fix no barrió.

La enmienda del spec dice "junto con **todo** el resto del grid". Estos dos están en la misma Card y en el mismo botón. **Acá el código está mal, no el contrato.**

**WARNING-07 — divergencia consciente con la enmienda, no documentada en el spec.** El trigger "Ver todos" **no** recibe `disabled` (`:346-353`), con una justificación sólida en el docblock (`:266-270`: el colapso no toca configuración, no hay nada que perder). Estoy de acuerdo con el código; lo que falla es el contrato, que después de la enmienda dice "todo el grid" sin exceptuarlo. *Fix documental:* agregar la excepción a la fila `Guardando` del spec, o el próximo lector va a "arreglar" el código en la dirección equivocada.

**WARNING-08 — el toast del inactivo se dispara antes de saber si el toggle pega.** `:339-340` llama a `onToggleService` y después afirma "Quitaste …". Como el cambio no persiste hasta "Guardar horarios", el aviso afirma un hecho que todavía no ocurrió; si el dueño se va sin guardar, el mapeo sigue vivo y el toast mintió. No es grave (el chip desaparece y eso sí es cierto en pantalla), pero es la única copy de la fase en tiempo pasado sobre algo no persistido. Sugerido: "Sacaste …" ya no alcanza; mejor cerrar con "· acordate de guardar", como los toasts de copiar día.

**NO VERIFICADO (necesita ojos):** que la pantalla congelada durante el guardado se lea como "esperá" y no como "se rompió" (`opacity-50` sobre 7 controles a la vez es mucha superficie apagada); que el chip comodín reaparezca **al instante y sin salto** al apagar el último servicio (D-17); que el toast del inactivo no tape la línea en mobile. Son los checks humanos #2 y #3, ambos abiertos.

**No re-reportados** (aceptados con riesgo documentado): WR-05 (`showServicesLine`) y WR-06 (`hasChipCatalog` reimplementa la regla inline). Fuera de alcance por decisión: la vista semanal (D-13) y el eslint de `settings-client.tsx` fuera del diff. La tarjeta de servicio de Ajustes fue reestructurada por el quick task `260828-lpg`, posterior a esta fase, y no se auditó.

---

## Registry Safety

`components.json` presente, `"registries": {}`. El contrato declara **cero registries de terceros** y la fase no instala componentes: `ServiceChip` y `BlockServicesLine` son funciones locales del propio archivo, y los iconos (`Check`, `Asterisk`) salen de `lucide-react`, ya instalado.

**Registry audit: 0 bloques de terceros verificados, sin flags.**

---

## Files Audited

- `app/(dashboard)/agenda/agenda-client.tsx` (:20, :178-360, :530-690, :720-845, :1300-1495)
- `app/(dashboard)/agenda/page.tsx`
- `app/(dashboard)/settings/settings-client.tsx` (:1147-1340)
- `app/[slug]/booking-client.tsx` (:394-418)
- `app/globals.css` (tokens `--warning`, `--secondary`, `--muted-foreground`, `--border`)
- `components.json`
- `.planning/workstreams/motor-reservas/phases/19-el-panel/`: `19-UI-SPEC.md` (con enmienda), `19-CONTEXT.md`, `19-REVIEW.md`
