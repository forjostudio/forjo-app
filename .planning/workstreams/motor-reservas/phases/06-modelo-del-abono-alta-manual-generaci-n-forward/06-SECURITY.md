---
phase: 6
slug: modelo-del-abono-alta-manual-generaci-n-forward
status: draft
threats_open: 3
asvs_level: 2
created: 2026-07-21
---

# Phase 6 — Security

> Contrato de seguridad de la fase: registro de amenazas, riesgos aceptados y traza de auditoría.
> Auditoría independiente (no se aceptó la palabra de los SUMMARY): cada mitigación se verificó
> contra el código implementado, con greps, `git diff`, la suite de tests y **sondas en vivo contra
> la base local** (PG17, baseline + 040..054 replayadas).

**Workstream:** motor-reservas · **Milestone:** v0.24 (Turnos fijos / Abonos recurrentes)
**Rama auditada:** `gsd/motor-reservas-v024` (36 commits sobre `main` = `d7d2204`)
**Resultado:** 25/28 CLOSED · **3 OPEN (BLOCKER)** — todas por la misma causa raíz (GAP-01).

---

## Trust Boundaries

| Boundary | Descripción | Datos que cruzan |
|----------|-------------|------------------|
| anon (público) → `abonos` | El público NUNCA lee ni escribe abonos: sin policy para `anon`, la tabla no aparece en ninguna vista pública ni en ninguna ruta de `/[slug]` | ninguno (verificado en vivo: 0 filas, INSERT 42501) |
| dueño autenticado → `abonos` / `appointments` / `businesses` | El dueño solo toca filas de SU negocio: RLS owner-only + filtro explícito por `business_id` en toda query | serie del abono, turnos generados, cliente (nombre/tel/mail) |
| cliente HTTP → `POST /api/abonos/create` | El body (service/professional/location/client/totalOccurrences) es NO confiable; el tenant se resuelve por `owner_id` de la sesión | ids re-validados por `business_id` |
| Vercel Cron → `GET /api/cron/cancel-expired` | Solo con `Bearer $CRON_SECRET`; corre con service-role (sin RLS) | abonos de TODOS los tenants (aislamiento por el filtro del motor) |
| generación programática → `appointments` | El motor crea turnos sin humano en el loop; si insertara directo saltearía el anti-doble-booking | turnos (011/013 + cupo + espacio, atómicos en la DB) |
| migración 054 → producción | Aplicada A MANO el 2026-07-21 (prod = 054). Cualquier cambio de esquema posterior exige una migración **055** | DDL |

---

## Threat Register

