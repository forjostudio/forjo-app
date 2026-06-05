-- ============================================================
-- 002 · Verticales (rubros) + Historia clínica (salud)
-- ============================================================
-- businesses.vertical; campos de paciente (obra social, preferencias);
-- tablas clinical_notes y client_attachments con su RLS por tenant; backfill de vertical.
-- Idempotente: IF NOT EXISTS + DROP POLICY IF EXISTS antes de CREATE.
-- No destructivo de estructura (ver ⚠ en el backfill, que es de datos).
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

-- RLS por tenant. En FOR ALL, si se omite WITH CHECK, Postgres usa la expresión USING
-- también como check de INSERT/UPDATE → impide asignar filas a otro negocio.
DROP POLICY IF EXISTS "business access" ON clinical_notes;
CREATE POLICY "business access" ON clinical_notes FOR ALL
  USING (business_id IN (SELECT id FROM businesses WHERE owner_id = auth.uid()));
DROP POLICY IF EXISTS "business access" ON client_attachments;
CREATE POLICY "business access" ON client_attachments FOR ALL
  USING (business_id IN (SELECT id FROM businesses WHERE owner_id = auth.uid()));

-- ⚠ BACKFILL DE DATOS (no estructura). Re-deriva businesses.vertical desde `type`.
-- Es convergente (misma salida en cada corrida), PERO si alguien seteó el vertical a
-- mano y no coincide con el type, re-correrlo lo pisa. Pensado para correr UNA vez.
-- Ajustar los nombres de `type` a los reales de tu base si difieren.
UPDATE businesses SET vertical = 'salud'
  WHERE vertical IS DISTINCT FROM 'salud'
    AND type IN ('Médico','Psicólogo','Kinesiólogo','Odontólogo','Nutricionista',
                 'Centro médico','Psicología','Odontología','Kinesiología');
UPDATE businesses SET vertical = 'belleza'
  WHERE vertical IS DISTINCT FROM 'belleza'
    AND type IN ('Peluquería','Barbería','Centro de estética','Manicura','Spa','Estética');
UPDATE businesses SET vertical = 'general'
  WHERE vertical IS NULL;
