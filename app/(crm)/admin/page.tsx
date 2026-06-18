/**
 * Landing placeholder de la Consola CRM (/admin).
 *
 * El route group (crm) no aparece en la URL → esta ruta es `/admin`.
 * Server Component: el guard de sesión + is_admin vive en el layout (FND-01).
 * Las pantallas con datos (directorio, ficha, pipeline, auditoría, reportes,
 * bandeja) llegan en Phases 2+. Este placeholder navegable sirve para
 * verificar el guard end-to-end y el ancla de tema (dark + accent amarillo).
 */
export default function AdminPage() {
  return (
    <div className="p-8 sm:p-12">
      <h1 className="text-base font-bold">Consola CRM</h1>
      <p className="mt-4 max-w-prose text-sm text-muted-foreground">
        Esta es la consola interna de operación. Las pantallas con datos
        (negocios, pipeline, auditoría, reportes y bandeja) llegan en las
        próximas fases. Por ahora valida el acceso super-admin y el tema del CRM.
      </p>
    </div>
  )
}
