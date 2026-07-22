---
phase: 07-cancelaci-n-del-abono-mail-panel
plan: 09
subsystem: web
tags: [abonos, cancelacion, next16, after, accesibilidad, wcag, noindex, seguridad]

# Dependency graph
requires:
  - phase: 07-cancelaci-n-del-abono-mail-panel
    provides: "07-06: abonoDayLabel(dow), toISODate(d) y AbonoCancelSummary.unknown en lib/abono-cancel.ts"
  - phase: 07-cancelaci-n-del-abono-mail-panel
    provides: "07-07: esc() en las plantillas de mail + AbortSignal.timeout(10_000) en resendSend"
provides:
  - "La pantalla pública de baja informa el efecto REAL que devolvió el servidor, no el preview con el que se cargó la página (WR-01)"
  - "El flag unknown del preview se consume end-to-end: el cliente ve que no se pudo calcular en vez de confirmar a ciegas (WR-04)"
  - "Los dos mails de la vía pública salen fuera del request path con after(), mismo criterio que la vía del panel (WR-05)"
  - "onAccentText(hex) en lib/contrast.ts: color de texto legible sobre un color de marca arbitrario (IN-05)"
  - "La página pública de baja declara noindex — la URL contiene la credencial (IN-04, T-07-38)"
affects: [07-11, 07-12, secure-phase-07]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Autoridad del efecto: cuando el servidor ya ejecutó una acción, la UI informa SU respuesta; el preview server-rendered es sólo una estimación del momento de la carga"
    - "Degradación declarada: un preview que no se pudo calcular se DICE en pantalla, nunca se oculta el aviso previo de una acción irreversible"
    - "Contraste derivado: el texto sobre un color editable por el usuario se elige por luminancia WCAG, y el foco visible se ancla a tokens del design system para no depender de ese color"

key-files:
  created:
    - lib/contrast.ts
    - lib/contrast.test.ts
  modified:
    - app/api/abonos/cancel/[token]/route.ts
    - app/abono/cancelar/[token]/page.tsx
    - app/abono/cancelar/[token]/abono-cancel-client.tsx

key-decisions:
  - "Un solo after() con los dos envíos en secuencia (no dos callbacks): fuera del request path el orden ya no importa y el flujo queda más simple de leer"
  - "La lectura de getBusinessSecrets se movió ADENTRO del callback con su propio try/catch: si falla, los envíos igual se intentan con la configuración global y la baja — ya confirmada en la base — nunca se rompe"
  - "onAccentText devuelve la unión literal '#ffffff' | '#1a1714' y no un string libre: los dos candidatos son los que el proyecto ya usa sobre superficies de marca, no se inventa ningún color"
  - "El fallback de onAccentText ante entrada que no parsea es el blanco, que es el comportamiento previo de estas pantallas: el helper no puede regresionar ningún caso que hoy funciona"
  - "fmtDate del client component se CONSERVA duplicado a propósito (IN-02) y ahora con la justificación escrita: importar la capa server arrastraría el locale de date-fns al bundle de una página pública que se abre desde el mail"

requirements-completed: [ABONO-04, ABONO-05]

# Metrics
duration: 20min
completed: 2026-07-21
status: complete
---

# Phase 7 Plan 09: La superficie pública de baja deja de mentir sobre el resultado Summary

**La pantalla pública de baja del abono informa el número que devolvió el SERVIDOR (no el preview viejo), declara cuándo el preview no se pudo calcular, no se contradice en la rama ya-cancelada, no es indexable, y sus CTA son legibles y enfocables sobre cualquier color de marca; los dos mails salieron del request path.**

## Performance

- **Duration:** ~20 min
- **Started:** 2026-07-21T21:08Z
- **Completed:** 2026-07-21T21:28Z
- **Tasks:** 3
- **Files:** 5 (2 creados, 3 modificados)

## Accomplishments

