-- Bucket para imágenes de recibos (app consumidor)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'receipts',
  'receipts',
  true,
  5242880,
  ARRAY['image/jpeg', 'image/png', 'image/webp']
)
ON CONFLICT (id) DO NOTHING;

-- RLS: usuarios pueden subir/leer sus propios archivos (carpeta = user_id)
CREATE POLICY receipts_user_upload ON storage.objects
  FOR INSERT
  WITH CHECK (
    bucket_id = 'receipts'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

CREATE POLICY receipts_user_read ON storage.objects
  FOR SELECT
  USING (
    bucket_id = 'receipts'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );
