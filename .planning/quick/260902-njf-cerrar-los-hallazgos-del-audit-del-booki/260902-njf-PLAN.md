---
quick_id: 260902-njf
phase: quick-260902-njf
plan: 01
type: execute
wave: 1
depends_on: []
workstream: motor-reservas
files_modified:
  - app/[slug]/booking-client.tsx
autonomous: true
requirements: ["P1-A", "P1-B", "P2-A", "P2-B", "P2-C", "P3"]

must_haves:
  truths:
    - "Los 4 campos del paso 'Tus datos' estan asociados a su etiqueta: tocar el texto de la etiqueta enfoca el campo, y un lector de pantalla anuncia cada campo con su nombre (P1-A, WCAG 1.3.1 / 3.3.2 nivel A)."
    - "Ningun label del formulario marca la obligatoriedad con un asterisco. El unico marcador visible de la pantalla es '(opcional)' en Notas; la obligatoriedad viaja por aria-required (P2-A, regla del proyecto)."
    - "Al SALIR de Telefono o de Email con un valor mal formado aparece debajo del campo un mensaje que dice que esta mal Y como arreglarlo; el campo queda marcado invalido y el mensaje se anuncia (P2-B)."
    - "El mensaje de error se borra solo en cuanto la persona vuelve a escribir en ese campo: nadie queda mirando rojo mientras corrige."
    - "Un campo vacio NO produce error: la falta se comunica con el boton deshabilitado, igual que hoy."
    - "Con un error de formato visible el boton de confirmar esta deshabilitado; sin errores el boton se comporta exactamente como hoy."
    - "Las dos flechas de mes y los botones de horario miden al menos 44px de alto en un viewport de 375px (P1-B, la parte que ENTRA)."
    - "Los dias del calendario siguen midiendo lo mismo que hoy, y la decision de NO llevarlos a 44px queda escrita en el archivo con la aritmetica que la sostiene y las alternativas descartadas con su numero (P1-B, la parte que NO entra)."
    - "El booking no tiene scroll horizontal a 375px y el calendario no perdio ninguna columna."
    - "Las dos imagenes del flujo reservan su espacio antes de cargar: el layout no salta cuando aparecen la foto del profesional ni el logo del negocio (P2-C)."
    - "Los 11 botones propios de la pantalla muestran anillo de foco al navegar con Tab, con el mismo vocabulario visual que los Input/Textarea de la misma pagina (P3)."
    - "Los 4 pasos de la reserva siguen funcionando de punta a punta: servicio, profesional, dia y horario, y el turno se confirma."
    - "Cero logica de negocio nueva ni modificada: handleConfirm, el payload del POST a /api/booking/create, el gateo de 'Cualquiera' (showAny/isAny), el calculo de disponibilidad y el flujo de pasos quedan sin un solo cambio de comportamiento."
    - "Lo declarado fuera de alcance queda intacto: el borde izquierdo de marca (2 instancias), la atribucion de reCAPTCHA con sus dos links, y el auto-scroll con doble requestAnimationFrame."
    - "Un solo archivo de codigo tocado. Cero componentes nuevos, cero dependencias nuevas, cero cambios en components/ui/."
  artifacts:
    - path: "app/[slug]/booking-client.tsx"
      provides: "Formulario del paso 4 con labels asociados por useId + validacion inline onBlur de telefono/email; piso tactil de 44px en flechas de mes y slots; decision medida y documentada sobre las celdas del calendario; dimensiones en las dos <img>; escala tipografica normalizada y anillo de foco unificado en los 11 botones custom"
      contains: "fieldId"
      min_lines: 930
  key_links:
    - from: "los 4 <Label> del paso 4"
      to: "los 4 controles (3 Input + 1 Textarea)"
      via: "htmlFor={fieldId(k)} en el label e id={fieldId(k)} en el control, con fieldId derivado de useId() — molde de settings-client.tsx (helpId) y de web/_sections/section-forms.tsx"
      pattern: "fieldId\\("
    - from: "los <p> de error de telefono y email"
      to: "su Input"
      via: "aria-describedby apunta al id del parrafo solo cuando hay error; el Input ya trae el estilo aria-invalid de shadcn"
      pattern: "aria-describedby=\\{"
    - from: "el boton de confirmar"
      to: "phoneError / emailError"
      via: "la expresion disabled suma los dos errores a las tres condiciones de campo vacio que ya existian"
      pattern: "!!phoneError \\|\\| !!emailError"
    - from: "el payload del POST a /api/booking/create"
      to: "los estados clientName / clientPhone / clientEmail / clientNotes"
      via: "las cuatro lineas del body quedan byte-identicas — la validacion nueva NO reescribe, NO normaliza y NO recorta lo que se manda"
      pattern: "clientPhone: clientPhone \\|\\| null"
---

<objective>
Cerrar los hallazgos **P1-A, P1-B, P2-A, P2-B, P2-C y P3** del audit de Impeccable sobre el booking publico
(`app/[slug]/booking-client.tsx`, 918 lineas, score 13/20): los 4 campos del formulario sin asociar a su label,
tres controles por debajo del piso tactil a 375px, el marcado de obligatorios que contradice la regla del propio
proyecto, la ausencia de validacion inline, la `<img>` sin dimensiones que produce CLS, y los 5 tamanos
tipograficos fuera de escala con el vocabulario de foco inconsistente.

