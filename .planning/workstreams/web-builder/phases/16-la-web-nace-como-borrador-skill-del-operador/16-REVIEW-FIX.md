---
phase: 16-la-web-nace-como-borrador-skill-del-operador
fixed_at: 2026-07-13T17:10:00Z
review_path: .planning/workstreams/web-builder/phases/16-la-web-nace-como-borrador-skill-del-operador/16-REVIEW.md
iteration: 1
findings_in_scope: 6
fixed: 6
skipped: 0
status: all_fixed
---

# Phase 16: Code Review Fix Report

**Fixed at:** 2026-07-13T17:10:00Z
**Source review:** `.planning/workstreams/web-builder/phases/16-la-web-nace-como-borrador-skill-del-operador/16-REVIEW.md`
**Iteration:** 1

**Summary:**
- Findings in scope (Critical + Warning): 6
- Fixed: 6
- Skipped: 0

**Gate final:** `npx tsc --noEmit` limpio · `npx vitest run` → **553/553** (505 passed, 48 skipped),
igual al baseline. `npx eslint scripts/setup-landing.ts` limpio.

**Contrato de la fase — INTACTO.** Ninguna de las 6 correcciones toca `lib/landing/write.ts` ni
relaja un solo test. El default sigue escribiendo SOLO `landing_draft` (la clave `landing_config`
no existe en el payload), `--publish` sigue escribiendo las dos columnas con el mismo objeto
validado, el aviso de choque sigue AVISANDO sin abortar, y un config inválido sigue abortando
ruidosamente. Los guardianes (`test/landing-write.test.ts`, `test/landing-editor-draft.test.ts`)
pasan sin modificación.

---

## Fixed Issues

### CR-01: El MODO EDICIÓN documentado en el SKILL.md era imposible de ejecutar

**Files modified:** `scripts/setup-landing.ts`
**Commit:** `9b919af`
**Applied fix:** guard al tope de `rehostImage` (param renombrado `localPath` → `localPathOrUrl`):
si el valor ya es una URL `http(s)` **de nuestro bucket** (prefijo derivado de
`supabase.storage.from(BUCKET).getPublicUrl('')`, sin hardcodear el project-ref), se devuelve tal
cual y **no se re-sube**. Eso hace ejecutable el flujo del SKILL.md que reconstruye el
`BuilderInput` desde `--inspect` (donde las imágenes ya son URLs de Storage, no rutas del disco),
y mata de raíz el modo de falla peligroso de segundo orden: el agente ya no tiene motivo para
"arreglar" el crash dropeando los campos de imagen — que le habría borrado hero/gallery/about al
dueño en silencio.

Se tomó la variante **recomendada** del review (acotar al bucket propio, no "cualquier http(s)"):
una URL del CDN de IG que se cuele por error **sigue siendo rechazada**, ahora con un error
explícito ("es una URL EXTERNA… descargala y pasá la ruta") en vez de un `ENOENT` desorientante.
Se preserva SKILL-03 / Pitfall 1: nunca hot-link.

---

### WR-01: La escritura NO era idempotente (y envenenaba el aviso de choque)

**Files modified:** `scripts/setup-landing.ts`, `.claude/skills/forjo-web-builder/SKILL.md`
**Commit:** `7f132e3`
**Applied fix:** la key de Storage se deriva del **contenido** en vez de `randomUUID()`:
`sha256(buffer).slice(0,32)` + `upsert: true`. Import de `node:crypto` cambiado de `randomUUID` a
`createHash`. Re-subir la misma foto escribe la misma key (no-op) y devuelve la misma URL ⇒ mismo
payload, mismo config byte a byte.

Cierra las tres consecuencias del review: (1) la afirmación "Re-escribí (idempotente, D-06)" del
SKILL.md ahora es **verdadera**; (2) una re-escritura por defecto ya no hace que `landing_draft`
difiera de `landing_config` solo por las URLs — el `--inspect` siguiente ya no le grita al operador
"el dueño tiene cambios sin publicar: hero, gallery…" por trabajo que hizo él mismo (esa señal es
justo lo que la fase construyó); (3) deja de duplicar objetos huérfanos en el bucket público en cada
corrida. SKILL.md actualizado: `{uuid}.webp` → `{sha256}.webp` + nota de que las URLs del bucket
pasan de largo y las externas se rechazan.

---

### WR-02: El fallback de `sharp` subía bytes arbitrarios a un bucket PÚBLICO, y las imágenes se subían ANTES del gate

**Files modified:** `scripts/setup-landing.ts`, `.claude/skills/forjo-web-builder/SKILL.md`
**Commit:** `f342d97`
**Applied fix (1) — abortar en vez de degradar:** el `catch` de sharp ya no sube el binario original
tal cual; ahora **tira** (`no es una imagen decodificable… no se sube nada`). Que sharp no pueda
decodificarlo ES la señal de que eso no es una imagen; subirlo publicaba un archivo arbitrario del
disco del operador en un bucket `public:true`, en una URL que entraba al config (pasa `safeLinkUrl`:
es https). Coherente con la doctrina de la fase: en el write path, input inválido aborta ruidosamente.
`extToContentType` quedó muerta y se **borró**; el import de `node:path` también (ya no se usa).

