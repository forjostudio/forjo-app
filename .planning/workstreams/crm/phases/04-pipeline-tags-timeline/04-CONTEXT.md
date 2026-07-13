# Phase 4: Pipeline, Tags & Timeline - Context

**Gathered:** 2026-06-20
**Status:** Ready for planning

<domain>
## Phase Boundary

Esta fase entrega, dentro de la Consola CRM (`app/(crm)/admin/`, operador único `is_admin`):

1. **Pipeline de ventas operable** — un tablero kanban de etapas fijas (Lead · Calificado · Trial · Propuesta · Pago) donde cada tarjeta es un *deal* con valor, contacto, % y fecha; el operador arrastra tarjetas para cambiar de etapa (PIPE-01, PIPE-02).
2. **Conversión lead→business** — un lead se convierte en `business` (tenant) manteniendo vinculado su historial de pipeline, automáticamente en el signup público del trial (match por email) y también manualmente desde el tablero (PIPE-03).
3. **Tags filtrables** — catálogo global de tags (color + texto) asignables a leads y negocios, con filtro por tag tanto en el pipeline como en el directorio de negocios (PIPE-04).
4. **Timeline cronológico unificado** — pestaña "Timeline" en la ficha de negocio/lead que agrega cambios, impersonaciones, notas y tareas en orden cronológico, distinta de la futura Bandeja (chat en vivo, Phase 6) (TL-01).

**Fuera de scope (otras fases):** Bandeja/comms WhatsApp+mail (Phase 6), reportes/gráficos de revenue y conversión (Phase 5), separar Contactos de Empresas (OUT of scope del milestone — modelo dueño-solo).
</domain>

<decisions>
## Implementation Decisions

### Modelo de datos del pipeline
- **D-01:** El schema separa `leads` (1) y `deals` (N) — un lead puede tener varios deals. **Razón:** seguro barato contra migración futura cuando un contacto tenga varios deals multi-producto (Gestión, Web Builder, agente). La sofisticación va en el data model (caro de migrar), no en la UI.
- **D-02:** La UI arranca **simple: un deal por lead** (como el mock `02-pipeline.png`), sin pantallas de multi-deal todavía. Las tarjetas del tablero muestran un único deal por prospecto.
- **D-03:** Las **etapas son fijas en código** (constante única `STAGES = [{key,label,color,order}]` con las 5 del mock: Lead/Calificado/Trial/Propuesta/Pago), almacenadas en el deal como columna **`text` con CHECK** (NO enum nativo de Postgres). **Razón:** reproduce el mock, evita over-engineering de etapas configurables (operador único), y deja extensible el agregar una etapa futura (cambio de constante + CHECK, sin ALTER TYPE ni tabla de config). La constante es fuente de verdad para el tablero, los totales $ por columna y la conversión por etapa que Phase 5 (RPT-02) consumirá. _(decidido por forjo-advisor)_
- **D-04:** El deal tiene un **estado `open | won | lost` separado de la etapa**. La etapa es el progreso; `won` al llegar a Pago/convertir, `lost` manual con motivo. Habilita el "$ ganados" del mock y saca perdidos del tablero. Phase 5 necesita estas métricas de conversión.

### Conversión lead→business (PIPE-03)
- **D-05:** Disparador **dual: automático en el signup público del trial + manual del operador**. El registro busca un lead con ese email y lo vincula (deal→`won`, `business_id` seteado); si no existe, crea el lead ya convertido. El operador también puede convertir/vincular desde el tablero. Cubre PIPE-01 (signup entra al pipeline) y PIPE-03.
- **D-06:** Matching por **email normalizado, con fallback manual**. El email del owner que se registra = email del lead; si no hay match, se crea lead nuevo ya convertido y el operador puede re-vincular a mano. **Nota de implementación:** el signup público corre fuera de la sesión admin — el link a `leads`/`deals` (tablas admin-only) debe hacerse vía **service-role con scope acotado** (patrón booking), nunca exponiendo las tablas a anon.

### Tags (PIPE-04)
- **D-07:** **Catálogo global administrable** — tabla `tags` (texto + color); el operador crea/edita; se asignan vía join. Coincide con el mock (chips compartidos arriba del tablero) y da filtro confiable.
- **D-08:** **Un solo catálogo compartido** entre leads y negocios (join por tipo de entidad). El mock filtra por los mismos chips en pipeline y en el directorio de negocios.
- **D-09:** Filtro multi-tag con semántica **OR** (muestra los que tengan cualquiera de los tags seleccionados). **Razón:** intuitivo en UI de chips toggle, implementación más simple/correcta (una query de overlap / EXISTS IN), aditivo si en el futuro hace falta AND. _(decidido por forjo-advisor)_
- **D-10:** Los tags **`rubro: X` se autoderivan del `type`/vertical del negocio**; el resto (lead caliente, riesgo de churn, oportunidad upsell, referido, cuenta grande) se asignan a mano. El dato del vertical ya existe — menos trabajo manual y consistencia con el negocio real.

