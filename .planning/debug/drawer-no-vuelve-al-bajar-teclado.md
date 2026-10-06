---
status: diagnosed
trigger: "En /appointments, con el drawer de 'Nuevo turno' abierto en mobile (Android Chrome): toca el campo Hora -> se abre el teclado numerico (bien). Confirma con OK -> el teclado se baja bien. Pero el drawer NO vuelve a su lugar: queda un area en blanco grande abajo, y el contenido queda desplazado. No puede scrollear hacia arriba para llegar a la X. Cuando intenta scrollear, salta el aviso de 'Tenes cambios sin guardar' y el drawer vuelve de un salto a su posicion. 'Es como que se baja el teclado pero no el drawer'. En la captura la URL es 192.168.0.7/appointments#modal y el aviso aparece superpuesto e ilegible sobre los datos de un cliente."
created: 2026-10-05T00:00:00Z
updated: 2026-10-05T00:00:00Z
---

## Current Focus

veredicto: CAUSA RAIZ CONFIRMADA Y REPRODUCIDA. Nada aplicado (solo diagnostico).

La hipotesis del dueno es CORRECTA en su estructura (hacen falta los dos quicks) pero el
mecanismo exacto no es el que el supuso: vaul NO esta leyendo el gesto de scroll como arrastre
por un cableado mal hecho del contenedor scrolleable. El contenedor esta bien cableado. Lo que
pasa es que vaul deja puestos `height` y `bottom` INLINE sobre el drawer cuando el teclado se
cierra, porque su guarda de restauracion no corre.

