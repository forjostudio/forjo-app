#!/usr/bin/env node
// ── El turno de pantalla ─────────────────────────────────────────────────────────────────────────
// Envuelve un comando pesado (navegador y/o servidor propio) para que corra DE A UNO en esta
// máquina, donde se trabajan varios proyectos a la vez.
//
// Uso:
//   node scripts/con-turno.mjs <comando> [args...]
//   node scripts/con-turno.mjs node .planning/debug/probes/panel-back-stack.mjs
//
// POR QUÉ ESTO EXISTE, medido y no supuesto: dos suites de navegador a la vez se quitan la CPU y las
// dos fallan por tiempos vencidos SIN que haya ningún defecto. En otro proyecto de esta máquina el
// tramo de pantalla tardó 933 s en vez de los 178-336 s habituales. Un puerto propio NO alcanza:
// el puerto evita la colisión de recurso, el turno evita la contención de CPU y disco.
//
// POR QUÉ EN NODE Y NO EN .sh: `bash` en el PATH de Windows puede resolver al bash de WSL
// (`...\WindowsApps\bash.exe`), y dentro de WSL la unidad `D:` no existe, así que la herramienta
// quedaría invisible y el turno se saltearía en silencio — justo en la máquina donde hace falta.
// Acá el bash se ubica a partir de `git --exec-path`, que siempre apunta al Git for Windows real.
//
// LA FUENTE DE LA HERRAMIENTA NO VIVE ACÁ. Este archivo sólo la invoca. El script real está en
// D:\herramientas\turno-pantalla y NO se edita a mano: su fuente vive en el ERP y se instala con
// `npm run turno:instalar`. Un cambio que haga falta es un cambio en el ERP, no acá.