Purpose: esta es **la unica pantalla del producto que toca un cliente final**, desde el celular, sin cuenta y sin
segunda oportunidad. P1-A es WCAG nivel A —el piso— sobre el formulario que decide si el turno entra o no entra.
P2-B es la diferencia entre un email con typo que se confirma en silencio (y deja al cliente sin mail y al negocio
sin manera de avisarle) y un error que se corrige en el momento. El resto es la deuda visual que hace que la
pantalla publica se sienta de menor calidad que el panel privado.

Output: un solo archivo modificado, sin logica de negocio nueva, con la decision medida del calendario escrita
adentro del codigo para que nadie la re-litigue de memoria.
</objective>

<execution_context>
@C:/Users/franc/Desktop/Forjo Studio/forjo-app/.claude/gsd-core/workflows/execute-plan.md
@C:/Users/franc/Desktop/Forjo Studio/forjo-app/.claude/gsd-core/templates/summary.md
</execution_context>

<context>
@.planning/workstreams/motor-reservas/STATE.md
@CLAUDE.md
@AGENTS.md
@.claude/CLAUDE.md
@.claude/skills/convenciones-forjo/SKILL.md

# UNICO archivo de codigo del plan. Superficie PUBLICA y VIVA en produccion.
# LEER LOS COMENTARIOS ANTES DE EDITAR: documentan decisiones caras (D-02/D-05/D-06/D-07/D-08 del
# gateo de "Cualquiera" ~:117-150, el auto-scroll con doble rAF ~:66-100, y la atribucion obligatoria
# de reCAPTCHA ~:851-857). Ninguno de esos bloques se toca en este plan: se EXTIENDE el JSX alrededor.
@app/[slug]/booking-client.tsx

# El Label del proyecto es un <label> PELADO: no asocia nada solo, hay que pasarle htmlFor.
# El Input SI trae focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 y el
# estilo aria-invalid — de ahi sale el vocabulario de foco y de error que copia este plan.
@components/ui/label.tsx
@components/ui/input.tsx
@components/ui/textarea.tsx

# MOLDE 1 — validacion inline onBlur + aria-invalid + aria-describedby + EMAIL_RE (~:21, ~:140-165).
# Es el patron ya vivo del repo: se copia tal cual, no se inventa uno nuevo.
@components/dashboard/plan-modal.tsx

# MOLDE 2 — useId() + htmlFor/id derivados + <p> de error (~:78-110 y ~:200-245), y el min-h-11 del
# ToggleField con el comentario "Touch target >= 44px" (~:255-262).
@app/(dashboard)/web/_sections/section-forms.tsx
</context>

<tasks>

<task type="auto">
  <name>Task 1: Asociar los 4 campos a su label, corregir el marcado de obligatorios y validar al salir del campo (P1-A, P2-A, P2-B)</name>
  <files>app/[slug]/booking-client.tsx</files>
  <action>
Todo el cambio vive dentro del bloque `{step === 4 && (...)}` (~:782-888), mas cuatro lineas de andamiaje arriba.

**1. Andamiaje.**
- Agregar `useId` al import de react de la linea 3. Molde: `app/(dashboard)/settings/settings-client.tsx:3`.
- A nivel de modulo, al lado de `timeToMinutes`/`minutesToTime`, declarar `EMAIL_RE` con **exactamente** la misma
  expresion que ya usa `components/dashboard/plan-modal.tsx:21`. NO escribir una mas estricta: una regex de email
  "mejor" rechaza direcciones validas y en esta pantalla eso es un turno perdido.
- A nivel de modulo tambien, una funcion `phoneDigits(v: string)` que devuelva `v.replace(/\D/g, '')`.
- Dentro del componente, arriba del `return`: `const uid = useId()` y un helper `fieldId(k: string)` que devuelva
  la interpolacion de `uid` con `k`. Molde: `helpId` en `settings-client.tsx:424`.
  **Por que `useId` y no ids literales:** esta pagina se puede embeber en un iframe (`lib/embed-bridge`), y dos
  instancias con el mismo `id` en un documento hacen que `htmlFor` resuelva al control equivocado — es el mismo
  defecto que documenta `settings-client.tsx:416-423` (WR-03) y ya se pago una vez en este repo.
- Dos estados nuevos al lado de `clientNotes`: `phoneError` y `emailError`, ambos string vacio inicial.
  **No hay estado de error para el nombre:** el nombre no tiene regla de formato, y pintar de rojo un campo vacio
  recien abandonado es ruido. La falta ya la comunica el boton deshabilitado.

**2. Los cuatro campos.** Cada uno conserva su `value`, su `placeholder` y su `<div className="space-y-1.5">`.

- **Nombre** — `<Label htmlFor={fieldId('name')}>Nombre</Label>` (sin marcador de obligatorio) e `<Input
  id={fieldId('name')} aria-required="true" autoComplete="name" ...>`.
