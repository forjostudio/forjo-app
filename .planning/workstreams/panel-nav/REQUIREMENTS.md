# Requirements: v0.31 — La navegación mobile del panel

**Defined:** 2026-10-06 · **Workstream:** `panel-nav`
**Core Value:** en el celular el panel se usa como una app, no como un sitio con menú hamburguesa.

## De dónde sale

Pedido del dueño después de la UAT de v0.30: *"cambiar el diseño a algo tipo app de celular en móvil,
con una barra abajo con los accesos principales y una sección Más con todo el menú. Una vez que estás
en el menú Más y entrás a una sección, volver atrás tiene que volver al menú Más y de ahí recién a
inicio."*

Y un segundo pedido, del mismo mensaje: *"cuando toco atrás en el dashboard me cierra la app o me manda
a alguna página anterior, podemos poner una guarda ahí que diga ¿desea salir?"*

## Decisiones tomadas antes de diseñar (2026-10-06)

- **D-01 — La barra es FIJA, igual para todos los rubros:** `Inicio · Turnos · Agenda · Clientes · Más`.
  Los cuatro primeros existen en **todos** los verticales y son el uso diario; lo específico de cada
  rubro vive en **Más**. Se descartó derivarla del vertical (la barra cambiaría de forma entre rubros)
  y dejar que el dueño la configure (una pantalla de ajustes más que casi nadie toca).
- **D-02 — Sólo mobile.** Debajo del breakpoint entra la barra; en desktop sigue el sidebar **sin
  cambios**. Una barra inferior en pantalla grande es desperdicio de espacio.
  ⚠ **CORREGIDO (2026-10-06): el breakpoint es `lg` (1024px), no 768.** Medido: el sidebar es
  `hidden lg:flex` y el header con hamburguesa es `lg:hidden` (`sidebar.tsx:253,279`). **Entre 768 y
  1023px hoy NO hay sidebar, hay hamburguesa** — si la barra entrara por `md:hidden`, esa banda se
  quedaría sin ningún menú.

## Lo medido que condiciona el diseño

| # | Qué | Dónde |
|---|---|---|
| T-1 | **El menú varía por rubro.** Hoy son **5 grupos / 12 destinos** (`PANEL` · `AGENDA` · `GESTIÓN` · `REPORTES` · `AJUSTES`) y cada vertical expone un subconjunto. Por eso **Más** no es una lista fija: es el menú resuelto menos lo que ya está en la barra. | `components/dashboard/sidebar.tsx:43-48,57-83` |
| T-2 | ⚠ **El repo NO usa `env(safe-area-inset-*)` en ningún lado** (barrido: cero coincidencias). Una barra inferior fija sin eso queda **debajo de la zona de gestos** del teléfono. | medido |
| T-3 | El panel **no tiene ningún elemento flotante fijo**, así que la barra no colisiona con nada existente. | medido |
| T-6 | ⚠ **"Todo el menú" es MÁS que los 5 grupos.** El footer del sidebar tiene tres filas que no están en `NAV_GROUPS`: **Ayuda**, **Ver mi página** (abre el público en pestaña nueva) y **Cerrar sesión**, más el bloque de identidad. Si **Más** renderiza sólo `buildNavGroups()`, el dueño **pierde el logout en mobile**. | `sidebar.tsx:189,197` |
| T-7 | ⚠ **El drawer del menú de hoy NO participa del historial** (`useState` pelado, sin marca). Si **Más** se construye con ese molde, **el atrás no lo cierra** y MOB-04 es imposible: Más tiene que ser una **ruta** o una hoja registrada en `overlay-history`. | `sidebar.tsx:262-267` |
| T-8 | ⚠ **D-01 fija los DESTINOS, no las PALABRAS.** En `canchas` "Turnos" es **"Reservas"**; en `salud` "Clientes" es **"Pacientes"**. A 375px con 5 ítems son ~75px por ítem para la palabra más larga del sistema. Es restricción de diseño. (Verificado: los **4 verticales** exponen los 4 destinos ⇒ D-01 no tiene excepciones.) | `lib/verticals.ts` |
| T-9 | `viewportFit: 'cover'` **existe** en el tipo de Next aunque no esté documentado, y `app/layout.tsx` **no exporta `viewport`** ⇒ se puede declarar **sólo** en el layout del dashboard, sin afectar landing, `/[slug]` ni CRM. **Sin eso `env(safe-area-inset-bottom)` vale 0** y MOB-02 no se cumple aunque el CSS esté escrito. | `next/dist/lib/metadata/types/extra-types.d.ts:52` |
| T-10 | ⚠ **MOB-05 no tiene hoy su condición habilitante:** el panel **no es instalable** (no hay `manifest`, cero usos de `display-mode`), así que gatear la guarda por "app instalada" daría **siempre false**. | medido |
| T-4 | La política de atrás actual es **un solo nivel**: `panelNavMode` deja **una sola sección encima del dashboard** (dashboard→sección empuja, sección→sección reemplaza). El modelo nuevo necesita **dos** (Inicio → Más → sección) ⇒ **esta regla se redefine**. | `lib/panel-history.ts` |
| T-5 | El sidebar ya consume `panelNavMode` y `consumeOwnedPanelEntry` en su `onNavigate`, y el guard de cambios sin guardar se evalúa **primero**. Lo que se construya tiene que respetar ese orden. | `components/dashboard/sidebar.tsx:152,162-163` |

