---
quick_id: 260902-njf
phase: quick-260902-njf
plan: 01
subsystem: booking-publico
workstream: motor-reservas
status: complete
tags: [a11y, wcag, ux, cls, touch-targets, booking, public-surface]
requirements: ["P1-A", "P1-B", "P2-A", "P2-B", "P2-C", "P3"]
dependency_graph:
  requires:
    - "components/ui/{input,textarea,label}.tsx (sin modificar — sólo se consume su vocabulario visual)"
    - "components/dashboard/plan-modal.tsx (molde de EMAIL_RE + validación onBlur)"
    - "app/(dashboard)/settings/settings-client.tsx (molde de useId/helpId y de h-11 w-11 sm:h-8 sm:w-8)"
    - "app/(dashboard)/web/_sections/section-forms.tsx (molde de min-h-11 y del <p> de error con text-destructive)"
  provides:
    - "Paso 4 del booking con labels asociados y validación inline de teléfono/email"
    - "Decisión medida y documentada en el código sobre el piso táctil de la grilla del calendario"
  affects:
    - "app/[slug] (superficie pública de reservas)"
tech_stack:
  added: []
  patterns:
    - "useId() + fieldId(k) para ids por instancia (seguro en embed/iframe)"
    - "validación de formato onBlur no bloqueante, que se limpia a la primera tecla"
key_files:
  created: []
  modified:
    - "app/[slug]/booking-client.tsx"
decisions:
  - "Los días del calendario se quedan en ~40px: 7x44=308px no entra en los ~301px útiles a 375px"
  - "Las <img> siguen siendo <img> (no next/image): photo_url es URL externa arbitraria"
  - "El gate del submit mira los errores de formato para que un email con typo no se confirme en silencio"
  - "Piso de dígitos (>=8 tras quitar no-numéricos) en vez de regex de formato para el teléfono"
metrics:
  tasks: 3
  commits: 3
  files_changed: 1
  lines_before: 918
  lines_after: 1004
  completed: 2026-09-02
---

# Quick Task 260902-njf: Cerrar los hallazgos del audit del booking público — Summary

Se cerraron los seis hallazgos del audit de Impeccable sobre `app/[slug]/booking-client.tsx` (accesibilidad del formulario, piso táctil, marcado de obligatorios, validación inline, CLS de imágenes y escala tipográfica/foco) sin tocar una sola línea de lógica de negocio ni ningún otro archivo del repo.

## Qué se hizo

| Task | Hallazgo | Commit |
|------|----------|--------|
| 1 | P1-A (labels sin asociar), P2-A (asteriscos), P2-B (sin validación inline) | `4c94177` |
| 2 | P1-B (piso táctil), P2-C (`<img>` sin dimensiones) | `d0e1a8b` |
| 3 | P3 (escala tipográfica + vocabulario de foco) | `c8e3116` |

### Task 1 — Formulario del paso "Tus datos"
- `useId()` + `fieldId(k)` a nivel de componente; los 4 `<Label>` llevan `htmlFor` y los 4 controles su `id`. Ids **por instancia** a propósito: la página se puede embeber en un iframe (`lib/embed-bridge`) y dos instancias con ids literales harían que `htmlFor` resuelva al control equivocado (mismo defecto que WR-03 en `settings-client.tsx`).
- Se sacó el asterisco de los tres obligatorios. El único marcador visible de la pantalla es el `(opcional)` de Notas; la obligatoriedad viaja por `aria-required="true"`. Se usó `aria-required` y **no** el `required` de HTML: no hay `<form>` en esta pantalla (los botones son `onClick`), así que `required` no validaría nada pero sí activaría el pseudo-selector `:invalid` del navegador.
- `autoComplete` (`name` / `tel` / `email`) e `inputMode` (`tel` / `email`) en los tres campos.
- Validación **onBlur** en teléfono y email, con `aria-invalid`, `aria-describedby` condicional y un `<p role="alert" className="text-xs text-destructive">` debajo. `role="alert"` porque el error nace al *salir* del campo: el foco ya se fue y sin live region el `aria-describedby` no se locuta hasta volver a entrar. Se usa el token `text-destructive` y no un color literal (esta pantalla se pinta con 26 paletas).
- El error se limpia en el `onChange`, a la primera tecla. Un campo **vacío** no produce error: la falta la sigue comunicando el botón deshabilitado, igual que antes.
- `EMAIL_RE` es **byte-idéntica** a la de `components/dashboard/plan-modal.tsx:21`: `/^[^\s@]+@[^\s@]+\.[^\s@]+$/`.
- Teléfono: `phoneDigits(v)` quita todo lo que no sea dígito y exige **≥ 8**. Es un piso de cantidad, no un formato — pasan `+54`, paréntesis, espacios y guiones.

