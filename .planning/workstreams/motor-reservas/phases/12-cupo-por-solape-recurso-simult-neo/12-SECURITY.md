---
phase: 12-cupo-por-solape-recurso-simult-neo
workstream: motor-reservas
audited: 2026-07-30
asvs_level: 2
threats_total: 18
threats_closed: 17
threats_open: 1
threats_accepted: 1
status: open_threats
block_on: report-only
---

# Phase 12 — Verificación de amenazas (secure-phase)

**Fase:** 12 — Cupo por solape / recurso simultáneo
**Cerradas:** 17/18 · **Abiertas:** 1/18 (T-12-11, no bloqueante por sí sola)
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

| ID | Categoría | Mitigación esperada | Qué se buscó y no está |
|----|-----------|---------------------|------------------------|
| **T-12-11** | Tampering | "el selector oculta *Cualquiera* (D-13)" | **La mitigación declarada es un control de UI, no un control de seguridad — y no existe ningún control server-side equivalente.** Buscado en: `app/api/booking/create/route.ts:38` (`anyProfessional = body.anyProfessional === true`, sin ningún chequeo de `capacity_mode`), `:173` (se pasa tal cual a `autoAssign`), `lib/booking-core.ts:123-124` (con `autoAssign` se saltea la resolución de profesional **y los re-checks JS enteros**, `:147`), `app/api/booking/availability/route.ts:104` (la rama `any=1` no mira `capacity_mode`). El único gate es `app/[slug]/booking-client.tsx:129-133` (`showAny = capaces.length >= 2 && !isSimultaneousResource`), trivialmente evitable con un POST forjado. |

**Impacto real de T-12-11 (por qué no es BLOCKER pero sí queda abierta):** forzar el combo **no
permite sobrecupo**. Con `autoAssign`, la selección de candidato del RPC exige agenda totalmente
libre en el intervalo (`064:207-219`), el gate cross-servicio sigue corriendo sobre el bucket elegido
(`064:325-338`) y el cupo se sigue contando por solape contra `services.capacity` a través de todas
las agendas (`064:350-364`). El invariante de integridad se sostiene; lo que se degrada es la
**disponibilidad**: el recurso simultáneo nunca ofrece su 2º lugar por esa vía y devuelve
`slot_taken` espurio. Es decir, falla cerrado.

**Acción requerida — elegir una:**
1. **Cerrar con control server-side** (recomendado): en `app/api/booking/create/route.ts`, tras
   resolver el servicio, rechazar `anyProfessional === true` cuando
   `capacity_mode === 'simultaneous_resource'` con un código propio; y en
   `app/api/booking/availability/route.ts:104` no entrar a la rama `any` para servicios simultáneos.
2. **Re-dispositar T-12-11 a `accept`** dejando asentado que el combo forzado degrada disponibilidad
   pero no integridad, y que el riesgo residual es de UX del propio negocio.

No corresponde parchear implementación desde este gate: queda como decisión del dueño de la fase.

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
