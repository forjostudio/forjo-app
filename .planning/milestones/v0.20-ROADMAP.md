# Roadmap: Forjo App — Onboarding (workstream `onboarding`)

## Milestones

- ✅ **v0.14 Onboarding** — Phases 1-3 (shipped 2026-07-04, archivado en `milestones/v0.14-*`)
- ✅ **v0.19 Cuenta y acceso** — Phases 4-6 (shipped 2026-07-17, archivado en `milestones/v0.19-*`)
- 🚧 **v0.20 "Onboarding pulido"** — Phases 7-8 (activo) — bugs de alta + pulido del wizard + auth siempre Forjo

Detalle archivado: [`milestones/v0.14-ROADMAP.md`](../../milestones/v0.14-ROADMAP.md) · [`milestones/v0.19-ROADMAP.md`](../../milestones/v0.19-ROADMAP.md).

## Overview

v0.14 cubrió el **wizard de creación del negocio**. v0.19 es el **paso anterior del mismo recorrido**: cómo una persona pasa de no tener cuenta a estar adentro. Mismo embudo, misma historia — por eso vive en este workstream y continúa su numeración.

Hoy hay tres agujeros en esa puerta de entrada, verificados contra código:

1. **No se puede recuperar una contraseña.** `app/(auth)/` tiene solo `login` y `register`; cero ocurrencias de `resetPasswordForEmail`. Un dueño que olvida su contraseña queda afuera de su negocio, sin salida self-serve.
2. **No existe `/auth/callback`** — la ruta que intercambia código por sesión. Los callbacks que hay (`api/google/callback`, `api/mercadopago/callback`) son de **integraciones** (Calendar, MP), otro flujo. **Reset y Google necesitan esa misma ruta**: es la pieza de infraestructura común y la razón por la que el milestone no se hace de a un feature suelto.
3. **Los mails de cuenta son de Supabase, no de Forjo**: inglés, sin marca, remitente `noreply@mail.app.supabase.io`, pie "powered by Supabase".

El faseo va **infraestructura + reset → Google → mails**:

- La **Phase 4** construye `/auth/callback` una sola vez (no se duplica en ninguna otra fase) y lo estrena con el flujo de recuperación, que es el que hoy no existe y deja gente afuera. También cierra la coherencia del alta (AUTH-06), porque el research que define si `confirm email` está ON y bloquea vive acá: es la misma config de Auth que gobierna el reset.
- La **Phase 5** monta Google encima del callback ya construido y probado, y resuelve la trampa real del milestone: el **account linking** (mismo mail con contraseña y con Google → una sola cuenta, no dos ni un error opaco). Ahí también se verifica —no se construye— el hand-off al onboarding, que ya sabe manejar "autenticado sin negocio".
- La **Phase 6** cierra la marca de los mails. Va última a propósito: brandea los dos mails que para entonces **existen y tienen a dónde llevar** (MAIL-02 no sirve de nada sin flujo de reset), y concentra el grueso de la config externa —SMTP, dominio, DNS, plantillas— en una fase pensada como config + verificación, en vez de mezclarla con código autónomo.

**Nota operativa:** buena parte del milestone es **config externa** (Dashboard de Supabase: redirect URLs, provider de Google, SMTP, plantillas; Google Cloud: redirect URI). Eso implica **checkpoints humanos bloqueantes** (`autonomous: false`), igual que la migración 051 de v0.18. Están señalados por fase.

## Phases

**Phase Numbering:**

- El workstream `onboarding` **continúa** la numeración: v0.14 cerró en Phase 3, v0.19 arranca en **Phase 4**.
- Integer phases: trabajo planeado del milestone.
- Decimal phases (4.1, …): inserciones urgentes (marcadas INSERTED).

<details>
<summary>✅ v0.14 Onboarding (Phases 1-3) — SHIPPED 2026-07-04</summary>

- [x] Phase 1: Reconciliación de horarios (3/3 plans, SCHED-01/02) — completed 2026-07-03 — migr. 046 (DROP `business_hours`, `time_blocks` = fuente única)
- [x] Phase 2: Rework UX del onboarding (1/1 plan, ONB-01/02) — completed 2026-07-04 — "Omitir por ahora" + stepper dinámico
- [x] Phase 3: Rework del selector de rubro (3/3 plans, ONB-RUBRO-01/02) — completed 2026-07-04 — migr. 047 (backfill `vertical`), 4 rubros + campo libre

Detalle completo archivado en [`milestones/v0.14-ROADMAP.md`](../../milestones/v0.14-ROADMAP.md).

</details>

<details>
<summary>✅ v0.19 Cuenta y acceso (Phases 4-6) — SHIPPED 2026-07-17</summary>

- [x] Phase 4: Recuperar la cuenta (`/auth/callback` + reset) (6/6 plans, AUTH-01/02/06) — completed 2026-07-17 — SECURED 22/22
- [x] Phase 5: Entrar con Google (3/3 plans, AUTH-03/04/05) — completed 2026-07-17 — account linking = default de Supabase; SECURED 9/9
- [x] Phase 6: Mails de cuenta con marca Forjo (2/2 plans, MAIL-01/02) — completed 2026-07-17 — SMTP Resend + no-reply@forjo.studio; SECURED 6/6

Detalle completo archivado en [`milestones/v0.19-ROADMAP.md`](../../milestones/v0.19-ROADMAP.md).

</details>

### 🚧 v0.20 "Onboarding pulido" (Phases 7-8) — ACTIVO

Dos superficies, dos fases. El **wizard de alta** (Phase 7) junta los dos bugs que destaparon los UAT de v0.19 —el chequeo de slug ciego por RLS y el usuario autenticado sin negocio atrapado sin salida— con el pulido de UX que veníamos anotando (logo en el primer paso, sacar el selector de paleta). Todo cae sobre `onboarding/page.tsx`: la misma superficie se toca una sola vez. La **paleta del tenant colándose en las pantallas de auth** (Phase 8) es un concern distinto, en otra superficie (`app/(auth)/**` + la capa de theming `PaletteScript` / `data-palette`), y **no depende de la Phase 7** — las dos fases son independientes.

**ONB-01 es security-sensitive** (chequeo de slug global sobre un espacio multi-tenant): el fix debe exponer SOLO la existencia del slug, nunca datos del negocio dueño → lleva threat-model + `/gsd:secure-phase`. **ONB-05 toca la capa de theming**: una regresión ahí afectaría la paleta del dashboard y del booking público → sus criterios afirman explícitamente que esas superficies siguen intactas.

**Sin checkpoints humanos externos** (a diferencia de v0.19): todo es código de app + storage ya existente, sin config en el Dashboard de Supabase. Único checkpoint posible: si ONB-01 se resuelve con una RPC `security definer`, la migración numerada se coordina con el deploy (patrón de siempre); si se resuelve con endpoint service-role no hay migración. Se decide en discuss/plan.

- [x] **Phase 7: Onboarding wizard — robustez + pulido** (ONB-01/02/03/04) — chequeo de slug global (fail-early, sin fuga), salida del wizard, logo en el paso 1, sacar la paleta del wizard (completed 2026-07-17)
- [x] **Phase 8: Auth siempre con tema Forjo** (ONB-05) — login/register/forgot/reset nunca heredan la paleta del tenant, ni al cerrar sesión (completed 2026-07-18)

## Phase Details (v0.20)

### Phase 7: Onboarding wizard — robustez + pulido

**Goal**: El alta de un negocio nuevo es robusta y más simple — nunca falla al final con un error opaco de slug, tiene una salida clara si el usuario no quiere crear el negocio, deja subir el logo desde el primer paso, y se simplifica sacando el selector de paleta.
**Depends on**: Nada (extiende el wizard ya shippeado en v0.14; independiente de la Phase 8)
**Requirements**: ONB-01, ONB-02, ONB-03, ONB-04
**Success Criteria** (lo que debe ser VERDADERO):

  1. Al escribir el nombre/URL, el chequeo de disponibilidad detecta un slug YA usado por CUALQUIER negocio (no solo los del propio owner) y muestra "✗ Ya está en uso" ANTES de finalizar — nunca se llega al insert con el opaco "Error al crear el negocio". (ONB-01)
  2. El chequeo global de slug devuelve SOLO existencia (booleano) — cero datos del negocio dueño del slug; verificado como no-fuga cross-tenant. (ONB-01)
  3. Un usuario autenticado sin negocio puede cerrar sesión / volver al login desde el onboarding, sin quedar obligado a crear un negocio. (ONB-02)
  4. El dueño puede subir el logo del negocio en el primer paso; el archivo sube al bucket de storage con path aislado por tenant y queda asociado al negocio creado. (ONB-03)
  5. El wizard ya no muestra el selector de paleta; el negocio nuevo arranca con la paleta default y la paleta sigue editable en Ajustes → Apariencia. (ONB-04)

**Plans**: 1/1 plans complete

  - [x] 07-01-PLAN.md — Endpoint service-role de slug (ONB-01) + salida del wizard (ONB-02) + logo en el paso 1 (ONB-03) + sacar la paleta (ONB-04)

**UI hint**: yes
**Threat model** (ONB-01): chequeo de slug sobre el espacio global multi-tenant. Hoy `checkSlug` corre con el browser client bajo RLS (`businesses` solo tiene policy `owner access`) → un futuro-owner no ve ninguna fila → siempre "disponible", y el choque salta recién en el insert (`businesses_slug_key`). El chequeo tiene que ver TODOS los slugs. Opciones (a definir en discuss/plan): RPC `security definer` que devuelve solo un booleano (requiere migración numerada, coordinada con deploy) o endpoint service-role que resuelve existencia por slug (patrón `app/api/booking/availability/route.ts`, sin migración). Invariante duro: la respuesta NO puede filtrar id/owner/nombre ni ningún otro dato del negocio dueño del slug. → `/gsd:secure-phase`.
**Nota de scope** (ONB-03): la RLS INSERT del bucket `landing-assets` (migr. 030) exige que el primer segmento del path sea un negocio del owner autenticado — pero en el paso 1 el negocio TODAVÍA no existe. El orden upload↔insert (subir tras crear el negocio y asociarlo, o path temporal user-scoped) se resuelve en plan-phase; el patrón puro de path/validación de `lib/landing/editor-upload.ts` se reusa igual.

### Phase 8: Auth siempre con tema Forjo

**Goal**: Las pantallas de login, register, forgot-password y reset-password se ven SIEMPRE Forjo (claro/oscuro según la preferencia del usuario), nunca la paleta del tenant — incluso al cerrar sesión desde el dashboard de un negocio con paleta propia.
**Depends on**: Nada (superficie distinta a la Phase 7; ejecutable en paralelo, se corre después de la 7 solo por orden numérico)
**Requirements**: ONB-05
**Success Criteria** (lo que debe ser VERDADERO):

  1. Al cerrar sesión desde un dashboard con paleta NO-default, las 4 pantallas de auth se pintan con la paleta/tema Forjo default, no con la del tenant. (ONB-05)
  2. Las 4 pantallas de auth respetan la preferencia claro/oscuro del usuario (next-themes) — el reset de paleta no fuerza un modo. (ONB-05)
  3. Entrar directo a `/login` o `/register` (sin pasar por el dashboard) también se ve Forjo. (ONB-05)
  4. REGRESIÓN: el dashboard del negocio y su página pública `/[slug]` siguen mostrando su paleta/tema/fuente propios — el reset de auth no se filtró a esas superficies. (ONB-05)

**Plans**: 1/1 plans complete

  - [x] 08-01-PLAN.md — Crear `app/(auth)/layout.tsx` + `ResetThemeScript` (reset del tema del tenant a Forjo base en las 4 pantallas de auth) (ONB-05)

**UI hint**: yes
**Nota (capa de theming)**: el mecanismo del bug es el `<html>` persistente entre navegaciones SPA — `PaletteScript` del dashboard setea `data-palette` / `data-theme` en `document.documentElement` y ese atributo sobrevive al navegar a `/login`. El fix resetea a Forjo default (`data-palette=red`, borrar `data-theme` / `data-font`) en la superficie `(auth)`, que hoy son DOS layouts: el grupo anidado `(split)` (login/forgot/reset) y `register` (sin split). El reset toca SOLO paleta/tema/fuente; el modo claro/oscuro (clase `.dark` de next-themes) NO se toca.

## Progress

**Execution Order:**
Phases execute in numeric order: 4 → 5 → 6. El orden es load-bearing: `/auth/callback` (4) antes de Google (5); los flujos de mail (4) antes de brandearlos (6).
v0.20: 7 → 8. Las dos fases son **independientes** (superficies distintas: wizard vs auth); el orden es por convención de numeración, no hay dependencia dura.

| Phase | Milestone | Plans | Status | Completed |
|-------|-----------|-------|--------|-----------|
| 1. Reconciliación de horarios | v0.14 | 3/3 | Complete | 2026-07-03 |
| 2. Rework UX del onboarding | v0.14 | 1/1 | Complete | 2026-07-04 |
| 3. Rework del selector de rubro | v0.14 | 3/3 | Complete | 2026-07-04 |
| 4. Recuperar la cuenta (`/auth/callback` + reset) | v0.19 | 6/6 | Complete   | 2026-07-17 |
| 5. Entrar con Google | v0.19 | 3/3 | Complete   | 2026-07-17 |
| 6. Mails de cuenta con marca Forjo | v0.19 | 2/2 | Complete   | 2026-07-17 |
| 7. Onboarding wizard — robustez + pulido | v0.20 | 1/1 | Complete   | 2026-07-17 |
| 8. Auth siempre con tema Forjo | v0.20 | 1/1 | Complete   | 2026-07-18 |
