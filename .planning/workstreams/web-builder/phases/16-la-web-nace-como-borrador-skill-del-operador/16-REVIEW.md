---
phase: 16-la-web-nace-como-borrador-skill-del-operador
reviewed: 2026-07-13T16:50:00Z
depth: standard
files_reviewed: 6
files_reviewed_list:
  - lib/landing/editor-draft.ts
  - lib/landing/write.ts
  - scripts/setup-landing.ts
  - test/landing-editor-draft.test.ts
  - test/landing-write.test.ts
  - .claude/skills/forjo-web-builder/SKILL.md
findings:
  critical: 1
  warning: 5
  info: 3
  total: 9
status: issues_found
---

# Phase 16: Code Review Report

**Reviewed:** 2026-07-13T16:50:00Z
**Depth:** standard
**Files Reviewed:** 6
**Status:** issues_found

## Summary

El contrato central de la fase está **bien implementado y bien testeado**. Verifiqué lo que el
`phase_intent` pidió mirar con lupa:

- `landingWriteColumns(config, false)` devuelve `{ landing_draft }` y la clave `landing_config`
  **no existe** en el objeto (no es `undefined`: no está). Test explícito con `in`. ✔
- `--publish` escribe las dos columnas con el **mismo objeto parseado**. ✔
- El gate de escritura es el **estricto** (`parseLandingConfigForWrite`), aborta con `exitCode 1`
  antes de cualquier `UPDATE`. ✔
- `--inspect` vuelca `al_aire` / `pendiente_de_aprobacion` **crudas** (no las degradadas). ✔
- El aviso de choque avisa y sigue; `diffConfigParts` normaliza y compara canónico, así que no es
  ruido. ✔ (100/100 tests verdes.)

Lo que NO cierra está **fuera del módulo puro y adentro del script + el SKILL.md**, exactamente en
la costura que la fase declaró como riesgo: **el SKILL.md documenta un flujo (MODO EDICIÓN
reconstruido desde `--inspect`) que el script no puede ejecutar**, porque `rehostImage()` hace
`readFile()` sobre valores que la doc le dice al agente que saque del config — y en el config esos
valores son **URLs https de Storage**, no rutas del disco. El camino documentado para retocar una
landing sin payload guardado falla siempre; y el workaround natural del agente (dropear las
imágenes que "no son rutas") **borra las fotos del dueño en silencio** — la misma pérdida que la
fase existe para evitar, pero por la puerta de atrás.

Además, el re-hosteo genera un `randomUUID()` nuevo por corrida, así que la afirmación
"**Re-escribí (idempotente, D-06)**" del SKILL.md es falsa: cada re-escritura cambia todas las URLs
de imagen del config y ensucia el aviso de choque nuevo.

---

## Narrative Findings (AI reviewer)

## Critical Issues

### CR-01: El MODO EDICIÓN documentado en el SKILL.md es imposible de ejecutar — y su workaround obvio borra las fotos del dueño

**File:** `scripts/setup-landing.ts:311-320` y `scripts/setup-landing.ts:441-458`
**File:** `.claude/skills/forjo-web-builder/SKILL.md:99-119` (regla dura "reconstruí desde `pendiente_de_aprobacion`")

**Issue:**
El SKILL.md le ordena al agente, cuando no existe `landing-payloads/<slug>.json`, reconstruir el
`BuilderInput` **desde el volcado de `--inspect`** (`pendiente_de_aprobacion`, con fallback a
`al_aire`) y re-correr la escritura con ese payload.

Pero en esas columnas las imágenes ya están **re-hosteadas**: valen
`https://<ref>.supabase.co/storage/v1/object/public/landing-assets/{bizId}/{uuid}.webp`
(lo confirma el propio fixture de producción de `test/landing-write.test.ts:225`).

El script trata **incondicionalmente** cualquier valor de `hero.image` / `about.image` /
`gallery.images[]` / `rsv.images[]` como **ruta local**:

```ts
// scripts/setup-landing.ts:441-443
if (input.hero?.image) {
  input.hero.image = await rehostImage(supabase, businessId, input.hero.image, 'hero')
}
// …y rehostImage arranca con:
const raw = await readFile(localPath)   // línea 317
```

`readFile('https://…')` tira `ENOENT` → se cae al `catch` del paso 4 → `re-hosteo de imágenes
falló` → `exitCode 1` → **no se escribe nada**. El flujo documentado como "regla dura, no es una
preferencia" **nunca puede terminar**.

Y el modo de falla peligroso es el segundo orden: un agente que ve el crash y "arregla" el payload
sacando los campos de imagen (porque "no son rutas locales") produce un `BuilderInput` sin fotos →
`buildLandingConfig` **omite las secciones vacías** → el `landing_draft` re-escrito queda **sin
hero image, sin gallery, sin about image**. Es pérdida silenciosa del contenido del dueño, sin
aviso posible, en el único camino donde el aviso de choque no puede ayudar (el diff se computa
*antes* de armar el config).