reasoning_checkpoint:
  hypothesis: "El drawer queda desplazado porque vaul deja sus estilos inline `height` y `bottom` puestos cuando el teclado se cierra. Su unica guarda de restauracion (vaul/dist/index.mjs:1117, `isInput(document.activeElement) || keyboardIsOpen.current`) falla por DOS condiciones simultaneas: (1) el latch `keyboardIsOpen` es un TOGGLE (`= !current`, :1132) y cualquier paso extra de visualViewport >60px con el teclado abierto lo deja invertido; (2) `time-field.tsx:275` hace `input.blur()` al confirmar con Enter, asi que cuando llega el resize del cierre del teclado ya NO hay input enfocado. Con los dos, el bloque entero no corre y los estilos quedan clavados."
  confirming_evidence:
    - "MEDIDO (probe 07/08, Chrome 153 headless, emulacion mobile 412x823, app real en localhost:80 logueada): tras cerrar el teclado el drawer queda con `height: 658.391px; bottom: 240px` => top = -75.4 (fuera de pantalla por arriba), 240px en blanco abajo, y la X en top -66.4 => NO alcanzable. Los tres sintomas reportados, exactos."
    - "MEDIDO: el umbral es EXACTAMENTE el `> 60` de vaul/dist/index.mjs:1131 — paso extra de 59px => recupera; 61px => queda clavado. Barrido 45/55/59/61/65/80."
    - "MEDIDO (contrafactico CF2): la MISMA secuencia de viewport sin blur recupera (top 164.6, gapBelow 0, X alcanzable). El blur es NECESARIO."
    - "MEDIDO (probe 05, S2): un solo paso de teclado + blur recupera. El paso extra >60px es NECESARIO."
    - "MEDIDO (CF3): un `blur()` pelado da el mismo resultado que el Enter => es el blur, no nada mas de `commit()`."
    - "LEIDO + grep: `.blur()` aparece en UN SOLO lugar de toda la app: components/ui/time-field.tsx:275. La condicion (2) la introduce el quick 261005-n41 y nada mas."
    - "MEDIDO (CF1): con el formulario LIMPIO el drawer queda igual de desplazado pero sin aviso => el desplazamiento es independiente del veto de 260929-g4d."
    - "MEDIDO (control, probe 08): drawer SANO + formulario sucio + el mismo gesto de dedo hacia abajo en scrollTop=0 => el aviso TAMBIEN salta. El veto/rebote es comportamiento PREEXISTENTE y correcto de vaul, no una regresion."
    - "LEIDO: vaul/dist/index.mjs:971-1027 (`shouldDrag`) climbea el DOM y respeta `scrollTop !== 0`. El `<div className='overflow-y-auto'>` de nuevo-turno-form.tsx:223 esta BIEN cableado: medido scrollHeight 750 > clientHeight 581, y con scrollTop=169 el gesto scrollea (no arrastra)."
    - "MEDIDO: el viewport meta de la app es `width=device-width, initial-scale=1`, SIN `interactive-widget` => Chrome usa su default `resizes-visual`: visualViewport encoge, window.innerHeight NO. Es exactamente el modelo que asume vaul y el que usa la sonda."
  falsification_test: "Que la secuencia sin blur quedara clavada igual (entonces 261005-n41 seria inocente), o que un paso extra <=60px tambien la clavara (entonces el latch no seria el gate). Las dos se midieron y dieron lo contrario."
  fix_rationale: "El arreglo propuesto (A) limpia `height`/`bottom` inline cuando el teclado ya esta TOTALMENTE abajo. Ataca la causa — estado inline huerfano que nadie recoge — y no el sintoma: no toca el gesto, no toca el veto, no toca el blur que el dueno pidio."
  blind_spots:
    - "NO MEDIDO en un Android real: el teclado de software no se puede emular. Lo sintetizado es el resize de `visualViewport` (que es LO QUE VAUL LEE, :1119/:1163), no el teclado. Lo que falta por medir es QUE dispara el paso extra >60px en el celular del dueno."
    - "NO MEDIDO: que el `<input type=time>` viejo no encogia el viewport en Android. Es lo que afirma el dueno y lo que documenta time-field.tsx:13-14 (abria la ruedita). El argumento NO depende de eso igual: el nativo nunca se blureaba solo, asi que la condicion (2) nunca se cumplia."
    - "NO MEDIDO: el aviso superpuesto en el celular del dueno. Lo medido es que el toast es OPACO una vez asentado y translucido durante sus ~160ms de animacion de entrada."
  candidate_causes:
    - "code (dependencia): vaul 1.1.2 usa un TOGGLE en vez de un set para `keyboardIsOpen` (index.mjs:1132) y no tiene ningun camino de limpieza incondicional al cerrarse el teclado."
    - "code (nuestro): time-field.tsx:275 suelta el foco al confirmar, borrando la unica otra condicion que mantiene vivo el bloque de restauracion de vaul."
    - "environment: el teclado de Android dispara mas de un resize de visualViewport con el teclado abierto (swap QWERTY->numerico, barra de sugerencias, barra de URL de Chrome al scrollear). Es la condicion de entorno que arma el escenario."
    - "config: el viewport meta no declara `interactive-widget`, asi que rige `resizes-visual`. No es culpable (es lo que vaul espera) pero define el modelo."
  and_gate: "SI — AND medido y aislado con contrafactivos. (1) paso extra de visualViewport >60px con el teclado abierto Y (2) ningun input enfocado cuando llega el resize del cierre. Cada una sola NO reproduce (S2 y CF2 recuperan). Las dos juntas clavan el drawer (S3, S5, S6-150, CF3)."

next_action: "Ninguna accion de codigo (el dueno pidio diagnostico sin arreglo). Decision del dueno sobre el arreglo A (listener de visualViewport en components/ui/drawer.tsx que limpia height/bottom cuando el teclado ya esta abajo), validado en runtime: recupera top=164.6 / gapBelow=0 / X alcanzable y NO interfiere con el teclado abierto."

## Symptoms

expected: "Al bajar el teclado (OK del teclado numerico), el drawer vuelve a su alto/posicion normal y la X queda alcanzable. Scrollear dentro del drawer scrollea, no arrastra."
actual: "El teclado baja pero el drawer queda con el alto/offset del teclado abierto: area en blanco grande abajo, contenido desplazado, X fuera de alcance. Al intentar scrollear hacia arriba salta el aviso 'Tenes cambios sin guardar' y el drawer rebota a su posicion."
errors: "ninguno (no hay error de JS). El aviso del guard aparece superpuesto e ilegible sobre los datos de un cliente."
reproduction: "Android Chrome real, 192.168.0.7/appointments -> abrir drawer 'Nuevo turno' -> tocar campo Hora -> teclado numerico -> OK -> intentar scrollear hacia arriba"
started: "sospecha del dueno: combinacion de quick 261005-n41 (time-field reemplaza input type=time) + quick 260929-g4d (veto de descarte en drawers)"

