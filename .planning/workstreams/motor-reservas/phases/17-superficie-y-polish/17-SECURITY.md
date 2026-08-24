---
status: secured
phase: 17-superficie-y-polish
workstream: motor-reservas
milestone: v0.27
asvs_level: 2
block_on: high
threats_total: 54
threats_closed: 54
threats_open: 0
audited: 2026-08-24
audit_base: 49b95b3..HEAD (bf16276)
---

# Phase 17 — Auditoría de seguridad

**Veredicto: SECURED.** 54 entradas de registro (45 IDs distintos: `T-17-01` … `T-17-44` + `T-17-SC`
repetido en los 10 planes) verificadas **contra el código instalado**, no contra los SUMMARY. Cero
abiertas. Cero mitigaciones declaradas ausentes.

## 0. Superficie real de la fase, medida

```
git diff --stat 49b95b3..HEAD -- . ':(exclude).planning'
 app/(dashboard)/agenda/agenda-client.tsx     | 342 +++++-----
 app/(dashboard)/finances/finances-client.tsx |  15 +-
 app/(dashboard)/settings/settings-client.tsx | 747 +++++++++++++++---
 lib/agenda-occupancy.ts                      | 221 ++++++
 test/agenda-occupancy.test.ts                | 318 ++++++++
 5 files changed, 1450 insertions(+), 193 deletions(-)
```

**Cinco archivos. Nada más.** Sin migración, sin `supabase/`, sin `app/api/**`, sin `proxy.ts`, sin
`components/ui/**`, sin `package.json` / `package-lock.json`, sin `page.tsx` de ninguna ruta. La
frontera de tenant no se movió: no hay endpoint nuevo, no hay cliente `service_role` nuevo, no hay
policy nueva.

**Comprobaciones de entorno:**

| Comprobación | Resultado |
|---|---|
| `./node_modules/.bin/tsc --noEmit` | exit **0** |
| `npx vitest run test/agenda-occupancy.test.ts` | **20 passed** |
| `git status` | limpio |
| Migraciones | ninguna nueva (prod sigue en 070) |

---

## 1. Lo único con superficie real: el segundo camino de escritura (D-08)

`saveCapacityInline` es lo que esta fase agrega al plano de escritura sobre `services`. Los cuatro
requisitos del contrato, verificados **en el cuerpo instalado** (`settings-client.tsx:1282-1317`):

| Requisito | Evidencia |
|---|---|
| Filtro explícito por tenant además de RLS | `settings-client.tsx:1297` — `.update({ capacity }).eq('id', svc.id).eq('business_id', business.id)`. Conteo del archivo: **16** ocurrencias de `.eq('business_id', business.id)` (era 15 antes de la fase) |
| Payload de **una sola clave**, jamás `capacity_mode` | `sed -n '1282,1320p'` → `update({ capacity })` = **1**. Las 2 ocurrencias de `capacity_mode` en el cuerpo son (a) `svc.capacity_mode` **leído** para derivar el piso y (b) un comentario. Cero en el payload |
| Rechazo del gate mapeado a copy propia, sin interpolar la base | `1305` → `GATE_MODE_CHANGE_MESSAGE` (constante compartida); `1309` → cadena fija. `toast.*` con una propiedad de `error` en TODO el archivo = **1**, y es la preexistente de la subida de foto (`1341`), fuera de alcance |
| Piso por modo respetado en ESTE camino (los guards del modal no lo defienden) | `1293` — `normalizeCapacity(cap, minCapacityFor(svc.capacity_mode ?? 'individual'))`, con `MAX_CAPACITY = 99` adentro de `normalizeCapacity` (`145`/`150`) |

**Prueba adicional, la más fuerte que había disponible:** el cuerpo de `saveCapacityInline` es
**byte-idéntico** desde el commit que lo introdujo (`f8a8a59`, plan 17-03) hasta HEAD, a pesar de dos
refactors posteriores que movieron el JSX de alrededor (17-09 extrajo el stepper, 17-10 lo cambió de
padre):

