'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { toast } from 'sonner'
import { createClient } from '@/lib/supabase/client'
import { CheckYourEmail } from '@/components/auth/check-your-email'
import { GoogleButton } from '@/components/auth/google-button'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { PasswordInput } from '@/components/ui/password-input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

const schema = z.object({
  email: z.string().email('Email inválido'),
  password: z.string().min(6, 'Mínimo 6 caracteres'),
  confirmPassword: z.string(),
}).refine((d) => d.password === d.confirmPassword, {
  message: 'Las contraseñas no coinciden',
  path: ['confirmPassword'],
})

type FormData = z.infer<typeof schema>

export default function RegisterPage() {
  const [loading, setLoading] = useState(false)
  // La dirección a la que salió el mail de confirmación. Mientras es null se ve el form; cuando
  // tiene valor, el card pasa al estado "revisá tu mail" (D-12).
  const [sent, setSent] = useState<string | null>(null)
  const supabase = createClient()

  const { register, handleSubmit, formState: { errors } } = useForm<FormData>({
    resolver: zodResolver(schema),
  })

  // Capture intended plan from landing CTAs (?plan=basic|studio|pro)
  useEffect(() => {
    const plan = new URLSearchParams(window.location.search).get('plan')
    if (plan && ['basic', 'studio', 'pro'].includes(plan)) {
      localStorage.setItem('forjo_intended_plan', plan)
    }
  }, [])

  // Con enable_confirmations ON (verificado en prod: mailer_autoconfirm = false), signUp NO devuelve
  // sesión: crea el usuario y manda el mail, nada más. Por eso el alta termina acá, en un estado
  // "revisá tu mail", y NO en una navegación: mandar al usuario recién registrado a una ruta
  // protegida lo hacía rebotar al login (el proxy no encuentra sesión y redirige), después de
  // felicitarlo por una cuenta que todavía no podía usar. Eso es lo que arregla AUTH-06.
  //
  // Un mail YA registrado devuelve el mismo shape que uno nuevo, y la UI lo muestra igual A PROPÓSITO
  // (D-14): si el alta distinguiera los dos casos, sería un oráculo para averiguar quién tiene cuenta
  // en Forjo probando direcciones ajenas (user enumeration). El toast de la rama de error se queda
  // porque cubre errores de forma (contraseña débil, mail inválido, rate limit), no de existencia.
  //
  // No se pasa `options`: el destino del link lo fija el template del mail con {{ .SiteURL }}, así que
  // un valor mandado desde el cliente se ignora — y no hay superficie que un atacante pueda apuntar.
  async function onSubmit(data: FormData) {
    setLoading(true)
    const { error } = await supabase.auth.signUp({
      email: data.email,
      password: data.password,
    })
    // D-14 (anti-enumeration): un mail YA registrado NO puede distinguirse de uno nuevo, o el alta se
    // vuelve un oráculo de quién tiene cuenta en Forjo. GoTrue NO ofusca: devuelve 422 con
    // error.code === 'user_already_exists' (verificado contra el GoTrue local). Por eso la garantía la
    // hace ESTRUCTURAL este código — no la respuesta del backend: ese caso se trata idéntico a un alta
    // nueva (misma pantalla "revisá tu mail", sin revelar nada). Se detecta por error.code, no por el
    // .message, que es texto en inglés y cambia según locale/versión. El toast queda SOLO para errores
    // de forma (contraseña débil, mail inválido, rate limit): esos no filtran existencia de cuenta.
    if (error && error.code !== 'user_already_exists') {
      toast.error(error.message)
      setLoading(false)
      return
    }
    setSent(data.email)
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          {/* Par tinta/crema con swap: el fondo acá es temático (bg-background), claro u oscuro según
              el tema. El nombre accesible del h1 lo aporta el alt de la imagen visible; la variante
              oculta usa display:none, así que sale del árbol de accesibilidad y no duplica el texto. */}
          <h1 className="flex items-center justify-center">
            <Image src="/brand/forjo-gestion-lockup-tinta.png" alt="Forjo Gestión" width={781} height={190} priority className="h-10 w-auto dark:hidden" />
            <Image src="/brand/forjo-gestion-lockup-crema.png" alt="Forjo Gestión" width={781} height={190} priority className="hidden h-10 w-auto dark:block" />
          </h1>
          <p className="text-muted-foreground mt-1">Creá tu negocio en minutos</p>
        </div>
        <Card>
          {/* D-12: se reemplaza el CONTENIDO del card, no la página. El card centrado y el lockup de
              arriba se conservan tal cual (D-10: /register no se mueve al split ni se rediseña). En
              este estado el CardHeader no se renderiza: el título lo pone CheckYourEmail. */}
          {sent !== null ? (
            <CardContent>
              <CheckYourEmail
                email={sent}
                title="Revisá tu mail"
                // h2 y no h1: el lockup de arriba (el h1 de esta página) está fuera de este ternario
                // y se renderiza igual en este estado. Con el default h1 quedaban dos h1 en /register.
                headingLevel="h2"
                description={<>Te mandamos un mail a <strong>{sent}</strong>. Confirmá tu cuenta para entrar.</>}
                // El resultado se descarta a propósito: mostrar un error acá reintroduciría el
                // oráculo de enumeration que D-14 cierra en el submit.
                onResend={async () => {
                  await supabase.auth.resend({ type: 'signup', email: sent })
                }}
              >
                <p className="text-center text-sm text-muted-foreground mt-4">
                  <Link href="/login" className="text-primary hover:underline">
                    Volver al login
                  </Link>
                </p>
              </CheckYourEmail>
            </CardContent>
          ) : (
          <>
          <CardHeader>
            <CardTitle>Crear cuenta</CardTitle>
            <CardDescription>Empezá gratis, sin tarjeta de crédito</CardDescription>
          </CardHeader>
          <CardContent>
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
              <div className="space-y-2">
                <Label htmlFor="password">Contraseña</Label>
                <PasswordInput
                  id="password"
                  placeholder="••••••••"
                  {...register('password')}
                />
                {errors.password && (
                  <p className="text-destructive text-sm">{errors.password.message}</p>
                )}
              </div>
              <div className="space-y-2">
                <Label htmlFor="confirmPassword">Confirmar contraseña</Label>
                <PasswordInput
                  id="confirmPassword"
                  placeholder="••••••••"
                  {...register('confirmPassword')}
                />
                {errors.confirmPassword && (
                  <p className="text-destructive text-sm">{errors.confirmPassword.message}</p>
                )}
              </div>
              <Button type="submit" className="w-full" disabled={loading}>
                {loading ? 'Creando cuenta...' : 'Crear cuenta gratis'}
              </Button>
            </form>
            {/* Botón de Google solo en el estado del form (sent === null): en "revisá tu mail" el usuario
                ya se registró por email. Mismo divisor que /login, pero el chip de la "o" usa bg-card
                (la superficie de este Card de shadcn) en vez de bg-background, para cortar la línea por
                detrás del texto. El aviso de ?error=oauth NO va acá: el callback manda el error a
                /login?error=oauth, una sola superficie de error (D-08). */}
            <div className="relative my-4">
              <div className="absolute inset-0 flex items-center" aria-hidden="true">
                <span className="w-full border-t border-border" />
              </div>
              <div className="relative flex justify-center">
                <span className="bg-card px-2 text-xs text-muted-foreground">o</span>
              </div>
            </div>
            <GoogleButton />
            <p className="text-center text-sm text-muted-foreground mt-4">
              ¿Ya tenés cuenta?{' '}
              <Link href="/login" className="text-primary hover:underline">
                Iniciar sesión
              </Link>
            </p>
          </CardContent>
          </>
          )}
        </Card>
      </div>
    </div>
  )
}
