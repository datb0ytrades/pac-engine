-- ============================================================================
-- Tabla documents: registro de documentos fiscales electrónicos
--
-- Almacena cada documento procesado por el PAC, desde la recepción
-- hasta la aceptación/rechazo por la DGI.
-- ============================================================================

CREATE TABLE documents (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cufe                VARCHAR(66) UNIQUE NOT NULL,
  organization_id     UUID NOT NULL,
  doc_type            VARCHAR(2) NOT NULL,        -- iDoc: '01'..'10'
  emitter_ruc         VARCHAR(20) NOT NULL,
  emitter_name        VARCHAR(200) NOT NULL,
  receiver_ruc        VARCHAR(20),
  receiver_name       VARCHAR(200),
  emission_date       TIMESTAMPTZ NOT NULL,
  total_amount        NUMERIC(15,2) NOT NULL,
  total_tax           NUMERIC(15,2) NOT NULL,
  currency            VARCHAR(3) NOT NULL DEFAULT 'USD',
  status              VARCHAR(20) NOT NULL DEFAULT 'received',
  xml_storage_path    TEXT,
  pdf_storage_path    TEXT,
  authorization_code  VARCHAR(100),
  dgi_response        JSONB,
  validation_warnings JSONB DEFAULT '[]'::jsonb,
  environment         VARCHAR(10) NOT NULL DEFAULT 'sandbox',
  cancelled_reason    TEXT,
  cancelled_at        TIMESTAMPTZ,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Índices para las consultas más frecuentes

CREATE INDEX idx_documents_organization
  ON documents(organization_id, created_at DESC);

CREATE INDEX idx_documents_cufe
  ON documents(cufe);

CREATE INDEX idx_documents_status
  ON documents(organization_id, status);

CREATE INDEX idx_documents_doc_type
  ON documents(organization_id, doc_type);

CREATE INDEX idx_documents_emitter_ruc
  ON documents(organization_id, emitter_ruc);

CREATE INDEX idx_documents_emission_date
  ON documents(organization_id, emission_date DESC);

-- RLS: cada organización solo ve sus propios documentos

ALTER TABLE documents ENABLE ROW LEVEL SECURITY;

CREATE POLICY documents_org_isolation ON documents
  USING (organization_id = auth.uid());

-- Trigger para actualizar updated_at automáticamente

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_documents_updated_at
  BEFORE UPDATE ON documents
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Constraint para validar status

ALTER TABLE documents ADD CONSTRAINT chk_status CHECK (
  status IN (
    'received', 'validated', 'signed', 'sent_to_dgi',
    'accepted', 'rejected', 'cancelled', 'error'
  )
);

-- Constraint para validar doc_type

ALTER TABLE documents ADD CONSTRAINT chk_doc_type CHECK (
  doc_type IN ('01', '02', '03', '04', '05', '06', '07', '08', '09', '10')
);

-- Constraint para validar environment

ALTER TABLE documents ADD CONSTRAINT chk_environment CHECK (
  environment IN ('sandbox', 'production')
);
