# Decisión del dueño durante la UAT ronda 3 de la fase 3 — 2026-10-28

**Revisa** cuándo se arma el sentinel de salida. No toca `03-DECISION-UAT.md` (decisión (a): el
sentinel se arma sólo si no hay nada nuestro debajo) ni `03-DECISION-UAT-2.md` (Inicio es siempre la
raíz): las dos siguen en pie. Lo que cambia es **el disparador** del armado, no sus siete reglas.

## Qué apareció

El plan `03-12` midió los dos fallos abiertos de la ronda 3 (`G3-2`: el atrás después de que el aviso
expira sale directo; `G3-3`: la entrada directa a Inicio sale directo) en la app real, con Chrome real
y el atrás **de la interfaz** del navegador. Veredicto completo:
`.planning/debug/la-absorcion-que-no-absorbe-medida.md`.

- En los dos, la decisión del armado es correcta (`arm`, ninguna regla declina) y `holding=true`.
- Pero **ningún `popstate` llega**: el atrás de la interfaz **saltea** la entrada (`entradas_salteadas=1`).
  Es la **intervención de historial de Chrome**: una entrada empujada **sin activación del usuario** es
  salteable. El sentinel se empuja así al montar (1.3) y desde el temporizador (3.1).
- Ningún cambio en **cómo se absorbe** alcanza a una entrada que el navegador nunca visita. Lo que se
  puede cambiar es **cuándo se empuja**.

## La decisión: ARMAR SÓLO CON ACTIVACIÓN DEL USUARIO (camino 1)

1. **El sentinel se empuja sólo cuando hay activación del usuario.** Si al montar en Inicio ya la hay
   (se llegó tocando la barra, el caso del 1.1 que hoy pasa), se arma como hoy. Si no la hay, el armado
   queda **pendiente** y se dispara en el primer toque o tecla del dueño estando en Inicio.
2. **El aviso deja de vencer solo.** Hoy se esconde a los `PANEL_EXIT_HINT_MS` (2000 ms) y el
   temporizador re-arma sin activación —justo lo que el navegador saltea—. Pasa a quedarse visible
   **hasta que el dueño toca la pantalla**, y en ese toque se esconde y se re-arma (con activación).
   Así lo que se ve coincide siempre con lo que pasa: **aviso visible ⇔ el próximo atrás sale.**

**Por qué:** cubre el camino de uso real (llegar a Inicio tocando) y hace honesto el aviso. La
alternativa descartada (camino 2, aceptar el límite tal cual) dejaba el 3.1 fuera de MOB-05 con un
aviso que desaparecía y después dejaba salir sin avisar.

## El costo, declarado

- **Entrar directo a Inicio (pestaña nueva, recarga, abrir el link) y apretar atrás SIN tocar nada
  sale sin aviso.** No tiene arreglo: es la regla del navegador. MOB-05 pasa a prometer *el aviso de
  salida una vez que tocaste la pantalla en esta visita*.
- El recorrido 1.3 del guion cambia de resultado esperado en su mitad "sin tocar nada": va al guion de
  la ronda 3 como expectativa **nueva**, no como regresión. Con un toque antes del atrás, avisa.
- El recorrido 3.1 cambia: el aviso **no** se va a los 2 s; queda hasta un toque.

## Lo que esta decisión NO cambia

- Las siete reglas de `panelExitArmAction` y las cinco de `panelExitPopAction`.
- El arreglo de la **recarga** (causa (ii) del veredicto: la séptima regla declina sin acreditar con
  un `frjExit` de una instancia muerta): va por la opción **(A)** del veredicto, sin decisión nueva.
- El límite aceptado de la entrada ajena debajo (decisión (a)).

## Sin medir

Todo lo medido es Chrome de **escritorio**. Chrome de Android comparte el código de la intervención
(esperable, no medido); Safari de iOS no está medido. La ronda 3 en el teléfono es la que lo cierra.
