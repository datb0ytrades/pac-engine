-- ============================================================================
-- Buckets para el PAC: xml-documents (XMLs firmados) y pdf-cafe (PDFs CAFE)
-- Requeridos por emit-document y generate-cafe-pdf
-- ============================================================================

-- Bucket para XMLs firmados
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'xml-documents',
  'xml-documents',
  false,
  10485760,  -- 10 MB
  ARRAY['application/xml', 'text/xml']
)
ON CONFLICT (id) DO NOTHING;

-- Bucket para PDFs CAFE
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'pdf-cafe',
  'pdf-cafe',
  false,
  10485760,  -- 10 MB
  ARRAY['application/pdf']
)
ON CONFLICT (id) DO NOTHING;

-- RLS: permitir al service role (Edge Functions) escribir; usuarios leen solo su carpeta (org_id)
-- Las Edge Functions usan service_role que bypass RLS; estas políticas son para acceso directo de clientes

CREATE POLICY xml_documents_select ON storage.objects
  FOR SELECT
  USING (
    bucket_id = 'xml-documents'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

CREATE POLICY xml_documents_insert ON storage.objects
  FOR INSERT
  WITH CHECK (
    bucket_id = 'xml-documents'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

-- pdf-cafe: mismo patrón
CREATE POLICY pdf_cafe_select ON storage.objects
  FOR SELECT
  USING (
    bucket_id = 'pdf-cafe'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

CREATE POLICY pdf_cafe_insert ON storage.objects
  FOR INSERT
  WITH CHECK (
    bucket_id = 'pdf-cafe'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );
