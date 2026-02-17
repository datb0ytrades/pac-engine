-- ============================================================================
-- Tabla received_documents: comprobantes/gastos del app consumidor
-- Almacena recibos escaneados o ingresados manualmente
-- ============================================================================

CREATE TABLE received_documents (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             UUID NOT NULL,
  merchant_name       VARCHAR(200) NOT NULL,
  amount              NUMERIC(15,2) NOT NULL,
  description         TEXT,
  category            VARCHAR(50),
  is_deductible       BOOLEAN DEFAULT false,
  image_storage_path  TEXT,
  receipt_date        DATE NOT NULL DEFAULT CURRENT_DATE,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_received_documents_user
  ON received_documents(user_id, receipt_date DESC);

CREATE INDEX idx_received_documents_category
  ON received_documents(user_id, category);

CREATE INDEX idx_received_documents_month_year
  ON received_documents(user_id, EXTRACT(YEAR FROM receipt_date), EXTRACT(MONTH FROM receipt_date));

ALTER TABLE received_documents ENABLE ROW LEVEL SECURITY;

CREATE POLICY received_documents_user_isolation ON received_documents
  FOR ALL
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE TRIGGER trigger_received_documents_updated_at
  BEFORE UPDATE ON received_documents
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();
