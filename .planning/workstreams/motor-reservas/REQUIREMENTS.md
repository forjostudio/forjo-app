# Requisitos: v0.29 — El catálogo del booking

> Workstream `motor-reservas`. Milestone anterior: **v0.28 La agenda por servicio** (shipped 2026-09-14).
> Numeración de fases **continua**: arranca en la **Phase 22**.
> Decisiones de diseño: `.planning/notes/categorias-de-servicios.md` (explore del 2026-09-15).

## Contexto

Hoy el booking público muestra **todos los servicios en una grilla plana de dos columnas**. Una
peluquería con 12 servicios los tira en una lista sin jerarquía, y en desktop los nombres largos se
parten en dos líneas (`grid-cols-1 sm:grid-cols-2`, `booking-client.tsx:566`), mientras que en mobile
ya son tarjetas horizontales que se ven mejor.

v0.29 le da al negocio una forma de **organizar su catálogo**, y hace que esa organización llegue al
cliente. Es la contracara de v0.28: aquel milestone hizo que la franja declarara *qué* se da en ella;
éste hace que el catálogo declare *cómo se lee*.

## Decisiones tomadas antes de planificar

**LOCKED — no re-litigar en discuss-phase.** El porqué de cada una está en la nota del explore.

- **Categorías = tabla propia por negocio**, no texto libre en `services`: se eligió tabla para poder
  ordenarlas y renombrarlas sin tocar cada fila.
- **Títulos que agrupan, NO un paso del funnel.** El cliente sigue viendo todo en una pantalla; el
  booking no gana clicks. Un paso previo se lo agregaría a todos los negocios, incluido el de 3
  servicios, y obligaría a que las categorías tengan imagen y descripción propias.
- **Un servicio sin categoría NUNCA desaparece de la página pública.** Misma regla del comodín que
  `professional_services` (v0.25) y `time_block_services` (v0.28): la ausencia de dato significa
  "vale igual", nunca "no vale". El modo de falla contrario ya mordió dos veces en este repo
  (CR-01 de la Phase 20, y otra vez en la 21).
- **Sin toggle para elegir entre "Otros" y sueltos.** La diferencia es cosmética; el control no.
- **El modo de orden es por negocio**, no por categoría. Si se pide, se agrega sin re-migrar.
- **El orden manual siempre está guardado.** Alfabético o precio lo **pisan para mostrar**, no lo borran.
- **El patrón de reordenamiento se PORTA de `forjo-tiendas`, no se copia.** Allá está resuelto con
  cero dependencias: `draggable` nativo de HTML5 para desktop + botones ▲/▼ con `aria-label` para
  todo lo demás, y el orden se persiste renumerando la lista completa de hermanas. Las columnas de
  allá están en español y el esquema de RLS es otro.

## Requisitos

### Modelo y panel

- [ ] **CAT-01** — El dueño crea, renombra y borra categorías desde el panel. Dos categorías con el
  mismo nombre en un negocio se rechazan **en la base** y sin distinguir mayúsculas: `"Cortes"` y
  `"cortes"` no coexisten. (Molde: el índice único `(tienda_id, lower(nombre))` de tiendas.)
- [ ] **CAT-02** — El dueño asigna a cada servicio **una** categoría, o ninguna. Asignar no es
  obligatorio en ningún punto del flujo.
- [ ] **CAT-03** — El dueño ordena las categorías arrastrándolas **y** con botones ▲/▼. Las flechas
  no son un extra: son lo que hace que reordenar funcione en mobile y con teclado.
- [ ] **CAT-04** — El dueño elige cómo se ordenan las categorías (alfabético · personalizado) y cómo
  se ordenan los servicios dentro de cada una (alfabético · precio · personalizado). Vale para todo
  el negocio.
- [ ] **CAT-05** — Cuando el modo **no** es personalizado, los controles de reordenar **no se
  muestran**. Nunca hay un arrastre que no haga nada.
- [ ] **CAT-06** — El orden manual **sobrevive** a elegir alfabético o precio. Volver a personalizado
  devuelve el arreglo del dueño intacto.

### Booking público

- [ ] **CAT-07** — Un negocio **sin ninguna categoría creada** muestra sus servicios exactamente como
  hoy: sueltos, sin títulos. **Cero regresión, y por construcción**: es el estado de todos los
  negocios el día de la migración.
- [ ] **CAT-08** — Con al menos una categoría creada, el cliente ve los servicios **agrupados bajo
  títulos**, en el orden que el dueño definió. El funnel no gana pasos: sigue siendo elegir servicio
  → profesional → día → horario.
