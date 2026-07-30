---
phase: 12-cupo-por-solape-recurso-simult-neo
workstream: motor-reservas
audited: 2026-07-30
asvs_level: 2
threats_total: 18
threats_closed: 18
threats_open: 0
threats_accepted: 1
status: secured
block_on: report-only
---

# Phase 12 — Verificación de amenazas (secure-phase)

**Fase:** 12 — Cupo por solape / recurso simultáneo
**Cerradas:** 18/18 · **Abiertas:** 0/18 (T-12-11 cerrada el 2026-07-30 con control server-side)
**Nivel ASVS aplicado:** 2 (multi-tenant con superficie anónima)

## Advertencia de método: el registro de amenazas está DESFASADO

El `<threat_model>` se escribió contra el diseño de la **migración 062**. Después hubo dos rondas de
fixes (**063** y **064**) que cambiaron el esquema de locks de raíz. **Toda verdicto de abajo se
emitió contra el código VIGENTE** (`064` + `lib/` + `app/` + `test/`), no contra la prosa del plan.
Donde el mecanismo real difiere del declarado, se anota como *drift de mecanismo* y se juzga la
AMENAZA, no la redacción.

Deriva de mecanismo relevante:

| Declarado en el plan (062) | Vigente hoy (064) |
|---|---|
| Lock por modo: `group_class` = `hash(business+date+time)`; `simultaneous_resource` = `hash(business+service_id+date)` | **UN solo** `pg_advisory_xact_lock(hash(business_id + date))` en **los DOS modos** (`064:181-182`), seguido de los locks por espacio en orden ascendente (`064:250`, `064:274-276`) |
| Rango de migraciones 040..062 | 040..**064** |
| Gate cross-servicio sólo en la rama simultánea (063) | Gate cross-servicio (`064:325-338`) **+ gate ESPEJO acotado** en la rama grupal (`064:411-431`) |
| — | Rechazo explícito `simultaneous_space_conflict` para simultáneo cupo > 1 sobre agenda con espacio mapeado (`064:267-269`) |

**Estado de despliegue (crítico):** **062 y 063 están en producción; 064 NO.** Todas las amenazas
cuyo cierre depende de 064 están marcadas abajo — **en producción, hoy, T-12-01 y T-12-06 siguen
abiertas hasta que se aplique la 064 a mano** (+ `NOTIFY pgrst, 'reload schema';` + regenerar
`schema.sql`, que localmente ya refleja la 064: `supabase/schema.sql:154-155`, `:345`).

## Evidencia ejecutada (no sólo lectura de código)

| Comando | Resultado |
|---|---|
| `npm run test -- --no-file-parallelism test/concurrency.test.ts` | **20/20 verde** (incluye CUPO-04, CR2-01 concurrente, eje inverso, no-drift, gap 3) |
| `npm run test -- --no-file-parallelism` (suite completa) | **63 archivos / 790 pasados, 1 skipped, 0 fallos** |
| `./node_modules/.bin/tsc --noEmit` | exit 0 |

Que los tests específicos de la 064 (`CR2-01`, `eje inverso`, `gap 3`) pasen contra la DB local
prueba que **la 064 está aplicada en el Supabase local** — es la evidencia dura de T-12-18.

## Verificación por amenaza

### Cerradas

