-- Persist rider onboarding vehicle choice + submit flag in rider_documents.metadata
ALTER TYPE document_type ADD VALUE IF NOT EXISTS 'onboarding_vehicle_selection';
