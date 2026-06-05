-- ============================================================
-- Forjo Gestión — SCHEMA BASE (estado inicial de referencia)
-- ============================================================
-- Este archivo describe el ESTADO BASE del esquema: las tablas núcleo y su RLS inicial.
-- Los cambios incrementales (features posteriores) NO van acá: viven en
-- supabase/migrations/ como archivos numerados (001_, 002_, …) y se corren EN ORDEN
-- sobre esta base. Ver supabase/migrations/README.md para el orden exacto.
--
-- Idempotente: usa CREATE TABLE IF NOT EXISTS y DROP POLICY IF EXISTS antes de CREATE,
-- así correrlo dos veces no rompe. Nada destructivo (sin DROP TABLE / DROP COLUMN / DELETE).
-- ============================================================

-- Negocios (cada tenant)
CREATE TABLE IF NOT EXISTS businesses (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  owner_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  slug TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  type TEXT,
  logo_url TEXT,
  primary_color TEXT DEFAULT '#d94a2b',
  phone TEXT,
  address TEXT,
  instagram TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Profesionales del negocio
CREATE TABLE IF NOT EXISTS professionals (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  business_id UUID REFERENCES businesses(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  photo_url TEXT,
  active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Servicios del negocio
CREATE TABLE IF NOT EXISTS services (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  business_id UUID REFERENCES businesses(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  duration_minutes INTEGER NOT NULL,
  price DECIMAL(10,2) NOT NULL,
  description TEXT,
  active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Horarios por día
CREATE TABLE IF NOT EXISTS business_hours (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  business_id UUID REFERENCES businesses(id) ON DELETE CASCADE,
  day_of_week INTEGER NOT NULL,
  open_time TIME,
  close_time TIME,
  is_open BOOLEAN DEFAULT TRUE
);

-- Clientes
CREATE TABLE IF NOT EXISTS clients (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  business_id UUID REFERENCES businesses(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  phone TEXT,
  email TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Turnos
CREATE TABLE IF NOT EXISTS appointments (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  business_id UUID REFERENCES businesses(id) ON DELETE CASCADE,
  professional_id UUID REFERENCES professionals(id),
  service_id UUID REFERENCES services(id),
  client_id UUID REFERENCES clients(id),
  client_name TEXT NOT NULL,
  client_phone TEXT,
  client_email TEXT,
  date DATE NOT NULL,
  time TIME NOT NULL,
  status TEXT DEFAULT 'pending',
  payment_status TEXT DEFAULT 'unpaid',
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- RLS — habilitar en todas las tablas de tenant
-- ============================================================
ALTER TABLE businesses ENABLE ROW LEVEL SECURITY;
ALTER TABLE professionals ENABLE ROW LEVEL SECURITY;
ALTER TABLE services ENABLE ROW LEVEL SECURITY;
ALTER TABLE business_hours ENABLE ROW LEVEL SECURITY;
ALTER TABLE clients ENABLE ROW LEVEL SECURITY;
ALTER TABLE appointments ENABLE ROW LEVEL SECURITY;

-- Políticas RLS — owner (el dueño accede solo a sus negocios y sus filas).
-- DROP antes de CREATE para que correr el archivo dos veces no rompa.
DROP POLICY IF EXISTS "owner access" ON businesses;
CREATE POLICY "owner access" ON businesses
  FOR ALL USING (owner_id = auth.uid());

DROP POLICY IF EXISTS "business member access" ON professionals;
CREATE POLICY "business member access" ON professionals
  FOR ALL USING (business_id IN (
    SELECT id FROM businesses WHERE owner_id = auth.uid()
  ));

DROP POLICY IF EXISTS "business member access" ON services;
CREATE POLICY "business member access" ON services
  FOR ALL USING (business_id IN (
    SELECT id FROM businesses WHERE owner_id = auth.uid()
  ));

DROP POLICY IF EXISTS "business member access" ON business_hours;
CREATE POLICY "business member access" ON business_hours
  FOR ALL USING (business_id IN (
    SELECT id FROM businesses WHERE owner_id = auth.uid()
  ));

DROP POLICY IF EXISTS "business member access" ON clients;
CREATE POLICY "business member access" ON clients
  FOR ALL USING (business_id IN (
    SELECT id FROM businesses WHERE owner_id = auth.uid()
  ));

DROP POLICY IF EXISTS "business member access" ON appointments;
CREATE POLICY "business member access" ON appointments
  FOR ALL USING (business_id IN (
    SELECT id FROM businesses WHERE owner_id = auth.uid()
  ));

-- Acceso público (rol anon) para la página de reservas /[slug].
-- NOTA: la lectura pública de `professionals` se ACOTA luego a una vista en la
-- migración 007 (no expone contacto/matrícula del staff). Acá queda el estado base.
DROP POLICY IF EXISTS "public read businesses" ON businesses;
CREATE POLICY "public read businesses" ON businesses
  FOR SELECT USING (true);
DROP POLICY IF EXISTS "public read professionals" ON professionals;
CREATE POLICY "public read professionals" ON professionals
  FOR SELECT USING (true);
DROP POLICY IF EXISTS "public read services" ON services;
CREATE POLICY "public read services" ON services
  FOR SELECT USING (true);
DROP POLICY IF EXISTS "public read hours" ON business_hours;
CREATE POLICY "public read hours" ON business_hours
  FOR SELECT USING (true);
DROP POLICY IF EXISTS "public insert appointments" ON appointments;
CREATE POLICY "public insert appointments" ON appointments
  FOR INSERT WITH CHECK (true);
DROP POLICY IF EXISTS "public insert clients" ON clients;
CREATE POLICY "public insert clients" ON clients
  FOR INSERT WITH CHECK (true);
