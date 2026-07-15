# Requirements: Forjo App — CMS Publish / Go-live (v0.18)

**Defined:** 2026-07-12
**Core Value:** Un negocio NUNCA puede leer ni modificar datos de otro, y los flujos de pago no pueden ser forzados ni falsificados. (v0.18 separa borrador de publicado SIN debilitar el write path owner-only que aseguró v0.16.)

> Continúa el workstream `web-builder` desde **Phase 15**. v0.16 (Phases 11-14) archivado en `.planning/milestones/v0.16-*`; v0.17 fue polish reactivo sin fases GSD (ver MILESTONES.md).
> **PUB-01 y PUB-02 ya existían como requisitos DIFERIDOS de v0.16** ("exponer el CMS" y "flujo publish/go-live"). Este milestone los salda: PUB-01 se toma tal cual, y PUB-02 —que era un paraguas, no un requisito atómico— se **descompone** en PUB-03..PUB-08. Los REQ-IDs continúan la numeración de las categorías existentes (PUB, SKILL).

## El modelo (contexto para leer los requisitos)

`landing_config` pasa a significar **LO PUBLICADO**. `landing_draft` es **lo que se está editando**. La página pública lee SOLO lo publicado. Publicar copia el borrador encima.

Dos consecuencias que **eliminan estado** en vez de agregarlo:

- **El go-live no necesita columna nueva.** Un negocio que nunca publicó tiene `landing_config` en NULL, y `/[slug]` ya sabe qué hacer con eso: renderiza la página de reservas de siempre (camino legacy que YA existe y está probado). Publicar por primera vez *es* salir al aire. No hay un flag `web_live` que pueda desincronizarse del contenido.
- **La migración es aditiva.** `landing_draft` nace copiando `landing_config`: nadie se cae del aire, y el dueño abre el editor y ve exactamente lo que está publicado.

## v1 Requirements

Actores: **dueño** (negocio que gestiona su web desde el panel), **visitante** (usuario anónimo de `/[slug]`), **operador** (Forjo Studio corriendo la skill).

### Borrador y publicación (PUB)

- [x] **PUB-03**: La página pública muestra SOLO lo publicado — el dueño guarda un cambio en el editor y la web al aire NO cambia hasta que publica.
- [x] **PUB-04**: El dueño puede publicar su borrador desde el editor y ver el cambio reflejado en su web pública.
- [x] **PUB-05**: El editor le muestra al dueño si tiene cambios sin publicar — distingue "guardado" de "publicado". (Hoy son la misma cosa y el copy dice "Todo guardado", que pasaría a ser engañoso.)
- [x] **PUB-06**: El dueño puede descartar su borrador y volver a lo que está publicado.
- [x] **PUB-07**: Go-live — un negocio que nunca publicó sigue viendo su página de reservas de siempre; al publicar por primera vez, su web a medida la reemplaza.
- [x] **PUB-08**: Las landings que YA están al aire siguen exactamente igual después de la migración, y su borrador arranca como copia fiel de lo publicado (cero regresión).

### Exposición del CMS (PUB — diferido de v0.16)

- [x] **PUB-01**: El CMS se expone a los clientes en el dashboard, con `has_web_custom` (el add-on real) como ÚNICO gate — sin el flag global `CMS_ENABLED`.

### Skill del operador (SKILL)

- [x] **SKILL-07**: `scripts/setup-landing.ts` escribe el BORRADOR, no lo publicado: la web armada por la skill NO sale al público hasta que el dueño la mira y publica.
- [x] **SKILL-08**: El operador puede inspeccionar borrador y publicado por separado (`--inspect`), para saber qué está al aire y qué quedó pendiente de publicar.

## Future Requirements (diferidos)

| Requisito | Por qué se difiere |
|-----------|--------------------|
| Auto-armado de la web al confirmarse el pago del add-on en MercadoPago | Es el norte del web-builder y merece milestone propio. Este milestone es su **prerequisito**: sin borrador, una web autogenerada saldría cruda al público. Ver memoria `web-builder-automation-northstar`. |
| Video de fondo en el hero | BLOQUEADO por infra: el bucket `landing-assets` solo acepta imágenes ≤2 MB y su config vive en el dashboard de Supabase (no en migraciones). Requiere una acción manual del usuario antes de codear. |
| Toggle "foto ancha" en la galería del editor | El CSS (`.wide` + `grid-auto-flow: dense`) ya está listo, pero el flag NO existe en el schema (hoy el ancho se decide por un ritmo hardcodeado, `i % 4 === 2`). Es un cambio de contrato de datos, no una casilla. |
| Confirm-on-exit por navegación interna | Hoy solo dispara el `beforeunload` nativo; interceptar la nav del App Router de Next 16 es no-trivial. El `<Dialog>` existe pero es código muerto. |

## Out of Scope

| Feature | Reason |
|---------|--------|
| Columna `web_live` / interruptor explícito de web on-off | El go-live implícito (publicar por primera vez = salir al aire) logra lo mismo con MENOS estado. Un flag separado del contenido es una cosa más que puede desincronizarse. Si algún día hace falta "bajar la web sin borrarla", se agrega entonces. |
| Historial de versiones / rollback a una publicación anterior | El borrador cubre el grueso del valor (no publicar sin querer). Versionado completo es otro producto. |
| Preview compartible por link (para mostrarle la web a un tercero antes de publicar) | Útil, pero no bloquea nada y agrega superficie pública nueva. El preview vivo del editor ya cubre al dueño. |
| Rediseño full-bleed del template (Meitre) | Pasada de estilo design-first aparte; no estructural. |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| PUB-03 | Phase 15 — Borrador y publicación (núcleo) | Complete |
| PUB-04 | Phase 15 — Borrador y publicación (núcleo) | Complete |
| PUB-05 | Phase 15 — Borrador y publicación (núcleo) | Complete |
| PUB-06 | Phase 15 — Borrador y publicación (núcleo) | Complete |
| PUB-07 | Phase 15 — Borrador y publicación (núcleo) | Complete |
| PUB-08 | Phase 15 — Borrador y publicación (núcleo) | Complete |
| SKILL-07 | Phase 16 — La web nace como borrador (skill del operador) | Complete |
| SKILL-08 | Phase 16 — La web nace como borrador (skill del operador) | Complete |
| PUB-01 | Phase 17 — Exponer el CMS a clientes reales | Complete |

**Cobertura: 9/9 — sin huérfanos, sin duplicados.**

Orden LOCKED: **15 → 16 → 17**. PUB-01 (exponer el CMS) va ÚLTIMO a propósito: abrir el editor a clientes reales mientras cada guardado todavía sale al aire sería exactamente el error que este milestone viene a evitar.
