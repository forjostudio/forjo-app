---
phase: 03
slug: booking-publico-de-alquiler
status: verified
threats_open: 0
asvs_level: 1
created: 2026-07-02
---

# Phase 03 — Security

> Per-phase security contract: threat register, accepted risks, and audit trail.
> Registro autorizado en plan-time (`<threat_model>` de 03-01/02/03-PLAN.md). Relevancia **ALTA**
> (público + concurrencia). Las mitigaciones fueron verificadas contra el código real por gsd-verifier
> (anti-tampering en `create/route.ts:110-127`, `public_canchas` sin `service_id`/`security_invoker`,
> gateo aditivo por vertical) + tests (canchas-booking 11/11 incl. cross-tenant y serviceId-ignorado;
> concurrency CONC-03; landing 26/26). `threats_open: 0` y registro plan-time → short-circuit.

---

## Trust Boundaries

| Boundary | Description | Data Crossing |
|----------|-------------|---------------|
| anon (browser) → `/[slug]` (RSC) | El cliente final no autenticado lee canchas vía `public_canchas` (única superficie de lectura anon del modelo de cancha); el client component solo recibe datos mostrables. | `{ id, name, price, duration_minutes }` — SIN `service_id` ni config interna |
| anon (browser) → `/api/booking/create` | El cliente manda `professionalId` (la cancha); NUNCA se confía en `serviceId`/precio del cliente. | reserva (professionalId, fecha, hora, datos del cliente) |
| route handler (service-role) → DB | Tenant resuelto por slug; toda entidad re-validada por `business_id`; `book_slot_atomic` da la atomicidad. | derivación del service + insert atómico del turno |

---

## Threat Register

| Threat ID | Category | Component | Disposition | Mitigation | Status |
|-----------|----------|-----------|-------------|------------|--------|
| T-03-01 | Information Disclosure | `public_canchas` expone el puntero `service_id` | mitigate | El SELECT lista SOLO `id/business_id/name/price/duration_minutes`; `service_id` vive únicamente en JOIN+WHERE (D-01). Verificado. | closed |
| T-03-02 | Elevation of Privilege | `security_invoker` mal aplicado rompe/abre la lectura anon | mitigate | Molde `public_services` (OWNER postgres, SIN `security_invoker`); verificado en el DDL real (solo aparece en comentarios que explican por qué NO). | closed |
| T-03-03 | Information Disclosure | La vista expone canchas soft-deleted | mitigate | `WHERE p.active AND s.active` (el soft-delete de Phase 2 desactiva ambos). | closed |
| T-03-04 | Tampering / Elevation | Reservar una cancha de OTRO tenant (`professionalId` ajeno) | mitigate | La derivación lee `professionals` con `.eq('business_id', business.id)`; cancha ajena → `service_id` null → `invalid_service 400`. El core re-valida por `business_id` (doble barrera). Test cross-tenant verde. Verificado `route.ts:110-127`. | closed |
| T-03-05 | Tampering | `serviceId`/precio/duración forjados por el cliente | mitigate | En el caso canchas el service se DERIVA del professional server-side; **cualquier `serviceId` del body se ignora** (gate por `professionals.service_id` no-nulo); el precio nunca llega del cliente. Test "serviceId ignorado" verde. **[control crítico de la fase]** | closed |
| T-03-06 | Tampering (race) | Sobre-reserva concurrente entre canchas que comparten espacio | mitigate | El service derivado va al core → `book_slot_atomic` (advisory lock por espacio + EXISTS cross-bucket + EXCLUDE) SIN cambios; NUNCA un count/check suelto como autoridad. `book_slot_atomic`/`booking-core.ts` sin tocar. CONC-03 + caso ALQUILER-02. | closed |
| T-03-07 | Business Logic bypass | Regresión: romper el path legacy al ampliar el guard | mitigate | Guard ampliado a `(serviceId || professionalId)`; el path con `serviceId` (salud/belleza/general) queda byte-idéntico. `booking-public-regression.test.ts` verde. | closed |
| T-03-08 | Information Disclosure | El RSC/client expone config interna de la cancha al anon | mitigate | `page.tsx` lee `public_canchas` (vista acotada); el client recibe solo `{ id, name, price, duration_minutes }`. No lee tablas base con anon. | closed |
| T-03-09 | Tampering | El client manda `serviceId`/precio al create | mitigate | El POST solo lleva `professionalId=cancha.id`; el server deriva el service. Prohibición en must_haves; acceptance niega `serviceId` en el body. | closed |
| T-03-10 | Denial of Service | Envoltorio en `<section id="reservar">` rompe calendario/toasts | mitigate | El renderer NO agrega `transform/overflow-hidden/position:fixed|sticky/filter` alrededor de la sección (caja negra); el booking va como prop sin wrappers. Verificado. | closed |
| T-03-11 | Business Logic bypass | El gateo por vertical rompe salud/belleza/general | mitigate | Gateo aditivo: solo con `key==='canchas'` cambia el componente; el resto renderiza `BookingClient` byte-idéntico. Checkpoint humano PASS + tests landing 26/26. | closed |
| T-03-12 | Spoofing / Business Logic | El flujo canchas saltea reCAPTCHA / gate de plan | mitigate | Reusa `/api/booking/create` + `/api/payment/create` SIN cambios → hereda reCAPTCHA fail-closed y el gate `plan_status`. No se reimplementa ningún guard. | closed |
| T-03-SC | Tampering | npm/pip/cargo installs (supply-chain) | accept | La fase NO instala paquetes (cero dependencias nuevas; solo componentes ya en `@/components/ui`). | closed |

*Status: open · closed*
*Disposition: mitigate (implementation required) · accept (documented risk) · transfer (third-party)*

---

## Accepted Risks Log

| Risk ID | Threat Ref | Rationale | Accepted By | Date |
|---------|------------|-----------|-------------|------|
| AR-01 | T-03-SC | Cero dependencias nuevas; sin superficie de supply-chain. | Forjo Studio | 2026-07-02 |

*Accepted risks do not resurface in future audit runs.*

---

## Security Audit Trail

| Audit Date | Threats Total | Closed | Open | Run By |
|------------|---------------|--------|------|--------|
| 2026-07-02 | 13 | 13 | 0 | secure-phase (short-circuit: registro plan-time, threats_open 0; mitigaciones verificadas por gsd-verifier + tests + lectura del código del control crítico T-03-05) |

---

## Sign-Off

- [x] All threats have a disposition (mitigate / accept / transfer)
- [x] Accepted risks documented in Accepted Risks Log
- [x] `threats_open: 0` confirmed
- [x] `status: verified` set in frontmatter

**Approval:** verified 2026-07-02
