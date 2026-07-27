# Phase 10 — Reservar con "Cualquiera" desde la página pública — Security Verification

**Workstream:** motor-reservas
**Verified:** 2026-07-27
**ASVS Level:** 1
**block_on:** high
**Register origin:** authored at plan time (`register_authored_at_plan_time: true`) — verification confirms each declared mitigation exists in the shipped code; no blind scan for new threats.
**Migration status:** 059 + 060 applied to LOCAL. PROD apply is a manual deploy step (059 + 060 + `NOTIFY pgrst, 'reload schema';` + regen `supabase/schema.sql`) — code degrades fail-safe until then.

**Result:** SECURED — 14/14 threats closed (14 mitigate).

---

## Threat Verification

| Threat ID | Category | Disposition | Status | Evidence |
|-----------|----------|-------------|--------|----------|
| T-10-01 | Information Disclosure (rama `any` de availability) | mitigate | CLOSED | `app/api/booking/availability/route.ts:230` returns `{ ok: true, busy: [], full: fullAny }`. `fullAny` is a boolean-per-slot list of `'HH:MM'` start-times (`:203-227`): a start-time enters `full` only when `!someoneFree` (no capable pro free). No counts, no `professional_id`, no per-pro entry ever serialized. Union computed server-side at start-time granularity (`:207-225`), never concatenated `busy` (which would be the intersection — documented `:96-100`). |
| T-10-02 | Information Disclosure (vista `public_professional_services`, 059) | mitigate | CLOSED | `supabase/migrations/059_public_professional_services.sql:47-54` — definer view (`OWNER TO postgres`, `:54`), exactly 3 non-sensitive columns (business_id, professional_id, service_id, `:48-50`), **no** `security_invoker` (grep-confirmed absent). Base table `professional_services` stays closed to anon: `057_professional_services.sql:54-81` enables RLS with 4 owner-scoped policies, **no** anon policy. RSC reads it filtered by tenant: `app/[slug]/page.tsx:97` `.eq('business_id', business.id)`. |
| T-10-03 | Tampering / EoP (create → asignación "Cualquiera") | mitigate | CLOSED | `app/api/booking/create/route.ts:38` `const anyProfessional = body.anyProfessional === true` (strict boolean — never an id as assignment); `:173` passes `autoAssign: anyProfessional` to `createAppointmentCore`. Client `professionalId` never used as the "Cualquiera" assignment; RPC 058 selects the pro under advisory lock and RAISEs `slot_taken` if no candidate. Tenant anti-tampering intact (`:141` `.eq('business_id', business.id)` on the cancha derivation). |
| T-10-04 | Business logic bypass (guards del create) | mitigate | CLOSED | Order preserved in `app/api/booking/create/route.ts`: plan_status gate `:80-82` → booking window backstop `isDateOutOfWindow` `:92-94` → reCAPTCHA `:103-108` — all BEFORE `createAppointmentCore` `:158`. `autoAssign` is passed as a core arg (`:173`) and does not reorder or gate any of the three guards (D-10). |
| T-10-05 | Information Disclosure / Spoofing (fuente del nombre del profesional) | mitigate | CLOSED | Name comes from the join on the already-created appointment, never from the front. No-seña path: `app/api/notify/booking/route.ts:19` select includes `professionals(name)`, `:37` `professionalName = (appt.professionals ...)?.name || null`, passed at `:62`. Con-seña path: `app/api/payment/webhook/[slug]/route.ts:111` select includes `professionals(name)`, `:170` derives name, passed at `:189`. On-screen: `components/booking/confirmation-view.tsx:163-165` renders from `professionalName` prop. |
| T-10-06 | Injection (HTML) (fila nueva del mail) | mitigate | CLOSED | `lib/email.ts:313-317` — conditional row renders `esc(professionalLabel)` (`:315`) and `esc(professionalName)` (`:316`); plain-text line `:366` interpolates the raw value (not HTML, per module policy). `esc()` (`:142-150`) escapes `& < > " '`. Same pattern as `esc(service)`/`esc(clientName)`. |
| T-10-07 | Tampering (señal del front hacia create) | mitigate | CLOSED | `app/[slug]/booking-client.tsx:130` `const isAny = selectedPro === 'none' && showAny` where `showAny = capaces.length >= 2` (`:126`). Create body `:349-350`: `professionalId: isAny ? null : proId`, `anyProfessional: isAny` — boolean gated on ≥2 capable pros, never an id as assignment. Authority is server/RPC; a forged boolean without capable pros falls to `slot_taken` (backstopped by Plan 01 / RPC 058). |
| T-10-08 | Information Disclosure (grilla agregada en el client) | mitigate | CLOSED | `app/[slug]/booking-client.tsx:262-263` — the client consumes only `busy = data.busy || []` and `full = data.full || []`; no counts, no per-pro data received or inferred. The aggregation happened server-side (T-10-01). |
| T-10-09 | Regression (gemelo canchas) | mitigate | CLOSED | `app/[slug]/page.tsx:160` passes `professionalServices` prop only to `<BookingClient>`; `<CanchasBookingClient>` (`:144-151`) never receives it. All new behavior is behind `showAny`/`isAny`, which canchas never triggers. `canchas-booking-client.tsx` has no Phase 10 commit (last touch `3913269`, a pre-Phase-10 header fix). |
| T-10-10 | Information Disclosure (test — contrato acotado de la rama any) | mitigate | CLOSED | `test/booking-cualquiera-public.test.ts:164` and `:184` assert `expect(body.busy).toEqual([])`; DISP-01 (`:166-168`) and DISP-03 (`:186-188`) assert only on `full` membership. Verifies T-10-01/D-06. |
| T-10-11 | Tampering (test — wiring anyProfessional→autoAssign) | mitigate | CLOSED | `test/booking-cualquiera-public.test.ts:242` `expect(assigned).not.toBeNull()`, `:244` `not.toBe(SENTINEL_NONE)`, `:245` `not.toBe('...001')`; sentinel case (`:251`) asserts NULL without the flag. Confirms the create with `anyProfessional:true` assigns a real pro (not the SENTINEL bucket). Verifies T-10-03/T-10-07. |
| T-10-12 | Regression (test — gemelo canchas + single-pro) | mitigate | CLOSED | DISP-02 test `test/booking-cualquiera-public.test.ts:204` asserts `Object.keys(aBody).sort()` equals `['busy','full','ok']` (byte-identical contract for a specific `professionalId`). Regression suites present: `test/canchas-booking.test.ts`, `test/booking-public-regression.test.ts`, `test/staff-assignment.test.ts` (verified via `npx vitest run` in Plan 04). Verifies D-08/D-09/SC5. |
| T-10-13 | Information Disclosure (UAT visual — grilla + confirmación) | mitigate | CLOSED | `10-05-SUMMARY.md:5,8-12` — human UAT APPROVED against local DB with view 059 live: aggregate grid shows only free/full (no counts, no per-pro, D-06) and confirmation shows the server-assigned professional (D-04). Verifies T-10-01/T-10-05 in the real flow. |
| T-10-14 | Information Disclosure (hardening — fuga de cancha a la lista pública de staff) | mitigate | CLOSED | `supabase/migrations/060_public_professionals_exclude_canchas.sql:29-37` — `public_professionals` now `WHERE active = true AND service_id IS NULL`: a cancha (professionals row with `service_id` NOT NULL) never appears as a staff professional in public booking; real staff (service_id NULL) intact. `test/public-professionals-excludes-canchas.test.ts:51-52` asserts `ids` contains the staff pro and NOT the cancha id. |

