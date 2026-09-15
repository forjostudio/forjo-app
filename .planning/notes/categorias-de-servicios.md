---
title: Categorías de servicios — decisiones de diseño
date: 2026-09-15
source: /gsd-explore
milestone: v0.29 (propuesto, workstream motor-reservas)
---

# Categorías de servicios + tarjetas horizontales

Decisiones cerradas en el explore del 2026-09-15. **No re-litigar en discuss-phase**: cada una tiene
su porqué escrito acá.

## Qué es y qué NO es

**Categorías = tabla propia por negocio**, para agrupar servicios en el booking público.

**NO es un paso del funnel.** Son **títulos que agrupan una sola lista**: el cliente sigue viendo
todos los servicios en una pantalla, ordenados bajo sus títulos. Se descartó el paso previo
(elegir categoría → después servicio) porque le agrega un click a **todos** los negocios, incluido
el de 3 servicios, y obligaría a que las categorías tengan imagen y descripción propias.

**NO sirve para ocultar.** Los servicios ya tienen "desactivar" en el panel; ése es el mecanismo
para sacar algo de la vista. Una categoría organiza, no esconde.

## La regla de los servicios sin categoría

Tres estados, y el tercero es el que importa:

| Estado del negocio | Qué ve el cliente |
|---|---|
| Ninguna categoría creada | Servicios **sueltos, sin títulos** — idéntico a hoy |
| Al menos una categoría, todos asignados | Sólo los títulos con sus servicios |
| Al menos una categoría, algunos sueltos | Los sueltos **al final, bajo "Otros"** |

**Un servicio sin categoría NUNCA desaparece de la página pública.** Es la misma regla del comodín
que ya usan `professional_services` (v0.25) y `time_block_services` (v0.28): la ausencia de dato
significa "vale igual", nunca "no vale". El modo de falla contrario ya mordió dos veces en este
repo — `hasScheduleCoverage` devolviendo `false` para todo y apagando el catálogo entero (CR-01 de
la Phase 20, y otra vez en la 21).

El "Otros" funciona como **recordatorio de trabajo pendiente**, no como configuración: si al dueño
no le gusta verlo, la salida es asignarles categoría, que es justo lo que queremos que haga.

**Sin toggle.** Se evaluó dejar elegir entre "Otros" y sueltos-al-final y se descartó: la diferencia
es cosmética, pero el control no (columna + migración + pantalla + label + rama en el render), y es
una preferencia que casi nadie tocaría en un panel que ya se busca simplificar.

## Orden

Dos ejes distintos, con modos distintos:

- **Categorías entre sí:** alfabético · personalizado.
- **Servicios dentro de cada categoría:** alfabético · **por precio** · personalizado.

**El modo es UNO POR NEGOCIO**, no por categoría. Por categoría es más flexible ("Cortes por precio,
Tratamientos alfabético") pero multiplica el control en cada fila y hay que explicarlo en cada una.
Si algún día se pide, se agrega **sin re-migrar**: la columna a nivel negocio ya existiría y se le
sumaría una a nivel categoría que la pise.

**El orden manual siempre está guardado.** "Personalizado" no es un modo aparte sino el estado
natural; elegir alfabético o por precio **pisa ese orden para mostrar**, no lo borra. Volver a
personalizado recupera el arreglo del dueño intacto.

⚠ **Si el modo no es personalizado, el drag y las flechas tienen que desaparecer.** Si quedan
visibles, el dueño arrastra, no pasa nada y parece roto. El modo no es sólo un comparador: prende y
apaga la interacción de reordenar.

## El patrón a portar: `forjo-tiendas`

Ya está resuelto ahí y conviene mirarlo antes de diseñar. ⚠ Es **portar el patrón, no copiar el
código**: tiendas usa columnas en español (`tienda_id`, `nombre`, `orden`) y otro esquema de RLS;
forjo-app usa snake_case en inglés (`business_id`, `name`).

**El modelo** — `supabase/migrations/20260813100000_categorias.sql`:

```sql
create table public.categorias (
  id uuid primary key default gen_random_uuid(),
  tienda_id uuid not null references public.tiendas(id) on delete cascade,
  nombre text not null,
  orden int not null default 0,
  created_at timestamptz not null default now()
);
-- mata "Remeras/remeras" EN LA BASE, no por buena voluntad de la pantalla
create unique index categorias_nombre_idx on public.categorias (tienda_id, lower(nombre));
create index categorias_orden_idx on public.categorias (tienda_id, orden);
```

**La persistencia del orden** — `app/(consola)/(panel)/categorias/Organizador.tsx:125`: se renumera
la **lista completa de hermanas** (`reordenarCategorias(ids)` recibe el array ordenado entero), nunca
swaps sueltos. Eso evita huecos y empates.

**La UI, y es lo mejor del hallazgo:** resolvieron el reordenamiento con **cero dependencias de
drag-and-drop**. Conviven dos mecanismos — `draggable` nativo de HTML5 (`onDragStart`/`onDrop`,
`:260`, `:597`) para desktop, y botones **▲/▼** con `aria-label` (`:392-414`) que funcionan en
cualquier lado. No hay que elegir entre drag y accesible: van los dos.

## Fuera de alcance

- **Subcategorías.** tiendas tiene dos niveles con triggers que impiden grupo-dentro-de-grupo y
  categoría-con-productos-y-subcategorías a la vez. Las construyeron porque Agualaboca tenía 10
  categorías y 39 productos; una peluquería con 12 servicios no las necesita. Candidatas a seed si
  algún negocio pasa de ~8 categorías.
- **Precio en la categoría.** No tiene; "por precio" ordena servicios, nunca categorías.

## Lo otro que entra en el mismo milestone

**Tarjetas horizontales en el booking.** Hoy `app/[slug]/booking-client.tsx:566` usa
`grid-cols-1 sm:grid-cols-2`: en mobile ya son horizontales full-width y en desktop se parten en dos
columnas, donde el nombre largo se corta en dos líneas. El pedido es que desktop use el mismo
formato horizontal que mobile. Estaba como ítem 1 del backlog de ideas del panel.

Va junto con las categorías porque es **la misma pantalla y el mismo trabajo**: los títulos y el
layout de las tarjetas se tocan a la vez. Separarlo sería editar `booking-client.tsx` dos veces.

## Migración

La próxima libre es la **078** (prod está en 077).
