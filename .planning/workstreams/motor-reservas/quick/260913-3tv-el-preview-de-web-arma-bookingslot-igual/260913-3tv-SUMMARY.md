---
quick_id: 260913-3tv
phase: quick
plan: "01"
subsystem: landing-cms
status: complete
tags: [preview, booking, canchas, rls, multi-tenant, agenda-por-servicio]

requires:
  - "migr. 057 (professional_services tenant select)"
  - "migr. 071 (time_block_services tenant select + vista public_time_block_services)"
  - "migr. 043/044 (tupla cancha + vista public_canchas)"
provides:
  - "lib/preview-booking.ts — previewBookingInputs(): el único lugar del dashboard que reproduce lo que sirven las vistas acotadas del booking público"
  - "bookingSlot REQUERIDO en LandingRenderer: la unificación preview ↔ web pública pasa a ser invariante del typecheck"
affects:
  - "app/(dashboard)/web/page.tsx (2 lecturas nuevas por sesión + gateo por vertical)"
  - "app/(dashboard)/web/web-client.tsx (prop bookingSlot)"
  - "components/landing/landing-renderer.tsx (pierde su widget de reserva propio)"

tech-stack:
  added: []
  patterns:
    - "derivar una vista pública DEFINER desde la tabla base con la sesión del dueño, y pinchar la derivación contra la vista real con un test DB-backed de dos roles"
    - "prop requerida como mecanismo anti-divergencia: borrar el fallback para que el typecheck obligue a resolver el caso por vertical"

key-files:
  created:
    - lib/preview-booking.ts
    - test/preview-booking.test.ts
    - test/preview-booking-parity.test.ts
  modified:
    - app/(dashboard)/web/page.tsx
    - app/(dashboard)/web/web-client.tsx
    - components/landing/landing-renderer.tsx

decisions:
  - "Las dos puentes se leen de la TABLA BASE con la sesión del dueño (anon key + cookies, RLS) y NO de las vistas public_*: las vistas son DEFINER sin security_invoker, leerlas desde una superficie autenticada dejaría el aislamiento colgado sólo del filtro explícito"
  - "Las canchas se DERIVAN de professionals × services (ya fetcheadas) reusando canchasFromData: cero query nueva, cero vista DEFINER en el dashboard — y el desfase se cierra con un test de paridad, no con disciplina"
  - "bookingSlot pasa a requerido y el fallback del renderer se borra: sin eso el arreglo duraba hasta el próximo call site"
  - "El seed del test de paridad incluye una cancha ASIMÉTRICA (agenda activa, service apagado) porque sin ella el caso de canchas no podía fallar por la mitad s.active del JOIN"

metrics:
  duration: ~22min
  completed: 2026-09-13

actuals:
  tokens: 11964
  tasks: 3
  commits: 3
  plan_head_before: ace575708d181ce6585045b358249b0d60b77683
---

# Quick 260913-3tv: el preview de /web arma bookingSlot igual que la página pública — Summary

El preview del CMS y `/[slug]` ahora llegan al MISMO nodo de booking, con los mismos datos (las dos puentes de v0.28 incluidas) y el mismo gateo por vertical; el renderer ya no tiene un widget de reserva propio al que caerse, y `bookingSlot` requerido convierte la unificación en invariante del typecheck.

## Qué se hizo, tarea por tarea

### Task 1 — el preview arma su nodo de booking por el camino de la página pública (`e356176`)

TDD. Primero `test/preview-booking.test.ts` con los 6 casos de la proyección contra un stub deliberado que devolvía el catálogo crudo: **RED con 3 fallas de aserción de comportamiento** (servicios sin filtrar, staff sin filtrar, canchas vacías) — no un simple "módulo no existe". Después el módulo real, GREEN 6/6.

- **`lib/preview-booking.ts`** (nuevo, puro, sin React ni Supabase): `previewBookingInputs({ services, professionals })` → `{ services, professionals, canchas }`. Espeja `public_services` (`active = true`), `public_professionals` (`active = true AND service_id IS NULL`) y `public_canchas` (JOIN por `service_id` con las dos mitades activas, proyectando 5 columnas y **nunca** `service_id`). Las canchas se derivan reusando `canchasFromData(services, professionals, [])` — emparejamiento por `service_id`, nunca por nombre — y el filtro por `active` se aplica acá porque `canchasFromData` no lo hace.
- **`app/(dashboard)/web/page.tsx`**: dos lecturas nuevas dentro del `Promise.all` existente (`professional_services`, `time_block_services`), con el mismo cliente de sesión, columnas explícitas y `.eq('business_id', business.id)`; después del gate de `has_web_custom`, como las otras cinco. Luego `resolveVertical` + `previewBookingInputs` + `bookingNode` espejando `app/[slug]/page.tsx`: `CanchasBookingClient` en canchas, `BookingClient` en el resto.
- **`app/(dashboard)/web/web-client.tsx`**: `bookingSlot: ReactNode` en `Props`, reenviado verbatim al renderer. El client no decide nada sobre el booking.