## Eliminated

- hypothesis: "vaul lee el gesto de scroll como arrastre porque el `<div className='overflow-y-auto'>` del shell esta mal cableado / vaul espera otro contenedor."
  evidence: "LEIDO vaul/dist/index.mjs:1011-1025: `shouldDrag` climbea desde el target y se abstiene en cuanto encuentra un ancestro con `scrollHeight > clientHeight` y `scrollTop !== 0`. No pide ningun data-attribute ni contenedor nominado. MEDIDO sobre el scroller real (nuevo-turno-form.tsx:223): scrollHeight 750, clientHeight 581, canScroll true, y con scrollTop=169 el gesto scrollea. El cableado esta bien."
  timestamp: 2026-10-05T00:40:00Z

- hypothesis: "Falta pasar `repositionInputs` (o esta mal pasado) y por eso vaul no reacciona al teclado."
  evidence: "LEIDO vaul/dist/index.mjs:879: `repositionInputs = true` es el DEFAULT y el repo no lo pisa en ningun lado (grep: cero ocurrencias). Y MEDIDO: vaul SI reacciona — escribe `height: 497px; bottom: 300px` al abrirse el teclado. El problema no es que no reaccione, es que no DESHACE."
  timestamp: 2026-10-05T00:42:00Z

- hypothesis: "`resetDrawerDrag()` (components/ui/drawer.tsx:43-47) deja un transform o un alto que despues no se limpia, y eso desplaza el drawer."
  evidence: "MEDIDO: en el estado clavado, ANTES de cualquier gesto, `transform` es `-` (no hay transform) y el drawer ya esta desplazado (top -75.4). O sea: el desplazamiento existe sin que `resetDrawerDrag` haya corrido nunca. Y `resetDrawerDrag` solo escribe `transform` + `transition` — nunca `height` ni `bottom` (son las dos propiedades que quedan clavadas). Despues del gesto deja `translate3d(0px, 0px, 0px)`, que es un no-op visual y es a proposito (espeja el `resetDrawer()` privado de vaul, index.mjs:1189-1192)."
  timestamp: 2026-10-05T00:55:00Z

- hypothesis: "El aviso se ve superpuesto e ilegible por z-index o por un fondo no opaco del toast de sonner sobre el drawer."
  evidence: "MEDIDO (probe 09): el toast asentado tiene `background-color: rgb(255,252,240)` (OPACO, sin alpha), `opacity: 1`, y su toaster tiene `z-index: 999999999` contra el `z-index: 50` del drawer. No hay problema de z-index ni de transparencia en reposo. Lo que SI se midio (probe 10): durante su animacion de entrada el toast va de opacity 0.03 -> 1 en ~160ms, deslizando de y=-56 a y=16; en esa ventana es translucido y lo de atras se lee por debajo."
  timestamp 2026-10-05T01:10:00Z

- hypothesis: "El latch `keyboardIsOpen` de vaul se filtra entre aperturas y cierres del drawer y eso solo alcanza para clavarlo."
  evidence: "MEDIDO (probe 12): cerrar el drawer con la X con el teclado arriba y reabrir NO deja el latch en un estado que clave el drawer — la sesion 2 con un solo paso de teclado recupero (top 164.6, gapBelow 0). El latch persiste (el Root de vaul no se desmonta) pero por si solo no es un disparador."
  timestamp: 2026-10-05T01:25:00Z

## Evidence

- timestamp: 2026-10-05T00:30:00Z
  checked: "node_modules/vaul/dist/index.mjs:1112-1172 (el unico efecto que reacciona al teclado) + :879 (defaults) + :918-922 (refs)"
  found: "Todo el manejo de teclado vive en UN listener de `visualViewport.resize` (:1163). Su cuerpo entero esta dentro de un solo `if` (:1117): `if (isInput(focusedElement) || keyboardIsOpen.current)`. Si ninguna de las dos se cumple, NO se toca nada — ni para poner ni para sacar. Las propiedades que escribe son `style.height` (:1148/:1150/:1153) y `style.bottom` (:1156/:1159). `keyboardIsOpen` se actualiza con un TOGGLE, no con un set: `keyboardIsOpen.current = !keyboardIsOpen.current` (:1132), y solo cuando `Math.abs(previousDiffFromInitial.current - diffFromInitial) > 60` (:1131)."
  implication: "Hay exactamente UNA guarda para deshacer los estilos, y es fragil por diseno: un latch que se invierte en cada paso >60px en vez de reflejar el estado real del teclado. No existe ningun camino de limpieza incondicional."