```
awk '/async function saveCapacityInline/,/^  }$/'  (f8a8a59)  vs  (HEAD)   →  diff vacío, 36 líneas
```

Eso cierra T-17-30 y T-17-44 sin depender de conteos aproximados: los planes 17-06, 17-09 y 17-10
tocaron el archivo, pero **no** la función.

**La autoridad existe y dice lo que el espejo de UX dice** (medido contra el Postgres local, no
asumido):

```
services_capacity_matches_mode_chk =
  CHECK (((capacity_mode = 'individual' AND capacity = 1)
       OR (capacity_mode IN ('group_class','simultaneous_resource') AND capacity >= 2)))

services_block_mode_change_trg = BEFORE UPDATE OF capacity_mode ON services FOR EACH ROW ...
```

`minCapacityFor` (individual ⇒ 1, resto ⇒ 2) es el espejo exacto del CHECK. Y como el trigger es
`BEFORE UPDATE **OF capacity_mode**`, un payload de una sola clave ni siquiera lo despacha — el
fail-closed de T-17-12 es real y además gratis.

---

## 2. D-09: el label de modo es inerte, y el fix de G-04 está instalado

El defecto que el dueño encontró en la ronda 3 de UAT (tocar el texto de la tarjeta cambiaba el cupo)
no era un handler suelto: era corrección del punto de toque contra botones de 44px a 4px del renglón.

| Gate | Esperado | Medido | Estado |
|---|---|---|---|
| Label de modo = `<span>` sin `onClick` / `role` / `tabIndex` | inerte | `settings-client.tsx:2320` — `<span className="font-medium text-foreground">{capacityModeLabel}</span>` | PASS |
| `tabIndex` en TODO el archivo | 0 | **0** | PASS |
| `role="button"` en TODO el archivo | 0 | **0** | PASS |
| Línea de datos (`2304-2318`): aperturas de botón / `onClick` / `role=` / `tabIndex` | 0/0/0/0 | **0/0/0/0** | PASS |
| `</div>` entre la línea de datos y el control | ≥ 1 | **1** | PASS |
| `basis-full` dentro de `className` | 0 | **0** | PASS |
| Zona de exclusión | 32px | `py-6` (24px) en la raíz del control (`703`) + `space-y-2` (8px) del contenedor de la tarjeta (`2240`) = **32px** arriba y abajo | PASS |
| `min-h-11` en el archivo | 7 | **7** | PASS |
| `h-11 w-11` (piso táctil del stepper) | 2 | **2** | PASS |
| atributos `onClick=` en el archivo | 63 | **63** | PASS |

El control es **hermano** de la línea de datos (`<CapacityInlineControl>` en `2321`, fuera del `<div>`
que cierra en `2318`), que es exactamente el cambio estructural que el plan 17-10 prometió. La UAT de
ronda 4 (R4-1) lo confirmó con el dedo a 375px, que es el único instrumento capaz de medirlo.

---

## 3. El par de accesibilidad T-17-36 / T-17-37

| Gate | Medido | Estado |
|---|---|---|
| Un solo manejador de click dentro de `CapacityModeFields` (el del radio) | `442` — `onClick={() => onChange({ capacity_mode: o.key, capacity: ... })}`; ningún otro en el componente | PASS |
| El explicador NO es interactivo | sin `onClick`, sin `role`, sin `tabIndex` (0/0 en el archivo entero) | PASS |
| El grupo colapsado conserva ejemplo y advertencia en el elemento referenciado | `437` `aria-describedby={cap-mode-help-${o.key}}` → `502` `id={cap-mode-help-${h.key}}` → `540` `<span className="sr-only">Ej: {h.example}{h.warning ? ...}</span>`, **hijo del mismo div del id** | PASS |
| La versión corta no es una redacción nueva | es `h.axis` de `CAPACITY_MODE_HELP`; `CAPACITY_MODE_HELP.map` = **2** (radiogroup + explicador) | PASS |