| Threat ID | Categoría | Componente | Disposición | Mitigación verificada (evidencia) | Estado |
|-----------|-----------|-----------|-------------|-----------------------------------|--------|
| T-06-01 | Information Disclosure | tabla `abonos` (client_id, deposit_amount, billing_subscription_id) | mitigate | RLS habilitada en la MISMA migración: `054_abonos.sql:79` + `schema.sql:1475`. 4 policies owner-only, ninguna para `anon`: `054:82,87,92,99`. La tabla no aparece en ninguna vista pública (grep vistas = vacío) ni en ninguna ruta pública (`app/[slug]`, `app/api/booking` no la referencian). **Sonda en vivo:** anon puro → `select` = 0 filas, `insert` = 42501 | closed |
| T-06-02 | Tampering | INSERT/UPDATE cross-tenant en `abonos` | mitigate | `WITH CHECK` en INSERT (`054:87`) **y** en UPDATE (`054:94`, además del `USING`). **Sonda en vivo con sesión real del dueño A:** insert en el negocio de B → 42501; reasignar un abono propio a `business_id` de B → 42501; update/delete sobre la fila de B → 0 filas | closed |
| T-06-03 | Elevation of Privilege | `businesses.abono_window_weeks` / `appointments.abono_id` | mitigate | Columnas aditivas (`054:107`, `054:115`). `businesses` ya tiene RLS owner-only (`schema.sql:1700`). El trigger `businesses_protect_admin_columns` (`schema.sql:209-225`) solo revierte has_web_custom/has_whatsapp/plan/plan_status → `abono_window_weeks` es owner-updatable POR DISEÑO (igual que `max_advance_days`). `abono_id ... ON DELETE SET NULL` (`054:107`, `schema.sql:1212`) → borrar un abono NO borra turnos | closed |
| T-06-04 | Tampering | `book_slot_atomic` (núcleo anti-doble-booking) | mitigate | La 054 NO toca el RPC (solo lo nombra en 2 comentarios: `054:22,47`). `git diff main..HEAD -- supabase/schema.sql \| grep -c book_slot_atomic` = **0**. `abono_id` se setea FUERA del RPC con un UPDATE etiqueta (`lib/abono-generation.ts:179-183`). `git log main..HEAD -- lib/booking-core.ts` = **vacío** (core intacto) | closed |
| T-06-05 | Tampering | `generateAbonoOccurrences` → `appointments` | mitigate | Toda alta pasa por `createAppointmentCore` (`lib/abono-generation.ts:159`). `grep "insert(" lib/abono-generation.ts` = **vacío**; `grep "\.rpc("` = **vacío**. En los callers, `from('appointments')` solo aparece para contar (`abonos/create/route.ts:288`, `cancel-expired/route.ts:79`) — ningún insert nuevo | closed |
| T-06-06 | Tampering | ocurrencia en conflicto | mitigate | Ante `!result.ok` → `skipped.push({date, reason})` y `continue` (`lib/abono-generation.ts:185-190`); no hay UPDATE/DELETE sobre turnos ajenos. Tests verdes re-corridos: `abono-generation` caso 2 ("saltea el slot ocupado sin pisar el turno pre-existente") y `abono-cron` caso 3 | closed |
| T-06-07 | Information Disclosure / cross-tenant | queries del motor | mitigate | `clients` `.eq('business_id')` (`abono-generation.ts:92`), `schedule_exceptions` (`:125`), idempotencia sobre `appointments` (`:149`), y el UPDATE de la etiqueta acotado por **id + business_id** (`:182-183`). Tests: `abono-generation` caso 6 y `abono-cron` caso 5 (aislamiento) | closed |
| T-06-08 | Denial of Service | generación masiva / loop infinito | mitigate | **NO VERIFICADA.** El avance de a 7 días y la ausencia de recursión sí están (`abono-generation.ts:109`), pero el "rango acotado" NO se cumple: la guarda `if (fromDate > toDate) return` (`:79`) es una comparación de strings que un `toDate` inválido derrota, y el loop no tiene tope de iteraciones. Ver **GAP-01** | **open** |
| T-06-09 | Spoofing | `POST /api/abonos/create` | mitigate | `auth.getUser()` → 401 (`app/api/abonos/create/route.ts:64-67`); negocio por `owner_id` → 404 (`:73-78`). NUNCA se lee un `business_id` del body | closed |
| T-06-10 | Tampering | serviceId/professionalId/locationId/clientId del body | mitigate | professional `.eq('business_id')` (`route.ts:126`), derivación server-side del service en canchas (`:131`), service `.eq('business_id')` + `active` (`:145-149`), location `.eq('business_id')` (`:158`), `resolveClientId` re-valida el clientId por tenant (`:312-318`). Tests `abono-create` 2 y 2b (service/professional de otro tenant → rechazo) | closed |
| T-06-11 | Tampering | insert de la fila `abonos` | mitigate | `createClient()` anon+RLS (`route.ts:61`); `grep createAdminClient app/api/abonos/create/route.ts` = **vacío**. El UPDATE posterior va acotado por id + business_id (`:236-237`). Test `abono-create` 3 (anon sin sesión no puede insertar) + sonda en vivo de las policies | closed |
| T-06-12 | Information Disclosure | mail de alta | mitigate | Secretos del propio tenant: `getBusinessSecrets(business.id)` (`route.ts:247`; `lib/business-secrets.ts:35-41` acota por `business_id`). Un solo destinatario: `to: [to]` sin cc/bcc (`lib/email.ts:435-441`). Best-effort dentro de `after()` + try/catch (`route.ts:245-265`) | closed |
| T-06-13 | Repudiation / abuso | generación desde el alta | mitigate | La primera tanda pasa por el motor → `createAppointmentCore` (`route.ts:196-214`). ⚠ La cláusula "rango acotado por `abono_window_weeks`" depende de GAP-01 (el valor no tiene techo), pero el control principal (todo por el núcleo atómico) está presente | closed |
| T-06-14 | Spoofing | `GET /api/cron/cancel-expired` | mitigate | Gate intacto: `auth !== \`Bearer ${process.env.CRON_SECRET}\`` → 401 (`cancel-expired/route.ts:231-234`). El diff de la fase NO toca ninguna línea del gate (`git diff main..HEAD` filtrado por authorization/CRON_SECRET/401 = vacío). Test `abono-cron` 4 (401 sin Bearer y sin generar) | closed |
| T-06-15 | Tampering | generación del cron → `appointments` | mitigate | `extendAbonoWindows` genera solo vía `generateAbonoOccurrences` (`cancel-expired/route.ts:175-190`); el único UPDATE sobre `appointments` del handler es el pre-existente de holds vencidos (`:261`, sin cambios en la fase) | closed |
| T-06-16 | Information Disclosure / cross-tenant | service-role sin RLS | mitigate | El `business` que recibe el motor sale del join del propio abono (`:118`, `:134-137`), y el motor filtra toda query por ese `business_id`. Los dos UPDATE de `abonos` van acotados por **id + business_id** (`:160-161`, `:212-213`); el conteo también (`:81-83`). Test `abono-cron` 5 (dos negocios, sin cruce) | closed |
| T-06-17 | Denial of Service | cron largo / muchos abonos | mitigate | **NO VERIFICADA.** El "solo la cola" (`:167-173`) y el try/catch por abono (`:133`,`:218`) están, pero un try/catch NO contiene un loop infinito ni un timeout: con un `abono_window_weeks` grande, UN abono cuelga la corrida entera y los abonos de los demás tenants nunca se extienden. Ver **GAP-01** | **open** |
| T-06-18 | Availability | agregar un cron más frecuente | mitigate | Piggyback en el cron diario existente. `git diff --name-only main..HEAD -- vercel.json` = **vacío**; `vercel.json` sigue con un único cron `0 3 * * *` | closed |
| T-06-19 | Tampering | inputs del form | mitigate | `components/dashboard/nuevo-abono-form.tsx` no escribe a la DB: su único efecto es `fetch('/api/abonos/create')` (`:299`). La autoridad es el endpoint (T-06-10) | closed |
| T-06-20 | Information Disclosure | page de abonos + select de agenda | mitigate | `app/(dashboard)/abonos/page.tsx`: negocio por `owner_id` (`:16`) y **todas** las queries `.eq('business_id', business.id)` (`:29,34,37,38,39,40`). `app/(dashboard)/agenda/page.tsx`: se sumó solo `abono_id` al select, conservando `.eq('business_id', business.id)`; el badge usa el id como opaco (`agenda-client.tsx:589-592`) | closed |
| T-06-21 | Tampering | control de ventana (`abono_window_weeks`) | mitigate | Persiste por el mismo camino owner-autenticado que `max_advance_days`: update de `businesses` por id con el cliente anon+RLS del browser (`abonos-client.tsx:113`), policy `owner access` (`schema.sql:1700`), columna NO protegida por el trigger admin. ⚠ El **camino** es el declarado; lo que falta es validar el **valor** → GAP-01 | closed |
| T-06-22 | Tampering | motor sin guarda de horario (D-06′) | mitigate | `lib/abono-generation.ts` no lee `time_blocks` (solo lo nombra en comentarios `:16,:37`) y no existe el skip `out_of_hours`; se conserva únicamente `day_closed` (`:138-141`). Los constraints 011/013/cupo/espacio siguen en la DB (core intacto, T-06-04). Tests 4 (day_closed), 5 (21:00 genera), 5b (horario especial no saltea), 2 (no pisa) | closed |
| T-06-23 | Tampering | `total_occurrences` / `maxCreated` | mitigate | La columna solo tiene un CHECK sobre sí misma (`054:56`), no participa de ninguna constraint de booking. `maxCreated` solo **corta** el loop (`abono-generation.ts:113`). El límite del finito se calcula **contando turnos reales en la DB** en los DOS puntos: alta (`abonos/create/route.ts:221-223` → `countAbonoAppointments:282-294`) y cron (`cancel-expired/route.ts:153`, `:194-196` → `:77-85`), ambos acotados por `business_id` → un re-run no puede pasarse de N. Tests `abono-cron` 6/8/9 y `abono-create` 5/6 | closed |
| T-06-24 | Denial of Service | finito con muchos choques | mitigate | **NO VERIFICADA.** `maxCreated` corta al llegar a N (`abono-generation.ts:113`), pero esa salida solo ocurre si se CREAN turnos; con choques permanentes el corte efectivo es el fin del rango, y el rango no tiene techo. Ver **GAP-01** | **open** |
| T-06-25 | Information Disclosure | `totalOccurrences` / última fecha del cliente | mitigate | Conteo y último turno se derivan de una query acotada (`abonos/page.tsx:32-34`); `totalOccurrences` lo re-valida el endpoint con narrowing defensivo 1..520 (`abonos/create/route.ts:101-107`) | closed |
| T-06-26 | Availability (UX) | Select dentro de Drawer | mitigate | `DrawerContent` publica su nodo DOM por contexto (`components/ui/drawer.tsx:16-19, 71-85, 94-96`) y `SelectContent` lo usa como `container` del Portal (`components/ui/select.tsx:68, 75, 81-86`) | closed |
| T-06-27 | Availability | regresión en selects de toda la app | mitigate | Fuera de un drawer el contexto es `null` → `{...(portalContainer ? { container: portalContainer } : {})}` no pasa la prop → ruta idéntica a la previa (`select.tsx:85-86`). Gate re-corrido por el auditor: `npx tsc --noEmit` limpio y `npx vitest run --no-file-parallelism` → **50 archivos / 647 pass · 1 skip** | closed |
| T-06-SC | Tampering | instalación de paquetes (npm) | **accept** | Premisa verificada: `git diff --name-only main..HEAD -- package.json package-lock.json` = **vacío** (0 dependencias nuevas en los 36 commits de la fase). Registrado en el log de riesgos aceptados | closed |

