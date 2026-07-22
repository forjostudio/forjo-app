---
phase: 07-cancelaci-n-del-abono-mail-panel
slug: cancelacion-del-abono-mail-panel
status: verified
threats_total: 68
threats_closed: 68
threats_open: 0
asvs_level: 2
created: 2026-07-22
---

# Phase 7 — Security

> Contrato de seguridad de la fase: registro de amenazas, riesgos aceptados y traza de auditoría.
> Auditoría retroactiva sobre los 12 planes (07-01..07-12: build + gap closure de `07-REVIEW.md`).
>
> **Método:** cada amenaza se verificó por su disposición contra el código implementado (grep + lectura
> + ejecución dirigida de tests). NO se aceptó documentación ni intención como evidencia. Los archivos
> de implementación no se modificaron.

---

## Trust Boundaries

| Boundary | Description | Data Crossing |
|----------|-------------|---------------|
| internet anónimo → `app/abono/cancelar/[token]` (SSR) | superficie pública sin sesión; el token de la URL es la ÚNICA credencial | nombre del cliente, servicio, día/hora, conteo de turnos |
| internet anónimo → `POST /api/abonos/cancel/[token]` | mutación destructiva sin sesión, con service role (RLS NO aplica) | `cancel_token` → serie + tenant resuelto server-side |
| dueño autenticado → `POST /api/abonos/cancel` | mutación destructiva con sesión anon+RLS; el body es input no confiable | `abonoId` (re-validado por `business_id`) |
| dueño autenticado → `GET /api/abonos/cancel-link/[id]` | entrega deliberada de una credencial de baja, de a UNA | `cancel_token` → URL armada |
| caller → `cancelAbonoSeries` (`lib/abono-cancel.ts`) | motor rol-agnóstico; el `businessId` ya viene resuelto por el caller | `businessId` + `abonoId` |
| motor → `public.appointments` / `public.abonos` | con service role NO hay RLS: el aislamiento lo dan EXCLUSIVAMENTE los filtros de la query | UPDATE masivo de turnos |
| requests concurrentes → misma serie | dos bajas simultáneas no pueden duplicar efectos ni mails | gate atómico de estado |
| `clients.name` (input anónimo de booking) → template de mail → inbox del DUEÑO | contenido de un tercero renderizado en un mensaje que el dueño lee como confiable | HTML del mail |
| app → `api.resend.com` | dependencia externa en el request path, con secretos por tenant | payload del mail |
| logs de Vercel | superficie de retención donde no deben caer datos personales (Ley 25.326, vertical salud) | ids de abono, mensajes de error |
| Vercel Cron → `GET /api/cron/cancel-expired` | superficie con service role COMPARTIDA por todos los tenants, autorizada por Bearer | generación forward |
| operador → Supabase de producción | DDL aplicado a mano fuera del flujo automatizado (migr. 055/056) | índice único sobre la credencial |

**INVARIANTE ESTRELLA (D-07) — VERIFICADO.** Las dos vías delegan el efecto sobre los turnos
EXCLUSIVAMENTE en `cancelAbonoSeries` (`lib/abono-cancel.ts`). Ninguno de los dos route handlers
contiene una query propia sobre `appointments` (verificado: `grep "from('appointments')"` sobre
`app/api/abonos/cancel/route.ts` y `app/api/abonos/cancel/[token]/route.ts` → 0 matches). No existe
una segunda implementación de la baja en el repo.

---

## Threat Register

68 amenazas únicas (79 filas en los 12 planes; `T-07-SC` se repite idéntica en los 12 y se cuenta una
vez). **Colisiones de ID:** los planes de gap closure reusaron IDs ya tomados. Se verifican por separado
y se namespacean por plan.

### Plan 07-01 — motor compartido `lib/abono-cancel.ts`

| Threat ID | Category | Component | Disposition | Mitigation | Status | Evidence |
|-----------|----------|-----------|-------------|------------|--------|----------|
| T-07-01 | Elevation of Privilege | UPDATE masivo de `appointments` | mitigate | doble scoping `business_id` + `abono_id` (D-24) | closed | `lib/abono-cancel.ts:280-281` (`.eq('business_id')` + `.eq('abono_id')` en la rama (c)); tests 3 y 4 en `test/abono-cancel.test.ts:205,215` |
| T-07-02 | Tampering | rol del cliente Supabase | mitigate | el motor recibe `supabase` por parámetro, no instancia factories | closed | `lib/abono-cancel.ts:1-2` (imports: sólo `type SupabaseClient` + `todayInAR`); `:54-62` contrato de entrada |
| T-07-03 | Tampering | fila `abonos` bajo concurrencia | mitigate | gate de estado DENTRO del UPDATE + `.select('id')` | closed | `lib/abono-cancel.ts:210-216` (`.neq('status','cancelled')` encadenado al `.update()`); carrera real verificada en `test/abono-cancel-routes.test.ts:276-296` |
| T-07-04 | Tampering | cálculo del corte "hoy" | mitigate | `todayISOInAR()` ← `todayInAR()` (UTC-3 sin DST), serialización por componentes locales | closed | `lib/abono-cancel.ts:92-97` (`toISODate`, sin `toISOString().slice`), `:123-125`; fuente en `lib/booking-window.ts:31-35` |
| T-07-05 | Information Disclosure | `previewAbonoCancellation` | mitigate | lee sólo `date, status` del par (business, abono) | closed | `lib/abono-cancel.ts:172-178` (`.select('date, status')` + los dos `.eq`) |
| T-07-06 | Elevation of Privilege | reactivación de una serie dada de baja | mitigate | D-04: el módulo no escribe `status: 'active'` | closed | grep negativo sobre `lib/abono-cancel.ts`: `'active'` aparece sólo en comentarios (`:13`, `:26`); no hay función de reactivación exportada |