- **Telefono** — Label `Telefono` con `htmlFor={fieldId('phone')}`. Input con `id={fieldId('phone')}`,
  `type="tel"` (ya esta), `inputMode="tel"`, `autoComplete="tel"`, `aria-required="true"`,
  `aria-invalid={!!phoneError}` y `aria-describedby` que apunte a `-err` **solo** si hay error (si no, `undefined`).
  El `onChange` conserva `setClientPhone(e.target.value)` y suma `if (phoneError) setPhoneError('')`.
  El `onBlur` valida **solo si el valor no esta vacio**: si `phoneDigits(clientPhone).length < 8`, setea el error.
- **Email** — mismo esquema con `id={fieldId('email')}`, `inputMode="email"`, `autoComplete="email"`. El `onBlur`
  valida solo si no esta vacio: si `!EMAIL_RE.test(clientEmail.trim())`, setea el error.
- **Notas** — `<Label htmlFor={fieldId('notes')}>` conservando su `<span>` con `(opcional)` **tal cual esta**, y
  `<Textarea id={fieldId('notes')} ...>` sin tocar `rows`, `resize-none` ni el placeholder.

**3. Los parrafos de error.** Debajo del Input, renderizados condicionalmente, con
`id` igual al del `aria-describedby`, `role="alert"` y `className="text-xs text-destructive"`.
- `text-destructive`, NO un color literal: `plan-modal.tsx` usa `text-red-500` y eso ignora el tema; el molde bueno
  es `section-forms.tsx:234`, que usa el token. Esta pantalla se pinta con 26 paletas.
- `role="alert"` porque el error nace **al salir** del campo: el foco ya se fue, y sin live region el
  `aria-describedby` no se locuta hasta que alguien vuelva a entrar. Dejar el por que en un comentario de una linea.

**4. Copy de los errores** (regla del proyecto: decir que salio mal + como se arregla, no solo que fallo):
- Telefono: que parece incompleto y que se escriba con caracteristica, con un ejemplo de numero argentino.
- Email: que parece faltar el arroba o lo que va despues, con un ejemplo.
Los textos son constantes del cliente. NO interpolan nada del negocio, del servicio ni de la respuesta del server.

**5. El boton de confirmar.** Su `disabled` pasa a ser, en este orden exacto:
`!clientName || !clientPhone || !clientEmail || !!phoneError || !!emailError || submitting`.
**Por que se toca el gate del submit** (y por que esto NO es logica de negocio): hoy un email con un typo pasa
derecho, el turno se crea y el cliente nunca recibe la confirmacion — falla silenciosa, imposible de diagnosticar
desde el negocio. Los errores solo pueden existir DESPUES de un blur, asi que quien tipea los tres campos y toca
confirmar sin salir de ninguno ve **exactamente** el comportamiento de hoy. `handleConfirm` no se abre.

**6. Prohibiciones duras de esta task.**
- Usar `aria-required` y **NO** el atributo `required` de HTML. No hay `<form>` en esta pantalla (los botones son
  `onClick`), asi que `required` no validaria nada, pero si activaria el pseudo-selector `:invalid` del navegador
  y podria cambiar estilos sin que nadie lo pida. `aria-required` describe sin cambiar comportamiento.
- Las cuatro lineas del body del POST (`clientName`, `clientPhone`, `clientEmail`, `notes`) quedan **byte-identicas**.
  Nada de `.trim()`, de normalizar el telefono ni de mandar el email en minusculas: eso cambiaria lo que se guarda.
- No tocar `components/ui/label.tsx`. No hace falta: `Label` es `React.ComponentProps<"label">`, ya acepta
  `htmlFor` nativamente. Si en algun momento pareciera necesario cambiarlo, **parar y decirlo en el SUMMARY** —
  ese componente lo usa toda la app.
  </action>
  <verify>
    <automated>export PATH="/c/Program Files/Git/usr/bin:/c/Program Files/nodejs:/c/Program Files/Git/cmd:$PATH"; cd "C:/Users/franc/Desktop/Forjo Studio/forjo-app" && F="app/[slug]/booking-client.tsx" && ./node_modules/.bin/tsc --noEmit && [ -z "$(./node_modules/.bin/eslint "$F" 2>&1)" ] && [ "$(grep -cF '<Label htmlFor=' "$F")" = "4" ] && [ "$(grep -cE 'fieldId\(' "$F")" -ge 9 ] && [ "$(grep -cE '<Label[^>]*>[^<]*\*' "$F")" = "0" ] && [ "$(grep -cF '(opcional)</span>' "$F")" = "1" ] && [ "$(grep -c 'aria-required="true"' "$F")" = "3" ] && [ "$(grep -cE '[^-]required=' "$F")" = "0" ] && [ "$(grep -cF 'autoComplete=' "$F")" = "3" ] && [ "$(grep -cF 'onBlur=' "$F")" = "2" ] && [ "$(grep -cF 'aria-invalid=' "$F")" = "2" ] && [ "$(grep -cF 'aria-describedby=' "$F")" = "2" ] && [ "$(grep -c 'role="alert"' "$F")" = "2" ] && [ "$(grep -cF 'text-destructive' "$F")" = "2" ] && [ "$(grep -cF 'EMAIL_RE' "$F")" -ge 2 ] && [ "$(grep -cF 'phoneDigits' "$F")" -ge 2 ] && [ "$(grep -cF '!!phoneError || !!emailError || submitting' "$F")" = "1" ] && [ "$(grep -cF 'clientName,' "$F")" = "2" ] && [ "$(grep -cF 'clientPhone: clientPhone || null,' "$F")" = "1" ] && [ "$(grep -cF 'clientEmail: clientEmail || null,' "$F")" = "1" ] && [ "$(grep -cF 'notes: clientNotes || null,' "$F")" = "1" ] && [ -z "$(git diff -- components/ui/label.tsx components/ui/input.tsx components/ui/textarea.tsx)" ] && echo GATE_OK</automated>
  </verify>
  <done>
