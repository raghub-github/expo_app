-- ============================================================================
-- REDESIGN STORE DOCUMENTS TABLE - Single Row Per Store
-- Migration: 0038_redesign_store_documents_single_row
-- Database: Supabase PostgreSQL
-- 
-- This migration redesigns merchant_store_documents to store
-- all document types in a single row per store instead of multiple rows.
-- ============================================================================

-- ============================================================================
-- STEP 1: CREATE NEW TABLE STRUCTURE
-- ============================================================================

-- Create new table with all document types in one row
CREATE TABLE IF NOT EXISTS merchant_store_documents_new (
  id BIGSERIAL PRIMARY KEY,
  store_id BIGINT NOT NULL UNIQUE REFERENCES merchant_stores(id) ON DELETE CASCADE,
  
  -- PAN Document
  pan_document_number TEXT,
  pan_document_url TEXT,
  pan_document_name TEXT,
  pan_is_verified BOOLEAN DEFAULT FALSE,
  pan_verified_by INTEGER,
  pan_verified_at TIMESTAMP WITH TIME ZONE,
  pan_rejection_reason TEXT,
  pan_issued_date DATE,
  pan_expiry_date DATE,
  pan_is_expired BOOLEAN DEFAULT FALSE,
  pan_document_version INTEGER DEFAULT 1,
  pan_document_metadata JSONB DEFAULT '{}'::jsonb,
  pan_uploaded_by INTEGER,
  pan_created_at TIMESTAMP WITH TIME ZONE,
  pan_updated_at TIMESTAMP WITH TIME ZONE,
  
  -- GST Document
  gst_document_number TEXT,
  gst_document_url TEXT,
  gst_document_name TEXT,
  gst_is_verified BOOLEAN DEFAULT FALSE,
  gst_verified_by INTEGER,
  gst_verified_at TIMESTAMP WITH TIME ZONE,
  gst_rejection_reason TEXT,
  gst_issued_date DATE,
  gst_expiry_date DATE,
  gst_is_expired BOOLEAN DEFAULT FALSE,
  gst_document_version INTEGER DEFAULT 1,
  gst_document_metadata JSONB DEFAULT '{}'::jsonb,
  gst_uploaded_by INTEGER,
  gst_created_at TIMESTAMP WITH TIME ZONE,
  gst_updated_at TIMESTAMP WITH TIME ZONE,
  
  -- AADHAAR Document
  aadhaar_document_number TEXT,
  aadhaar_document_url TEXT,
  aadhaar_document_name TEXT,
  aadhaar_is_verified BOOLEAN DEFAULT FALSE,
  aadhaar_verified_by INTEGER,
  aadhaar_verified_at TIMESTAMP WITH TIME ZONE,
  aadhaar_rejection_reason TEXT,
  aadhaar_issued_date DATE,
  aadhaar_expiry_date DATE,
  aadhaar_is_expired BOOLEAN DEFAULT FALSE,
  aadhaar_document_version INTEGER DEFAULT 1,
  aadhaar_document_metadata JSONB DEFAULT '{}'::jsonb,
  aadhaar_uploaded_by INTEGER,
  aadhaar_created_at TIMESTAMP WITH TIME ZONE,
  aadhaar_updated_at TIMESTAMP WITH TIME ZONE,
  
  -- FSSAI Document
  fssai_document_number TEXT,
  fssai_document_url TEXT,
  fssai_document_name TEXT,
  fssai_is_verified BOOLEAN DEFAULT FALSE,
  fssai_verified_by INTEGER,
  fssai_verified_at TIMESTAMP WITH TIME ZONE,
  fssai_rejection_reason TEXT,
  fssai_issued_date DATE,
  fssai_expiry_date DATE,
  fssai_is_expired BOOLEAN DEFAULT FALSE,
  fssai_document_version INTEGER DEFAULT 1,
  fssai_document_metadata JSONB DEFAULT '{}'::jsonb,
  fssai_uploaded_by INTEGER,
  fssai_created_at TIMESTAMP WITH TIME ZONE,
  fssai_updated_at TIMESTAMP WITH TIME ZONE,
  
  -- TRADE_LICENSE Document
  trade_license_document_number TEXT,
  trade_license_document_url TEXT,
  trade_license_document_name TEXT,
  trade_license_is_verified BOOLEAN DEFAULT FALSE,
  trade_license_verified_by INTEGER,
  trade_license_verified_at TIMESTAMP WITH TIME ZONE,
  trade_license_rejection_reason TEXT,
  trade_license_issued_date DATE,
  trade_license_expiry_date DATE,
  trade_license_is_expired BOOLEAN DEFAULT FALSE,
  trade_license_document_version INTEGER DEFAULT 1,
  trade_license_document_metadata JSONB DEFAULT '{}'::jsonb,
  trade_license_uploaded_by INTEGER,
  trade_license_created_at TIMESTAMP WITH TIME ZONE,
  trade_license_updated_at TIMESTAMP WITH TIME ZONE,
  
  -- DRUG_LICENSE Document (maps to RETAIL_DRUG_LICENSE or WHOLESALE_DRUG_LICENSE)
  drug_license_document_number TEXT,
  drug_license_document_url TEXT,
  drug_license_document_name TEXT,
  drug_license_type TEXT, -- 'RETAIL' or 'WHOLESALE'
  drug_license_is_verified BOOLEAN DEFAULT FALSE,
  drug_license_verified_by INTEGER,
  drug_license_verified_at TIMESTAMP WITH TIME ZONE,
  drug_license_rejection_reason TEXT,
  drug_license_issued_date DATE,
  drug_license_expiry_date DATE,
  drug_license_is_expired BOOLEAN DEFAULT FALSE,
  drug_license_document_version INTEGER DEFAULT 1,
  drug_license_document_metadata JSONB DEFAULT '{}'::jsonb,
  drug_license_uploaded_by INTEGER,
  drug_license_created_at TIMESTAMP WITH TIME ZONE,
  drug_license_updated_at TIMESTAMP WITH TIME ZONE,
  
  -- SHOP_ESTABLISHMENT Document (maps to SHOP_ACT)
  shop_establishment_document_number TEXT,
  shop_establishment_document_url TEXT,
  shop_establishment_document_name TEXT,
  shop_establishment_is_verified BOOLEAN DEFAULT FALSE,
  shop_establishment_verified_by INTEGER,
  shop_establishment_verified_at TIMESTAMP WITH TIME ZONE,
  shop_establishment_rejection_reason TEXT,
  shop_establishment_issued_date DATE,
  shop_establishment_expiry_date DATE,
  shop_establishment_is_expired BOOLEAN DEFAULT FALSE,
  shop_establishment_document_version INTEGER DEFAULT 1,
  shop_establishment_document_metadata JSONB DEFAULT '{}'::jsonb,
  shop_establishment_uploaded_by INTEGER,
  shop_establishment_created_at TIMESTAMP WITH TIME ZONE,
  shop_establishment_updated_at TIMESTAMP WITH TIME ZONE,
  
  -- UDYAM Document
  udyam_document_number TEXT,
  udyam_document_url TEXT,
  udyam_document_name TEXT,
  udyam_is_verified BOOLEAN DEFAULT FALSE,
  udyam_verified_by INTEGER,
  udyam_verified_at TIMESTAMP WITH TIME ZONE,
  udyam_rejection_reason TEXT,
  udyam_issued_date DATE,
  udyam_expiry_date DATE,
  udyam_is_expired BOOLEAN DEFAULT FALSE,
  udyam_document_version INTEGER DEFAULT 1,
  udyam_document_metadata JSONB DEFAULT '{}'::jsonb,
  udyam_uploaded_by INTEGER,
  udyam_created_at TIMESTAMP WITH TIME ZONE,
  udyam_updated_at TIMESTAMP WITH TIME ZONE,
  
  -- PHARMACIST_CERTIFICATE Document
  pharmacist_certificate_document_number TEXT,
  pharmacist_certificate_document_url TEXT,
  pharmacist_certificate_document_name TEXT,
  pharmacist_certificate_is_verified BOOLEAN DEFAULT FALSE,
  pharmacist_certificate_verified_by INTEGER,
  pharmacist_certificate_verified_at TIMESTAMP WITH TIME ZONE,
  pharmacist_certificate_rejection_reason TEXT,
  pharmacist_certificate_issued_date DATE,
  pharmacist_certificate_expiry_date DATE,
  pharmacist_certificate_is_expired BOOLEAN DEFAULT FALSE,
  pharmacist_certificate_document_version INTEGER DEFAULT 1,
  pharmacist_certificate_document_metadata JSONB DEFAULT '{}'::jsonb,
  pharmacist_certificate_uploaded_by INTEGER,
  pharmacist_certificate_created_at TIMESTAMP WITH TIME ZONE,
  pharmacist_certificate_updated_at TIMESTAMP WITH TIME ZONE,
  
  -- PHARMACY_COUNCIL_REGISTRATION Document (maps to PHARMACIST_REGISTRATION_NUMBER or STATE_PHARMACY_COUNCIL_PROOF)
  pharmacy_council_registration_document_number TEXT,
  pharmacy_council_registration_document_url TEXT,
  pharmacy_council_registration_document_name TEXT,
  pharmacy_council_registration_type TEXT, -- 'REGISTRATION_NUMBER' or 'COUNCIL_PROOF'
  pharmacy_council_registration_is_verified BOOLEAN DEFAULT FALSE,
  pharmacy_council_registration_verified_by INTEGER,
  pharmacy_council_registration_verified_at TIMESTAMP WITH TIME ZONE,
  pharmacy_council_registration_rejection_reason TEXT,
  pharmacy_council_registration_issued_date DATE,
  pharmacy_council_registration_expiry_date DATE,
  pharmacy_council_registration_is_expired BOOLEAN DEFAULT FALSE,
  pharmacy_council_registration_document_version INTEGER DEFAULT 1,
  pharmacy_council_registration_document_metadata JSONB DEFAULT '{}'::jsonb,
  pharmacy_council_registration_uploaded_by INTEGER,
  pharmacy_council_registration_created_at TIMESTAMP WITH TIME ZONE,
  pharmacy_council_registration_updated_at TIMESTAMP WITH TIME ZONE,
  
  -- BANK_PROOF Document
  bank_proof_document_number TEXT,
  bank_proof_document_url TEXT,
  bank_proof_document_name TEXT,
  bank_proof_is_verified BOOLEAN DEFAULT FALSE,
  bank_proof_verified_by INTEGER,
  bank_proof_verified_at TIMESTAMP WITH TIME ZONE,
  bank_proof_rejection_reason TEXT,
  bank_proof_issued_date DATE,
  bank_proof_expiry_date DATE,
  bank_proof_is_expired BOOLEAN DEFAULT FALSE,
  bank_proof_document_version INTEGER DEFAULT 1,
  bank_proof_document_metadata JSONB DEFAULT '{}'::jsonb,
  bank_proof_uploaded_by INTEGER,
  bank_proof_created_at TIMESTAMP WITH TIME ZONE,
  bank_proof_updated_at TIMESTAMP WITH TIME ZONE,
  
  -- OTHER Document
  other_document_number TEXT,
  other_document_url TEXT,
  other_document_name TEXT,
  other_document_type TEXT, -- For specifying what "other" document it is
  other_is_verified BOOLEAN DEFAULT FALSE,
  other_verified_by INTEGER,
  other_verified_at TIMESTAMP WITH TIME ZONE,
  other_rejection_reason TEXT,
  other_issued_date DATE,
  other_expiry_date DATE,
  other_is_expired BOOLEAN DEFAULT FALSE,
  other_document_version INTEGER DEFAULT 1,
  other_document_metadata JSONB DEFAULT '{}'::jsonb,
  other_uploaded_by INTEGER,
  other_created_at TIMESTAMP WITH TIME ZONE,
  other_updated_at TIMESTAMP WITH TIME ZONE,
  
  -- Global audit fields
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- ============================================================================
-- STEP 2: MIGRATE EXISTING DATA
-- ============================================================================

-- Migrate data from old table (multiple rows per store) to new table (1 row per store)
-- Only migrate if old table exists and has data
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables 
    WHERE table_schema = 'public' 
    AND table_name = 'merchant_store_documents'
  ) THEN
    INSERT INTO merchant_store_documents_new (
      store_id,
      -- PAN
      pan_document_number, pan_document_url, pan_document_name,
      pan_is_verified, pan_verified_by, pan_verified_at, pan_rejection_reason,
      pan_issued_date, pan_expiry_date, pan_is_expired, pan_document_version,
      pan_document_metadata, pan_uploaded_by, pan_created_at, pan_updated_at,
      -- GST
      gst_document_number, gst_document_url, gst_document_name,
      gst_is_verified, gst_verified_by, gst_verified_at, gst_rejection_reason,
      gst_issued_date, gst_expiry_date, gst_is_expired, gst_document_version,
      gst_document_metadata, gst_uploaded_by, gst_created_at, gst_updated_at,
      -- AADHAAR
      aadhaar_document_number, aadhaar_document_url, aadhaar_document_name,
      aadhaar_is_verified, aadhaar_verified_by, aadhaar_verified_at, aadhaar_rejection_reason,
      aadhaar_issued_date, aadhaar_expiry_date, aadhaar_is_expired, aadhaar_document_version,
      aadhaar_document_metadata, aadhaar_uploaded_by, aadhaar_created_at, aadhaar_updated_at,
      -- FSSAI
      fssai_document_number, fssai_document_url, fssai_document_name,
      fssai_is_verified, fssai_verified_by, fssai_verified_at, fssai_rejection_reason,
      fssai_issued_date, fssai_expiry_date, fssai_is_expired, fssai_document_version,
      fssai_document_metadata, fssai_uploaded_by, fssai_created_at, fssai_updated_at,
      -- TRADE_LICENSE
      trade_license_document_number, trade_license_document_url, trade_license_document_name,
      trade_license_is_verified, trade_license_verified_by, trade_license_verified_at, trade_license_rejection_reason,
      trade_license_issued_date, trade_license_expiry_date, trade_license_is_expired, trade_license_document_version,
      trade_license_document_metadata, trade_license_uploaded_by, trade_license_created_at, trade_license_updated_at,
      -- DRUG_LICENSE
      drug_license_document_number, drug_license_document_url, drug_license_document_name, drug_license_type,
      drug_license_is_verified, drug_license_verified_by, drug_license_verified_at, drug_license_rejection_reason,
      drug_license_issued_date, drug_license_expiry_date, drug_license_is_expired, drug_license_document_version,
      drug_license_document_metadata, drug_license_uploaded_by, drug_license_created_at, drug_license_updated_at,
      -- SHOP_ESTABLISHMENT
      shop_establishment_document_number, shop_establishment_document_url, shop_establishment_document_name,
      shop_establishment_is_verified, shop_establishment_verified_by, shop_establishment_verified_at, shop_establishment_rejection_reason,
      shop_establishment_issued_date, shop_establishment_expiry_date, shop_establishment_is_expired, shop_establishment_document_version,
      shop_establishment_document_metadata, shop_establishment_uploaded_by, shop_establishment_created_at, shop_establishment_updated_at,
      -- UDYAM
      udyam_document_number, udyam_document_url, udyam_document_name,
      udyam_is_verified, udyam_verified_by, udyam_verified_at, udyam_rejection_reason,
      udyam_issued_date, udyam_expiry_date, udyam_is_expired, udyam_document_version,
      udyam_document_metadata, udyam_uploaded_by, udyam_created_at, udyam_updated_at,
      -- PHARMACIST_CERTIFICATE
      pharmacist_certificate_document_number, pharmacist_certificate_document_url, pharmacist_certificate_document_name,
      pharmacist_certificate_is_verified, pharmacist_certificate_verified_by, pharmacist_certificate_verified_at, pharmacist_certificate_rejection_reason,
      pharmacist_certificate_issued_date, pharmacist_certificate_expiry_date, pharmacist_certificate_is_expired, pharmacist_certificate_document_version,
      pharmacist_certificate_document_metadata, pharmacist_certificate_uploaded_by, pharmacist_certificate_created_at, pharmacist_certificate_updated_at,
      -- PHARMACY_COUNCIL_REGISTRATION
      pharmacy_council_registration_document_number, pharmacy_council_registration_document_url, pharmacy_council_registration_document_name, pharmacy_council_registration_type,
      pharmacy_council_registration_is_verified, pharmacy_council_registration_verified_by, pharmacy_council_registration_verified_at, pharmacy_council_registration_rejection_reason,
      pharmacy_council_registration_issued_date, pharmacy_council_registration_expiry_date, pharmacy_council_registration_is_expired, pharmacy_council_registration_document_version,
      pharmacy_council_registration_document_metadata, pharmacy_council_registration_uploaded_by, pharmacy_council_registration_created_at, pharmacy_council_registration_updated_at,
      -- BANK_PROOF
      bank_proof_document_number, bank_proof_document_url, bank_proof_document_name,
      bank_proof_is_verified, bank_proof_verified_by, bank_proof_verified_at, bank_proof_rejection_reason,
      bank_proof_issued_date, bank_proof_expiry_date, bank_proof_is_expired, bank_proof_document_version,
      bank_proof_document_metadata, bank_proof_uploaded_by, bank_proof_created_at, bank_proof_updated_at,
      -- OTHER
      other_document_number, other_document_url, other_document_name, other_document_type,
      other_is_verified, other_verified_by, other_verified_at, other_rejection_reason,
      other_issued_date, other_expiry_date, other_is_expired, other_document_version,
      other_document_metadata, other_uploaded_by, other_created_at, other_updated_at,
      created_at, updated_at
    )
    SELECT 
      msd.store_id,
      -- PAN (only latest version where is_latest = TRUE)
      MAX(CASE WHEN msd.document_type::text IN ('PAN', 'PAN_IMAGE') AND msd.is_latest = TRUE THEN msd.document_number END),
      MAX(CASE WHEN msd.document_type::text IN ('PAN', 'PAN_IMAGE') AND msd.is_latest = TRUE THEN msd.document_url END),
      MAX(CASE WHEN msd.document_type::text IN ('PAN', 'PAN_IMAGE') AND msd.is_latest = TRUE THEN msd.document_name END),
      BOOL_OR(CASE WHEN msd.document_type::text IN ('PAN', 'PAN_IMAGE') AND msd.is_latest = TRUE THEN msd.is_verified ELSE FALSE END),
      MAX(CASE WHEN msd.document_type::text IN ('PAN', 'PAN_IMAGE') AND msd.is_latest = TRUE THEN msd.verified_by END),
      MAX(CASE WHEN msd.document_type::text IN ('PAN', 'PAN_IMAGE') AND msd.is_latest = TRUE THEN msd.verified_at END),
      MAX(CASE WHEN msd.document_type::text IN ('PAN', 'PAN_IMAGE') AND msd.is_latest = TRUE THEN msd.rejection_reason END),
      MAX(CASE WHEN msd.document_type::text IN ('PAN', 'PAN_IMAGE') AND msd.is_latest = TRUE THEN msd.issued_date END),
      MAX(CASE WHEN msd.document_type::text IN ('PAN', 'PAN_IMAGE') AND msd.is_latest = TRUE THEN msd.expiry_date END),
      BOOL_OR(CASE WHEN msd.document_type::text IN ('PAN', 'PAN_IMAGE') AND msd.is_latest = TRUE THEN msd.is_expired ELSE FALSE END),
      MAX(CASE WHEN msd.document_type::text IN ('PAN', 'PAN_IMAGE') AND msd.is_latest = TRUE THEN msd.document_version END),
      COALESCE((array_agg(CASE WHEN msd.document_type::text IN ('PAN', 'PAN_IMAGE') AND msd.is_latest = TRUE THEN msd.document_metadata END ORDER BY msd.created_at DESC))[1]::jsonb, '{}'::jsonb),
      MAX(CASE WHEN msd.document_type::text IN ('PAN', 'PAN_IMAGE') AND msd.is_latest = TRUE THEN msd.uploaded_by END),
      MAX(CASE WHEN msd.document_type::text IN ('PAN', 'PAN_IMAGE') AND msd.is_latest = TRUE THEN msd.created_at END),
      MAX(CASE WHEN msd.document_type::text IN ('PAN', 'PAN_IMAGE') AND msd.is_latest = TRUE THEN msd.updated_at END),
      -- GST
      MAX(CASE WHEN msd.document_type::text IN ('GST', 'GST_IMAGE') AND msd.is_latest = TRUE THEN msd.document_number END),
      MAX(CASE WHEN msd.document_type::text IN ('GST', 'GST_IMAGE') AND msd.is_latest = TRUE THEN msd.document_url END),
      MAX(CASE WHEN msd.document_type::text IN ('GST', 'GST_IMAGE') AND msd.is_latest = TRUE THEN msd.document_name END),
      BOOL_OR(CASE WHEN msd.document_type::text IN ('GST', 'GST_IMAGE') AND msd.is_latest = TRUE THEN msd.is_verified ELSE FALSE END),
      MAX(CASE WHEN msd.document_type::text IN ('GST', 'GST_IMAGE') AND msd.is_latest = TRUE THEN msd.verified_by END),
      MAX(CASE WHEN msd.document_type::text IN ('GST', 'GST_IMAGE') AND msd.is_latest = TRUE THEN msd.verified_at END),
      MAX(CASE WHEN msd.document_type::text IN ('GST', 'GST_IMAGE') AND msd.is_latest = TRUE THEN msd.rejection_reason END),
      MAX(CASE WHEN msd.document_type::text IN ('GST', 'GST_IMAGE') AND msd.is_latest = TRUE THEN msd.issued_date END),
      MAX(CASE WHEN msd.document_type::text IN ('GST', 'GST_IMAGE') AND msd.is_latest = TRUE THEN msd.expiry_date END),
      BOOL_OR(CASE WHEN msd.document_type::text IN ('GST', 'GST_IMAGE') AND msd.is_latest = TRUE THEN msd.is_expired ELSE FALSE END),
      MAX(CASE WHEN msd.document_type::text IN ('GST', 'GST_IMAGE') AND msd.is_latest = TRUE THEN msd.document_version END),
      COALESCE((array_agg(CASE WHEN msd.document_type::text IN ('GST', 'GST_IMAGE') AND msd.is_latest = TRUE THEN msd.document_metadata END ORDER BY msd.created_at DESC))[1]::jsonb, '{}'::jsonb),
      MAX(CASE WHEN msd.document_type::text IN ('GST', 'GST_IMAGE') AND msd.is_latest = TRUE THEN msd.uploaded_by END),
      MAX(CASE WHEN msd.document_type::text IN ('GST', 'GST_IMAGE') AND msd.is_latest = TRUE THEN msd.created_at END),
      MAX(CASE WHEN msd.document_type::text IN ('GST', 'GST_IMAGE') AND msd.is_latest = TRUE THEN msd.updated_at END),
      -- AADHAAR
      MAX(CASE WHEN msd.document_type::text IN ('AADHAAR', 'AADHAR', 'AADHAAR_FRONT', 'AADHAAR_BACK', 'AADHAR_FRONT', 'AADHAR_BACK') AND msd.is_latest = TRUE THEN msd.document_number END),
      MAX(CASE WHEN msd.document_type::text IN ('AADHAAR', 'AADHAR', 'AADHAAR_FRONT', 'AADHAAR_BACK', 'AADHAR_FRONT', 'AADHAR_BACK') AND msd.is_latest = TRUE THEN msd.document_url END),
      MAX(CASE WHEN msd.document_type::text IN ('AADHAAR', 'AADHAR', 'AADHAAR_FRONT', 'AADHAAR_BACK', 'AADHAR_FRONT', 'AADHAR_BACK') AND msd.is_latest = TRUE THEN msd.document_name END),
      BOOL_OR(CASE WHEN msd.document_type::text IN ('AADHAAR', 'AADHAR', 'AADHAAR_FRONT', 'AADHAAR_BACK', 'AADHAR_FRONT', 'AADHAR_BACK') AND msd.is_latest = TRUE THEN msd.is_verified ELSE FALSE END),
      MAX(CASE WHEN msd.document_type::text IN ('AADHAAR', 'AADHAR', 'AADHAAR_FRONT', 'AADHAAR_BACK', 'AADHAR_FRONT', 'AADHAR_BACK') AND msd.is_latest = TRUE THEN msd.verified_by END),
      MAX(CASE WHEN msd.document_type::text IN ('AADHAAR', 'AADHAR', 'AADHAAR_FRONT', 'AADHAAR_BACK', 'AADHAR_FRONT', 'AADHAR_BACK') AND msd.is_latest = TRUE THEN msd.verified_at END),
      MAX(CASE WHEN msd.document_type::text IN ('AADHAAR', 'AADHAR', 'AADHAAR_FRONT', 'AADHAAR_BACK', 'AADHAR_FRONT', 'AADHAR_BACK') AND msd.is_latest = TRUE THEN msd.rejection_reason END),
      MAX(CASE WHEN msd.document_type::text IN ('AADHAAR', 'AADHAR', 'AADHAAR_FRONT', 'AADHAAR_BACK', 'AADHAR_FRONT', 'AADHAR_BACK') AND msd.is_latest = TRUE THEN msd.issued_date END),
      MAX(CASE WHEN msd.document_type::text IN ('AADHAAR', 'AADHAR', 'AADHAAR_FRONT', 'AADHAAR_BACK', 'AADHAR_FRONT', 'AADHAR_BACK') AND msd.is_latest = TRUE THEN msd.expiry_date END),
      BOOL_OR(CASE WHEN msd.document_type::text IN ('AADHAAR', 'AADHAR', 'AADHAAR_FRONT', 'AADHAAR_BACK', 'AADHAR_FRONT', 'AADHAR_BACK') AND msd.is_latest = TRUE THEN msd.is_expired ELSE FALSE END),
      MAX(CASE WHEN msd.document_type::text IN ('AADHAAR', 'AADHAR', 'AADHAAR_FRONT', 'AADHAAR_BACK', 'AADHAR_FRONT', 'AADHAR_BACK') AND msd.is_latest = TRUE THEN msd.document_version END),
      COALESCE((array_agg(CASE WHEN msd.document_type::text IN ('AADHAAR', 'AADHAR', 'AADHAAR_FRONT', 'AADHAAR_BACK', 'AADHAR_FRONT', 'AADHAR_BACK') AND msd.is_latest = TRUE THEN msd.document_metadata END ORDER BY msd.created_at DESC))[1]::jsonb, '{}'::jsonb),
      MAX(CASE WHEN msd.document_type::text IN ('AADHAAR', 'AADHAR', 'AADHAAR_FRONT', 'AADHAAR_BACK', 'AADHAR_FRONT', 'AADHAR_BACK') AND msd.is_latest = TRUE THEN msd.uploaded_by END),
      MAX(CASE WHEN msd.document_type::text IN ('AADHAAR', 'AADHAR', 'AADHAAR_FRONT', 'AADHAAR_BACK', 'AADHAR_FRONT', 'AADHAR_BACK') AND msd.is_latest = TRUE THEN msd.created_at END),
      MAX(CASE WHEN msd.document_type::text IN ('AADHAAR', 'AADHAR', 'AADHAAR_FRONT', 'AADHAAR_BACK', 'AADHAR_FRONT', 'AADHAR_BACK') AND msd.is_latest = TRUE THEN msd.updated_at END),
      -- FSSAI
      MAX(CASE WHEN msd.document_type::text IN ('FSSAI', 'FSSAI_IMAGE') AND msd.is_latest = TRUE THEN msd.document_number END),
      MAX(CASE WHEN msd.document_type::text IN ('FSSAI', 'FSSAI_IMAGE') AND msd.is_latest = TRUE THEN msd.document_url END),
      MAX(CASE WHEN msd.document_type::text IN ('FSSAI', 'FSSAI_IMAGE') AND msd.is_latest = TRUE THEN msd.document_name END),
      BOOL_OR(CASE WHEN msd.document_type::text IN ('FSSAI', 'FSSAI_IMAGE') AND msd.is_latest = TRUE THEN msd.is_verified ELSE FALSE END),
      MAX(CASE WHEN msd.document_type::text IN ('FSSAI', 'FSSAI_IMAGE') AND msd.is_latest = TRUE THEN msd.verified_by END),
      MAX(CASE WHEN msd.document_type::text IN ('FSSAI', 'FSSAI_IMAGE') AND msd.is_latest = TRUE THEN msd.verified_at END),
      MAX(CASE WHEN msd.document_type::text IN ('FSSAI', 'FSSAI_IMAGE') AND msd.is_latest = TRUE THEN msd.rejection_reason END),
      MAX(CASE WHEN msd.document_type::text IN ('FSSAI', 'FSSAI_IMAGE') AND msd.is_latest = TRUE THEN msd.issued_date END),
      MAX(CASE WHEN msd.document_type::text IN ('FSSAI', 'FSSAI_IMAGE') AND msd.is_latest = TRUE THEN msd.expiry_date END),
      BOOL_OR(CASE WHEN msd.document_type::text IN ('FSSAI', 'FSSAI_IMAGE') AND msd.is_latest = TRUE THEN msd.is_expired ELSE FALSE END),
      MAX(CASE WHEN msd.document_type::text IN ('FSSAI', 'FSSAI_IMAGE') AND msd.is_latest = TRUE THEN msd.document_version END),
      COALESCE((array_agg(CASE WHEN msd.document_type::text IN ('FSSAI', 'FSSAI_IMAGE') AND msd.is_latest = TRUE THEN msd.document_metadata END ORDER BY msd.created_at DESC))[1]::jsonb, '{}'::jsonb),
      MAX(CASE WHEN msd.document_type::text IN ('FSSAI', 'FSSAI_IMAGE') AND msd.is_latest = TRUE THEN msd.uploaded_by END),
      MAX(CASE WHEN msd.document_type::text IN ('FSSAI', 'FSSAI_IMAGE') AND msd.is_latest = TRUE THEN msd.created_at END),
      MAX(CASE WHEN msd.document_type::text IN ('FSSAI', 'FSSAI_IMAGE') AND msd.is_latest = TRUE THEN msd.updated_at END),
      -- TRADE_LICENSE
      MAX(CASE WHEN msd.document_type::text IN ('TRADE_LICENSE', 'TRADE_LICENSE_IMAGE') AND msd.is_latest = TRUE THEN msd.document_number END),
      MAX(CASE WHEN msd.document_type::text IN ('TRADE_LICENSE', 'TRADE_LICENSE_IMAGE') AND msd.is_latest = TRUE THEN msd.document_url END),
      MAX(CASE WHEN msd.document_type::text IN ('TRADE_LICENSE', 'TRADE_LICENSE_IMAGE') AND msd.is_latest = TRUE THEN msd.document_name END),
      BOOL_OR(CASE WHEN msd.document_type::text IN ('TRADE_LICENSE', 'TRADE_LICENSE_IMAGE') AND msd.is_latest = TRUE THEN msd.is_verified ELSE FALSE END),
      MAX(CASE WHEN msd.document_type::text IN ('TRADE_LICENSE', 'TRADE_LICENSE_IMAGE') AND msd.is_latest = TRUE THEN msd.verified_by END),
      MAX(CASE WHEN msd.document_type::text IN ('TRADE_LICENSE', 'TRADE_LICENSE_IMAGE') AND msd.is_latest = TRUE THEN msd.verified_at END),
      MAX(CASE WHEN msd.document_type::text IN ('TRADE_LICENSE', 'TRADE_LICENSE_IMAGE') AND msd.is_latest = TRUE THEN msd.rejection_reason END),
      MAX(CASE WHEN msd.document_type::text IN ('TRADE_LICENSE', 'TRADE_LICENSE_IMAGE') AND msd.is_latest = TRUE THEN msd.issued_date END),
      MAX(CASE WHEN msd.document_type::text IN ('TRADE_LICENSE', 'TRADE_LICENSE_IMAGE') AND msd.is_latest = TRUE THEN msd.expiry_date END),
      BOOL_OR(CASE WHEN msd.document_type::text IN ('TRADE_LICENSE', 'TRADE_LICENSE_IMAGE') AND msd.is_latest = TRUE THEN msd.is_expired ELSE FALSE END),
      MAX(CASE WHEN msd.document_type::text IN ('TRADE_LICENSE', 'TRADE_LICENSE_IMAGE') AND msd.is_latest = TRUE THEN msd.document_version END),
      COALESCE((array_agg(CASE WHEN msd.document_type::text IN ('TRADE_LICENSE', 'TRADE_LICENSE_IMAGE') AND msd.is_latest = TRUE THEN msd.document_metadata END ORDER BY msd.created_at DESC))[1]::jsonb, '{}'::jsonb),
      MAX(CASE WHEN msd.document_type::text IN ('TRADE_LICENSE', 'TRADE_LICENSE_IMAGE') AND msd.is_latest = TRUE THEN msd.uploaded_by END),
      MAX(CASE WHEN msd.document_type::text IN ('TRADE_LICENSE', 'TRADE_LICENSE_IMAGE') AND msd.is_latest = TRUE THEN msd.created_at END),
      MAX(CASE WHEN msd.document_type::text IN ('TRADE_LICENSE', 'TRADE_LICENSE_IMAGE') AND msd.is_latest = TRUE THEN msd.updated_at END),
      -- DRUG_LICENSE (RETAIL_DRUG_LICENSE or WHOLESALE_DRUG_LICENSE)
      MAX(CASE WHEN msd.document_type::text IN ('DRUG_LICENSE', 'DRUG_LICENSE_IMAGE', 'RETAIL_DRUG_LICENSE', 'WHOLESALE_DRUG_LICENSE') AND msd.is_latest = TRUE THEN msd.document_number END),
      MAX(CASE WHEN msd.document_type::text IN ('DRUG_LICENSE', 'DRUG_LICENSE_IMAGE', 'RETAIL_DRUG_LICENSE', 'WHOLESALE_DRUG_LICENSE') AND msd.is_latest = TRUE THEN msd.document_url END),
      MAX(CASE WHEN msd.document_type::text IN ('DRUG_LICENSE', 'DRUG_LICENSE_IMAGE', 'RETAIL_DRUG_LICENSE', 'WHOLESALE_DRUG_LICENSE') AND msd.is_latest = TRUE THEN msd.document_name END),
      MAX(CASE WHEN msd.document_type::text IN ('RETAIL_DRUG_LICENSE') AND msd.is_latest = TRUE THEN 'RETAIL'
               WHEN msd.document_type::text IN ('WHOLESALE_DRUG_LICENSE') AND msd.is_latest = TRUE THEN 'WHOLESALE'
               WHEN msd.document_type::text IN ('DRUG_LICENSE', 'DRUG_LICENSE_IMAGE') AND msd.is_latest = TRUE THEN 'RETAIL' END),
      BOOL_OR(CASE WHEN msd.document_type::text IN ('DRUG_LICENSE', 'DRUG_LICENSE_IMAGE', 'RETAIL_DRUG_LICENSE', 'WHOLESALE_DRUG_LICENSE') AND msd.is_latest = TRUE THEN msd.is_verified ELSE FALSE END),
      MAX(CASE WHEN msd.document_type::text IN ('DRUG_LICENSE', 'DRUG_LICENSE_IMAGE', 'RETAIL_DRUG_LICENSE', 'WHOLESALE_DRUG_LICENSE') AND msd.is_latest = TRUE THEN msd.verified_by END),
      MAX(CASE WHEN msd.document_type::text IN ('DRUG_LICENSE', 'DRUG_LICENSE_IMAGE', 'RETAIL_DRUG_LICENSE', 'WHOLESALE_DRUG_LICENSE') AND msd.is_latest = TRUE THEN msd.verified_at END),
      MAX(CASE WHEN msd.document_type::text IN ('DRUG_LICENSE', 'DRUG_LICENSE_IMAGE', 'RETAIL_DRUG_LICENSE', 'WHOLESALE_DRUG_LICENSE') AND msd.is_latest = TRUE THEN msd.rejection_reason END),
      MAX(CASE WHEN msd.document_type::text IN ('DRUG_LICENSE', 'DRUG_LICENSE_IMAGE', 'RETAIL_DRUG_LICENSE', 'WHOLESALE_DRUG_LICENSE') AND msd.is_latest = TRUE THEN msd.issued_date END),
      MAX(CASE WHEN msd.document_type::text IN ('DRUG_LICENSE', 'DRUG_LICENSE_IMAGE', 'RETAIL_DRUG_LICENSE', 'WHOLESALE_DRUG_LICENSE') AND msd.is_latest = TRUE THEN msd.expiry_date END),
      BOOL_OR(CASE WHEN msd.document_type::text IN ('DRUG_LICENSE', 'DRUG_LICENSE_IMAGE', 'RETAIL_DRUG_LICENSE', 'WHOLESALE_DRUG_LICENSE') AND msd.is_latest = TRUE THEN msd.is_expired ELSE FALSE END),
      MAX(CASE WHEN msd.document_type::text IN ('DRUG_LICENSE', 'DRUG_LICENSE_IMAGE', 'RETAIL_DRUG_LICENSE', 'WHOLESALE_DRUG_LICENSE') AND msd.is_latest = TRUE THEN msd.document_version END),
      COALESCE((array_agg(CASE WHEN msd.document_type::text IN ('DRUG_LICENSE', 'DRUG_LICENSE_IMAGE', 'RETAIL_DRUG_LICENSE', 'WHOLESALE_DRUG_LICENSE') AND msd.is_latest = TRUE THEN msd.document_metadata END ORDER BY msd.created_at DESC))[1]::jsonb, '{}'::jsonb),
      MAX(CASE WHEN msd.document_type::text IN ('DRUG_LICENSE', 'DRUG_LICENSE_IMAGE', 'RETAIL_DRUG_LICENSE', 'WHOLESALE_DRUG_LICENSE') AND msd.is_latest = TRUE THEN msd.uploaded_by END),
      MAX(CASE WHEN msd.document_type::text IN ('DRUG_LICENSE', 'DRUG_LICENSE_IMAGE', 'RETAIL_DRUG_LICENSE', 'WHOLESALE_DRUG_LICENSE') AND msd.is_latest = TRUE THEN msd.created_at END),
      MAX(CASE WHEN msd.document_type::text IN ('DRUG_LICENSE', 'DRUG_LICENSE_IMAGE', 'RETAIL_DRUG_LICENSE', 'WHOLESALE_DRUG_LICENSE') AND msd.is_latest = TRUE THEN msd.updated_at END),
      -- SHOP_ESTABLISHMENT (SHOP_ACT)
      MAX(CASE WHEN msd.document_type::text IN ('SHOP_ESTABLISHMENT', 'SHOP_ESTABLISHMENT_IMAGE', 'SHOP_ACT') AND msd.is_latest = TRUE THEN msd.document_number END),
      MAX(CASE WHEN msd.document_type::text IN ('SHOP_ESTABLISHMENT', 'SHOP_ESTABLISHMENT_IMAGE', 'SHOP_ACT') AND msd.is_latest = TRUE THEN msd.document_url END),
      MAX(CASE WHEN msd.document_type::text IN ('SHOP_ESTABLISHMENT', 'SHOP_ESTABLISHMENT_IMAGE', 'SHOP_ACT') AND msd.is_latest = TRUE THEN msd.document_name END),
      BOOL_OR(CASE WHEN msd.document_type::text IN ('SHOP_ESTABLISHMENT', 'SHOP_ESTABLISHMENT_IMAGE', 'SHOP_ACT') AND msd.is_latest = TRUE THEN msd.is_verified ELSE FALSE END),
      MAX(CASE WHEN msd.document_type::text IN ('SHOP_ESTABLISHMENT', 'SHOP_ESTABLISHMENT_IMAGE', 'SHOP_ACT') AND msd.is_latest = TRUE THEN msd.verified_by END),
      MAX(CASE WHEN msd.document_type::text IN ('SHOP_ESTABLISHMENT', 'SHOP_ESTABLISHMENT_IMAGE', 'SHOP_ACT') AND msd.is_latest = TRUE THEN msd.verified_at END),
      MAX(CASE WHEN msd.document_type::text IN ('SHOP_ESTABLISHMENT', 'SHOP_ESTABLISHMENT_IMAGE', 'SHOP_ACT') AND msd.is_latest = TRUE THEN msd.rejection_reason END),
      MAX(CASE WHEN msd.document_type::text IN ('SHOP_ESTABLISHMENT', 'SHOP_ESTABLISHMENT_IMAGE', 'SHOP_ACT') AND msd.is_latest = TRUE THEN msd.issued_date END),
      MAX(CASE WHEN msd.document_type::text IN ('SHOP_ESTABLISHMENT', 'SHOP_ESTABLISHMENT_IMAGE', 'SHOP_ACT') AND msd.is_latest = TRUE THEN msd.expiry_date END),
      BOOL_OR(CASE WHEN msd.document_type::text IN ('SHOP_ESTABLISHMENT', 'SHOP_ESTABLISHMENT_IMAGE', 'SHOP_ACT') AND msd.is_latest = TRUE THEN msd.is_expired ELSE FALSE END),
      MAX(CASE WHEN msd.document_type::text IN ('SHOP_ESTABLISHMENT', 'SHOP_ESTABLISHMENT_IMAGE', 'SHOP_ACT') AND msd.is_latest = TRUE THEN msd.document_version END),
      COALESCE((array_agg(CASE WHEN msd.document_type::text IN ('SHOP_ESTABLISHMENT', 'SHOP_ESTABLISHMENT_IMAGE', 'SHOP_ACT') AND msd.is_latest = TRUE THEN msd.document_metadata END ORDER BY msd.created_at DESC))[1]::jsonb, '{}'::jsonb),
      MAX(CASE WHEN msd.document_type::text IN ('SHOP_ESTABLISHMENT', 'SHOP_ESTABLISHMENT_IMAGE', 'SHOP_ACT') AND msd.is_latest = TRUE THEN msd.uploaded_by END),
      MAX(CASE WHEN msd.document_type::text IN ('SHOP_ESTABLISHMENT', 'SHOP_ESTABLISHMENT_IMAGE', 'SHOP_ACT') AND msd.is_latest = TRUE THEN msd.created_at END),
      MAX(CASE WHEN msd.document_type::text IN ('SHOP_ESTABLISHMENT', 'SHOP_ESTABLISHMENT_IMAGE', 'SHOP_ACT') AND msd.is_latest = TRUE THEN msd.updated_at END),
      -- UDYAM
      MAX(CASE WHEN msd.document_type::text IN ('UDYAM', 'UDYAM_IMAGE') AND msd.is_latest = TRUE THEN msd.document_number END),
      MAX(CASE WHEN msd.document_type::text IN ('UDYAM', 'UDYAM_IMAGE') AND msd.is_latest = TRUE THEN msd.document_url END),
      MAX(CASE WHEN msd.document_type::text IN ('UDYAM', 'UDYAM_IMAGE') AND msd.is_latest = TRUE THEN msd.document_name END),
      BOOL_OR(CASE WHEN msd.document_type::text IN ('UDYAM', 'UDYAM_IMAGE') AND msd.is_latest = TRUE THEN msd.is_verified ELSE FALSE END),
      MAX(CASE WHEN msd.document_type::text IN ('UDYAM', 'UDYAM_IMAGE') AND msd.is_latest = TRUE THEN msd.verified_by END),
      MAX(CASE WHEN msd.document_type::text IN ('UDYAM', 'UDYAM_IMAGE') AND msd.is_latest = TRUE THEN msd.verified_at END),
      MAX(CASE WHEN msd.document_type::text IN ('UDYAM', 'UDYAM_IMAGE') AND msd.is_latest = TRUE THEN msd.rejection_reason END),
      MAX(CASE WHEN msd.document_type::text IN ('UDYAM', 'UDYAM_IMAGE') AND msd.is_latest = TRUE THEN msd.issued_date END),
      MAX(CASE WHEN msd.document_type::text IN ('UDYAM', 'UDYAM_IMAGE') AND msd.is_latest = TRUE THEN msd.expiry_date END),
      BOOL_OR(CASE WHEN msd.document_type::text IN ('UDYAM', 'UDYAM_IMAGE') AND msd.is_latest = TRUE THEN msd.is_expired ELSE FALSE END),
      MAX(CASE WHEN msd.document_type::text IN ('UDYAM', 'UDYAM_IMAGE') AND msd.is_latest = TRUE THEN msd.document_version END),
      COALESCE((array_agg(CASE WHEN msd.document_type::text IN ('UDYAM', 'UDYAM_IMAGE') AND msd.is_latest = TRUE THEN msd.document_metadata END ORDER BY msd.created_at DESC))[1]::jsonb, '{}'::jsonb),
      MAX(CASE WHEN msd.document_type::text IN ('UDYAM', 'UDYAM_IMAGE') AND msd.is_latest = TRUE THEN msd.uploaded_by END),
      MAX(CASE WHEN msd.document_type::text IN ('UDYAM', 'UDYAM_IMAGE') AND msd.is_latest = TRUE THEN msd.created_at END),
      MAX(CASE WHEN msd.document_type::text IN ('UDYAM', 'UDYAM_IMAGE') AND msd.is_latest = TRUE THEN msd.updated_at END),
      -- PHARMACIST_CERTIFICATE
      MAX(CASE WHEN msd.document_type::text = 'PHARMACIST_CERTIFICATE' AND msd.is_latest = TRUE THEN msd.document_number END),
      MAX(CASE WHEN msd.document_type::text = 'PHARMACIST_CERTIFICATE' AND msd.is_latest = TRUE THEN msd.document_url END),
      MAX(CASE WHEN msd.document_type::text = 'PHARMACIST_CERTIFICATE' AND msd.is_latest = TRUE THEN msd.document_name END),
      BOOL_OR(CASE WHEN msd.document_type::text = 'PHARMACIST_CERTIFICATE' AND msd.is_latest = TRUE THEN msd.is_verified ELSE FALSE END),
      MAX(CASE WHEN msd.document_type::text = 'PHARMACIST_CERTIFICATE' AND msd.is_latest = TRUE THEN msd.verified_by END),
      MAX(CASE WHEN msd.document_type::text = 'PHARMACIST_CERTIFICATE' AND msd.is_latest = TRUE THEN msd.verified_at END),
      MAX(CASE WHEN msd.document_type::text = 'PHARMACIST_CERTIFICATE' AND msd.is_latest = TRUE THEN msd.rejection_reason END),
      MAX(CASE WHEN msd.document_type::text = 'PHARMACIST_CERTIFICATE' AND msd.is_latest = TRUE THEN msd.issued_date END),
      MAX(CASE WHEN msd.document_type::text = 'PHARMACIST_CERTIFICATE' AND msd.is_latest = TRUE THEN msd.expiry_date END),
      BOOL_OR(CASE WHEN msd.document_type::text = 'PHARMACIST_CERTIFICATE' AND msd.is_latest = TRUE THEN msd.is_expired ELSE FALSE END),
      MAX(CASE WHEN msd.document_type::text = 'PHARMACIST_CERTIFICATE' AND msd.is_latest = TRUE THEN msd.document_version END),
      COALESCE((array_agg(CASE WHEN msd.document_type::text = 'PHARMACIST_CERTIFICATE' AND msd.is_latest = TRUE THEN msd.document_metadata END ORDER BY msd.created_at DESC))[1]::jsonb, '{}'::jsonb),
      MAX(CASE WHEN msd.document_type::text = 'PHARMACIST_CERTIFICATE' AND msd.is_latest = TRUE THEN msd.uploaded_by END),
      MAX(CASE WHEN msd.document_type::text = 'PHARMACIST_CERTIFICATE' AND msd.is_latest = TRUE THEN msd.created_at END),
      MAX(CASE WHEN msd.document_type::text = 'PHARMACIST_CERTIFICATE' AND msd.is_latest = TRUE THEN msd.updated_at END),
      -- PHARMACY_COUNCIL_REGISTRATION (PHARMACIST_REGISTRATION_NUMBER or STATE_PHARMACY_COUNCIL_PROOF)
      MAX(CASE WHEN msd.document_type::text IN ('PHARMACY_COUNCIL_REGISTRATION', 'PHARMACIST_REGISTRATION_NUMBER', 'STATE_PHARMACY_COUNCIL_PROOF') AND msd.is_latest = TRUE THEN msd.document_number END),
      MAX(CASE WHEN msd.document_type::text IN ('PHARMACY_COUNCIL_REGISTRATION', 'PHARMACIST_REGISTRATION_NUMBER', 'STATE_PHARMACY_COUNCIL_PROOF') AND msd.is_latest = TRUE THEN msd.document_url END),
      MAX(CASE WHEN msd.document_type::text IN ('PHARMACY_COUNCIL_REGISTRATION', 'PHARMACIST_REGISTRATION_NUMBER', 'STATE_PHARMACY_COUNCIL_PROOF') AND msd.is_latest = TRUE THEN msd.document_name END),
      MAX(CASE WHEN msd.document_type::text = 'PHARMACIST_REGISTRATION_NUMBER' AND msd.is_latest = TRUE THEN 'REGISTRATION_NUMBER'
               WHEN msd.document_type::text = 'STATE_PHARMACY_COUNCIL_PROOF' AND msd.is_latest = TRUE THEN 'COUNCIL_PROOF'
               WHEN msd.document_type::text = 'PHARMACY_COUNCIL_REGISTRATION' AND msd.is_latest = TRUE THEN 'REGISTRATION_NUMBER' END),
      BOOL_OR(CASE WHEN msd.document_type::text IN ('PHARMACY_COUNCIL_REGISTRATION', 'PHARMACIST_REGISTRATION_NUMBER', 'STATE_PHARMACY_COUNCIL_PROOF') AND msd.is_latest = TRUE THEN msd.is_verified ELSE FALSE END),
      MAX(CASE WHEN msd.document_type::text IN ('PHARMACY_COUNCIL_REGISTRATION', 'PHARMACIST_REGISTRATION_NUMBER', 'STATE_PHARMACY_COUNCIL_PROOF') AND msd.is_latest = TRUE THEN msd.verified_by END),
      MAX(CASE WHEN msd.document_type::text IN ('PHARMACY_COUNCIL_REGISTRATION', 'PHARMACIST_REGISTRATION_NUMBER', 'STATE_PHARMACY_COUNCIL_PROOF') AND msd.is_latest = TRUE THEN msd.verified_at END),
      MAX(CASE WHEN msd.document_type::text IN ('PHARMACY_COUNCIL_REGISTRATION', 'PHARMACIST_REGISTRATION_NUMBER', 'STATE_PHARMACY_COUNCIL_PROOF') AND msd.is_latest = TRUE THEN msd.rejection_reason END),
      MAX(CASE WHEN msd.document_type::text IN ('PHARMACY_COUNCIL_REGISTRATION', 'PHARMACIST_REGISTRATION_NUMBER', 'STATE_PHARMACY_COUNCIL_PROOF') AND msd.is_latest = TRUE THEN msd.issued_date END),
      MAX(CASE WHEN msd.document_type::text IN ('PHARMACY_COUNCIL_REGISTRATION', 'PHARMACIST_REGISTRATION_NUMBER', 'STATE_PHARMACY_COUNCIL_PROOF') AND msd.is_latest = TRUE THEN msd.expiry_date END),
      BOOL_OR(CASE WHEN msd.document_type::text IN ('PHARMACY_COUNCIL_REGISTRATION', 'PHARMACIST_REGISTRATION_NUMBER', 'STATE_PHARMACY_COUNCIL_PROOF') AND msd.is_latest = TRUE THEN msd.is_expired ELSE FALSE END),
      MAX(CASE WHEN msd.document_type::text IN ('PHARMACY_COUNCIL_REGISTRATION', 'PHARMACIST_REGISTRATION_NUMBER', 'STATE_PHARMACY_COUNCIL_PROOF') AND msd.is_latest = TRUE THEN msd.document_version END),
      COALESCE((array_agg(CASE WHEN msd.document_type::text IN ('PHARMACY_COUNCIL_REGISTRATION', 'PHARMACIST_REGISTRATION_NUMBER', 'STATE_PHARMACY_COUNCIL_PROOF') AND msd.is_latest = TRUE THEN msd.document_metadata END ORDER BY msd.created_at DESC))[1]::jsonb, '{}'::jsonb),
      MAX(CASE WHEN msd.document_type::text IN ('PHARMACY_COUNCIL_REGISTRATION', 'PHARMACIST_REGISTRATION_NUMBER', 'STATE_PHARMACY_COUNCIL_PROOF') AND msd.is_latest = TRUE THEN msd.uploaded_by END),
      MAX(CASE WHEN msd.document_type::text IN ('PHARMACY_COUNCIL_REGISTRATION', 'PHARMACIST_REGISTRATION_NUMBER', 'STATE_PHARMACY_COUNCIL_PROOF') AND msd.is_latest = TRUE THEN msd.created_at END),
      MAX(CASE WHEN msd.document_type::text IN ('PHARMACY_COUNCIL_REGISTRATION', 'PHARMACIST_REGISTRATION_NUMBER', 'STATE_PHARMACY_COUNCIL_PROOF') AND msd.is_latest = TRUE THEN msd.updated_at END),
      -- BANK_PROOF
      MAX(CASE WHEN msd.document_type::text = 'BANK_PROOF' AND msd.is_latest = TRUE THEN msd.document_number END),
      MAX(CASE WHEN msd.document_type::text = 'BANK_PROOF' AND msd.is_latest = TRUE THEN msd.document_url END),
      MAX(CASE WHEN msd.document_type::text = 'BANK_PROOF' AND msd.is_latest = TRUE THEN msd.document_name END),
      BOOL_OR(CASE WHEN msd.document_type::text = 'BANK_PROOF' AND msd.is_latest = TRUE THEN msd.is_verified ELSE FALSE END),
      MAX(CASE WHEN msd.document_type::text = 'BANK_PROOF' AND msd.is_latest = TRUE THEN msd.verified_by END),
      MAX(CASE WHEN msd.document_type::text = 'BANK_PROOF' AND msd.is_latest = TRUE THEN msd.verified_at END),
      MAX(CASE WHEN msd.document_type::text = 'BANK_PROOF' AND msd.is_latest = TRUE THEN msd.rejection_reason END),
      MAX(CASE WHEN msd.document_type::text = 'BANK_PROOF' AND msd.is_latest = TRUE THEN msd.issued_date END),
      MAX(CASE WHEN msd.document_type::text = 'BANK_PROOF' AND msd.is_latest = TRUE THEN msd.expiry_date END),
      BOOL_OR(CASE WHEN msd.document_type::text = 'BANK_PROOF' AND msd.is_latest = TRUE THEN msd.is_expired ELSE FALSE END),
      MAX(CASE WHEN msd.document_type::text = 'BANK_PROOF' AND msd.is_latest = TRUE THEN msd.document_version END),
      COALESCE((array_agg(CASE WHEN msd.document_type::text = 'BANK_PROOF' AND msd.is_latest = TRUE THEN msd.document_metadata END ORDER BY msd.created_at DESC))[1]::jsonb, '{}'::jsonb),
      MAX(CASE WHEN msd.document_type::text = 'BANK_PROOF' AND msd.is_latest = TRUE THEN msd.uploaded_by END),
      MAX(CASE WHEN msd.document_type::text = 'BANK_PROOF' AND msd.is_latest = TRUE THEN msd.created_at END),
      MAX(CASE WHEN msd.document_type::text = 'BANK_PROOF' AND msd.is_latest = TRUE THEN msd.updated_at END),
      -- OTHER
      MAX(CASE WHEN msd.document_type::text IN ('OTHER', 'OTHER_IMAGE') AND msd.is_latest = TRUE THEN msd.document_number END),
      MAX(CASE WHEN msd.document_type::text IN ('OTHER', 'OTHER_IMAGE') AND msd.is_latest = TRUE THEN msd.document_url END),
      MAX(CASE WHEN msd.document_type::text IN ('OTHER', 'OTHER_IMAGE') AND msd.is_latest = TRUE THEN msd.document_name END),
      NULL::TEXT, -- other_document_type (can be set manually or derived from document_metadata)
      BOOL_OR(CASE WHEN msd.document_type::text IN ('OTHER', 'OTHER_IMAGE') AND msd.is_latest = TRUE THEN msd.is_verified ELSE FALSE END),
      MAX(CASE WHEN msd.document_type::text IN ('OTHER', 'OTHER_IMAGE') AND msd.is_latest = TRUE THEN msd.verified_by END),
      MAX(CASE WHEN msd.document_type::text IN ('OTHER', 'OTHER_IMAGE') AND msd.is_latest = TRUE THEN msd.verified_at END),
      MAX(CASE WHEN msd.document_type::text IN ('OTHER', 'OTHER_IMAGE') AND msd.is_latest = TRUE THEN msd.rejection_reason END),
      MAX(CASE WHEN msd.document_type::text IN ('OTHER', 'OTHER_IMAGE') AND msd.is_latest = TRUE THEN msd.issued_date END),
      MAX(CASE WHEN msd.document_type::text IN ('OTHER', 'OTHER_IMAGE') AND msd.is_latest = TRUE THEN msd.expiry_date END),
      BOOL_OR(CASE WHEN msd.document_type::text IN ('OTHER', 'OTHER_IMAGE') AND msd.is_latest = TRUE THEN msd.is_expired ELSE FALSE END),
      MAX(CASE WHEN msd.document_type::text IN ('OTHER', 'OTHER_IMAGE') AND msd.is_latest = TRUE THEN msd.document_version END),
      COALESCE((array_agg(CASE WHEN msd.document_type::text IN ('OTHER', 'OTHER_IMAGE') AND msd.is_latest = TRUE THEN msd.document_metadata END ORDER BY msd.created_at DESC))[1]::jsonb, '{}'::jsonb),
      MAX(CASE WHEN msd.document_type::text IN ('OTHER', 'OTHER_IMAGE') AND msd.is_latest = TRUE THEN msd.uploaded_by END),
      MAX(CASE WHEN msd.document_type::text IN ('OTHER', 'OTHER_IMAGE') AND msd.is_latest = TRUE THEN msd.created_at END),
      MAX(CASE WHEN msd.document_type::text IN ('OTHER', 'OTHER_IMAGE') AND msd.is_latest = TRUE THEN msd.updated_at END),
      -- Global timestamps
      MIN(msd.created_at) AS created_at,
      MAX(msd.updated_at) AS updated_at
    FROM merchant_store_documents msd
    INNER JOIN merchant_stores ms ON msd.store_id = ms.id
    WHERE msd.is_latest = TRUE
    GROUP BY msd.store_id
    ON CONFLICT (store_id) DO NOTHING;
  END IF;