## Requisitos

### La barra

- [x] **MOB-01**: En mobile hay una barra inferior fija con `Inicio · Turnos · Agenda · Clientes · Más`,
      visible en todas las pantallas del panel, con el destino actual señalado.
- [x] **MOB-02**: La barra respeta la **zona segura** del dispositivo (T-2) y sus destinos cumplen el
      área táctil mínima de 44×44. No tapa contenido: las pantallas reservan su alto.
- [x] **MOB-03**: **Más** muestra el resto del menú del negocio —el menú resuelto por vertical menos lo
      que ya está en la barra (T-1)— agrupado como hoy, sin perder ningún destino.

### La política de atrás, redefinida

- [x] **MOB-04**: El atrás tiene **dos niveles**: desde una sección abierta por Más vuelve a **Más**, y
      desde Más vuelve a **Inicio**. Desde una sección de la barra vuelve a **Inicio**.
      ⚠ **PRECISADO el 2026-10-14 (D-02 de la Phase 3), no contradicho.** *Dos niveles* es la
      **profundidad de Más y sus secciones**, **no es un techo de la pila**: Más **apila sobre lo que
      haya abierto**, así que `Inicio → Turnos → Más` tiene **tres** escalones **a propósito** y su
      atrás cae en **Turnos**. El motivo es el criterio con el que el dueño resolvió D-02: *el atrás
      deshace el último movimiento*, que es el único invariante que nadie encuentra sorprendente.
      ⚠ **Y el criterio verificable del cruce entre los dos niveles, escrito como invariante** (en
      lugar de *"la pila queda en un nivel"*, que colisionaba con D-02): **después de tocar un destino
      de la barra, `/mas` NO queda inmediatamente debajo, y no hay dos entradas idénticas
      adyacentes.** En la pila de dos escalones eso produce **literalmente** lo que dice la frase de
      arriba (el atrás cae en Inicio); en la de tres produce *el atrás devuelve a la sección de la
      barra desde la que se abrió Más* — el mismo principio, no una excepción. Lo implementa el plan
      `03-02` (`panelBranchPlan` + `runBranchNavigation`) y está medido en los escenarios E-4, E-5 y
      E-8 de `.planning/debug/pila-de-dos-niveles-medida.md`.

      ⚠ **PRECISADO el 2026-10-27 al cerrar el gap `G2-1` (plan `03-09`), no contradicho: sección →
      raíz es un RETROCESO, no un empuje.** Tocar Inicio desde una sección **consume** la entrada de
      la sección y deja al dueño parado en la entrada **original** de Inicio, en vez de apilar una
      tercera entrada.

      - **Por qué:** con `to === root` empujando, el ciclo Inicio↔sección hacía crecer la pila **dos
        entradas por vuelta, sin techo** — medido como número en el escenario **E-14** de la sonda:
        profundidades `3 → 5 → 7` con la regla vieja contra `1, 1, 1` con la nueva. Y esa tercera
        entrada quedaba marcada con la sección que quedó debajo, así que la séptima regla del armado
        decía *no armar* y **el aviso de salida nunca aparecía**. Textual del dueño: *«al tocar inicio
        después de haber hecho otras cosas cae a /dashboard y la guarda de salir no está. Tengo que
        empezar a hacer atrás por todo lo que estuve tocando hasta que llega a la primer vez que toqué
        inicio y aparece #salir»*.
      - **El invariante que queda:** la pila de la barra se mantiene en **dos** niveles — el ciclo
        Inicio↔sección repetido tres veces deja **la misma profundidad**, y el aviso se re-arma solo
        sin tocar ninguna de las siete reglas del armado (lo que cambió es la **pila** que esas reglas
        leen).
      - ⚠ **Su LÍMITE DECLARADO, para no confundirlo con un bug:** en la pila de **tres** escalones
        que **D-02 acepta a propósito** (`Inicio → Turnos → Más`), la raíz **no** es la entrada
        inmediatamente de abajo, así que el hecho es **falso** y el gesto **sigue empujando**: el
        atrás desde ahí vuelve a **Más**, que es **algo visible** y es el mismo principio con el que el
        dueño resolvió D-02 (*el atrás deshace el último movimiento*). El aviso **no** aparece ahí
        porque hay algo nuestro debajo. Medido en **E-16** mitad B. Lo que la fase promete es que **el
        ciclo no crece sin techo**, no que la pila nunca pase de dos escalones.
      - **Dónde vive la regla:** en la decisión de la **rama** (`panelBranchPlan`), **no** en la
        política de rutas (`panelNavMode`, que quedó intacta en sus seis ramas). El motivo, en una
        línea: en la política de rutas la regla cambiaría el atrás de **escritorio entero**, que es lo
        que el criterio 6 del ROADMAP protege — ahí quedó su **revisión acotada** del 2026-10-27 con el
        residuo de un solo caso.

      ⚠ **PRECISADO el 2026-10-28 al cerrar el gap `G3-1` (plan `03-11`), no contradicho: la marca de
      la rama VIAJA por encima del `replace`.** Un reemplazo **no cambia** lo que quedó debajo, así que
      lo que había debajo del origen es lo que queda debajo del destino: el gesto **lee** la marca antes
      de que el `<Link>` reemplace y la **propaga** a la entrada nueva.

      - **El hecho medido que lo justifica, que es un contraste y no una teoría:** en el **mismo motor
        y el mismo día**, `Inicio → Clientes → tocar Inicio` (**una** sola sección) **pasa**, y
        `Inicio → Turnos → Clientes → Agenda → tocar Inicio` **falla**. La única diferencia entre los
        dos recorridos es **un reemplazo**. Textual del dueño: *«Hice ese recorrido y toqué inicio y
        sale sin el hash, y atrás me lleva a donde estaba antes»*. Medido como números en el escenario
        **E-17** de la sonda (mitad A contra mitad B, en la misma corrida: plan `push` contra `up`,
        profundidad final `3` contra `1`).
      - **La causa, en una línea:** la marca se escribía **sólo cuando la política dice empujar**, y el
        reemplazo de sección a sección deja que el router escriba su propio state encima. La regla
        `-1c` era **correcta y estaba desplegada** —el recorrido de una sola sección pasó, que es lo
        que descartó la hipótesis rival—, pero en una **cadena** de reemplazos el hecho que lee ya no
        existía.
      - **El invariante que queda:** la regla de `G2-1` dispara **también después de un paseo por
        varias secciones**, así que el ciclo sigue sin crecer **sin importar cuántas secciones se
        recorran antes** de tocar Inicio.
      - ⚠ **LOS TRES NO-DEFECTOS, RE-AFIRMADOS, uno por uno:** (1) la **pila de tres escalones** de
        D-02 —`Inicio → Turnos → Más → tocar Inicio`— **sigue empujando** y su atrás **sigue volviendo
        a Más**, porque ahí no hay ningún reemplazo en el camino y la propagación **no participa**
        (medido en **E-18**); (2) `Más → tocar Inicio → atrás` **sigue avisando para salir** (decisión
        del dueño del 2026-10-27, debajo de MOB-05, **prohibido** leerla como regresión); y (3) el
        **residuo de escritorio** de la revisión acotada del criterio 6 queda **tal como está**, ni
        ampliado ni tapado.
      - ⚠ **EL RESIDUO NUEVO, DECLARADO ACÁ en vez de descubierto en la ronda 4:** el camino del
        **guard de cambios sin guardar** ejecuta su propio reemplazo y **no** propaga, así que en una
        pantalla **sucia** que sale por el guard la marca se sigue perdiendo y el gesto siguiente hacia
        Inicio queda **un escalón más largo** — **nunca** una expulsión. **Por qué no se cableó allá:**
        exigiría una **segunda** lectura del estado en el mismo gesto (dos verdades que pueden diferir)
        más un **parámetro nuevo** en el ejecutor compartido. Se **acepta** con el mismo criterio con
        el que se aceptaron los otros dos residuos de la fase: es la **degradación segura** —un escalón
        más, nunca el dueño fuera del sitio—. Queda escrito en **cuatro** lugares, los cuatro con esta
        fecha: el docblock del canal en `lib/panel-branch.ts`, `.planning/debug/pila-de-dos-niveles-medida.md`,
        esta precisión y la entrada **18** de `.planning/WINDOWS.md`. Medido en **E-17** mitad C.
      - **Dónde vive el arreglo, y qué NO toca:** un **segundo productor** (`branchCarryMark`) sobre el
        canal de propagación que **ya existía**, con el **mismo** consumidor, el **mismo** escritor
        único y la **misma** negativa a inventar una ruta. `panelNavMode` y `panelBranchPlan` quedan
        **intactas**, medidas por recorte: el arreglo es **aditivo**.