- timestamp: 2026-10-05T00:33:00Z
  checked: "node_modules/vaul/dist/index.mjs:331-333 (`isInput`) + :118-128 (`nonTextInputTypes`)"
  found: "`isInput` es true para cualquier `HTMLInputElement` cuyo `type` no este en {checkbox,radio,range,color,file,image,button,submit,reset}. O sea: es true tanto para `type=text` (el nuevo) como para `type=time` (el viejo). La diferencia entre los dos campos NO esta en como vaul los clasifica."
  implication: "La condicion (2) del AND no es 'el campo cambio de tipo' sino 'el campo se desenfoca solo'. Eso la ancla en time-field.tsx:275, no en el cambio de `type`."

- timestamp: 2026-10-05T00:36:00Z
  checked: "Estructura real del drawer medida en el DOM (probe 04) contra components/dashboard/nuevo-turno-form.tsx:198-225"
  found: "DrawerContent (role=dialog, `fixed`, `h-auto`, `max-h-[80vh]`) tiene como hijos DIRECTOS: el handle, el DrawerHeader, el `<button>` de la X (`absolute top-2 right-2`, :212-221), el `<p role=status sr-only>`, y recien ahi el `<div className='overflow-y-auto px-4 pb-6'>` (:223). Baseline sano medido: drawer top 164.6 / bottom 823 / height 658.4 (= 80vh de 823), scroller scrollHeight 750 vs clientHeight 581, X en top 173.6 alcanzable, sin estilos inline."
  implication: "La X esta FUERA del contenedor scrolleable. Por eso scrollear el contenido NUNCA la trae de vuelta: si el drawer esta desplazado hacia arriba, la X se va con el. MEDIDO explicitamente (probe 07): poniendo el scroller en scrollTop=0, la X sigue en top -66.4."

- timestamp: 2026-10-05T00:45:00Z
  checked: "Probe 05 — 4 escenarios de teclado sobre la app real (/appointments logueada, emulacion mobile 412x823). Teclado sintetizado por donde vaul lo lee: override del getter de `visualViewport.height` + dispatch de `resize` en `window.visualViewport`."
  found: |
    S1 (1 paso, cierra SIN blur)            -> recupera: h=658.391px bottom=0px  top=164.6  gapBelow=0
    S2 (1 paso, Enter BLUREA, cierra)       -> recupera: h=658.391px bottom=0px  top=164.6  gapBelow=0
    S3 (2 pasos 150->300, blur, cierra)     -> CLAVADO: h=508.391px bottom=300px top=14.6   gapBelow=300
    S4 (2 pasos, cierra SIN blur, control)  -> recupera: bottom=0px  top=164.6  gapBelow=0
  implication: "Primera reproduccion. Y el AND queda aislado de entrada: el blur solo no alcanza (S2), el paso extra solo no alcanza (S4), los dos juntos clavan (S3)."

- timestamp: 2026-10-05T00:50:00Z
  checked: "Probe 06 — el camino REALISTA: teclado QWERTY (buscador de cliente) y despues teclado NUMERICO (Hora). En Android el keypad numerico tiene otro alto que el QWERTY, asi que cambiar de uno al otro dispara un resize extra con el teclado abierto."
  found: |
    QWERTY 320 -> numerico 240 (delta 80) -> CLAVADO: h=658.391px bottom=240px top=-75.4 gapBelow=240
    QWERTY 300 -> numerico 250 (delta 50) -> recupera
    QWERTY 300 -> numerico 280 (delta 20) -> recupera
  implication: "Este es el caso que explica el sintoma COMPLETO, incluida la X: con delta 80 el drawer queda con su alto original (658.4) pero con `bottom: 240px`, asi que su top se va a -75.4 — ARRIBA del borde de la pantalla. Y el flujo coincide con el del dueno: en 'Nuevo turno' el cliente se carga primero (teclado QWERTY) y la hora despues (teclado numerico)."

