# Phase 14 — Ítems fuera de alcance detectados durante la ejecución

## 14-01 — Suites de integración de abonos inestables (pre-existentes)

**Detectado:** 2026-08-04, durante la verificación del plan 14-01.

`npx vitest run` falla de forma **no determinista** en `test/abono-create.test.ts`,
`test/abono-cancel-routes.test.ts`, `test/abono-cron.test.ts` y `test/abono-generation.test.ts`
(integración contra el Supabase LOCAL). Tres corridas consecutivas dieron 3, 8 y 7 tests en rojo,
con un conjunto **distinto** cada vez y el mismo total de 863 tests.

**Por qué queda fuera de alcance:** el plan 14-01 solo cambia valores de `className` y una variante
`cva`; ninguna de esas suites renderiza los componentes tocados. Las fallas ya estaban antes del
primer commit del plan (baseline tomado tras la Task 2, con la Task 3 sin escribir). Arreglarlas es
trabajo de estabilización de la infra de tests, no de esta fase de pulido.

**Candidato a:** todo propio / milestone de infra de testing.

## 14-09 — El día de la agenda no tiene afordancia táctil en mobile

**Detectado:** 2026-08-10, en la UAT humana del plan 14-09 (punto 4). **Estado: necesita diseño.**

Palabras del dueño: *"Todo ok. Algo que noté, que hicimos en version desktop, que era que el día de
la agenda se pinte al pasar el mouse para agregar turno en ese día especifico (captura con martes 11
seleccionado), es que en movil no se distingue eso, obviamente porque no hay cursor. Que solucion le
podemos dar para que parezca un boton?"*

**Diagnóstico:** el día de la agenda es un control real —al activarlo se agrega un turno en ese día—
pero su única señal de que es interactivo es el pintado en `hover`. En un dispositivo táctil el
`hover` no existe, así que el control se lee como texto y el dueño no encuentra la afordancia. El
`CLAUDE.md` global lo prohíbe de forma explícita ("Nunca poner hover como único feedback en elementos
interactivos"), y también aplica la regla de touch targets de 44×44px. La solución razonable pasa por
darle una superficie visible de base en mobile (borde/relleno sutil, o un afijo de acción) en vez de
depender de un estado que ese dispositivo nunca alcanza.

**Por qué queda fuera de alcance:** es una **capacidad nueva** —dotar de afordancia táctil a un
control que hoy no la tiene—, no una regresión de POLISH-04/POLISH-05 ni uno de los 3 gaps que
registró `14-VERIFICATION.md`. Además el dueño no pidió un arreglo puntual sino una **propuesta de
solución** ("¿Qué solución le podemos dar para que parezca un botón?"), o sea que arranca por diseño y
no por implementación: meterlo en este plan sería shippear una decisión visual sin discutirla, en un
plan cuyo objetivo era exactamente cerrar gaps de inventario. Toca `agenda-client.tsx`, que este plan
no abre.

**Candidato a:** fase de polish mobile del panel (junto a los ítems de
`panel-mobile-navigation-bugs` y al follow-up de agenda/booking mobile de v0.22).

## 14-09 — La diferencia de color entre los confirm de abonos y de servicios era de ESTADO, no de pantalla

**Detectado:** 2026-08-10, al diagnosticar el punto 3 de la UAT del plan 14-09. **Se registra para no
volver a diagnosticarlo desde cero** — no queda trabajo pendiente de este lado.

Observación del dueño: *"Fijate que en los de abono el color del boton desactivar al confirmar toma al
color del badge de riesgo y no el del tema. En servicios está bien."*

**Diagnóstico completo:** los dos call-sites pasan **los mismos props** (`risk="alto"` +
`destructive`), así que la pantalla no era la variable. La diferencia es de **estado**: el
`ConfirmDialog` de `/servicios` recibe `hideConfirm` cuando el pre-check detecta que el servicio está
bloqueado, y en ese estado `computeFooterLayout()` no dibuja el botón destructivo y promueve el
"Desactivar" secundario a variante `default` —o sea al primario del tema—. Con un servicio **no**
bloqueado, `/servicios` mostraba exactamente el mismo rojo que abonos. No había dos comportamientos:
había un estado que escondía el botón rojo.

**Qué se hizo con eso (no diferido):** el dueño arbitró el alcance "solo el panel del dueño", así que
`confirmButtonClass()` pasó a condicionar la superficie de peligro a que haya un shell activo. En el
**panel** el confirmar destructivo usa ahora el primario del tema en todos los call-sites, con lo cual
el estado bloqueado y el normal se ven consistentes entre sí.

**Lo que queda anotado como decisión, no como deuda:** en el **CRM** el confirmar destructivo **sigue**
compartiendo el rojo con el badge "Alto", por decisión explícita del dueño —aprobó esos modales en el
punto 1 de la misma UAT y ahí el rojo de peligro es el lenguaje del super-admin—. Si en el futuro
alguien reporta esa coincidencia de color como defecto del CRM, hay que releer esta entrada antes de
"arreglarla": revertirla sería desandar una decisión tomada mirando la pantalla.

**Candidato a:** nada. Es documentación de diagnóstico.
