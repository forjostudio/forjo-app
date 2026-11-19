---
audit_acknowledged:
  milestone: v0.31
  at: 2026-11-19
  gap_snapshot: "unknown::scenarios=0"
---

# Phase 3 — UAT: La política de atrás, de un nivel a dos

**Fecha:** 2026-10-15
**Dispositivo:** Android / Chrome, sobre `http://192.168.0.10` (dev server, Supabase local)
**iPhone / Safari:** **NO corrido todavía** — diferido a propósito hasta que Android esté verde
(los fallos son de lógica de pila, no de plataforma: reproducirían igual y ensuciarían la señal de A11).

## Resultado

**5 fallos numerados + 1 colisión de diseño (H)** sobre **21 ítems corridos**.

⚠ **CORREGIDO el 2026-10-15:** una primera versión de este documento dio por **no corridos** los
ítems 9, 10-14, 16, 17 y 21. **Estaba mal.** El dueño los corrió y los marcó `[OK]` a mano en el
guion de `03-04-SUMMARY.md` mientras probaba; no los mencionó verbalmente porque **pasaron**.
La autoridad de qué se corrió es ese guion marcado, no el reporte verbal.

| Bloque | Ítems | Resultado |
|---|---|---|
| A · Los dos niveles (MOB-04) | 1, 2 | ✅ pasa |
| B · Más apila (D-02) | 3 | ✅ pasa |
| C · Tocar Más dentro de la rama sube (D-03) | 4, 5 | ✅ pasa |
| D · El cruce (criterio 2) | 6, 9 | ✅ pasa |
| D · El cruce | **7, 8** | ❌ **falla** |
| E · Cero regresión | 10, 11, 12, 13 | ✅ **pasa** (marcados `[OK]` por el dueño) |
| F · Cambios sin guardar | 14, 16, 17 | ✅ **pasa** (marcados `[OK]`) |
| F · Cambios sin guardar | **15** | ❌ **falla** |
| G · El aviso de salida | 18 | ✅ pasa (aparece y funciona) |
| G · El aviso de salida | **19, 20** | ❌ **falla** |
| G · El aviso en escritorio (D-05) | 21 | ✅ **pasa** (marcado `[OK]`) |
| H · Lo que esta fase cambia | `Más→sección→atrás` | ✅ pasa |
| H · Lo que esta fase cambia | **`Más→Inicio→atrás`** | ❌ **falla** (colisión de diseño, ver G-4) |
| I · Declarados que no son bugs | — | ✅ todo ok |

---

## Gaps

### G-1 · [major] D7 — el cruce desde una pila de tres recarga y aterriza mal

**Esperado:** `Inicio → Turnos → Más → Finanzas → Clientes en la barra → atrás` cae en **Turnos**,
con algo visible al primer atrás.
**Medido:** *"recarga y queda en clientes, le tuve que hacer dos atrás y volvió a `dashboard#salir-3`"*.

Dos síntomas en uno: hay una **recarga** (navegación completa donde debía haber un movimiento de
historial) y el destino final es una entrada **del sentinel de salida** (`#salir-3`) metida en medio
de un colapso de rama.

### G-2 · [major] D8 — el primer atrás no hace nada (atrás muerto)

**Esperado:** el caso degenerado (`…→Finanzas→tocar Turnos`) queda en Turnos y el `atrás` cae en Inicio.
**Medido:** *"lo mismo, a la primera que toco atrás no hace nada"*.

Un atrás que no produce **nada visible** es exactamente lo que el **criterio 2** del ROADMAP prohíbe
("la entrada basura que v0.30 prohíbe explícitamente").

### G-3 · [major] F15 — "Salir sin guardar" aterriza en una sección vieja, y Más cae en Inicio

**Esperado:** `/web` → tocar Más → "Salir sin guardar" aterriza en **Más**, y el `atrás` cae en Inicio.
**Medido:** *"cayó en agenda (que es donde estaba antes haciendo la otra prueba) y toqué Más ahí dentro
de agenda y me llevó a inicio en vez de más"*.