| ID | Categoría | Disp. | Evidencia (archivo:línea) |
|----|-----------|-------|---------------------------|
| T-12-01 | Tampering / DoS de integridad | mitigate | **CIERRA CON 064, NO EN PROD.** Lock único de negocio-día `064:181-182`; el count por solape corre bajo ese lock `064:350-364`; gate cross-servicio autoritativo `064:325-338`. Test de carrera `test/concurrency.test.ts:392-424` (CUPO-04, 3 escalonadas concurrentes sobre cupo 2 → 2 ok + 1 `slot_full`) y `:611-634` (CR2-01 cross-servicio escalonado concurrente → 1 fila). Verde en la corrida de hoy. Drift: la key ya no es `business+service_id+date`. |
| T-12-02 | Elevation / Info Disclosure | mitigate | `SELECT s.capacity_mode ... WHERE s.id = p_service_id AND s.business_id = p_business_id` en `064:144-148` (+ `COALESCE` fail-safe a `group_class` `064:149-150`). **Todos** los predicados nuevos re-imponen el tenant: gate cross-servicio `064:327`, count por solape `064:352`, count de asiento `064:375`, gate espejo `064:413` y su subquery a `services` `064:422-423`. Espejo en el core: `lib/booking-core.ts:108-116`. |
| T-12-03 | Tampering de integridad | mitigate | El asiento se evalúa por slot EXACTO (`a.date = p_date AND a.time = p_time`) también en la rama simultánea: `064:372-378`. Coincide byte a byte con el índice único 011 `041:65` (`business_id, COALESCE(professional_id, sentinel), date, time, seat`). Test `test/concurrency.test.ts:763-786` (3 concurrentes en bloque cupo 3 → seats distintos, sin 23505 espurio). |
| T-12-04 | Denial of Service (deadlock) | mitigate | Orden global fijo y **sin condicionales**: (1) lock de negocio-día, incondicional y primero `064:181-182`; (2) locks por espacio en orden ascendente garantizado por `array_agg(... ORDER BY asp.space_id)` `064:250` + `FOREACH` `064:274-276`. Tracé las ramas: no hay camino que invierta el orden ni que tome el lock de negocio-día después del de espacio. Una transacción = un RPC (la generación forward de abonos itera en JS). Cero `40P01` en 790 tests, incluidos 5 casos concurrentes. Drift: ya no hay dos clases de lock que ordenar. |
| T-12-05 | Tampering | mitigate | CHECK del enum `062:55-66` (`capacity_mode IN ('group_class','simultaneous_resource')`) y CHECK del cupo `062:71-82` (`capacity >= 1`), ambos idempotentes. Reflejados en `supabase/schema.sql:969-970`. Fail-closed a nivel DB: el panel escribe con anon+RLS vía PostgREST, así que el CHECK no se puede saltear desde el cliente. Ver riesgo residual R-2 (sin tope superior). |
| T-12-06 | Tampering de integridad | mitigate | **CIERRA CON 064, NO EN PROD.** DEFAULT `'group_class'` en `062:49-50` / `schema.sql:967` ⇒ el 100 % de las filas existentes (incluidas canchas) mantiene su semántica sin backfill. La rama grupal de `064:433-461` es idéntica a `058:184-211` (capacity del bloque, count del slot exacto, seat, cupo 1 → seat 0). El gate espejo `064:411-431` **no** produce drift: exige además `a.is_group = true` **y** que el servicio de la fila preexistente esté hoy en `simultaneous_resource` (`064:420-425`) ⇒ nunca dispara en un negocio sin servicios simultáneos. Probado: `test/concurrency.test.ts:694-736` (cupo 1 sigue muriendo por EXCLUDE 013 / 23P01) y `:737-761` (dos servicios grupales distintos siguen entrando en un bloque de cupo N). Ver riesgo residual R-1. |
| T-12-07 | Information Disclosure | mitigate | `public_services` expone `capacity_mode` y **no** `capacity`: `062:93-111`, confirmado en el estado real `supabase/schema.sql:977-991`. El N de lugares sólo lo lee código server-role (`lib/booking-core.ts:110`, `app/api/booking/availability/route.ts:253`). |
| T-12-08 | Information Disclosure | mitigate | La rama simultánea del read-path colapsa a booleano por slot: `full` es la UNIÓN de carril lleno / agenda ocupada / espacio tomado / config imposible (`app/api/booking/availability/route.ts:330-338`) y devuelve `busy: []` (`:346`). Nunca viaja el conteo, los lugares restantes ni el motivo del bloqueo. Test negativo de fuga: `test/concurrency.test.ts:229` (CUPOS-02). |
| T-12-09 | Tampering | mitigate | `serviceId` re-validado por tenant antes de usarse, en las dos ramas que lo aceptan: `app/api/booking/availability/route.ts:251-257` (rama simultánea → `invalid_service` 400) y `:107-113` (rama "Cualquiera"). Escritura: `lib/booking-core.ts:108-116`. |
| T-12-10 | Tampering de integridad (LANDMINE) | mitigate | El early-return del core está gateado por modo y **no es ciego**: `lib/booking-core.ts:232` (`isSimultaneousResource`), `:240` (`takenByOtherService` — sólo el solape con OTRO servicio corta) y `:248` (`rejectEarly = isSimultaneousResource ? takenByOtherService : (taken && slotCapacity <= 1)`). Para `group_class` la expresión es literalmente la de antes ⇒ cero drift. Probado en las dos direcciones: `test/concurrency.test.ts:431-459` (la 2ª escalonada ENTRA) y `:498-540` (CR-02: el solape de otro servicio se rechaza). |
| **T-12-11** | Tampering | mitigate | **CERRADA 2026-07-30 (control server-side, opción 1).** La mitigación ya NO es la UI: el combo "Cualquiera" + `simultaneous_resource` se rechaza en el SERVIDOR, en las dos superficies, con un código propio `any_professional_unsupported` (400). **Write-path:** `lib/booking-core.ts:130-138` — el gate corre inmediatamente después de resolver/validar el servicio por `business_id` (`:114-125`) y **antes** de la rama `autoAssign` (`:141`), así que un POST forjado muere sin tocar el RPC; el tipo del error se declara en `:82-88`. **Route:** `app/api/booking/create/route.ts:175-177` ya propaga `{ ok:false, error: result.error }` con `result.status` ⇒ el código sale al público como 400, sin special-case. **Read-path:** `app/api/booking/availability/route.ts:107-122` — la rama `any` extiende su re-validación por tenant a `capacity_mode` y devuelve el MISMO código/400 antes de la agregación across-staff, así que el público nunca ve una grilla para una combinación que el create rechaza. **UI:** el gate D-13 (`app/[slug]/booking-client.tsx:129-133`) se mantiene como UX y el nuevo código degrada a un mensaje en español (`:378-384`). Tests: `test/booking-cualquiera-public.test.ts:307-345` (POST forjado → 400 + **cero filas** en la DB + el MISMO POST sobre `group_class` sigue entrando) y `:352-386` (availability `any=1` → 400, y A/B que prueba que la grilla `any` de `group_class` queda byte-idéntica). **Fallando antes / pasando después:** el archivo daba 5/7 con los dos casos nuevos en rojo (`expected 200 to be 400` — o sea: la reserva forjada ENTRABA) y da **7/7** con el fix. Suite completa: **63 archivos / 792 pasados / 1 skipped / 0 fallos**; `./node_modules/.bin/tsc --noEmit` exit 0. Sin migración: el cierre es 100 % TypeScript (062/063/064 intactas). |
| T-12-12 | Tampering de integridad | mitigate | `app/[slug]/canchas-booking-client.tsx` **no fue tocado en toda la fase**: `git log --name-only` sobre `app lib supabase test components` desde el inicio de la fase no lo lista. Canchas queda en `group_class` por el DEFAULT (`062:49-50`). `test/canchas-provision.test.ts` verde en la suite completa. |
| T-12-13 | Tampering | mitigate | Doble capa: CHECK de la 062 a nivel DB (`062:55-66`) + escritura acotada al tenant en `app/(dashboard)/settings/settings-client.tsx:579` (`.update(payload).eq('id', ...).eq('business_id', business.id)`), con normalización previa `:577` y `:110-112`. |
| T-12-14 | Elevation | mitigate | El panel usa el **browser client** (anon + RLS), nunca service-role: `settings-client.tsx:10` (`import { createClient } from '@/lib/supabase/client'`) y `:280`. Alta: `:513-514` (`business_id: business.id` explícito). Edición: `:579` (`.eq('business_id', business.id)`). Policy de respaldo: `supabase/schema.sql:1892` (`business member access ON public.services`). |
| T-12-16 | Tampering / DoS de integridad | mitigate | Los asserts son contra filas REALES leídas con `t.admin`, no contra los retornos del core: helper `occupantsCovering` `test/concurrency.test.ts:106-120` (usado en `:423`) y `occupantsOfBucketCovering` `:127-136` (usado en `:633`). Los comentarios `:382-388` y `:608-610` documentan el control negativo A/B (con el lock viejo el mismo test da sobrecupo). Corrida de hoy: 20/20. |
| T-12-17 | Tampering de integridad | mitigate | **Verificado ejecutando, no leyendo:** `npm run test -- --no-file-parallelism` → **63 archivos, 790 pasados / 1 skipped / 0 fallos** (incluye los 4 consumidores del RPC: booking público, alta manual, generación forward de abonos y canchas). `./node_modules/.bin/tsc --noEmit` exit 0. Los `abono-*` flaky del historial salieron verdes con la invocación limpia. |
| T-12-18 | Tampering | mitigate | La DB local **tiene la 064 aplicada**: los tests que sólo pueden pasar con la 064 (`CR2-01` `:611`, eje inverso `:645`, `gap 3` `:876`) pasan, y con la 063 fallarían por construcción. `supabase/schema.sql` fue regenerado sobre ese estado (`:154-155` lock de negocio-día, `:345` gate espejo). Drift: el rango es 040..**064**, no 040..062. |

