<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->


# Las pruebas de pantalla pasan por el turno

En esta máquina se trabajan **varios proyectos a la vez**. Cuando dos corren pruebas de navegador al
mismo tiempo —Playwright, Vitest en modo navegador, o cualquier cosa que levante Chrome o un servidor
para probar— se quitan la CPU y las dos corridas **fallan por tiempos vencidos sin que haya ningún
defecto**.

**Está medido, no supuesto:** en otro proyecto de esta máquina el tramo de pantalla tarda **178-336 s**
normalmente y tardó **933 s** con dos suites a la vez. Y dos suites en **puertos distintos se degradan
igual**: el puerto propio evita la colisión de recurso, el turno evita la contención de CPU y disco.
Tener puerto propio **no** exime del turno.

Por eso todo comando que levante un navegador o un servidor para probar se envuelve:

```bash
node scripts/con-turno.mjs <comando>
# p. ej. la sonda de la pila del botón atrás:
node scripts/con-turno.mjs node .planning/debug/probes/panel-back-stack.mjs
```

**Qué queda afuera, y por qué:** las unitarias sin navegador (`npm test`, que corre `vitest` con
`environment: 'node'`), el build, el lint y el chequeo de tipos. Tampoco entra el carril `db` de
vitest: pega contra el Supabase local por Docker, pero no levanta navegador ni servidor de Next, y es
lo que corre la CI.

**Si el turno está ocupado, el comando espera** e imprime un cartel que nombra al dueño (proyecto,
PID, comando y desde cuándo), y lo reimprime cada tanto. **Una espera no es un cuelgue ni un rojo.**
Para ver de quién es o destrabarlo a mano:

```bash
bash D:/herramientas/turno-pantalla/turno-pantalla.sh estado
bash D:/herramientas/turno-pantalla/turno-pantalla.sh liberar
```

**Se saltea solo** —con un aviso impreso, nunca en silencio— en CI, fuera de Windows, o si la
herramienta no está instalada. La CI no la necesita: corre un solo trabajo por vez y el runner es
Linux.

**La herramienta no vive en este repo y no se edita a mano.** `scripts/con-turno.mjs` sólo la invoca;
el script real está en `D:/herramientas/turno-pantalla`, su fuente vive en el ERP y se instala con
`npm run turno:instalar`. Un cambio que haga falta es un cambio en el ERP, no acá.
