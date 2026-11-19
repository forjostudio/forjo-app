# Quick Task 261119-q8v: Onboarding — paso 5 opcional de integraciones (MercadoPago y Google Calendar) - Context

**Gathered:** 2026-11-19
**Status:** Ready for planning

<domain>
## Task Boundary

Al tocar «Finalizar» en el onboarding el negocio se crea igual que hoy. En vez de ir directo a `/dashboard`, el
dueño ve un paso más, opcional, «Conectá tus integraciones», con una tarjeta para MercadoPago y otra para Google
Calendar (estado sin conectar / conectado), el CTA principal «Ir al panel», y la vuelta de cada OAuth regresa a
esa pantalla marcando conectado o mostrando el error con reintento. Objetivo del dueño: que termine el onboarding
configurado. Las integraciones se conectan con los MISMOS endpoints de hoy (`/api/mercadopago/connect|callback`,
`/api/google/connect|callback`); lo nuevo es el destino de vuelta.

Restricción estructural: las integraciones guardan credenciales del negocio, así que no pueden conectarse antes de
que el negocio exista (se crea en `handleFinish`). El paso va DESPUÉS de crear el negocio.

</domain>

<decisions>
## Implementation Decisions

### Cómo se presenta el paso
- Es el **paso 5 del stepper** (canchas: el 4 visible, porque no tiene Profesionales): los pasos anteriores aparecen
  tildados y **no hay «Atrás»** — el negocio ya existe; los datos se editan desde el panel.
- CTA principal «Ir al panel» (siempre habilitado: todo es opcional). Cada tarjeta tiene su botón de conectar.

### Volver más tarde
- La pantalla tiene **ruta propia**: `/onboarding/integraciones`, accesible para el dueño con negocio ya creado.
- Se ofrece sólo durante el onboarding: no se linkea desde el panel; después de «Ir al panel» las integraciones
  viven en Negocio → Integraciones (como hoy). Sin columna ni tabla nueva en la base para esto (si hace falta
  distinguir «ya entró al panel», preferir algo sin migración; si la única forma correcta requiere migración, PARAR
  y consultar).
- La vuelta de los dos OAuth (`?mp=connected|error`, `?google=connected|error`) debe aterrizar en
  `/onboarding/integraciones` cuando el OAuth se inició desde ahí.

### Cuándo mostrar MercadoPago
- **Siempre**, con una aclaración: sirve para cobrar señas al reservar; si no se piden, se puede saltear.

### Seguridad (no negociable)
- El destino de vuelta del OAuth sale de una **lista CERRADA** de tokens (`'negocio' | 'agenda' | 'onboarding'`),
  nunca de un path crudo del cliente (anti open-redirect T-05-02, ya aplicado en Google). MercadoPago hoy vuelve
  fijo a `/negocio`: sumarle el mismo mecanismo de lista cerrada (cookie con token, validada en el callback).
- El `state` anti-CSRF de cada OAuth queda como está. El negocio se resuelve por `owner_id` de la sesión, como hoy.

### Claude's Discretion
- Cómo saber en `/onboarding/integraciones` qué está conectado (leer el estado real del server, no fiarse del
  `?mp=connected` de la URL).
- La ruta exacta de redirección en `handleFinish` y cómo se arma el stepper del paso 5 reutilizando el componente.
- El texto final de las tarjetas y del error, respetando el tono del panel (español rioplatense, directo).

</decisions>

<specifics>
## Specific Ideas

- Patrón existente a reutilizar: Negocio → Integraciones en `app/(dashboard)/settings/settings-client.tsx`
  (tarjetas de MP y Google, toast al volver, limpieza de `?mp=`/`?google=` por el helper de historial) y
  `app/api/google/connect/route.ts` (lista cerrada `from=negocio|agenda` + cookie `g_oauth_from`).
- Mobile-first (375px), touch targets ≥44px, estados de botón con loading al iniciar el OAuth.

</specifics>

<canonical_refs>
## Canonical References

- `.claude/skills/mercadopago-connect/SKILL.md` (OAuth del negocio con MercadoPago, puntos frágiles)
- `.claude/skills/convenciones-forjo/SKILL.md`, `.claude/skills/supabase-multitenant-rls/SKILL.md`
- `app/(onboarding)/onboarding/page.tsx` (`steps`, `visibleSteps`, `handleFinish` → `router.push('/dashboard')`)

</canonical_refs>
