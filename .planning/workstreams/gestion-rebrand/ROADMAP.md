# Roadmap: v0.15 Gestión rebrand

**Workstream:** gestion-rebrand
**Branch:** `gsd/gestion-rebrand` (desde main, con v0.14 shipeado)
**Granularity:** coarse (3 fases)

## Overview

Reorganización de la arquitectura de información de la app Gestión (sidebar agrupado +
split Negocio-hub / Configuración) más features CRUD acotadas, sobre la app que **ya existe
y funciona**. El milestone es **behavior-frozen**: la reorg mueve funcionalidad de lugar
(componentes/rutas) sin cambiarla, con el diseño ya aprobado como insumo. El riesgo dominante
es la **regresión** (romper el comportamiento o las rutas existentes), no el aislamiento —
con una sola excepción: el **import de clientes por CSV** (DATA-03) es el único con backend
delicado real (parseo, validación, deduplicación, aislamiento por tenant), por eso vive en su
propia fase.

El recorrido va: (1) reorganizar el chasis de navegación sin cambiar comportamiento + sumar
la ayuda estática → (2) sumar las features CRUD de bajo riesgo (alta manual de cliente con
badge de origen + exports CSV), introduciendo de paso la columna de origen que después consume
el import → (3) el import de clientes por CSV, el único flujo con backend delicado, aislado y
verificable por separado.

## Phases

- [ ] **Phase 1: Reorg de IA + Ayuda** - Sidebar agrupado + split Negocio-hub/Configuración con redirects, más la FAQ estática — todo behavior-frozen
- [ ] **Phase 2: Alta manual + Exports CSV** - Alta manual de cliente con badge de origen (columna nueva) + export de clientes y finanzas a CSV
- [ ] **Phase 3: Import de clientes CSV** - Upload → preview/validación → confirmar, deduplicando y respetando el aislamiento por tenant

## Phase Details

### Phase 1: Reorg de IA + Ayuda

**Goal**: Reorganizar el chasis de navegación de la app (sidebar agrupado + hub Negocio /
Configuración) sin cambiar el comportamiento de ningún flujo existente, y sumar la ayuda
estática — la reorg deja el terreno listo para colgar las features de las fases siguientes.
**Depends on**: Nothing (first phase)
**Requirements**: NAV-01, NAV-02, HELP-01
**Success Criteria** (what must be TRUE):

  1. El sidebar muestra los items agrupados en secciones (PANEL · AGENDA · GESTIÓN · REPORTES · AJUSTES) y cada item sigue llevando exactamente adonde llevaba antes (mismo destino, mismo comportamiento).
  2. "Negocio" es un hub con tabs (Datos del negocio · Cobros · Integraciones · Notificaciones/Mails) y "Configuración" agrupa lo de app/cuenta (Apariencia · Seguridad · Suscripción); cada tab muestra la misma funcionalidad que antes, solo reubicada.
  3. Entrar a cualquier ruta vieja (la ubicación previa de una sección movida) redirige a su nueva ubicación sin error 404 ni pérdida de estado del flujo.
  4. El menú y la terminología por vertical (incluido `canchas`, que oculta Profesionales) se mantienen correctos tras la reorg — ningún grupo ni tab rompe el gating por rubro existente.
  5. El usuario abre una FAQ/ayuda estática (cómo usar Forjo Gestión) desde Configuración o el footer, sin relación con el agente.

**Plans**: 3 plans
**Wave 1**

- [ ] 01-01-PLAN.md — Sidebar agrupado en 5 secciones data-driven (NAV-01, behavior-frozen)
- [ ] 01-02-PLAN.md — Hub Negocio (4 tabs) + Configuración (3 tabs) + reubicación del OAuth de MercadoPago (NAV-02, D-06)

**Wave 2** *(blocked on Wave 1 completion)*

- [ ] 01-03-PLAN.md — FAQ estática /ayuda + dos accesos (footer del sidebar + Configuración) (HELP-01)

**UI hint**: yes
**Phase-level decision (defer to discuss-phase)**:

  - Alcance exacto del "Mapa de cambios de dónde a dónde" del mock aprobado (`design_handoff_forjo_rebrand/`): qué items van a qué grupo y qué sub-tabs de Negocio/Configuración migran desde dónde (checklist de migración 1:1).
  - Mecanismo de redirect de rutas viejas: redirect server-side en el `page.tsx` viejo vs. regla en `proxy.ts` (Edge) vs. `redirect()` de Next — elegir el que no rompa el flujo ni el refresh de sesión.
  - Dónde vive la FAQ: ruta propia bajo Configuración vs. página estática linkeada desde el footer; contenido estático en el repo (MDX/TSX) vs. tabla — para HELP-01 estático, probablemente contenido en el repo, sin migración.
  - Confirmar que la reorg es puramente de navegación/routing y NO toca `resolveVertical`/`VERTICALS` ni el motor de agenda/booking (behavior-frozen).

### Phase 2: Alta manual + Exports CSV