**Fix:** hacer passthrough de lo que ya es una URL http(s) en vez de intentar leerla del disco. Un
guard en `rehostImage` cierra los dos problemas (y también WR-01):

```ts
// scripts/setup-landing.ts — al tope de rehostImage
async function rehostImage(
  supabase: SupabaseClient,
  businessId: string,
  localPathOrUrl: string,
  role: 'hero' | 'gallery' | 'about' | 'rsv',
): Promise<string> {
  // Ya está en Storage (MODO EDICIÓN: el payload se reconstruyó desde el config, D-04) → NO se
  // re-sube. Re-subirla generaría un uuid nuevo por corrida y rompería la idempotencia de D-06.
  if (/^https?:\/\//i.test(localPathOrUrl)) return localPathOrUrl

  const raw = await readFile(localPathOrUrl)
  // …resto igual
}
```

Opcional pero recomendable: acotar el passthrough al bucket propio
(`localPathOrUrl.startsWith(supabase.storage.from(BUCKET).getPublicUrl('').data.publicUrl)`) para
que una URL de CDN de IG que se cuele por error **siga** siendo rechazada (Pitfall 1 / SKILL-03 —
"nunca hot-link").

---

## Warnings

### WR-01: La escritura NO es idempotente — el SKILL.md afirma que sí, y eso convierte el aviso de choque nuevo en ruido

**File:** `scripts/setup-landing.ts:341` (`const key = \`${businessId}/${randomUUID()}.${ext}\``)
**File:** `.claude/skills/forjo-web-builder/SKILL.md:139-148` ("**Re-escribí (idempotente, D-06).** Re-correr con el mismo payload da el mismo resultado")

**Issue:** cada corrida genera un `randomUUID()` por imagen ⇒ URLs nuevas ⇒ **el config resultante
nunca es igual al anterior**, aunque el payload sea byte-idéntico. Tres consecuencias:

1. **La afirmación de D-06 en la doc es falsa.** Re-correr NO da el mismo resultado.
2. **Envenena la señal que esta fase acaba de construir.** Tras una re-escritura por defecto, el
   `landing_draft` difiere de `landing_config` en `hero`/`gallery`/`about`/`booking` **solo por las
   URLs**, y el siguiente `--inspect` grita `⚠ El dueño tiene cambios sin publicar. Secciones que
   difieren de lo publicado: hero, gallery…` — atribuyéndole al dueño lo que hizo el operador. Es
   textualmente el fallo que `editor-draft.ts:315-320` condena ("un aviso que grita en el caso
   limpio es un aviso que el operador aprende a IGNORAR").
3. Duplica objetos en el bucket público en cada corrida; los viejos nunca se borran.

**Fix:** el guard de CR-01 (passthrough de URLs http(s)) hace idempotente el re-run del MODO
EDICIÓN. Para el re-run desde payload con rutas locales, la opción mínima es derivar la key de
forma determinista (hash del contenido) en vez de `randomUUID()`:

```ts
import { createHash } from 'node:crypto'
const digest = createHash('sha256').update(buffer).digest('hex').slice(0, 32)
const key = `${businessId}/${digest}.${ext}`
const { error } = await supabase.storage
  .from(BUCKET)
  .upload(key, buffer, { contentType, upsert: true })  // upsert:true → re-subir la MISMA foto es no-op
```

Si no se toma ninguna de las dos, **corregir el SKILL.md**: borrar la palabra "idempotente" y
advertir que re-correr cambia todas las URLs de imagen y va a disparar el aviso de choque.

---

### WR-02: El fallback de `sharp` sube bytes arbitrarios a un bucket PÚBLICO, y las imágenes se suben ANTES del gate estricto

**File:** `scripts/setup-landing.ts:328-337` (catch de sharp) y `scripts/setup-landing.ts:371-375` / `436-463` vs `480-500`

**Issue:** dos problemas encadenados, ambos contra la doctrina que esta fase acaba de establecer
("un config inválido ABORTA ruidosamente en vez de degradar"):

1. **Degradación fail-safe en el peor lugar.** Si `sharp` falla, el script **sube el binario
   original tal cual** con el content-type derivado de la extensión. Que `sharp` falle es
   justamente la señal de que *eso no es una imagen*. El resultado es un objeto arbitrario servido
   desde un bucket `public:true` (migr. 030) en una URL adivinable-por-config, y esa URL entra al
   `landing_config` (pasa `safeLinkUrl`: es https). Un path equivocado en el payload — o un path
   inducido en el agente por copy scrapeado de IG — publica el contenido de ese archivo.
2. **El header del propio script miente.** Línea 372: *"Orden EXACTO (Pitfall 3: nada se escribe
   hasta tener todo resuelto y validado)"*. Falso: el paso 4 (subida a Storage, líneas 436-463)
   corre **antes** del paso 6 (gate estricto, líneas 480-500). Si el gate rechaza, ya quedaron
   objetos públicos huérfanos en el bucket que nadie limpia.