### Timeline (TL-01)
- **D-11:** **Vista agregada on-the-fly** mediante una **VIEW SQL** (`crm_timeline`) que hace UNION de fuentes normalizadas (`audit_log` filtrado por `business_id` + notas + tareas) con shape común (`kind`, `actor_type`, `title`, `body`, `occurred_at`, `metadata`) y `ORDER BY occurred_at DESC`. **SIN** tabla materializada `timeline_events`. **Razón:** `audit_log` (031) es la fuente de verdad de auditoría y el core value del milestone — duplicarla introduce dual-write y drift, inaceptable. Volumen por negocio bajo (operador único) → costo de merge nulo. Phase 6 agrega comms como otra rama del UNION (`CREATE OR REPLACE VIEW`) sin migrar datos. _(decidido por forjo-advisor)_
- **D-12:** Esta fase **crea Notas** (crear/editar/borrar) **+ Tareas livianas** (crear/completar: título + due opcional + flag `done`). Sin asignación, recordatorios ni recurrencia (operador único). **Razón:** TL-01 nombra explícitamente "tareas y notas" como fuentes del timeline; el alcance liviano cubre el requirement + el mock (`+ Nota`, `Tarea completada`) sin gold-plating. _(decidido por forjo-advisor)_
- **D-13:** Degradación sin Bandeja/comms (Phase 6): **mostrar todos los filtros del timeline con empty state** (chips Mensajes/Llamadas existen pero muestran "Sin mensajes — llegan con la Bandeja"). Reproduce el mock fiel (`05-ficha-timeline.png`) y queda listo para Phase 6 sin re-tocar la UI. Los filtros activos con datos en esta fase: Notas, Tareas, Cambios (+ Vista solo lectura/impersonaciones).

### Seguridad / aislamiento (no negociable)
- **D-14:** Todas las tablas nuevas del CRM (`leads`, `deals`, `tags`, joins de tags, `notes`, `tasks`) son **admin-only por RLS**, espejando el patrón de `audit_log` (031): SELECT/escritura solo para `is_admin = true` leído del JWT (`app_metadata`), nunca de una columna. La VIEW `crm_timeline` hereda el gate admin-only. Acceso server-side vía `requireAdmin()` + `logAudit()` donde aplique (crear/borrar nota, completar tarea, cambiar etapa, convertir lead son acciones a auditar según corresponda). Toda query del CRM filtra por `business_id`/`lead_id` para evitar fuga cross-entidad.
- **D-15:** Próxima migración: **034** (SEC: numerada, aplicada a mano y en orden, coordinada con deploy).

### Claude's Discretion
- Forma exacta de los schemas Zod, granularidad de los códigos de error, estructura de carpetas dentro de `app/(crm)/admin/` (seguir convenciones del repo y de las fases 1-3).
- Mecánica concreta del drag-and-drop (librería ya bundleada vs handler nativo) — preferir zero-install / lo ya presente; flaggear si requiere dependencia nueva.
- Estrategia de paginación del timeline (keyset vs limit/offset sobre la VIEW).
</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Brief y diseño aprobado (fuente de verdad del milestone)
- `c:\Users\franc\Desktop\Forjo Studio\forjo-crm-admin-brief.md` — decisiones LOCKED del CRM (§1), roadmap sugerido (§10), incorporaciones aprobadas (§12), modelo dueño-solo.
- `c:\Users\franc\Desktop\Forjo Studio\crm-design\02-pipeline.png` — diseño aprobado del tablero de pipeline (etapas, tarjetas, fila de tags, $ por columna, drag-and-drop). Reproducir fiel.
- `c:\Users\franc\Desktop\Forjo Studio\crm-design\03-negocios.png` — directorio de negocios con filtro por tag (consistencia con el pipeline).
- `c:\Users\franc\Desktop\Forjo Studio\crm-design\04-ficha-resumen.png` — ficha de negocio, tab Resumen (contexto de tags + tab Timeline).
- `c:\Users\franc\Desktop\Forjo Studio\crm-design\05-ficha-timeline.png` — diseño aprobado del Timeline (banner "Ir a Bandeja", "+ Nota", filtros Todo/Mensajes/Llamadas/Notas/Tareas/Cambios, entradas con actor OPERADOR/CLIENTE/IA). Reproducir fiel.

### Requirements y roadmap del workstream
- `.planning/workstreams/crm/REQUIREMENTS.md` — PIPE-01..04, TL-01 (+ OUT of scope: separar contactos/empresas, multi-operador).
- `.planning/workstreams/crm/ROADMAP.md` §"Phase 4" — goal y success criteria; dependencia de Phase 2; Phase 5 (RPT) depende de Phase 4.

