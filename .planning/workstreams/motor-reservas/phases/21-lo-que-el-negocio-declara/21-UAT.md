---
status: testing
phase: 21-lo-que-el-negocio-declara
source: [21-VERIFICATION.md]
started: 2026-09-12T03:01:04.576Z
updated: 2026-09-12T03:01:04.576Z
---

## Current Test

number: 1
name: Con el negocio semilla en local, a 375px: paso Horarios con 3 servicios cargados y el toggle apagado no muestra ni chips ni aviso.
expected: |
  Ninguna línea de chips ni aviso al pie visible con el toggle en No.
awaiting: user response

## Tests

### 1. Con el negocio semilla en local, a 375px: paso Horarios con 3 servicios cargados y el toggle apagado no muestra ni chips ni aviso.
expected: Ninguna línea de chips ni aviso al pie visible con el toggle en No.
why_human: Es render de un client component; el runner corre en environment:'node' y no monta JSX.
result: [pending]

### 2. Prender el toggle, marcar 'Cerámica' sólo en el martes. Mirar el aviso al pie del paso Horarios.
expected: 'Yoga' y 'Masaje' nombrados en el aviso, en gris (text-muted-foreground), sin ícono ni color de error.
why_human: Tono visual y color no verificables por grep; sólo se probó que el texto y el nodo role=\"status\" existen.
result: [pending]

### 3. Con el aviso en pantalla, click en Finalizar.
expected: El botón está habilitado y el alta termina (redirect a dashboard).
why_human: El gate estructural (handleFinish no referencia el aviso) está probado por grep/awk; que el click realmente funcione en el navegador no lo prueba ningún test.
result: [pending]

### 4. Cerrar los 7 días del paso Horarios.
expected: El aviso desaparece (string vacío) en vez de listar los dos servicios del catálogo.
why_human: Cubierto por unit test + prueba de mutación a nivel de función pura; falta la confirmación de que el string vacío efectivamente no deja un hueco visual ni texto residual en el DOM.
result: [pending]

### 5. Crear/editar un negocio de rubro 'canchas' y entrar al paso Horarios.
expected: Ni el toggle ni el aviso ni la línea de chips aparecen; el paso Horarios se sigue mostrando igual que siempre.
why_human: canMapServicesInVertical() está correctamente cableado en código, pero el render condicional en el navegador no está probado por ningún test (environment:'node').
result: [pending]

### 6. Comparar visualmente el panel de Agenda (dashboard) antes/después de la extracción del editor de chips: colapso, foco visible, área táctil de 44px, congelado durante el guardado.
expected: Cero diferencia de comportamiento o layout frente al estado anterior a la Fase 21.
why_human: El diff textual (comment-stripped) del bloque movido a components/agenda/block-services-line.tsx es idéntico salvo imports (confirmado en 21-REVIEW.md punto 1), pero la equivalencia VISUAL en el navegador no la puede afirmar un test en environment:'node'.
result: [pending]

### 7. Abrir el alta en http://192.168.x.x:3000 (LAN, sin HTTPS) desde el celular, paso 2 (Servicios).
expected: La pantalla renderiza con normalidad (no queda en blanco).
why_human: WR-02 (randomUUID ausente en contexto inseguro) se corrigió y se probó por mutación que la rama de fallback SE EJECUTA con un doble de Crypto sin randomUUID, pero la confirmación end-to-end en el dispositivo real sigue siendo UAT, como el propio REVIEW-FIX declara.
result: [pending]

### 8. Con un lector de pantalla (VoiceOver/NVDA), enfocar el switch '¿Cada franja es para un servicio puntual?'.
expected: Se anuncia la pregunta completa junto con el estado (encendido/apagado), no sólo 'Sí/No, switch'.
why_human: WR-04 se corrigió (aria-labelledby en vez de aria-pressed) y el lint confirma que el único diagnóstico nuevo desapareció, pero el anuncio real de un lector de pantalla no lo prueba ningún test.
result: [pending]

### 9. Vaciar el campo de hora de inicio o fin de un bloque en el paso Horarios y tocar Finalizar (o cambiar de paso).
expected: El error 'Completá la hora de inicio y la de fin.' aparece pegado debajo de los inputs de esa franja, no en otro lugar de la pantalla.
why_human: isValidBlockTime está wireado antes de la comparación de orden (confirmado en el código), pero la posición visual del mensaje de error no la prueba ningún test de este repo.
result: [pending]

## Summary

total: 9
passed: 0
issues: 0
pending: 9
skipped: 0
blocked: 0

## Gaps