- [x] **MOB-05**: En **Inicio**, una vez que el dueño **tocó la pantalla** en esta visita, el atrás pide confirmación antes de salir del panel.
      ✅ **RESUELTO el 2026-10-14 — la decisión está TOMADA: SE IMPLEMENTA** (D-01 de la Phase 3, ver
      `phases/03-la-pol-tica-de-atr-s-de-un-nivel-a-dos/03-CONTEXT.md`). El primer atrás en Inicio
      **no sale** y avisa; el segundo **sale de verdad** —con el sentinel armado, que desde el
      2026-10-28 se arma sólo con un toque del dueño: ver la decisión de esa fecha más abajo—. La
      advertencia de abajo **no se borra**: su razonamiento sigue siendo válido y la resolución está
      escrita debajo de ella.
      - **Qué forma tiene** (cerrada por el UI-SPEC de la Phase 2, §13 y O-3 — no se reabre): un
        **aviso** —efímero hasta el 2026-10-28; desde la decisión del dueño de esa fecha se queda hasta
        el próximo toque—, elemento **propio del componente de la barra** anclado 8px arriba de ella,
        **sin modal y sin botones**. No es un toast de `sonner`: se descartó midiendo que el
        `<Toaster>` del proyecto es `top-center` y global (lejos del pulgar, y no se puede mover sin
        afectar al landing y a `/[slug]`).
      - **La regla de la constante única, en su forma del 2026-10-28.** El **espíritu no cambió**: lo
        que el dueño **ve** y lo que el código **acepta** no se pueden separar —dos fuentes producen un
        bug **invisible** en los dos sentidos (sale sin avisar, o el dueño aprieta y no pasa nada) y ni
        `tsc` ni la suite lo ven—. La **forma sí**: ya no hay ventana de tiempo que sincronizar, porque
        la constante de 2000 ms (`PANEL_EXIT_HINT_MS`) y su temporizador se **borraron** el 2026-10-28
        (plan `03-13`). El invariante nuevo, con sus palabras: **aviso visible ⇒ el próximo atrás
        sale**, con **un** lugar que lo levanta (el atrás absorbido), **un** lugar que lo baja (el toque
        que re-arma) y **cero** temporizadores en el ciclo, medidos por gates de igualdad.
      - **El costo que el dueño aceptó con los ojos abiertos:** **dos toques de atrás siempre** para
        salir del panel desde Inicio —y, desde el 2026-10-28, que entrar directo a Inicio (pestaña
        nueva, recarga, abrir el link) y apretar atrás sin tocar nada sale sin aviso: es la regla del
        navegador y no tiene arreglo—, y que la condición que haría natural este patrón —una app
        instalada— **no existe hoy** (T-10: cero `manifest`, cero usos de `display-mode`).
      - **Alcance (D-05):** vale **también en escritorio**, **sin gate de viewport**. Ver la enmienda
        de MOB-07.

      ⚠ **DECIDIDO el 2026-10-15 por el dueño, durante la ronda 1 de la UAT de la Phase 3 — la
      `decision (a)`** (registrada en
      `phases/03-la-pol-tica-de-atr-s-de-un-nivel-a-dos/03-DECISION-UAT.md`; gobierna los gaps G-4, G-5
      y G-6):

      - **Qué se decidió:** el sentinel de salida se arma **sólo si no hay nada nuestro debajo**, así
        que el aviso aparece **únicamente cuando el atrás de verdad saca del panel**. Implementado en el
        plan `03-06` como la **sexta** regla del armado —y va **última** de las seis a propósito: las
        cinco anteriores son de **seguridad** y ésta es de **política**, así que puesta última nunca lee
        la marca de la rama estando parados sobre el sentinel, donde ese dato no significa nada. Medido
        en el escenario **E-10** de la sonda (las dos mitades de (a)).
      - **Qué resuelve:** parado en **Inicio con historia debajo**, MOB-04 (`Más → Inicio → atrás`
        vuelve a **Más**) y MOB-05 (en Inicio el atrás avisa antes de salir) **no pueden ser verdad a la
        vez**. Es el **bloque H** de la ronda 1, el único recorrido que falló por diseño y no por
        defecto (**G-4**: *"salta el aviso para salir"*). La decisión los **reconcilia respetando
        MOB-04**.
      - **La alternativa que quedó afuera, y por qué se desechó:** la **(b)** — que el sentinel
        **mandara siempre en Inicio**. Era más simple y más predecible, pero **cambiaba lo que MOB-04
        prometía** y dejaba el aviso **apareciendo cuando el dueño no iba a salir**.
      - **El límite aceptado:** si lo que quedó debajo de Inicio es una **entrada ajena** —otro sitio,
        no una pantalla nuestra— **no hay forma confiable de saberlo** (`history.length` cuenta también
        las entradas de **adelante**), así que el aviso **va a aparecer igual** y el segundo atrás va a
        salir sin más. Queda **declarado y aceptado**, con el mismo criterio con el que v0.30 aceptó el
        caso de **entrada directa** (medido en **E-7**). Anotado en `.planning/WINDOWS.md`.
      - ⚠ **La etiqueta `decision (a)` va sin tilde a propósito** (igual que `cero regresion` debajo de
        MOB-06): los gates de esta fase **cuentan esos dos literales**, y en este entorno las clases de
        caracteres de `grep` son de **bytes** —`LANG` viene vacío—, así que sobre texto acentuado miden
        **cero**. Acentuarlas deja los gates verdes **sin medir nada**.

      ⚠ **LO QUE LA REGLA DE `G2-1` LE CAMBIA A ESTE RECORRIDO, DECLARADO EL 2026-10-27 — ANTES de que
      aparezca en el teléfono** (decisión del dueño en
      `phases/03-la-pol-tica-de-atr-s-de-un-nivel-a-dos/03-DECISION-UAT-2.md`):

      - **`Más → tocar Inicio → atrás` YA NO VUELVE A MÁS.** Tocar Inicio desde Más es ahora el
        **retroceso** que **consume** la entrada de Más ⇒ el dueño queda en Inicio **sin nada nuestro
        debajo** ⇒ el sentinel **se arma** y el atrás **avisa para salir**. Medido en **E-15** mitad A
        (la marca dice la raíz ⇒ `up`, aterrizaje sin marca, armado en `armar`).
      - **La `decision (a)` NO cambió:** sigue siendo *el sentinel se arma sólo si no hay nada nuestro
        debajo*, con sus siete reglas intactas. Lo que cambió es la **pila** que esa regla lee.
      - **MOB-04 por el lado del GESTO DE ATRÁS tampoco cambió:** desde Más el atrás sigue cayendo en
        **Inicio**. Lo que se retira es que ese atrás vuelva a **Más** cuando se llegó a Inicio
        tocándolo.
      - **Es, además, exactamente lo que el dueño pidió en `G2-1`:** *«parado en Inicio, el primer
        atrás avisa y no sale»*. El costo quedó declarado por él mismo el 2026-10-27, eligiendo
        **avisar para salir** y aceptando que ese recorrido pierde lo que MOB-04 prometía.

      ⚠ **PROHIBIDO tratarlo como bug o como regresión de MOB-04 cuando aparezca en la ronda 3.** Es
      una consecuencia **declarada** de la regla nueva, no un defecto: está escrita acá con fecha y
      re-expresada en el guion de la ronda 3 (`03-UAT-GUION-3.md`, bloque 2).

      ⚠ **DECIDIDO el 2026-10-28 por el dueño, durante la ronda 3 — armar sólo con activación del
      usuario (`camino 1`)** (registrada en
      `phases/03-la-pol-tica-de-atr-s-de-un-nivel-a-dos/03-DECISION-UAT-3.md`; implementada en el plan
      `03-13`; gobierna los gaps `G3-2` y `G3-3`):

      - **Qué se decidió:** (1) el sentinel de salida se empuja **sólo cuando hay activación del
        usuario**: si al llegar a Inicio ya la hay (se llegó tocando la barra, el 1.1), se arma como
        siempre; si no, el armado queda **pendiente** y lo dispara el primer toque o tecla del dueño en
        Inicio. (2) El aviso **deja de vencer solo**: se queda visible **hasta que el dueño toca la
        pantalla**, y ese toque lo baja y re-arma con activación. Así lo que se ve coincide siempre con
        lo que pasa: **aviso visible ⇔ el próximo atrás sale.**
      - **Por qué:** el plan `03-12` midió en la app real, con el atrás **de la interfaz** del
        navegador, que la **intervención de historial** de Chrome **saltea** una entrada empujada **sin
        activación del usuario** —con `holding=true` y sin que llegue ningún `popstate`—. El sentinel se
        empujaba así al montar (`G3-3`) y desde el temporizador (`G3-2`). Ningún cambio en *cómo se
        absorbe* alcanza a una entrada que el navegador nunca visita.
      - **El costo, declarado ANTES de que el dueño lo vea en el teléfono:**
        1. **Entrar directo a Inicio** —pestaña nueva, recarga, abrir el link— y apretar atrás **sin
           tocar nada** sale sin aviso. Es la regla del navegador y no tiene arreglo.
        2. ⚠ **Llegar a Inicio con el atrás del navegador** desde una sección tampoco es un toque, así
           que el atrás siguiente sale sin aviso salvo que el dueño toque, o que haya tocado algo hace
           menos de la ventana de activación del navegador (~5 s en Chromium). **Es una consecuencia de
           la misma regla que la decisión no lista**: está acá para que no se descubra en la ronda.
        3. Un toque que **un link se lleva** (tocar un destino de la barra, un `<Link>`) **no arma**:
           empujar y navegar en el mismo gesto enterraría el sentinel bajo la sección nueva o lo
           pisaría el reemplazo del router. Ese toque **sí** baja el aviso; arma el siguiente.
        4. El atrás que **sólo bajaba el teclado** en Inicio deja el armado **pendiente** hasta el
           próximo toque (un atrás no es una activación).
        Ninguno es una regresión en Chrome: esos empujes ya se hacían sin activación, el navegador los
        salteaba igual y la URL mostraba un hash que **mentía**. La recarga ×3 del 1.3 **pasó** en la
        sonda de la app en sus dos variantes (sin tocar y con un toque después de recargar), así que no
        aplicó ninguna rama de costo de la recarga.
      - **El arreglo de la recarga**, por la **opción (A)** del veredicto y sin decisión nueva: la
        recarga preserva el `frjExit` de una instancia **muerta**, la séptima regla declinaba sin
        acreditar y el `popstate` siguiente se ignoraba. Ahora la rama `none` del armado **acredita**
        con `panelExitStillHolding`, con la definición de **otro dueño corregida contra el código**:
        otro dueño es *ajena **y sin** marca de salida* (un overlay o el guard de cambios sin guardar),
        porque el predicado de la regla 0 (`isForeignOwnedEntry`) reconoce la marca de salida de
        **cualquier** instancia y usado a secas habría rechazado justo la entrada de la recarga.
      - **Lo que NO cambió:** las siete reglas de `panelExitArmAction` y las cinco de
        `panelExitPopAction`; la `decision (a)` y su límite aceptado (la entrada ajena debajo, E-7);
        Inicio como raíz (`03-DECISION-UAT-2.md`); y los tres no-defectos del bloque 2 del guion.
      - **La calibración del navegador** (sonda de la app, `C-activacion`) dio la rama **(b)**: un
        empuje a los 7 s de un click real **no** quedó salteable con `isActive` ya en falso, así que el
        gate es **más estricto** que el navegador —deja pendientes donde un empuje habría servido—, que
        es la dirección segura.

      ⚠ **PROHIBIDO tratar como regresión** las expectativas nuevas de esta decisión: el **1.3** sin
      tocar sale sin aviso (y sin hash); el **3.1** deja el aviso hasta un toque y el atrás siguiente
      vuelve a avisar; y el **1.4** y el **1.5** se comportan como el guion de la ronda 3 los declara.
