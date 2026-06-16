// Re-setup de los preapproval_plan de MercadoPago — reemplaza al endpoint web
// borrado `app/api/admin/setup-plans/route.ts` (D-01). Ese endpoint aceptaba el
// admin-secret por query string (`?secret=`), que quedaba en logs de acceso de
// Vercel, historial del browser, proxies y headers Referer. La transferencia segura
// es ejecutar esta lógica a mano, localmente, con los secretos de MP en el entorno:
// el script corre en Node fuera del runtime web, así que NO necesita ni tiene auth.
//
// Qué hace: crea/recrea los 3 preapproval_plan (Básico/Estudio/Pro) en MercadoPago
// usando el token de plataforma de Forjo. Respeta `MP_MODE` (y el sufijo `_TEST` de
// las env vars) reusando `mpFetch`/`MP_MODE` de @/lib/mercadopago y `SUBSCRIPTION_PLANS`
// de @/lib/subscription-plans (no duplica la lógica de MP). NO escribe `plan_status`
// ni toca la DB — solo crea planes en MP e imprime los IDs.
//
// Uso: `npm install` (instala tsx) y luego `npm run setup:mp-plans` con los secretos
// de MP cargados (`.env.local` o exportados). Copiá los IDs que imprime a las env vars
// de Vercel y volvé a desplegar.

import { mpFetch, MP_MODE } from '@/lib/mercadopago'
import { SUBSCRIPTION_PLANS } from '@/lib/subscription-plans'

const BACK_URL = (process.env.NEXT_PUBLIC_APP_URL || 'https://gestion.forjo.studio') + '/dashboard'
const SUFFIX = MP_MODE === 'test' ? '_TEST' : ''
const ENV_KEYS: Record<string, string> = {
  basic: `MP_PLAN_BASIC_ID${SUFFIX}`,
  studio: `MP_PLAN_STUDIO_ID${SUFFIX}`,
  pro: `MP_PLAN_PRO_ID${SUFFIX}`,
}

async function main() {
  console.log(`MercadoPago — creando preapproval_plan en modo ${MP_MODE}\n`)

  for (const [key, plan] of Object.entries(SUBSCRIPTION_PLANS)) {
    const res = await mpFetch('/preapproval_plan', {
      method: 'POST',
      body: JSON.stringify({
        reason: `Forjo Gestión — Plan ${plan.name}`,
        auto_recurring: {
          frequency: 1,
          frequency_type: 'months',
          transaction_amount: plan.price_ars,
          currency_id: 'ARS',
        },
        back_url: BACK_URL,
      }),
    })

    if (res.id) {
      console.log(`✓ ${plan.name} (${key}): ${res.id}  →  copiar a ${ENV_KEYS[key]}`)
    } else {
      console.error(`✗ ${plan.name} (${key}): error — ${res.message || JSON.stringify(res)}`)
    }
  }

  console.log('\nCopiá estos IDs en Vercel como variables de entorno y volvé a desplegar')
}

main().catch((e) => {
  console.error('[setup-mp-plans] falló:', e instanceof Error ? e.message : e)
  process.exitCode = 1
})
