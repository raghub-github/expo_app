-- 0619: Allow onboarding_work_location audit rows in rider_documents.doc_type.
ALTER TYPE document_type ADD VALUE IF NOT EXISTS 'onboarding_work_location';
