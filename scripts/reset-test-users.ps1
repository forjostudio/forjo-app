#requires -Version 5
<#
.SYNOPSIS
  Borra usuarios de prueba del Supabase LOCAL (Docker) y sus negocios en cascada.

.DESCRIPTION
  Actua SIEMPRE sobre el contenedor local supabase_db_forjo-app (docker.exe exec),
  nunca sobre la nube: no depende de .env.local ni de la service-role key.
  El SQL se pasa por stdin (-i) para evitar problemas de quoting/binding en PowerShell.

  Cascada (verificada en supabase/schema.sql):
    auth.users --(owner_id ON DELETE CASCADE)--> businesses
    businesses --(business_id ON DELETE CASCADE)--> services, professionals,
    time_blocks, appointments, clients, locations, schedule_exceptions, expenses,
    messages, conversations, spaces, agenda_spaces, etc.
  Excepciones ON DELETE SET NULL (quedan huerfanas, inofensivas): leads, deals, audit_log.
  Usa -Leads para limpiar tambien leads huerfanos (business_id IS NULL).

.EXAMPLE
  ./scripts/reset-test-users.ps1                 # borra los usuarios creados HOY (pide confirmacion)
.EXAMPLE
  ./scripts/reset-test-users.ps1 -Email a@b.com  # borra uno puntual
.EXAMPLE
  ./scripts/reset-test-users.ps1 -All -Force     # borra TODOS sin preguntar
.EXAMPLE
  ./scripts/reset-test-users.ps1 -List           # solo lista, no borra
#>
param(
  [string]$Email,
  [switch]$All,
  [switch]$List,
  [switch]$Force,
  [switch]$Leads,
  [string]$Container = "supabase_db_forjo-app"
)

$ErrorActionPreference = "Stop"

# 1. Verificar que el contenedor local este corriendo
$running = docker.exe ps --filter "name=$Container" --format "{{.Names}}"
if (-not $running) {
  Write-Host "X No encuentro el contenedor '$Container' corriendo." -ForegroundColor Red
  Write-Host "  Levanta el stack local con: supabase start" -ForegroundColor Yellow
  exit 1
}

# 2. Construir el filtro (WHERE) segun el modo
if ($Email) {
  $safe  = $Email.Replace("'", "''")
  $where = "email = '$safe'"
  $desc  = "el usuario $Email"
} elseif ($All) {
  $where = "true"
  $desc  = "TODOS los usuarios"
} else {
  $where = "created_at::date = current_date"
  $desc  = "los usuarios creados HOY"
}

# 3. Mostrar coincidencias antes de tocar nada (SQL por stdin)
$sqlList = "select email || '  |  creado ' || created_at::text from auth.users where $where order by created_at desc;"
$rows = $sqlList | docker.exe exec -i -e PGPASSWORD=postgres $Container psql -U postgres -d postgres -t -A -v ON_ERROR_STOP=1
if (-not $rows) {
  Write-Host "OK: No hay usuarios que coincidan con $desc. Nada para borrar." -ForegroundColor Green
  exit 0
}
Write-Host "Usuarios que coinciden ($desc):" -ForegroundColor Cyan
$rows | ForEach-Object { Write-Host "  - $_" }

if ($List) { exit 0 }

# 4. Confirmar (salvo -Force)
if (-not $Force) {
  $ans = Read-Host "Borrar estos usuarios y TODOS sus negocios en cascada? (yes/no)"
  if ($ans -ne "yes") { Write-Host "Cancelado."; exit 0 }
}

# 5. Borrar (la cascada se encarga de la data del negocio)
$res = "delete from auth.users where $where;" | docker.exe exec -i -e PGPASSWORD=postgres $Container psql -U postgres -d postgres -t -A -v ON_ERROR_STOP=1
Write-Host "OK borrado: $res" -ForegroundColor Green

# 6. Limpieza opcional de leads huerfanos (ON DELETE SET NULL)
if ($Leads) {
  $r2 = "delete from leads where business_id is null;" | docker.exe exec -i -e PGPASSWORD=postgres $Container psql -U postgres -d postgres -t -A -v ON_ERROR_STOP=1
  Write-Host "OK leads huerfanos: $r2" -ForegroundColor Green
}
