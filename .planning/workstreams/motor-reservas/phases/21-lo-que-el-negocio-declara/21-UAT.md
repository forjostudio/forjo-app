---
status: complete
phase: 21-lo-que-el-negocio-declara
source: [21-VERIFICATION.md]
started: 2026-09-12T03:01:04.576Z
updated: 2026-09-13T04:42:08.000Z
---

## Current Test

[testing complete]

## Tests

### 1. Con el negocio semilla en local, a 375px: paso Horarios con 3 servicios cargados y el toggle apagado no muestra ni chips ni aviso.
expected: Ninguna línea de chips ni aviso al pie visible con el toggle en No.
why_human: Es render de un client component; el runner corre en environment:'node' y no monta JSX.
result: pass

### 2. Prender el toggle, marcar 'Cerámica' sólo en el martes. Mirar el aviso al pie del paso Horarios.
expected: 'Yoga' y 'Masaje' nombrados en el aviso, en gris (text-muted-foreground), sin ícono ni color de error.
why_human: Tono visual y color no verificables por grep; sólo se probó que el texto y el nodo role=\"status\" existen.
result: pass

### 3. Con el aviso en pantalla, click en Finalizar.
expected: El botón está habilitado y el alta termina (redirect a dashboard).
why_human: El gate estructural (handleFinish no referencia el aviso) está probado por grep/awk; que el click realmente funcione en el navegador no lo prueba ningún test.
result: pass

### 4. Cerrar los 7 días del paso Horarios.
expected: El aviso desaparece (string vacío) en vez de listar los dos servicios del catálogo.
why_human: Cubierto por unit test + prueba de mutación a nivel de función pura; falta la confirmación de que el string vacío efectivamente no deja un hueco visual ni texto residual en el DOM.
result: pass

### 5. Crear/editar un negocio de rubro 'canchas' y entrar al paso Horarios.
expected: Ni el toggle ni el aviso ni la línea de chips aparecen; el paso Horarios se sigue mostrando igual que siempre.
why_human: canMapServicesInVertical() está correctamente cableado en código, pero el render condicional en el navegador no está probado por ningún test (environment:'node').
result: pass

### 6. Comparar visualmente el panel de Agenda (dashboard) antes/después de la extracción del editor de chips: colapso, foco visible, área táctil de 44px, congelado durante el guardado.
expected: Cero diferencia de comportamiento o layout frente al estado anterior a la Fase 21.
why_human: El diff textual (comment-stripped) del bloque movido a components/agenda/block-services-line.tsx es idéntico salvo imports (confirmado en 21-REVIEW.md punto 1), pero la equivalencia VISUAL en el navegador no la puede afirmar un test en environment:'node'.
result: pass

### 7. Abrir el alta en http://192.168.x.x:3000 (LAN, sin HTTPS) desde el celular, paso 2 (Servicios).
expected: La pantalla renderiza con normalidad (no queda en blanco).
why_human: WR-02 (randomUUID ausente en contexto inseguro) se corrigió y se probó por mutación que la rama de fallback SE EJECUTA con un doble de Crypto sin randomUUID, pero la confirmación end-to-end en el dispositivo real sigue siendo UAT, como el propio REVIEW-FIX declara.
result: pass
note: "Probado en celular real sobre http://192.168.0.7:3000 (contexto inseguro). El bloqueo inicial ('no funcionan los botones') era allowedDevOrigins de next dev, no codigo de la fase."


### 8. Con un lector de pantalla (VoiceOver/NVDA), enfocar el switch '¿Cada franja es para un servicio puntual?'.
expected: Se anuncia la pregunta completa junto con el estado (encendido/apagado), no sólo 'Sí/No, switch'.
why_human: WR-04 se corrigió (aria-labelledby en vez de aria-pressed) y el lint confirma que el único diagnóstico nuevo desapareció, pero el anuncio real de un lector de pantalla no lo prueba ningún test.
result: pass
retest: "Probado con NVDA real en Windows tras instalarlo en esta sesion. El switch se anuncia con su pregunta completa mas el estado, no solo con el valor. Cierra WR-04 (aria-labelledby en vez de aria-pressed) con evidencia oida, no inferida del lint."


### 9. Vaciar el campo de hora de inicio o fin de un bloque en el paso Horarios y tocar Finalizar (o cambiar de paso).
expected: El error 'Completá la hora de inicio y la de fin.' aparece pegado debajo de los inputs de esa franja, no en otro lugar de la pantalla.
why_human: isValidBlockTime está wireado antes de la comparación de orden (confirmado en el código), pero la posición visual del mensaje de error no la prueba ningún test de este repo.
result: pass

### 10. Paso 1 (Tu negocio), mobile: posicion del boton 'Cerrar sesion' respecto del logo.
expected: El boton no se superpone al lockup de Forjo; hay espacio libre arriba para anclarlo contra el borde superior.
found_during: test 1 (hallazgo incidental, fuera del alcance del test)
result: pass
reported: "Paso 1 encontre algo, el boton de cerrar sesion quedo pisando el logo, hay lugar para que vaya contra el borde de arriba."
retest: "Re-testeado en celular real tras 670f7b2 — no se superpone. Ajuste adicional pedido durante el retest: aire superior a 12px en mobile."

### 11. Paso 2 (Servicios), mobile: borrar con el teclado el 0 de Precio y el valor de Min.
expected: El campo se puede vaciar tecleando backspace, sin tener que salir y volver a clickear la celda; ademas, Min. en 0 muestra un aviso de validacion.
found_during: test 1 (hallazgo incidental, fuera del alcance del test)
result: pass
reported: "Paso 2: no me deja borrar el 0 con el teclado, solo saliendo y clickeando la celda para que se seleccione, esto ya lo solucionamos dentro del panel. Lo mismo pasa con los minutos, solo que hay que poner un warning para que no quede en 0 minutos."
retest: "Re-testeado tras el quick 260912-pm1 (commits 9b63dbf..b4c408e). Los campos se vacian con backspace; vacio toma el default al salir y un 0 explicito queda en 5 con aviso inline."

