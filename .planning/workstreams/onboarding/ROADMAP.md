# Roadmap: Forjo App — Onboarding (workstream `onboarding`)

## Milestones

- ✅ **v0.14 Onboarding** — Phases 1-3 (shipped 2026-07-04, archivado en `milestones/v0.14-*`)
- ✅ **v0.19 Cuenta y acceso** — Phases 4-6 (shipped 2026-07-17, archivado en `milestones/v0.19-*`)
- ✅ **v0.20 "Onboarding pulido"** — Phases 7-8 (shipped 2026-07-18, archivado en `milestones/v0.20-*`)

Detalle archivado: [`milestones/v0.14-ROADMAP.md`](../../milestones/v0.14-ROADMAP.md) · [`milestones/v0.19-ROADMAP.md`](../../milestones/v0.19-ROADMAP.md) · [`milestones/v0.20-ROADMAP.md`](../../milestones/v0.20-ROADMAP.md).

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

<details>
<summary>✅ v0.20 "Onboarding pulido" (Phases 7-8) — SHIPPED 2026-07-18</summary>

- [x] Phase 7: Onboarding wizard — robustez + pulido (1/1 plan, ONB-01/02/03/04) — completed 2026-07-17 — endpoint service-role de slug (solo booleano), salida del wizard, logo en el paso 1, paleta fuera del wizard; SECURED 5/5
- [x] Phase 8: Auth siempre con tema Forjo (1/1 plan, ONB-05) — completed 2026-07-18 — ResetThemeScript en (auth)/layout, auth siempre Forjo base sin regresionar dashboard/[slug]; SECURED 4/4

Detalle completo archivado en [`milestones/v0.20-ROADMAP.md`](../../milestones/v0.20-ROADMAP.md).

</details>

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
