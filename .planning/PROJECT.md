# Forjo App — Milestones paralelos (v0.10 Web Builder · v0.11 Consola CRM · v0.12 Motor de Reservas)

> **Workstreams** (GSD multi-workstream): `web-builder` (v0.10, shipped) y `crm` (v0.11, shipped) ya cerrados; `motor-reservas` (v0.12) es el milestone activo. Cada uno tiene su propio STATE/ROADMAP/REQUIREMENTS/phases bajo `.planning/workstreams/<nombre>/`. Scopear comandos GSD con `--ws motor-reservas`. Este PROJECT.md es compartido por todos.

## What This Is

Forjo App es un SaaS multi-tenant de gestión de turnos para negocios de servicios (peluquerías, consultorios, estudios), construido sobre Next.js 16 (App Router) + Supabase (Postgres con RLS, aislamiento por `business_id`) + MercadoPago. Cada negocio tiene un dashboard privado y una página pública de reservas en `/[slug]`. Tras el hardening de seguridad (v0.9), el Web Builder (v0.10) y la Consola CRM (v0.11), el milestone activo (v0.12) es el **Motor de Reservas**: convierte "agenda" de 1-turno-por-slot / 1-recurso=1-profesional en un recurso reservable real con capacidad (cupos grupales) y relaciones de espacio físico (canchas), más turnos manuales desde el panel — para desbloquear rubros nuevos (gyms, clases, canchas) sin romper el core de integridad que endureció v0.9.

## Core Value

Un negocio NUNCA puede leer ni modificar datos de otro, y los flujos de pago no pueden ser forzados ni falsificados. Si todo lo demás falla, el aislamiento multi-tenant y la integridad de los pagos deben sostenerse.

## Business Context

- **Customer**: negocios de servicios con turnos que pagan una suscripción mensual vía MercadoPago.
- **Revenue model**: suscripción por planes (`basic`/`studio`/`pro`) cobrada con preapproval de MercadoPago.
- **Success metric**: lanzamiento sin incidentes de fuga de datos entre tenants ni de pagos falsificados.
- **Strategy notes**: milestone pre-lanzamiento; ver `.planning/security-hardening-brief.md` y `.planning/codebase/CONCERNS.md` (auditoría 2026-06-15).

## Workstream `web-builder`: v0.18 CMS Publish / Go-live — ✅ SHIPPED 2026-07-16

> Archivado en `.planning/milestones/v0.18-*` (Phases 15-17, 8 plans). Historial del workstream: v0.10 (Phases 6-10) · v0.16 (11-14) · v0.17 (polish reactivo, sin fases GSD) · v0.18 (15-17). El próximo milestone arranca en **Phase 18**.

**Qué shipeó:** guardar dejó de publicar. `landing_config` = lo PUBLICADO, `landing_draft` = lo que se está editando; `/[slug]` lee SOLO lo publicado y publicar copia el borrador encima. La web que arma la skill nace como borrador esperando aprobación, y el CMS quedó expuesto a clientes reales con `has_web_custom` (el add-on) como ÚNICO gate — sin flag de entorno. Migraciones **050** + **051** aplicadas a prod. Fases 15 y 17 security-sensitive → SECURED 18/18 y 10/10.

**Qué desbloquea:** el norte del web-builder — el **auto-armado de la web al confirmarse el pago del add-on en MercadoPago** (milestone propio). Este milestone era su prerequisito literal: una web autogenerada ya no puede salir cruda al público. Ver memoria `web-builder-automation-northstar`.

**Deferred que siguen abiertos:** video de hero (BLOQUEADO por el bucket `landing-assets` — solo imágenes ≤2 MB, hay que tocarlo a mano en Supabase); toggle "foto ancha" en la galería; confirm-on-exit por nav interna; rediseño full-bleed (Meitre); rediseño del upsell "Web a medida" (sin add-on); bug de prod del modal "99 agendas". Ver `.planning/todos/pending/`.

<details>
<summary>Detalle del milestone (histórico)</summary>

**Goal:** Que el dueño edite su web sin que cada tecla salga al aire, y que su web salga a producción **cuando él lo decide** — cerrando el prerequisito que bloquea el auto-armado de la web con el pago del add-on.

**El modelo, en una frase:** `landing_config` pasa a significar **lo PUBLICADO** y `landing_draft` **lo que se está editando**. La página pública lee SOLO lo publicado. Publicar copia el borrador encima.

**Target features:**
- **A. Borrador + Publicar (núcleo):** columna `landing_draft` (migración ADITIVA: nace copiando `landing_config`, nadie se cae del aire). El CMS guarda en el borrador; `/[slug]` sigue leyendo `landing_config`. Un botón "Publicar" copia draft → published.
- **B. Descartar borrador:** tirar los cambios sin publicar y volver a lo que está al aire.
- **C. Go-live IMPLÍCITO:** un negocio que nunca publicó tiene `landing_config` NULL → la ruta pública ya sabe qué hacer con eso (muestra la página de reservas de siempre, camino legacy que ya existe). **Publicar por primera vez ES salir al aire.** Sin columna `web_live`: menos estado, nada que se desincronice del contenido.
- **D. Exponer el CMS:** sacar el flag global `CMS_ENABLED`, dejando `has_web_custom` (el add-on real, protegido por el trigger `businesses_protect_admin_columns`) como ÚNICO gate.
- **E. La skill escribe el BORRADOR:** `scripts/setup-landing.ts` pasa a escribir `landing_draft`, no lo publicado. La web recién armada NO sale al público hasta que el dueño la mira y publica.

**Por qué este milestone va ANTES del auto-armado:** cuando el armado se dispare solo con la confirmación de pago de MercadoPago, la web recién generada no puede salir cruda al público. Tiene que nacer como borrador esperando aprobación. El feature E es literalmente eso. Ver memoria `web-builder-automation-northstar`.

**Out of scope este milestone (deferred):** el auto-disparo con el pago (milestone propio); video de hero (BLOQUEADO por el bucket `landing-assets` — solo imágenes ≤2 MB, hay que tocarlo a mano en Supabase); toggle "foto ancha" en la galería; confirm-on-exit por nav interna; rediseño full-bleed (Meitre); bug de prod del modal "99 agendas".

**Decisiones LOCKED (no re-litigar en discuss-phase):**
- Migración **aditiva**: `landing_draft` arranca como copia de `landing_config`. Las landings ya publicadas NO se bajan del aire.
- Go-live **implícito** (publicar la primera vez = salir al aire). NO se agrega una columna `web_live`.
- La skill/script escribe el **borrador**, no lo publicado.
- Se mantienen TODOS los invariantes de v0.16: write path **owner-only** (session client + RLS por tenant + Zod estricto reject-on-invalid), **NUNCA service-role** en la superficie web de escritura, booking = caja negra, fail-safe del config (roto → default, `/[slug]` nunca 500ea).
- El gate del add-on (`has_web_custom`) se chequea en la **Server Action**, no solo en la page: gatear solo la page es cosmético, un POST directo la saltea.

</details>

## Current Milestone (workstream `crm`): v0.11 Consola CRM

**Goal:** Centro de operaciones interno de Forjo Studio — un CRM propio de 3 capas (ventas/pipeline, comunicaciones WhatsApp+mail, admin de plataforma) que cubre el ciclo completo lead → cliente → soporte → métricas sin tocar las consolas de Supabase/MercadoPago por separado. Operador único (`is_admin`). Diseño aprobado (Claude Design); build nativo por fases. Numeración de fases reiniciada en Phase 1.

**Target features:**
- Cimientos: rol `is_admin` + guard server-side en `/admin`, tabla `audit_log`, doble confirmación (type-to-confirm escalonado), layout CRM anclado al tema Forjo default (dark-primary; acentos amarillo `#f4c543` / azul `#2a5fa5` info / rojo `#d94a2b` SOLO peligro)
- Admin de plataforma: directorio + ficha de negocios, gestión plan/suscripción, precios de planes editables, add-ons (flags on/off, cobro manual), métricas básicas
- Impersonación read-only con enforcement server-side real (no solo UI) + auditoría por acceso con motivo
- Notificaciones/alertas (pago falló, trial por vencer)
- Pipeline de ventas: tablas `leads`/`deals`, etapas, conversión lead→`business`, tags filtrables
- Comms (bandeja): agente WhatsApp + mail en una bandeja con toma manual (depende de unknowns §9.1/§9.2)
- Timeline de actividades en la ficha (historial cronológico unificado)
- Reportes de Ventas: MRR, conversión por etapa, ranking (ya NO diferido)

**Out of scope este milestone:** separar Contactos de Empresas (modelo dueño-solo); cobro automático de add-ons; otorgar `is_admin` self-serve desde el panel.

