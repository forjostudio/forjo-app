import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Cuenta suspendida — Forjo',
  robots: { index: false, follow: false },
}

// Página de aterrizaje del dueño de un negocio suspendido (D-06: corte real).
// Vive FUERA del route group (dashboard) a propósito: no hereda el sidebar ni el chrome del
// dashboard. El guard de app/(dashboard)/layout.tsx redirige acá cuando plan_status==='suspended'.
// Server component, sin estado: solo informa y ofrece un canal de contacto con Forjo Studio.
export default function SuspendidoPage() {
  // Contacto de Forjo Studio para reactivación (manual, vía el operador del CRM).
  const contactoEmail = 'hola@forjo.studio'
  const whatsapp = 'https://wa.me/5491100000000'

  return (
    <main className="min-h-screen flex items-center justify-center bg-background px-4 py-12">
      <section className="w-full max-w-md rounded-xl border border-border bg-card p-6 sm:p-8 text-center">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Forjo
        </p>
        <h1 className="mt-3 text-2xl font-semibold text-foreground">
          Tu cuenta está suspendida
        </h1>
        <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
          Tu acceso al panel y tu página de reservas están pausados temporalmente. Contactá a Forjo
          Studio para reactivar tu cuenta.
        </p>

        <div className="mt-6 flex flex-col gap-3">
          <a
            href={`mailto:${contactoEmail}`}
            className="inline-flex h-11 items-center justify-center rounded-md bg-primary px-5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
          >
            Escribir a {contactoEmail}
          </a>
          <a
            href={whatsapp}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex h-11 items-center justify-center rounded-md border border-border px-5 text-sm font-medium text-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
          >
            Contactar por WhatsApp
          </a>
        </div>
      </section>
    </main>
  )
}
