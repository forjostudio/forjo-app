---
created: 2026-10-09T22:40:00.000Z
title: iOS hace zoom al enfocar 16 inputs del panel y deja el layout descentrado
area: panel
resolves_phase: null
files:
  - app/(dashboard)/clients/clients-client.tsx
  - app/(dashboard)/finances/finances-client.tsx
  - app/(dashboard)/clinical-history/clinical-history-client.tsx
  - components/dashboard/clinical-history-panel.tsx
  - components/dashboard/categorias-manager.tsx
---

## Problem

En un **iPhone real**, tocar un buscador del panel —por ejemplo el de cliente dentro de "Nueva
venta", o el de `/clients`— hace que **Safari haga zoom automático** y desacomode toda la pantalla.
Y después de volver del zoom, **el contenido queda descentrado**: se ve cortado a la derecha y el
header a medias. Detectado por el dueño en la UAT de la Phase 2 de v0.31 (2026-10-09), con capturas.

**Son un solo defecto, no dos.** El descentrado es la secuela del zoom: iOS deja el viewport visual
corrido después de ampliar. Sin zoom no hay descentrado.

**Causa raíz, medida:** iOS Safari hace zoom sobre cualquier input enfocado cuyo `font-size` sea
**menor a 16px**. El componente base está BIEN —`components/ui/input.tsx` usa `text-base` (16px)—
pero **los call sites lo pisan**:

```
app/(dashboard)/clients/clients-client.tsx:835   className="pl-8 h-8 text-sm"
app/(dashboard)/finances/finances-client.tsx     className="h-8 text-sm pl-8"
```

Barrido del panel (`app/(dashboard)/**` + `components/dashboard/**`), medido el 2026-10-09:

| Archivo | Inputs/Textareas | Con `font-size` < 16px |
|---|---|---|
| `clients/clients-client.tsx` | 13 | **6** |
| `finances/finances-client.tsx` | 15 | **4** |
| `components/dashboard/clinical-history-panel.tsx` | 4 | **4** |
| `clinical-history/clinical-history-client.tsx` | 1 | **1** |
| `components/dashboard/categorias-manager.tsx` | 2 | **1** |
| **TOTAL** | **88** | **16** |

⚠ **Esto ya viola una regla del propio `CLAUDE.md` del proyecto**: *"Nunca usar font-size menor a
16px para texto de cuerpo en mobile"*.

## Solution

**Subir esos 16 inputs a 16px en mobile**, conservando el look de desktop:

```
text-sm   →   text-base sm:text-sm
text-xs   →   text-base sm:text-xs
```

A <640px quedan en 16px y iOS **no tiene motivo** para hacer zoom; a ≥640px se ven exactamente
igual que hoy.

### Lo que NO hay que hacer

El dueño preguntó si se puede "eliminar la opción de hacer zoom para que funcione como una app
real". **Técnicamente sí** (`maximum-scale=1, user-scalable=no` en el export `viewport`), **pero es
el arreglo equivocado y quedó descartado**:

- Le saca el pinch-zoom a **todo el mundo**, incluida la gente que lo necesita para leer.
- Es una falla de **WCAG 1.4.4 (Resize Text)**, y el `CLAUDE.md` del proyecto declara la
  accesibilidad como no negociable.
- Trata el síntoma. El arreglo de 16px elimina el **motivo** del zoom: se consigue la misma
  sensación de app, sin quitarle nada a nadie.

### Candado sugerido

En la línea de los del bloque 10 de `test/panel-nav-chrome.test.ts`: un barrido que falle si entra
un `<Input>`/`<Textarea>` bajo `app/(dashboard)` con `text-sm`/`text-xs` **sin** su variante
`text-base` para mobile. Sin eso, el próximo input nace chico — que es exactamente cómo llegamos a
16 de 88.

⚠ Al escribir el barrido, ojo con el regex: `<Input[^>]*?>` **se corta en el `>` de las arrow
functions** (`onChange={e => ...}`). Hay que matchear hasta `/>` permitiendo `>` adentro. Medido:
con el regex ingenuo el barrido reportaba **0 de 88** y parecía que no había problema.

## Relacionado

Mismo origen (la UAT del 2026-10-09) y conviene hacerlos en la misma pasada:
`2026-10-09-guarda-de-borrador-en-los-dialogos-del-panel.md`.

El modo búsqueda de `/clients` (header que se repliega al buscar) **ya se implementó** en esa UAT,
commit aparte: atacaba el mismo síntoma —poca lista visible con el teclado abierto— pero por el
lado del alto del header, no del zoom. Los dos suman.