- **WR-01 cerrado.** El client component guarda el resultado del `POST` en estado (`result`) y todo el bloque de detalle pasa a leer `shownCount` / `shownLastDate`, que priorizan la respuesta del servidor sobre el preview server-rendered. La rama `already_cancelled` fuerza `{ count: 0, lastDate: null }`: la pantalla ya no puede decir "Este turno fijo ya fue dado de baja" arriba y "Se cancelan N turnos futuros" abajo al mismo tiempo (D-08). Es el mismo invariante que ya respetaba la vía del panel.
- **WR-04 cerrado end-to-end.** El `unknown: true` que publicó el Plan 07-06 se propaga por `page.tsx` (`previewUnknown`) hasta la pantalla, que muestra el texto exacto *"No pudimos calcular cuántos turnos se van a cancelar. Se dan de baja TODOS los turnos futuros de esta serie."* en lugar de omitir el aviso previo de una acción irreversible. El bloque contempla los tres casos: desconocido, conocido > 0, y cero.
- **WR-05 cerrado (mitad ruta).** Los dos envíos a Resend de `POST /api/abonos/cancel/[token]` pasaron a un único `after()` de `next/server`, con todo lo que el closure necesita capturado antes en consts y `getBusinessSecrets` adentro — el molde exacto de `app/api/abonos/cancel/route.ts`. El comentario que afirmaba que "en serverless el fetch a Resend se corta al hacer return si no se espera" se reescribió: era falso en Next 16 sobre Vercel y contradecía a la otra vía. Las dos vías ahora justifican lo mismo.
- **IN-01 cerrado en las dos superficies públicas.** Desaparecieron las copias locales de `DAY_LABELS` de la ruta y de la página; ambas usan `abonoDayLabel(dow)` con el fallback único `'los días'`. El mail de la MISMA baja ya no puede decir cosas distintas según quién la ejecute.
- **IN-02 documentado.** `fmtDate` con sus arrays `DAYS`/`MONTHS` se conserva, ahora con la justificación escrita en la cabecera del archivo.
- **IN-04 cerrado.** `metadata` declara `robots: { index: false, follow: false }`, con el motivo en el comentario: el `cancel_token` viaja en la URL y no rota ni vence (D-09), así que una indexación sería una fuga permanente.
- **IN-05 cerrado.** `lib/contrast.ts` elige entre blanco y el near-black `#1a1714` por luminancia relativa WCAG; los tres CTA y el avatar de fallback toman ese color por `style`, y los tres CTA suman foco visible con tokens del design system (`ring-ring` sobre `ring-offset-background`), que NO depende del acento.
- **Suite completa verde: 707 passed / 1 skipped, 54 archivos** con `--no-file-parallelism`. `npm run build` en 0. `tsc --noEmit` en 0. `eslint` en 0 sobre los 5 archivos.

## Task Commits

1. **Task 1 — WR-05 + IN-01 en el route handler público** — `8c8cc02` (refactor)
2. **Task 2 — IN-04 + IN-05 + WR-04/IN-01 en la page server + helper de contraste con test** — `681730f` (feat)
3. **Task 3 — WR-01 + WR-04 + IN-05 + IN-02 en el client component** — `10a08d8` (fix)

## Files Created/Modified

- `lib/contrast.ts` **(nuevo)** — `onAccentText(hex)`: parseo de hex de 3 y 6 dígitos con o sin `#`, luminancia relativa WCAG (linearización sRGB + coeficientes 0.2126/0.7152/0.0722), ratio `(Lclaro+0.05)/(Loscuro+0.05)` contra los dos candidatos y devolución del de mayor contraste. Comentario con el porqué y con la limitación honesta de los acentos de luminancia intermedia.
- `lib/contrast.test.ts` **(nuevo)** — 6 casos: fondos oscuros → blanco, el naranja por defecto `#d94a2b` → blanco (los dos candidatos quedan a ~4.2:1 y gana el blanco, que además era el comportamiento previo), fondos claros → near-black, forma corta == forma larga, hex sin numeral y con espacios, y entrada basura (`''`, `'rojo'`, `'#zzz'`, `'#12345'`, `undefined`) → blanco sin tirar.
- `app/api/abonos/cancel/[token]/route.ts` — import de `after`, borrado de `DAY_LABELS`, `dayLabel` desde `abonoDayLabel`, captura de los datos del mail en consts y los dos envíos + la lectura de secretos dentro de un único `after()`. El contrato de respuesta NO cambió: `{ ok:true, cancelledCount, lastDate }`, `already_cancelled`, `not_found` 404, `error` 500.
- `app/abono/cancelar/[token]/page.tsx` — `robots` noindex en la metadata, `abonoDayLabel`, `preview` tipado como `AbonoCancelSummary` (necesario para leer `unknown` en la rama ya-cancelada), const `previewUnknown`, const `accent` calculada una sola vez y prop nueva `accentText={onAccentText(accent)}`.
- `app/abono/cancelar/[token]/abono-cancel-client.tsx` — estado `result`, consts `shownCount`/`shownLastDate`, props `previewUnknown` y `accentText`, bloque de detalle con los tres casos, color de texto por `style` en los 4 lugares que tenían blanco fijo, foco visible en los 3 CTA y cabecera con la justificación de la duplicación de `fmtDate`.

## Decisions Made

