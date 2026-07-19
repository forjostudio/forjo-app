---
phase: 04
slug: ventana-de-reserva-p-blica
status: verified
threats_open: 0
asvs_level: 1
created: 2026-07-19
---

# SECURITY — Phase 04: Ventana de reserva pública

**Workstream:** motor-reservas · **Milestone:** v0.22
**ASVS Level:** 1 · **block_on:** high
**Verdict:** SECURED — 11/11 threats resueltos (8 mitigate CLOSED · 3 accept documentados)
**Audited:** 2026-07-19 · register authored at plan-time (register_authored_at_plan_time: TRUE)

El threat register se escribió a plan-time en los 4 planes. Este audit verifica que cada
mitigación con `disposition=mitigate` existe en el código implementado (grep + lectura), y que
cada `accept` está documentado acá. No se escanean amenazas nuevas.

---

## Threat Verification

| Threat ID | Category | Disposition | Status | Evidence |
|-----------|----------|-------------|--------|----------|
| T-04-01 | Information Disclosure | mitigate | CLOSED | `supabase/schema.sql:677-699` — la vista `public_businesses` expone 20 columnas (18 previas + `max_advance_days`, `max_advance_date` al final); ninguna columna secreta (`mp_access_token`, `resend_api_key`, `recaptcha_secret_key`, `google_refresh_token`) entra. Migración `supabase/migrations/052_booking_window.sql:41-66` agrega solo las 2 columnas config-públicas al final del `CREATE OR REPLACE VIEW` + `GRANT SELECT ... TO anon, authenticated`. |
| T-04-02 | Information Disclosure | mitigate | CLOSED | `app/[slug]/page.tsx:45-49` — read-path por `.from('public_businesses').select(... max_advance_days, max_advance_date)` (vista acotada), nunca `businesses` con anon. Comentario L43-44 documenta explícitamente evitar la fuga de secretos por tenant (fuga que cerró la migr. 026). |
| T-04-03 | Tampering (integridad DB) | accept | DOCUMENTED | Ver Accepted Risks #1. Migración aditiva: columnas nullable con `DEFAULT 30`, sin drop ni cambio de tipo (`052_booking_window.sql:36-38`); RLS de `businesses` intacta (no se agregó policy); validada con `supabase db reset` local. |
| T-04-05 | Tampering / EoP | mitigate | CLOSED | `app/(dashboard)/agenda/agenda-client.tsx:333` — `supabase.from('businesses').update(payload).eq('id', business.id)`; el payload solo toca `max_advance_days`/`max_advance_date` (L325/328/330), nunca `plan_status` ni columnas sensibles; RLS owner-only de `businesses` respalda el aislamiento. |
| T-04-06 | Integridad de config | mitigate | CLOSED | `app/(dashboard)/agenda/agenda-client.tsx:322-331` — los 3 modos escriben una columna y **nulean siempre la otra** (`dias`→`{days, null}`, `fecha`→`{null, date}`, `sin_limite`→`{null, null}`); nunca deja ambas seteadas (Pitfall 4). |
| T-04-07 | Tampering (cap UX) | accept | DOCUMENTED | Ver Accepted Risks #2. El cap del calendario es UX, no control de seguridad; un cliente lo puede saltear (devtools / request directa). La autoridad real es el backstop server T-04-09. |
| T-04-08 | Regresión funcional | mitigate | CLOSED | `app/[slug]/booking-client.tsx:586` y `app/[slug]/canchas-booking-client.tsx:444` — el cap se **suma** a la condición existente y se gatea por `cutoff != null` (`... \|\| (cutoff != null && isAfter(startOfDay(d), cutoff))`); el cap del botón de mes también (`cutoffMonth != null && ...`, L569 / L427). Con `cutoff` null el comportamiento es byte-idéntico (cero regresión). Texto "Reservas hasta el" gateado por `{cutoff && ...}` en ambos (L611-612 / L469-470). |
| T-04-09 | Tampering (fecha en body POST) | mitigate | CLOSED | `app/api/booking/create/route.ts:79-80` — `if (isDateOutOfWindow(business, date)) return ... error:'date_out_of_window', status:400`. Corre con service-role (`createAdminClient()`, L49), server-side, **independiente del cap del calendario**, con el helper compartido en hora AR (`lib/booking-window.ts:59-63`, `todayInAR` offset -03:00). |
| T-04-10 | Integridad de datos (orphans) | mitigate | CLOSED | `app/api/booking/create/route.ts` — el guard (L79-80) corre tras el gate de `plan_status` (L67-69) y **ANTES** del insert de `clients` (L99-101), evitando filas `clients` huérfanas (Pitfall 3). |
| T-04-11 | EoP / Bypass (exención alta manual) | mitigate | CLOSED | `app/api/appointments/create/route.ts` y `lib/booking-core.ts` **sin referencias** a la ventana (grep 0 matches) y **no modificados** en el rango de commits de la fase (`git log de7d3df~1..70522e8` sobre ambos archivos = vacío). La ventana vive solo en el route público; el core sigue window-agnostic → alta manual exenta sin abrir bypass del anti-doble-booking. |
| T-04-SC | Tampering (supply chain) | accept | DOCUMENTED | Ver Accepted Risks #3. Cero paquetes nuevos: ningún commit de la fase toca `package.json`/`package-lock.json` (verificado sobre los 12 commits `de7d3df..70522e8`); `date-fns`/`@supabase`/`next` ya presentes. Sin superficie de slopsquatting. |

