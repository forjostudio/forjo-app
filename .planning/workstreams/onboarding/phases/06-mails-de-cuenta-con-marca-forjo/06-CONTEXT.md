# Phase 6: Mails de cuenta con marca Forjo - Context

**Gathered:** 2026-07-17
**Status:** Ready for planning

<domain>
## Phase Boundary

Que los **dos mails de auth** que las fases 4 y 5 ya disparan —confirmación de cuenta y recuperación de contraseña— dejen de parecer de Supabase: español, marca Forjo, remitente de Forjo, sin "powered by Supabase". Es una fase de **config externa + verificación**, no de código autónomo — el grueso vive en el Dashboard de Supabase, Resend y (si hiciera falta) DNS.

**Contexto que cambia el tamaño de la fase:** estos dos mails los manda **Supabase (GoTrue)**, NO `lib/email.ts` (que manda los transaccionales de turnos). Hoy salen del default `noreply@mail.app.supabase.io`.

**Fuera de scope:** los mails transaccionales de turnos (ya andan por `lib/email.ts`), cualquier mail nuevo, y el rediseño de los flujos de auth (cerrados en 4 y 5). Esta fase solo brandea los 2 templates existentes y cambia el remitente.

</domain>

<decisions>
## Implementation Decisions

### SMTP / remitente (la decisión de fondo)
- **D-01:** **SMTP custom vía Resend.** Se apunta el SMTP de Supabase Auth a Resend, así GoTrue manda los 2 mails desde un remitente de Forjo, sin "powered by Supabase". Es lo único que cumple MAIL-01/02 de verdad (editar solo las plantillas dejaría el remitente `noreply@mail.app.supabase.io` → requisito a medias).
- **D-02:** **El dominio `forjo.studio` YA está verificado en Resend** — `lib/email.ts:29` manda los transaccionales de turnos desde `notificaciones@forjo.studio`, o sea el SPF/DKIM ya está hecho. **No hay laburo de DNS nuevo.** El checkpoint solo carga las credenciales SMTP de Resend en el Dashboard de Supabase; NO hay que verificar dominio de cero (verificar esto en el research/checkpoint antes de asumir).
- **D-03:** **Remitente = `no-reply@forjo.studio`** (dedicado para mails de cuenta), NO el `notificaciones@forjo.studio` de turnos. Separa auth de las notificaciones de negocio; con el dominio ya verificado, cualquier dirección `@forjo.studio` sale sin config extra. Es un solo remitente, se configura una vez en el SMTP de Supabase (aplica a los 2 mails).

### Alcance del branding
- **D-04:** Se brandean **solo los 2 templates que ya existen** (`supabase/templates/confirmation.html` y `recovery.html`, versionados en Phase 4): español, marca Forjo (logo/colores), sin el pie de Supabase. El `href` de cada uno **NO se toca en su mecánica**: sigue siendo `{{ .SiteURL }}/auth/callback?token_hash={{ .TokenHash }}&type=...` (lo que la Phase 4 dejó andando). Brandear el envoltorio, no el link.
- **D-05:** Los dos mails tienen que verse **de la misma familia** (mismo header, mismo remitente, misma marca) — criterio 2 del ROADMAP. No dos productos distintos.

### Claude's Discretion
- El HTML del branding (layout del mail, logo inline vs hospedado, colores) sigue la identidad de marca del proyecto; el research/planner define el detalle. Ojo: los clientes de mail son limitados (tablas, CSS inline, sin JS) — no es como una página web.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Los templates que se brandean (ya existen, de Phase 4)
- `supabase/templates/confirmation.html` — mail de confirmación de alta. El `href` con `token_hash` NO cambia de mecánica.
- `supabase/templates/recovery.html` — mail de recuperación. Idem.
- `supabase/config.toml` §`[auth.email.template.*]` y §`[auth.email.smtp]` — la config local de los templates + el bloque SMTP (hoy comentado). El research define qué se reproduce en local vs qué es solo-Dashboard.

### Resend ya cableado (reusar el dominio verificado)
- `lib/email.ts` — muestra el patrón de Resend en el repo: dominio `forjo.studio` verificado, sender `notificaciones@forjo.studio` para turnos. Phase 6 reusa el dominio (no la función — GoTrue manda por SMTP, no por este módulo). Las credenciales SMTP de Resend van al Dashboard de Supabase, NUNCA al repo ni a `NEXT_PUBLIC_*`.

