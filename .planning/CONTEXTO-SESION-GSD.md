# Contexto de sesión — Guía de GSD para Forjo App

> **Para vos, Claude Code, que estás leyendo esto en un tab "GUÍA":**
>
> Sos el asistente que acompaña a **Franco** en el uso de **GSD Core** sobre este
> proyecto (Forjo App). Franco va a ejecutar los comandos `/gsd-*` en **otro tab
> distinto** de Claude Code (el "EJECUTOR"). Tu trabajo NO es ejecutar el workflow:
> es explicarle qué hace cada paso, revisar los outputs/artefactos que GSD va
> generando, detectar problemas y aconsejarlo.
>
> **Cómo te coordinás con el tab ejecutor:** los dos tabs no comparten memoria.
> Se comunican por los archivos en disco. Cuando Franco corra un comando en el
> ejecutor, vos te enterás **leyendo** los archivos de `.planning/` (sobre todo
> `STATE.md`, `ROADMAP.md` y los `phases/`). Si Franco te pega un output, usalo;
> si no, leé el estado del disco antes de aconsejar.
>
> **Arranque:** después de leer este documento, dale a Franco un resumen de 3–4
> líneas de dónde está el proyecto y cuál es el próximo comando, y esperá. No
> ejecutes comandos GSD vos mismo salvo que él te lo pida explícitamente.

---

## Reglas de eficiencia (consumir menos tokens)

Este tab guía es un costo adicional sobre el tab ejecutor; trabajá para minimizarlo.

- **Modelo:** este tab guía debería correr en **Sonnet** (es explicativo: leés
  archivos y aconsejás, no escribís código). El tab ejecutor va en el modelo bueno.
  Si estás en Opus, avisale a Franco que puede bajar este tab a Sonnet.
- **Leé del disco, no pidas que te peguen.** Pegar duplica contenido (ya existió en
  el ejecutor). Leé el archivo puntual del disco solo cuando lo necesites.
- **Leé selectivo, no en bloque.** Abrí el `PLAN.md` o `VERIFICATION.md` concreto
  que importa, no escanees `.planning/` entero ni releas `codebase/` completo.
- **Intervení solo en los checkpoints de decisión:** después de `plan-phase`
  (revisar el plan antes de ejecutar) y después de `verify-work` (confirmar que
  cerró). No comentes cada microtarea ni cada commit.
- **No re-expliques lo que ya está acá.** Este documento tiene el plan completo;
  no lo repitas en cada respuesta.
- Recordale a Franco que para orientarse sin gastarte a vos, tiene `/gsd-progress`
  en el ejecutor (lee el estado del disco y dice qué sigue).

Palancas de costo del lado del EJECUTOR (mencionáselas a Franco si pregunta por
costo, pero la decisión es suya): `/gsd-config --profile budget` baja el modelo de
los subagentes; `/gsd-settings` permite desactivar research/plan-check en fases de
dominio que él ya conoce bien (varias de estas fases de seguridad lo son).

---

## Qué es GSD Core (resumen de 30 segundos)

Sistema de *context engineering* + *spec-driven development* que conduce a Claude
Code por un ciclo disciplinado de fases: **Discuss → (UI) → Plan → Execute →
Verify → Ship**, una fase a la vez. El trabajo pesado corre en subagentes de
contexto fresco (200k limpio cada uno) y todo el estado vive en archivos
(`.planning/`), no en la conversación. Resuelve el "context rot" (degradación de
calidad en sesiones largas). Repo: `@opengsd/gsd-core` (open-gsd/gsd-core).

Hay un tutorial visual completo en `../gsd-tutorial.html` (carpeta padre
`Forjo Studio/`) por si Franco quiere repasar conceptos.

## Qué se hizo en la sesión previa (narrativa)

1. Se clonó y exploró GSD; el repo viejo (`gsd-build/get-shit-done`) está
   archivado, el activo es `open-gsd/gsd-core`.
2. Se **instaló GSD Core local** en `forjo-app/.claude/` (`npx @opengsd/gsd-core
   --claude --local`, build previo de lib y hooks). Merge no-destructivo: las
   skills propias y los permisos previos se conservaron.
3. Se gitignoreó el tooling de GSD y `.planning/` (commit `949a5f1`). GSD no entra
   al repo; las skills del proyecto sí se siguen versionando.
4. Se corrió `/gsd-map-codebase` → `.planning/codebase/` (7 archivos de auditoría).
5. El code-review detectó y **se resolvió un crítico de seguridad**: la policy RLS
   `public read businesses USING(true)` que exponía secretos al rol `anon`.
6. Se redactó el brief del milestone de seguridad:
   `.planning/security-hardening-brief.md`.
7. Se armó este documento de contexto para el tab guía.

## Estado actual (verificado)

- GSD instalado y funcionando local en `forjo-app/.claude/` (69 comandos, 34
  agentes, 20 hooks).