**Fix (1):** abortar en vez de degradar — coherente con el resto de la fase:

```ts
} catch (e) {
  // Si sharp no puede decodificarlo, NO es una imagen. Subir el binario crudo a un bucket PÚBLICO
  // es peor que fallar: publica un archivo arbitrario del disco del operador.
  throw new Error(
    `${localPath} no es una imagen decodificable (${e instanceof Error ? e.message : e}). ` +
      'Revisá el payload; no se sube nada.',
  )
}
```
(Con esto `extToContentType` queda muerto y se puede borrar — ver IN-04 abajo.)

**Fix (2):** validar el payload y armar/gatear el config **antes** de subir nada. La forma barata:
correr `buildLandingConfig` + `parseLandingConfigForWrite` con placeholders `https://x.test/{i}.webp`
en lugar de las rutas locales, abortar si el gate rechaza, y recién entonces re-hostear y re-armar.

---

### WR-03: El aviso de choque se calcula con el validador FAIL-SAFE → un borrador roto se pisa SIN aviso, y `--publish` miente sobre qué web reemplaza

**File:** `scripts/setup-landing.ts:170-171` (`parseLandingConfig(biz.landing_config)` / `(biz.landing_draft)`) y `scripts/setup-landing.ts:509-519`

**Issue:** `readLandingState` usa `parseLandingConfig` (el de LECTURA), que ante un valor
**presente-pero-inválido** devuelve `DEFAULT_LANDING_CONFIG` (`schema.ts:71-75`), no `null`. El
comentario de las líneas 141-148 justifica la elección ("un config roto en la DB no debe tumbar el
script"), lo cual es razonable, pero **no maneja la consecuencia**:

- Si `landing_draft` **y** `landing_config` están rotos, ambos colapsan al MISMO
  `DEFAULT_LANDING_CONFIG` ⇒ `diffConfigParts` devuelve `[]` ⇒ `tieneCambiosSinPublicar: false` ⇒
  **no se imprime ningún aviso** y el `UPDATE` pisa el borrador real del dueño en silencio. Es el
  escenario exacto que D-01 quiere cubrir.
- En el pre-print de `--publish` (línea 510, `const prev = estado.published!`), si `landing_config`
  está roto, `prev` es el DEFAULT ⇒ el script le informa al operador *"Web actual → secciones
  activas: hero, booking · tema: default"* cuando la web real al aire puede ser otra cosa. Le está
  mostrando un objeto que **no existe en la DB** justo en el momento en que va a reemplazarla.

**Fix:** distinguir "válido" de "presente pero roto" y avisar de lo segundo, en vez de tratarlo
como ausente:

```ts
function readLandingState(biz: { landing_config: unknown; landing_draft: unknown }) {
  const publishedRaw = biz.landing_config
  const draftRaw = biz.landing_draft
  // "Roto" = presente en la DB pero el schema no lo acepta tal cual. NO se puede comparar: se avisa.
  const publishedRoto =
    publishedRaw != null && !landingConfigSchema.safeParse(publishedRaw).success
  const draftRoto = draftRaw != null && !landingConfigSchema.safeParse(draftRaw).success
  // …si draftRoto → tieneCambiosSinPublicar: true (no se puede probar que NO haya trabajo del dueño)
  // …si publishedRoto → el pre-print de --publish debe decir "no pude leer la web al aire", no listarla.
}
```
Regla: ante duda, **avisar** (fail-loud del lado del dueño). Un aviso de más cuesta un WhatsApp;
un aviso de menos cuesta el trabajo del dueño, que no tiene undo.

---

### WR-04: El SKILL.md solo documenta UNA de las dos formas del aviso → en el caso "nunca publicó" el agente muestra una lista vacía

**File:** `.claude/skills/forjo-web-builder/SKILL.md:267-274` (paso 6) vs `scripts/setup-landing.ts:425-434` y `scripts/setup-landing.ts:172-208`

**Issue:** `readLandingState` tiene **dos** casos con `tieneCambiosSinPublicar: true`:

| caso | `tiene_cambios_sin_publicar` | `partes_sin_publicar` |
|---|---|---|
| hay borrador y hay publicado, difieren | `true` | `['hero','gallery',…]` |
| hay borrador y **nunca publicó** (`borradorSinComparar`) | `true` | **`[]`** (línea 203) |

El script imprime dos mensajes distintos para cada uno (líneas 425-434). El **SKILL.md solo trae el
primero**, y el paso 2 (líneas 80-81) le dice al agente: *"Si `tiene_cambios_sin_publicar` es
`true` … ese dato se lleva al checkpoint del paso 6"*, donde el paso 6 le da **un solo template**:

> `⚠ El dueño tiene cambios sin publicar. Secciones que difieren de lo publicado: hero, gallery. Si seguís, los pisás.`

Con `partes_sin_publicar: []`, el agente va a renderizar literalmente
`Secciones que difieren de lo publicado: .` — un aviso vacío y sin sentido, en el checkpoint
bloqueante que es el único punto de control humano de la fase.

**Fix:** documentar los dos casos en el paso 6 del SKILL.md, espejando los mensajes reales del
script:

```markdown
- **Aviso de choque, si aplica.** Dos formas, según lo que devuelva el `--inspect`:
  - `tiene_cambios_sin_publicar: true` **y** `nunca_publico: false` →
    `⚠ El dueño tiene cambios sin publicar. Secciones que difieren de lo publicado: <partes_sin_publicar>. Si seguís, los pisás.`
  - `tiene_cambios_sin_publicar: true` **y** `nunca_publico: true` (`partes_sin_publicar` viene `[]`
    a propósito: no hay contra qué diffear) →
    `⚠ El dueño tiene un borrador sin publicar (este negocio NUNCA publicó su web). Si seguís, lo pisás.`
```

---

### WR-05: `--inspect` afirma "Borrador y publicado coinciden" cuando NO hay borrador

**File:** `scripts/setup-landing.ts:299-301`

**Issue:** la cadena de branches de `runInspect` cae al `else if (!estado.nuncaPublico)` en **dos**
situaciones distintas:

- `draft === published` → "coinciden" ✔ (verdadero)
- `draft === null` **y** `published !== null` → también entra acá (línea 174-184 devuelve
  `tieneCambiosSinPublicar: false`) → imprime **"✓ Borrador y publicado coinciden: no hay nada
  pendiente de aprobación."**

En el segundo caso **no hay borrador**: no "coinciden", no existe. Es un negocio publicado que
nunca abrió el editor. El operador lee una afirmación falsa sobre el estado de la fila justo en el
insumo del checkpoint humano.

**Fix:**

```ts
} else if (!estado.nuncaPublico && estado.draft === null) {
  console.log('· No hay borrador: el dueño nunca abrió su editor. Al aire está la web publicada.')
} else if (!estado.nuncaPublico) {
  console.log('✓ Borrador y publicado coinciden: no hay nada pendiente de aprobación.')
} else {
  console.log('· Este negocio no tiene web: ni publicada ni en borrador.')
}
```

---

## Info

### IN-01: `landingWriteColumns` aliasa el MISMO objeto en las dos claves

**File:** `lib/landing/write.ts:139`
**Issue:** `if (publish) return { landing_draft: config, landing_config: config }` — misma
referencia, y el test lo fija (`landing-write.test.ts:343-351`). Hoy es inocuo (el objeto solo se
serializa en el `UPDATE` y nadie lo muta después), pero es una mina: cualquier caller futuro que
haga `cols.landing_draft.motion = 'none'` muta **las dos columnas**. El comentario dice "a
propósito (no un clon)", así que la intención está declarada; alcanza con blindarla.
**Fix:** `Object.freeze(config)` antes de devolver, o cambiar la assertion del test de `.toBe()` a
`.toEqual()` y clonar. No es urgente.

### IN-02: `getFlag` consume el siguiente token de argv a ciegas

**File:** `scripts/setup-landing.ts:80-88`
**Issue:** `--inspect --slug foo` ⇒ `getFlag('inspect')` devuelve `'--slug'` ⇒ el script sale con
*"no existe ningún negocio con slug \"--slug\""*. Idem `--config --publish` ⇒ `configPath =
'--publish'`. Todos los caminos degeneran a un abort seguro (no escriben nada), así que no es un
bug de corrección, pero el mensaje de error desorienta.
**Fix:** rechazar valores que empiecen con `--`:
```ts
const v = argv[i + 1]
if (a === `--${name}`) return v && !v.startsWith('--') ? v : undefined
```

### IN-03: Un error de DB al resolver el negocio se reporta como "no existe el slug"

**File:** `scripts/setup-landing.ts:116-120` vs `226-230` / `405-409`
**Issue:** `resolveBusiness` devuelve `null` tanto cuando el slug no existe como cuando la query
**falló**. Los callers imprimen en los dos casos *"no existe ningún negocio con slug X"*. El error
real se logueó una línea antes, así que el operador tiene el dato, pero el mensaje final contradice
al anterior.
**Fix:** devolver un discriminado `{ ok: false, reason: 'not_found' | 'db_error' }` (es el patrón de
helpers de validación que ya usa el proyecto — ver `## Diseño de Funciones` en CLAUDE.md).

---

_Reviewed: 2026-07-13T16:50:00Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