- [x] **MOB-06**: Nada de esto rompe lo que ya está verificado en celular: el atrás sigue cerrando
      overlays, selectores y el calendario antes que navegar, y el aviso de cambios sin guardar sigue
      frenando la salida.

      ✅ **HECHO NUEVO, medido el 2026-10-15 en la ronda 1 de la UAT: `cero regresion` YA ESTÁ
      VERIFICADO EN ANDROID.** El **bloque E** del guion —los ítems **10, 11, 12 y 13**: overlay,
      selector de hora, calendario y **teclado**, o sea los **cuatro quicks de octubre**— **se corrió y
      pasó**, marcado `[OK]` a mano por el dueño mientras probaba
      (`phases/03-la-pol-tica-de-atr-s-de-un-nivel-a-dos/03-04-SUMMARY.md`, commit `7c756a5`). El bloque
      **F** (cambios sin guardar: 14, 16, 17) también pasó.

      ⚠ **Por eso lo que le falta a MOB-06 NO es Android: es iPhone (A11).** Está escrito con estas
      palabras a propósito, porque es lo que explica que la **ronda 2 no re-corra ese bloque en
      Android**: pedirle al dueño repetir 21 recorridos para encontrar cinco arreglos es cómo una UAT
      deja de correrse. En Safari **nada** de esta fase se verificó —todo lo medido en este repo sobre el
      retroceso fue Chrome sin pantalla— y el atrás de iOS es un **gesto de borde**, no un botón.
      Los ítems 10-13 **sí vuelven** en la ronda 2, pero por otro motivo y medido: el plan `03-07` les
      cambió el camino (cerrar un overlay produce ahora un **retroceso ignorado**, que es justo donde
      entra el cuarto momento de reintento).