### Task 2 — Táctil e imágenes
- Las dos flechas de mes pasaron de `w-8 h-8` a `h-11 w-11 sm:h-8 sm:w-8` (molde del `CapacityStepper` en `settings-client.tsx`): 44px en mobile, 32px en desktop.
- El slot de horario suma `min-h-11` y `justify-center` (con `min-h` y `flex-col` el contenido quedaba pegado arriba).
- Foto del profesional: `width={40} height={40} loading="lazy" decoding="async"`.
- Logo del hero: `width={56} height={56}`, **sin** `loading="lazy"` — está arriba del fold y es parte del LCP.

### Task 3 — Tipografía y foco
- Los 5 tamaños arbitrarios (`text-[10px]` / `text-[11px]`) pasaron a `text-xs`. **Quedaron 0** tamaños arbitrarios fuera de comentarios (ver más abajo la nota sobre el nombre del consultorio).
- Anillo de foco en los 11 botones propios, con el mismo vocabulario que los `Input`/`Textarea` de la misma pantalla: 10 con `focus-visible:ring-3 focus-visible:ring-ring/50` y la celda de día con `ring-2` (la grilla deja 4px entre celdas y un anillo de 3px se monta encima del día vecino). "Cambiar" y "Volver" suman `rounded-sm` para que el anillo tenga radio.

## Para el próximo que toque esta pantalla

### 1. La cuenta del calendario (por qué los días NO llegan a 44px)
A 375px de viewport:
- contenedor (`max-w-lg` centrado, con `px-6`) → **327px**
- tarjeta del calendario: `p-3` (24px) + 1px de borde por lado → **~301px útiles**
- grilla de 7 columnas con `gap-1`: 6 huecos × 4px = 24px → 277 / 7 = **~39,6px por día**
- **7 × 44 = 308px > 301px**: 44px no entra **ni con `gap-0`**

Alternativas medidas y descartadas: `px-6` → `px-4` sólo en mobile llega a ~41,9px (y cambia el margen de toda la página); `p-3` → `p-2` + `gap-0.5` llega a ~44,7px pero aprieta la grilla y desalinea la tarjeta respecto de sus hermanas; ensanchar con margen negativo da ~41,9px y rompe la alineación de la columna.

Se acepta ~40px: sigue muy por encima del mínimo exigible de **WCAG 2.5.8 (24×24 px CSS, nivel AA)**; los 44px son la guía de HIG que el proyecto adopta y forzarla en una grilla de 7 columnas costaría scroll horizontal o un calendario apretado. **La cuenta completa está escrita en el archivo**, arriba de la grilla de días, con la prohibición explícita de tocar `px-6`, el `p-3`, el `gap-1` o el `aspect-square` sin rehacerla.

### 2. Por qué el gate del submit ahora mira los errores
`disabled={!clientName || !clientPhone || !clientEmail || !!phoneError || !!emailError || submitting}`.

Antes, un email con typo pasaba derecho: el turno se creaba, el cliente nunca recibía la confirmación y el negocio no tenía cómo diagnosticarlo. Como los errores **sólo pueden existir después de un blur**, quien tipea los tres campos y toca confirmar sin salir de ninguno ve exactamente el comportamiento de siempre. `handleConfirm` no se abrió y las cuatro líneas del payload (`clientName`, `clientPhone: clientPhone || null`, `clientEmail: clientEmail || null`, `notes: clientNotes || null`) quedaron byte-idénticas — nada de `.trim()`, de normalizar el teléfono ni de mandar el email en minúsculas.

### 3. Por qué las `<img>` siguen siendo `<img>`
`pro.photo_url` y `business.logo_url` son URLs externas arbitrarias. Migrar a `next/image` exigiría declarar `remotePatterns` en `next.config.ts` — otro archivo, config global, fuera del alcance de una tarea de un solo archivo. Las dos dimensiones resuelven el CLS, que era exactamente el hallazgo.

