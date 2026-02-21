-- ============================================================================
-- Fix documents schema for remote DB (run manually in Supabase SQL Editor)
-- Adds all missing columns required by emit-document. Safe to run multiple times.
-- ============================================================================

DO $$ 
DECLARE
  col_exists boolean;
BEGIN
  -- emission_date
  SELECT NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='documents' AND column_name='emission_date') INTO col_exists;
  IF col_exists THEN
    ALTER TABLE documents ADD COLUMN emission_date TIMESTAMPTZ;
    UPDATE documents SET emission_date = COALESCE(created_at, NOW()) WHERE emission_date IS NULL;
    ALTER TABLE documents ALTER COLUMN emission_date SET NOT NULL;
  END IF;

  -- cufe, doc_type (required for inserts)
  SELECT NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='documents' AND column_name='cufe') INTO col_exists;
  IF col_exists THEN ALTER TABLE documents ADD COLUMN cufe VARCHAR(66) UNIQUE; END IF;
  SELECT NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='documents' AND column_name='doc_type') INTO col_exists;
  IF col_exists THEN ALTER TABLE documents ADD COLUMN doc_type VARCHAR(2) NOT NULL DEFAULT '01'; END IF;

  -- emitter_name, emitter_ruc
  SELECT NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='documents' AND column_name='emitter_name') INTO col_exists;
  IF col_exists THEN ALTER TABLE documents ADD COLUMN emitter_name VARCHAR(200) NOT NULL DEFAULT ''; END IF;

  SELECT NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='documents' AND column_name='emitter_ruc') INTO col_exists;
  IF col_exists THEN ALTER TABLE documents ADD COLUMN emitter_ruc VARCHAR(20) NOT NULL DEFAULT ''; END IF;
  SELECT NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='documents' AND column_name='emitter_ruc') INTO col_exists;
  IF col_exists THEN ALTER TABLE documents ADD COLUMN emitter_ruc VARCHAR(20) NOT NULL DEFAULT ''; END IF;

  -- receiver_ruc, receiver_name (nullable)
  SELECT NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='documents' AND column_name='receiver_ruc') INTO col_exists;
  IF col_exists THEN ALTER TABLE documents ADD COLUMN receiver_ruc VARCHAR(20); END IF;
  SELECT NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='documents' AND column_name='receiver_name') INTO col_exists;
  IF col_exists THEN ALTER TABLE documents ADD COLUMN receiver_name VARCHAR(200); END IF;

  -- total_amount, total_tax, currency, status, xml_storage_path, etc.
  SELECT NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='documents' AND column_name='total_amount') INTO col_exists;
  IF col_exists THEN ALTER TABLE documents ADD COLUMN total_amount NUMERIC(15,2) NOT NULL DEFAULT 0; END IF;
  SELECT NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='documents' AND column_name='total_tax') INTO col_exists;
  IF col_exists THEN ALTER TABLE documents ADD COLUMN total_tax NUMERIC(15,2) NOT NULL DEFAULT 0; END IF;
  SELECT NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='documents' AND column_name='currency') INTO col_exists;
  IF col_exists THEN ALTER TABLE documents ADD COLUMN currency VARCHAR(3) NOT NULL DEFAULT 'USD'; END IF;
  SELECT NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='documents' AND column_name='status') INTO col_exists;
  IF col_exists THEN ALTER TABLE documents ADD COLUMN status VARCHAR(20) NOT NULL DEFAULT 'signed'; END IF;
  SELECT NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='documents' AND column_name='xml_storage_path') INTO col_exists;
  IF col_exists THEN ALTER TABLE documents ADD COLUMN xml_storage_path TEXT; END IF;
  SELECT NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='documents' AND column_name='authorization_code') INTO col_exists;
  IF col_exists THEN ALTER TABLE documents ADD COLUMN authorization_code VARCHAR(100); END IF;
  SELECT NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='documents' AND column_name='dgi_response') INTO col_exists;
  IF col_exists THEN ALTER TABLE documents ADD COLUMN dgi_response JSONB; END IF;
  SELECT NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='documents' AND column_name='validation_warnings') INTO col_exists;
  IF col_exists THEN ALTER TABLE documents ADD COLUMN validation_warnings JSONB DEFAULT '[]'::jsonb; END IF;
  SELECT NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='documents' AND column_name='environment') INTO col_exists;
  IF col_exists THEN ALTER TABLE documents ADD COLUMN environment VARCHAR(10) NOT NULL DEFAULT 'sandbox'; END IF;

  -- org_id (rename from organization_id if needed)
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='documents' AND column_name='organization_id')
     AND NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='documents' AND column_name='org_id') THEN
    ALTER TABLE documents RENAME COLUMN organization_id TO org_id;
    DROP POLICY IF EXISTS documents_org_isolation ON documents;
    CREATE POLICY documents_org_isolation ON documents USING (org_id = auth.uid());
  END IF;
END $$;

-- Fix doc_type: convert enum to VARCHAR(2) if it's enum (emit-document uses DGI codes '01','04','05')
DO $$
BEGIN
  BEGIN
    ALTER TABLE documents ALTER COLUMN doc_type TYPE VARCHAR(2) USING doc_type::text;
  EXCEPTION WHEN OTHERS THEN
    NULL; -- Column already varchar or other issue, skip
  END;
END $$;

-- Drop the enum type if it exists and is unused (may fail if still in use)
DO $$ BEGIN
  DROP TYPE IF EXISTS doc_type_enum CASCADE;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;