- timestamp: 2026-10-05T00:58:00Z
  checked: "Probe 07 — el estado clavado completo + el gesto de dedo hacia abajo, con formulario sucio."
  found: |
    estado clavado:  drawer rect {top:-75.4, bottom:583, height:658.4}, gapBelow 240,
                     X {top:-66.4, reachable:false}, scroller scrollTop 169
    scroller a 0:    la X SIGUE en top -66.4 (no alcanzable)
    gesto abajo 170px en scrollTop=0:
                     toast "Tenes cambios sin guardarTermina de cargarlo, o cerra con la X para descartarlo."
                     drawer sigue abierto, y queda `transform: translate3d(0px, 0px, 0px)`
  implication: "La cadena causal entera, medida: (1) el drawer queda desplazado -> (2) la X se va de pantalla -> (3) el dueno scrollea para alcanzarla -> (4) el scroller llega a scrollTop 0 -> (5) el siguiente gesto hacia abajo es, correctamente, un arrastre de cierre -> (6) el veto de 260929-g4d lo frena y avisa -> (7) `resetDrawerDrag` lo devuelve... a su posicion CLAVADA. 'Vuelve de un salto a su posicion' = vuelve a la posicion ROTA."

- timestamp: 2026-10-05T01:05:00Z
  checked: "Probe 08 — control y contrafactivos."
  found: |
    CONTROL drawer SANO + sucio + mismo gesto -> el toast TAMBIEN salta (y queda el mismo translate3d(0,0,0))
    CF1 estado clavado + formulario LIMPIO    -> igual de desplazado (top -75.4, X no alcanzable), SIN toast
    CF2 mismos 2 pasos, SIN blur              -> recupera (top 164.6, gapBelow 0, X alcanzable, active=INPUT)
    CF3 mismos 2 pasos, `blur()` pelado       -> CLAVADO identico al caso Enter (top -75.4, active=BODY)
  implication: "Reparto de culpas, medido. El DESPLAZAMIENTO es de la combinacion vaul + el blur de 261005-n41 (CF1 lo prueba sin el veto; CF2 lo prueba sin el blur). El AVISO + REBOTE es comportamiento PREEXISTENTE de 260929-g4d y aparece igual en un drawer sano (CONTROL): 260929-g4d no causa el bug, lo hace mas confuso. Y CF3 descarta que algo de `commit()` importe: alcanza con soltar el foco."

- timestamp: 2026-10-05T01:10:00Z
  checked: "Probe 09/10 — el toast: estilos computados, z-index, animacion, y que tapa en el estado clavado. app/layout.tsx:65 (`<Toaster richColors position='top-right' />`) y components/ui/sonner.tsx."
  found: |
    asentado:  bg rgb(255,252,240) OPACO, opacity 1, toaster z-index 999999999 (drawer: 50),
               rect x=16 y=16 w=380 h=74 sobre un viewport de 412 de ancho
    entrando:  opacity 0.03 -> 0.14 -> 0.50 -> 0.84 -> 1 en ~160ms, deslizando de y=-56 a y=16
    repetido:  con el id fijo UNSAVED_CHANGES_TOAST_ID sonner actualiza EN EL LUGAR: siempre UN
               solo elemento [data-sonner-toast], nunca dos apilados ni un cross-fade
    clavado:   bajo la franja del toast (y 16..90) queda la LISTA DE CLIENTES del combobox:
               "Carla Mendez 1140000003 carla..." en y=20, "Diego Ferrari ..." en y=84
  implication: "El aviso superpuesto NO es un bug aparte de z-index ni de fondo translucido. Son dos cosas, las dos medidas: (a) `position='top-right'` sin variante mobile => en 412px el toast es practicamente una franja de ancho completo pegada arriba, y como el drawer esta desplazado hacia arriba, lo que cae debajo son los DATOS DEL CLIENTE (literalmente lo que describe la captura); (b) los dos textos se leen encima porque la captura cayo dentro de los ~160ms de la animacion de entrada, donde el toast todavia es translucido. Sin el desplazamiento no hay solape: en el drawer sano el header arranca en y~168 y el toast termina en y=90."