- **Un solo `after()`, no dos.** Fuera del request path el orden de los dos mails ya no importa; un único callback deja el flujo más simple de leer y evita duplicar la lectura de secretos.
- **`getBusinessSecrets` adentro del callback, con try/catch propio.** Antes se leía con `await` en el handler. Al mover el bloque a `after()` una excepción ahí dentro sería un rechazo no manejado, así que se envuelve: si falla, se loguea PII-free y los dos envíos se intentan igual con la configuración global.
- **`preview` tipado explícitamente como `AbonoCancelSummary`.** La rama ya-cancelada sigue siendo el literal `{ count: 0, lastDate: null }` que pedía el plan, pero sin la anotación el tipo de la unión no tiene la propiedad `unknown` y `tsc` rechaza leerla. La anotación es la forma mínima de conservar el literal.
- **`previewUnknown` se deriva en una const antes del `return`, no inline en el JSX.** El comentario que explica el porqué (WR-04) queda en código y no en la lista de atributos.

## Deviations from Plan

### Ajustes de verificación

**1. [Rule 3 - Blocking] `npx tsc` está prohibido en este árbol: resuelve un paquete `tsc` del registro que siempre sale 0**

- **Found during:** Task 1
- **Issue:** los bloques `<automated>` del plan usan `npx tsc --noEmit`, `npx eslint` y `npx vitest`. `npx tsc` resuelve un paquete homónimo del registro que produce un FALSO VERDE (ya ocurrió una vez en esta fase, según el contexto de ejecución).
- **Fix:** todas las verificaciones se corrieron con los binarios locales: `./node_modules/.bin/tsc --noEmit`, `./node_modules/.bin/eslint`, `./node_modules/.bin/vitest run`.
- **Verification:** `tsc --noEmit` detectó de verdad el error transitorio de props entre Task 2 y Task 3 (ver deviación 2), lo que prueba que estaba compilando el proyecto real.
- **Committed in:** n/a (no hay archivos versionados involucrados)

**2. [Rule 3 - Orden del plan] `tsc --noEmit` no puede salir 0 al cerrar Task 2: las props nuevas las declara Task 3**

- **Found during:** Task 2
- **Issue:** el criterio de aceptación de Task 2 pide `tsc --noEmit` en 0, pero esa tarea AGREGA `previewUnknown` y `accentText` al call site de `AbonoCancelClient`, cuya interfaz `Props` recién se amplía en Task 3. El único error de la corrida fue exactamente ese: `Property 'previewUnknown' does not exist on type 'IntrinsicAttributes & Props'`.
- **Fix:** se verificó el invariante que el criterio protege (cero errores AJENOS a la transición) en vez de su letra, y `tsc --noEmit` quedó en 0 al cerrar Task 3, junto con `npm run build`. No se alteró el reparto de archivos entre tareas para no romper la atomicidad de los commits.
- **Verification:** salida de `tsc` en Task 2 = 1 error, el de la prop; salida en Task 3 = 0 errores; `npm run build` = 0.
- **Committed in:** `681730f` (Task 2) y `10a08d8` (Task 3)

**3. [Rule 2 - Precisión] Comentarios redactados para no contaminar los greps de aceptación**

- **Found during:** Task 1
- **Issue:** el criterio pide `grep -cE "\bafter\(" = 1` y `grep -cE "\babonoDayLabel\s*\(" = 1`. Escribir "con `after()`" o "usa `abonoDayLabel()`" en la prosa habría hecho que los criterios contaran comentarios además de código.
- **Fix:** los comentarios nombran las funciones SIN paréntesis (`` `after` de next/server ``, "el motor compartido"). Los greps miden código real.
- **Verification:** los 8 criterios de Task 1 y los 8 de Task 2 y Task 3 dieron exactamente los valores esperados.
- **Committed in:** `8c8cc02`

---

**Total deviations:** 3 (2 de entorno/orden de verificación, 1 de precisión). Ninguna cambia el alcance ni el comportamiento pedido.

## Prohibiciones verificadas

