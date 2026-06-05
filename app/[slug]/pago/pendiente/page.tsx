import Link from 'next/link'
import { Clock } from 'lucide-react'

interface Props {
  params: Promise<{ slug: string }>
}

export default async function PagoPendiente({ params }: Props) {
  const { slug } = await params

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-background text-foreground">
      <div className="text-center max-w-sm">
        <div className="w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4 bg-[#f4c543]/20">
          <Clock className="w-8 h-8 text-[#9a7d1a]" />
        </div>
        <h1 className="text-2xl font-bold mb-2 font-[family-name:var(--font-heading)]">Pago en proceso</h1>
        <p className="text-muted-foreground mb-6">
          Tu pago está siendo procesado. Te notificaremos cuando se acredite.
        </p>
        <Link
          href={`/${slug}`}
          className="text-sm text-muted-foreground hover:text-foreground transition-colors underline"
        >
          Volver al inicio
        </Link>
      </div>
    </div>
  )
}