import { spawn, execFileSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { delimiter, dirname, join } from 'node:path'

const HERRAMIENTA = 'D:/herramientas/turno-pantalla/turno-pantalla.sh'

const comando = process.argv.slice(2)
if (comando.length === 0) {
  console.error('con-turno: falta el comando. Uso: node scripts/con-turno.mjs <comando> [args...]')
  process.exit(2)
}

// ── Ubicar el Git Bash de Windows ────────────────────────────────────────────────────────────────
// `git --exec-path` devuelve .../Git/mingw64/libexec/git-core → subiendo tres niveles se llega a la
// raíz de la instalación, donde vive bin/bash.exe. Si git no está o la ruta no tiene esa forma, se
// prueban las ubicaciones habituales. Nunca se usa `bash` del PATH: ahí puede estar el de WSL.
function ubicarBash() {
  const candidatos = []
  try {
    const execPath = execFileSync('git', ['--exec-path'], { encoding: 'utf8' }).trim()
    if (execPath) candidatos.push(join(dirname(dirname(dirname(execPath))), 'bin', 'bash.exe'))
  } catch {
    // git puede no estar en el PATH: no es fatal, quedan los candidatos fijos de abajo.
  }
  for (const base of [process.env.ProgramFiles, process.env['ProgramFiles(x86)'],
                      process.env.LOCALAPPDATA && join(process.env.LOCALAPPDATA, 'Programs')]) {
    if (base) candidatos.push(join(base, 'Git', 'bin', 'bash.exe'))
  }
  return candidatos.find((p) => existsSync(p)) ?? null
}

// ── Resolver el ejecutable del camino directo ────────────────────────────────────────────────────
// Acá NO se usa `shell: true`, y el motivo es un bug que este envoltorio tuvo y se midió: con shell
// los argumentos se CONCATENAN sin escapar, así que `node -e "console.log('x')"` llega partido y el
// comando revienta con un SyntaxError que no tiene nada que ver con la suite. Node lo deprecó por
// eso mismo (DEP0190). Sin shell, cada argumento viaja como su propio argv y el entrecomillado
// sobrevive — que es exactamente cómo se comporta el camino CON turno, donde bash recibe la lista.
//
// El precio de no usar shell en Windows es que `npm`/`npx` son .cmd y `spawn` no los encuentra solo,
// así que se resuelven a mano contra PATH + PATHEXT. En Linux (la CI) se devuelve el comando tal cual.
function resolverEjecutable(cmd) {
  if (process.platform !== 'win32') return cmd
  if (cmd.includes('/') || cmd.includes('\\')) return cmd
  if (/\.(exe|cmd|bat|com)$/i.test(cmd)) return cmd
  const exts = (process.env.PATHEXT ?? '.COM;.EXE;.BAT;.CMD').split(';').filter(Boolean)
  for (const dir of (process.env.PATH ?? '').split(delimiter).filter(Boolean)) {
    for (const ext of exts) {
      const candidato = join(dir, cmd + ext.toLowerCase())
      if (existsSync(candidato)) return candidato
    }
  }
  return cmd // no se encontró: que falle el spawn con su propio mensaje, no con uno inventado acá
}

// ── Decidir si el turno aplica ───────────────────────────────────────────────────────────────────
// Tres motivos para delegar directo, y en los tres se avisa por qué (un salteo silencioso es peor
// que no tener turno: nadie se entera de que no hubo turno):
//   · CI           → un solo trabajo por vez, no hay con quién competir, y el runner es Linux.
//   · no es Windows→ la herramienta es de esta máquina.
//   · falta la herramienta → otra PC, o todavía sin instalar (`npm run turno:instalar` en el ERP).
function motivoDeSalteo() {
  if (process.env.CI) return 'en CI no corre: un solo trabajo por vez, no hay con quién competir'
  if (process.platform !== 'win32') return `la herramienta es de esta máquina (plataforma: ${process.platform})`
  if (!existsSync(HERRAMIENTA)) return `no está instalada en ${HERRAMIENTA} (se instala con 'npm run turno:instalar' en el ERP)`
  return null
}

const motivo = motivoDeSalteo()
const bash = motivo ? null : ubicarBash()
if (!motivo && !bash) {
  // Windows, con la herramienta instalada, pero sin un bash con el que invocarla. Acá NO se saltea
  // en silencio ni se falla: se avisa fuerte y se corre igual, porque frenar el trabajo por no
  // encontrar un bash sería un rojo ambiental, que es el hábito que el turno vino a matar.
  console.error('con-turno: ⚠ la herramienta está instalada pero no se encontró el bash de Git for Windows.')
  console.error('con-turno:   Se corre SIN turno. Si hay otra suite de pantalla corriendo, las dos se van a degradar.')
}

let hijo
if (motivo || !bash) {
  if (motivo) console.log(`turno de pantalla: ${motivo}. Se delega directo.`)
  const ejecutable = resolverEjecutable(comando[0])
  // Node 24 se NIEGA a spawnear un .cmd/.bat sin shell (`EINVAL`, mitigación de CVE-2024-27980), así
  // que ahí no hay alternativa: shell sí. Se limita a ese caso y no se usa para todo, porque con
  // shell los argumentos se concatenan sin escapar y un `-e "console.log('x')"` llegaría partido.
  // `node`, que es lo que esta repo envuelve, es un .exe y cae en el camino limpio.
  // Y con shell hay que entrecomillar el ejecutable a mano: la ruta resuelta de `npm` es
  // `C:\Program Files\nodejs\npm.cmd`, y sin comillas cmd.exe corta en el espacio y se queja de
  // `C:\Program`. Medido: ése fue el segundo bug de este envoltorio.
  const esBatch = /\.(cmd|bat)$/i.test(ejecutable)
  hijo = esBatch
    ? spawn(`"${ejecutable}"`, comando.slice(1), { stdio: 'inherit', shell: true })
    : spawn(ejecutable, comando.slice(1), { stdio: 'inherit' })
} else {
  // La forma la fija el README de la herramienta: `ejecutar -- <comando>`, SIEMPRE `ejecutar` y
  // nunca `tomar` suelto (`tomar` deja un candado cuyo dueño muere al volver el comando). El script
  // toma el turno, instala su `trap`, corre el comando, propaga su código y suelta el turno pase lo
  // que pase — incluido Ctrl+C. Mientras espera imprime un cartel que nombra al dueño.
  hijo = spawn(bash, [HERRAMIENTA, 'ejecutar', '--', ...comando], { stdio: 'inherit' })
}

// ── Señales y código de salida ───────────────────────────────────────────────────────────────────
// Al recibir Ctrl+C NO se sale de una: se reenvía al hijo y se espera a que termine, para que el
// `trap` del script alcance a soltar el turno. Salir antes dejaría el candado tomado por un proceso
// que ya no está (el caso "dueño muerto", que el pedido siguiente tiene que venir a desplazar).
for (const senal of ['SIGINT', 'SIGTERM', 'SIGHUP']) {
  process.on(senal, () => { try { hijo.kill(senal) } catch { /* ya murió: nada que reenviar */ } })
}

hijo.on('error', (e) => {
  console.error(`con-turno: no se pudo arrancar el comando: ${e.message}`)
  process.exit(1)
})

hijo.on('exit', (codigo, senal) => {
  // El código del comando envuelto llega al llamador TAL CUAL: este envoltorio no puede volver
  // verde un rojo ni al revés. Si murió por señal se usa la convención del shell (128 + número),
  // así un Ctrl+C no se confunde con una suite que falló.
  if (senal) {
    const numero = { SIGINT: 2, SIGTERM: 15, SIGHUP: 1 }[senal] ?? 0
    process.exit(128 + numero)
  }
  process.exit(codigo ?? 0)
})