### Base existente a reusar (fases 1-3)
- `supabase/migrations/031_crm_audit_log.sql` — tabla `audit_log` (RLS admin-only, columnas `action/target_type/target_id/business_id/reason/metadata/created_at`); FUENTE del timeline para Cambios + impersonaciones. Patrón de RLS admin-only a espejar.
- `supabase/migrations/032_crm_admin.sql` y `033_audit_actor_nullable.sql` — modelo admin de negocios (plan_prices, add-on flags, etc.).
- `app/(crm)/admin/negocios/[id]/ficha-client.tsx` — ficha con tabs Resumen/**Timeline (PRONTO, disabled)**: esta fase llena ese tab.
- `app/(crm)/admin/negocios/page.tsx` + `negocios-client.tsx` — directorio de negocios donde se agrega el filtro por tag.
- `app/(auth)/register/page.tsx` — flujo de signup/registro que crea `businesses`: punto de integración de la conversión auto lead→business.

### Skills del proyecto (LOCKED — leer antes de tocar schema/RLS)
- `.claude/skills/supabase-multitenant-rls/SKILL.md` — patrón de tablas/RLS/aislamiento (admin-only y por `business_id`). OBLIGATORIO para las tablas nuevas.
- `.claude/skills/convenciones-forjo/SKILL.md` — stack, naming, estructura.
</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `audit_log` (031) + `logAudit()` + `requireAdmin()`: el timeline lee de `audit_log`; las acciones nuevas (convertir lead, borrar nota, etc.) reusan `logAudit`/`requireAdmin`.
- `ConfirmDialog` escalonado (FND-03): reusable si alguna acción del pipeline necesita doble confirmación (ej. marcar `lost`, convertir).
- Componentes del shell CRM (cards, badges/RiskBadge, tabs, dialog, Toaster dark, CrmSidebar agrupado) de Phase 1 — el sidebar ya tiene entradas "Pipeline" y "Negocios" (ver mock).
- Tab "Timeline (PRONTO)" placeholder ya presente en `ficha-client.tsx`.

### Established Patterns
- Server Components leen Supabase directo + componentes client co-ubicados (`*-client.tsx`).
- Server actions con `requireAdmin` + zod + `logAudit`.
- Migraciones SQL numeradas, aplicadas a mano y en orden (próxima: 034).
- Tema Forjo default dark, acentos amarillo principal / azul info / rojo SOLO peligro.

### Integration Points
- **Signup público** (`app/(auth)/register`) → link a `leads`/`deals` vía service-role (las tablas son admin-only; nunca exponer a anon). Espejar el patrón de aislamiento del booking público.
- **Directorio de negocios** → nuevo filtro por tag compartido con el pipeline.
- **Ficha** → tab Timeline + fila de tags con "+ Tag".
</code_context>

<specifics>
## Specific Ideas

- Reproducir los mocks `02-pipeline.png` y `05-ficha-timeline.png` con fidelidad (spacing, colores de etapa, chips de tags con dot de color, badges de actor OPERADOR/CLIENTE/IA, banner "Ir a Bandeja").
- Pipeline header: resumen "$X abiertos · $Y ganados · arrastrá las tarjetas para cambiar de etapa" + CTA "+ Nuevo deal".
- Colores de etapa del mock: Lead (gris), Calificado (azul), Trial/Propuesta (amarillo/ámbar), Pago (verde).
- Timeline: input "Agregar una nota al historial…" + botón "+ Nota"; entradas con icono por tipo, título, badge de actor, descripción y timestamp relativo (Hoy · HH:MM / Ayer · HH:MM).
</specifics>

<deferred>
## Deferred Ideas

- **Bandeja / comms (WhatsApp + mail two-way)** → Phase 6 (COMMS-01..03). El timeline ya deja el lugar (rama del UNION + filtros Mensajes/Llamadas con empty state).
- **Reportes/gráficos** (revenue por mes, MRR, conversión por etapa, ranking) → Phase 5 (RPT-01/02), apoyados en el estado `won/lost` y la etapa del deal que esta fase persiste.
- **Pantallas de multi-deal por lead** (asignar/listar varios deals de un mismo contacto) → futuro; el schema 1:N ya lo soporta, la UI no se construye ahora.
- **Tareas avanzadas** (asignación, recordatorios, recurrencia) → fuera de scope (operador único).
- **Cobro automático de add-ons** y **canal externo de alertas** → v2 (ya en REQUIREMENTS.md v2).

</deferred>

---

*Phase: 04-pipeline-tags-timeline*
*Context gathered: 2026-06-20*
