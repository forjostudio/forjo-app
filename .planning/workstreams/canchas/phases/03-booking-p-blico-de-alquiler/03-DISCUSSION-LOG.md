# Phase 3: Booking público de alquiler — Discussion Log

**Date:** 2026-07-01
*Human-reference only. No lo consumen los agentes downstream — leen CONTEXT.md.*

## Áreas discutidas y decisiones

### 1. Exposición de la cancha al anon (central, deferida por el ROADMAP)
- **Opciones:** vista `public_canchas` dedicada vs extender `public_professionals` con `service_id`.
- **Elegido:** vista `public_canchas` dedicada [Recomendado] → migr. 044 aditiva; expone {business_id, id, name, price, duration_minutes}, sin service_id ni config interna. → D-01.

### 2. UI del booking de canchas (UI hint: yes)
- **Opciones:** flujo de canchas dedicado vs adaptar el BookingClient existente.
- **Elegido:** flujo dedicado [Recomendado] → client component propio; elegir cancha (precio+duración visible) → horario, sin picker de duración/profesional. Reusa availability/create. → D-02.

### 3. Seña / precio
- **Opciones:** reusar seña fija business-level vs seña = precio completo vs sin seña.
- **Elegido:** reusar la seña fija de hoy [Recomendado] → la cancha muestra su precio (ALQUILER-04), la reserva lo registra, se reusa reCAPTCHA+pending_payment+MP. → D-04.

### 4. Integración con la landing
- **Opciones:** en ambos caminos (legacy + LandingRenderer) gateado por vertical vs solo legacy.
- **Elegido:** en ambos, gateado por vertical [Recomendado]. → D-05.

## Resuelto por Claude (no discutido)
- **Anti-tampering (D-03):** el cliente manda professional_id, nunca service_id/precio; el create deriva el service de professional.service_id server-side. Patrón vigente del repo.
- **Dos turnos consecutivos (D-06):** inherente, sin UI/lógica nueva (reservar dos slots).

## Deferred
Seña=precio completo/por cancha (no elegido), pricing por franja (v2), duración custom (descartada).