`tsc` limpio y eslint sobre el archivo sin una sola linea de salida (ese es el baseline medido: el archivo hoy
esta limpio). Los 4 labels llevan `htmlFor` y los 4 controles su `id` derivado de `useId`. Ningun `<Label>`
contiene un marcador de obligatorio en su texto y el `(opcional)` de Notas sigue ahi, una sola vez. Hay 3
`aria-required="true"` y **cero** atributos `required` de HTML. Exactamente 2 `onBlur`, 2 `aria-invalid`,
2 `aria-describedby` y 2 `role="alert"` (telefono y email; el nombre no valida). Los dos mensajes usan el token
`text-destructive`. Las cuatro lineas del payload estan intactas y `components/ui/` no tiene diff.
  </done>
</task>

<task type="auto">
  <name>Task 2: Subir a 44px lo que entra, documentar con aritmetica lo que no, y dimensionar las dos imagenes (P1-B, P2-C)</name>
  <files>app/[slug]/booking-client.tsx</files>
  <action>
**1. Flechas de mes (~:684 y ~:694) — SI entran.** Reemplazar `w-8 h-8` por `h-11 w-11 sm:h-8 sm:w-8` en los dos
botones, conservando el resto de las clases. Es el molde exacto del repo (`settings-client.tsx:359, 397, 2680,
2683`, viene del `CapacityStepper`): 44px en mobile, 32px en desktop — sube el piso tactil sin engordar el
escritorio. El `aria-label` de cada flecha se mantiene.

**2. Slots de horario (~:757) — SI entran.** El boton hoy es `py-2 px-3` con `text-sm`: ~36px de alto. Agregar
`min-h-11` al principio de la cadena de clases y `justify-center` despues de `items-center`. `justify-center` es
obligatorio: con `min-h` y `flex flex-col` el contenido queda pegado arriba y el slot se ve descentrado. Molde de
`min-h-11`: el `ToggleField` de `web/_sections/section-forms.tsx` (lleva escrito "Touch target >= 44px").
El ancho no es problema: `grid-cols-3 gap-2` a 375px da ~103px por slot.

**3. Celdas de dia del calendario — NO entran, y esa es la decision.** No se cambia ni una clase. Se agrega, arriba
del `<div className="grid grid-cols-7 gap-1">` de los dias (~:705), un comentario con la medicion completa:
- contenedor `max-w-lg mx-auto px-6` a 375px = **327px**
- tarjeta del calendario con `p-3` + 1px de borde por lado = **~301px utiles**
- `grid-cols-7 gap-1` (6 huecos x 4px = 24px) => 277px / 7 = **~39,6px por dia**
- 7 x 44 = **308px > 301px** => 44px **no entra ni con `gap-0`**
- alternativas medidas y descartadas, con su numero: `px-6` -> `px-4` solo en mobile llega a ~41,9px y ademas
  cambia el margen de **toda la pagina**, no solo del calendario; sumarle `p-2` en la tarjeta y `gap-0.5` llega a
  ~44,7px pero aprieta la grilla y desalinea la tarjeta respecto de sus hermanas; ensanchar la tarjeta con margen
  negativo tampoco alcanza (~41,9px) y rompe la alineacion de la columna
- **lo que se acepta y por que:** ~40px. Sigue muy por encima del minimo exigible de WCAG 2.5.8 (24x24 px CSS,
  nivel AA); los 44px son la guia de HIG que el proyecto adopta, y en una grilla densa de 7 columnas forzarla
  costaria scroll horizontal o un calendario apretado — los dos peores que el problema. Los otros dos controles
  del hallazgo SI suben a 44.
- cerrar el comentario con la prohibicion explicita: **no tocar** `max-w-lg mx-auto px-6`, el `p-3` de la tarjeta,
  el `gap-1` ni el `aspect-square` sin rehacer esta cuenta.

**4. `<img>` del profesional (~:602) — P2-C.** Agregar `width={40} height={40} loading="lazy" decoding="async"`.
Los 40 salen de `w-10 h-10`. **Se queda como `<img>` con su `eslint-disable`:** `pro.photo_url` es una URL externa
arbitraria y migrar a `next/image` exigiria declarar `remotePatterns` en `next.config.ts` — otro archivo, un cambio
de configuracion que afecta a toda la app, y fuera del alcance de una tarea de un solo archivo. Las dos
dimensiones resuelven el CLS, que es exactamente el hallazgo.