Verificado el cableado completo, no sólo la existencia del `sr-only`: el texto accesible vive **dentro
del elemento al que apunta `aria-describedby`**, así que un lector de pantalla compara los tres modos
sin activar ninguno — y activar es lo que escribe `capacity_mode` + `capacity` en el formulario.

Nota sobre el conteo del label: `'Clase grupal'` aparece 2 veces en el archivo (`206` como `label`,
`216` dentro del `warning` del modo simultáneo). Las dos están **dentro del mismo array**, así que
D-03 (fuente única de rótulos) se sostiene; la tarjeta lo resuelve con `.find` sobre el mismo array
(`2238`). El gate que el plan 17-08 midió (`CAPACITY_MODE_HELP.map` = 2) era el correcto.

---

## 4. Registro de riesgos ACEPTADOS — cada premisa medida, ninguna aceptada de palabra

Este milestone ya tuvo tres premisas aceptadas que resultaron falsas cuando alguien las ejecutó (dos
en T-16-05 de la Phase 16, una más en la UAT). Las cinco de esta fase se midieron.

### T-17-06 — el INSERT de `addService` sigue llevando `business_id` del cliente
**Premisa:** la RLS de `services` es la autoridad y rechaza un `business_id` ajeno.
**Medición (Postgres local, rol `authenticated` con el JWT del dueño A):**

```sql
insert into services (business_id, ...) values ('<negocio A>', ...);  -- INSERT 0 1
insert into services (business_id, ...) values ('<negocio B>', ...);
-- ERROR: new row violates row-level security policy for table "services"
```

La policy es `business member access` con `cmd = ALL` y `with_check = NULL`: Postgres usa el `USING`
como `WITH CHECK`, o sea el INSERT cruzado rebota. **Premisa VERDADERA.** Además el payload del
insert no se tocó en la fase (`1160-1161`) y el guard de doble submit sí se agregó (ver T-17-05).
**Aceptación válida.**

### T-17-20 — el módulo nuevo podría retener o loguear PII del cliente
**Premisa:** es puro, sin imports, no persiste, no serializa, no loguea.
**Medición sobre `lib/agenda-occupancy.ts`:** `import` = **0** · `require(` = **0** · `console.` =
**0** · `JSON.` = **0** · `fetch(`/`localStorage`/`window.`/`document.`/`process.env` = **0** ·
`Date.now` = **0** (el reloj entra por parámetro) · estado mutable a nivel de módulo (`let`/`var`) =
**0**. La única mención de `client_name` (línea 63) es un comentario; el módulo es **genérico** en el
tipo del turno y no declara ni lee ningún campo de PII. Lo que retiene es la **misma referencia** que
le pasó el caller, dentro de la estructura que devuelve. **Premisa VERDADERA. Aceptación válida.**

### T-17-21 — ampliar una consulta del server cambiaría el data flow
**Premisa:** D-12 cubre el caso por diseño y queda anotado, no arreglado.
**Medición:** `app/(dashboard)/agenda/page.tsx` **no está en el diff de la fase**. Su consulta sigue
siendo `from('services').select('*').eq('business_id', business.id).eq('active', true)` — o sea la
consecuencia aceptada (un servicio DESACTIVADO no resuelve ⇒ tratamiento individual, sin contador y
sin roster) es **literalmente cierta**, no hipotética. Anotada en el módulo (`lib/agenda-occupancy.ts:27-32`)
y en `17-04-SUMMARY.md:45`. **Premisa VERDADERA. Aceptación válida.**
*Reabrir si* un dueño reporta que desactivar un servicio le rompe la lectura de una clase viva.

### T-17-28 — el plan 17-05 no agrega ningún camino de escritura
**Premisa:** solo lectura sobre datos ya filtrados por tenant; el único efecto de un click es abrir un
diálogo local.
**Medición:** en el diff completo de `agenda-client.tsx` (49b95b3..HEAD) las líneas **agregadas** que
contienen `supabase.`, `.update(`, `.insert(`, `.upsert(`, `.delete(`, `.rpc(` o `fetch(` son **0**.
Las 8 escrituras que el archivo tiene son del editor de grilla semanal y son preexistentes e
intactas. `page.tsx` sin diff. El click del grupo llama `setRosterSlot` (`682`), estado local.
**Premisa VERDADERA. Aceptación válida.**

