-- ============================================================================
--  0390_verification_enums
--
--  New enums introduced by the Cashfree Secure ID / verification module. All
--  live in the verification_* namespace so existing enums (document_type,
--  document_verification_status, verification_method, etc.) are NOT touched
--  by this file.
--
--  These enums back:
--    - verification_requests.status     (verification_status_kind)
--    - verification_requests.document_kind (verification_document_kind)
--    - verification_requests.provider   (verification_provider_kind)
--    - verification_events.actor_type   (verification_actor_kind)
--    - verification_events.event_kind   (verification_event_kind)
--    - verification_policies.mode       (verification_policy_mode)
--    - verification_switches.state      (verification_switch_state)
--    - verification_retry_queue.status  (verification_retry_status)
--    - verification_manual_reviews.state (verification_manual_review_state)
--
--  Every enum starts with a superset of what Phase 2 §E documented so future
--  document kinds and providers slot in via ALTER TYPE ADD VALUE (online in
--  Postgres 12+).
-- ============================================================================

-- Domain status of a single verification attempt (§E vocabulary).
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'verification_status_kind') THEN
    CREATE TYPE verification_status_kind AS ENUM (
      'draft',
      'initiated',
      'otp_sent',
      'otp_verified',
      'provider_processing',
      'webhook_received',
      'manual_review',
      'verified',
      'rejected',
      'consent_denied',
      'expired',
      'timeout',
      'failed',
      'duplicate',
      'fraud_suspected',
      'provider_down',
      'fallback_manual',
      'overridden',
      'cancelled'
    );
  END IF;
END $$;

-- Which document / verification product this attempt is for.
-- Voter ID and Udyam intentionally excluded per user direction; keep here for
-- forward compat by ADD VALUE if that changes.
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'verification_document_kind') THEN
    CREATE TYPE verification_document_kind AS ENUM (
      'pan',
      'pan_360',
      'aadhaar_digilocker',
      'driving_licence',
      'vehicle_rc',
      'passport',
      'ifsc',
      'bank_account',
      'reverse_penny_drop',
      'upi_penny_drop',
      'gstin',
      'cin',
      'face_liveness',
      'face_match',
      'name_match'
    );
  END IF;
END $$;

-- Which upstream / mode ran this attempt.
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'verification_provider_kind') THEN
    CREATE TYPE verification_provider_kind AS ENUM (
      'cashfree',
      'razorpay',
      'manual'
    );
  END IF;
END $$;

-- Who / what caused an event row to be written.
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'verification_actor_kind') THEN
    CREATE TYPE verification_actor_kind AS ENUM (
      'provider',
      'webhook',
      'admin',
      'system',
      'rider',
      'merchant'
    );
  END IF;
END $$;

-- Discriminates the semantic of a verification_events row so state machine
-- reconstruction is unambiguous without joining anywhere.
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'verification_event_kind') THEN
    CREATE TYPE verification_event_kind AS ENUM (
      'submit',
      'provider_response',
      'webhook_apply',
      'poll_result',
      'retry_scheduled',
      'retry_started',
      'artifact_mirror',
      'auto_approve',
      'manual_review_queued',
      'manual_review_resolved',
      'override',
      'fallback_to_manual',
      'projection_applied',
      'cancelled'
    );
  END IF;
END $$;

-- Policy mode per (subject_type, document_kind).
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'verification_policy_mode') THEN
    CREATE TYPE verification_policy_mode AS ENUM (
      'auto',
      'manual',
      'hybrid',
      'disabled'
    );
  END IF;
END $$;

-- Global kill-switch state per (provider, doc_kind).
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'verification_switch_state') THEN
    CREATE TYPE verification_switch_state AS ENUM (
      'enabled',
      'disabled',
      'force_manual',
      'force_hybrid'
    );
  END IF;
END $$;

-- Retry queue row lifecycle.
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'verification_retry_status') THEN
    CREATE TYPE verification_retry_status AS ENUM (
      'pending',
      'in_flight',
      'exhausted',
      'succeeded',
      'cancelled'
    );
  END IF;
END $$;

-- Manual review row lifecycle.
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'verification_manual_review_state') THEN
    CREATE TYPE verification_manual_review_state AS ENUM (
      'queued',
      'in_review',
      'approved',
      'rejected',
      'reassigned',
      'cancelled'
    );
  END IF;
END $$;

-- Discriminator for polymorphic subject reference on requests / documents.
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'verification_subject_kind') THEN
    CREATE TYPE verification_subject_kind AS ENUM (
      'rider',
      'merchant_store',
      'rider_document',
      'merchant_document'
    );
  END IF;
END $$;