**5. `<img>` del logo del hero (~:479).** Agregar `width={56} height={56}` (de `w-14 h-14`). **Sin
`loading="lazy"`**: esta arriba del fold y es de lo primero que se pinta; diferirla empeoraria el LCP.
Va aunque el audit nombro solo la foto del profesional: mismo defecto, mismo archivo, dos atributos, y es la
imagen que **mas** CLS produce porque esta en el hero. Queda registrado en el SUMMARY como agregado deliberado.

**6. Prohibiciones duras de esta task.** No tocar el layout del contenedor, el padding de la tarjeta del
calendario, los gaps de ninguna grilla, `aspect-square`, ni el `scroll-mt-4` de los anchors del auto-scroll.
  </action>
  <verify>
    <automated>export PATH="/c/Program Files/Git/usr/bin:/c/Program Files/nodejs:/c/Program Files/Git/cmd:$PATH"; cd "C:/Users/franc/Desktop/Forjo Studio/forjo-app" && F="app/[slug]/booking-client.tsx" && ./node_modules/.bin/tsc --noEmit && [ -z "$(./node_modules/.bin/eslint "$F" 2>&1)" ] && [ "$(grep -cF 'h-11 w-11 sm:h-8 sm:w-8' "$F")" = "2" ] && [ "$(grep -cF 'w-8 h-8' "$F")" = "0" ] && [ "$(grep -cF 'min-h-11' "$F")" = "1" ] && [ "$(grep -cF 'flex flex-col items-center justify-center leading-tight' "$F")" = "1" ] && [ "$(grep -cF 'width={40} height={40}' "$F")" = "1" ] && [ "$(grep -cF 'width={56} height={56}' "$F")" = "1" ] && [ "$(grep -c 'loading="lazy"' "$F")" = "1" ] && [ "$(grep -cF 'max-w-lg mx-auto px-6' "$F")" = "2" ] && [ "$(grep -cF 'grid-cols-7 gap-1' "$F")" = "2" ] && [ "$(grep -cF 'bg-card p-3 scroll-mt-4' "$F")" = "1" ] && [ "$(grep -cF 'aspect-square rounded-md text-sm font-medium' "$F")" = "1" ] && [ "$(grep -cF 'grid grid-cols-3 sm:grid-cols-4 gap-2' "$F")" = "1" ] && [ "$(grep -cE '39[,.]6|~40px' "$F")" -ge 1 ] && echo GATE_OK</automated>
  </verify>
  <done>
Las dos flechas de mes llevan el molde `h-11 w-11 sm:h-8 sm:w-8` y no queda ningun `w-8 h-8` en el archivo. El
slot de horario tiene `min-h-11` y quedo centrado en los dos ejes. Las clases del contenedor, del padding de la
tarjeta del calendario, de las dos grillas de 7 columnas, del `aspect-square` y de la grilla de slots estan
**sin diff**. El comentario de la medicion existe y nombra el ancho resultante. Las dos `<img>` llevan sus
dimensiones y solo la del profesional lleva `loading="lazy"`.
  </done>
</task>

<task type="auto">
  <name>Task 3: Normalizar los 5 tamanos fuera de escala, unificar el anillo de foco de los 11 botones custom y verificar el flujo completo (P3)</name>
  <files>app/[slug]/booking-client.tsx</files>
  <action>
**1. Escala tipografica.** Los 5 tamanos arbitrarios pasan a `text-xs` (12px, el escalon de Tailwind inmediatamente
superior). Conservar TODAS las demas clases de cada uno (uppercase, tracking, truncate, leading, colores):
- el contador "Paso N de 4" del progreso (~:503)
- la duracion en minutos de la tarjeta de servicio (~:539)
- los encabezados de dia de la semana del calendario (~:702)
- el nombre del consultorio dentro del slot de horario (~:762)
- la leyenda de reCAPTCHA (~:859) — **solo el tamano**; el texto y los dos links no se tocan

**Excepcion con evidencia, para UNO solo de los cinco:** el nombre del consultorio vive dentro de un slot de
~103px con `truncate`. Si al mirarlo a 375px con un nombre de consultorio largo la linea queda ilegible o el slot
crece de alto, ese unico caso **se deja en su tamano actual** con un comentario de una linea que diga el ancho
medido y el nombre con el que se probo. Los otros cuatro no tienen esa licencia: son textos de linea completa o de
dos caracteres, con lugar de sobra.

**2. Anillo de foco en los 11 `<button>` propios.** Hoy dependen del outline por defecto del navegador. Eso **no es
una falla** —se verifico que no hay reset global de outline—, es vocabulario inconsistente: los `Input` y el
`Textarea` de esta misma pantalla traen `focus-visible:border-ring focus-visible:ring-3
focus-visible:ring-ring/50`. Se unifica sobre ese vocabulario:
- **10 botones** (tarjeta de servicio, tarjeta "Cualquiera", tarjeta sentinel, tarjeta de profesional, tarjeta de
  consultorio, las dos flechas de mes, "Cambiar", el slot de horario, "Volver"): agregar
  `focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50`