#### Por qué los tres siguen SIN marcar, y el motivo de cada uno es distinto

**La evidencia que marca estos tres es la UAT en celular real** —no el código escrito, ni la suite
verde, ni la sonda en cero—. ⚠ **Actualizado el 2026-10-27: lo que los marca ahora es la ronda 3**
(`phases/03-la-pol-tica-de-atr-s-de-un-nivel-a-dos/03-UAT-GUION-3.md`), no la ronda 2.

**Qué pasó con la ronda 2, porque es el motivo del cambio:** se corrió el 2026-10-27 en Android y
quedó **interrumpida a propósito** en el ítem 19. Corrieron **cuatro** recorridos —**7**, **8** y
**15** pasaron (eran G-1, G-2 y G-3) y **19 falló** ⇒ gap **`G2-1`**—. Los otros **seis** ítems del
guion quedaron **sin correr** porque la regla del plan `03-09` **cambia la pila**: correrlos antes
habría medido el comportamiento viejo. Cada uno de los diez ítems quedó con su resultado anotado en
`03-UAT-GUION-2.md`.

⚠ **Actualizado el 2026-10-28:** la **ronda 3 se re-corre DESDE EL PRINCIPIO** y no desde el recorrido
1.2. El motivo es el mismo por el que la ronda 2 quedó interrumpida a propósito: el arreglo del gap
**`G3-1`** (plan `03-11`) **cambia la forma de la pila**, así que un recorrido medido contra la forma
vieja mide otra cosa. Son los **ocho** recorridos de Android (bloques 1 a 4) más los **21** de iPhone
(bloque 6), tal como el guion ya los tiene.