### T-17-31 — esconder el sufijo "lugares" mientras la fila está sucia
**Premisa:** la unidad viaja por los `aria-label`, vuelve a los ≥640px y en reposo está siempre
visible.
**Medición:** `732` — `<span className={cn(dirty && 'hidden sm:inline')}>lugares</span>` (se esconde
**sólo** si está sucio **y sólo** por debajo de 640px) · `352` — `aria-label="Cantidad de lugares"` ·
`328` — `aria-label={groupLabel}`, `713` — con `Lugares de ${service.name}`. **Premisa VERDADERA.
Aceptación válida.**

### T-17-SC (×5, planes 17-01…17-05) — cadena de suministro
`git diff -- package.json package-lock.json` **vacío** en toda la fase (confirmado por el diff-stat de
5 archivos). Cero paquetes nuevos ⇒ no hay checkpoint de legitimidad que abrir. **Aceptación válida.**

---

## 5. Verificación de las 44 entradas `mitigate`

| ID | Categoría | Evidencia en el código instalado | Estado |
|---|---|---|---|
| T-17-01 | Tampering | El clamp se movió, no se borró: `settings-client.tsx:586-608` (`onInputBlur` → `normalizeCapacity(base, minCapacityFor(value))`) y el payload de `saveEditService` (`1258`) / `addService` (`1158`) siguen normalizando | CLOSED |
| T-17-02 | Tampering | `MAX_CAPACITY = 99` (`145`) dentro de `normalizeCapacity` (`150`) + `max={MAX_CAPACITY}` en las dos superficies (`560`, `712`); `minCapacityFor` usado **6** veces | CLOSED |
| T-17-03 | Information Disclosure | El explicador (`197-224`, `497-547`) no menciona el gate. La copy del rechazo es **byte-idéntica** a la del commit base: sólo se extrajo de literal inline a constante (`167`) | CLOSED |
| T-17-04 | Tampering | `role="radio"` en `CapacityModeFields` = **1** (`432`), derivado del mismo array; el handler sigue patcheando modo + cupo juntos (`442`) | CLOSED |
| T-17-05 | Repudiation | `addService` (`1146-1170`): `if (!newService.name) return` conservado, `if (savingNewSvc) return`, apagado en `finally`; botón `disabled` + etiqueta (`2400-2401`) | CLOSED |
| T-17-07 | DoS (UX) | `2426` `max-h-[calc(100svh-2rem)] grid-rows-[auto_minmax(0,1fr)_auto]` · `2436` cuerpo `min-h-0 overflow-y-auto` · `2479` `DialogFooter` anclado fuera del scroll. UAT test 2 = pass | CLOSED |
| T-17-08 | Tampering | `components/ui/dialog.tsx` **no está en el diff de la fase** | CLOSED |
| T-17-09 | Tampering | `1297` `.eq('business_id', business.id)`; conteo del archivo 15 → **16** | CLOSED |
| T-17-10 | Information Disclosure | `1305` constante compartida, `1309` cadena fija; `toast.*` con propiedad de `error` en el archivo = **1** (preexistente, subida de foto `1341`) | CLOSED |
| T-17-11 | Tampering | Doble normalización: `722-725` (`onInputBlur` del control) y `1293` (antes del UPDATE), ambas con `minCapacityFor` + `MAX_CAPACITY` | CLOSED |
| T-17-12 | Elevation of Privilege | Payload `{ capacity }` = 1 clave (`1297`); label de modo `<span>` inerte (`2320`); red de seguridad real: trigger `BEFORE UPDATE OF capacity_mode` verificado en la base | CLOSED |
| T-17-13 | DoS (UX) | `savingCapacityId` por tarjeta (`1228`, `1284`, `1298`) y call-site `saving={savingCapacityId === s.id}` (`2323`); se apaga antes de todas las ramas de error | CLOSED |
| T-17-14 | Repudiation | `handleSave` (`668-678`): `revert()` **antes** de marcar el error; la marca (`rejected`) dura 4s y el canal del mensaje es el toast | CLOSED |
| T-17-15 | Tampering | Cero `<p>` de error dentro de la tarjeta: la marca es `invalid={rejected}` (`716`) → `border-destructive` (`333`) + `aria-invalid` (`329`) en el grupo del stepper | CLOSED |
| T-17-16 | Tampering | `lib/agenda-occupancy.ts` no recibe bloques (firma `buildDayEntries(dayAppts, serviceById, nowMs)`); ocurrencias de `time_blocks` en el módulo = **0** | CLOSED |
| T-17-17 | Tampering | `141` y `198` deciden por `capacity_mode === '…'`, nunca por el número; casos 8 y 9 de la suite lo congelan | CLOSED |
| T-17-18 | Information Disclosure | `147` — key `${a.date}\|${time}\|${a.service_id}`; caso 4 de la suite, probado **por mutación** | CLOSED |
| T-17-19 | Tampering | `occupiesSeat` (`109-114`) replica el guard del RPC (hold vencido no ocupa); caso 2, probado **por mutación** | CLOSED |
| T-17-22 | Tampering | Lectura vieja borrada entera: `capacityFor(` = **0**, `const isGroup` = **0**, `initialTimeBlocks` 6 → **4** (los 4 restantes son el editor de grilla y `openDays`) | CLOSED |
| T-17-23 | Tampering | El roster **recupera**, no recalcula: `553-566` hace `find` sobre `entriesByDate` y lee `entry.occupied` / `entry.capacity` del mismo objeto renderizado | CLOSED |
| T-17-24 | Information Disclosure | `rosterSlot` viaja con `serviceId` (`539`, `682`) y el `find` compara `e.serviceId === serviceId` (`556`) | CLOSED |
| T-17-25 | Information Disclosure | `94` `hasPending = pendingDeposit >= 1` → segundo segmento del badge (`114`) y `677` el `aria-label` repite el aviso con palabras | CLOSED |
| T-17-26 | DoS (UX) | Una fila por slot: `708` `min-w-0 flex-1 truncate` para el nombre y `725` `max-w-full` en el badge; el contador va primero, así que lo único que puede ceder es la cola del aviso | CLOSED |
| T-17-27 | Tampering | `capacity_mode` en `agenda-client.tsx` = **1**, y es un comentario (`45`): el componente no re-implementa la decisión de modo | CLOSED |
| T-17-29 | Tampering | `tabIndex` = **0** y `role="button"` = **0** en todo el archivo; el label sigue siendo `<span>` (`2320`) | CLOSED |
| T-17-30 | Tampering | Cuerpo de `saveCapacityInline` **byte-idéntico** entre `f8a8a59` y HEAD (diff vacío, 36 líneas); payload 1 clave, filtro por tenant presente | CLOSED |
| T-17-32 | Information Disclosure | `GATE_MODE_CHANGE_MESSAGE` byte-idéntica a la cadena del commit base; el manejo de errores no se tocó en 17-06 | CLOSED |
| T-17-33 | Tampering | Los tres commits de 17-07 (`4093abf`, `bfcd3ed`, `35b8488`) tocan **sólo** `agenda-client.tsx` y docs; módulo y suite sin diff; suite **20/20** | CLOSED |
| T-17-34 | Information Disclosure | El `aria-label` del botón del grupo (`677`, `683`) dice ocupación **y** aviso de seña con palabras y no se modificó en el fix de layout | CLOSED |
| T-17-35 | Elevation of Privilege | El nivel 1 es un `<span>` (`706-709`), no un control; `setRosterSlot` en la rama de grupo = **1** (`682`); consumidores del badge = **2** (`720`, `751`) | CLOSED |
| T-17-36 | Tampering | Un solo manejador de click en `CapacityModeFields` (`442`); explicador sin rol ni índice de tabulación | CLOSED |
| T-17-37 | Information Disclosure | `sr-only` con ejemplo + advertencia (`540`) **dentro** del div con `id={cap-mode-help-*}` (`502`) al que apunta `aria-describedby` (`437`) | CLOSED |
| T-17-38 | Tampering | La versión corta ES `h.axis` del array; `CAPACITY_MODE_HELP.map` = **2** | CLOSED |
| T-17-39 | Tampering | `CapacityStepper` **no clampea**: propone `value-1` / `value+1` (`341`, `372`) y cada caller aplica su piso; `minCapacityFor` 5 → **6** usos; `saveCapacityInline` intacto | CLOSED |
| T-17-40 | Elevation of Privilege | El stepper no recibe ni escribe el modo (props: `value/text/min/max/groupLabel/…`); payload inline de una sola clave; `tabIndex` 0 / `role="button"` 0 | CLOSED |
| T-17-41 | Repudiation | Tres etiquetas accesibles, una vez cada una: `338` "Un lugar menos", `352` "Cantidad de lugares", `370` "Un lugar más"; targets `h-11 w-11` ×2 + `h-11 w-14` ×1. UAT R4-2 lo confirmó con el dedo | CLOSED |
| T-17-42 | Tampering | Control fuera del contenedor de texto (`2321` hermano de `2304-2318`), 32px de exclusión (`py-6` + `space-y-2`); línea de datos 0/0/0/0; `basis-full` = 0. UAT R4-1 = pass | CLOSED |
| T-17-43 | Elevation of Privilege | `min-h-11` = **7**, `h-11 w-11` = **2**, `tabIndex`/`role="button"` = **0/0**, `onClick=` = **63**: ni se achicaron los targets ni el label se volvió control | CLOSED |
| T-17-44 | Tampering | Cuerpo de la función sin cambios (diff vacío); acotado con `sed`: payload 1 clave, `.eq('business_id', …)` presente | CLOSED |
| T-17-SC (17-06…17-10) | Tampering (supply chain) | `package.json` / `package-lock.json` fuera del diff de la fase. Cero instalaciones | CLOSED ×5 |