### Plan 07-02 — templates de mail

| Threat ID | Category | Component | Disposition | Mitigation | Status | Evidence |
|-----------|----------|-----------|-------------|------------|--------|----------|
| T-07-07 | Spoofing | header `From` de los dos mails nuevos | mitigate | `resolveSender()`, que sanitiza el display name (header injection) | closed | `lib/email.ts:519` y `:650` llaman `resolveSender`; sanitización en `:10-13` (`fromDisplayName` quita `\r\n"<>`); ningún template arma el `From` a mano |
| T-07-08 | Information Disclosure | destinatarios | mitigate | mail al cliente sólo a `to`; aviso sólo a `notification_email`; sin CC/listas | closed | `lib/email.ts:603` y `:734` (`to: [to]`); el payload a Resend no tiene `cc`/`bcc`; destinos en `app/api/abonos/cancel/[token]/route.ts:155,180` |
| T-07-09 | Information Disclosure | contenido del mail | mitigate | los templates no aceptan `business_id` ni consultan la base | closed | `lib/email.ts:1` (único import: `normalizeArWhatsApp`); firmas `:485-517` y `:621-649` sin identificadores de tenant |
| T-07-10 | Denial of Service | avalancha de mails | mitigate | D-14: `cancelledCount` es un número, no se itera fechas | closed | `lib/email.ts:531,654` (`turnosLabel`); tests 12/13/14 en `test/abono-cancel-email.test.ts:282-298` (7 turnos → 1 POST) |
| T-07-11 | Tampering | templates vivos en producción | mitigate | los dos templates son funciones NUEVAS; los vivos no se modifican | closed (ver W-02) | funciones nuevas en `lib/email.ts:485` y `:621`; `sendAbonoConfirmation`/`sendAdminNotification`/`sendClientCancelEmail` conservan su cuerpo. **Nota:** 07-07 sí modificó los helpers COMPARTIDOS `renderEmailHeader` y `resendSend` — ver W-02 |

### Plan 07-03 — vía pública (endpoint + página)

| Threat ID | Category | Component | Disposition | Mitigation | Status | Evidence |
|-----------|----------|-----------|-------------|------------|--------|----------|
| T-07-12 | Spoofing | `POST /api/abonos/cancel/[token]` | mitigate | resolución por columna uuid en Postgres (~122 bits), nunca `===` en JS | closed | `app/api/abonos/cancel/[token]/route.ts:56-62` (`.eq('cancel_token', token).maybeSingle()`); no hay comparación de token en JS en toda la ruta |
| T-07-13 | Information Disclosure | enumeración de tokens | mitigate | inexistente, formato inválido y ajeno → MISMO 404 `not_found` | closed | ruta `:66`; test 5 y 6 en `test/abono-cancel-routes.test.ts:346-369` comparan las dos respuestas entre sí — **ejecutados en esta auditoría: 16/16 passed** |
| T-07-14 | Elevation of Privilege | cross-tenant | mitigate | `businessId` sale de la fila del token; la ruta no toca `appointments` | closed | `app/api/abonos/cancel/[token]/route.ts:78-82`; grep `from('appointments')` en la ruta → 0 matches |
| T-07-15 | Denial of Service / abuso | re-POST del mismo token | mitigate | idempotencia D-05: la 2ª llamada no toca turnos ni manda mails | closed | ruta `:71-73` y `:91-93`; tests 1/3/4 en `test/abono-cancel-routes.test.ts` (re-ejecutados, verdes) |
| T-07-16 | Tampering | flujo vivo de cancel de turno suelto | mitigate | ruta NUEVA (D-10); no se abren `/cancelar/[token]` ni `/api/cancel/[token]` | closed | `git log` de los dos archivos: último commit `74ed6af` (fase 01), ninguno de la fase 07 |
| T-07-17 | Tampering | listas de ruteo del Edge | mitigate | no se agregan prefijos a `lib/auth/route-lists.ts` | closed | `grep "abono" lib/auth/route-lists.ts proxy.ts` → 0 matches; `KNOWN_PREFIXES` sin `/abono` ⇒ `proxy.ts:54-56` devuelve `NextResponse.next()` sin `updateSession` (idéntico a `/cancelar/[token]`) |
| T-07-18 | Information Disclosure | contenido de la página pública | mitigate | sólo cliente/servicio/día/hora + resumen numérico de la propia serie | closed | `app/abono/cancelar/[token]/page.tsx:106-121` (props); `abono-cancel-client.tsx:136-153`; no se pasan `business_id` ni `abono_id` al cliente |
| T-07-19 | Repudiation | baja sin rastro para el negocio | mitigate | D-13: aviso a `notification_email` + `cancelled_at` visible en el panel | closed | `app/api/abonos/cancel/[token]/route.ts:180-200`; `cancelled_at` escrito en `lib/abono-cancel.ts:212`, leído en `app/(dashboard)/abonos/page.tsx:39` |

