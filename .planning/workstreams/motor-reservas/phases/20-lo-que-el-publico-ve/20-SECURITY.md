---
phase: 20
slug: lo-que-el-publico-ve
status: verified
threats_open: 0
asvs_level: 2
created: 2026-09-11
---

# Phase 20 — Security

> Per-phase security contract: threat register, accepted risks, and audit trail.

Registro **autorizado en plan-time** (los dos PLAN traen `<threat_model>`), así que la auditoría
verificó mitigaciones existentes en vez de construir un STRIDE retroactivo. Las pruebas se corrieron
contra el **Supabase local** con las migr. 071-076 aplicadas: un segundo tenant se sembró para las
pruebas empíricas y se borró al terminar (la base quedó con `negocio-prueba` únicamente).

---

## Trust Boundaries

| Boundary | Description | Data Crossing |
|----------|-------------|---------------|
| Cliente anónimo (browser) → RSC `/[slug]` | El único input no confiable es el `slug` de la URL, ya resuelto contra `public_businesses` antes del `Promise.all` (`page.tsx:60-66`) | slug público |
| RSC → vista `public_time_block_services` | Lectura con **anon key sin cookies** (`createPublicServerClient()`, `lib/supabase/public.ts:6-11`). La vista es DEFINER y **no filtra por sí sola** (contrato D-16): el aislamiento lo pone el `.eq('business_id', business.id)` del caller | mapeo franja↔servicio (tripletas de UUID del negocio pedido) |
| Cliente anónimo (browser) → estado de React de `BookingClient` | `selectedService`, `enabled`, `disabled` son client-side y manipulables por devtools; **nunca** son el control de seguridad, solo UX | estado de UI |
| `BookingClient` → `POST /api/booking/create` | El create re-valida server-side el eje **franja** (`enforceServiceWindow` → `isServiceAllowedAt`, Phase 18). El eje **staff** no tiene gate server-side (ver T-20-07) | serviceId, professionalId, fecha/hora, datos del cliente |

---

## Threat Register

| Threat ID | Category | Component | Disposition | Mitigation | Status |
|-----------|----------|-----------|-------------|------------|--------|
| T-20-01 | Information Disclosure | Query nueva en `app/[slug]/page.tsx` podría filtrar el mapeo de otro negocio | mitigate | `.eq('business_id', business.id)` en `page.tsx:109`, cliente anon. **Verificado empíricamente**: con un 2º tenant sembrado, la lectura anon *sin* filtro devolvió filas de 2 `business_id` distintos; *con* filtro, 13 filas y 1 solo id. El filtro es load-bearing y está puesto | closed |
| T-20-02 | Tampering | La vista `public_time_block_services` podría quedar escribible por `anon` (repetición del CR-01 de la Phase 18) | accept | Mitigado aguas arriba en la Phase 18 (migr. 072/073). Confirmado vivo: `schema.sql:1426-1433` (cuerpo de la vista, sin `security_invoker`) y `:4356-4358` (`GRANT SELECT` solo a `anon`/`authenticated`). Regression-locked por `test/isolation.test.ts` (8 aserciones, verdes) | closed |
| T-20-03 | Denial of Service (fallo mudo) | Un fallo de lectura podría **apagar** servicios en vez de degradar al comportamiento de hoy | mitigate | Guard en `booking-client.tsx:586` (`timeBlocks.length === 0 \|\| isServiceScheduled(...)`, commit `42bd134`) + fail-safes de la puente en `page.tsx:176` y `booking-client.tsx:197,586`. Barrido de la misma clase de inversión en todos los consumidores: sin otro caso dentro de la fase | closed |
| T-20-04 | Elevation of Privilege | Quitar el pre-filtro `bookableServices` de `page.tsx` (D-05) podría leerse como aflojar un control | accept | El pre-filtro solo achicaba el array renderizado; **no cambiaba el conjunto de POSTs que el server acepta**. Los UUID de servicio ya eran enumerables por `public_services` (DEFINER, `GRANT SELECT` a anon, predicado `WHERE active = true`) antes y después | closed |
| T-20-05 | Tampering | Request forjada a `/api/booking/create` con un `serviceId` cuya tarjeta está deshabilitada | accept | El `disabled` es UX. La autoridad es el backstop server-side: `create/route.ts:227` pasa `enforceServiceWindow: true` → `booking-core.ts:218-264` rechaza con 400 `service_not_scheduled`. Ninguno de los dos archivos aparece en el diff de la fase | closed |
| T-20-06 | Information Disclosure | El motivo "Sin profesional disponible" podría filtrar configuración interna del negocio | mitigate | `booking-client.tsx:637-639`: las únicas dos cadenas son `'Sin horarios disponibles'` y `'Sin profesional disponible'`. Sin nombres de profesionales, sin conteos, sin instrucciones del panel (`asignalo en Equipo` ausente) | closed |
| T-20-07 | Elevation of Privilege | Un booking con un profesional que NO cubre el servicio elegido no se re-valida server-side | accept | Preexistente y sin cambios en esta fase. Grep de `professional_services\|isServiceStaffed\|professionalsForService` sobre `booking-core.ts` + `create/route.ts` → **sin matches**; `booking-core.ts:275-284` valida solo pertenencia al tenant. **Residual real — ver Accepted Risks** | closed |
| T-20-08 | Denial of Service | El filtro de días (D-04, `serviceBlocks`) podría ocultar un día que hoy sí está disponible | mitigate | `booking-client.tsx:196-198`: `blocksForService` es un `.filter()` puro sobre `timeBlocks` ⇒ subconjunto por construcción; con `selectedService` nulo cae a `timeBlocks` completo. Greps anti-regresión intactos (`weekly` = 1, `locHasBlocks` = 1, `.filter(r => r.service_id` = 0) | closed |
| T-20-SC | Tampering (supply chain) | npm installs | accept | `git diff 7904fa3^..HEAD -- package.json package-lock.json` vacío | closed |

*Status: open · closed*
*Disposition: mitigate (implementation required) · accept (documented risk) · transfer (third-party)*

---

## Accepted Risks Log

| Risk ID | Threat Ref | Rationale | Accepted By | Date |
|---------|------------|-----------|-------------|------|
| AR-20-01 | T-20-02 | Escritura anónima sobre `public_time_block_services` mitigada aguas arriba en la Phase 18 (migr. 072/073: `REVOKE ALL` + `GRANT SELECT`, sin `security_invoker`). Esta fase solo **consume** la vista, no la crea ni la re-permisa. Regression-locked por `test/isolation.test.ts` ("agenda por servicio"), cuyo probe de DELETE **sí manda un `WHERE`** (`.eq('business_id', ...)`) contra una fila sembrada — no es el caso inútil del DELETE pelado que PostgREST rebota con `21000`. Residual: ninguno | franco | 2026-09-11 |
| AR-20-02 | T-20-04 | El pre-filtro `bookableServices` del RSC era UX, nunca un control: solo achicaba el array renderizado. Los UUID de servicio ya eran enumerables por `public_services` desde antes, y `/api/booking/create` nunca chequeó cobertura de staff — o sea que el estado previo a la fase **no impedía nada que un POST forjado no pudiera hacer igual**. El delta es comodidad para alguien con devtools, no capacidad nueva. La fase no amplió exposición | franco | 2026-09-11 |
| AR-20-03 | T-20-05 | El `disabled` del paso 1 es UX; la autoridad server-side es `enforceServiceWindow` → `isServiceAllowedAt`, que esta fase no tocó ni debilitó (ninguno de los dos archivos está en el diff) | franco | 2026-09-11 |
| AR-20-04 | T-20-07 (= WR-01 del code review) | **El eje staff no tiene ningún gate server-side.** Un servicio sin profesional que lo haga se puede reservar por POST directo —eventualmente con seña paga— sin que nadie esté mapeado para cumplirlo. Es **preexistente** y esta fase no lo empeora, pero al quitarse el pre-filtro del RSC (D-05) pasó a ser **el único eje del flujo de booking sin autoridad server-side**, lo que choca con el principio ASVS V1.4/V4.1 de decidir accesos en el servidor. Se acepta para no ampliar el alcance de AGENDA-07, **con dueño y con seguimiento**: ver el todo `2026-09-11-el-eje-staff-no-tiene-backstop-server-side.md`, que propone un `service_not_staffed` espejo de `enforceServiceWindow` | franco | 2026-09-11 |
| AR-20-05 | T-20-SC | Cero dependencias nuevas; verificado con `git diff` vacío sobre `package.json` y `package-lock.json` | franco | 2026-09-11 |

