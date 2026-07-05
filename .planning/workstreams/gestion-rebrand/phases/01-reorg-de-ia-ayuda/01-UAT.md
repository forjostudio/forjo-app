---
status: testing
phase: 01-reorg-de-ia-ayuda
source: [01-VERIFICATION.md]
started: 2026-07-05T16:35:00Z
updated: 2026-07-05T16:35:00Z
---

## Current Test

number: 1
name: Hub Negocio (4 tabs) + split Configuración (3 tabs)
expected: |
  Hub Negocio visible con 4 tabs (Datos del negocio · Cobros · Integraciones · Notificaciones/Mails);
  tab Datos seleccionada por defecto; contenido de Cobros/Integraciones/Notificaciones idéntico al que
  mostraba /settings antes; /settings con solo 3 tabs (Apariencia · Seguridad · Suscripción).
awaiting: user response

## Tests

### 1. Hub Negocio (4 tabs) + split Configuración (3 tabs)
expected: Hub Negocio con 4 tabs, tab Datos activa por defecto, contenido de las tabs migradas idéntico (behavior-frozen); /settings con solo 3 tabs (Apariencia · Seguridad · Suscripción).
result: [pending]

### 2. Flujo OAuth de MercadoPago aterriza en /negocio → Integraciones
expected: Redirect final a /negocio?mp=connected|error, tab Integraciones activa, toast correspondiente (conectado o error), URL final limpia = /negocio.
result: [pending]

### 3. Dos accesos a /ayuda + disclosures nativos + drawer mobile
expected: Los dos accesos (footer del sidebar con ícono HelpCircle + link "¿Necesitás ayuda? Ver la guía" en /settings) navegan a /ayuda. En mobile el drawer del sidebar se cierra al hacer clic. Las 7 preguntas visibles con disclosures nativos; varias pueden abrirse a la vez; el chevron rota al abrir/cerrar; foco por teclado accesible.
result: [pending]

### 4. Gating por vertical (canchas vs general) tras la reorg
expected: En canchas, GESTIÓN muestra Servicios · Consultorios · Negocio (Equipo ausente). En general/belleza/salud, GESTIÓN muestra Servicios · Equipo · Consultorios · Negocio.
result: [pending]

## Summary

total: 4
passed: 0
issues: 0
pending: 4
skipped: 0
blocked: 0

## Gaps