### Plan 07-04 — vía panel (endpoint autenticado + UI)

| Threat ID | Category | Component | Disposition | Mitigation | Status | Evidence |
|-----------|----------|-----------|-------------|------------|--------|----------|
| T-07-20 (07-04) | Spoofing | `POST /api/abonos/cancel` | mitigate | anon+RLS con cookies + `auth.getUser()` → 401; service role prohibido | closed | `app/api/abonos/cancel/route.ts:50-55`; imports `:1-5` sin `createAdminClient`; test 1 del bloque panel (`test/abono-cancel-routes.test.ts:435`) |
| T-07-21 (07-04) | Tampering | `abonoId` del body | mitigate | D-23: re-lectura `.eq('id').eq('business_id').maybeSingle()` antes de tocar nada | closed | `app/api/abonos/cancel/route.ts:81-87`; tests 4 y 5 (`:466`, `:485`) — ajeno e inexistente devuelven el mismo 404 |
| T-07-22 (07-04) | Elevation of Privilege | cancelación masiva desde el panel | mitigate | el endpoint delega en el motor; no ejecuta queries sobre `appointments` | closed | `app/api/abonos/cancel/route.ts:92`; grep `from('appointments')` en la ruta → 0 matches; test 9 (`:531`) |
| T-07-23 (07-04) | Information Disclosure | `cancel_token` en el payload del dashboard | mitigate | D-25: sólo en la page del dueño, tabla con RLS owner-only | closed (reforzado) | **más fuerte que lo planificado:** 07-10 sacó la columna del select por completo — `app/(dashboard)/abonos/page.tsx:39` no la pide; `grep cancel_token` en `app/(dashboard)/` → 0 matches |
| T-07-24 (07-04) | Information Disclosure | portapapeles | **accept** | el link lo copia el owner deliberadamente; es el mismo secreto que ya viaja en el mail de alta | closed | ver Accepted Risks Log · A-01 |
| T-07-25 (07-04) | Repudiation | baja destructiva por error del operador | mitigate | D-19: `ConfirmDialog` `risk="alto"` + `destructive` con conteo real y última fecha | closed | `app/(dashboard)/abonos/abonos-client.tsx:492-499`; datos reales en `:485-486` (`futureTurnoCounts`/`lastFutureDates`) |
| T-07-26 (07-04) | Elevation of Privilege | reactivación desde la UI o el endpoint | mitigate | D-04: no hay camino de vuelta a `active` | closed | grep negativo: `'active'` en `abonos-client.tsx` sólo en el tipo (`:35`) y en filtros de lectura (`:129`,`:133`); ninguna escritura |
| T-07-27 (07-04) | Denial of Service | avalancha de mails al cliente | mitigate | D-14/D-15: un solo `sendAbonoCancelledEmail` en `after()`; la rama idempotente no manda | closed | `app/api/abonos/cancel/route.ts:105-107` (already → sin mail) y `:112-144` (un envío); test 8 (`:516`) |

### Plan 07-05 — checkpoint humano (UAT)

| Threat ID | Category | Component | Disposition | Mitigation | Status | Evidence |
|-----------|----------|-----------|-------------|------------|--------|----------|
| T-07-28 (07-05) | Tampering | datos de producción durante la UAT | mitigate | el checkpoint corre contra el Supabase LOCAL y el negocio de prueba | closed | `07-05-SUMMARY.md:13` ("ejecutado por el operador contra el Supabase local y el negocio de prueba"); series de prueba descritas en `:67-72` |
| T-07-29 (07-05) | Information Disclosure | link de baja copiado durante la prueba | mitigate | link del abono de prueba, sin salir del entorno local | closed | `07-05-SUMMARY.md:32-36` (vía A ejercida en incógnito local); ningún token real involucrado |

### Plan 07-06 — barrido de reparación (CR-01)

