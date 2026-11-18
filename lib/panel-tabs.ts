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

/**
 * Un toque en un tab → el `from` y el `to` que el handler le pasa a la causa y al ejecutor (G-04-7).
 *
 * `from` es el slug que {@link resolveTab} le da al `?tab=` de `search`, la URL DEL MOMENTO DEL TOQUE;
 * `to` es el de {@link tabSlug}. Si `tabSlug` rechaza el valor, `{ ok: false }` y el handler no escribe.
 *
 * **Por qué el `from` no puede salir del render:** la escritura de un toque cambia la URL y el state
 * del historial AL INSTANTE, pero el parche del historial de Next despacha la restauración del router
 * dentro de `startTransition`, así que el render —y con él `useSearchParams()`— recién se entera con el
 * commit de esa transición. Base UI llama al `onValueChange` del último commit y su `active` también es
 * del último commit: un segundo toque en esa ventana PASA, y con el `from` del render decidía sobre una
 * URL vieja (E1: Ventas empujado sobre Ventas; E2: Ventas → Egresos empujaba en vez de reemplazar y el
 * atrás desde Egresos caía en Ventas, en contra de D-01). Medido con el ejecutor real en
 * `.planning/debug/doble-toque-tab.md`.
 *
 * **Por qué recibe `search` y no lee `window`:** este módulo es puro (su encabezado). Las pantallas le
 * pasan `window.location.search` en el handler y el simulador de `test/panel-tabs.test.ts` la de su
 * historia falsa: el `tocar` de esa suite llama a ESTA función —un candado lee su cuerpo—, así el espejo
 * del test no puede volver a probar una versión distinta de la que corre en las pantallas.
 */
export function toqueDeTab({ grupo, value, search }: { grupo: PanelTabGroup; value: unknown; search: string }):
  | { ok: true; from: string | null; to: string | null }
  | { ok: false } {
  const destino = tabSlug({ grupo, value })
  if (!destino.ok) return { ok: false }
  const from = resolveTab({ grupo, param: new URLSearchParams(search).get(TAB_PARAM) }).slug
  return { ok: true, from, to: destino.slug }
}

/**
 * ¿Hay una vuelta del OAuth pendiente en `/negocio`? `true` si `mp` o `google` están PRESENTES en la
 * query, con cualquier valor —vacío incluido— (G-04-8).
 *
 * **Por qué por presencia y por qué UNA función:** el render tiene que mostrar Integraciones con
 * cualquier valor (también `?mp=`), y el que limpia la URL tiene que usar EXACTAMENTE el mismo criterio:
 * si el render preguntaba por presencia y el efecto por verdad, `?mp=` forzaba Integraciones, el efecto
 * no lo borraba nunca y los cuatro tabs de Negocio quedaban trabados hasta recargar
 * (`.planning/debug/oauth-traba-tabs-negocio.md`). La usan los tres consumidores de `settings-client.tsx`:
 * lo que se muestra, el corte de la reconciliación (los dos por el `vueltaDeOAuth` del render) y la
 * guarda del efecto del OAuth.
 *
 * El backend sólo emite `?mp=connected|error` y `?google=connected|error`; cualquier otra forma (un
 * valor vacío, `?tab=integraciones&mp=…`) llega por una URL pegada o editada. Como el resto del módulo,
 * sólo elige qué se MUESTRA y qué se escribe en la URL: nunca qué se lee. Recibe cualquier objeto con
 * `has` para servir al `useSearchParams()` del render y al `URLSearchParams` del efecto por igual.
 */
export function vueltaDeOAuthPendiente({ query }: { query: { has(nombre: string): boolean } }): boolean {
  return query.has('mp') || query.has('google')
}