---

## 6. Threat Flags de los SUMMARY

- 17-01, 17-02, 17-03, 17-04, 17-05, 17-06, 17-08 declaran **"ninguno"**, y la medición del diff lo
  respalda: no hay endpoint, ni auth, ni acceso a archivos, ni esquema, ni dependencia.
- 17-07, 17-09 y **17-10 no tienen sección `## Threat Flags`** (el ejecutor la reemplazó por bloques
  de gates: "El camino de escritura no se tocó", "Gates de aceptación"). Es un hueco de **plantilla**,
  no de superficie: el diff de esos tres planes se auditó archivo por archivo y no introduce nada
  nuevo. Registrado abajo como observación, no como blocker.

### Unregistered flags (WARNING, no bloqueantes)

| # | Observación | Por qué no bloquea |
|---|---|---|
| UF-1 | **`17-UAT.md` R4-4 quedó en `result: [pending]`** mientras el bloque `## Summary` dice "ronda_4: 4 passed, 0 pending" y `pending: 0`. R4-4 es el **negativo gemelo** de G-04: mide si tocar el texto `Se ofrece en:` dispara una escritura de tenant (`setServiceLocations` sobre `services.location_ids`) por corrección del punto de toque | La adyacencia es **horizontal y preexistente** (texto ↔ pill `Todos`), sobre un camino de escritura que esta fase **no tocó** (`2329-2336`, sin diff). El plan 17-10 la declaró explícitamente fuera de alcance ("si falla, se anota, no se arregla acá"). Recomendación: correr ese paso antes del próximo release que toque `/servicios`, o registrarlo como todo del workstream |
| UF-2 | Los conteos del `## Summary` de la UAT no cierran (`passed: 21` vs 7+5+2+4 = 18 registrados) | Discrepancia de contabilidad documental. Los cuatro gaps tienen resultado `pass` firmado por el dueño y sus fixes están verificados en código acá |
| UF-3 | 17-07 / 17-09 / 17-10 sin sección `## Threat Flags` | Sus tres diffs se auditaron directamente: cero superficie nueva |