| Threat ID | Category | Component | Disposition | Mitigation | Status | Evidence |
|-----------|----------|-----------|-------------|------------|--------|----------|
| T-07-23 (07-06) | Tampering | barrido de reparación, rama `(b)` | mitigate | los MISMOS 4 filtros que el masivo: 2× `.eq` + `.gte(date)` + `.neq(status)` | closed | `lib/abono-cancel.ts:249-255` (idénticos a `:277-283`); test 11 `test/abono-cancel.test.ts:345` (abonoB y abonoOther intactos) |
| T-07-24 (07-06) | Tampering | escritura de status desde el motor | mitigate | ninguna rama escribe un status distinto de `'cancelled'` | closed | grep sobre `lib/abono-cancel.ts`: los tres `update()` escriben sólo `status:'cancelled'` (`:211`, `:251`, `:279`); no se reabre ningún slot |
| T-07-25 (07-06) | Repudiation | gate atómico que serializa bajas concurrentes | mitigate | el `.neq` sigue DENTRO del UPDATE de `abonos`; el barrido corre sólo en la rama que no volteó | closed | `lib/abono-cancel.ts:215` (gate) y `:249` (barrido dentro del `if (!flipped …)`); carrera real: 1 mail (`test/abono-cancel-routes.test.ts:290-291`, re-ejecutado verde) |
| T-07-26 (07-06) | Denial of Service | reintentos repetidos disparan el barrido | **accept** | UPDATE acotado por `(business_id, abono_id)` que usa el índice y afecta 0 filas tras el primero | closed | ver Accepted Risks Log · A-02 |
| T-07-27 (07-06) | Information Disclosure | logs del barrido | mitigate | se loguea `abonoId` + mensaje de error, nunca email ni nombre | closed | `lib/abono-cancel.ts:258-261` (y `:219-222`, `:292-295`): sólo `abonoId` |

### Plan 07-07 — escapado HTML, timeout y logs sin PII

| Threat ID | Category | Component | Disposition | Mitigation | Status | Evidence |
|-----------|----------|-----------|-------------|------------|--------|----------|
| T-07-28 (07-07) | Tampering | inyección de contenido/links desde `clients.name` | mitigate | `esc()` sobre los valores dinámicos del HTML de los dos templates + `renderEmailHeader`; `.slice(0,120)` en el origen | closed (ver W-01) | `lib/email.ts:40-48` (`esc`), aplicado en `:538-542`, `:570`, `:668-672`, `:715-717` y en el header `:72-76`; corte en origen `app/api/booking/create/route.ts:37`; tests 15-19 `test/abono-cancel-email.test.ts:211-261` |
| T-07-29 (07-07) | Spoofing | phishing al dueño con el mail transaccional del producto | mitigate | mismo control que T-07-28 | closed | test 16 `test/abono-cancel-email.test.ts:222` (el dominio externo no queda dentro de un `href`) |
| T-07-30 | Denial of Service | `resendSend` sin timeout cuelga el handler | mitigate | `AbortSignal.timeout(10_000)` en el `fetch` | closed | `lib/email.ts:94`; tests 20 y 21 `test/abono-cancel-email.test.ts:264-279` |
| T-07-31 | Information Disclosure | mails de clientes en los logs de Vercel | mitigate | los `console.log` de los DOS templates de baja no interpolan el destinatario | closed (scoped, ver R-01) | `lib/email.ts:611` y `:740` (literales sin `${to}`) |
| T-07-32 | Information Disclosure | `esc()` también en `text` plano y `subject` | **accept** | no hay contexto de markup; las entidades se verían como basura | closed | ver Accepted Risks Log · A-03 |

### Plan 07-08 — migración 056 (índice único sobre la credencial)

| Threat ID | Category | Component | Disposition | Mitigation | Status | Evidence |
|-----------|----------|-----------|-------------|------------|--------|----------|
| T-07-33 | Spoofing | `abonos.cancel_token` sin unicidad garantizada | mitigate | `CREATE UNIQUE INDEX abonos_cancel_token_idx` (migr. 056) | closed | `supabase/migrations/056_abonos_cancel_token_unique.sql` (última línea); `supabase/schema.sql:1038`. **Aplicada en producción (operador, 2026-07-22)** — la mitigación a nivel DB está VIVA, no sólo local |
| T-07-34 | Denial of Service | el `CREATE UNIQUE INDEX` falla o bloquea si hay duplicados | mitigate | bloque `DO $$` con `RAISE EXCEPTION` accionable + checkpoint previo contra prod | closed | bloque de verificación en la migración (paso 1); **el operador confirmó 0 filas duplicadas en producción antes de aplicar** |
| T-07-35 | Denial of Service | seq scan sobre `abonos` en cada click de link público | mitigate | el índice convierte la resolución por token en búsqueda indexada | closed | mismo índice, aplicado en prod; consumido por `app/api/abonos/cancel/[token]/route.ts:61` y `app/abono/cancelar/[token]/page.tsx:45` |
| T-07-36 | Tampering | enmienda de una migración ya aplicada | mitigate | prohibición explícita + criterio con `git diff --numstat` vacío sobre 054/055 | closed | `git log` de 054 y 055: últimos commits `112b52e` y `043f819`, ambos de la **fase 06**; ningún commit de la fase 07 los toca |
| T-07-37 | Elevation of Privilege | DDL nuevo que amplíe superficie | mitigate | la migración se acota al índice | closed | `grep -iE "alter table\|create policy\|create function\|drop "` sobre la 056 → 0 matches |

### Plan 07-09 — página pública endurecida

