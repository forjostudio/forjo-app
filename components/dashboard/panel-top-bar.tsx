'use client'

import { usePathname } from 'next/navigation'
import { Business } from '@/lib/types'
import { useTerminology } from '@/lib/use-terminology'

// ── El header superior del panel en mobile (O-2 / MOB-01 / MOB-07) ──────────────
// Este header ya existía en el sidebar y su única razón de ser era el botón de las tres líneas que
// abría el drawer. Ese botón se va (con él se van su overlay, su drawer y el estado que los abría:
// en mobile queda UN SOLO camino de entrada al menú, la barra inferior + Más). Pero el header NO se
// va: es lo único que muestra el nombre del negocio en mobile.
//
// ── Por qué se extrajo a su propio archivo en vez de editarlo donde estaba ──────
// Porque así `sidebar.tsx` queda siendo "el sidebar de desktop" y nada más, que es exactamente en
// lo que esta fase lo convierte. Editarlo in-place lo dejaría dueño de DOS superficies justo cuando
// le estamos sacando la tercera. Y este header necesita el pathname y la terminología del rubro,
// que el sidebar no usa.
//
// ── Por qué el nombre del negocio es la línea DOMINANTE y la sección la subordinada ──
// Las 13 pantallas ya tienen su propio título visible (24px bold) a 56px de acá abajo. Si el header
// pusiera el nombre de la sección como dominante, habría dos títulos iguales a 56px de distancia y
// el de la pantalla —el dominante legítimo— quedaría compitiendo con el chrome. Así se honran las
// dos cosas: se muestran ambas, pero manda el nombre del negocio (que no está duplicado en ningún
// otro lugar de mobile) y la sección entra como eyebrow de orientación. La segunda línea gana su
// lugar por una razón que el título de la pantalla no cubre: este header es FIJO y ese título
// SCROLLEA, así que a mitad de un formulario largo esto es lo único que dice dónde estás.
//
// ⚠ LAS DOS LÍNEAS SON PÁRRAFOS, NINGUNA ES UN HEADING. Cada pantalla conserva el suyo (medido:
// appointments-client.tsx:273 y finances-client.tsx:607). Poner un heading en el chrome fijo
// rompería la jerarquía de las 13 pantallas a la vez y las dejaría con dos títulos de nivel 1. La
// otra mitad de esta regla vive en /mas, la única pantalla nueva de la fase: su título de nivel 1 va
// oculto para lectores de pantalla justamente porque este header ya la nombra en pantalla.
//
// ⚠ El alto NO se toca: el padding superior del elemento principal de (dashboard)/layout.tsx está
// clavado a estos 56px. Cambiar uno sin el otro tapa o despega el contenido de las 13 pantallas.
//
// ⚠ Tampoco va el logo. Vive en el bloque de identidad de Más, junto al plan: el header tiene que
// quedarse callado para que el título de la pantalla domine, y un avatar de 32px no agrega nada que
// el nombre no diga. La alternativa (avatar a la izquierda ocupando el hueco del botón borrado) se
// consideró y se descartó.