**Decisiones LOCKED (no re-litigar en discuss-phase):** CRM interno de 3 capas en una sola herramienta; acceso por rol `is_admin` + check server-side (NO allowlist/header); pipeline = full CRM (lead→trial→pago→ciclo de vida); add-ons = flags booleanas por negocio con cobro manual; precios de planes editables desde el panel; impersonación = solo lectura, auditada, acción crítica; auditoría desde v1; doble confirmación siempre en acciones peligrosas; email+WhatsApp obligatorios por ficha; diseño primero (aprobado), build incremental; CRM NO themeable (tema Forjo default, dark-primary). Brief completo: `c:\Users\franc\Desktop\Forjo Studio\forjo-crm-admin-brief.md` (diseño: `c:\Users\franc\Desktop\Forjo Studio\crm-design\`).

## Current Milestone (workstream `motor-reservas`): v0.12 Motor de Reservas

**Goal:** Convertir "agenda" de *1-turno-por-slot / 1-recurso = 1-profesional* en un **recurso reservable real con capacidad y relaciones de espacio físico**, para desbloquear rubros nuevos (gimnasios, clases grupales, canchas) — tocando con cuidado el core de integridad que endureció v0.9 (constraints 011/013), con foco en concurrencia y **cero regresión** para el caso 1-turno-por-slot. Numeración de fases reiniciada en Phase 1 (workstream nuevo).

**Target features (faseo por riesgo/valor):**
- **Turnos manuales (pieza C)** — el admin crea turnos desde el dashboard reusando el pipeline de `/api/booking/create` (validación, disponibilidad, anti-tampering de tenant, anti-doble-booking) desde la sesión autenticada del dueño; seña opcional para el admin. Chica, transversal, no toca constraints → primera entrega.
- **Cupos grupales (pieza A)** — columna `capacity` (default 1) en `time_blocks`; disponibilidad = `count(turnos en slot) < capacity`; constraints 011/013 redefinidos a **capacity-aware**; chequeo atómico **anti-sobrecupo concurrente** en `/api/booking/create` (nuevo error `slot_full`); público ve "disponible/lleno" sin contador; admin ve contador (8/15) + roster por slot.
- **Espacio compartido (pieza B)** — modelo de **recurso/espacio físico** + mapeo agenda→espacio(s); reservar una agenda bloquea a todas las que comparten su espacio en el horario solapado (cancha F11 = {A,B,C}); la regla anti-solape (hoy 013, dentro de una agenda) se extiende a nivel de espacio físico, con el mismo chequeo atómico. Fase final, recortable si crece.
- **Tests de concurrencia/aislamiento** extendiendo TEST-01 (anti-sobrecupo + anti-conflicto-de-espacio): el core que v0.9 endureció no puede regresar.

**Out of scope este milestone (deferred):** lista de espera / waitlist al liberar un lugar (v2); re-apertura automática de cupo al cancelar (a confirmar en discuss); generalización del modelo de recurso más allá de lo que A+B necesitan.

**Decisiones LOCKED (no re-litigar en discuss-phase):** cupo **por profesional/horario** en `time_blocks` (default 1 = cero regresión, NO en el servicio); seña **configurable por servicio** (independiente de individual/grupal); público ve "disponible" hasta llenarse, **NO** ve lugares restantes; admin ve contador + roster; concurrencia anti-sobrecupo = **chequeo atómico deliberado** (lock por slot / `SELECT … FOR UPDATE` / serializable), nunca `count` simple sin lock; **faseo manual→cupos→espacio**, B recortable como fase final sin tocar lo entregado; el modelo "agenda como recurso" (genérico vs `professionals`+tipo) se decide **una vez** en la fase de cupos contemplando ya el espacio compartido (B), para no pagar una migración después. Briefs: `c:\Users\franc\Desktop\Forjo Studio\forjo-motor-reservas-encuadre.md` + `forjo-cupos-grupales-brief.md`.

## Requirements

### Validated

<!-- Capacidades existentes inferidas del codebase (brownfield). Locked salvo discusión explícita. -->

- ✓ SaaS multi-tenant con aislamiento por `business_id` vía RLS de Supabase — existente
- ✓ Página pública de reservas por negocio en `/[slug]` (booking sin login) — existente
- ✓ Dashboard privado por negocio (turnos, clientes, finanzas, configuración) — existente
- ✓ Suscripciones con MercadoPago (preapproval) + webhook de suscripción con firma `x-signature` fail-closed — existente
- ✓ Cobro de seña por turno con MercadoPago + webhook de seña — existente
- ✓ Cierre del crítico RLS `public read businesses USING(true)` que exponía secretos a `anon` — resuelto (commit dfb30b7)
- ✓ **SEC-01** Aislamiento RLS + tabla `business_secrets` (vistas acotadas `public_services`/`public_business_hours`, secretos owner-only) — v0.9
- ✓ **SEC-02** Firma `x-signature` fail-closed + chequeo de monto exacto en ambos webhooks MP (`verifyMPSignature` compartido) — v0.9
- ✓ **SEC-03** Endpoints admin header-only + `timingSafeEqual` hash-both-sides; `setup-plans` sacado del runtime web a script local — v0.9
- ✓ **SEC-04** Gating de `plan_status` (blocklist `expired`/`cancelled`) en booking público — v0.9
- ✓ **TEST-01** Suite Vitest (aislamiento multi-tenant anon-key + ambos webhooks) ejecutable en CI — v0.9
- ✓ Cierre extra: policy abierta `public read appointments USING(true)` — agujero cross-tenant que el test de aislamiento cazó — v0.9 (migración 029)
- ✓ **PUB-03..PUB-08** Borrador vs publicado (`landing_draft` / `landing_config`): guardar no publica, publicar/descartar son copia server-side (nunca se acepta el config del body), estado de 3 vías, go-live implícito, cero regresión en las landings ya al aire — v0.18 (migración 050)
- ✓ **SKILL-07, SKILL-08** La skill del operador escribe el BORRADOR (`--publish` opt-in) y `--inspect` separa lo-al-aire de lo-pendiente-de-aprobación — v0.18
- ✓ **PUB-01** CMS expuesto a clientes reales con `has_web_custom` como ÚNICO gate (sin `CMS_ENABLED`), chequeado en las 4 superficies incl. el upload directo a Storage vía RLS — v0.18 (migración 051)

### Active

<!-- Requirements con REQ-IDs por workstream (multi-workstream mode). -->

- Web Builder v0.10 (shipped) — ver `.planning/milestones/v0.10-REQUIREMENTS.md`.
- **Web Builder — Ampliación + CMS v0.16 (activo)** — ver `.planning/workstreams/web-builder/REQUIREMENTS.md` (modo edición + fuentes de la skill, premium motion, CMS self-serve owner-only, fotos alrededor de la reserva).
- Consola CRM v0.11 (shipped) — ver `.planning/milestones/v0.11-REQUIREMENTS.md`.
- **Motor de Reservas v0.12 (activo)** — ver `.planning/workstreams/motor-reservas/REQUIREMENTS.md` (turnos manuales, cupos grupales capacity-aware, espacio compartido, tests de concurrencia).

### Out of Scope

<!-- Backlog v2: robustez o deuda técnica, no agujeros de seguridad. No bloquean el lanzamiento. -->

- Tabla `webhook_events` para idempotencia fuerte de webhooks — robustez, no agujero de seguridad
- Rate-limiting por IP en `/api/booking/create` para negocios sin reCAPTCHA — mitigación de abuso, no aislamiento
- Unificar las tres fuentes de verdad de planes (`lib/plans.ts`, `lib/subscription-plans.ts`, `lib/plan-limits.ts`) — deuda técnica
- Adoptar Supabase CLI migrations o tabla de control de versiones de esquema — tooling
- Tipar `mpFetch` / adoptar el SDK oficial de MercadoPago — type-safety
- Centralizar la lógica de expiración de turnos (hoy replicada en tres lugares) — refactor

## Context

- **Estado actual (v0.9 shipped, 2026-06-17):** 5 fases de hardening cerradas, verificadas y threat-secure; suite Vitest en CI (10/10, aislamiento real). Los 4 agujeros auditados + el extra (029) cerrados en prod. `origin/main` en sync. Pendiente operativo: cargar los 4 GitHub Secrets para que los tests de aislamiento corran en CI.
- **Brownfield con mapa de codebase**: `.planning/codebase/` (ARCHITECTURE, CONCERNS, CONVENTIONS, INTEGRATIONS, STACK, STRUCTURE, TESTING) — auditoría del 2026-06-15.
- **Stack**: Next.js `16.2.7` (App Router; el middleware es `proxy.ts`, NO `middleware.ts`), React 19, Supabase (`@supabase/supabase-js` + `@supabase/ssr`), Tailwind v4 + shadcn, TypeScript strict.
- **Integraciones por `fetch` directo (sin SDK)**: MercadoPago (`lib/mercadopago.ts`, `lib/payment.ts`), Google Calendar, reCAPTCHA v3, Resend.
- **Sin suite de tests hoy**: no hay jest/vitest/playwright en el repo; TEST-01 introduce el runner.
- **Skills del proyecto relevantes**: `supabase-multitenant-rls` (checklist de aislamiento), `mercadopago-suscripciones` (patrón validado de pagos), `convenciones-forjo`.
- **Patrón de vista pública ya existente**: `public_professionals` en `supabase/migrations/007_professionals_extended.sql` — modelo a replicar para SEC-01.
- **Webhook de suscripción ya endurecido**: `app/api/subscription/webhook/route.ts` valida HMAC `x-signature` fail-closed; reusar para SEC-02.

## Constraints

- **Security**: aislamiento por tenant es no negociable — toda query/policy/route que toque datos de un negocio debe garantizarlo (RLS + `business_id`).
- **Tech stack**: Next.js 16 tiene breaking changes frente a versiones viejas; consultar `node_modules/next/dist/docs/` antes de asumir comportamiento. Middleware = `proxy.ts`.
- **Plataforma**: Vercel Hobby (`gestion.forjo.studio`) — cron limitado a una ejecución diaria; no introducir crons más frecuentes.
- **DB**: migraciones SQL numeradas en `supabase/migrations/`, aplicadas a mano y en orden; SEC-01 requiere una migración nueva coordinada con el deploy.
- **Dev env**: Windows + PowerShell (sintaxis distinta a bash) + VS Code + Claude Code.
- **Timeline**: pre-requisito de lanzamiento — bloquea salir a producción con clientes reales.

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Aislar secretos de `businesses` en tabla `business_secrets` con RLS solo-dueño | Quitar secretos de una tabla con lectura pública es más robusto que acotar columnas en una policy | ✓ Good — migración 027/028, anon denegado verificado |
| Extraer `verifyMPSignature` a `lib/mercadopago.ts` y usarlo en ambos webhooks | Elimina duplicación; el webhook de suscripción ya tiene el patrón validado | ✓ Good — extracción verbatim, comportamiento intacto |
| Tests con Vitest | No hay runner hoy; Vitest encaja con el stack TS/Next moderno | ✓ Good — Vitest 4, 10/10 en verde |
| Fase de tests (5) va al final | Se escriben contra el comportamiento correcto que dejan las fases 1–4 | ✓ Good — y el test cazó el agujero 029 |
| Rotación condicional de claves reales | Solo aplica si la app estuvo desplegada en la URL pública de Vercel con secretos reales; si solo corrió en localhost, no | ✓ Good — exposición confirmada, claves rotadas por el usuario |
| Migraciones aplicadas a mano (sin Supabase CLI) | El proyecto no adoptó Supabase CLI; checkpoints humanos coordinan migración+deploy | ⚠️ Revisit — el agujero 029 vivía out-of-band, no trackeado; conviene versionar el esquema |
| `.planning/` gitignored + flujo direct-to-main (sin PR) | Convención del repo; ship = `git push origin main` | ✓ Good — 5 fases shipped sin fricción |

## Evolution

This document evolves at phase transitions and milestone boundaries.

**After each phase transition** (via `/gsd-transition`):
1. Requirements invalidated? → Move to Out of Scope with reason
2. Requirements validated? → Move to Validated with phase reference
3. New requirements emerged? → Add to Active
4. Decisions to log? → Add to Key Decisions
5. "What This Is" still accurate? → Update if drifted

**After each milestone** (via `/gsd-complete-milestone`):
1. Full review of all sections
2. Core Value check — still the right priority?
3. Audit Out of Scope — reasons still valid?
4. Update Context with current state

---
*Last updated: 2026-07-16 after v0.18 CMS Publish / Go-live milestone (workstream `web-builder`, Phases 15-17 shipped a prod); v0.9–v0.18 shipped y archivados. Próximo del workstream: Phase 18 — candidato natural, el auto-armado con el pago del add-on (`web-builder-automation-northstar`).*
