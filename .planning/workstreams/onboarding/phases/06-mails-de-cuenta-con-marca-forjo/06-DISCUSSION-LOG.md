# Phase 6: Mails de cuenta con marca Forjo — Discussion Log

**Date:** 2026-07-17
**Mode:** discuss (default)

> Registro para referencia humana. NO lo consumen los agentes downstream (eso es el CONTEXT.md).

## Hallazgo que abrió la discusión
`lib/email.ts:29` manda los transaccionales de turnos desde `notificaciones@forjo.studio` → el dominio `forjo.studio` YA está verificado en Resend (SPF/DKIM hecho). El "grueso de config de DNS" que temía el ROADMAP no existe.

## Áreas discutidas

### 1. SMTP: Resend vs solo plantillas
- **Opciones presentadas:** SMTP custom vía Resend (recomendada) · Solo editar las plantillas.
- **Elegido:** SMTP custom vía Resend.
- **Razón:** el requisito MAIL-01/02 pide "remitente de Forjo"; solo-plantillas deja `noreply@mail.app.supabase.io` → a medias. Y el dominio ya está verificado, así que Resend es barato. → D-01, D-02.

### 2. Remitente
- **Opciones presentadas:** `no-reply@forjo.studio` (recomendada) · reusar `notificaciones@forjo.studio`.
- **Elegido:** `no-reply@forjo.studio`.
- **Razón:** dirección dedicada para mails de cuenta, separada de las notificaciones de turnos. Cero config extra (mismo dominio verificado). → D-03.

## Decisiones de Claude (discreción)
- HTML del branding (layout, logo inline vs hospedado) → research/planner con las limitaciones de clientes de mail.

## Ideas diferidas
Ninguna. Otros mails de auth (magic link, cambio de email) no están en uso.

## Flags para el research
Confirmar (no asumir): dominio verificado en Resend alcanza para `no-reply@`; datos exactos del SMTP de Resend; qué se reproduce en `config.toml` local (UAT con Mailpit) vs solo-Dashboard.