- `.planning/` y el tooling de GSD están **gitignoreados** (no entran al repo).
- Mapeo del codebase hecho: `.planning/codebase/{ARCHITECTURE,CONCERNS,
  CONVENTIONS,INTEGRATIONS,STACK,STRUCTURE,TESTING}.md`. `CONCERNS.md` es la
  auditoría que originó el milestone — vale la pena que la leas.
- **Todavía NO existe proyecto GSD activo:** faltan `PROJECT.md`,
  `REQUIREMENTS.md`, `ROADMAP.md`, `STATE.md`, `phases/`. Crearlos es el próximo
  paso (el comando de abajo lo hace).

## El milestone a arrancar

**Security Hardening (pre-launch), v0.9** — cerrar agujeros de aislamiento
multi-tenant, endurecer webhooks de pago y endpoints admin, y dejar tests que
impidan regresiones. Pre-requisito para salir a producción con clientes reales.

Detalle completo de las 5 fases y los requisitos (SEC-01…SEC-04, TEST-01) en
`.planning/security-hardening-brief.md`. Resumen:

1. **RLS lockdown** de `services`/`business_hours` + mover secretos a
   `business_secrets`. (incluye ítem condicional de rotar tokens)
2. **Firma + monto en webhooks de pago** (el de seña hoy no valida `x-signature`).
3. **Endurecer endpoints admin** (timing-safe, sin secreto por query string).
4. **Gating de plan** en el booking público.
5. **Tests de aislamiento multi-tenant** (Vitest) — va última a propósito.

## Próximos pasos — qué le decís a Franco que corra en el TAB EJECUTOR

```text
# 1) Crear el proyecto GSD desde el brief (solo planifica, no escribe código)
/gsd-new-project --auto @.planning/security-hardening-brief.md
#    → genera PROJECT/REQUIREMENTS/ROADMAP y presenta el roadmap para aprobar.

# 2) Loop por fase (repetir 1→5)
/clear
/gsd-discuss-phase 1
/gsd-plan-phase 1
/gsd-execute-phase 1
/gsd-verify-work 1
/gsd-ship 1
```

Tu rol en cada paso (tab guía): cuando Franco te avise que corrió uno, leé el
artefacto resultante en `.planning/` y explicale qué se generó, si quedó bien, y
qué decidir en el siguiente. Ejemplo: tras `/gsd-plan-phase 1`, leé los
`phases/01-*/*-PLAN.md` y `RESEARCH.md` y revisá que el enfoque sea sano antes de
que ejecute.

## Decisiones que van a surgir (anticipalas)

- **Fase 1 — rotación de tokens.** El agujero RLS exponía `mp_access_token`,
  `mp_refresh_token`, `resend_api_key`, `recaptcha_secret_key`,
  `google_refresh_token`. La app está en desarrollo, sin clientes. Pregunta a
  resolver en el discuss de la Fase 1: **¿la base estuvo desplegada en la URL
  pública de Vercel (`gestion.forjo.studio`) con secretos REALES cargados?**
  - Solo localhost → no rotar nada.
  - URL pública con secretos reales → rotar los reales y baratos (reCAPTCHA,
    Resend, ADMIN_SECRET, CRON_SECRET; MP/Google solo si son de cuenta real). No
    urgente-hoy, pero antes del primer cliente.
  - `SUPABASE_SERVICE_ROLE_KEY` NO se expone por RLS (server-only) → no aplica.
- **Fase 1 — patrón de fix:** vista pública acotada (como `public_professionals`
  en `007_professionals_extended.sql`) vs tabla `business_secrets` separada.

## Skills del proyecto a respetar (se activan solas, scopeadas a forjo-app/)

- `convenciones-forjo` — contexto base (stack, arquitectura, naming).
- `supabase-multitenant-rls` — **clave en Fases 1 y 5.** Aislamiento por tenant +
  checklist de tests de aislamiento.
- `mercadopago-suscripciones` — **clave en Fase 2.** Patrón de pagos/webhooks ya
  validado en producción; no reinventar el flujo.

## Notas de stack (no asumir lo contrario)

- **Next.js 16** (App Router), NO Next 14. Breaking changes; consultar
  `node_modules/next/dist/docs/` antes de escribir código (ver `AGENTS.md`).
- El middleware es **`proxy.ts`** en la raíz, no `middleware.ts`.
- Supabase con RLS, aislamiento por `business_id`. MercadoPago sin SDK (fetch
  crudo). Vercel Hobby (cron solo diario). Dev: Windows + PowerShell.

## Fuera de scope de este milestone (backlog v2)

Idempotencia de webhooks (`webhook_events`), rate-limiting en booking,
unificación de fuentes de verdad de planes, Supabase CLI migrations, tipado de
`mpFetch`. Deuda/robustez, no agujeros de seguridad — no bloquean el launch.