### Riesgo aceptado

| ID | Categoría | Disp. | Justificación verificada |
|----|-----------|-------|--------------------------|
| T-12-15 | Information Disclosure | **accept** | El indicador de ocupación por solape vive **sólo** en la agenda autenticada: `app/(dashboard)/agenda/page.tsx:9-11` (`auth.getUser()` → `redirect('/login')`) y el dataset está filtrado por tenant en el server (`:41-46`). El cálculo es en memoria del cliente del panel (`agenda-client.tsx:490-522`) sobre datos que el dueño ya posee. El público sigue recibiendo únicamente el booleano por slot del read-path acotado (T-12-08). **Riesgo aceptado: el dueño ve la ocupación de su propio negocio — es su dato.** Sin cambios pendientes. |

### Abiertas

Ninguna. **T-12-11 era la única y se cerró el 2026-07-30** con la opción 1 (control server-side); su
verdicto vive ahora en la tabla de cerradas. Se deja el diagnóstico original como histórico:

**Estado previo (2026-07-30, antes del fix):** la mitigación declarada era *"el selector oculta
Cualquiera (D-13)"* — un control de UI, no un control de seguridad, sin equivalente server-side.
Buscado y NO encontrado en: `app/api/booking/create/route.ts:38` (`anyProfessional = body.anyProfessional === true`,
sin chequeo de `capacity_mode`), `:173` (se pasaba tal cual a `autoAssign`), `lib/booking-core.ts`
(con `autoAssign` se salteaba la resolución de profesional **y los re-checks JS enteros**),
`app/api/booking/availability/route.ts:104` (la rama `any=1` no miraba `capacity_mode`). El único gate
era `app/[slug]/booking-client.tsx:129-133`, evitable con un POST forjado.

