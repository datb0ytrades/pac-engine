-- Add cufe to received_documents for QR-scanned receipts (avoid duplicates)
ALTER TABLE received_documents ADD COLUMN IF NOT EXISTS cufe VARCHAR(66);
CREATE UNIQUE INDEX IF NOT EXISTS idx_received_documents_cufe ON received_documents(cufe) WHERE cufe IS NOT NULL;