**Applied fix (2) — gatear antes de subir:** nuevo paso **PRE-GATE**. Se calcula el `theme`, se arma
el config con las imágenes reemplazadas por placeholders https (`withPlaceholderImages`) y se corre
`parseLandingConfigForWrite` **antes de tocar Storage**. Si el payload no valida, el script aborta
con el bucket intacto — antes dejaba objetos públicos huérfanos que nadie limpia. El gate real
(paso 8, sobre el config con las URLs ya resueltas) **se mantiene**: es el que manda. El header
"Orden EXACTO (nada se escribe hasta tener todo resuelto y validado)" ahora es cierto; el orden
documentado pasó a 11 pasos y se renumeró.

---

### WR-03: El aviso de choque se calculaba con el validador FAIL-SAFE → un borrador roto se pisaba SIN aviso

**Files modified:** `scripts/setup-landing.ts`
**Commit:** `7c1d70d` (junto con WR-05 — misma refactorización del printer, ver nota abajo)
**Applied fix:** `readLandingState` ahora distingue **"presente pero roto"** de **"ausente"**:
pregunta aparte, con `landingConfigSchema.safeParse`, si cada columna presente valida
(`publicadoRoto` / `borradorRoto`). Si alguna está rota, la comparación es imposible (el lado roto se
leyó como un `DEFAULT_LANDING_CONFIG` inventado) ⇒ `tieneCambiosSinPublicar: true` con `partes: []`.
Regla aplicada, textual del review: **ante duda, avisar**.

Cierra los dos escenarios: (a) draft **y** published rotos ya no colapsan al mismo DEFAULT con diff
`[]` y cero aviso — el UPDATE ya no pisa el borrador real del dueño en silencio; (b) el pre-print de
`--publish` con `landing_config` roto ya no le describe al operador una web que **no existe en la DB**
justo cuando la va a reemplazar: dice la verdad ("no pude leer la web publicada… no puedo decirte qué
secciones ni qué tema tiene hoy"). `--inspect` expone los dos flags nuevos (`publicado_roto`,
`borrador_roto`).

**Nota de diseño:** el aviso se centralizó en **una** función (`avisoDeChoque(estado, slug)`) que
comparten `--inspect` y el write path. Antes eran dos bloques de branches con copy duplicado y ya
divergente. El SKILL.md le pide al operador copiar el aviso del `--inspect` al checkpoint humano: si
las dos superficies pueden divergir, el operador aprueba mirando un aviso que no es el que imprime la
escritura. Sigue AVISANDO, no abortando, y sin confirmación interactiva (el checkpoint bloqueante vive
en el SKILL.md) — contrato de la fase respetado.

---

### WR-04: El SKILL.md solo documentaba UNA de las formas del aviso → lista vacía en el checkpoint

**Files modified:** `.claude/skills/forjo-web-builder/SKILL.md`
**Commit:** `35bdc14`
**Applied fix:** el paso 6 ahora documenta **las cuatro** formas del aviso en una tabla (borrador roto
· publicado roto · nunca publicó · difiere por partes), espejando textualmente los mensajes que
imprime `avisoDeChoque`. Se agregó la instrucción explícita: **el `--inspect` ya imprime la línea
exacta — copiala tal cual, no armes la lista de secciones vos**, con la advertencia de que
`partes_sin_publicar: []` renderizado con el template viejo deja un `Secciones que difieren de lo
publicado: .` vacío en el único punto de control humano del flujo. La tabla de claves del paso 2 suma
`publicado_roto` / `borrador_roto` y aclara que `partes_sin_publicar: []` **no** significa "no hay
cambios".

---

### WR-05: `--inspect` afirmaba "Borrador y publicado coinciden" cuando NO hay borrador

**Files modified:** `scripts/setup-landing.ts`
**Commit:** `7c1d70d` (mismo commit que WR-03: los dos caen en la cadena de branches de `runInspect`,
que se reescribió de una pieza sobre `avisoDeChoque`; separarlos habría dejado un commit intermedio
que no compila)
**Applied fix:** branch nuevo — con `draft === null` y publicado presente, `--inspect` ahora imprime
`· No hay borrador: el dueño nunca abrió su editor. Al aire está la web publicada.` en vez de la
afirmación falsa "✓ Borrador y publicado coinciden". El `✓ coinciden` queda **solo** para el caso en
que efectivamente hay borrador y es igual a lo publicado.

---

## Skipped Issues

Ninguna. Las 6 findings en scope (1 Critical + 5 Warning) se aplicaron.

Las 3 findings **Info** (IN-01 `landingWriteColumns` aliasa el mismo objeto · IN-02 `getFlag` consume
el argv siguiente a ciegas · IN-03 error de DB reportado como "no existe el slug") quedaron **fuera de
scope** (`fix_scope: critical_warning`) y siguen abiertas.

---

_Fixed: 2026-07-13T17:10:00Z_
_Fixer: Claude (gsd-code-fixer)_
_Iteration: 1_
