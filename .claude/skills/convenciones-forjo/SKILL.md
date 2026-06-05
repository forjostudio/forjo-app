---
name: convenciones-forjo
description: >
  Contexto base de Forjo Gestión. Usar al arrancar cualquier tarea en este proyecto
  para no redescubrir el stack, la arquitectura multi-tenant, los verticales de negocio
  ni las convenciones. Triggers: cualquier trabajo sobre el dashboard, la página pública
  de booking, turnos, clientes, finanzas, onboarding, configuración por tipo de negocio,
  o dudas sobre estructura/stack/naming del proyecto. No incluye el detalle de pagos
  (ver skill mercadopago-suscripciones para eso).
---

# Forjo Gestión — convenciones del proyecto

Forjo Gestión es un **SaaS multi-tenant de gestión de turnos** para profesionales y
pequeños negocios. Cada cliente (negocio) tiene su propio espacio identificado por slug.
Forjo Studio (forjo.studio) es la marca/empresa; Forjo Gestión es el producto SaaS.

## Stack

- **Next.js 14** (App Router) + **Supabase** (Postgres + Auth) + **Vercel** (deploy).
- Emails transaccionales: **Resend**.
- Anti-spam en formularios públicos: **reCAPTCHA**.
- Pagos/suscripciones: **MercadoPago** (ver skill `mercadopago-suscripciones`).
- Dev local: **VS Code + Claude Code en Windows / PowerShell**. Tener en cuenta sintaxis
  PowerShell (no bash) para comandos de terminal.

## Infraestructura

- Landing estática: **forjo.studio** (repo `forjostudio/forjo-landing`, HTML estático en Vercel).
- App SaaS: **gestion.forjo.studio** (repo `forjostudio/forjo-app`, este proyecto).
- DNS en **Cloudflare** con wildcard. Org de GitHub: **forjostudio**.
- Email: `hola@forjo.studio` ruteado vía Cloudflare.

## Arquitectura multi-tenant

- **Página pública de booking:** ruta `/[slug]` — donde los clientes finales del negocio
  reservan turnos. El slug identifica al negocio (tabla `businesses`).
- **Dashboard admin** (lo usa el dueño del negocio): turnos, clientes, finanzas,
  configuración.
- **Onboarding** para dar de alta un negocio nuevo.
- Toda query a datos de un negocio debe estar correctamente aislada por tenant. Cuidar
  RLS en Supabase: un negocio nunca debe ver datos de otro.

## Verticales por tipo de negocio

La UI y los campos se adaptan según el tipo de negocio:

- **Salud:** terminología de "pacientes", historia clínica, obra social.
- **Belleza:** preferencias del cliente.
- **General:** base genérica.

Al agregar features, considerar si aplican a todos los verticales o solo a uno, y mantener
la terminología coherente con el vertical (ej. "paciente" vs "cliente").

## Funcionalidades clave

- Reserva de turnos con señas/depósitos vía MercadoPago.
- Gestión de horarios mediante `time_blocks`.
- Carga de logo del negocio.
- Emails (confirmaciones, recordatorios) vía Resend.
- (Futuro) Vertical de ventas/comercio con control de stock.

## Planes (suscripción)

Precios en ARS/mes, sin costo de setup, 30 días de prueba gratis. Se ajustan
trimestralmente, así que NO hardcodear montos asumiendo que son fijos — leerlos de la
fuente de configuración del proyecto.

- **Básico** — 1 profesional, 1 sucursal.
- **Estudio** — hasta 5 profesionales, 3 sucursales.
- **Pro** — hasta 15 profesionales, 10 sucursales.

(Montos y límites exactos: ver configuración del proyecto, no asumir de memoria.)

## Identidad de marca

- Estilo **Bauhaus dark**.
- Color de acento: **#d94a2b**.
- Tipografías: **Archivo** (titulares), **Space Grotesk** (texto), **JetBrains Mono**
  (código/datos).

## Reglas de trabajo en este repo

- Antes de cambiar un flujo, explorar y mostrar el código actual; confirmar el
  entendimiento antes de aplicar cambios grandes.
- No persistir estado de forma optimista en flujos asíncronos (pagos, webhooks): esperar
  la confirmación de la fuente de verdad.
- Mantener el aislamiento por tenant en cualquier query nueva.
- Respetar el toggle de entornos (`MP_MODE` y similares) — que funcione igual en test y
  producción.
