# Decisión del dueño durante la UAT ronda 2 de la fase 3 — 2026-10-27

**Revisa** `03-DECISION-UAT.md` (decisión (a), 2026-10-15). No la reemplaza: la decisión (a) sigue
en pie tal como está escrita —*el sentinel se arma sólo si no hay nada nuestro debajo*—. Lo que esta
entrada resuelve es una **consecuencia de la decisión (a)** que aparece recién cuando se le aplica
encima la regla nueva del gap **G2-1**.

## Qué apareció

G2-1 cambia `Más → tocar Inicio` de un **empuje** a un **retroceso**: consume la entrada de Más. El
dueño queda entonces en Inicio **sin nada nuestro debajo**, así que —por la decisión (a), funcionando
exactamente como se especificó— el sentinel **se arma** y el atrás **avisa para salir**.

**El resultado visible de ese recorrido pasa a ser el de la alternativa (b)**, que el dueño descartó
el 2026-10-15 justamente porque cambiaba lo que MOB-04 prometía. La regla de armado no cambió; cambió
**la pila** sobre la que se evalúa. Pero el gesto se comporta distinto de lo decidido, así que la
revisión va al dueño y no al planificador.

- **MOB-04 prometía:** `Más → Inicio → atrás` vuelve a **Más**.
- **Con G2-1 aplicado:** `Más → Inicio → atrás` **avisa para salir**.

## La decisión: AVISAR PARA SALIR

**Inicio queda SIEMPRE como la raíz.** Llegue el dueño por donde llegue, el atrás en Inicio avisa
antes de salir.

**Por qué**, con las dos mitades:

- **A favor:** es uniforme y predecible —una sola regla para una sola pantalla, sin que el mismo gesto
  en la misma pantalla haga dos cosas según de dónde venís— y deja la pila **acotada en todos los
  caminos**.
- **El costo, declarado:** **retira lo que MOB-04 prometía para ese recorrido.** El atrás ya no
  vuelve a Más.

## La alternativa descartada, y lo que costaba

**Conservar MOB-04** (que la regla nueva no dispare viniendo de Más, dejando la entrada de Más debajo)
era posible y más fiel a lo decidido en octubre. Se descartó porque **movía de lugar el defecto del
ítem 19 en vez de cerrarlo**: el ciclo `Inicio ↔ Más` volvía a apilar **2 entradas por vuelta sin
techo**, que es literalmente lo que el dueño acababa de reportar.

## Lo que esta decisión NO cambia

- La **decisión (a)** y sus siete reglas de armado: intactas.
- El **límite aceptado** de la decisión (a) —si lo que quedó debajo es una entrada **ajena** (otro
  sitio), el aviso aparece igual y no hay API para saberlo—: sigue aceptado.
- El **residuo de escritorio** de G2-1 (salir de una pantalla con cambios sin guardar hacia Inicio
  desde el sidebar, con el atrás un escalón más corto): sigue aceptado, registrado en `03-UAT-2.md`.

## Lo que esta decisión obliga a escribir

**El recorrido del bloque H cambia de resultado esperado, y tiene que estar escrito ANTES de la ronda
3.** Si no, el dueño lo va a reportar como regresión —es el mismo recorrido que probó en la ronda 1 con
la expectativa opuesta—. Va en **MOB-05** (lo hace el plan `03-10`), con prohibición explícita de
tratarlo como bug, y en el guion de la ronda 3 como expectativa **nueva** y no como regresión.

## Alcance

Gobierna el recorrido `Más → Inicio → atrás` y nada más. Los ítems pendientes de la ronda 2 (20, el
overlay en Inicio, 1-5, 10-13, 16, 21) se corren **después** de que G2-1 esté aplicado, contra el
comportamiento nuevo.