### 4. Tamaños arbitrarios que quedaron: **0**
El plan dejaba una licencia para dejar el nombre del consultorio (`text-[10px]`) en su tamaño si a 375px se rompía. Se subió a `text-xs` igual, con este razonamiento medido: el slot es `grid-cols-3 gap-2` a 375px ⇒ ~103px, menos `px-3` (24px) ⇒ ~79px de texto; el nombre lleva `truncate`, así que un nombre largo se corta y **no envuelve**; y el alto del slot es `min-h-11` (44px) contra ~20px de la hora + ~16px del nombre a 12px ⇒ **no crece**. Los dos modos de falla que la licencia protegía están cubiertos por `truncate` y por `min-h-11`. **Aun así, esto se mira con los ojos en el `human-check` (punto 11), no acá.**

### 5. Válvula de escape del anillo de foco
Si en alguna paleta el anillo no se distingue, la salida es sacarle el `focus-visible:outline-none` **a ese control** (vuelve el outline del navegador). **Nunca** dejar un control sin ninguna señal de foco: eso sería una regresión de accesibilidad, peor que el hallazgo original.

## ⚠ HUMAN-CHECK: PENDIENTE — no ejecutado, no aprobado

El `human-check` de la Task 3 **no se corrió ni se auto-aprobó**. Está deliberadamente fuera del mecanismo de `checkpoint:human-verify` porque con `auto_advance: true` un checkpoint se rubber-stampea sin que nadie abra el navegador (trampa ya documentada del proyecto).

**Ningún test automatizado cubre `booking-client.tsx`.** La suite valida `lib/`. Un `npm test` verde prueba únicamente que nada de `lib/` se rompió — **no es evidencia de que el flujo de reserva siga funcionando**. La garantía real es el check humano.

Lo que falta hacer, con `npm run dev` y la página pública de un negocio de prueba:
- **A** — Completar una reserva **de verdad** de punta a punta a 375px (servicio → profesional → mes/día/horario → datos → confirmar), aterrizando en la página de confirmación. Probar "Cualquiera" si hay 2+ capaces, "Volver" desde cada paso (el auto-scroll debe seguir centrando el calendario) y el paso de consultorio + "Cambiar" si aplica.
- **B** — Tocar el **texto** de las 4 etiquetas: debe enfocarse el campo. Email sin arroba + salir → mensaje, campo en rojo, botón apagado; a la primera tecla el mensaje se va. Teléfono de 4 dígitos → error; **y después un número argentino real con característica y separadores → TIENE que pasar**. Si un número legítimo queda rechazado, la regla está mal y hay que aflojarla: bloquear una reserva válida es peor que el hallazgo original. Ninguna etiqueta con asterisco; "Notas" sigue diciendo `(opcional)`. Lector de pantalla: los 4 campos se anuncian con su nombre y el error de email se locuta.
- **C** — A 375px: flechas de mes y slots cómodos con el pulgar; los días siguen entrando en 7 columnas **sin scroll horizontal**. Con Slow 3G, ni la lista de profesionales ni el hero saltan al entrar las imágenes.
- **D** — Tab por los 4 pasos en **tema claro y oscuro** y en **al menos dos paletas**: los 11 botones deben mostrar anillo visible. Revisar el nombre del consultorio largo dentro del slot (punto 4 de arriba). La leyenda de reCAPTCHA sigue al pie con sus dos links y el borde de marca de las dos tarjetas de resumen, igual que antes.

## Deviations from Plan

**Ninguna funcional.** Dos ajustes de forma, ambos dentro de lo que el plan pedía:

1. **[Rule 3 - Bloqueante] Comentarios reubicados para no romper directivas de eslint.** Las dos notas explicativas de las `<img>` se colocaron inicialmente entre el `// eslint-disable-next-line @next/next/no-img-element` y su `<img>`, lo que anula la directiva (una `eslint-disable-next-line` sólo aplica a la línea inmediatamente siguiente). Se movieron **arriba** del disable. Detectado antes de commitear; eslint quedó en 0 bytes de salida.
2. **[Rule 1 - Bug] Comentario de `<Button>` en posición inválida.** La justificación del gate del submit se escribió primero como `//` dentro del tag de apertura del `<Button>`, donde JSX no admite comentarios de línea. Se pasó a `{/* */}` arriba del componente. Detectado antes de commitear.