---

## Security Audit Trail

| Audit Date | Threats Total | Closed | Open | Run By |
|------------|---------------|--------|------|--------|
| 2026-09-11 | 9 | 9 | 0 | gsd-security-auditor (opus) |

**Pruebas ejecutadas en esta auditoría** (no tomadas de los SUMMARY):

- `npx vitest run test/schedule-coverage-public.test.ts test/service-coverage-public.test.ts test/time-block-services.test.ts` → **3 archivos, 36 passed**, casos DB-backed realmente ejecutados contra la instancia local.
- `npx vitest run test/isolation.test.ts -t "agenda por servicio"` → **8 passed**.
- Prueba empírica de aislamiento con un 2º tenant sembrado y luego borrado (lectura anon con y sin `business_id`).

---

## Notas que sobreviven a esta fase

**Cuál de los dos tests de cobertura sirve como evidencia.** `test/schedule-coverage-public.test.ts`
es el confiable: arma un cliente **anon pelado** (`createClient(URL, ANON_KEY, { auth: { persistSession: false } })`),
asierta `error === null` en las dos lecturas y asierta **cantidad de filas** antes de aplicar la
regla, así que un 0-filas silencioso no puede pasarlo. Su hermano `test/service-coverage-public.test.ts:69-78`
lee las vistas con **`t.admin` (service role)** pese a que su docstring dice ejercitar "las MISMAS
vistas acotadas que el RSC": seguiría verde con los grants completamente rotos. Tratarlo como test
unitario de `bookableServices`, **nunca** como evidencia sobre RLS o permisos (es el WR-05 del review).

**El guard de T-20-03 no tiene test propio.** El test que sumó `42bd134`
(`test/time-block-services.test.ts:100-113`) fija el contrato del **helper**, no la guarda del
**caller**: borrar `timeBlocks.length === 0 ||` de `booking-client.tsx` deja la suite entera verde.
Es un residual de cobertura, no una amenaza reabierta — la mitigación está en el código que se
despliega. Candidato a cerrar cuando `booking-client.tsx` tenga tests de componente.

**Un caso de la misma clase de inversión, preexistente y fuera de la fase.**
`app/api/booking/availability/route.ts:225-245`: si falla la lectura de `professionals`,
`prosRaw || []` ⇒ `capaces = []` ⇒ se ocultan todos los slots en la rama `any=1`. Falla **cerrado**
(oculta disponibilidad), está comentado como intencional y es código de la Phase 10 — no toca T-20-03,
pero queda anotado porque es el mismo patrón.

**Exposición informativa, no ampliada aquí.** La vista `public_time_block_services` es DEFINER y sin
RLS, así que una llamada anon a PostgREST **sin** filtro por `business_id` devuelve el mapeo de todos
los tenants (reproducido en esta auditoría). El `.eq()` del caller **es** el mecanismo de aislamiento
completo de esta vista. Es el patrón repo-wide de las vistas `public_*` (IN-05 del review), vigente
desde la migr. 071/072 y no introducido por esta fase.

---

## Sign-Off

- [x] All threats have a disposition (mitigate / accept / transfer)
- [x] Accepted risks documented in Accepted Risks Log
- [x] `threats_open: 0` confirmed
- [x] `status: verified` set in frontmatter
