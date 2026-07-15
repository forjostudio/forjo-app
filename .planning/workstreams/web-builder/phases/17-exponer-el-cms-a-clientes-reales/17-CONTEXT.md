# Phase 17: Exponer el CMS a clientes reales - Context

**Gathered:** 2026-07-15
**Status:** Ready for planning

<domain>
## Phase Boundary

Retirar el flag global `CMS_ENABLED` dejando `has_web_custom` (el add-on pago, ya existente) como **único** gate del editor CMS, y darle al dueño una entrada real al editor desde el panel. Fase security-sensitive: se quita un kill-switch fail-closed y el gate único tiene que sostenerse solo.

Requisito: **PUB-01** (único requisito de la fase).

**En scope:** sacar `CMS_ENABLED` de todas las superficies; agregar la entrada al editor en el sidebar; definir qué ve un dueño sin el add-on; verificar que el gate `has_web_custom` sostiene solo (cada acción, por sesión, + trigger).

**Fuera de scope:** cambios al editor en sí (Phase 14), al flujo publish/draft (Phase 15), a la skill del operador (Phase 16). No se agregan capacidades nuevas al CMS.
</domain>

<decisions>
## Implementation Decisions

### Entrada al editor en el panel
- **D-01:** El editor gana un **ítem propio top-level en el sidebar**, rotulado **"Mi web"**, al nivel de Turnos/Agenda/Negocio. Se muestra a **TODOS** los negocios (no solo a los que tienen el add-on) — el CMS es feature estrella + superficie de venta del add-on pago. Se agrega al mapa `NAV_ITEMS` de `components/dashboard/sidebar.tsx`.

### Qué ve un dueño SIN el add-on (estrategia: upsell visible — el CMS vende el add-on)
- **D-02:** Un negocio **sin** `has_web_custom` que entra a `/web` (por el ítem de nav o por URL directa) ve una **pantalla de upsell** ("Web a medida") — NO un `notFound()` 404. La pantalla tiene un CTA **"Activar"** que apunta a **`UPGRADE_URL`** (`https://forjo.studio/#servicios`), reusando el patrón de monetización que ya usan el plan-banner y settings ("Ver planes →"). Cero constante nueva.
- **D-02b:** Un negocio **con** `has_web_custom` ve el editor, igual que hoy.
- **D-02c:** Esto **reemplaza** el `notFound()` de `app/(dashboard)/web/page.tsx` por un render condicional: entitled → editor, no-entitled → upsell. El gate de escritura (las 3 Server Actions) NO se relaja — sigue devolviendo `not_entitled` (defensa en profundidad). La pantalla de upsell es solo UX de la superficie de lectura.

### Apagador de emergencia post-flag
- **D-03:** La **única** palanca de emergencia es el **toggle per-negocio `has_web_custom` del admin CRM** (`/admin/negocios/[id]`, ya existente, con service-role que bypassa el trigger). Ante un incidente se apaga el/los negocios afectados. Cumple PUB-01 (sin flag global) y no agrega código. NO se agrega toggle masivo ni se conserva ninguna env var de apagado.

### Limpieza del flag (barrido — threat note)
- **D-04:** Remover `CMS_ENABLED` de **todas** las superficies: la const + el `notFound()` en `page.tsx`, las 3 const + los 3 chequeos en `_landing-actions.ts` (`saveLandingDraft`, `publishLanding`, `discardLandingDraft`), y de `.env.local` / `.env*` / Vercel / docs. El código de error `cms_disabled` y su copy ("El editor no está disponible en este momento.") quedan **muertos** al sacar el flag → removerlos también. **Regla dura (threat note):** ninguna ruta puede quedar con un chequeo muerto que la deje abierta.

### Claude's Discretion
- Ícono del ítem "Mi web" en el sidebar (Globe/Layout/PenSquare/etc. de lucide) — a criterio, coherente con el set existente.
- Diseño exacto de la pantalla de upsell (dentro del brand Bauhaus dark, tokens del design system). Debe cumplir el checklist de UI (1 CTA claro, contraste WCAG AA, mobile 375px).
- Label final si "Mi web" no calza bien con la terminología por vertical.
</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Requisito y goal de la fase
- `.planning/workstreams/web-builder/REQUIREMENTS.md` — **PUB-01**: `has_web_custom` como único gate, sin `CMS_ENABLED`. Incluye el modelo `landing_config`=publicado / `landing_draft`=borrador.
- `.planning/workstreams/web-builder/ROADMAP.md` §Phase 17 — goal + **Threat note** (SECURITY-SENSITIVE): las 3 condiciones que el gate único debe sostener (cada Server Action, por sesión, + trigger) y el barrido del flag.