### Observación preexistente (fuera del registro, sin cambio en esta fase)

`agenda-client.tsx:345-358` sigue escribiendo `time_blocks.capacity` desde el editor de grilla — una
columna que la migración 068 **jubiló** como fuente de decisión. Esta fase cerró la **lectura** vieja
(T-17-22) pero la **escritura** legacy sigue ahí, intacta y sin diff. No es superficie nueva ni una
mitigación ausente: es deuda de la Phase 15 que conviene registrar como todo (columna muerta que el
panel todavía alimenta).

---

## 7. Lo que esta auditoría NO cubre

- **X-16-A** — `book_slot_atomic` ejecutable por `anon` (severidad alta, preexistente desde la migr.
  041). Fuera del alcance de la fase, ya registrado como todo propio en `17-CONTEXT.md`.
- **X-16-B** — el filtro por tenant del gate se esquiva moviendo `services.business_id` (media),
  preexistente.
- La flakiness de las suites de abono en `vitest run` completo: preexistente y ajena a esta fase (se
  corrió la suite específica, 20/20).

---

## 8. Veredicto

**SECURED — 54/54.** Las 44 mitigaciones declaradas están **en el código instalado**, no en la
documentación: cada una tiene archivo y línea, y las cinco que dependían de un conteo se midieron con
el conteo. Las 10 aceptaciones se sostienen sobre premisas **medidas** (una de ellas con un INSERT
cruzado real contra el Postgres local, que rebotó como la premisa prometía), no sobre argumentos
plausibles. El único camino de escritura nuevo de la fase lleva filtro explícito por tenant sobre una
RLS que se verificó activa, manda una sola clave, no puede tocar el modo y no filtra una sola palabra
de la base a la pantalla.


