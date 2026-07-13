# Phase 6: Comms (Bandeja) - Context

**Gathered:** 2026-06-24
**Status:** Ready for planning

<domain>
## Phase Boundary

Una **bandeja unificada de WhatsApp** dentro del CRM (`/admin/bandeja`): el operador ve las conversaciones que el agente IA (bot externo) mantiene con leads/negocios, con estados (IA atendiendo / Vos atendés / Sin asignar), filtros, y puede **"Tomar conversación"** (pausa al agente). Reproduce el mock `crm-design/07-bandeja.png`.

**Alcance v1 (Phase 6): SOLO WhatsApp.** Forjo construye TODO su lado, listo para que el bot sincronice:
- tablas `conversations`/`messages` (RLS), endpoint de **ingest** (POST del bot), `GET /api/agent/context` (read-only, nuevo), y la **UI de bandeja** (lista + thread + estados + filtros + takeover).

**Diferido fuera de Phase 6 (ver Deferred):**
- **Mail two-way (COMMS-03) ENTERO** → v2 (entrante necesita infra/costo no resuelto §9.2; una bandeja con mail solo-saliente es incoherente). El tab "Email" del mock NO entra en v1.
- **Envío manual saliente por WhatsApp** (Forjo→bot `send`) → slice de integración bot↔Forjo (requiere endpoint nuevo en el repo del bot). El composer queda "próximamente".
- La **sync real del bot** (cambios en el repo `whatsapp-ai-agent-kit`, single-tenant→N) → operativo, otro repo.

Cubre COMMS-01 (bandeja unificada, asociada a lead/negocio) y COMMS-02 (estados + takeover que pausa al agente) en v1. **COMMS-03 queda DIFERIDO.**
</domain>

<decisions>
## Implementation Decisions

### Scope de canales (qué entra en v1)
- **D-01:** Phase 6 = **bandeja WhatsApp únicamente**. Mail two-way (COMMS-03, entrante + saliente) se **difiere entero a v2**; sin tab "Email" en v1. Razón: el inbound (§9.2) necesita infra/costo no resuelto (proveedor + DNS/MX); una bandeja "unificada" con mail solo-saliente no es coherente (el tab Email del mock muestra mails recibidos). Faseo §9.5: shipear la mitad WhatsApp (ya de-riesgada por el agent kit) y hacer mail como su propio slice. Decisión tomada vía `forjo-advisor`.