- timestamp: 2026-10-05T01:15:00Z
  checked: "Probe 11 — barrido del umbral del latch, contra vaul/dist/index.mjs:1131."
  found: |
    paso extra 45 -> recupera     paso extra 61 -> CLAVADO (bottom 361px, top 26)
    paso extra 55 -> recupera     paso extra 65 -> CLAVADO (bottom 365px)
    paso extra 59 -> recupera     paso extra 80 -> CLAVADO (bottom 380px)
  implication: "El borde cae EXACTAMENTE entre 59 y 61: es el `> 60` literal de vaul (:1131). Queda probado que el disparador es el toggle del latch y no otra cosa. Cualquier cambio de alto del viewport >60px mientras el teclado esta abierto lo invierte: swap QWERTY<->numerico, barra de sugerencias del teclado, o la barra de URL de Chrome al scrollear."

- timestamp: 2026-10-05T01:20:00Z
  checked: "Probe 11 — arreglo candidato A instalado SOLO en runtime (nada escrito al repo): listener de `visualViewport.resize` que, cuando `visualViewport.height >= window.innerHeight - 1` (teclado totalmente abajo), hace `removeProperty('height')` y `removeProperty('bottom')` sobre `[data-vaul-drawer]`. No toca `transform`."
  found: |
    sin arreglo, QWERTY 320 -> num 240:  CLAVADO  top=-75.4  gapBelow=240  X.reachable=false
    con arreglo, teclado ABIERTO:        no interfiere (bottom 240px sigue puesto, campo Hora visible sobre el teclado = true)
    con arreglo, teclado CERRADO:        RECUPERADO  top=164.6  gapBelow=0  X.reachable=true  inline h=- bottom=-
    segundo ciclo de teclado:            abre bien (bottom 300px) y cierra recuperando (top 164.6, gapBelow 0)
  implication: "El arreglo A se valido contra el bug real: recupera el caso clavado, NO molesta con el teclado abierto (que es el unico trabajo util que hace vaul aca), y aguanta ciclos repetidos. Es un backstop sobre estado que vaul deja huerfano, no un reemplazo de su logica."

- timestamp: 2026-10-05T01:30:00Z
  checked: "grep `\\.blur()` en app/ components/ lib/ + grep de TimeField en todo el repo + components/dashboard/nuevo-abono-form.tsx:186-206"
  found: "`.blur()` existe en UN SOLO lugar de toda la app: components/ui/time-field.tsx:275. `TimeField` tiene 4 call sites (agenda-client.tsx:1276/:1284/:1559/:1561, onboarding/page.tsx:1146/:1154, nuevo-turno-form.tsx:689, nuevo-abono-form.tsx:615). De esos, los que viven dentro de un Drawer de vaul son DOS: el alta de turno y el alta de abono. Y `nuevo-abono-form.tsx` tiene el shell IDENTICO: `DrawerContent ref` (:186), X `absolute top-2 right-2` (:198), `<div className='overflow-y-auto px-4 pb-6'>` (:205), `resetDrawerDrag` (:138), `guardDraftOnDrawerDismiss` (:152)."
  implication: "La condicion (2) del AND es exclusiva de 261005-n41: ningun otro campo del repo se desenfoca solo. Y el bug NO es solo de /appointments: el drawer de 'Nuevo abono' tiene exactamente la misma forma y el mismo campo, asi que esta igual de expuesto. Hay que probar los dos."

## Resolution