| Requisito | Qué le falta | Se marca si |
|---|---|---|
| **MOB-04** | El gap **`G2-1`** (el ítem 19, que falló) arreglado en el plan `03-09` y el gap **`G3-1`** (el recorrido **1.1** de la ronda 3, que falló) arreglado en el plan `03-11`, los dos **sin verificar en el teléfono**; los ítems cuya **expectativa cambió** con las dos reglas nuevas; y el **pase de iPhone (A11)** | pasan los bloques 1 a 4 **y** el bloque 6 del guion de la ronda 3, **re-corrida desde el principio** |
| **MOB-05** | Lo mismo, y es **suyo** por los dos lados: los fallos **19** y **1.1** son del aviso que no se armaba llegando a Inicio desde una sección, y la **consecuencia declarada** (`Más → tocar Inicio → atrás` ahora avisa) es de su decisión; y `G3-2` y `G3-3` (2026-10-28) arreglados por la decisión del dueño (`camino 1`) y sin verificar en el teléfono | pasan los bloques 1 a 4 **y** el bloque 6 del guion de la ronda 3, **re-corrida desde el principio** |
| **MOB-06** | **Sólo iPhone (A11)** — su parte de Android ya está afirmada arriba (`cero regresion`, bloque E de la ronda 1) — más la **parte de overlay del ítem 20**, que nunca se midió en ninguna ronda (*"no tengo overlays en inicio como para probar eso"*) | pasa el bloque **6**, más la parte de overlay del bloque 3 |

