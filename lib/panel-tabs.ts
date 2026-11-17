// ── Los grupos de tabs del panel, en la URL (Phase 4: D-05, D-06, D-07) ──────────────────────────
//
// POR QUÉ EXISTE
// Los tabs de `/negocio`, `/settings` y `/finances` vivían en `useState` y no existían para el
// navegador: el atrás se los comía. Ahora viven en la query (`?tab=`) y la pantalla DERIVA el tab de
// la URL. Este módulo es la LISTA CERRADA de cada grupo: qué slug de URL corresponde a qué valor
// interno de `TabsTrigger`, y cuál es el default (que va con la URL LIMPIA, sin `?tab=`).
//
// POR QUÉ VIVE APARTE DE `lib/panel-history.ts`
// Los grupos son CONFIGURACIÓN DE PANTALLA, no política de historial: aquel módulo "NO decide qué se
// muestra" (su encabezado) y la política —empujar, reemplazar, consumir— sigue viviendo allá, en un
// solo lugar. Acá sólo se traduce la URL a lo que se muestra y de vuelta.
//
// LAS TRES REGLAS QUE FIJA (y su suite, `test/panel-tabs.test.ts`)
//   1) D-05 — el slug es el label en español, en minúsculas y sin tildes. Los valores internos de hoy
//      (`business`, `appearance`, `appointments`, …) NO se renombran: renombrarlos sería tocar el
//      contenido de las pantallas, fuera de alcance.
//   2) D-06 — el default se representa con `slug: null`: la URL limpia. Por eso un `?tab=datos`
//      explícito resuelve igual a Datos pero con `slug: null`, y el saneo de la pantalla lo lleva a
//      la URL limpia: una sola URL canónica por tab.
//   3) D-07 — todo lo que no está en la lista del grupo (ausente, vacío, en mayúsculas, de otro grupo,
//      una clave del prototipo) cae al default SIN pantalla vacía. ⚠ POR ESO `Map` Y NUNCA UN OBJETO
//      LITERAL INDEXADO CON EL VALOR DE LA URL: `{…}['constructor']` devuelve la función heredada de
//      `Object.prototype` (truthy), el `<Tabs>` la recibe como `value` y no muestra ningún panel.
//
// QUÉ NO HACE: no toca `window` ni React, no escribe historial y no decide qué se LEE. El valor de la
// URL sólo elige cuál de las listas ya cargadas (por el negocio del dueño, en el server) se muestra.
//
// SIN DIRECTIVA DE FRONTERA DE CLIENTE A PROPÓSITO, igual que `lib/panel-history.ts`: son funciones
// puras y su suite corre en `environment: 'node'`.

// ── EL RESIDUO DE LA COMPOSICIÓN CON LOS DOS NIVELES, declarado acá (2026-11-17) ───────────────────
//
// QUÉ ES
// Con un tab arriba (`?tab=…`), el gesto de navegar lee el estado DE LA ENTRADA DEL TAB, que nace con
// `{"frjView":"tab"}` y SIN la marca de la rama (`frjUnder`): para la política de dos niveles no hay
// "Más debajo" ni "la raíz debajo", y la decisión cae en la regla de rutas. Medido en la app real en
// el plan 04-03 (`.planning/debug/tabs-en-la-url-medida.md` §(e), los seis R-C, todos como se derivó).
//
// LO QUE QUEDA DECLARADO (decisión B1 del dueño, `04-DECISION-COMPOSICION.md`): UN SOLO CASO.
//   C-5, escritorio, por el sidebar: `Inicio → Negocio → Cobros → Finanzas` deja la pila
//   `[/dashboard, /negocio, /finances]` y el atrás desde Finanzas cae en NEGOCIO en vez de Inicio. El
//   sidebar no tiene el hook de la rama; cerrarlo (B2) reabre la enmienda de MOB-07.
//   Se acepta con el criterio de la Phase 3: se declara en vez de descubrirse en la próxima UAT, y es
//   degradación segura (un escalón más, nunca el dueño fuera del sitio).
//
// LO QUE NO QUEDA: los gestos de la BARRA con un tab abierto (C-2: Inicio apila y el aviso de salida no
// se arma; C-3: Turnos deja Negocio y Más debajo; C-4: Más se apila sobre el tab) y el mismo hueco con
// la ficha `?c=` de clientes los cierra el plan 04-04 en el plan de la rama, no acá: este módulo es
// configuración de pantalla y no decide historial. C-6 (Inicio por el sidebar) es el residuo de
// escritorio ya declarado en la Phase 3.
//
// Los otros tres lugares donde está escrito, con esta fecha: el registro (§(e), «El residuo,
// declarado»), la precisión debajo de MOB-08 en REQUIREMENTS.md y su entrada en .planning/WINDOWS.md.

