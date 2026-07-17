'use client'

import { useState, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/client'
import { CheckYourEmail } from '@/components/auth/check-your-email'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

// Pedido del link de recuperación (AUTH-01). El split Bauhaus lo aporta el layout del route group
// (split) — esta página arranca directo en el h1 y solo aporta su form (D-07/D-08).
//
// Esta pantalla tiene DOS estados en el mismo card (D-02): el form, y "revisá tu mail" una vez pedido
// el link. No se navega a otra pantalla ni se tira un aviso flotante: el usuario no puede quedar frente
// a un form que invita a reenviar en loop.

const schema = z.object({
  email: z.string().email('Email inválido'),
})

type FormData = z.infer<typeof schema>

// D-18: /auth/callback manda acá TODO fallo de link (vencido, ya usado, o entrada directa a
// /reset-password sin sesión) con ?error=invalid_link — el destino vive en INVALID_LINK_DEST.
//
// Vive en su propio componente por el boundary de Suspense de abajo: así el que se suspende es el
// aviso y NO el form, que se sigue prerenderizando. role="status" y no role="alert": al llegar acá
// esto no interrumpe nada, es el estado de la pantalla. Sin text-destructive a full — es información,
// no un error del usuario.
function InvalidLinkNotice() {
  const params = useSearchParams()
  if (params.get('error') !== 'invalid_link') return null
  return (
    <div role="status" className="border border-border bg-muted text-muted-foreground rounded-md px-3 py-2 text-sm mb-6">
      Ese link ya venció o ya se usó. Pedí uno nuevo.
    </div>
  )
}

export default function ForgotPasswordPage() {
  const [loading, setLoading] = useState(false)
  // Guarda el mail al que se mandó el link. `null` = todavía estamos en el form.
  const [sent, setSent] = useState<string | null>(null)
  const supabase = createClient()

  const { register, handleSubmit, formState: { errors } } = useForm<FormData>({
    resolver: zodResolver(schema),
  })

  // ⚠ NO agregar acá una rama que dependa del resultado de la llamada de abajo. El resultado se
  // DESCARTA a propósito y `setSent` corre SIEMPRE: exista o no la cuenta, la pantalla es idéntica
  // (D-02, D-14). Cualquier rama que distinga los dos casos — mostrar el fallo, cambiar el copy,
  // frenar antes de `setSent` — convierte este flujo en un oráculo de quién tiene cuenta en Forjo:
  // cualquiera averigua el mail de otro probando direcciones. No es un olvido, es la mitigación.
  //
  // Tampoco se le pasa un destino de retorno: el href del mail lo arma el template del proyecto de
  // Supabase con {{ .SiteURL }}, así que lo que mande el navegador se ignora — sería código muerto que
  // encima reintroduce un valor controlable desde el cliente en la superficie donde un agujero entrega
  // cuentas enteras.
  async function onSubmit(data: FormData) {
    setLoading(true)
    await supabase.auth.resetPasswordForEmail(data.email)
    setSent(data.email)
    setLoading(false)
  }

  // Mismo criterio que el submit: el resultado no se mira. El cooldown de 60s lo maneja CheckYourEmail.
  async function handleResend() {
    if (!sent) return
    await supabase.auth.resetPasswordForEmail(sent)
  }

  if (sent !== null) {
    return (
      <CheckYourEmail
        email={sent}
        title="Revisá tu mail"
        // "Si hay una cuenta con..." es deliberado: es idéntico exista o no la cuenta (D-02) y además
        // es honesto — no afirma que mandamos un mail que quizá no mandamos. "1 hora" sale de D-19
        // (otp_expiry = 3600, que no se toca).
        description={
          <>
            Si hay una cuenta con <strong>{sent}</strong>, te va a llegar un link para crear una
            contraseña nueva. El link vence en 1 hora.
          </>
        }
        onResend={handleResend}
      >
        <p className="text-center text-sm mt-5">
          <Link href="/login" className="text-primary hover:underline inline-block py-2">
            Volver al login
          </Link>
        </p>
      </CheckYourEmail>
    )
  }

  return (
    <>
      <h1 className="font-[family-name:var(--font-heading)] text-2xl font-bold">Recuperá tu cuenta</h1>
      <p className="text-muted-foreground text-sm mt-1.5 mb-6">Te mandamos un link para crear una contraseña nueva</p>
      {/* El aviso y el campo Email conviven en la misma pantalla: el error y su solución en un click
          (D-18). El boundary es obligatorio: en el build de producción, un client component estático
          que lee search params falla el build sin él (verificado en los docs locales de Next 16,
          use-search-params.md:179 — no se asumió la API de Next 14). fallback={null} sigue el
          precedente de (dashboard)/layout.tsx:45. */}
      <Suspense fallback={null}>
        <InvalidLinkNotice />
      </Suspense>
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="email">Email</Label>
          <Input
            id="email"
            type="email"
            placeholder="tu@email.com"
            {...register('email')}
          />
          {errors.email && (
            <p className="text-destructive text-sm">{errors.email.message}</p>
          )}
        </div>
        <Button type="submit" className="w-full" disabled={loading}>
          {loading ? 'Enviando...' : 'Enviar link'}
        </Button>
      </form>
      {/* Salida al login. El copy que D-02 fija al pie del estado enviado vive una sola vez, allá
          arriba; acá el usuario todavía no pidió nada, así que el link nombra la acción a la que
          vuelve en vez de repetir esa frase. */}
      <p className="text-center text-sm mt-2">
        <Link href="/login" className="text-primary hover:underline inline-block py-2">
          Volver a iniciar sesión
        </Link>
      </p>
    </>
  )
}
