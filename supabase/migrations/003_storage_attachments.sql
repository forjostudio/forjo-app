-- ============================================================
-- 003 · Storage: bucket privado "attachments" (adjuntos de clientes)
-- ============================================================
-- Path de los archivos: [business_id]/[client_id]/[filename].
-- Solo el dueño del negocio puede subir/ver/borrar archivos de sus clientes:
-- la primera carpeta del path es el business_id, que debe pertenecerle.
-- Idempotente: ON CONFLICT DO NOTHING + DROP POLICY IF EXISTS antes de CREATE. No destructivo.
-- (Depende de 002, que crea la tabla client_attachments.)
-- ============================================================

INSERT INTO storage.buckets (id, name, public)
  VALUES ('attachments', 'attachments', false)
  ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "business attachments" ON storage.objects;
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