export function PanelTopBar({ business }: { business: Business }) {
  const pathname = usePathname()
  const t = useTerminology()

  // ── El mapa de títulos de sección ─────────────────────────────────────────────
  // Los 14 pathnames del panel, con la MISMA fuente de terminología que usan los labels de la barra
  // inferior: el negocio de salud lee "Pacientes" y el de canchas lee "Reservas". Se consume del
  // provider ya montado en (dashboard)/layout.tsx — el vertical NO se re-resuelve en el cliente,
  // porque dos resoluciones son dos fuentes de verdad.
  //
  // ⚠ Por qué es un mapa local y NO se deriva de buildNavGroups, que es el inventario del menú:
  //   1. Ése devuelve SÓLO los destinos que el rubro expone, así que en canchas no tendría entrada
  //      para /equipo — y aunque esa ruta no esté en su menú, el pathname puede existir.
  //   2. Tres de estas 14 entradas no son items de menú: /ayuda, /mas y la raíz del panel.
  //   3. Para la raíz, el inventario del menú trae el label de desktop y acá tiene que decir
  //      "Inicio", que es el mismo término que usa la barra. Dentro de mobile la palabra es UNA
  //      sola; en el sidebar de desktop sigue diciendo lo de siempre porque MOB-07 prohíbe tocarlo.
  //
  // ⚠ Se indexa por pathname EXACTO, no por prefijo: el detalle de cliente viaja como parámetro de
  // búsqueda sobre /clients, así que el header dice Clientes/Pacientes. Es lo correcto — un detalle
  // es una subsección, no una sección.
  const TITULOS: Record<string, string | undefined> = {
    '/dashboard': 'Inicio',
    '/appointments': t.appointments,
    '/agenda': 'Agenda',
    '/abonos': 'Abonos',
    '/clients': t.clients,
    '/servicios': t.services,
    '/equipo': 'Equipo',
    '/consultorios': t.locations,
    '/negocio': 'Negocio',
    '/web': 'Mi web',
    '/finances': 'Finanzas',
    '/settings': 'Configuración',
    '/ayuda': 'Ayuda',
    '/mas': 'Más',
  }

  // Un pathname que no está en el mapa deja el header de UNA sola línea, centrada: la segunda
  // simplemente no se renderiza. Nunca el texto "undefined", nunca un hueco vacío.
  const titulo = TITULOS[pathname]

  return (
    <div
      // Visibilidad, posición, capa, superficie y alto son IDÉNTICOS a los del header de hoy: lo
      // único que cambia es el contenido. La capa importa: los overlays y los drawers del panel
      // viven por encima, y así tiene que ser — el atrás cierra el overlay antes de navegar.
      // Zona segura horizontal: el padding lateral se suma al inset del dispositivo, porque en
      // landscape sobre un teléfono con notch ese inset vale 44px y sin esto el texto quedaría
      // debajo del notch.
      // ⚠ En el valor arbitrario de Tailwind NO puede haber ni un espacio: con espacios la clase no
      // se genera, Tailwind no avisa, el compilador no lo ve, el build pasa, y el inset simplemente
      // no se aplica. Precedente que ya compila acá: components/landing/whatsapp-float.tsx:36.
      className="lg:hidden fixed top-0 left-0 right-0 z-30 bg-card border-b border-border h-14 flex items-center px-4 pl-[calc(1rem+env(safe-area-inset-left,0px))] pr-[calc(1rem+env(safe-area-inset-right,0px))]"
    >
      <div className="flex-1 min-w-0 flex flex-col justify-center">
        {/* Línea 1 — el nombre del negocio, 16px/600. Es la línea dominante. El truncate más el
            min-w-0 del contenedor son lo que impide que un nombre largo desborde el header o
            empuje el slot de acciones: businesses.name no tiene límite de longitud. */}
        <p className="text-base font-semibold text-foreground truncate">{business.name}</p>
        {/* Línea 2 — el título de la sección, 11px/500, en el token del inactivo de la barra para
            que las dos piezas de chrome hablen con el mismo gris. Los 11px son la misma excepción
            declarada que los labels de la barra: no es texto de cuerpo, es chrome de navegación de
            una palabra. */}
        {titulo && (
          <p className="text-[11px] leading-[1.2] font-medium text-[var(--panel-nav-muted)] truncate">
            {titulo}
          </p>
        )}
      </div>
      {/* ── El slot de acciones ───────────────────────────────────────────────────
          Declarado y VACÍO en esta fase. Mover acciones de una pantalla acá está fuera de alcance.
          Contrato para quien lo use después:
            · alineado a la derecha, sin encogerse nunca (el nombre trunca, el slot no);
            · máximo DOS botones, siempre variante fantasma y tamaño de icono, con área táctil de
              44×44 como mínimo;
            · cada botón, al ser sólo-icono, es OBLIGATORIO que lleve nombre accesible: etiqueta en
              español con verbo + objeto ("Nuevo turno", "Filtrar clientes"), nunca una genérica y
              nunca el atributo de tooltip como sustituto — en touch no hay hover, la regla del
              proyecto prohíbe tooltips en mobile, y un icono sin etiqueta queda anunciado como
              "botón" a secas;
            · nunca texto: acá no hay ancho. */}
      <div className="shrink-0" />
    </div>
  )
}