- **la celda de dia del calendario**: `focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50`.
  Un anillo de 3px invade al vecino: la grilla tiene `gap-1`, o sea 4px. Dejarlo escrito en un comentario corto.
- **"Cambiar" y "Volver"** son botones de texto sin fondo ni borde: sumarles ademas `rounded-sm` para que el anillo
  tenga radio. Es invisible cuando no hay foco (no tienen fondo ni borde que redondear).
- El token existe en las 26 paletas (`app/themes.css`, 30 declaraciones de la variable de anillo) y los `Input` de
  esta misma pagina ya lo usan: no se esta apostando a un token que pueda faltar.
- **Valvula de escape:** si en alguna paleta el anillo no se ve, la salida es sacar el `focus-visible:outline-none`
  de ese control (vuelve el outline del navegador). **Nunca** dejar un control sin ninguna senal de foco: eso seria
  una regresion de accesibilidad, peor que el hallazgo original.

**3. Fuera de alcance, verificado por gate y no por buena voluntad:** el borde izquierdo de marca sigue en sus 2
instancias, la atribucion de reCAPTCHA conserva sus dos links, y el auto-scroll conserva su doble
`requestAnimationFrame`. Ninguno de los tres se toca.

**4. Dejar en el SUMMARY** el numero final de tamanos arbitrarios que quedaron (0 o 1) y, si quedo 1, la medicion
que lo justifica.
  </action>
  <verify>
    <automated>export PATH="/c/Program Files/Git/usr/bin:/c/Program Files/nodejs:/c/Program Files/Git/cmd:$PATH"; cd "C:/Users/franc/Desktop/Forjo Studio/forjo-app" && F="app/[slug]/booking-client.tsx" && ./node_modules/.bin/tsc --noEmit && [ -z "$(./node_modules/.bin/eslint "$F" 2>&1)" ] && [ "$(grep -vE '^[[:space:]]*(//|\*|/\*)' "$F" | grep -cE 'text-\[1[01]px\]')" -le 1 ] && [ "$(grep -cF 'text-xs' "$F")" -ge 17 ] && [ "$(grep -cF 'focus-visible:outline-none' "$F")" = "11" ] && [ "$(grep -cF 'focus-visible:ring-3 focus-visible:ring-ring/50' "$F")" = "10" ] && [ "$(grep -cF 'focus-visible:ring-2 focus-visible:ring-ring/50' "$F")" = "1" ] && [ "$(grep -cF 'rounded-sm' "$F")" = "2" ] && [ "$(grep -c '<button' "$F")" = "11" ] && [ "$(grep -cF 'border-l-4 border-l-primary' "$F")" = "2" ] && [ "$(grep -cF 'policies.google.com/privacy' "$F")" = "1" ] && [ "$(grep -cF 'policies.google.com/terms' "$F")" = "1" ] && [ "$(grep -cF 'requestAnimationFrame' "$F")" = "2" ] && [ "$(git status --porcelain | grep -vc '^?? ' )" -ge 1 ] && [ -z "$(git status --porcelain -- app components lib proxy.ts supabase | grep -v 'booking-client.tsx')" ] && npm test 2>&1 | grep -qE 'Tests +1078 passed \| 4 expected fail \| 1 skipped \(1083\)' && echo GATE_OK</automated>
    <human-check>
**NO es automatizable y NO es un `checkpoint:human-verify`.** Va como `human-check` a proposito: con
`auto_advance: true` un checkpoint se auto-aprueba sin que nadie abra el navegador (trampa ya documentada del
proyecto). El ejecutor **no lo corre ni lo aprueba**: lo deja registrado como **PENDIENTE** en el SUMMARY.

Levantar `npm run dev` y abrir la pagina publica de un negocio de prueba (`/{slug}`).

**A — El flujo de reserva sigue entero (esto es lo que no se puede romper).** A 375px:
1. Paso 1: elegir un servicio. Paso 2: elegir un profesional (y si el negocio tiene 2+ capaces, probar tambien la
   tarjeta "Cualquiera"). Paso 3: navegar de mes con las dos flechas, elegir un dia, elegir un horario, Continuar.
   Paso 4: completar los tres datos y **confirmar de verdad**. Tiene que aterrizar en la pagina de confirmacion.
2. Volver atras con "Volver" desde cada paso: el auto-scroll sigue llevando al inicio del paso y, en el paso de
   dia y hora, sigue centrando el calendario.
3. Si el negocio tiene 2+ consultorios con horarios, pasar tambien por el paso de consultorio y por "Cambiar".

**B — Formulario (P1-A, P2-A, P2-B).**
4. **Tocar el TEXTO de cada una de las 4 etiquetas**: tiene que enfocarse el campo de abajo. Es la prueba directa
   de la asociacion.
5. Escribir un email sin arroba y salir del campo: aparece el mensaje debajo, el campo se marca en rojo, y el
   boton de confirmar queda apagado. Empezar a corregir: el mensaje desaparece a la primera tecla.
6. Lo mismo con un telefono de 4 digitos. **Y despues probar un numero argentino real con caracteristica y
   separadores** (por ejemplo con espacios y guion): **tiene que pasar**. Si un numero legitimo queda rechazado,
   la regla esta mal y hay que aflojarla: bloquear una reserva valida es peor que el hallazgo original.