- **D-10 respetado.** `git diff --name-only 8c8cc02~1..HEAD` devuelve exactamente los 5 archivos declarados. Ni `app/cancelar/[token]/` ni `app/api/cancel/[token]/route.ts` aparecen.
- **Sin superficie visual nueva.** Los cambios son de estado, copy y color de texto sobre los componentes que ya existían. Las únicas clases nuevas son las de foco (`focus-visible:ring-*`), tokens del design system; padding, radio, tipografía y transiciones quedaron intactos.
- **Sin regla de 24 h ni estado `past`.** No se agregó ninguna rama de tiempo.
- **El `cancel_token` no se rota ni se invalida.** Ninguna rama lo escribe; el link sigue dejando de operar por ESTADO.
- **El criterio de quién recibe qué mail no cambió.** Cliente si tiene email; dueño si tiene `notification_email`. Sólo cambió CUÁNDO se despachan.
- **El aislamiento por tenant no se tocó.** `.eq('cancel_token', token)` sigue en la ruta y en la página; el `businessId` sigue saliendo de la fila resuelta, nunca de la request; `cancelAbonoSeries` sigue siendo el único ejecutor de la baja.
- **Cero dependencias nuevas (T-07-SC).** `package.json` y `package-lock.json` intactos: el helper de contraste son ~50 líneas sin librería.
- **Ningún archivo borrado:** `git diff --diff-filter=D --name-only 8c8cc02~1..HEAD` sin resultados.
- `07-01..07-05-PLAN.md` no se tocaron.

## Threat Flags

Ninguna superficie de seguridad nueva. Las amenazas del registro del plan quedan así:

| Threat | Estado |
|---|---|
| T-07-38 (indexación de la URL con el token) | mitigada: `robots: { index: false, follow: false }` |
| T-07-39 (la pantalla informa un efecto distinto del real) | mitigada: el número sale de la respuesta del servidor; `already_cancelled` fuerza 0 |
| T-07-40 (consentimiento sin el aviso previo) | mitigada: el flag `unknown` se declara con copy explícito |
| T-07-41 (dos POST a Resend en el request path) | mitigada: los dos envíos en `after()` + el timeout duro del Plan 07-07 |
| T-07-42 (el `cancel_token` como credencial) | sin cambios de alcance; los dos filtros verificados por criterio |
| T-07-43 (el `unknown` como canal de inferencia) | accept, sin cambios |

## Deuda anotada

- **La ruta hermana `/cancelar/[token]` tiene el MISMO hueco de `noindex`** (su `metadata` no declara `robots` y su URL también contiene un `cancel_token`). NO se tocó por D-10: está viva en producción para el cancel de turno suelto y esta fase no la modifica. Queda como candidata a un fix propio, fuera de esta fase.
- **Hallazgo de diseño preexistente, no corregido:** el hook de diseño marca `side-tab` en el bloque de detalle (`border-l-4` con el acento). Es código previo a este plan, la pantalla es copia declarada del analog vivo `app/cancelar/[token]/cancel-client.tsx`, y el plan prohíbe agregar o cambiar superficie visual — cambiarlo haría divergir las dos pantallas. No se aplicó supresión inline.
- **El fallback de `onAccentText` sobre acentos de luminancia intermedia** no alcanza 4.5:1 con ninguno de los dos candidatos. La mitigación es el foco visible independiente del acento; una solución completa exigiría validar `primary_color` en el panel del dueño, que es otra superficie.

## Issues Encountered

- Ningún test falló, ni por este plan ni preexistente: 707 passed / 1 skipped / 0 failed con `--no-file-parallelism`.
- Los helpers `state.record-metric` / `state.add-decision` de gsd-tools sólo aceptan flags con nombre (`--phase`, `--plan`, `--summary`, …); los argumentos posicionales que sugiere el workflow devuelven `error: ... required`. Se usaron los flags con nombre.

## User Setup Required

None — sin configuración externa, sin migración y sin variable de entorno nueva.

## Next Phase Readiness

- **07-11** puede reemplazar las copias restantes de `DAY_LABELS` (`app/api/abonos/cancel/route.ts`, `app/api/abonos/create/route.ts`) y las de `toISODate`. Las dos copias de la superficie pública ya no existen.
- **07-12** puede testear el contrato del handler público sabiendo que su forma de respuesta NO cambió y que los mails ya no bloquean la respuesta.
- **secure-phase** puede cerrar T-07-38..T-07-41 con código verificable en los 3 archivos.
- Sin bloqueantes.

## Self-Check: PASSED

- Archivos verificados en disco: `lib/contrast.ts`, `lib/contrast.test.ts`, `app/api/abonos/cancel/[token]/route.ts`, `app/abono/cancelar/[token]/page.tsx`, `app/abono/cancelar/[token]/abono-cancel-client.tsx` — los 5 presentes.
- Commits verificados en `git log`: `8c8cc02`, `681730f`, `10a08d8` — los 3 presentes.
- `git diff --diff-filter=D --name-only 8c8cc02~1..HEAD` sin resultados: ningún archivo borrado.
- `node_modules`, `package.json` y `package-lock.json` intactos.

---
*Phase: 07-cancelaci-n-del-abono-mail-panel*
*Completed: 2026-07-21*