Aterrizar en `agenda` —una sección de una prueba **anterior**— apunta a una marca de rama **rancia**
leída cuando no correspondía. Y "tocar Más desde una sección lleva a Inicio" contradice D-02, que dice
que Más **apila**.

### G-4 · [design] H — el aviso de salida se come el atrás que debía volver a Más

**Esperado (MOB-04):** `Más → Inicio → atrás` vuelve a **Más**.
**Medido:** *"salta el aviso para salir"*.

**No es un bug de implementación: es la colisión que la UAT destapó.** Parado en Inicio con historia
debajo, MOB-04 y MOB-05 no pueden ser verdad a la vez. Es la **imprecisión declarada #12**
(`.planning/WINDOWS.md`), tocada desde el otro lado.

**RESUELTO por decisión del dueño — opción (a)**, registrada en `03-DECISION-UAT.md`: el sentinel se
arma **sólo si no hay nada nuestro debajo**. Gobierna también G-5 y G-6.

### G-5 · [major] G19 — el aviso no se arma si entrás directo a Inicio

**Esperado:** en Inicio el primer atrás **no sale** y avisa; el ciclo repetido ×3 sigue funcionando.
**Medido:** *"para que funcione tengo que entrar a alguna sección y volver a inicio, sino sale de una
sin aviso"*.

**Sospechoso medido:** el armado vive en un efecto con deps `[armarSentinel, pathname]`, así que
**sólo reintenta cuando cambia el pathname**. Si no armó al entrar, parado en Inicio no vuelve a
intentarlo nunca; ir a una sección y volver es lo que fuerza el re-run.

### G-6 · [major] G20 — no se re-arma al expirar la ventana

**Esperado:** esperar a que el aviso desaparezca y tocar atrás otra vez ⇒ **vuelve a avisar**.
**Medido:** *"si toco atrás una vez, pasan 30 segundos, y toco el segundo atrás, sale de una"*.

Misma raíz que G-5. El temporizador llama a `armarSentinel()` al expirar, pero el re-armado no queda
efectivo.

---

## La causa estructural, medida

**La sonda da 8/8 y el teléfono falla porque la sonda no mide esta intersección.** Ningún escenario
combina el **sentinel de salida** (`frjExit`) con la **rama** (`frjUnder` / colapso):

- **E-6** prueba el sentinel **aislado**, sobre una pila limpia de tres entradas.
- **E-8** combina la rama con el sentinel de **cambios sin guardar** (`frjDirty`), que es **otra marca**.

G-1, G-2, G-3 y G-4 caen todos en esa intersección. El 8/8 es verdad; mide un espacio que no incluye
lo que la UAT probó. **Cualquier arreglo tiene que venir con escenarios nuevos de sonda que crucen
las dos marcas**, o volvemos a tener verde sin cobertura.

---

## Lo que sigue sin medirse

- **La parte de overlay del ítem 20** — no se pudo probar: *"no tengo overlays en inicio como para
  probar eso"*. Queda para la ronda 2.
- **Todo el pase de iPhone / Safari** — **A11 sigue abierto**. Diferido a propósito: los 5 fallos son
  de lógica de pila y reproducirían igual en Safari, ensuciando la señal de lo único que el iPhone
  aporta (gesto de swipe-back, barra de direcciones abajo, zona de gestos).

**"Cero regresión" (MOB-06) SÍ se puede afirmar en Android:** el bloque E (10-13) —overlay, selector
de hora, calendario y teclado, los 4 quicks de octubre— se corrió y pasó.

## Estado de los requisitos

**MOB-04, MOB-05 y MOB-06 siguen SIN marcar.** La fase no cierra hasta que los 6 gaps estén cerrados
y la ronda 2 cubra la parte de overlay del ítem 20 y el pase completo de iPhone (A11).