Si la ronda 3 falla, los tres **vuelven a quedar sin marcar** y los fallos nuevos entran como gaps de
una tanda nueva.

### Lo que no se toca

- [x] **MOB-07**: En desktop **no cambia nada** (D-02).

      ⚠ **ENMENDADO el 2026-10-14 por D-05 de la Phase 3.** Este requisito está marcado **Complete**
      desde la Phase 2 y **la Phase 3 lo acota a propósito**. La enmienda, en tres frases:

      1. **La política de navegación NO cambia en escritorio.** El sidebar cae en las mismas ramas de
         siempre, **por construcción** y sin ningún chequeo de viewport: la decisión de la rama
         pregunta *"¿la marca dice Más?"*, y en escritorio nada navega a `/mas`, así que el hecho es
         siempre falso. Verificado: el recorrido del sidebar da exactamente lo de hoy.
      2. **SÍ cambia el costo de salir del panel**, porque el aviso de MOB-05 vale también ahí: el
         primer atrás en Inicio avisa en vez de salir, en celular **y** en computadora.
      3. **Por qué no se gateó:** el componente de la barra se oculta por **CSS** (`lg:hidden`), así
         que **se monta y sus efectos corren igual** en escritorio — la pregunta nunca fue si agregarlo
         sino si gatearlo. Y la alternativa de ocultar sólo el aviso dejando la absorción viva sería un
         **atrás muerto** (el gesto no hace nada y no dice por qué), que es el peor resultado posible y
         que los propios módulos de historial del repo declaran *peor que el bug*. El aviso se ancla
         **centrado sobre la columna de contenido** cuando la barra no está, que es el caso que §13 no
         contemplaba.

      ⚠ **Esto NO toca el criterio 6 del ROADMAP, y la distinción queda escrita para que el revisor no
      lea D-05 como una violación.** El **criterio 6** dice que *la política de dos niveles* se exprese
      sobre rutas (o sobre la marca de la entrada) y caiga en las mismas ramas en escritorio **por
      construcción** — y eso **se cumple igual**, es el punto 1 de arriba. Lo que cambia en escritorio
      es el **mecanismo de MOB-05**, que es otra cosa.

### Heredado de v0.30

- [ ] **MOB-08** (ex **NAV-03**): Los tabs de `/negocio` y `/settings` viven en la URL: el atrás vuelve
      al tab anterior y el tab se puede compartir y recargar.
- [ ] **MOB-09** (ex **NAV-04**): Ídem los de `/finances`, y el botón de alta sigue correspondiendo al
      tab visible.

⚠ **Vinieron de la Phase 2 de v0.30, sin ejecutar.** Se difirieron **a propósito**: la política de
atrás pasa de **un nivel** a **dos** con este rediseño, y escribir los tabs contra la política vieja
era trabajo para rehacer. Su análisis ya está hecho —incluidas las trampas T-1 y T-2 de
`REQUIREMENTS.md` (los 5 rutas que comparten `settings-client.tsx`, y el `replaceState` del retorno del
OAuth que borraría el tab de la URL)— y sigue siendo válido.

## ⚠ Advertencia sobre MOB-05, para decidir con los ojos abiertos

Retener el atrás cuando **no hay nada que perder** es intrusivo en una pestaña de navegador, y es el
patrón que los navegadores vienen limitando a propósito: el `popstate` del atrás del usuario llega
`cancelable: false` por diseño del estándar (medido en
`.planning/debug/interceptar-atras-aviso-sin-guardar.md`). **No se puede cancelar: sólo absorber**, y
absorber en Inicio significa que el dueño tiene que apretar atrás dos veces para salir **siempre**.

Donde este patrón es natural y esperado es en una **app instalada (PWA)**. Si el panel no se instala,
MOB-05 puede terminar molestando más de lo que ayuda. **El diseño tiene que resolver esto
explícitamente**, no asumirlo.

### ✅ Cómo se resolvió (2026-10-14)

La advertencia de arriba **queda en su lugar a propósito**: su razonamiento es correcto y es lo que
obligó a decidir en vez de asumir. Lo que faltaba era la conclusión, y es ésta.

