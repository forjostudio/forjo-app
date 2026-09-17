---
status: diagnosed
trigger: "G-23-6b (tarjeta-panel-sin-descripcion-ni-link-editar): la tarjeta del servicio en el panel (/servicios) no muestra la descripción corta y la única forma de editar es el ícono del lápiz"
created: 2026-09-17T14:00:00Z
updated: 2026-09-17T14:20:00Z
goal: find_root_cause_only
---

## Current Focus

hypothesis: CONFIRMADA — la tarjeta de la lista de servicios nunca renderiza `s.description` ni tiene una affordance de texto para editar; es una omisión de alcance del contrato de la fase 23 (CONTEXT D-06 + CAT-11 y UI-SPEC acotaron el cambio al formulario), no una regresión
bug_class: Bohrbug (determinístico; en la práctica es un gap de UX, no un defecto de código)
next_action: devolver ROOT CAUSE FOUND al orquestador (modo find_root_cause_only)
reasoning_checkpoint:
  hypothesis: "La tarjeta no muestra la descripción porque el JSX de la tarjeta (settings-client.tsx:2692-2865) no tiene ningún nodo que lea s.description, y no hay link 'Editar' porque el único disparador de openEditService(s) en la tarjeta es el botón del lápiz (:2858). Nadie lo pidió: el contrato de la fase declaró la lista 'NO se toca'"
  confirming_evidence:
    - "Grep de `description` en settings-client.tsx: sólo aparece en el estado/submit del alta (:1174, :1415, :1421), en la edición (:1481, :1513, :1549) y en los Textarea (:2925-2930, :3028-3033). Cero lecturas dentro de la tarjeta (:2692-2865)"
    - "El dato SÍ está en el scope: `s: Service` con `description: string | null` (lib/types.ts:245), cargado con select('*') en app/(dashboard)/servicios/page.tsx:29 y refrescado en memoria tras editar (`{ ...s, ...payload }`, :1574, payload incluye description normalizada :1549)"
    - "23-CONTEXT.md:72 (D-06): 'La lista de servicios de abajo NO se toca'; 23-CONTEXT.md:159-160: 'Esta fase agrega sólo el campo del panel'; 23-UI-SPEC.md:30 alcance Bloque C = sólo campos del form"
  falsification_test: "Si existiera en la tarjeta algún nodo que lea s.description, o un segundo disparador de openEditService, la hipótesis sería falsa — no existe ninguno"
  fix_rationale: "Es una ampliación de alcance acotada: agregar un hijo de contenido a la tarjeta que lea s.description (1 línea) + un botón con estilo de link que llame openEditService(s). No hace falta tocar data, tipos ni queries"
  blind_spots: "No se midió a 375px cuánto texto entra en una línea con el link al lado; no se decidió qué mostrar cuando no hay descripción (decisión de producto); no se verificó la interacción táctil del link nuevo contra la invariante G-04 en un dispositivo real"
  candidate_causes:
    - "spec/config: el contrato de la fase (D-06, CAT-11 discretion, UI-SPEC Bloque C) excluyó explícitamente la tarjeta de la lista"
    - "code: el JSX de la tarjeta no tiene nodo de descripción ni segundo disparador de edición"
    - "data: descartado — la descripción llega completa al cliente y se refresca tras guardar"
  and_gate: "no — una sola causa (omisión de alcance que se materializa en el JSX); el dato ya está disponible"

## Symptoms

expected: En la lista de servicios del panel (/servicios), cada tarjeta muestra al menos una línea de la descripción corta y un link subrayado "Editar" que abre el mismo diálogo de edición que abre el lápiz.
actual: La tarjeta muestra título ("SAFSF"), "30min · $0", chips "Se ofrece en: Todos / Sede Central" y a la derecha "Desactivar", lápiz y tacho. Sin línea de descripción.
errors: ninguno
reproduction: Test 6 de la UAT (.planning/workstreams/motor-reservas/phases/23-el-panel-que-organiza-el-cat-logo/23-UAT.md)
started: descubierto en la UAT de la phase 23 (2026-09-17). Mejora de UX, no regresión: el campo "Descripción corta" se agregó en 23-02 y a la tarjeta nunca se le pidió renderizarlo.

## Eliminated

- hypothesis: la descripción no llega al cliente (query o tipo sin la columna)
  evidence: servicios/page.tsx:29 usa select('*'); Service.description existe (lib/types.ts:245); saveEditService mergea el payload con description en el estado local (:1549, :1574)
  timestamp: 2026-09-17T14:10:00Z

## Evidence

- timestamp: 2026-09-17T14:00:00Z
  checked: base de conocimiento (.planning/debug/knowledge-base.md)
  found: no existe; sesión hermana abierta G-23-6 (descripcion-120-no-entra-tarjeta-publica.md, diagnosed)
  implication: sin patrón conocido; hay que coordinar con G-23-6