---

## Cierre de los flags no registrados (orquestador, 2026-08-24)

**UF-1 y UF-2 eran errores de bookkeeping MÍOS, no huecos de verificación.** El auditor tenía razón en
los dos y la causa es una sola: `17-UAT.md` había quedado con el `<uat_script>` de 17-10 **embebido y
duplicado** (59 líneas con sus propios `### 1..4`), así que los reemplazos que marcaban un test como
`pass` aterrizaban en la copia del guion en vez de en la entrada real. De ahí salieron los dos
`[pending]` fantasma (R2-2 y R4-4 — los dos verificados por el dueño en su momento) y los contadores
desalineados.

**Corregido de raíz, no parchando contadores:** se quitó el guion duplicado (queda la referencia a
`17-10-PLAN.md`), se marcaron los dos tests con su resultado real y su nota, y el `## Summary` se
**recontó desde el archivo**: **22 tests · 18 pass · 4 issues · 0 pending**, que coincide con las
cuatro rondas (10 + 5 + 3 + 4).

**UF-3** (17-07 / 17-09 / 17-10 sin sección `## Threat Flags`) queda como hueco de plantilla. No se
retrofitea: el auditor auditó esos tres diffs uno por uno y midió cero superficie nueva, así que
agregar la sección después no aportaría información que no esté ya en `17-SECURITY.md`.

### El hallazgo preexistente SÍ se registró

`agenda-client.tsx:345-358` sigue **escribiendo** `time_blocks.capacity`, la columna que la migr. 068
jubiló. Verificado. La Phase 17 cerró la **lectura** (era la que mentía); la escritura quedó a la
vista, siempre en 1, sin consumidor. Severidad baja — no rompe nada — pero es ruido de modelo del
mismo tipo que hizo que la grilla mintiera dos fases. Todo:
`2026-08-24-el-editor-de-horarios-sigue-escribiendo-time-blocks-capacity`.