### Requirements + seguridad heredada
- `.planning/workstreams/onboarding/REQUIREMENTS.md` — MAIL-01 (confirmación branded), MAIL-02 (recuperación branded, mismo remitente).
- `.planning/workstreams/onboarding/phases/04-recuperar-la-cuenta-auth-callback-reset/04-SECURITY.md` — el contrato del token en el link (T-04-02, T-04-06). Brandear el template NO puede romper ni exponer el `token_hash` ni meter un `redirect_to` arbitrario.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- **Dominio Resend verificado (`forjo.studio`):** el activo clave. Ya sirve turnos; Phase 6 lo reusa para el SMTP de auth. Cero DNS nuevo (confirmar en el checkpoint).
- **Los 2 templates de Phase 4:** ya tienen el `token_hash` correcto en el `href`. Phase 6 les cambia el envoltorio (marca + idioma), no el link.
- **La marca del proyecto** (logo, colores, tipografía) — ya definida; el mail la refleja con las limitaciones de los clientes de correo.

### Established Patterns
- **Secretos server-only en el Dashboard, no en git:** las credenciales SMTP de Resend siguen el patrón del proyecto (service role, tokens MP, etc. viven fuera del repo).
- **Config versionada local + checkpoint humano en prod:** igual que Phase 4/5 — `config.toml` reproduce lo reproducible; el Dashboard es el checkpoint.

### Integration Points
- Supabase Dashboard → Authentication → SMTP Settings (custom SMTP con host/usuario/pass de Resend + sender `no-reply@forjo.studio`).
- Supabase Dashboard → Authentication → Email Templates (Confirm signup + Reset password) — pegar el HTML branded.

</code_context>

<specifics>
## Specific Ideas

- El research DEBE confirmar (no asumir): (a) que `forjo.studio` está verificado en Resend y alcanza para mandar desde `no-reply@forjo.studio` sin verificación nueva; (b) los datos exactos del SMTP de Resend (host `smtp.resend.com`, puerto, usuario `resend`, pass = un API key de Resend) para el Dashboard de Supabase; (c) qué del branding + SMTP se puede reproducir en `config.toml` local (para un UAT local con Mailpit) vs qué es solo-Dashboard.
- Los links de los 2 mails tienen que seguir andando end-to-end tras el cambio (criterio 3, cero regresión sobre Phase 4). Y el criterio 4 (bandeja, no spam) exige un **envío real a Gmail** desde el remitente configurado — parte del UAT.

</specifics>

<deferred>
## Deferred Ideas

None — la discusión se mantuvo en scope. Otros mails de auth (magic link, cambio de email) no están en uso hoy; si se activan, se brandean en su momento.

</deferred>

---

## Checkpoint humano (autonomous: false) — el grueso de la fase

1. **Resend:** confirmar que `forjo.studio` está verificado (debería, lo usa turnos) y obtener un API key para el SMTP.
2. **Supabase Dashboard → Auth → SMTP:** cargar custom SMTP (host `smtp.resend.com`, usuario `resend`, pass = API key, sender `no-reply@forjo.studio` + display name Forjo).
3. **Supabase Dashboard → Auth → Email Templates:** pegar el HTML branded de Confirm signup + Reset password, **sin romper el `href` con `token_hash`**.
4. **UAT:** envío real a una casilla de Gmail — verificar marca, remitente, español, que el link funciona end-to-end, y que **cae en bandeja, no en spam** (criterio 4).

## Threat note — correr /gsd:secure-phase (alcance acotado)

Menor superficie que 4 y 5, pero es el canal por el que viaja el token. Riesgos: (a) romper o exponer el `token_hash` al reescribir el template; (b) meter un `redirect_to` arbitrario en el href (open redirect por otra puerta — mantener `{{ .SiteURL }}`, no `{{ .RedirectTo }}`); (c) credenciales SMTP en el lugar equivocado (van al Dashboard, NUNCA a `NEXT_PUBLIC_*` ni al repo). Continúa T-04-02/T-04-06/T-04-20 de Phase 4.

---

*Phase: 06-mails-de-cuenta-con-marca-forjo*
*Context gathered: 2026-07-17*
