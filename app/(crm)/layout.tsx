import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'

/**
 * Layout-as-guard del CRM super-admin (FND-01).
 *
 * El guard corre SERVER-SIDE y redirige ANTES de retornar cualquier JSX
 * (Pitfall 1: nunca render parcial de UI sensible a un no-admin).
 *
 * `is_admin` se lee de `user.app_metadata` (D1): es propiedad del usuario,
 * no de un negocio. NO se consulta `businesses` ni se usa `.single()` —
 * un operador sin negocio (sin onboarding) haría explotar `.single()` (Pitfall 6),
 * y app_metadata viene en el JWT (no editable por el dueño).
 *
 * Los `redirect()` van FUERA de cualquier try/catch: `redirect` lanza una
 * excepción de control (NEXT_REDIRECT) para cortar la ejecución; dentro de un
 * try la atraparíamos y el guard no cortaría.
 */
export default async function CrmLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  // is_admin desde app_metadata (D1) — sin query a businesses, sin .single().
  if (user.app_metadata?.is_admin !== true) redirect('/dashboard')

  // Subtree del CRM forzado a dark + accent remap, SCOPEADO (D6 / Pitfall 5):
  // `dark` activa los tokens dark locales (vía la variante &:is(.dark *)) sin
  // tocar next-themes global ni PaletteScript; `crm-shell` aplica el accent
  // amarillo. El shell visual completo (CrmSidebar/topbar) lo entrega el plan 03;
  // acá solo el ancla de tema + un <main> mínimo para que rendericen los children.
  // NO se setea data-theme/data-font (heredan el default Forjo) ni PaletteScript (es per-business).
  return (
    <div className="dark crm-shell min-h-screen bg-background text-foreground">
      <main className="min-h-screen">{children}</main>
    </div>
  )
}
