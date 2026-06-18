// Bootstrap local de is_admin (D2 — "las llaves del reino", §7 Out of Scope del milestone).
//
// POR QUÉ es un script local y NO un endpoint web / self-serve:
// otorgar is_admin es la elevación de privilegio más sensible de toda la plataforma — quien lo
// tiene entra al CRM super-admin (suspender negocios, editar precios, impersonar). Ese poder NO
// puede concederse desde el runtime web: un endpoint, por más protegido que esté, es superficie de
// ataque y de error humano. La transferencia segura es a mano, localmente, con el service-role en
// el entorno: este script corre en Node FUERA del runtime web, así que no necesita ni tiene auth.
// Cuando exista una acción de "otorgar admin" dentro del panel, se auditará (FND-02) — fuera de
// scope de Phase 1.
//
// QUÉ hace: setea `app_metadata.is_admin = true` en un usuario de Supabase Auth vía la Admin API
// (`supabase.auth.admin.updateUserById`). NO es un UPDATE SQL ni una columna en `businesses`
// (D1/D2): el flag vive en `app_metadata` (no editable por el propio usuario, viaja en el JWT).
//
// USO (local, con .env.local cargado):
//   npm run setup:admin -- <email-del-operador>
//   npm run setup:admin -- <user-uuid>
// Acepta también la env var ADMIN_TARGET=<email|uuid> si preferís no pasar el arg por CLI.

import { config } from 'dotenv'
import { createClient } from '@supabase/supabase-js'

// Vitest/Next cargan .env.local solos; un script suelto bajo tsx NO. Lo cargamos con dotenv
// (ya disponible transitivamente — cero deps nuevas, igual que vitest.setup.ts) para que el
// service-role esté en el entorno sin obligar a recordar `node --env-file` en PowerShell.
config({ path: '.env.local' })

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

async function main() {
  // El arg viene después de `--` en `npm run setup:admin -- <target>`; o por env var.
  const target = (process.argv[2] || process.env.ADMIN_TARGET || '').trim()
  if (!target) {
    console.error('[setup-admin] falta el destinatario. Uso: npm run setup:admin -- <email|user-uuid>')
    process.exitCode = 1
    return
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !serviceKey) {
    console.error(
      '[setup-admin] faltan credenciales en el entorno: ' +
        'NEXT_PUBLIC_SUPABASE_URL y/o SUPABASE_SERVICE_ROLE_KEY. ' +
        'Corré el script localmente con .env.local cargado.'
    )
    process.exitCode = 1
    return
  }

  // Client service-role explícito (bypassa RLS, admin API). Sin sesión persistida ni refresh:
  // es un proceso de un solo disparo.
  const supabase = createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  // Resolver el userId: si el target es un UUID, usarlo directo; si es email, buscarlo.
  let userId = target
  let resolvedEmail: string | undefined

  if (!UUID_RE.test(target)) {
    // Buscar por email vía la Admin API (paginado; recorremos hasta encontrarlo).
    const needle = target.toLowerCase()
    let page = 1
    let found: { id: string; email?: string } | undefined
    // perPage máximo razonable; cortamos cuando una página vuelve vacía.
    for (;;) {
      const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 200 })
      if (error) {
        console.error('[setup-admin] no se pudo listar usuarios:', error.message)
        process.exitCode = 1
        return
      }
      const match = data.users.find((u) => (u.email || '').toLowerCase() === needle)
      if (match) {
        found = { id: match.id, email: match.email ?? undefined }
        break
      }
      if (data.users.length < 200) break // última página
      page += 1
    }

    if (!found) {
      console.error(`[setup-admin] no existe ningún usuario con email "${target}".`)
      process.exitCode = 1
      return
    }
    userId = found.id
    resolvedEmail = found.email
  }

  const { data, error } = await supabase.auth.admin.updateUserById(userId, {
    app_metadata: { is_admin: true },
  })

  if (error) {
    console.error('[setup-admin] updateUserById falló:', error.message)
    process.exitCode = 1
    return
  }

  const who = resolvedEmail || data.user?.email || userId
  console.log(`✓ is_admin = true seteado en app_metadata de ${who} (id: ${userId}).`)
  console.log('  El usuario ya puede entrar al CRM (/admin). El flag viaja en el JWT.')
}

main().catch((e) => {
  console.error('[setup-admin] falló:', e instanceof Error ? e.message : e)
  process.exitCode = 1
})