- [ ] **CAT-09** — Un servicio sin categoría **siempre se puede reservar**. Con categorías creadas
  aparece al final bajo **"Otros"**; nunca desaparece del catálogo público.
- [ ] **CAT-10** — En desktop las tarjetas de servicio son **horizontales a lo ancho**, el mismo
  formato que ya tienen en mobile. El nombre largo deja de partirse en dos líneas.
- [ ] **CAT-11** — El dueño escribe una **descripción corta** por servicio desde el panel, con
  **límite de 120 caracteres** y contador a la vista, y se muestra en la tarjeta del booking debajo
  del nombre. ⚠ La columna `services.description` **ya existe** y la tarjeta **ya la renderiza**
  recortada a dos líneas (`booking-client.tsx:610`, `line-clamp-2`): hoy es una columna muerta que
  sólo se puede escribir por SQL. Lo que falta es poder cargarla. El límite de 120 hace que lo que
  el dueño escribe coincida con lo que el `line-clamp` deja ver a 375px, en vez de recortarle sin
  avisar.

## Fuera de alcance

- **Subcategorías** (dos niveles). `forjo-tiendas` las tiene porque un negocio llegó a 10 categorías
  y 39 productos; una peluquería con 12 servicios no las necesita. Se suman después sin re-migrar.
- **Precio en la categoría.** No tiene: "por precio" ordena servicios, nunca categorías.
- **La categoría como paso del funnel.** Agregaría un click a todos los negocios.
- **Modo de orden por categoría.** Se decide por negocio.
- **Ocultar servicios con la categoría.** Para eso ya existe "desactivar", y mezclarlo haría que
  organizar el catálogo pudiera sacar algo de la venta sin que nadie lo pida.

## Traceability

| Req | Fase | Estado |
|-----|------|--------|
| CAT-01 | Phase 23 | Pendiente |
| CAT-02 | Phase 23 | Pendiente |
| CAT-03 | Phase 23 | Pendiente |
| CAT-04 | Phase 23 | Pendiente |
| CAT-05 | Phase 23 | Pendiente |
| CAT-06 | Phase 22 | Pendiente |
| CAT-07 | Phase 22 | Pendiente |
| CAT-08 | Phase 24 | Pendiente |
| CAT-09 | Phase 24 | Pendiente |
| CAT-10 | Phase 24 | Pendiente |
| CAT-11 | Phase 23 | Pendiente |

> **Las tres asignaciones que no son obvias.** (1) **CAT-06 y CAT-07 viven en la Phase 22** —la del
> modelo— porque las dos son propiedades **por construcción**, no pantallas: cero categorías ⇒ la
> lista plana de hoy sale de que `category_id` sea nullable, y el orden manual sobrevive al cambio
> de modo porque el modo sólo elige un comparador dentro de una función **pura**, que no escribe. Es
> el mismo reparto que en v0.28, donde AGENDA-01 y AGENDA-04 (la "cero regresión") se entregaron en
> la fase del modelo y no en la de la pantalla. (2) **CAT-11 va con el panel (Phase 23)**, aunque el
> requisito nombre la tarjeta del booking: su mitad pública **ya está en producción** —`public_services`
> expone `description` y la tarjeta la renderiza con `line-clamp-2`—, así que lo único que falta es un
> campo de formulario. (3) **CAT-08 y CAT-10 van juntos (Phase 24)** porque tocan el **mismo bloque de
> JSX** de `booking-client.tsx`: separarlos obligaría a editar ese archivo dos veces.

## Riesgo

**Bajo comparado con v0.28.** No toca `book_slot_atomic`, ni los constraints anti-doble-booking, ni
la disponibilidad. El write path nuevo es del dueño sobre sus propias categorías, y la lectura
pública es una agrupación de servicios que ya se leen hoy.

Las dos precauciones reales:

1. **La superficie pública se toca** (`booking-client.tsx`), que es lo que ve un anónimo. Toda
   categoría expuesta necesita el mismo tratamiento que tuvo el mapeo en v0.28: una **vista acotada**
   para `anon` en vez de abrir la tabla, como `public_professional_services` (migr. 059) y
   `public_time_block_services` (migr. 071 — la 072 es `public_views_read_only`). Leerlas antes de escribir la nueva.
2. **CAT-07 es la promesa que no se puede romper**: todos los negocios de producción tienen cero
   categorías el día de la migración, así que el camino sin categorías es el de TODOS los clientes
   actuales. Cualquier regresión ahí se lleva puesto el booking entero.

Migración: la **078** (prod está en 077).