**El dueño decidió implementarlo** (D-01 de la Phase 3), sabiendo las dos cosas que la advertencia
nombra: que el patrón **no** tiene hoy su condición habilitante —el panel no es instalable— y que el
costo es **dos toques de atrás siempre** para salir desde Inicio. No se gateó por `display-mode:
standalone` porque eso daría **siempre false** (T-10 / M-8), o sea un requisito que no hace nada.

Lo que **sí** acota el costo es la forma, y por eso §13 la cerró así: el aviso es **efímero** —aparece
y se va solo— y la ventana en la que el segundo atrás vale es **el mismo valor** que su duración
visible, así que el dueño nunca queda frente a un modal ni tiene que apretar un botón para salir.
Salir cuesta exactamente **un** atrás más, y nunca aparecen dos avisos encadenados.

**Lo que esto NO resuelve, y queda declarado** (registrado como imprecisión aceptada #12 en
`.planning/WINDOWS.md`): el sentinel se arma estando en la raíz **haya o no haya historia debajo**. Si
debajo de Inicio quedó una sección (`Inicio → Turnos → Inicio`, que la política empuja en los dos
sentidos), el segundo atrás **no sale del panel**: vuelve a Turnos, y el copy del aviso queda
optimista. No se arregla porque no hay forma confiable de preguntarle al navegador *"¿hay algo
debajo?"* (`history.length` cuenta también el forward). El gesto **sigue haciendo algo visible** en los
dos casos, que es el invariante que importa. **La UAT tiene que poder distinguir esto de un bug.**

## Fuera de alcance

| Qué | Por qué |
|---|---|
| El sidebar de desktop | D-02 |
| Convertir el panel en PWA instalable | Es otra decisión, aunque MOB-05 la haga atractiva |
| Rediseñar las pantallas en sí | Esto es navegación, no contenido |
| — | — |
| Migraciones | Nada de esto toca datos. ⚠ **CORREGIDO: la próxima libre es la 080** (la última aplicada es `079_service_categories_name_normalized.sql`), no la 042 como decía este documento |

## Traceability

> Asignado por `ROADMAP-v031.md` (2026-10-06). Fases **2-4** del workstream `panel-nav`
> (continúan desde la Phase 2 de v0.30, que quedó sin ejecutar).

| Requisito | Fase | Estado |
|---|---|---|
| MOB-01 | Phase 2 — La barra inferior y Más | Complete (2026-10-09) |
| MOB-02 | Phase 2 — La barra inferior y Más | Complete (2026-10-09) |
| MOB-03 | Phase 2 — La barra inferior y Más | Complete (2026-10-09) |
| MOB-04 | Phase 3 — La política de atrás, de un nivel a dos | Complete (2026-11-16) — dos niveles verificados en Android (ronda 3, 2026-10-29) e iPhone (bloque 6, 2026-10-29; re-prueba 2026-11-16). Cierre: `03-VERIFICATION.md` passed 6/6, `03-SECURITY.md` threats_open 0, `03-UAT-CIERRE.md` 10/10 (2026-11-16). Historia de las rondas: `03-UAT.md`, `03-UAT-2.md` |
| MOB-05 | Phase 3 — La política de atrás, de un nivel a dos | Complete (2026-11-16) — implementado con el `camino 1` (decisión del dueño 2026-10-28: el aviso se arma con activación y se queda hasta un toque); costos declarados en `03-DECISION-UAT-3.md`, incl. `G3-10` (2026-11-16). Cierre: `03-VERIFICATION.md` passed 6/6, `03-SECURITY.md` threats_open 0, `03-UAT-CIERRE.md` 10/10 (2026-11-16). |
| MOB-06 | Phase 3 — La política de atrás, de un nivel a dos | Complete (2026-11-16) — cero regresión: overlays/selectores/calendario/teclado (ronda 1 bloque E + 3.2) y el aviso de cambios sin guardar (ronda 2 ítem 15), en Android e iPhone. Cierre: `03-VERIFICATION.md` passed 6/6, `03-SECURITY.md` threats_open 0, `03-UAT-CIERRE.md` 10/10 (2026-11-16). |
| MOB-07 | Phase 2 — La barra inferior y Más | Complete (2026-10-09) — ⚠ **con enmienda** del 2026-10-14 por D-05: ver la nota debajo del requisito. La política de navegación no cambia en escritorio (criterio 6 intacto); **sí** cambia el costo de salir del panel |
| MOB-08 | Phase 4 — Los tabs profundos sobre la política ya fijada | Pending |
| MOB-09 | Phase 4 — Los tabs profundos sobre la política ya fijada | Pending |

**Coverage:** 9 requisitos · mapeados a fases: **9/9** · sin mapear: 0 · duplicados: 0

⚠ **Corrección de dato medida el 2026-10-06:** la tabla "Fuera de alcance" dice que la próxima
migración libre es la **042**. Es falso: la última aplicada es la **079**
(`supabase/migrations/079_service_categories_name_normalized.sql`), así que la próxima libre es la
**080**. No afecta este milestone (cero migraciones), pero conviene no arrastrar el dato.
