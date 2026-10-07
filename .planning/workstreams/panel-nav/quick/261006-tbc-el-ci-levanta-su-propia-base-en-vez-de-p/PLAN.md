---
quick_id: 261006-tbc
slug: el-ci-levanta-su-propia-base-en-vez-de-p
date: 2026-10-06
type: quick
surface: el workflow de CI
files_modified:
  - .github/workflows/test.yml
---

# El CI levanta su propia base en vez de pegarle a staging

## El diagnóstico, con la evidencia

El CI estuvo **rojo una semana** porque el proyecto de staging se pausó, y al despausarlo siguió rojo:
**5 archivos de 105**, todos de abonos más uno de concurrencia.

**Dos hipótesis de esquema se probaron y se descartaron midiendo contra staging:**
1. Que `book_slot_atomic` fuera una versión vieja → **falso**: tiene el marcador `invalid_duration` de
   la migración 077.
2. Que faltara `businesses.abono_window_weeks` (migr. 055) → **falso**: existe, `integer`, nullable,
   **default 8**, con su constraint `businesses_abono_window_weeks_range`. Y `abonos` tiene todos sus
   checks y los dos triggers.

**La causa real, leída del log del CI y no inferida:**

```
40 tests → Test timed out in 5000ms
 2 tests → Test timed out in 180000ms   ← tres minutos
job completo: 14 minutos (el mismo carril local tarda ~3,5)
```

Un test que no termina en **tres minutos** no tiene un problema de esquema: tiene **latencia**. El
carril `db` usa el `testTimeout` **por defecto de 5s** y corre **en serie**
(`fileParallelism: false`, `vitest.config.mts:53`). Contra una base remota eso no alcanza, y los
síntomas se explican solos: fechas generadas a medias, un contador en 0 porque la fila no llegó, y
`purgeAbonos` fallando al limpiar un test que quedó por la mitad.

⚠ **Staging está sano.** El problema es que el CI dependa de él.

## El cambio

El CI levanta **su propio Supabase dentro del runner** y apunta los tests ahí.

**Por qué esto y no subir los timeouts:** subirlos deja el CI en 14 minutos, frágil, y **acoplado a una
instancia externa que se pausa sola** — que es lo que ya costó una semana en rojo. Además enmascara
lentitud real en vez de mostrarla.

**Tres cosas que se ganan**, además de sacar la latencia:
1. **Las migraciones se validan en cada push.** Hoy **nadie** verifica que apliquen limpias desde cero;
   `supabase start` las corre todas sobre una base vacía.
2. **Los PRs desde forks pasan a correr la suite completa.** Hoy se saltean los tests de aislamiento
   porque GitHub no les expone los secrets (el "skip graceful" que documenta el encabezado del
   workflow). Con la base local **no hacen falta secrets**.
3. **Staging queda liberado para lo que sirve**: probar con datos parecidos a producción antes de
   deployar, no ser el motor de los tests.

## Task 1 — El workflow

- Instalar el CLI de Supabase y correr `supabase start` antes de los tests; apuntar
  `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` y `SUPABASE_SERVICE_ROLE_KEY` a esa
  instancia. ⚠ **Leé las claves de la salida del CLI** (`supabase status`), no las hardcodees.
- `MP_WEBHOOK_SECRET` **sigue viniendo de los secrets**: no sale de la base.
- ⚠ **Actualizá el encabezado del workflow.** Hoy explica el "skip graceful" por falta de secrets, que
  con este cambio deja de aplicar. Un comentario que miente es peor que no tenerlo.
- Dejá escrito **por qué** el CI no usa staging, con los números del diagnóstico: el próximo que vea
  esto tiene que entender que fue una decisión medida, no una preferencia.

### Lo que NO hay que tocar

- ⚠ **El typecheck está BIEN.** Se sospechaba que `npx tsc` siempre salía 0 (hay una nota en el
  proyecto), pero **se midió**: con un error de tipos inyectado a propósito, `npx tsc --noEmit` salió
  con **rc=2** y lo reportó. La trampa documentada es específica de worktrees con junction, no
  universal. **No lo cambies.**
- **No** toques `vitest.config.mts`: los timeouts por defecto están bien contra una base local (es lo
  que usamos todos los días).
- **No** borres los secrets del repo: staging sigue existiendo para su propio uso.

## Verificación

⚠ **Esto no se puede verificar localmente: se verifica en el CI.** El criterio es la corrida real.

- El job tiene que terminar **en verde**, con **105 archivos** y ~**1619 tests**.
- Tiene que tardar **bastante menos de 14 minutos** (lo de hoy). Si tarda parecido, el arranque de
  Supabase se comió la ganancia y hay que mirar qué servicios levanta.
- ⚠ **Dos canarios de reloj fallan a propósito fuera de `[01:00, 23:30]` hora AR** y lo anuncian en su
  mensaje. El runner corre en **UTC**: tenelo en cuenta al leer un rojo.
- `supabase/config.toml` ya tiene **studio, storage y analytics apagados**, así que el arranque es más
  liviano de lo normal. No los prendas.

## Fuera de alcance

- Los 5 tests que fallaban: **no se arreglan, desaparecen** — eran latencia. Si alguno sigue rojo con
  la base local, **eso sí es un bug real** y se trata aparte.
- Deployar o tocar staging.