Gates: 6/6 tests, tsc filtrado 0, 2 lecturas de puente presentes, 0 lecturas de vistas `public_*` en el dashboard, `bookingSlot` reenviado.

**Tracer feedback gate** (auto mode activo): se re-corrió el `<verify>` completo end-to-end antes de expandir. Verde → se continuó.

### Task 2 — pinchar la derivación contra la DB real (`8fd7677`)

`test/preview-booking-parity.test.ts`, DB-backed, con el marcador obligatorio del clasificador de carriles (`import { hasSupabaseCreds } from './env'` + `describe.skipIf`) para que caiga en el carril `db` serializado. Dos roles a propósito: **anon sin sesión** para las vistas públicas, **anon-key autenticado como el dueño** para las tablas base con RLS. Nunca `t.admin` para asertar (el service-role bypassa RLS y haría pasar el test con las policies mal).

1. Paridad de canchas: deep-equal de las 5 columnas contra `public_canchas`.
2. Paridad de servicios y staff por conjuntos de `id`, más el assert de que la agenda-cancha no es staff por ninguno de los dos caminos.
3. Las dos puentes LLEGAN con la sesión del dueño: cantidad de filas asertada antes de cualquier regla (un 0-filas silencioso por RLS es indistinguible del comodín), y misma respuesta de `isServiceScheduled` por los dos caminos.

**3 passed, 0 skipped** contra el Supabase local (verificado arriba con `supabase status`: DB + API levantados).

### Task 3 — borrar el camino paralelo (`d43a085`)

`components/landing/landing-renderer.tsx`: `bookingSlot` pasa a **requerido**, la rama alternativa del `case 'booking'` se borra (queda `<RsvStrip/>` + `{bookingSlot}` dentro de la misma caja negra, sin envoltorios nuevos), se van el import del widget genérico, la prop del mapeo staff↔servicios y el tipo que sólo ella usaba. Docblock de cabecera y comentario del `case` reescritos sin nombrar el módulo ni la expresión del fallback (los gates los cuentan).

`professionals` y `exceptions` quedan en `Props` pero dejan de desestructurarse, con la deuda anotada en el código y el call site nombrado.

Gates: tsc filtrado **0**, import del widget genérico 0, expresión de fallback 0, suite completa verde.

## Números finales

| Gate | Resultado |
|------|-----------|
| `npx vitest run` | **90 archivos / 1163 passed / 4 expected-fail / 1 skipped** (baseline: 88 / 1154 / 4 / 1) |
| `./node_modules/.bin/tsc --noEmit` filtrado de `^\.next/` | **0** (baseline 0) |
| `npm run lint` en los 6 archivos tocados | sin errores |
| Flake conocido de `abono-generation` caso 5b | **no apareció** en esta corrida |

El tsc filtrado en 0 **con `bookingSlot` requerido** es la prueba pedida de que la deleción del fallback es segura: los dos call sites (web pública y preview) quedaron cubiertos, y un tercero no compilaría sin resolver el vertical.

## Deviations from Plan

**1. [Rule 2 — funcionalidad crítica faltante] El test de paridad no podía fallar por la mitad `s.active` del JOIN de canchas**

- **Encontrado en:** Task 2, haciendo una verificación por mutación del pin (crítica 3 del brief: el test "debe poder fallar").
- **Problema:** el seed que pedía el plan tenía dos canchas — una entera activa y otra soft-deleteada con **las dos** mitades en `active = false`. Mutando `lib/preview-booking.ts` para borrar el chequeo de `c.service.active`, el caso 1 **seguía pasando**: la cancha apagada igual quedaba afuera por `professional.active`. El pin era tautológico en ese eje.
- **Fix:** se agregó una TERCERA cancha **asimétrica** (agenda activa, service apagado) — un estado alcanzable en producción, porque `setCanchaActive` hace dos UPDATE sin transacción. Re-verificado por mutación: ahora borrar el chequeo de `service.active` **rompe** el caso 1 (`expected [2 items] to deeply equal [1 item]`) y borrar el de `service_id IS NULL` rompe el caso 2.
- **Archivos:** `test/preview-booking-parity.test.ts`
- **Commit:** `8fd7677`