**Goal**: Que el dueño pueda cargar un cliente que no vino por reserva y distinguir el origen
de cada cliente, y llevarse sus datos (clientes y finanzas) en CSV — CRUD de bajo riesgo que
además introduce la columna de origen que la Fase 3 (import) va a consumir.
**Depends on**: Phase 1
**Requirements**: CLIENT-01, DATA-01, DATA-02
**Success Criteria** (what must be TRUE):

  1. El dueño da de alta un cliente manualmente desde el panel (nombre + contacto), el cliente queda asociado a su negocio (aislamiento por tenant) y aparece en la lista de clientes al instante.
  2. Cada cliente muestra un badge de origen (Reserva · Manual · Importado); los clientes existentes que llegaron por reserva se muestran como "Reserva" y el recién creado a mano como "Manual".
  3. El dueño exporta su lista de clientes a CSV y descarga un archivo con solo los clientes de su negocio (ningún dato de otro tenant).
  4. El dueño exporta sus finanzas (movimientos/cashflow) a CSV y descarga un archivo con solo los movimientos de su negocio.

**Plans**: TBD
**UI hint**: yes
**Phase-level decision (defer to discuss-phase)**:

  - Modelo del badge de origen: columna `origin`/`source` (text con CHECK `reserva|manual|importado`) en `clients` vs. enum Postgres — migración **049** (primera libre; 045/047/048 ya tomadas, no renumerar). Definir el default para filas existentes (backfill a `reserva`) y el valor que escribe el alta manual (`manual`); dejar el valor `importado` reservado para la Fase 3.
  - Columnas exactas del CSV de clientes (nombre, contacto, ¿origen?, ¿notas?, ¿campos de vertical salud como obra social?) y de finanzas (fecha, tipo, monto, concepto, ¿fuente turno/venta/egreso?) — alinear con lo que el import de la Fase 3 espera leer de vuelta (round-trip).
  - Reuso del alta-inline de cliente que ya existe (`NuevoTurnoForm` crea cliente inline desde Turnos, v0.12) vs. un alta manual dedicada en la pantalla de Clientes — mirar el patrón existente antes de crear uno nuevo.
  - Generación del CSV: server-side (route handler autenticado que filtra por `business_id`) vs. client-side desde datos ya fetcheados; decidir manejo de encoding/escape y de acentos (UTF-8 BOM para Excel-AR).

### Phase 3: Import de clientes CSV

**Goal**: Que el dueño importe clientes desde un CSV con un flujo seguro (upload → preview/
validación → confirmar) que deduplica y respeta el aislamiento por tenant — el único flujo
con backend delicado del milestone, aislado en su propia fase.
**Depends on**: Phase 2
**Requirements**: DATA-03
**Success Criteria** (what must be TRUE):

  1. El dueño sube un CSV de clientes y ve una preview con las filas parseadas y las que tienen error de validación marcadas antes de confirmar nada (nada se escribe en la etapa de preview).
  2. Al confirmar, solo se insertan clientes válidos asociados al negocio del dueño (aislamiento por tenant: RLS + `business_id`); un CSV que intente colar un `business_id` ajeno no puede escribir en otro tenant.
  3. La importación deduplica contra los clientes ya existentes del negocio (por el criterio definido, ej. contacto), sin crear duplicados de clientes que ya estaban.
  4. Los clientes creados por import quedan con badge de origen "Importado" (consume la columna de origen de la Fase 2) y el dueño ve un resumen de cuántos se importaron / omitieron / fallaron.

**Plans**: TBD
**UI hint**: yes
**Phase-level decision (defer to discuss-phase)**:

  - Formato/columnas esperadas del CSV de import: fijar el header canónico (idealmente = el del export de clientes de la Fase 2, para round-trip), qué columnas son obligatorias, y cómo se tolera un CSV exportado desde otra herramienta (mapeo de columnas vs. header rígido).
  - Criterio de deduplicación: por teléfono/WhatsApp normalizado (wa.me), por email, o por combinación — y qué hacer con el duplicado (omitir vs. actualizar; v1 probablemente omitir).
  - Dónde vive el parseo/validación: server-side en un route handler autenticado con service-role acotado por `business_id` (patrón booking) vs. server action; librería de parseo CSV (¿zero-install / built-in vs. dependencia nueva — flag antes de agregar?).
  - Manejo de escala/robustez: límite de filas por import, tamaño de archivo, y si la preview parsea en el cliente o re-parsea en el server al confirmar (fuente de verdad = server, no confiar en la preview del cliente).
  - Research a nivel plan-phase recomendado (parseo/validación/dedup/aislamiento) antes de escribir el plan de esta fase.

## Progress

**Execution Order:**
Phases execute in numeric order: 1 → 2 → 3

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Reorg de IA + Ayuda | 0/3 | Not started | - |
| 2. Alta manual + Exports CSV | 0/TBD | Not started | - |
| 3. Import de clientes CSV | 0/TBD | Not started | - |