### Seguridad heredada (verificar, no asumir)
- `.planning/workstreams/web-builder/phases/14-cms-editor-ui/14-SECURITY.md` — aislamiento SECURED 16/16 de Phase 14: uploads a `landing-assets/{business_id}/` + preview. Vuelven al radar porque el editor pasa de inalcanzable a superficie autenticada real.

### Código a tocar / reusar
- `app/(dashboard)/web/page.tsx` — doble gate actual (`CMS_ENABLED` + `has_web_custom`); acá se reemplaza el `notFound()` por el render condicional upsell.
- `app/(dashboard)/web/_landing-actions.ts` — las 3 Server Actions ya con gate `has_web_custom` por sesión (líneas 104/164/230); acá se quitan los 3 chequeos `CMS_ENABLED` (75/141/209).
- `app/(dashboard)/web/web-client.tsx` — `ACTION_ERROR_COPY`: quitar `cms_disabled`; el copy `not_entitled` ya existe.
- `components/dashboard/sidebar.tsx` §`NAV_ITEMS` (líneas 57-67) — donde se agrega el ítem "Mi web".
- `lib/plans.ts` §`UPGRADE_URL` (línea 33) — CTA de monetización reutilizable para el upsell.
- `app/(crm)/admin/negocios/[id]/` — el toggle admin de `has_web_custom` (palanca de emergencia D-03) + `_actions.ts` (set con service-role que bypassa el trigger).
</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- **`UPGRADE_URL`** (`lib/plans.ts:33` = `https://forjo.studio/#servicios`): destino del CTA "Activar" del upsell (D-02). Ya lo usan plan-banner y settings.
- **`NAV_ITEMS`** (`components/dashboard/sidebar.tsx:57-67`): patrón `{ href, label, icon }` a extender con el ítem "web".
- **Gate `has_web_custom` por sesión**: ya implementado idéntico en las 3 Server Actions (select `id, has_web_custom` del business de la sesión → `not_entitled` si falta). El gate correcto ya existe; la fase solo saca el flag de encima.
- **Copy `not_entitled`** ("Tu plan no incluye la edición de la web. Escribinos para activarla.") ya existe en `ACTION_ERROR_COPY`.

### Established Patterns
- Server Actions owner-only resueltas contra el `business_id` de la **sesión** (nunca del body) — patrón D-16 de Phase 15.
- Trigger `businesses_protect_admin_columns`: revierte en silencio los UPDATE no-service_role sobre columnas admin (incl. `has_web_custom`), impidiendo que el dueño se auto-otorgue el add-on.
- `page.tsx` como Server Component fail-closed que resuelve el business de la sesión antes de renderizar.

### Integration Points
- `components/dashboard/sidebar.tsx` — nuevo `NavItem` "web" (visible para todos).
- `app/(dashboard)/web/page.tsx` — `notFound()` → render condicional (editor vs upsell) según `has_web_custom`.
- `app/(dashboard)/web/_landing-actions.ts` + `web-client.tsx` — remoción de `CMS_ENABLED` y del código de error `cms_disabled`.
</code_context>

<specifics>
## Specific Ideas

- **Estrategia elegida explícitamente: "upsell visible"** — el editor no-entitled NO es un 404 invisible; es una superficie de venta del add-on pago. Es una decisión de monetización, no solo de UX.
- El ítem "Mi web" es distinto de "Ver mi página" (que ya existe y apunta al público `/[slug]`). El nuevo va al **editor** `/web`.

## MANDATORY — Ítems para el researcher/planner (verificar, no asumir)

1. **Localizar el path de UPLOAD de imágenes del editor.** El threat note lista `upload` como 4ª superficie del CMS, pero **no hay acción de upload en `_landing-actions.ts`** (solo save/publish/discard). Hay que encontrar por dónde sube imágenes el editor UI de Phase 14 (¿otra Server Action? ¿route handler? ¿upload directo a Storage desde el client con signed URL?) y confirmar que **también gatea `has_web_custom` por sesión**. Sin esto, SC2 ("no logra escribir su landing aunque postee directo") queda incompleto.
2. **Verificar el trigger `businesses_protect_admin_columns`** en vivo: que efectivamente revierta un UPDATE no-service_role sobre `has_web_custom`. No asumirlo — el threat note lo pide explícito.
3. **Barrido exhaustivo de `CMS_ENABLED`**: grep del repo entero (incl. `proxy.ts`, `.env*`, `vercel.json`, docs) para que ninguna ruta quede con un chequeo muerto que la deje abierta.
</specifics>

<deferred>
## Deferred Ideas

- **Toggle masivo de `has_web_custom` en el admin** (apagar el CMS de todos los negocios de una): descartado como palanca de emergencia (D-03). Si algún día hace falta un off-switch global de verdad, es su propia fase (acción destructiva que requiere recordar el estado previo para revertir).

</deferred>

---

*Phase: 17-exponer-el-cms-a-clientes-reales*
*Context gathered: 2026-07-15*