root_cause: |
  AND de dos condiciones (medido y aislado con contrafactivos, ninguna alcanza sola):

  (1) vaul 1.1.2 deja sus estilos inline `height` y `bottom` puestos sobre el drawer cuando el
      teclado se cierra. Todo su manejo de teclado vive en un unico listener de
      `visualViewport.resize` cuyo cuerpo completo esta detras de
      `if (isInput(document.activeElement) || keyboardIsOpen.current)`
      (node_modules/vaul/dist/index.mjs:1117). No hay ningun camino de limpieza incondicional.
      Y `keyboardIsOpen` es un TOGGLE, no un set: `keyboardIsOpen.current = !keyboardIsOpen.current`
      (:1132), que se dispara con cada cambio de alto del viewport >60px (:1131). Un paso extra
      >60px con el teclado abierto —en Android: swap QWERTY<->numerico, barra de sugerencias, o la
      barra de URL de Chrome— deja el latch INVERTIDO (en false con el teclado arriba).

  (2) components/ui/time-field.tsx:275 hace `input.blur()` al confirmar con Enter (quick 261005-n41,
      para que el teclado baje). Es el UNICO `.blur()` de toda la app. Por eso, cuando llega el
      resize del cierre del teclado, `document.activeElement` ya no es un input.

  Con las dos, las dos ramas del `if` son false, el bloque no corre nunca mas, y `height`/`bottom`
  quedan clavados con los valores del teclado abierto. En el caso realista medido
  (QWERTY 320px -> numerico 240px) eso deja `height: 658.391px; bottom: 240px`: 240px en blanco
  abajo, el drawer con su top en -75.4 (fuera de pantalla por arriba) y la X en -66.4, inalcanzable.
  Scrollear no la recupera porque la X es `absolute` sobre el DrawerContent, FUERA del
  `overflow-y-auto` (nuevo-turno-form.tsx:212-223). Cuando el scroller llega a scrollTop 0, el
  siguiente gesto hacia abajo es —correctamente— un arrastre de cierre para vaul
  (`shouldDrag`, :1011-1025), el veto de 260929-g4d lo frena, avisa, y `resetDrawerDrag` lo devuelve
  a su posicion ROTA. Eso es el "salta el aviso y vuelve de un salto".

  Reparto: el DESPLAZAMIENTO es de (1)+(2). El AVISO y el REBOTE son comportamiento preexistente de
  260929-g4d —el control midio el mismo aviso en un drawer SANO con el formulario sucio—: no causan
  el bug, lo vuelven confuso. El drawer de "Nuevo abono" tiene el shell identico y el mismo campo:
  esta igual de expuesto.

fix: |
  NO APLICADO (el dueno pidio diagnostico primero). Propuesto y validado en runtime: arreglo A.

  A — backstop de limpieza en components/ui/drawer.tsx (RECOMENDADO). Un listener de
      `visualViewport.resize` que, cuando el teclado ya esta TOTALMENTE abajo
      (`visualViewport.height >= window.innerHeight - 1`), hace `removeProperty('height')` y
      `removeProperty('bottom')` sobre el nodo del DrawerContent. Nunca toca `transform` (eso es
      del gesto / `resetDrawerDrag`). Vive en el wrapper, asi que cubre los dos drawers de una, y es
      el mismo lugar donde ya vive `resetDrawerDrag` limpiando estado que vaul deja huerfano.
      MEDIDO: recupera el caso clavado (top 164.6, gapBelow 0, X alcanzable), no interfiere con el
      teclado abierto (el campo Hora sigue visible sobre el teclado), y aguanta ciclos repetidos.
      Trade-off: pisamos estado que vaul considera suyo. Esta acotado a "solo cuando el teclado esta
      totalmente abajo", donde el estado correcto es justamente `h-auto` + `max-h-[80vh]` del CSS;
      si vaul algun dia arregla el latch, nuestro listener pasa a ser un no-op.

  B — no soltar el foco en Enter (revertir parte de 261005-n41). Trade-off: devuelve el reclamo que
      261005-n41 arreglo (el teclado tapando media pantalla). No se recomienda.

  C — limpiar los estilos desde `time-field.tsx` despues del blur. Trade-off: ataria un componente
      generico de `components/ui` al drawer que lo contiene. No se recomienda.

  D — parchear o actualizar vaul (el toggle `= !current` deberia ser un set contra
      `diffFromInitial > 0`). Trade-off: 1.1.2 es la ultima 1.x; hay que mantener un patch.
      Es el arreglo correcto aguas arriba, pero no es el camino para cerrar esto ahora.

  Aparte (no es el bug, es un papercut preexistente que lo empeoro visualmente):
  `app/layout.tsx:65` usa `position="top-right"` sin variante mobile; en 412px el toast es una franja
  casi de ancho completo pegada arriba.

verification: "N/A — nada aplicado. El arreglo A se valido en runtime sobre la app real (probe 11); el arbol quedo limpio (solo este doc de sesion)."
files_changed: []