Adicionalmente, y ambos **aprobados por el usuario antes de ejecutar** (los había marcado el plan-checker como ampliaciones de alcance del planner):
- **Anillos de foco en los 11 botones**: el audit los clasificaba como *no-falla* (no hay reset global de outline, así que el anillo de UA está presente). Se agregaron igual por consistencia de vocabulario con los `Input` de la misma pantalla.
- **`width`/`height` en el logo del hero**: el audit nombraba sólo la foto del profesional. Mismo defecto, mismo archivo, y es la imagen que **más** CLS produce por estar en el hero.

## Fuera de alcance — verificado, no tocado

| Ítem | Gate | Resultado |
|------|------|-----------|
| Borde izquierdo de marca | `border-l-4 border-l-primary` | 2 (intacto) |
| Atribución de reCAPTCHA | `policies.google.com/{privacy,terms}` | 1 + 1 (intacta; sólo cambió el tamaño de fuente de la leyenda) |
| Auto-scroll con doble rAF | `requestAnimationFrame` | 2 (intacto) |
| `components/ui/label.tsx`, `input.tsx`, `textarea.tsx` | `git diff` | sin diff |
| `handleConfirm` / payload del POST | 4 líneas del body | byte-idénticas |
| Cantidad de botones | `<button` | 11 (ni uno más ni uno menos) |

**No hizo falta tocar `components/ui/label.tsx`**: `Label` es `React.ComponentProps<"label">` y ya acepta `htmlFor` nativamente.

## Verificación automatizada

| Check | Baseline | Resultado |
|-------|----------|-----------|
| `./node_modules/.bin/tsc --noEmit` | limpio | **limpio** (exit 0) |
| `./node_modules/.bin/eslint app/[slug]/booking-client.tsx` | 0 bytes de salida | **0 bytes**, exit 0 (corrido tras cada task) |
| `npm test` | `84 passed (84)` · `1078 passed \| 4 expected fail \| 1 skipped (1083)` | **idéntico** |
| Scope (`git status` sobre `app/ components/ lib/ proxy.ts supabase/`) | — | sólo `booking-client.tsx` |
| Gates de grep de las 3 tasks | — | los tres pasan |

Se usó el binario local de tsc a propósito: `npx tsc` es falso verde en este repo.

## Threat Flags

Ninguna. El plan no toca queries, policies, vistas `public_*`, migraciones ni endpoints. Cero SQL, cero dependencias nuevas, cero instalaciones de paquetes. La validación nueva es **UX, no un control de seguridad**: la autoridad sigue siendo `/api/booking/create`, que no se modificó.

## Known Stubs

Ninguno.

## Self-Check: PASSED

- `app/[slug]/booking-client.tsx` — FOUND (1004 líneas, ≥ 930; contiene `fieldId`)
- `.planning/quick/260902-njf-cerrar-los-hallazgos-del-audit-del-booki/260902-njf-SUMMARY.md` — FOUND
- Commit `4c94177` — FOUND
- Commit `d0e1a8b` — FOUND
- Commit `c8e3116` — FOUND

---

## Human-check: PASADO — 2026-09-02

El usuario probó el flujo en el navegador y confirmó que **funciona**. Con eso se levanta la única
reserva real que tenía este quick task: ningún test automatizado cubre `booking-client.tsx` (la suite
valida `lib/`), así que el verde de `npm test` nunca fue evidencia de que la reserva entrara — la
garantía es esta prueba humana.

En particular queda confirmado el punto crítico: **la validación de teléfono NO rechaza un número
argentino real**. Era el riesgo más grande del plan, porque una regla demasiado estricta bloquea una
reserva legítima y eso es peor que el hallazgo que cierra. El piso de 8 dígitos tras quitar los
no-numéricos se sostiene; no hay que aflojarlo.

## Decisión de marca resuelta (fuera del código)

El `border-l-4 border-l-primary` de la tarjeta de resumen queda **como está**: es el patrón de marca
del "esto es lo que estás por hacer", repetido en booking, canchas, confirmación y cancelación. Lo
que estaba a medias era la excepción del detector, no el diseño: `.impeccable/config.json`
whitelisteaba 2 de los 4 archivos donde el patrón vive, aunque su propio motivo ya nombraba al
booking. Se agregaron `app/[slug]/booking-client.tsx` y `app/[slug]/canchas-booking-client.tsx`.

⚠ `.impeccable/` está en `.gitignore`, así que esa excepción vive **sólo en esta máquina**: en otro
clon el hook va a volver a marcar los cuatro archivos.