| Threat ID | Category | Component | Disposition | Mitigation | Status | Evidence |
|-----------|----------|-----------|-------------|------------|--------|----------|
| T-07-38 | Information Disclosure | indexación de la URL con el token | mitigate | `metadata.robots = { index: false, follow: false }` | closed (scoped, ver R-02) | `app/abono/cancelar/[token]/page.tsx:12-15` |
| T-07-39 | Repudiation | la pantalla informa un efecto distinto del real | mitigate | el número sale de la respuesta del servidor; `already_cancelled` fuerza 0 | closed | `abono-cancel-client.tsx:82-89` y `:112-113` (`result` manda sobre el preview) |
| T-07-40 | Repudiation | consentimiento sin el aviso previo obligatorio | mitigate | el flag `unknown` se propaga y se declara con copy explícito | closed | motor `lib/abono-cancel.ts:184-187`; page `:91`; UI `abono-cancel-client.tsx:143-146` |
| T-07-41 | Denial of Service | dos POST a Resend en serie dentro del request path | mitigate | los dos envíos pasan a `after()` | closed | `app/api/abonos/cancel/[token]/route.ts:144-201` (un solo `after` con los dos envíos) |
| T-07-42 | Spoofing | el `cancel_token` como credencial | mitigate | resolución sin cambios + 404 genérico + ninguna rama escribe `cancel_token` | closed | ruta `:56-66`; grep de escrituras de `cancel_token` en la ruta → 0; respaldo DB = índice 056 (en prod) |
| T-07-43 | Tampering | el `unknown` del preview como canal de inferencia | **accept** | el flag sólo indica que la query de ESTA serie falló | closed | ver Accepted Risks Log · A-04 |

### Plan 07-10 — la credencial deja de viajar con el listado

| Threat ID | Category | Component | Disposition | Mitigation | Status | Evidence |
|-----------|----------|-----------|-------------|------------|--------|----------|
| T-07-44 | Information Disclosure | `cancel_token` de todas las series en el payload RSC | mitigate | se saca del select y del tipo; se resuelve on-demand | closed | `app/(dashboard)/abonos/page.tsx:39` (select sin la columna); `grep -rn cancel_token app/(dashboard)/` → 0 matches |
| T-07-45 | Elevation of Privilege | `GET /api/abonos/cancel-link/[id]` como camino al token ajeno | mitigate | sesión obligatoria + tenant por `owner_id` + doble scoping + 404 genérico | closed | `app/api/abonos/cancel-link/[id]/route.ts:40-52` (401 sin sesión, negocio por `owner_id`) y `:55-61` (`.eq('id')` + `.eq('business_id')`); RLS owner-only sobre `abonos` como 2ª capa |
| T-07-46 | Information Disclosure | el endpoint devolviendo de más | mitigate | un solo select de una columna; respuesta con un solo campo | closed | `app/api/abonos/cancel-link/[id]/route.ts:57` (`.select('cancel_token')`) y `:71` (`{ ok, url }`) |
| T-07-47 | Tampering | el endpoint como vector de escritura | mitigate | es `GET` y no tiene ninguna llamada de escritura | closed | el archivo completo (73 líneas) no contiene `update`/`insert`/`delete`/`upsert` |
| T-07-48 | Repudiation | el diálogo subestima el alcance de una baja irreversible | mitigate | preview acotado por `.gte('date', cutoff)`; agregados con `count: 'exact'` | closed | `app/(dashboard)/abonos/page.tsx:48-54` (query futura acotada) y `:77-84` (`count:'exact'` + `limit(1)`) |
| T-07-49 | Denial of Service | una query por serie en el render de `/abonos` | **accept** | pocas series por negocio, queries en paralelo, costo menor al set histórico anterior | closed | ver Accepted Risks Log · A-05 |

### Plan 07-11 — una sola fuente para el corte de fecha y la etiqueta del día

| Threat ID | Category | Component | Disposition | Mitigation | Status | Evidence |
|-----------|----------|-----------|-------------|------------|--------|----------|
| T-07-50 | Tampering | divergencia del corte de fecha entre alta, cron y baja | mitigate | `toISODate` pasa a ser un único símbolo importado | closed | `grep -rn "function toISODate" app/ lib/` → **una sola definición** (`lib/abono-cancel.ts:92`); importada en `app/api/cron/cancel-expired/route.ts:12` y `app/api/abonos/create/route.ts:11`. (`addDaysISO`/`addDaysUTC` son aritmética string→string anclada a UTC, semántica distinta: no serializan un `Date` local) |
| T-07-51 | Repudiation | el mail de la misma baja diciendo cosas distintas según la vía | mitigate | `abonoDayLabel` con fallback único para las dos vías y el alta | closed | `lib/abono-cancel.ts:111-115`; consumido por `app/api/abonos/cancel/route.ts:117`, `app/api/abonos/cancel/[token]/route.ts:113`, `app/abono/cancelar/[token]/page.tsx:96`, `app/api/abonos/create/route.ts:11` |
| T-07-52 | Elevation of Privilege | tocar el cron compartido por todos los tenants | mitigate | sólo reemplazo de import; gate Bearer, `status='active'`, clamp y tope de iteraciones intactos | closed | `app/api/cron/cancel-expired/route.ts:249` (`Bearer ${CRON_SECRET}`), `:136` (`.eq('status','active')`), `:72-76` (`clampWindowWeeks` 1..52) |
| T-07-53 | Denial of Service | alterar la frecuencia o el costo del cron diario | mitigate | `vercel.json` no se toca | closed | `vercel.json` ausente del set de archivos modificados por la fase (`git log --name-only`) |
| T-07-54 | Tampering | regresión silenciosa en el alta o la generación forward | mitigate | suite completa + `abono-create` + `abono-cron` en verde | closed | suite reportada 723 passed / 1 skipped y `tsc --noEmit` exit 0 (`07-VERIFICATION.md:73,77`); no re-ejecutada acá por instrucción explícita |

