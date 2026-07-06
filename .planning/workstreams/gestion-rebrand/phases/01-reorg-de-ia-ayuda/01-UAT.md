---
status: partial
phase: 01-reorg-de-ia-ayuda
source: [01-VERIFICATION.md]
started: 2026-07-05T16:35:00Z
updated: 2026-07-05T17:05:00Z
---

## Current Test

[testing complete]

## Tests

### 1. Hub Negocio (4 tabs) + split Configuración (3 tabs)
expected: Hub Negocio con 4 tabs, tab Datos activa por defecto, contenido de las tabs migradas idéntico (behavior-frozen); /settings con solo 3 tabs (Apariencia · Seguridad · Suscripción).
result: pass
note: Los botones "Guardar" / "Liberar horarios vencidos" se ven full-width — estilo pre-existente (behavior-frozen no lo cambió). Mejora visual diferida al backlog, no es gap de esta fase.

### 2. Flujo OAuth de MercadoPago aterriza en /negocio → Integraciones
expected: Redirect final a /negocio?mp=connected|error, tab Integraciones activa, toast correspondiente (conectado o error), URL final limpia = /negocio.
result: blocked
blocked_by: release-build
reason: "El OAuth de MP no se puede probar end-to-end desde localhost: connect/route.ts y callback/route.ts arman la base con NEXT_PUBLIC_APP_URL (apunta a gestion.forjo.studio), así que MP devuelve el callback al dominio de producción, que corre código viejo y cae en /settings. El código de la rama SÍ redirige a /negocio?mp= (callback L69, 0 residual /settings?mp=, verificado por grep + verifier). Requiere deploy de la rama para UAT visual del landing + tab Integraciones + toast."

### 3. Dos accesos a /ayuda + disclosures nativos + drawer mobile
expected: Los dos accesos (footer del sidebar con ícono HelpCircle + link "¿Necesitás ayuda? Ver la guía" en /settings) navegan a /ayuda. En mobile el drawer del sidebar se cierra al hacer clic. Las 7 preguntas visibles con disclosures nativos; varias pueden abrirse a la vez; el chevron rota al abrir/cerrar; foco por teclado accesible.
result: pass

### 4. Gating por vertical (canchas vs general) tras la reorg
expected: En canchas, GESTIÓN muestra Servicios · Consultorios · Negocio (Equipo ausente). En general/belleza/salud, GESTIÓN muestra Servicios · Equipo · Consultorios · Negocio.
result: pass

## Summary

total: 4
passed: 3
issues: 0
pending: 0
skipped: 0
blocked: 1

## Gaps