- timestamp: 2026-09-17T14:05:00Z
  checked: app/(dashboard)/settings/settings-client.tsx:2671-2865 (tarjeta de la lista de servicios)
  found: |
    Contenedor :2692 `p-3 rounded-lg bg-secondary/50 flex flex-col gap-2 sm:grid sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center`.
    Hijos: nombre :2723-2732 (`text-sm font-medium break-words sm:truncate`) · línea de datos :2753-2768 · control de cupo :2769-2780 · "Se ofrece en:" :2781-2789 · cobertura :2793-2806 · acciones :2843-2864 (`sm:col-start-2 sm:row-start-1`, en mobile al final con `pt-4 border-t`).
    Lápiz :2858 `onClick={() => openEditService(s)}` con `h-11 w-11 sm:h-8 sm:w-8` y `aria-label={`Editar ${s.name}`}`.
    Ningún nodo lee `s.description`.
  implication: la ausencia es literal en el JSX

- timestamp: 2026-09-17T14:08:00Z
  checked: openEditService (settings-client.tsx:1495-1515) y saveEditService (:1516-1577)
  found: openEditService(s) hace setEditSvc(s) + setEditSvcForm({... description: s.description ?? ''}); el Dialog de edición se abre por editSvc != null. Tras guardar, setServices mergea el payload (description ya trim()/null)
  implication: el link nuevo sólo tiene que llamar openEditService(s); la línea de descripción se actualiza sola al guardar

- timestamp: 2026-09-17T14:12:00Z
  checked: contrato de la fase (23-CONTEXT.md:70-80, :148-160, :197-201; 23-UI-SPEC.md:30, :36, :116, :135-137, :568, :758-759, :779)
  found: |
    D-06: "La lista de servicios de abajo NO se toca". CAT-11: "Esta fase agrega sólo el campo del panel". CONTEXT :200-201: la tarjeta tiene grilla documentada línea por línea, "no se refactoriza de paso".
    Tokens para código nuevo: soporte = `text-xs` 12px/16px `text-muted-foreground` (≥4.99:1); PROHIBIDO `text-[11px]`, `font-semibold`, valores fuera de la grilla de 4.
    Piso táctil 44×44 en todo interactivo nuevo; foco `focus-visible:ring-2 focus-visible:ring-ring`.
    Ayuda del campo (:568): "Aparece debajo del nombre en tu página de reservas. Se ven 2 líneas."
  implication: el gap es de alcance del contrato; cualquier fix tiene que respetar estos tokens y la estructura documentada de la tarjeta

- timestamp: 2026-09-17T14:15:00Z
  checked: invariantes documentadas en la tarjeta y convenciones de link del panel
  found: |
    (a) :2711-2716 — todo hijo de contenido NUEVO debe declarar `sm:col-start-1` o en desktop la grilla lo manda a la columna de acciones.
    (b) :2745-2752 y :2813-2827 (G-04) — texto inerte y control interactivo no pueden ser vecinos pegados en mobile: la corrección de toque del navegador desvía el dedo. Un link "Editar" pegado a la línea de datos o a los chips reabre esa clase de defecto.
    (c) Links subrayados del panel: `className="underline underline-offset-2"` (settings-client.tsx:504, :2802; agenda-client.tsx:1233) — todos son `<Link>` de navegación; no hay precedente de "botón con estilo de link" en la tarjeta.
    (d) No hay `line-clamp-1` en el panel; el nombre usa `break-words sm:truncate`.
  implication: el link debe ser `<button type="button">` (abre un diálogo, no navega) con la clase de link existente y área táctil de 44px en mobile; la línea nueva lleva `sm:col-start-1`

- timestamp: 2026-09-17T14:18:00Z
  checked: interacción con G-23-6 (.planning/debug/descripcion-120-no-entra-tarjeta-publica.md)
  found: la tarjeta pública corta 120 caracteres (entran 59-84 en 2 líneas a 375px); el fix de G-23-6 puede bajar el tope o cambiar el layout/clamp. Sesión secundaria: sin `break-words` una palabra sin espacios se recorta en 1 línea sin "…"
  implication: la línea del panel es un recordatorio (1 línea truncada), no una vista previa fiel de la tarjeta pública; debe llevar `break-words`/`truncate` para no repetir el defecto secundario, y los dos gaps conviene planearlos juntos para que la ayuda "Se ven 2 líneas" siga siendo cierta

## Resolution

root_cause: |
  Omisión de alcance, no regresión. El contrato de la phase 23 limitó CAT-11 al formulario (23-CONTEXT.md:72 D-06 "La lista de servicios de abajo NO se toca"; :159-160 "sólo el campo del panel"; 23-UI-SPEC.md:30), así que la tarjeta de la lista (app/(dashboard)/settings/settings-client.tsx:2692-2865) nunca recibió un nodo que lea `s.description`, y su único disparador de edición es el botón de ícono del lápiz (:2858, `onClick={() => openEditService(s)}`). El dato ya está en el scope (`Service.description`, lib/types.ts:245; select('*') en servicios/page.tsx:29; refresco local en :1574).
fix: (modo diagnóstico — no se aplica)
verification: lectura del JSX completo de la tarjeta + grep de `description` en el archivo + contrato CONTEXT/UI-SPEC
files_changed: []
