-- ============================================================
-- 004 · Gastos fijos (egresos recurrentes)
-- ============================================================
-- Tabla fixed_expenses con RLS por tenant (una policy por operación, con WITH CHECK en
-- INSERT/UPDATE para que no se reasignen filas a otro negocio).
-- Idempotente: IF NOT EXISTS + DROP POLICY IF EXISTS antes de CREATE. No destructivo.
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

ALTER TABLE fixed_expenses ENABLE ROW LEVEL SECURITY;

-- El vínculo tenant es businesses.owner_id = auth.uid(). auth.uid() va envuelto en un
-- subselect para que Postgres lo evalúe una sola vez por query.
DROP POLICY IF EXISTS "fixed_expenses tenant select" ON fixed_expenses;
CREATE POLICY "fixed_expenses tenant select" ON fixed_expenses
  FOR SELECT USING (
    business_id IN (SELECT id FROM businesses WHERE owner_id = (SELECT auth.uid()))
  );
DROP POLICY IF EXISTS "fixed_expenses tenant insert" ON fixed_expenses;
CREATE POLICY "fixed_expenses tenant insert" ON fixed_expenses
  FOR INSERT WITH CHECK (
    business_id IN (SELECT id FROM businesses WHERE owner_id = (SELECT auth.uid()))
  );
-- update: USING = qué filas puede tocar; WITH CHECK = que no las reasigne a otro tenant.
DROP POLICY IF EXISTS "fixed_expenses tenant update" ON fixed_expenses;
CREATE POLICY "fixed_expenses tenant update" ON fixed_expenses
  FOR UPDATE USING (
    business_id IN (SELECT id FROM businesses WHERE owner_id = (SELECT auth.uid()))
  ) WITH CHECK (
    business_id IN (SELECT id FROM businesses WHERE owner_id = (SELECT auth.uid()))
  );
DROP POLICY IF EXISTS "fixed_expenses tenant delete" ON fixed_expenses;
CREATE POLICY "fixed_expenses tenant delete" ON fixed_expenses
  FOR DELETE USING (
    business_id IN (SELECT id FROM businesses WHERE owner_id = (SELECT auth.uid()))
  );