### 12. Paso 1 (Tu negocio), mobile: desplegable de Rubro.
expected: Las opciones se leen completas y con aire; el panel no se sale del viewport ni aprieta el texto contra los bordes.
found_during: test 7 (hallazgo incidental, fuera del alcance del test)
result: pass
reported: "anota para corregir el selector ese que queda todo apretado el texto de estetica/spa"
retest: "Re-testeado en celular real tras 670f7b2 — las opciones se leen completas y el panel no desborda."

### 13. Paso Horarios, mobile: ancho de los inputs de hora.
expected: La hora se lee completa dentro del campo (9:00 a.m. / 6:00 p.m.), sin recorte del sufijo AM/PM.
found_during: test 9 (hallazgo incidental, fuera del alcance del test)
result: pass
reported: "tenemos que arreglar los campos de hora que quedan cortados"
retest: "Re-testeado en celular real tras 670f7b2 — la hora se lee completa con el sufijo AM/PM. Era el unico de los tres que no reproducia en escritorio (locale de 24h)."

## Summary

total: 13
passed: 13
issues: 0
pending: 0
skipped: 0
blocked: 0

## Gaps

- gap_id: G-21-10
  status: resolved
  truth: "El boton 'Cerrar sesion' del paso 1 del alta no se superpone al lockup de Forjo"
  reason: "User reported: Paso 1 encontre algo, el boton de cerrar sesion quedo pisando el logo, hay lugar para que vaya contra el borde de arriba."
  severity: cosmetic
  test: 10
  status_note: "Cerrado por 670f7b2 (/gsd-fast)."
  root_cause: "El boton estaba en `absolute right-0 top-0` dentro de un contenedor `text-center`: fuera de flujo, nada separaba el boton del lockup centrado y a ~390px se superponian."
  artifacts:
    - path: "app/(onboarding)/onboarding/page.tsx"
  missing:
    - "Fila propia en flujo arriba del lockup en mobile; absolute solo desde sm+."

- gap_id: G-21-11
  status: resolved
  resolved_by: "quick 260912-pm1 (9b63dbf..b4c408e) + migr. 077"
  resolved_at: 2026-09-12
  truth: "Los campos numericos del paso 2 (Precio y Min.) se pueden vaciar con el teclado, y Min. en 0 avisa"
  reason: "User reported: Paso 2: no me deja borrar el 0 con el teclado, solo saliendo y clickeando la celda para que se seleccione, esto ya lo solucionamos dentro del panel. Lo mismo pasa con los minutos, solo que hay que poner un warning para que no quede en 0 minutos."
  severity: major
  test: 11
  root_cause: "`value={service.price}` es estado numerico controlado y onChange hace `toNumberOr(e.target.value, 0)`. Al borrar, el campo queda en cadena vacia, toNumberOr devuelve el fallback (0 para precio, 30 para minutos), ese valor vuelve al estado y se re-renderiza: cada backspace se deshace solo. Igual en duration_minutes."
  artifacts:
    - path: "app/(onboarding)/onboarding/page.tsx"
      issue: "services state tipa duration_minutes/price como number; ~10 sitios dependen de eso"
    - path: "lib/onboarding-agenda.ts"
      issue: "toNumberOr existe para que NaN no llegue a una columna NOT NULL (23502)"
  missing:
    - "Guardar el valor crudo como string (patron ya usado en components/dashboard/canchas-manager.tsx para Precio) y coercionar recien al armar el payload"
    - "Aviso de validacion cuando Min. queda en 0"

- gap_id: G-21-12
  status: resolved
  truth: "El desplegable de Rubro del paso 1 muestra sus opciones completas, sin apretar el texto ni salirse del viewport en mobile"
  reason: "User reported: anota para corregir el selector ese que queda todo apretado el texto de estetica/spa. Observado a ~390px: la opcion 'Belleza/Estetica/Spa' llega justo al borde del panel y el panel desborda el margen izquierdo."
  severity: cosmetic
  test: 12
  status_note: "Cerrado por 670f7b2 (/gsd-fast)."
  root_cause: "`SelectContent` usa `w-(--anchor-width)`: el popup copia el ancho del TRIGGER, que en Rubro es angosto, asi que 'Belleza/Estetica/Spa' no entraba."
  artifacts:
    - path: "app/(onboarding)/onboarding/page.tsx"
  missing:
    - "className scoped al select: `w-auto min-w-(--anchor-width) max-w-[calc(100vw-2rem)]`."

- gap_id: G-21-13
  status: resolved
  truth: "Los inputs de hora del paso Horarios muestran la hora completa en mobile, sin recortar el sufijo AM/PM"
  reason: "User reported: tenemos que arreglar los campos de hora que quedan cortados. Observado a ~390px: el control nativo de hora renderiza '9:00 a.ı' / '6:00 p.ı' en vez de '9:00 a.m.' / '6:00 p.m.' porque el contenido excede el ancho del campo."
  severity: cosmetic
  test: 13
  status_note: "Cerrado por 670f7b2 (/gsd-fast)."
  root_cause: "`w-24` (96px) fijo: alcanzaba para '09:00' en locale de 24h, pero un navegador en 12h renderiza '9:00 a. m.' y el sufijo se recortaba."
  artifacts:
    - path: "app/(onboarding)/onboarding/page.tsx"
  missing:
    - "`w-auto min-w-24`: el ancho lo decide el control nativo, con el piso anterior."