**Impacto medido (por qué no fue BLOCKER):** forzar el combo **no permitía sobrecupo**. Con
`autoAssign`, la selección de candidato del RPC exige agenda totalmente libre en el intervalo
(`064:207-219`), el gate cross-servicio corre sobre el bucket elegido (`064:325-338`) y el cupo se
cuenta por solape contra `services.capacity` a través de todas las agendas (`064:350-364`). El
invariante de integridad se sostenía; lo que se degradaba era la **disponibilidad**: el recurso
simultáneo nunca ofrecía su 2º lugar por esa vía y devolvía `slot_taken` espurio (fail-closed).
El fix convierte esa degradación silenciosa en un rechazo explícito y distinguible.

## Riesgos residuales (documentados, fuera del registro)

No amplío el registro; los dejo trazados porque son gaps reales ya conocidos y aceptados por las
rondas de review.

- **R-1 — WR-04 (round 1): cambiar `capacity_mode` con turnos ya creados deja `is_group` desalineado.**
  `settings-client.tsx:566-585` permite el cambio sin restricción. Las filas viejas conservan el
  `is_group` del momento del insert. En el sentido `simultaneous → group_class` esas filas quedan
  `is_group = true` (fuera del EXCLUDE 013, `041:76`) y **el gate espejo de la 064 deja de cubrirlas**,
  porque exige que el servicio esté *hoy* en `simultaneous_resource` (`064:420-425`) ⇒ solapes
  permanentes que ningún gate vuelve a detectar. Reconocido explícitamente como fuera de alcance en
  `064:72-74`. **Es el residual de integridad más serio de la fase; merece fase propia**
  (backfill de `is_group` al cambiar de modo, o bloquear el cambio con turnos futuros).
- **R-2 — sin tope superior de `capacity`.** `normalizeCapacity` (`settings-client.tsx:110-112`) sólo
  aplica piso 1; el CHECK de la DB es `capacity >= 1` (`062:82`). Un valor absurdo dentro de
  `smallint` es autolesión del propio tenant (no cruza `business_id`) y por encima de 32767 la DB
  aborta con 22003 → toast genérico. Sin impacto cross-tenant.
