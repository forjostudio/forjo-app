---
audit_acknowledged:
  milestone: v0.31
  at: 2026-11-19
  gap_snapshot: "unknown::scenarios=0"
---

# Phase 4 — UAT en el teléfono y en producción

El guion está en `04-UAT-GUION.md` (misma carpeta): bloques 0 a 9, 30 recorridos, cada uno con «Pasa si» y
«Falla si». Cómo se anota cada fila y qué cierra cada requisito: bloque 9 del guion. Lo que se vio va textual,
sin reinterpretar.

## Fecha, motor y commit desplegado

fecha: 2026-11-17
motores: Android Chrome 157.0.8103.78 · iPhone Safari 18.7.8 · Escritorio Chrome (versión no anotada)
commit desplegado: 974a131

## Resultados

| Recorrido | Motor | Resultado | Lo que se vio |
|---|---|---|---|
| 1.1 | Android Chrome | ✅ | dueño: «pass» |
| 1.2 | Android Chrome | ✅ | dueño: «pass» |
| 1.3 | Android Chrome | ✅ | dueño: «pasa» |
| 1.4 | Android Chrome | ✅ | dueño: «pasa» |
| 2.1 | Android Chrome | ✅ | dueño: «Pasa» |
| 2.2 | Escritorio Chrome | ✅ | dueño: «2.2 pasa» (a y b; b = el residuo C-5 declarado) |
| 2.3 | Escritorio Chrome | ✅ | dueño: «Pasa» (con obs-1 también en escritorio) |
| 3.1 | Android Chrome | ✅ | abrió en Cobros («Si»); «El atrás directamente me sacó del sistema» (pestaña nueva: sale sin pasar por Datos, D-03) |
| 3.2 | Android Chrome | ✅ | dueño: «Pasa» (con obs-1 también al tocar Egresos) |
| 3.3 | Android Chrome | ✅ | dueño: «pasa» |
| 3.4 | Android Chrome | ✅ | (a) «pasa»; (b) primera anotación «me sacó del sitio» CORREGIDA por el dueño: «Mala mía, hice atrás con el gesto. Con volver me dejo en la lista de clientes» |
| 4.1 | Android Chrome | ⚠ | no corrible: «No pude cancelar y ver el toast porque al hacer el reconocimiento facial ya me acepta directamente, no pasa por los permisos» |
| 4.2 | Android Chrome | ✅ | negocio de prueba («Es de prueba, no hay reales»); desconectar → conectar (MP volvió sin mostrar su pantalla, obs-2): «/negocio?tab=integraciones», toast «Apareció una vez», «la tarjeta dice Conectado» |
| 4.3 | Android Chrome | ✅ | dueño: «pass» |
| 4.4 | Android Chrome | ✅ | dueño: «pasa» |
| 5.1 | Android Chrome | ✅ | dueño: «pasa» |
| 5.2 | Android Chrome | ✅ | dueño: «pasa» |
| 5.3 | Android Chrome | ✅ | dueño: «pasa» |
| 6.1 | Android Chrome | ✅ | dueño: «pasa» |
| 6.2 | Android Chrome | ✅ | dueño: «pasa» |
| 6.3 | Android Chrome | ✅ | dueño: «pasa» |
| 7.1 | Android Chrome | ✅ | dueño: «pasa» |
| 7.2 | Android Chrome | ✅ | dueño: «pasa» |
| 7.3 | Android Chrome | ✅ | dueño: «pasa» |
| 7.4 | Android Chrome | ✅ | dueño: «pasa» |
| 8.1 | iPhone Safari | ✅ | dueño: «pasa» |
| 8.2 | iPhone Safari | ✅ | dueño: «pasa» (no reportó el scroll de obs-1 en Safari) |
| 8.3 | iPhone Safari | ✅ | «Abre en cobros. No tengo gesto de atras en IOS, no te saca de la pantalla ni se puede ir hacia atras con el navegador, asi que pasa» (pestaña nueva sin historial: no hay Datos fabricado debajo). Aclaración: «Uso el atrás, pero cuando pego directamente una URL en pestaña nueva aparece deshabilitado» |
| 8.4 | iPhone Safari | ✅ | dueño: «Pasa la 8.4» (atrás con el botón de Safari) |
| 8.5 | iPhone Safari | ⚠ | no corrido: «Esta no la voy a hacer» (mismo obstáculo que el 4.1: MP acepta directo con el reconocimiento facial) |

## Observaciones fuera del «pasa si»

- **obs-1 (Android Chrome, durante el 2.1; el dueño dice que lo notó «antes y ahora»):** «Al entrar la
  primera vez por nueva pestaña, cuando voy a finanzas>ventas, el primer tacto hace un scroll hacia el inicio
  de la página, después no pasa mas». Aclaración del dueño: el «antes» es el 1.3 de esta misma UAT (también
  fue a Finanzas), es decir, ya con el código desplegado (974a131); no dijo haberlo visto antes del deploy. **También en escritorio (2.3):** «Acá está el mismo scroll hacia el
  inicio de la página la primer vez que tocas Ventas». Acotado por el dueño: «Lo del scroll es solo en
  Finanzas>Ventas» (no en los tabs de Negocio ni de Configuración). Y en el 3.2: «tambien tocando Egresos está
  ese scroll, es algo de Finanzas» ⇒ el primer toque de un tab de Finanzas (Ventas o Egresos) scrollea al
  inicio; los demás grupos no. Sin diagnosticar; entra como gap a evaluar en `/gsd-verify-work`.
- **obs-2 (Android Chrome, al ir al bloque 4):** «al desconectar la cuenta y volver a conectarla, conecta
  direcamente, no pasa por mercadopago». Sin diagnosticar; hipótesis a confirmar: MercadoPago saltea su
  pantalla de consentimiento cuando la cuenta ya autorizó la app y hay sesión abierta (comportamiento de MP,
  no del panel).
- **obs-3 (Android Chrome, 4.1/4.2):** «tampoco me cierra que no me lleve a la app movil, lo hace por una
  web». El OAuth de MercadoPago abre la web de MP en vez de la app de MP. Fuera del alcance de la fase (no es
  navegación del panel); queda como idea a evaluar aparte.
