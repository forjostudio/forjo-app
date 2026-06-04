-- Negocios (cada tenant)
CREATE TABLE businesses (
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
CREATE TABLE professionals (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  business_id UUID REFERENCES businesses(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  photo_url TEXT,
  active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Servicios del negocio
CREATE TABLE services (
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
CREATE TABLE business_hours (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  business_id UUID REFERENCES businesses(id) ON DELETE CASCADE,
  day_of_week INTEGER NOT NULL,
  open_time TIME,
  close_time TIME,
  is_open BOOLEAN DEFAULT TRUE
);

-- Clientes
CREATE TABLE clients (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  business_id UUID REFERENCES businesses(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  phone TEXT,
  email TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Turnos
CREATE TABLE appointments (
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
-- MIGRATION: Run these ALTER TABLE statements in Supabase SQL editor
-- ============================================================
ALTER TABLE businesses ADD COLUMN IF NOT EXISTS mp_access_token TEXT;
ALTER TABLE businesses ADD COLUMN IF NOT EXISTS require_deposit BOOLEAN DEFAULT FALSE;
ALTER TABLE businesses ADD COLUMN IF NOT EXISTS deposit_amount DECIMAL(10,2) DEFAULT 0;
ALTER TABLE businesses ADD COLUMN IF NOT EXISTS deposit_expiry_hours INTEGER DEFAULT 1;
ALTER TABLE businesses ADD COLUMN IF NOT EXISTS notification_email TEXT;
ALTER TABLE businesses ADD COLUMN IF NOT EXISTS resend_api_key TEXT;
ALTER TABLE businesses ADD COLUMN IF NOT EXISTS recaptcha_site_key TEXT;
ALTER TABLE businesses ADD COLUMN IF NOT EXISTS recaptcha_secret_key TEXT;

ALTER TABLE appointments ADD COLUMN IF NOT EXISTS deposit_paid BOOLEAN DEFAULT FALSE;
ALTER TABLE appointments ADD COLUMN IF NOT EXISTS deposit_amount DECIMAL(10,2) DEFAULT 0;
ALTER TABLE appointments ADD COLUMN IF NOT EXISTS mp_payment_id TEXT;
ALTER TABLE appointments ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ;
-- ============================================================

-- RLS
ALTER TABLE businesses ENABLE ROW LEVEL SECURITY;
ALTER TABLE professionals ENABLE ROW LEVEL SECURITY;
ALTER TABLE services ENABLE ROW LEVEL SECURITY;
ALTER TABLE business_hours ENABLE ROW LEVEL SECURITY;
ALTER TABLE clients ENABLE ROW LEVEL SECURITY;
ALTER TABLE appointments ENABLE ROW LEVEL SECURITY;

-- Políticas RLS - owner
CREATE POLICY "owner access" ON businesses
  FOR ALL USING (owner_id = auth.uid());

CREATE POLICY "business member access" ON professionals
  FOR ALL USING (business_id IN (
    SELECT id FROM businesses WHERE owner_id = auth.uid()
  ));

CREATE POLICY "business member access" ON services
  FOR ALL USING (business_id IN (
    SELECT id FROM businesses WHERE owner_id = auth.uid()
  ));

CREATE POLICY "business member access" ON business_hours
  FOR ALL USING (business_id IN (
    SELECT id FROM businesses WHERE owner_id = auth.uid()
  ));

CREATE POLICY "business member access" ON clients
  FOR ALL USING (business_id IN (
    SELECT id FROM businesses WHERE owner_id = auth.uid()
  ));

CREATE POLICY "business member access" ON appointments
  FOR ALL USING (business_id IN (
    SELECT id FROM businesses WHERE owner_id = auth.uid()
  ));

-- Acceso público para página de reservas
CREATE POLICY "public read businesses" ON businesses
  FOR SELECT USING (true);
CREATE POLICY "public read professionals" ON professionals
  FOR SELECT USING (true);
CREATE POLICY "public read services" ON services
  FOR SELECT USING (true);
CREATE POLICY "public read hours" ON business_hours
  FOR SELECT USING (true);
CREATE POLICY "public insert appointments" ON appointments
  FOR INSERT WITH CHECK (true);
CREATE POLICY "public insert clients" ON clients
  FOR INSERT WITH CHECK (true);

-- ============================================================
-- MIGRATION: Verticals (rubros) — run in Supabase SQL editor
-- ============================================================
-- Rubro del negocio. Los negocios existentes sin valor usan 'general'.
ALTER TABLE businesses ADD COLUMN IF NOT EXISTS vertical TEXT DEFAULT 'general';

-- Campos extra para pacientes (salud)
ALTER TABLE clients ADD COLUMN IF NOT EXISTS insurance_name TEXT;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS insurance_number TEXT;

-- Preferencias (belleza)
ALTER TABLE clients ADD COLUMN IF NOT EXISTS preferences TEXT;

-- Historia clínica / notas con fecha
CREATE TABLE IF NOT EXISTS clinical_notes (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  business_id UUID REFERENCES businesses(id) ON DELETE CASCADE,
  client_id UUID REFERENCES clients(id) ON DELETE CASCADE,
  note TEXT NOT NULL,
  note_date DATE DEFAULT CURRENT_DATE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Archivos adjuntos por cliente
CREATE TABLE IF NOT EXISTS client_attachments (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  business_id UUID REFERENCES businesses(id) ON DELETE CASCADE,
  client_id UUID REFERENCES clients(id) ON DELETE CASCADE,
  file_url TEXT NOT NULL,
  file_name TEXT,
  uploaded_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE clinical_notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE client_attachments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "business access" ON clinical_notes FOR ALL
  USING (business_id IN (SELECT id FROM businesses WHERE owner_id = auth.uid()));
CREATE POLICY "business access" ON client_attachments FOR ALL
  USING (business_id IN (SELECT id FROM businesses WHERE owner_id = auth.uid()));

-- Migrar negocios existentes: derivar vertical desde su `type` actual.
-- (Ajustar los nombres de type a los reales de tu base si difieren.)
UPDATE businesses SET vertical = 'salud'
  WHERE vertical IS DISTINCT FROM 'salud'
    AND type IN ('Médico','Psicólogo','Kinesiólogo','Odontólogo','Nutricionista',
                 'Centro médico','Psicología','Odontología','Kinesiología');
UPDATE businesses SET vertical = 'belleza'
  WHERE vertical IS DISTINCT FROM 'belleza'
    AND type IN ('Peluquería','Barbería','Centro de estética','Manicura','Spa','Estética');
UPDATE businesses SET vertical = 'general'
  WHERE vertical IS NULL;

-- ============================================================
-- STORAGE: bucket privado "attachments" para adjuntos de clientes
-- Path de los archivos: [business_id]/[client_id]/[filename]
-- ============================================================
INSERT INTO storage.buckets (id, name, public)
  VALUES ('attachments', 'attachments', false)
  ON CONFLICT (id) DO NOTHING;

-- Solo el dueño del negocio puede subir/ver/borrar archivos de sus clientes.
-- La primera carpeta del path es el business_id, que debe pertenecer al usuario.
CREATE POLICY "business attachments" ON storage.objects
  FOR ALL USING (
    bucket_id = 'attachments'
    AND (storage.foldername(name))[1] IN (
      SELECT id::text FROM businesses WHERE owner_id = auth.uid()
    )
  )
  WITH CHECK (
    bucket_id = 'attachments'
    AND (storage.foldername(name))[1] IN (
      SELECT id::text FROM businesses WHERE owner_id = auth.uid()
    )
  );

-- ============================================================
-- MIGRATION: Gastos fijos (egresos recurrentes) — run in Supabase SQL editor
-- ============================================================
CREATE TABLE IF NOT EXISTS fixed_expenses (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  amount DECIMAL(10,2) NOT NULL DEFAULT 0,
  frequency TEXT NOT NULL DEFAULT 'monthly',
  due_day INTEGER,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT fixed_expenses_due_day_chk CHECK (due_day IS NULL OR (due_day BETWEEN 1 AND 31))
);

CREATE INDEX IF NOT EXISTS fixed_expenses_business_idx ON fixed_expenses(business_id);

-- RLS: tabla con datos de tenant → habilitar y definir policy por operación.
ALTER TABLE fixed_expenses ENABLE ROW LEVEL SECURITY;

-- El vínculo tenant es businesses.owner_id = auth.uid(). auth.uid() va envuelto en
-- un subselect para que Postgres lo evalúe una sola vez por query.
CREATE POLICY "fixed_expenses tenant select" ON fixed_expenses
  FOR SELECT USING (
    business_id IN (SELECT id FROM businesses WHERE owner_id = (SELECT auth.uid()))
  );
CREATE POLICY "fixed_expenses tenant insert" ON fixed_expenses
  FOR INSERT WITH CHECK (
    business_id IN (SELECT id FROM businesses WHERE owner_id = (SELECT auth.uid()))
  );
-- update: USING = qué filas puede tocar; WITH CHECK = que no las reasigne a otro tenant.
CREATE POLICY "fixed_expenses tenant update" ON fixed_expenses
  FOR UPDATE USING (
    business_id IN (SELECT id FROM businesses WHERE owner_id = (SELECT auth.uid()))
  ) WITH CHECK (
    business_id IN (SELECT id FROM businesses WHERE owner_id = (SELECT auth.uid()))
  );
CREATE POLICY "fixed_expenses tenant delete" ON fixed_expenses
  FOR DELETE USING (
    business_id IN (SELECT id FROM businesses WHERE owner_id = (SELECT auth.uid()))
  );