- **R-3 — WR-02 (round 2): el `full` de la rama simultánea se enumera sólo sobre `time_blocks`.**
  `availability/route.ts:321-326`. Con un horario especial (`schedule_exceptions`) que extiende el
  día, esos start-times no se evalúan y quedan respaldados sólo por el RPC (`slot_full` / `slot_taken`
  al reservar). Degradación de UX con fail-closed en el write-path, no fuga.

## Banderas no registradas (`## Threat Flags` de los SUMMARY)

Ninguna sin mapear. `12-02-SUMMARY.md:127-129` (param `serviceId` en availability → cubierto por
T-12-09), `12-03-SUMMARY.md:151-153` (escritura de `capacity_mode`/`capacity` → T-12-13/T-12-14;
indicador de agenda → T-12-15) y `12-04-SUMMARY.md:142-144` (sólo tests) declaran cero superficie
nueva, y la verificación lo confirma: no hay endpoints, rutas de auth ni columnas fuera de las dos de
la 062.

**Salvedad de método:** los tres `## Threat Flags` se escribieron en el estado 062. La superficie
agregada después (código de error `simultaneous_space_conflict` en `lib/booking-core.ts:82`/`:332-333`
y su render en `app/(dashboard)/abonos/abonos-client.tsx:69`) **no** está declarada en ningún
`## Threat Flags`. No es un `unregistered_flag` con impacto: es un código de error de configuración
que no revela nada de otro tenant y cuya alternativa era un `slot_taken` mentiroso. Queda anotado.

## Condición de despliegue

La fase **no está segura en producción** hasta que se aplique la **migración 064** a mano
(prod hoy = 063), seguida de `NOTIFY pgrst, 'reload schema';`. Sin ella siguen abiertos en prod:

- el doble-booking cross-servicio escalonado bajo concurrencia (CR2-01 → T-12-01),
- el eje inverso sin gate espejo (T-12-06),
- la combinación simultáneo + espacio mapeado fallando como `slot_taken` mientras `availability`
  publica el horario libre (T-12-01 / T-12-08 en su versión de prod).

## Registro de auditoría

### 2026-07-30 — cierre de T-12-11 (control server-side)

- **Disposición:** T-12-11 pasa de `open` a **`mitigate` / CLOSED**. Registro: **18/18 cerradas**,
  **0 abiertas**, 1 aceptada (T-12-15, sin cambios). `status: secured`.
- **Opción tomada:** la 1 (cerrar con control server-side). Se descartó re-dispositar a `accept`: el
  combo forzado no rompe integridad, pero un control de UI no puede ser la mitigación registrada de
  una amenaza de tampering sobre una superficie anónima.
- **Alcance:** SOLO T-12-11. No se tocaron T-12-15 (riesgo aceptado) ni los residuales R-1/R-2/R-3
  — **R-1 sigue abierto a propósito** (merece fase propia).
- **Sin SQL:** el cierre es 100 % TypeScript. Las migraciones **062/063/064 no se tocaron** y **no se
  escribió ninguna migración nueva** (las tres ya están aplicadas en producción según el dueño de la
  fase, 2026-07-30 — dato que corrige la "Condición de despliegue" de arriba, redactada cuando la 064
  todavía no estaba en prod; la sección se deja como estaba por trazabilidad histórica).
- **Cambios:** `lib/booking-core.ts` (nuevo código `any_professional_unsupported` + gate previo a la
  rama `autoAssign`), `app/api/booking/availability/route.ts` (rama `any` mode-aware, mismo código),
  `app/[slug]/booking-client.tsx` (mensaje en español; el gate D-13 de UI se mantiene, marcado en el
  comentario como UX y NO como el control, para que nadie lo borre por "redundante"),
  `test/booking-cualquiera-public.test.ts` (2 casos nuevos).
- **Evidencia ejecutada:** `npx vitest run test/booking-cualquiera-public.test.ts --no-file-parallelism`
  → **5/7 antes** (los 2 casos nuevos en rojo con `expected 200 to be 400`: la request forjada entraba)
  → **7/7 después**. `npm run test -- --no-file-parallelism` → **63 archivos / 792 pasados / 1 skipped /
  0 fallos** (baseline previo: 790 pasados; +2 = los casos nuevos). `./node_modules/.bin/tsc --noEmit`
  → exit 0.