---

## Supporting checks

- **`any` branch returns before the specific bucketing** (`app/api/booking/availability/route.ts:101` guard, `:230` return) → the specific/omitido path (`:233+`) is byte-identical to pre-phase (DISP-02/D-08). Canchas never sends `any=1`.
- **Service duration re-validated by tenant in the `any` branch** (`availability/route.ts:104-110` `.eq('id', serviceIdParam).eq('business_id', business.id)`; `invalid_service` 400 if not this business) — no trust in a foreign `serviceId` even on a read path.
- **Capable-pro criterion mirrors the RPC 058** (`availability/route.ts:120-125` `active=true AND service_id IS NULL`, excluding canchas) and reuses the single wildcard source `professionalsForService` (`lib/staff-services.ts:43-53`) — the rule is not re-implemented in the endpoint.
- **`schema.sql` regeneration + prod apply of 059/060** are a manual deploy step (documented `059:38-44`, `060:22-25`, `10-05-SUMMARY.md:25-27`); no `supabase db push`/`--linked` added to any script. Fail-safe: without the views, `page.tsx:97` `|| []` degrades and "Cualquiera" simply is not gated with precision — the existing booking keeps working.

---

## Unregistered Flags

None. None of `10-01-SUMMARY.md`..`10-05-SUMMARY.md` contains a `## Threat Flags` section. The one new attack surface that appeared during implementation — the risk of a cancha row leaking into the public staff list — was raised by the human UAT operator and is registered and mitigated as **T-10-14** (migration 060 + test). No new attack surface remains unmapped.

---

## Deployment note (pending, non-blocking)

Migrations **059** and **060** are applied to LOCAL only. Apply to PROD manually + `NOTIFY pgrst, 'reload schema';` + regenerate `supabase/schema.sql`. Until then the feature degrades fail-safe (no regression of the current booking).