/** El nombre del parámetro de la query (D-05). */
export const TAB_PARAM = 'tab'

/**
 * Un grupo de tabs de UN nivel: su valor interno por defecto y la lista cerrada slug → valor interno.
 * El orden del `Map` es el orden de D-05 (el de los `TabsTrigger` en pantalla).
 */
export type PanelTabGroup = { porDefecto: string; slugs: ReadonlyMap<string, string> }

/** `/negocio` (`settings-client.tsx`, `view === 'negocio'`). */
export const TABS_NEGOCIO: PanelTabGroup = {
  porDefecto: 'business',
  slugs: new Map([
    ['datos', 'business'],
    ['cobros', 'cobros'],
    ['integraciones', 'integraciones'],
    ['notificaciones', 'notificaciones'],
  ]),
}

/** `/settings` (`settings-client.tsx`, `view === 'config'`). */
export const TABS_CONFIG: PanelTabGroup = {
  porDefecto: 'appearance',
  slugs: new Map([
    ['apariencia', 'appearance'],
    ['seguridad', 'seguridad'],
    ['suscripcion', 'suscripcion'],
  ]),
}

/** `/finances` (`finances-client.tsx`). El botón de alta sigue a este valor resuelto (D-04). */
export const TABS_FINANZAS: PanelTabGroup = {
  porDefecto: 'appointments',
  slugs: new Map([
    ['turnos', 'appointments'],
    ['ventas', 'sales'],
    ['egresos', 'expenses'],
  ]),
}

/**
 * Lo que dice la URL → el valor interno a MOSTRAR y el slug que lo representa en la URL.
 *
 * `slug: null` cuando el valor es el default (D-06), incluido el default escrito explícito
 * (`?tab=turnos` ⇒ `{ value: 'appointments', slug: null }`) y todo lo que cae al default por D-07. Es
 * lo que hace que `resolveViewParam({ param, resolvedTo: slug })` pida sanear la URL: la URL dice algo
 * y lo que se muestra se representa con nada.
 *
 * `value` es SIEMPRE un string del grupo: el `Map` no hereda nada del prototipo.
 */
export function resolveTab({ grupo, param }: { grupo: PanelTabGroup; param: string | null }): {
  value: string
  slug: string | null
} {
  if (param === null || param === '') return { value: grupo.porDefecto, slug: null }
  const value = grupo.slugs.get(param)
  if (value === undefined || value === grupo.porDefecto) return { value: grupo.porDefecto, slug: null }
  return { value, slug: param }
}

/**
 * El inverso, para el handler del tab: un valor interno del grupo → su slug (`null` para el default).
 *
 * Recibe `unknown` a propósito: es lo que entrega el `onValueChange` de Base UI. Cualquier cosa que no
 * sea un valor interno de ESTE grupo (otro string, un número, `null`, un objeto) da `{ ok: false }` y
 * el handler no escribe nada.
 */
export function tabSlug({ grupo, value }: { grupo: PanelTabGroup; value: unknown }):
  | { ok: true; slug: string | null }
  | { ok: false } {
  if (typeof value !== 'string') return { ok: false }
  if (value === grupo.porDefecto) return { ok: true, slug: null }
  for (const [slug, interno] of grupo.slugs) {
    if (interno === value) return { ok: true, slug }
  }
  return { ok: false }
}