END $$;

-- ============================================================================
-- STEP 3: DROP OLD TABLE AND RENAME NEW TABLE
-- ============================================================================

-- Drop old table (cascade will handle dependent objects)
DROP TABLE IF EXISTS merchant_store_documents CASCADE;

-- Rename new table to original name
ALTER TABLE merchant_store_documents_new 
  RENAME TO merchant_store_documents;

-- ============================================================================
-- STEP 4: CREATE INDEXES
-- ============================================================================

CREATE INDEX IF NOT EXISTS merchant_store_documents_store_id_idx 
  ON merchant_store_documents(store_id);

-- Indexes for verified documents
CREATE INDEX IF NOT EXISTS merchant_store_documents_pan_verified_idx 
  ON merchant_store_documents(store_id) WHERE pan_is_verified = TRUE;

CREATE INDEX IF NOT EXISTS merchant_store_documents_gst_verified_idx 
  ON merchant_store_documents(store_id) WHERE gst_is_verified = TRUE;

CREATE INDEX IF NOT EXISTS merchant_store_documents_fssai_verified_idx 
  ON merchant_store_documents(store_id) WHERE fssai_is_verified = TRUE;

-- Index for expired documents
CREATE INDEX IF NOT EXISTS merchant_store_documents_expired_idx 
  ON merchant_store_documents(store_id) 
  WHERE pan_is_expired = TRUE 
     OR gst_is_expired = TRUE 
     OR fssai_is_expired = TRUE 
     OR trade_license_is_expired = TRUE 
     OR drug_license_is_expired = TRUE;

-- ============================================================================
-- STEP 5: CREATE TRIGGERS
-- ============================================================================

-- Trigger: Auto-update updated_at
DROP TRIGGER IF EXISTS merchant_store_documents_updated_at_trigger ON merchant_store_documents;
CREATE TRIGGER merchant_store_documents_updated_at_trigger
  BEFORE UPDATE ON merchant_store_documents
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- STEP 6: RE-ENABLE ROW LEVEL SECURITY
-- ============================================================================

ALTER TABLE merchant_store_documents ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- STEP 7: COMMENTS
-- ============================================================================

COMMENT ON TABLE merchant_store_documents IS 'Store documents - all document types stored in a single row per store';
COMMENT ON COLUMN merchant_store_documents.store_id IS 'Reference to merchant store. One row per store.';
COMMENT ON COLUMN merchant_store_documents.drug_license_type IS 'Type of drug license: RETAIL or WHOLESALE';
COMMENT ON COLUMN merchant_store_documents.pharmacy_council_registration_type IS 'Type of pharmacy council registration: REGISTRATION_NUMBER or COUNCIL_PROOF';
COMMENT ON COLUMN merchant_store_documents.other_document_type IS 'Specifies what type of "other" document it is';