**2. [Rule 3 — bloqueante] `exceptions` quedaba sin consumidor igual que `professionals`**

- **Encontrado en:** Task 3.
- **Problema:** el plan sólo nombraba `professionals` como la prop que deja de desestructurarse, pero `exceptions` tenía exactamente el mismo único consumidor (el fallback borrado). Dejarla desestructurada habría dado un `no-unused-vars` de ESLint.
- **Fix:** `exceptions` también deja de desestructurarse y queda anotada en la misma nota de deuda, por el mismo motivo (sacarla del tipo obligaría a editar `app/[slug]/page.tsx`, fuera de alcance).
- **Archivos:** `components/landing/landing-renderer.tsx`
- **Commit:** `d43a085`

**3. [instrumentación, no código] El ledger de commits del plan estaba contaminado por el quick anterior**

- **Problema:** el nombre del ledger se deriva de `{phase}-{plan}` y **todo** quick de este repo es `phase=quick, plan=01`, así que el archivo `gsd-plan-head-before-quick-01` sobrevivía del quick `260912-pm1` con una base vieja (`5896e5b`). Medido contra esa base, `git rev-list --count` daba **15** commits en vez de 3, atribuyéndole a este quick el plan, la auditoría de milestone, la UAT de la Phase 21 y la migración 077.
- **Fix:** se recalculó la base real (`e356176^` = `ace5757`) y se escribió un ledger nuevo con el quick_id en el nombre (`gsd-plan-head-before-quick-260913-3tv`). `commits: 3` en el frontmatter es el número medido contra la base real, y `plan_head_before` la nombra para que `/gsd-verify-work` use el mismo instrumento.
- **Archivos:** ninguno del repo (sólo el `.git/` local).

## Threat Flags

Ninguno. El cambio es puramente de código: cero migración, cero vista, cero grant, cero policy, cero lectura anónima nueva. Las dos lecturas agregadas son a tablas base con el cliente de **sesión** (RLS activa) + `.eq('business_id', …)` sobre un `business` resuelto por `owner_id = auth.uid()`, y van **después** del gate de `has_web_custom`. El gate automatizado `grep -cE "from\('public_" = 0` deja asentado que el dashboard no introdujo ninguna lectura DEFINER en una superficie autenticada.

## Known Stubs

Ninguno. Lo que sí queda, **declarado en el plan y anotado en el código**, no es un stub sino una divergencia deliberada:

- Las props `services`/`professionals` que alimentan las **secciones** del landing y el editor de secciones siguen saliendo de las tablas base **sin** proyectar, así que un servicio inactivo sigue apareciendo en la sección "Servicios" del preview aunque la web pública no lo muestre. Filtrarlas cambiaría qué servicios puede elegir el dueño en el editor: decisión de producto, no fix de camino. Comentada en `app/(dashboard)/web/page.tsx`, en el punto donde las dos props se pasan.
- `professionals` y `exceptions` siguen en el tipo del renderer sin consumidor, para no tocar `app/[slug]/page.tsx`. Deuda trivial, anotada en el código con el call site nombrado.

## Pendiente de UAT (no se corrió)

El runner es `environment: 'node'`: no hay DOM, así que "el preview muestra el widget de canchas" **no se puede asertar renderizando**. Los 4 `human-check` de la Task 3 quedaron **sin correr** (auto mode los auto-aprueba) y se registraron en `.planning/WINDOWS.md` como `unrun-verify`. En el navegador, con el Supabase local y un negocio con el add-on:

1. En un negocio NO-canchas, desmapear todas las franjas de un servicio → en el preview de `/web` esa tarjeta debe verse deshabilitada con motivo, igual que en `/[slug]`.
2. Mapear un servicio a un solo profesional → el preview debe ofrecer ese staff y no todos.
3. En un negocio del vertical canchas → el preview debe mostrar el wizard de 3 pasos (Cancha → Fecha y hora → Tus datos), no el genérico.
4. Tipear en el editor → el widget de reserva no debe reiniciarse mientras se escribe (es el efecto esperado de que el nodo venga del payload RSC).

## Self-Check: PASSED

Archivos declarados: los 6 existen en disco. Commits declarados: `e356176`, `8fd7677`, `d43a085` presentes en `git log`.
