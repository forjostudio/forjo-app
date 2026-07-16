---
created: 2026-06-18T15:39:45.362Z
title: Brandear email de confirmación de signup (Supabase Auth)
area: auth
resolves_phase: 6
files: []
---

## Problem

Al registrarse un negocio nuevo, el email de "Confirm your email address" lo manda
**Supabase Auth** con su plantilla default: en inglés, sin marca, remitente
`noreply@mail.app.supabase.io`, y con el pie "powered by Supabase". Se ve poco
profesional para un onboarding de cliente real.

Detectado durante el checkpoint humano de la Fase 7 (web-builder), pero NO es parte
de ese milestone ni del código del repo — es configuración de Auth en Supabase.

## Solution

Dos caminos (ambos en el **Dashboard de Supabase**, requieren acción externa — no es
código del repo):

- **(a) Rápido:** Auth → Email Templates → editar "Confirm signup": pasarlo a español
  con marca Forjo, subject y cuerpo propios. Sigue saliendo desde el remitente de
  Supabase salvo que se configure SMTP.
- **(b) Completo:** configurar **custom SMTP** (ej. Resend, que ya se usa para los
  transaccionales de turnos vía `lib/email.ts`) + plantillas branded. Saca el
  "powered by Supabase" y unifica el remitente con el resto de los mails de Forjo.

Recomendación: empezar por (a) para salir del default feo; mover a (b) cuando se
unifique el dominio de envío. Tema de onboarding/auth — agendar fuera del milestone
web-builder v0.10. Relacionado con `lib/email.ts` (Resend ya integrado).