**Disposiciones:** mitigate = 8 (T-04-01/02/05/06/08/09/10/11) → todas CLOSED. accept = 3 (T-04-03/07/SC) → documentadas abajo.
_Nota: el register no define un T-04-04; la numeración salta de 03 a 05 en el plan-time. No es un gap._

---

## Accepted Risks

1. **T-04-03 — Migración 052 aditiva (Tampering / integridad DB).** Columnas `max_advance_days`
   (nullable, `DEFAULT 30`) y `max_advance_date` (nullable) agregadas a `businesses` sin drop ni
   cambio de tipo; RLS owner-only intacta; validada con `supabase db reset` local (PG17) sobre el
   baseline. D-06: no toca turnos ya reservados — cambiar el límite solo afecta reservas nuevas.
   Aceptado: superficie de tampering nula por ser cambio aditivo reversible.

2. **T-04-07 — Cap del calendario público es UX, no seguridad (Tampering).** Los dos calendarios
   gemelos (`booking-client.tsx`, `canchas-booking-client.tsx`) deshabilitan navegación de mes y días
   fuera de ventana solo para mejorar la experiencia; un cliente puede saltear la UI. Aceptado por
   diseño: la autoridad que rechaza la fecha es el backstop server T-04-09 (verificado CLOSED).

3. **T-04-SC — Supply chain / installs.** La fase no instala paquetes (0 cambios en `package.json`
   en los 12 commits de la fase). Aceptado: sin superficie de dependencia nueva.

---

## Unregistered Flags

**None.** Ningún SUMMARY (04-01..04-04) contiene sección `## Threat Flags`; los ejecutores
reportaron las mitigaciones bajo `## Threat Mitigations`, todas mapeadas a IDs del register.

**Informativo (no blocker, mapea a threats existentes):** el control de ventana de reserva se
**movió** de `app/(dashboard)/settings/settings-client.tsx` (Plan 02, `files_modified`) a
`app/(dashboard)/agenda/agenda-client.tsx` en el commit `70522e8` (refactor: es config de agenda,
no de cobros). No es superficie nueva sin mapeo — es la misma escritura `businesses.update` cubierta
por T-04-05/T-04-06, y las mitigaciones se verificaron presentes en la nueva ubicación. Se registra
por trazabilidad: el path real difiere del declarado en el PLAN.

---

## Multi-tenant / Anti-tampering — checks clave del prompt

1. **Backstop independiente del cliente (T-04-09/10):** `isDateOutOfWindow(business, date)` en
   `booking/create/route.ts:79` corre con service-role, en hora AR, tras el gate de plan y antes del
   insert de `client`. No confía en el cap del calendario. ✔
2. **Aislamiento / info disclosure (T-04-01/02):** la vista `public_businesses` sumó solo las 2
   columnas config-públicas; no reabre la fuga de la migr. 026; el read-path público sigue por la
   vista, nunca por `businesses` con anon. ✔
3. **Exención del alta manual (T-04-11):** `appointments/create` y `lib/booking-core.ts` sin tocar
   (git + grep). La ventana es exclusiva del route público. ✔
4. **Supply chain (T-04-SC):** sin paquetes nuevos. ✔

---

**SECURITY.md path:** `.planning/workstreams/motor-reservas/phases/04-ventana-de-reserva-p-blica/SECURITY.md`