7. Confirmar que ninguna etiqueta muestra asterisco y que "Notas" sigue diciendo que es opcional.
8. Con lector de pantalla (Windows: NVDA o el Narrador; Mac: VoiceOver con Cmd+F5): tabular por los 4 campos.
   Cada uno tiene que anunciarse con su nombre. Al salir de email con un valor mal formado, el mensaje se locuta.

**C — Tactil, layout e imagenes (P1-B, P2-C).**
9. A 375px: las dos flechas de mes y los botones de horario se sienten comodos con el pulgar (44px). Los dias del
   calendario siguen entrando en 7 columnas, **sin scroll horizontal en toda la pagina** y sin que la tarjeta del
   calendario se desborde. Si aparece scroll horizontal, la Task 2 toco algo que tenia prohibido.
10. Recargar el paso 2 con la red throttleada (DevTools -> Network -> Slow 3G) en un negocio con foto de
    profesional: la lista **no** puede saltar cuando entran las fotos. Lo mismo con el logo del hero.

**D — Tipografia y foco (P3).**
11. A 375px y en desktop, revisar que ninguno de los 5 textos que cambiaron de tamano se rompa: mirar
    especialmente el nombre del consultorio dentro del slot con un nombre largo.
12. Navegar **solo con Tab** por los 4 pasos: los 11 botones tienen que mostrar un anillo de foco claramente
    visible. Repetir en **tema claro y tema oscuro** y en al menos **dos paletas distintas** (el selector de
    paleta del negocio). Si en alguna el anillo no se distingue, aplicar la valvula de escape de la Task 3.
13. Confirmar que la leyenda de reCAPTCHA sigue visible al pie del paso 4 con sus dos links funcionando, y que el
    borde izquierdo de color de las dos tarjetas de resumen sigue igual que antes.
    </human-check>
  </verify>
  <done>
`tsc` limpio, eslint sin salida, y la suite en `1078 passed | 4 expected fail | 1 skipped (1083)` sobre 84
archivos — identica al baseline medido antes de empezar. Quedan 0 o 1 tamanos arbitrarios (fuera de comentarios),
y si quedo 1 esta justificado con medicion. Los 11 botones tienen anillo de foco (10 de 3px + la celda de dia de
2px) y solo los dos botones de texto sumaron `rounded-sm`. Sigue habiendo exactamente 11 `<button>`: no se agrego
ni se saco ninguno. El borde de marca, los dos links de reCAPTCHA y el doble `requestAnimationFrame` estan
intactos. El unico archivo con diff en `app/`, `components/`, `lib/`, `proxy.ts` y `supabase/` es
`booking-client.tsx`. El `human-check` queda registrado como **PENDIENTE**, no aprobado.
  </done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| cliente final anonimo (sin sesion) -> `/api/booking/create` | El unico cruce real de la pantalla. **No cambia en este plan**: mismo payload, mismo endpoint, misma verificacion server-side de tenant, servicio, disponibilidad y reCAPTCHA. |
| cliente final anonimo -> `/api/booking/availability` | No se toca (ni los parametros, ni el gateo de `any`, ni la lectura de `full`). |
| navegador del cliente -> `google.com/recaptcha` | El script y la generacion del token no se tocan; la atribucion obligatoria queda protegida por gate. |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-njf-01 | Tampering | La validacion nueva de telefono/email en el cliente | accept | Es **UX, no un control de seguridad**, y el plan no la presenta como otra cosa. Cualquiera puede saltearla con DevTools, igual que hoy podia mandar el formulario vacio por fetch. La autoridad sigue siendo `/api/booking/create` (valida tenant por slug, re-valida service/professional/location con `.eq('business_id')`, re-chequea disponibilidad y captura la constraint anti doble-booking). Este plan **no afloja ni una linea de server**. |
| T-njf-02 | Denial of Service (auto-infligido) | El gate de submit con `phoneError`/`emailError` | mitigate | El riesgo real del plan: una regla demasiado estricta bloquea una reserva **legitima** y el negocio pierde el turno sin enterarse. Se cierra por diseno: (a) email con la MISMA regex ya viva en `plan-modal.tsx`, que solo exige forma; (b) telefono con un piso de 8 digitos despues de sacar todo lo que no sea numero — acepta separadores, `+54`, parentesis y guiones; (c) los validadores corren **solo sobre valores no vacios**; (d) el error se limpia a la primera tecla; (e) el paso 6 del `human-check` exige probar un numero argentino real con caracteristica y separadores, y ordena aflojar la regla si queda rechazado. |
| T-njf-03 | Information Disclosure | Las dos copys de error nuevas y el `role="alert"` | accept | Son constantes escritas en el cliente. No interpolan el nombre del negocio, ni el servicio, ni el profesional, ni ningun codigo de error del server (el manejo de `data.error` de `handleConfirm` no se toca). Superficie nula. |
| T-njf-04 | Spoofing | reCAPTCHA (generacion del token + atribucion) | mitigate | Se cambia **unicamente el tamano de fuente** de la leyenda. El `useEffect` que inyecta el script, `grecaptcha.execute` y el envio del token quedan sin diff. Ocultar el badge sin la leyenda viola el ToS de Google y puede costar la key: el gate de la Task 3 cuenta los dos links de `policies.google.com`, asi que borrarla rompe la verificacion. |
| T-njf-05 | Elevation of Privilege | Los 11 botones con anillo de foco y los ids nuevos | accept | No se agrega, se saca ni se re-cablea ningun boton: el gate exige que sigan siendo exactamente 11. `focus-visible`, `rounded-sm`, `id`, `htmlFor`, `aria-required` y `aria-describedby` no alcanzan ninguna accion nueva. `useId` genera ids opacos, sin datos adentro. |
| T-njf-06 | Repudiation | Creacion del turno | accept | `handleConfirm`, el payload, el `cancelToken` y la navegacion a la pagina de confirmacion quedan byte-identicos. La trazabilidad del turno no cambia. |
| T-njf-07 | Tampering | Aislamiento multi-tenant | accept | El plan no toca ni una query, ni una policy, ni una vista `public_*`, ni una migracion. Cero SQL. |
| T-njf-SC | Tampering | Instalaciones de paquetes | accept | **No hay ninguna** (npm/pip/cargo): no aplica el gate de legitimidad ni el checkpoint bloqueante. El plan modifica un solo `.tsx` sin dependencias nuevas. |
</threat_model>

