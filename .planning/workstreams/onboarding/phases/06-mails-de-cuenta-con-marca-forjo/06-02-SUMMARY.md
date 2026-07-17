---
phase: 06-mails-de-cuenta-con-marca-forjo
plan: 02
subsystem: auth
tags: [email, resend, smtp, supabase, templates, checkpoint, uat, deliverability]

requires:
  - phase: 06-01
    provides: "los 2 templates brandeados + subjects en español + guard test del href"
provides:
  - "Custom SMTP vía Resend en el Dashboard de Supabase (remitente no-reply@forjo.studio)"
  - "Los 2 templates branded + subjects en español pegados en prod"
  - "UAT prod con envío real: los mails de cuenta llegan con marca Forjo, en español, sin powered-by-Supabase"
affects: []

tech-stack:
  added: []
  patterns:
    - "Custom SMTP de Supabase Auth apuntando a Resend (dominio ya verificado); credenciales solo en el Dashboard"

key-files:
  created: []
  modified: []

key-decisions:
  - "Sender name = 'Forjo Gestión' (el dueño lo ajustó de 'Forjo' en el checkpoint) — coherente con la marca."

patterns-established: []

requirements-completed: [MAIL-01, MAIL-02]

duration: checkpoint humano + UAT prod interactivo
completed: 2026-07-17
status: complete
---

# Phase 6 · Plan 02: Checkpoint SMTP + UAT prod Summary

**Los mails de confirmación y recuperación dejaron de parecer de Supabase: llegan en español, con marca Forjo, desde `no-reply@forjo.studio`. UAT prod confirmado por el dueño ("anduvo").**

## Task 1 — Config externa (checkpoint humano)

Ejecutado por el dueño en el Dashboard de Supabase (prod):

- **Custom SMTP vía Resend:** host `smtp.resend.com`, user `resend`, pass = API key de Resend, sender `no-reply@forjo.studio` con display name **"Forjo Gestión"** (el dueño ajustó el display de "Forjo" a "Forjo Gestión"). El dominio `forjo.studio` ya estaba verificado (lo usa el mail de turnos), así que no hubo DNS nuevo (A1/D-02 confirmado en la práctica).
- **Templates pegados en prod:** Confirm sign up ← `confirmation.html` (subject "Confirmá tu cuenta en Forjo Gestión"); Reset password ← `recovery.html` (subject "Restablecé tu contraseña"). El `href` con `token_hash` se pegó intacto en los dos.

**Nota de proceso:** el subject y el body son campos independientes en el Dashboard — pegar el body no arrastra el subject. Se cargaron los dos subjects en español a mano.

## Task 2/3 — UAT

**Contenido de los templates (verificado por el orquestador, pre-checkpoint):** los 2 en `lang="es"`, logo hospedado (`gestion.forjo.studio/brand/forjo-gestion-lockup-crema.png`), un solo CTA naranja, href con `token_hash` byte a byte, sin "powered by Supabase" visible (la única mención a "Supabase" es un comentario HTML que no renderiza). Misma familia visual (mismo header dark, footer, CTA) — D-05.

**Envío real (prod, confirmado por el dueño):** los mails de cuenta llegan con la marca Forjo, en español, desde `no-reply@forjo.studio` — sin "powered by Supabase" ni el remitente default. UAT PASS ("anduvo").

| Criterio ROADMAP | Resultado |
|---|---|
| 1 — confirmación branded/español/remitente Forjo (MAIL-01) | ✓ |
| 2 — recuperación misma familia/remitente (MAIL-02) | ✓ |
| 3 — links funcionan end-to-end, cero regresión de Phase 4 | ✓ (guard test 8/8 + href intacto + callback sin cambios) |
| 4 — llegan a bandeja (envío real a Gmail) | ✓ (confirmado por el dueño) |

## Pendiente

- **Secure-phase:** correr `/gsd:secure-phase 6 --ws onboarding` al cierre (threat model T-06-01…06 — el token en el link, sin redirect reflejado, credenciales SMTP solo en el Dashboard).
- El código autónomo (templates + guard + subjects locales) ya está en `main` local; falta pushear los commits de docs de la fase.

## Cierre del milestone

Con esta fase, **v0.19 "Cuenta y acceso" queda completo:** recuperar contraseña (Phase 4) + entrar con Google (Phase 5) + mails de cuenta con marca Forjo (Phase 6). Los 3 agujeros de la puerta de entrada, cerrados.
