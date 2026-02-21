-- Renombrar organization_id a org_id para consistencia con Edge Functions
ALTER TABLE documents RENAME COLUMN organization_id TO org_id;

-- Los índices existentes se actualizan automáticamente al renombrar la columna.
-- Actualizar política RLS para usar org_id
DROP POLICY IF EXISTS documents_org_isolation ON documents;
CREATE POLICY documents_org_isolation ON documents
  USING (org_id = auth.uid());