### Plan 07-12 — tests a nivel ruta

| Threat ID | Category | Component | Disposition | Mitigation | Status | Evidence |
|-----------|----------|-----------|-------------|------------|--------|----------|
| T-07-55 | Repudiation | el anti-avalancha verificado sólo por lectura de código | mitigate | test de carrera real con `Promise.all` + prueba de mutación | **closed (parcial)** — ver R-03 | `test/abono-cancel-routes.test.ts:276-296`: dos POST reales contra Postgres local, `sendClientMail`/`sendAdminMail` = 1, `liveFutureCount = 0`, `status='cancelled'`. **Re-ejecutado en esta auditoría: `Test Files 1 passed (1) · Tests 16 passed (16)` — NO skipeó.** La prueba de mutación del criterio de aceptación NO se corrió (residual R-03) |
| T-07-56 | Elevation of Privilege | la baja por panel alcanzando otro tenant | mitigate | caso con dos tenants sembrados: 404 + cero cambios en el ajeno | closed | `test/abono-cancel-routes.test.ts:466-484` y `:531`; verde en la re-ejecución |
| T-07-57 | Information Disclosure | el 404 revelando si una serie existe | mitigate | status y cuerpo IDÉNTICOS para inexistente / formato inválido / ajeno | closed | `test/abono-cancel-routes.test.ts:359-369` (vía pública) y `:485-494` (vía panel); verde en la re-ejecución |
| T-07-58 | Spoofing | verde falso usando service-role donde va la sesión del dueño | mitigate | guard de `access_token` + guard anon-key ≠ service-role | closed | `test/abono-cancel-routes.test.ts:410-417` (los dos `throw` de guard); el bloque panel corrió y pasó ⇒ los guards se ejercitaron |
| T-07-59 | Information Disclosure | credenciales de Supabase en el entorno de test | **accept** | `describe.skipIf(!hasSupabaseCreds)`, DB local, teardown de fixtures | closed | ver Accepted Risks Log · A-06 |
| T-07-60 | Tampering | el mock parcial de `next/server` ocultando un bug real de `after()` | **accept** | el mock reemplaza SÓLO `after` y conserva el resto de los exports reales | closed | ver Accepted Risks Log · A-07 |

### Transversal (los 12 planes)

| Threat ID | Category | Component | Disposition | Mitigation | Status | Evidence |
|-----------|----------|-----------|-------------|------------|--------|----------|
| T-07-SC | Tampering | npm/pip/cargo installs | mitigate | ningún plan de la fase instala paquetes; gate de legitimidad antes de cualquier install | closed | `git log -- package.json package-lock.json`: último commit `0cced7e` (fase 03, papaparse); **cero commits de la fase 07** sobre ambos archivos |

*Status: open · closed · closed (parcial)*
*Disposition: mitigate (implementación requerida) · accept (riesgo documentado) · transfer (tercero)*

---

## Accepted Risks Log

| Risk ID | Threat Ref | Rationale | Accepted By | Date |
|---------|------------|-----------|-------------|------|
| A-01 | T-07-24 (07-04) — portapapeles | El link copiado contiene el token de baja de una serie del PROPIO negocio y lo copia el owner deliberadamente para reenviárselo a su cliente (D-17). Es exactamente el mismo secreto que ya viaja en el mail de alta. Reforzado por 07-10: la credencial ya no viaja con el listado, sale de a UNA y sólo por acción explícita. | Plan 07-04 (`<threat_model>`), ratificado en auditoría | 2026-07-22 |
| A-02 | T-07-26 (07-06) — el barrido en cada reintento | El barrido es un UPDATE acotado por `(business_id, abono_id)` que usa `appointments_abono_id_idx` y afecta 0 filas después del primero. El costo por request es comparable al del preview que la misma superficie ya ejecuta; el token es de UNA serie y no permite amplificación cruzada. | Plan 07-06 (`<threat_model>`), ratificado en auditoría | 2026-07-22 |
| A-03 | T-07-32 (07-07) — `esc()` en `text`/`subject` | Se decide NO escapar ahí: no hay contexto de markup y las entidades se verían como basura para el lector. El riesgo residual (un `subject` con caracteres raros) lo contiene Resend. Verificado que el HTML — el único contexto con markup — sí escapa. | Plan 07-07 (`<threat_model>`), ratificado en auditoría | 2026-07-22 |
| A-04 | T-07-43 (07-09) — el `unknown` del preview | El flag sólo indica que la query de ESTA serie falló; no revela información sobre la existencia ni el contenido de otra serie ni de otro tenant. Verificado: `previewAbonoCancellation` ya viene acotado por `business_id` + `abono_id` antes de poder fallar. | Plan 07-09 (`<threat_model>`), ratificado en auditoría | 2026-07-22 |
| A-05 | T-07-49 (07-10) — una query por serie en el render | El número de series por negocio es chico y las queries van en paralelo (`Promise.all`); el costo es menor que traer todas las filas históricas de turnos, que es lo que se hacía antes. Si un negocio llegara a cientos de series, la evolución natural es una vista agregada. Anotado como deuda. | Plan 07-10 (`<threat_model>`), ratificado en auditoría | 2026-07-22 |
| A-06 | T-07-59 (07-12) — credenciales Supabase en test | Los tests skipean limpio sin credenciales (`describe.skipIf(!hasSupabaseCreds)`, `test/env.ts:7-10`), corren contra la base LOCAL y los fixtures borran lo que crean (`teardownOneTenant`). Mismo criterio que el resto de la suite. | Plan 07-12 (`<threat_model>`), ratificado en auditoría | 2026-07-22 |
| A-07 | T-07-60 (07-12) — mock parcial de `next/server` | El mock reemplaza SOLO `after` vía `importOriginal` y conserva el resto de los exports reales (`test/abono-cancel-routes.test.ts:51-60`). Riesgo residual: no se verifica el comportamiento de `after()` en el runtime de Vercel — lo cubre el checkpoint humano 07-05 y la verificación en staging. | Plan 07-12 (`<threat_model>`), ratificado en auditoría | 2026-07-22 |

### Riesgos residuales detectados en esta auditoría

Fuera del registro de amenazas de los planes. NO bloquean el ship, pero no deben desaparecer.

| Risk ID | Origen | Descripción | Recomendación |
|---------|--------|-------------|---------------|
| R-01 | IN-03, cierre parcial por D-10 | Los 8 templates PREEXISTENTES de `lib/email.ts` siguen interpolando el mail del destinatario en `console.log` (`:233`, `:352`, `:471`, `:859`, `:975`, `:1077`, `:1190`, `:1292`). La fase cerró IN-03 sólo para sus dos templates nuevos, que es exactamente lo que el review pedía y lo que D-10 permite. **El scoping es defendible**; el residual NO: son direcciones de clientes finales en los logs de Vercel, en un producto con vertical `salud` (Ley 25.326). | Ítem propio fuera de esta fase: reemplazar los 8 `console.log` por logs sin PII. Cambio mecánico, sin riesgo de regresión funcional (son logs, no control de flujo). |
| R-02 | IN-04, cierre parcial por D-10 | La ruta hermana VIVA `/cancelar/[token]` (cancel de turno suelto) sigue sin `robots: noindex`, y su URL también lleva un `cancel_token` que no rota ni vence. Una indexación sería una fuga permanente de una credencial de producción. **El scoping es defendible** (D-10 prohíbe tocar un flujo crítico vivo dentro de esta fase), pero el hueco es real y preexistente. | Ítem propio: agregar `robots: { index: false, follow: false }` a `app/cancelar/[token]/page.tsx`. Es una línea de metadata, sin efecto sobre el flujo. |
| R-03 | T-07-55, prueba de mutación no ejecutada | El test de carrera existe, corre contra Postgres real y pasa (re-ejecutado acá: 16/16). Lo que NO está probado es su **sensibilidad**: que fallaría si el gate atómico desapareciera. **El razonamiento del 07-12-SUMMARY es incompleto:** afirma que sin el gate "las dos requests entrarían las dos a la rama ganadora", pero el handler tiene ADEMÁS un pre-chequeo de estado (`app/api/abonos/cancel/[token]/route.ts:71`). Si las dos POST llegaran a serializarse, ese pre-chequeo absorbería la segunda y el test daría verde **igual sin el gate** — indistinguible del verde actual. Por la estructura del handler (los dos SELECT se emiten antes que cualquier UPDATE) el interleaving es prácticamente seguro, y el control SÍ está en el código (`lib/abono-cancel.ts:215`), pero la prueba empírica de sensibilidad falta. | Cerrar con la mutación cuando se pueda tocar el árbol: comentar `.neq('status','cancelled')` en `lib/abono-cancel.ts:215` y correr SOLO `npx vitest run test/abono-cancel-routes.test.ts`. Para que sea concluyente conviene comentar **también** el pre-chequeo del handler (`route.ts:71`), si no la mutación puede quedar enmascarada por él. Revertir ambos. ~2 minutos, un solo archivo de test. |

*Los riesgos aceptados no vuelven a aparecer en futuras corridas de auditoría; los residuales R-01..R-03 sí, hasta que se cierren o se promuevan a ítem propio.*

---