*Estado: open · closed* · *Disposición: mitigate (implementación requerida) · accept (riesgo documentado) · transfer (tercero)*

---

## Hallazgos

### GAP-01 — BLOCKER · `abono_window_weeks` sin techo: loop de generación no acotado (T-06-08, T-06-17, T-06-24)

**Qué falta.** Tres mitigaciones DoS declaradas se apoyan en que el rango de generación esté acotado
("rango acotado [fromDate,toDate]", "solo la cola, ~1 semana nueva por corrida", "el rango por corrida
está acotado por el rolling window"). **Nada en el código implementado acota ese rango**: el valor sale
de `businesses.abono_window_weeks`, que es escribible por el dueño y no tiene tope en ninguna capa.

- DB: `abono_window_weeks integer DEFAULT 8` — **sin CHECK** (`054_abonos.sql:115`, `schema.sql:392`).
- UI: el input numérico tiene `min={1}` y **ningún `max`** (`abonos-client.tsx:218`); `saveWindow` solo
  valida `weeks >= 1` (`:109`) y escribe directo a `businesses` con el cliente anon+RLS (`:113`).
- Server: los dos consumidores hacen `Number(...) || 8` — que solo cubre `0`/`NaN`/`null`, no un valor
  enorme: `app/api/abonos/create/route.ts:191` y `app/api/cron/cancel-expired/route.ts:141`.
- Motor: la única guarda es `if (fromDate > toDate) return` (`lib/abono-generation.ts:79`), una
  comparación de **strings**, y el `for` no tiene tope de iteraciones (`:109`).

**Verificado en vivo (DB local, sesión real de un dueño, no service-role):**

```
set_8            -> PERSISTIDO = 8
set_5000         -> PERSISTIDO = 5000
set_999999       -> PERSISTIDO = 999999
set_2147483647   -> PERSISTIDO = 2147483647     <- int max, aceptado sin chistar
set_0 / set_-5   -> PERSISTIDO = 0 / -5         <- (solo por API; la UI los frena)
```

**Impacto, calculado con el código real:**

| `abono_window_weeks` | `toDate` que produce el caller | Comportamiento del motor |
|---|---|---|
| 8 (default) | `2026-09-15` | ~8 iteraciones — OK |
| 800 (typo plausible en el stepper) | `2041-11-19` | ~800 iteraciones y hasta 800 turnos creados de una |
| 999999 (tecleable en la UI) | `21191-11-19` | ~1.000.000 de iteraciones × 2 queries c/u |
| 2147483647 | **`NaN-NaN-NaN`** | `fromDate > toDate` da **false** (`'2026-…' < 'NaN…'`) → la guarda no dispara; y el iterador llega al punto fijo `'+010000-01'`, que ya no avanza → **loop infinito verificado**, con 2 queries por vuelta, para siempre |

El caso `NaN-NaN-NaN` no lanza excepción: el `try/catch` por abono del cron (`cancel-expired/route.ts:133,218`)
**no lo contiene**. Consecuencias:

1. El cron diario — el **único** de la cuenta (Vercel Hobby) y **compartido por todos los tenants** —
   nunca termina su corrida: los abonos de los negocios que vienen después en el loop **dejan de
   generarse en silencio**, todos los días, mientras el valor persista. Eso falsifica literalmente la
   mitigación de T-06-17 ("un abono que falla no frena el resto ni cancel-expired").
2. Carga ilimitada contra Supabase (2 queries por iteración) hasta que la plataforma mate la función.
3. En el alta manual, el mismo valor cuelga el request del dueño y puede materializar miles de turnos.

**Actor:** cualquier dueño autenticado (privilegio bajo), por la UI soportada o por un PATCH a PostgREST
con su propia anon key. **No requiere** service-role ni conocer datos de otro tenant.

**Remediación sugerida (NO aplicada — esta auditoría no toca implementación):**

1. *Inmediata, sin migración:* clampear en los dos callers, ej.
   `const windowWeeks = Math.min(Math.max(Math.floor(Number(...)) || 8, 1), 52)` en
   `app/api/abonos/create/route.ts:191` y `app/api/cron/cancel-expired/route.ts:141`.
2. *Defensa en profundidad (esquema):* `CHECK (abono_window_weeks BETWEEN 1 AND 52)`.
   ⚠ **La migración 054 ya está aplicada a producción (2026-07-21).** No se puede editar en el lugar:
   este cambio exige una **migración nueva 055**, coordinada a mano con el deploy + `NOTIFY pgrst`.
3. *UX (no es autoridad, pero evita el foot-gun):* `max` en el input y clamp en `saveWindow`
   (`abonos-client.tsx:109,218`).
4. *Cinturón del motor:* además del rango, un tope duro de iteraciones (o validar que `toDate` matchee
   `^\d{4}-\d{2}-\d{2}$`) en `lib/abono-generation.ts:79` — así el motor deja de depender de que el
   caller sea prolijo, que es justo lo que T-06-08 declara.

---

## Flags no registrados (unregistered flags)

Superficie nueva aparecida durante la implementación y **no** declarada en ningún `## Threat Flags`
de los SUMMARY (06-06 declaró "ninguno nuevo").

| ID | Superficie | Riesgo | Acción |
|----|-----------|--------|--------|
| UF-01 | `businesses.abono_window_weeks`: columna nueva escribible por el dueño que alimenta directamente el bound del loop del motor y del cron compartido | **Alto** — es la causa raíz de GAP-01 | Cerrar con GAP-01 |
| UF-02 | `appointments.abono_id` es FK a `abonos(id)` sin constraint que ate el `business_id` del turno con el del abono | Bajo — un dueño podría etiquetar un turno PROPIO con el UUID de un abono ajeno (necesita adivinar el UUID); no cruza datos: todas las lecturas del panel filtran por `business_id` y el join no devolvería nada | Informativo; si se quiere cerrar, va en una futura migración (055+) como FK compuesta `(business_id, abono_id)` |
| UF-03 | `GRANT ALL ON TABLE public.abonos TO anon` (`schema.sql:3332`) | Ninguno en la práctica: es el default de Supabase para toda tabla del esquema `public` y RLS sin policy anon deja 0 filas (verificado en vivo). Idéntico al resto de las tablas del repo | Informativo, sin acción |

---

## Accepted Risks Log

| Risk ID | Threat Ref | Racional | Aceptado por | Fecha |
|---------|------------|----------|--------------|-------|
| AR-06-01 | T-06-SC | La fase NO instala paquetes nuevos: solo SQL + TS sobre dependencias existentes. Premisa verificada por el auditor — `git diff --name-only main..HEAD -- package.json package-lock.json` vacío en los 36 commits de la fase | Plan 06-01..06-05 (`<threat_model>`) | 2026-07-21 |

*Los riesgos aceptados no vuelven a aparecer en corridas futuras de la auditoría.*

---

## Security Audit Trail

| Fecha | Amenazas | Closed | Open | Corrida por |
|-------|----------|--------|------|-------------|
| 2026-07-21 | 28 | 25 | 3 | gsd-security-auditor (Claude Opus 4.8) |

### Verificaciones ejecutadas (evidencia independiente)

| Check | Resultado |
|-------|-----------|
| `grep -nE "book_slot_atomic\|insert(\|\.rpc(\|out_of_hours" lib/abono-generation.ts` | Sin insert directo, sin RPC, sin `out_of_hours` (solo comentarios mencionan `time_blocks`) |
| `git log --oneline main..HEAD -- lib/booking-core.ts` | vacío → núcleo atómico intacto |
| `git diff --name-only main..HEAD -- vercel.json package.json package-lock.json` | vacío → sin cron nuevo, sin dependencias nuevas |
| `git diff main..HEAD -- supabase/schema.sql \| grep -c book_slot_atomic` | `0` → el RPC no se tocó |
| Policies de `abonos` (migración + schema) | RLS ON, 4 policies (una por operación), `WITH CHECK` en INSERT y UPDATE, ninguna para `anon` |
| Sonda RLS en vivo (dos tenants, sesión real del dueño) | insert cross-tenant 42501 · reasignación de tenant 42501 · select/update/delete cross-tenant 0 filas · anon 0 filas / insert 42501 |
| Sonda de bound en vivo (`abono_window_weeks`) | valores 5000 / 999999 / 2147483647 / 0 / -5 **persisten** → GAP-01 |
| Simulación del loop con `toDate = 'NaN-NaN-NaN'` | punto fijo en `'+010000-01'` → **loop infinito** confirmado |
| `npx tsc --noEmit` | limpio |
| `npx vitest run --no-file-parallelism` | 50 archivos · 647 pass · 1 skip |

### Nota de fidelidad de los tests

`test/abono-create.test.ts` **replica** la secuencia del route handler (auth + anti-tampering + insert +
primera tanda) en vez de invocar el handler HTTP (comentario del propio archivo, `:11-18`). O sea: el
401/404 de T-06-09 está verificado **por lectura de código** (`route.ts:64-78`), no por test. Los tests
sí ejercitan de punta a punta las policies RLS y el motor.

### Nota de despliegue

La migración **054 ya está aplicada a producción (2026-07-21)**. Cualquier hallazgo de nivel esquema
(p. ej. el CHECK de `abono_window_weeks` de GAP-01, o la FK compuesta de UF-02) **ya no se puede
arreglar editando la 054**: requiere una **migración nueva 055**, aplicada a mano y coordinada con el
deploy, más `NOTIFY pgrst, 'reload schema';` y regeneración de `supabase/schema.sql`.

---

## Sign-Off

- [x] Todas las amenazas tienen disposición (mitigate / accept / transfer)
- [x] Riesgos aceptados documentados en el Accepted Risks Log
- [ ] `threats_open: 0` confirmado — **3 abiertas (T-06-08, T-06-17, T-06-24), todas por GAP-01**
- [ ] `status: verified` en el frontmatter

**Aprobación:** pendiente — cerrar GAP-01 y re-correr `/gsd:secure-phase`.
