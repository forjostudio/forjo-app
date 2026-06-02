import { createAdminClient } from '@/lib/supabase/admin'
import type { NextRequest } from 'next/server'

export async function GET(request: NextRequest) {
  const auth = request.headers.get('authorization')
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = createAdminClient()

  const { data, error } = await supabase
    .from('appointments')
    .update({ status: 'cancelled' })
    .eq('status', 'pending_payment')
    .lt('expires_at', new Date().toISOString())
    .select('id')

  if (error) {
    console.error('Cron cancel-expired error:', error)
    return Response.json({ error: error.message }, { status: 500 })
  }

  return Response.json({ cancelled: data?.length ?? 0 })
}