## Unregistered Flags (WARNING)

Superficie que apareció durante la implementación sin mapeo a una amenaza del registro. No bloquean.

| Flag | Descripción | Severidad | Nota |
|------|-------------|-----------|------|
| W-01 | En los dos templates nuevos, `businessSlug` y `primary_color` se interpolan **sin `esc()`** dentro de HTML: `lib/email.ts:563,586,591` (`style="background:${accent}"`, `href="${bookingUrl}"`) y `:592`. La mitigación declarada de T-07-28 dice "`esc()` sobre TODO valor dinámico que entra al HTML". Los valores controlados por el atacante real del threat model (`clients.name`, teléfono, email, servicio) **sí** están escapados; estos dos son owner-controlled. | Baja | Patrón PREEXISTENTE en los 10 templates del módulo, no introducido por la fase. El proyecto ya tiene un `isSafeColor` en `lib/landing/builder.ts:50` — candidato natural si se decide cerrarlo. Un dueño malicioso podría romper el atributo `style` en el mail a sus PROPIOS clientes; no cruza tenants. |
| W-02 | El plan 07-07 modificó los helpers **compartidos** `renderEmailHeader` (ahora escapa) y `resendSend` (ahora aborta a 10 s). Los consumen los 8 templates VIVOS en producción. T-07-11 (plan 07-02) había declarado "los templates vivos no se modifican" — cierto para 07-02, superado por 07-07 con dos amenazas propias (T-07-28, T-07-30). | Informativa | Es un cambio de comportamiento en el path de mail de producción (todos los verticales, no sólo abonos). Cubierto por la suite completa en verde (723) y por `test/auth-email-templates.test.ts` / `test/manual-notify-email.test.ts`. Se registra para que no quede implícito. |

---

## Verificaciones ejecutadas en esta auditoría

| Verificación | Comando / método | Resultado |
|---|---|---|
| Suite a nivel ruta de las dos vías (T-07-55..58) | `npx vitest run test/abono-cancel-routes.test.ts --no-file-parallelism` | `Test Files 1 passed (1)` · `Tests 16 passed (16)` — **no skipeó**: las credenciales locales estaban presentes, la carrera corrió contra Postgres real |
| Invariante estrella D-07 | `grep "from('appointments')"` en los dos route handlers de baja | 0 matches en ambos ⇒ una sola implementación de la baja |
| Doble scoping del motor (D-24) | lectura de `lib/abono-cancel.ts` — 3 UPDATE | los 3 llevan `.eq('business_id')`; los 2 sobre `appointments` llevan además `.eq('abono_id')` + `.gte('date')` + `.neq('status')` |
| Sin reactivación (D-04) | grep de escrituras de `status:'active'` en motor, rutas y UI | 0 matches (sólo comentarios y filtros de lectura) |
| Rutas vivas intactas (D-10) | `git log -- app/cancelar/[token]/page.tsx app/api/cancel/[token]/route.ts` | último commit de fase 01; ningún commit de la fase 07 |
| Migraciones aplicadas no enmendadas | `git log -- supabase/migrations/054_abonos.sql 055_abono_window_bounds.sql` | últimos commits de la **fase 06**; la fase 07 no las toca |
| DDL acotado de la 056 | `grep -iE "alter table\|create policy\|create function\|drop "` | 0 matches |
| Aislamiento del Edge (T-07-17) | `grep "abono" lib/auth/route-lists.ts proxy.ts` | 0 matches ⇒ hereda el tratamiento de `/cancelar/[token]` |
| Fuente única del corte de fecha (T-07-50) | `grep -rn "function toISODate" app/ lib/` | una sola definición |
| Cadena de suministro (T-07-SC) | `git log -- package.json package-lock.json` | cero commits de la fase 07 |
| Suite completa + build + `tsc` | no re-ejecutados (instrucción explícita) | evidencia tomada de `07-VERIFICATION.md:72-77` (723 passed / 1 skipped, `tsc --noEmit` exit 0) |

---

## Security Audit Trail

| Audit Date | Threats Total | Closed | Open | Run By |
|------------|---------------|--------|------|--------|
| 2026-07-22 | 68 | 68 (1 con verificación parcial: T-07-55) | 0 | gsd-security-auditor (Claude) |

---

## Sign-Off

- [x] Todas las amenazas tienen disposición (61 mitigate · 7 accept · 0 transfer)
- [x] Riesgos aceptados documentados en el Accepted Risks Log (A-01..A-07)
- [x] Riesgos residuales fuera de registro documentados (R-01..R-03)
- [x] Unregistered flags documentados (W-01, W-02)
- [x] `threats_open: 0` confirmado
- [x] `status: verified` en frontmatter
- [x] Ningún archivo de implementación modificado por esta auditoría

**Approval:** verified 2026-07-22

**Condición de seguimiento (no bloqueante):** R-03 — correr la prueba de mutación de T-07-55 con la
receta del Accepted Risks Log antes de que el milestone cierre. R-01 y R-02 quedan como ítems propios
fuera de la fase (D-10 los excluyó a propósito).
