---
created: 2026-09-11T00:00:00.000Z
title: "El eje staff no tiene backstop server-side: se puede reservar un servicio que nadie hace"
area: security
severity: media
source: secure-phase de la Phase 20 (v0.28) — riesgo aceptado AR-20-04 / T-20-07; WR-01 del code review
files:
  - lib/booking-core.ts
  - app/api/booking/create/route.ts
  - lib/staff-services.ts
  - app/[slug]/booking-client.tsx
---

## Qué pasa

`POST /api/booking/create` **no valida en ningún momento que el servicio pedido tenga un profesional
que lo haga**. Se puede reservar —y, si el negocio pide seña, pagarla— un servicio que nadie está
mapeado para cumplir.

Medido con grep sobre `lib/booking-core.ts` y `app/api/booking/create/route.ts`:
`professional_services|isServiceStaffed|professionalsForService|bookableServices` → **cero matches**.
`booking-core.ts:275-284` valida solo que el profesional **pertenezca al tenant**, no que cubra el
servicio.

## Por qué recién ahora

**No lo introdujo la Phase 20.** El agujero es preexistente: el `create` nunca tuvo este chequeo.

Lo que cambió es que **dejó de haber cualquier otra capa**. Hasta la Phase 20, `app/[slug]/page.tsx`
pre-filtraba el catálogo con `bookableServices` y el servicio sin staff ni siquiera se renderizaba.
La D-05 de esta fase lo reemplazó a propósito por *deshabilitar con el motivo a la vista* —mejor UX,
y correcto— pero eso vive en el cliente. Resultado: el eje staff es hoy **el único eje del flujo de
booking sin autoridad server-side**.

El contraste es directo: el eje **franja** sí la tiene desde la Phase 18 —
`create/route.ts:227` pasa `enforceServiceWindow: true` → `booking-core.ts:218-264` rechaza con 400
`service_not_scheduled`. El eje **staff** no tiene su espejo.

## Por qué se aceptó en vez de arreglarlo ahí

El `accept` de T-20-04/T-20-07 se sostiene y se verificó, no se asumió: el pre-filtro del RSC
**solo achicaba el array renderizado** y no cambiaba el conjunto de POSTs que el server acepta. Los
UUID de servicio ya eran enumerables por `public_services` (vista DEFINER con `GRANT SELECT` a
`anon`, predicado `WHERE active = true`) antes y después. O sea: el estado previo a la fase **no
impedía nada que un POST forjado no pudiera hacer igual**. La fase no amplió la exposición, y
arreglarlo dentro de AGENDA-07 habría sido ampliar el alcance.

## El fix propuesto

Un `enforceServiceStaffed` espejo de `enforceServiceWindow`, con el mismo molde:

- flag opcional en las opciones de `createBooking` (`lib/booking-core.ts`), default `false` para no
  tocar el alta manual del panel;
- `app/api/booking/create/route.ts` lo pasa en `true` (igual que ya hace con `enforceServiceWindow`);
- la regla sale de `lib/staff-services.ts` (`isServiceStaffed`), **no** se reimplementa inline — mismo
  principio que AGENDA-02 aplicado al eje staff;
- nuevo código de error `service_not_staffed` (400), snake_case, con su copy en el cliente.

⚠ **Cuidado con el modo sentinel y con el comodín.** `isServiceStaffed` devuelve `true` cuando no hay
profesionales nombrados (0 profesionales activos) y cuando no hay filas mapeadas. Esa es la regla
correcta y hay que respetarla tal cual: un backstop que trate "sin mapeo" como "nadie lo hace"
**rompería a todo negocio que no configuró staff**, que son la mayoría. Es exactamente la clase de
inversión vacío⇒nada que ya mordió en CR-01 de esta misma fase.

⚠ **Y mirar el otro camino.** El bug hermano es el de T-20-07 en su forma original: un booking con un
profesional **específico** que no cubre el servicio elegido tampoco se re-valida. El mismo fix
debería cubrir los dos caminos (`professionalId` concreto y `any`).

## Trampa conocida al agregar el gate

Antes de tocar esto, leer la nota de `20-SECURITY.md` sobre cuál test sirve como evidencia:
`test/service-coverage-public.test.ts` lee las vistas públicas con **`t.admin` (service role)** pese a
decir que ejercita las vistas acotadas, así que seguiría verde con los permisos rotos. El que sirve
es `test/schedule-coverage-public.test.ts` (anon pelado, asierta cantidad de filas).
