# Phase 7: Onboarding wizard — robustez + pulido - Context

**Gathered:** 2026-07-17
**Status:** Ready for planning

<domain>
## Phase Boundary

Endurecer y simplificar el wizard de alta (`app/(onboarding)/onboarding/page.tsx`), que quedó con dos bugs destapados por los UAT de v0.19 y pide pulido de UX. Todo cae sobre la misma superficie (el wizard de 4 pasos: Negocio → Servicios → Profesionales → Horarios) — se toca una sola vez.

Cuatro cambios: (ONB-01) chequeo de slug que vea el espacio global, (ONB-02) una salida del wizard, (ONB-03) logo del negocio en el paso 1, (ONB-04) sacar el selector de paleta del wizard.

**Fuera de scope:** rediseñar el flujo o los pasos del wizard, eliminar la paleta como feature (queda en Ajustes), y el theming de las pantallas de auth (eso es Phase 8 / ONB-05).

</domain>

<decisions>
## Implementation Decisions

### ONB-01 — Chequeo de slug global (el bug)
- **D-01:** El chequeo de disponibilidad va por un **endpoint service-role** (route handler bajo `app/api/`), mismo patrón que `booking/availability` — NO una RPC `security definer` (evita migración numerada + deploy coordinado). El chequeo actual (`onboarding/page.tsx` L113-123) corre con el cliente autenticado bajo RLS (`businesses` solo tiene policy `owner access`), así que no ve slugs ajenos → dice "disponible" y falla recién en el insert.
- **D-02 (invariante de seguridad):** el endpoint expone **SOLO existencia** — un booleano `{ available: boolean }`, cero datos del negocio dueño. El service-role bypassa RLS, así que el handler tiene que devolver únicamente el booleano y nada más (ni id, ni owner, ni nombre). Es multi-tenant: un leak acá expone qué negocios existen por nombre.
- **D-03 (UX):** feedback **temprano** al escribir el nombre (debounce, como el checkSlug de hoy) + un mensaje claro "ese nombre ya está en uso" si está tomado — nunca el "Error al crear el negocio" opaco al final. El insert mantiene su guardia (constraint `businesses_slug_key`) como red de seguridad ante la carrera.

### ONB-02 — Salida del wizard (el otro bug)
- **D-04:** Un usuario autenticado **sin negocio** puede salir del onboarding: un botón claro de **cerrar sesión** (signOut → `/login`), para el caso de haber entrado con la cuenta equivocada (surgió con Google en el UAT de Phase 5). No lo obliga a crear el negocio para escapar.

### ONB-03 — Logo en el paso 1
- **D-05:** El logo se **elige y previsualiza en el paso 1** (Negocio), pero el archivo se **sube recién al finalizar** el wizard, cuando el negocio ya se creó. Razón: la RLS de INSERT del bucket exige que el negocio exista y sea del owner — en el paso 1 todavía no existe. Subir al finalizar sidestepea eso, evita huérfanos si abandona, y el usuario no lo nota. **CORREGIDO por el research:** el logo va al bucket **`logos`** (el mismo que usa Ajustes → `settings-client.tsx:321-337`) y se persiste en `businesses.logo_url` (columna que YA existe, baseline.sql:166) — **NO** `editor-upload`/`landing-assets` (eso es el CMS del landing, gateado por `has_web_custom` que un negocio nuevo no tiene). **ONB-03 no requiere migración → Phase 7 es 100% autónoma, sin checkpoint humano.**

### ONB-04 — Sacar la paleta del wizard
- **D-06:** Se **quita el selector de paleta del paso 1** (el estado `palette`, `selectPalette`, el `data-palette` que aplica en vivo, y el bloque de swatches). El negocio nuevo se crea con la **paleta default** (`'red'` / el default actual). La paleta **sigue configurable en Ajustes** (`app/(dashboard)/settings/settings-client.tsx` ya la tiene) — NO se elimina la feature ni la columna `businesses.palette`.

### Claude's Discretion
- Detalle visual del input de logo (dropzone vs botón) y del botón de salida: seguir el design system existente y el patrón de `editor-upload`.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### La superficie que se toca
- `app/(onboarding)/onboarding/page.tsx` — el wizard. `checkSlug` L113-123 (el bug ONB-01); el estado/UI de paleta (`palette`, `selectPalette` ~L96-101, `PALETTES` L22-30, el bloque de swatches en el render del paso 1 — ONB-04); el insert del negocio (~L288-304, donde `palette` y el logo se persisten al finalizar — ONB-03).

### Patrones a reusar
- El endpoint público/service-role de disponibilidad: **`app/api/booking/availability/route.ts`** (patrón de route handler que resuelve por slug con service-role, sin filtrar datos de más) — el análogo para ONB-01. Ver también `lib/supabase/admin.ts` (`createAdminClient`, service-role, server-only).
- `lib/landing/editor-upload.ts` — el patrón de upload de imágenes al bucket de storage (ONB-03).
- `app/(dashboard)/settings/settings-client.tsx` — donde la paleta sigue viviendo tras ONB-04 (confirmar que el selector de Ajustes ya existe y alcanza).

### RLS / storage (ONB-03)
- La migración del bucket `landing-assets` (migr. 030) — la policy de INSERT que exige que el negocio exista/sea del owner. Es la razón de D-05 (subir al finalizar). El research confirma el nombre exacto del bucket y la forma de la policy.

### Requirements + seguridad
- `.planning/workstreams/onboarding/REQUIREMENTS.md` — ONB-01/02/03/04.
- `.claude/skills/supabase-multitenant-rls/SKILL.md` — el aislamiento por tenant; el endpoint de ONB-01 usa service-role, que bypassa RLS → el handler garantiza el aislamiento a mano (solo devuelve el booleano).

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- **Patrón service-role por slug (booking/availability):** el molde exacto para el endpoint de ONB-01 — service-role, resuelve por slug, devuelve lo mínimo.
- **`editor-upload.ts`:** upload de imágenes ya resuelto (bucket, path, validación) — ONB-03 lo reusa.
- **El selector de paleta de Ajustes:** ya existe, así que ONB-04 solo **borra** del wizard, no construye nada nuevo.

### Established Patterns
- **Anti-tampering / aislamiento en route handlers:** los endpoints service-role del repo validan y devuelven lo mínimo (booking). ONB-01 sigue eso — devolver `{ available }` y nada más.
- **checkSlug con debounce** ya existe en el wizard; se reapunta al endpoint nuevo, se conserva la UX (feedback al escribir).

### Integration Points
- `onboarding/page.tsx` → nuevo endpoint `GET /api/.../slug-available?slug=...` (o similar) para ONB-01.
- `onboarding/page.tsx` finish → `editor-upload` con el `business.id` recién creado para el logo (ONB-03).

</code_context>

<specifics>
## Specific Ideas

- El research DEBE confirmar (no asumir): la firma exacta de `lib/landing/editor-upload.ts` (qué recibe, a qué bucket/path sube, si necesita el `business.id`), la forma de la policy RLS del bucket `landing-assets` (migr. 030) para confirmar que el negocio debe existir, y el shape del handler de `booking/availability` para copiar el patrón service-role.
- ONB-01 lleva **threat model + `/gsd:secure-phase`** (multi-tenant, service-role): la amenaza es la enumeración de negocios por nombre / fuga de datos del owner ajeno vía el endpoint. La invariante D-02 (solo booleano) es la mitigación.

</specifics>

<deferred>
## Deferred Ideas

None — la discusión se mantuvo en scope. El theming de auth (ONB-05) es Phase 8, a propósito.

</deferred>

---

*Phase: 07-onboarding-wizard-robustez-y-pulido*
*Context gathered: 2026-07-17*