<verification>
1. `./node_modules/.bin/tsc --noEmit` sale 0. **Usar el binario local**: `npx tsc` es falso verde en este repo.
2. `./node_modules/.bin/eslint "app/[slug]/booking-client.tsx"` no imprime **nada** y sale 0. Ese es el baseline
   real, medido antes de arrancar (el archivo hoy esta limpio), asi que cualquier salida es un hallazgo NUEVO.
   Tarda >3 minutos incluso sobre un solo archivo: correrlo en background o con timeout >= 300s.
3. `npm test` termina en `Test Files 84 passed (84)` y
   `Tests 1078 passed | 4 expected fail | 1 skipped (1083)` — identico al baseline. Ningun test cubre este
   componente (la suite valida `lib/`), asi que cualquier cambio de numero es una regresion inesperada.
4. `git status --porcelain` sobre `app/ components/ lib/ proxy.ts supabase/` lista **solo**
   `app/[slug]/booking-client.tsx`.
5. Los gates de grep de las tres tasks pasan (`GATE_OK` en las tres).
6. La verificacion **real** es visual y en navegador: el `human-check` de la Task 3, que queda **PENDIENTE** y lo
   cierra una persona. Los gates automatizados prueban que el markup esta, no que la pantalla se vea ni que la
   reserva entre.

Prefijo obligatorio del shell Bash (el `PATH` de Windows llega sin convertir):
`export PATH="/c/Program Files/Git/usr/bin:/c/Program Files/nodejs:/c/Program Files/Git/cmd:$PATH"`
</verification>

<success_criteria>
- Los 6 hallazgos quedan cerrados o con una decision medida y escrita en el codigo (P1-B en las celdas de dia).
- Un solo archivo de codigo modificado; cero componentes nuevos, cero dependencias, cero SQL, cero `components/ui/`.
- Cero cambios de comportamiento en `handleConfirm`, el payload, `handleDateSelect`, el gateo de "Cualquiera" y el
  flujo de pasos.
- Lo declarado fuera de alcance sigue intacto y verificado por gate: borde de marca (2), atribucion de reCAPTCHA
  (2 links), auto-scroll con doble rAF.
- `tsc` limpio, eslint sin hallazgos nuevos, suite en 1083 como el baseline.
- El `human-check` queda registrado como PENDIENTE en el SUMMARY, no aprobado.
</success_criteria>

<output>
Create `.planning/quick/260902-njf-cerrar-los-hallazgos-del-audit-del-booki/260902-njf-SUMMARY.md` when done.

En el SUMMARY dejar registrado, para el proximo que toque esta pantalla:
- **la cuenta del calendario**, con el numero: 327px de contenedor - 24px de padding de tarjeta - 24px de gaps = 7
  celdas de ~40px, y 7x44 = 308 > 301. Es la razon por la que los dias **no** llegan al piso tactil, y quien quiera
  cambiar `px-6`, el `p-3` o el `gap-1` tiene que rehacerla antes;
- **por que el gate del submit ahora mira los errores**: un email con typo se confirmaba en silencio y el cliente
  se quedaba sin mail. Los errores solo existen despues de un blur, asi que el camino de siempre no cambio;
- **por que las `<img>` siguen siendo `<img>`**: `photo_url` es una URL externa arbitraria y `next/image` pediria
  `remotePatterns` en `next.config.ts`, que es config global — las dimensiones resuelven el CLS sin eso;
- **el numero final de tamanos arbitrarios** (0 o 1) y, si quedo 1, con que ancho y que nombre de consultorio se
  midio;
- que el `human-check` quedo **PENDIENTE** y solo se cierra abriendo el navegador a 375px y en desktop, en tema
  claro y oscuro, y **completando una reserva de verdad**.
</output>
