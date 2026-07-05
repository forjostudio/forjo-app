import { ChevronDown } from 'lucide-react'
import { PageEyebrow } from '@/components/dashboard/page-eyebrow'

// FAQ estática (HELP-01, D-08): el contenido vive versionado en git como un array TS local,
// NO en Supabase ni MDX. Editar la ayuda = editar este array y commitear. Sin fetch, sin datos
// de tenant: la página queda protegida por el layout del route group (dashboard) pero no lee
// nada del negocio. Draft inicial de 7 preguntas (D-09): Claude redacta, el usuario revisa/ajusta.
const FAQ: { pregunta: string; respuesta: string }[] = [
  {
    pregunta: '¿Cómo creo un turno?',
    respuesta:
      'Entrá a Agenda → Turnos y tocá "Nuevo turno". Elegí el cliente, el servicio y el horario libre que quieras. Tus clientes también pueden reservar solos desde tu página pública de reservas, y esos turnos aparecen automáticamente en la misma agenda.',
  },
  {
    pregunta: '¿Cómo cargo mis servicios / prestaciones?',
    respuesta:
      'Andá a Gestión → Servicios y tocá "Agregar". Definí el nombre, la duración y el precio de cada prestación. Esos servicios son los que después elegís al crear un turno y los que ve tu cliente al reservar.',
  },
  {
    pregunta: '¿Cómo agrego a mi equipo / profesionales?',
    respuesta:
      'Desde Gestión → Equipo sumás a cada profesional que atiende. Cargá su nombre y, si querés, su horario propio. Al reservar, el cliente puede elegir con quién se atiende y cada profesional tiene su propia agenda.',
  },
  {
    pregunta: '¿Cómo configuro mis consultorios / locales?',
    respuesta:
      'Entrá a Gestión → Consultorios para dar de alta cada local o espacio donde atendés. Podés tener más de uno y asignar turnos a cada uno. Esto mantiene tu agenda ordenada cuando trabajás en varios lugares.',
  },
  {
    pregunta: '¿Cómo cobro una seña? / ¿Cómo conecto MercadoPago?',
    respuesta:
      'Primero conectá tu cuenta desde Negocio → Integraciones (ahí vinculás MercadoPago con un clic). Después, en Negocio → Cobros activás la seña y definís el monto. Con eso, tus clientes pagan una seña al reservar y el turno se confirma solo cuando el pago se aprueba.',
  },
  {
    pregunta: '¿Cómo comparto mi página pública de reservas?',
    respuesta:
      'Tu página vive en tu link público (forjo.studio/tu-negocio) y la abrís desde "Ver mi página" en el menú lateral. Copiá ese link y compartilo por WhatsApp, Instagram o donde quieras. Cualquiera que entre puede reservar sin necesidad de crear una cuenta.',
  },
  {
    pregunta: '¿Qué es el rubro y qué cambia según el mío?',
    respuesta:
      'El rubro es el tipo de negocio que elegiste (por ejemplo salud, belleza o canchas). Según tu rubro, la app adapta los nombres y las secciones: hablás de "pacientes" o "clientes", de "servicios" o "prestaciones", y aparecen solo las opciones que tienen sentido para vos. Si te equivocaste de rubro, escribinos y lo ajustamos.',
  },
]

export default function AyudaPage() {
  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <PageEyebrow label="Ayuda" />
        <h1 className="text-2xl font-bold mt-2 font-[family-name:var(--font-heading)]">Ayuda</h1>
        <p className="text-sm text-muted-foreground mt-1">Cómo usar Forjo Gestión</p>
      </div>

      {/* Disclosure nativo <details>/<summary> (UI-SPEC §C): zero-install, sin shadcn Accordion ni
          @radix-ui/react-accordion. Cada <details> es independiente (sin name compartido), así que
          pueden quedar varios abiertos a la vez. El teclado (Enter/Space en el summary) y la
          semántica de disclosure son nativos — no se overridean. */}
      <div className="rounded-lg border border-border divide-y divide-border">
        {FAQ.map((item, i) => (
          <details key={i} className="group">
            <summary className="flex items-center justify-between gap-3 px-4 py-3 cursor-pointer select-none list-none font-semibold text-sm hover:bg-secondary/50 focus-visible:ring-[3px] focus-visible:ring-ring/50 rounded-lg [&::-webkit-details-marker]:hidden">
              {item.pregunta}
              <ChevronDown className="w-4 h-4 text-muted-foreground group-open:rotate-180 transition-transform flex-shrink-0" />
            </summary>
            <p className="px-4 pb-4 text-sm leading-relaxed text-muted-foreground">{item.respuesta}</p>
          </details>
        ))}
      </div>
    </div>
  )
}