### Integración con el agente WhatsApp (arquitectura LOCKED del agent kit)
- **D-02:** Forjo-side **completo, listo para el bot**: tablas `conversations`/`messages` + endpoint de **ingest** (POST del bot) + `GET /api/agent/context` (nuevo) + UI de bandeja. La sync real del bot se configura después (otro repo).
- **D-05:** Contrato de **ingest** (del `HANDOFF-forjo-integration.md` del agent kit): el bot hace **POST** a un endpoint de Forjo autenticado con **`FORJO_AGENT_TOKEN`** (header), Forjo **valida slug→negocio** y escribe en `conversations`/`messages`. El bot **NO recibe credenciales de Supabase**. La sync es **OPCIONAL** (toggle del bot); SQLite sigue siendo el source of truth del bot, Supabase es destino. Idempotencia por id de mensaje del bot (evitar duplicar en reintentos).
- **D-06:** `GET /api/agent/context?slug=<slug>` (read-only, service-role por slug, `force-dynamic`) — **NUEVO en el repo** (hoy no existe). Devuelve lo mismo que la página pública: name/slug/address/mapsUrl/**bookingUrl** + services + hours + notes. El bot lo lee cada ~10 min para armar su prompt; la tool `agendar` manda el `bookingUrl`. "Modo Forjo" del bot es condicional (`FORJO_BASE_URL`+`FORJO_SLUG`).

### Takeover (COMMS-02)
- **D-03:** "Tomar conversación" setea el **estado IA→Humano** en Forjo (`conversations.handled_by` = `human`/`ai`/`unassigned`) y lo **expone para que el bot lo lea y pause** (el bot ya tiene Modo IA/Modo Humano). El **envío manual saliente DIFERIDO** (composer "próximamente") hasta que el bot exponga un endpoint `send`. La acción de tomar queda **auditada** (logAudit). COMMS-02 cubierto en su parte de estado/takeover.

### Modelo de datos + aislamiento (compartido cross-milestone)
- **D-04:** `conversations`/`messages` son **tablas canónicas** creadas en Phase 6 (migración nueva). **RLS business-scoped** (el dueño ve SOLO las conversaciones de su `business_id` — base del add-on "Mensajes" de [[gestion-rebrand-milestone]]) **+ override admin** (el operador `is_admin` ve todas, como el resto del CRM). Estados: `unassigned`/`ai`/`human`. **Asociación a lead/negocio por teléfono/email** (match contra `leads`/`businesses`); conversación sin match = "Sin asignar". `gestion-rebrand` (add-on Mensajes del dueño) **reusa estas tablas**, no crea otras.
  - Patrón RLS: combinar `business_id = <owner>` (dueño, vía `businesses.owner_id`) con el override `is_admin` del JWT (operador). Consultar `supabase-multitenant-rls` al definir las policies. El **ingest** (POST del bot) escribe vía **service-role** tras validar slug→`business_id` (el bot no tiene sesión).

### Claude's Discretion
- Schema exacto de `conversations`/`messages` (columnas, índices, id externo del bot para idempotencia).
- Forma del endpoint de ingest (shape del payload del bot) — alinear con el `HANDOFF` del agent kit.
- Estructura de componentes de la bandeja (lista/thread/composer-disabled).
</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Diseño (contrato LOCKED A12)
- `c:/Users/franc/Desktop/Forjo Studio/crm-design/07-bandeja.png` — mock aprobado de la bandeja (lista con filtros Todas/WhatsApp/Email + badges de estado + no-leídos; thread con banner "agente IA respondiendo", botón "Tomar conversación", composer deshabilitado "Escribir por WhatsApp…"). NOTA: el tab "Email" NO entra en v1 (D-01).

### Roadmap / requirements / brief
- `.planning/workstreams/crm/ROADMAP.md` §"Phase 6: Comms (Bandeja)" — goal + success criteria + el gate técnico §9.
- `.planning/workstreams/crm/REQUIREMENTS.md` — COMMS-01, COMMS-02, COMMS-03 (esta última DIFERIDA).
- `c:/Users/franc/Desktop/Forjo Studio/forjo-crm-admin-brief.md` §4/§7/§9 — comms, "tomar conversación pausa al agente", y el gate §9.1 (stack agente, RESUELTO) / §9.2 (mail inbound, DIFERIDO).

### Contrato del agente WhatsApp (otro repo — LOCKED)
- `c:/Users/franc/Desktop/Forjo Studio/whatsapp-ai-agent-kit/HANDOFF-forjo-integration.md` — contrato de integración (GET /api/agent/context, POST de sync, FORJO_AGENT_TOKEN, toggle opcional). Fuente de verdad de la integración.

### Código fuente a respetar
- `lib/whatsapp.ts` — helpers de WhatsApp (formato wa.me) ya presentes.
- `lib/email.ts` — Resend saliente (referencia; mail diferido).
- `app/api/notify/booking/route.ts` + `cancel/route.ts` — patrones de notificación saliente.
- `supabase/migrations/034_crm_pipeline_tags_timeline.sql` — patrón RLS admin-only a combinar con business-scoped; `leads`/`businesses` para la asociación.
- `app/(crm)/admin/auditoria/page.tsx` — patrón session-client RLS-gated.
- `components/crm/crm-sidebar.tsx` — el item "Bandeja" está en PRONTO (habilitar como se hizo con "Reportes").
- `lib/audit.ts` — auditar "tomar conversación".

### Skills del proyecto
- `.claude/skills/supabase-multitenant-rls/SKILL.md` — RLS de `conversations`/`messages` (business-scoped + admin override + ingest service-role). CRÍTICO (aislamiento).
- `.claude/skills/convenciones-forjo/SKILL.md` — naming/estructura/stack.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `lib/whatsapp.ts` / `lib/email.ts` — helpers de comms saliente (referencia).
- `audit_log` + `logAudit` — auditar el takeover ("tomar conversación").
- `leads` / `businesses` — destino de la asociación por teléfono/email.
- CRM shell + sidebar (item "Bandeja" a habilitar) + el patrón de badges de estado (StatusBadge / tag-chip).

### Established Patterns
- **RLS multi-tenant**: combinar business-scoped (dueño) + override `is_admin` (operador) — NUEVO patrón mixto; hasta ahora el CRM era admin-only y el dashboard era business-scoped. Consultar `supabase-multitenant-rls`.
- **Ingest server-side con token**: espejo del webhook de pago (validar token → resolver tenant → escribir con service-role). El bot no tiene sesión Supabase.
- **Lectura RLS-gated** con session client para la bandeja del operador (admin ve todo vía override).

### Integration Points
- Nueva migración: `conversations` + `messages` (RLS business-scoped + admin override).
- Nuevo endpoint de ingest (POST del bot, `FORJO_AGENT_TOKEN`).
- Nuevo `GET /api/agent/context` (read-only).
- Nueva ruta `app/(crm)/admin/bandeja/` (page server + client) + habilitar nav.
</code_context>

<specifics>
## Specific Ideas

- El mock `07-bandeja.png` es la referencia visual (lista 2-paneles + thread + estados + "Tomar conversación" + composer deshabilitado). Reusar el patrón `--skip-ui` (mock = contrato, A12).
- El composer en v1 va **deshabilitado con copy "próximamente"** (el envío manual es diferido) — coherente con el mock que ya lo muestra deshabilitado hasta "tomar".
- **Riesgo en el radar (no bloquea build):** Baileys = WhatsApp NO oficial → riesgo de baneo del número (el número en riesgo es el del cliente, no Forjo). El doc del agente sugiere evaluar la API oficial a futuro.
</specifics>

<deferred>
## Deferred Ideas

- **Mail two-way completo (COMMS-03)** → v2. Requiere elegir infra de **inbound** (Resend inbound / Postmark / SES / Cloudflare Email Workers) = **costo + DNS/MX** (decisión de negocio/externa). Recién ahí tiene sentido el tab "Email" de la bandeja.
- **Envío manual saliente por WhatsApp** (Forjo→bot `send` + pausa activa del bot) → slice de **integración bot↔Forjo**; requiere endpoints NUEVOS en el repo del bot (`whatsapp-ai-agent-kit`, VPS) + coordinación cross-repo.
- **Refactor multi-tenant del bot** (single-tenant → N sesiones) → repo del bot.
- **Sync real del bot configurada** (toggle + FORJO_AGENT_TOKEN en producción) → operativo, otro repo.

### Reviewed Todos (not folded)
None — discussion stayed within phase scope.
</deferred>

---

*Phase: 06-comms-bandeja*
*Context gathered: 2026-06-24*
