# Fraud Detection & Data Integrity

## Overview

This document outlines the fraud detection mechanisms, data integrity constraints, and security measures implemented in the Rider-Based Gig-Economy Logistics Application.

## Fraud Detection Mechanisms

### 1. Device Restrictions

#### Duplicate Device Detection

```sql
-- Prevent multiple riders using same device
CREATE UNIQUE INDEX idx_rider_devices_device_rider 
  ON rider_devices(device_id, rider_id) 
  WHERE allowed = TRUE;

-- Function to check for duplicate devices
CREATE OR REPLACE FUNCTION check_duplicate_device(
  p_device_id TEXT,
  p_rider_id INTEGER
)
RETURNS BOOLEAN AS $$
DECLARE
  v_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO v_count
  FROM rider_devices
  WHERE device_id = p_device_id
    AND rider_id != p_rider_id
    AND allowed = TRUE;
  
  RETURN v_count > 0;
END;
$$ LANGUAGE plpgsql;
```

#### Device Blacklisting

```typescript
// Check if device is blacklisted before allowing login
async function isDeviceAllowed(deviceId: string, riderId: number): Promise<boolean> {
  const device = await db.query.riderDevices.findFirst({
    where: and(
      eq(riderDevices.deviceId, deviceId),
      eq(riderDevices.riderId, riderId)
    ),
  });
  
  return device?.allowed ?? false;
}
```

### 2. Duplicate Account Prevention

#### Mobile Number Uniqueness

```sql
-- Already enforced via UNIQUE constraint
-- Additional check for similar numbers (normalization)
CREATE OR REPLACE FUNCTION normalize_mobile(p_mobile TEXT)
RETURNS TEXT AS $$
BEGIN
  -- Remove all non-digit characters
  RETURN regexp_replace(p_mobile, '[^0-9]', '', 'g');
END;
$$ LANGUAGE plpgsql;

-- Trigger to normalize mobile on insert
CREATE OR REPLACE FUNCTION normalize_rider_mobile()
RETURNS TRIGGER AS $$
BEGIN
  NEW.mobile = normalize_mobile(NEW.mobile);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER normalize_mobile_trigger
  BEFORE INSERT OR UPDATE ON riders
  FOR EACH ROW
  EXECUTE FUNCTION normalize_rider_mobile();
```

#### Aadhaar/PAN Duplicate Check

```sql
-- Function to check for duplicate KYC documents
CREATE OR REPLACE FUNCTION check_duplicate_kyc(
  p_rider_id INTEGER,
  p_aadhaar TEXT DEFAULT NULL,
  p_pan TEXT DEFAULT NULL
)
RETURNS TABLE(duplicate_type TEXT, existing_rider_id INTEGER) AS $$
BEGIN
  RETURN QUERY
  SELECT 'aadhaar'::TEXT, r.id
  FROM riders r
  WHERE r.aadhaar_number = p_aadhaar
    AND r.id != p_rider_id
    AND p_aadhaar IS NOT NULL
  
  UNION ALL
  
  SELECT 'pan'::TEXT, r.id
  FROM riders r
  WHERE r.pan_number = p_pan
    AND r.id != p_rider_id
    AND p_pan IS NOT NULL;
END;
$$ LANGUAGE plpgsql;
```

### 3. Location Spoofing Detection

#### Fraud Signals in Location Logs

```sql
-- Function to detect location anomalies
CREATE OR REPLACE FUNCTION detect_location_fraud(
  p_rider_id INTEGER,
  p_lat DOUBLE PRECISION,
  p_lon DOUBLE PRECISION,
  p_timestamp TIMESTAMP
)
RETURNS JSONB AS $$
DECLARE
  v_previous_location location_logs%ROWTYPE;
  v_distance_km NUMERIC;
  v_time_diff_seconds INTEGER;
  v_speed_kmh NUMERIC;
  v_fraud_signals TEXT[] := ARRAY[]::TEXT[];
  v_fraud_score INTEGER := 0;
BEGIN
  -- Get previous location
  SELECT * INTO v_previous_location
  FROM location_logs
  WHERE rider_id = p_rider_id
  ORDER BY created_at DESC
  LIMIT 1;
  
  IF v_previous_location IS NULL THEN
    RETURN jsonb_build_object('fraud_score', 0, 'signals', ARRAY[]::TEXT[]);
  END IF;
  
  -- Calculate distance (Haversine formula)
  v_distance_km := (
    6371 * acos(
      cos(radians(v_previous_location.lat)) *
      cos(radians(p_lat)) *
      cos(radians(p_lon) - radians(v_previous_location.lon)) +
      sin(radians(v_previous_location.lat)) *
      sin(radians(p_lat))
    )
  );
  
  -- Calculate time difference
  v_time_diff_seconds := EXTRACT(EPOCH FROM (p_timestamp - v_previous_location.created_at));
  
  -- Calculate speed
  IF v_time_diff_seconds > 0 THEN
    v_speed_kmh := (v_distance_km / v_time_diff_seconds) * 3600;
  ELSE
    v_speed_kmh := 0;
  END IF;
  
  -- Detect fraud signals
  IF v_speed_kmh > 120 THEN -- Unrealistic speed (>120 km/h)
    v_fraud_signals := array_append(v_fraud_signals, 'unrealistic_speed');
    v_fraud_score := v_fraud_score + 50;
  END IF;
  
  IF v_distance_km > 50 AND v_time_diff_seconds < 60 THEN -- Teleportation
    v_fraud_signals := array_append(v_fraud_signals, 'teleportation');
    v_fraud_score := v_fraud_score + 80;
  END IF;
  
  IF v_fraud_score > 50 THEN
    -- Log fraud event
    INSERT INTO fraud_logs (
      rider_id,
      fraud_type,
      severity,
      description,
      evidence
    ) VALUES (
      p_rider_id,
      'location_spoofing',
      CASE 
        WHEN v_fraud_score >= 80 THEN 'high'
        WHEN v_fraud_score >= 50 THEN 'medium'
        ELSE 'low'
      END,
      format('Suspicious location movement: %s km in %s seconds (speed: %s km/h)', 
             v_distance_km, v_time_diff_seconds, v_speed_kmh),
      jsonb_build_object(
        'distance_km', v_distance_km,
        'time_seconds', v_time_diff_seconds,
        'speed_kmh', v_speed_kmh,
        'previous_location', jsonb_build_object('lat', v_previous_location.lat, 'lon', v_previous_location.lon),
        'current_location', jsonb_build_object('lat', p_lat, 'lon', p_lon)
      )
    );
  END IF;
  
  RETURN jsonb_build_object(
    'fraud_score', v_fraud_score,
    'signals', v_fraud_signals,
    'speed_kmh', v_speed_kmh,
    'distance_km', v_distance_km
  );
END;
$$ LANGUAGE plpgsql;
```

### 4. Payment Fraud Detection

#### Duplicate Payment Prevention

```sql
-- Prevent duplicate onboarding payments
CREATE UNIQUE INDEX idx_onboarding_payments_ref_id 
  ON onboarding_payments(ref_id);

-- Check for duplicate withdrawal requests
CREATE OR REPLACE FUNCTION check_duplicate_withdrawal(
  p_rider_id INTEGER,
  p_amount NUMERIC
)
RETURNS BOOLEAN AS $$
DECLARE
  v_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO v_count
  FROM withdrawal_requests
  WHERE rider_id = p_rider_id
    AND amount = p_amount
    AND status = 'pending'
    AND created_at > NOW() - INTERVAL '1 hour';
  
  RETURN v_count > 0;
END;
$$ LANGUAGE plpgsql;
```

#### Wallet Balance Validation

```sql
-- Function to validate wallet balance before withdrawal
CREATE OR REPLACE FUNCTION validate_withdrawal(
  p_rider_id INTEGER,
  p_amount NUMERIC
)
RETURNS BOOLEAN AS $$
DECLARE
  v_balance NUMERIC;
BEGIN
  -- Get current balance
  SELECT COALESCE(balance, 0) INTO v_balance
  FROM wallet_ledger
  WHERE rider_id = p_rider_id
  ORDER BY created_at DESC
  LIMIT 1;
  
  -- Check if sufficient balance
  IF v_balance < p_amount THEN
    -- Log fraud attempt
    INSERT INTO fraud_logs (
      rider_id,
      fraud_type,
      severity,
      description,
      evidence
    ) VALUES (
      p_rider_id,
      'insufficient_balance_withdrawal',
      'medium',
      format('Attempted withdrawal of %s with balance %s', p_amount, v_balance),
      jsonb_build_object('requested_amount', p_amount, 'available_balance', v_balance)
    );
    
    RETURN FALSE;
  END IF;
  
  RETURN TRUE;
END;
$$ LANGUAGE plpgsql;
```

### 5. Order Fraud Detection

#### Order Acceptance Rate Monitoring

```sql
-- Function to check suspicious acceptance patterns
CREATE OR REPLACE FUNCTION check_acceptance_fraud(
  p_rider_id INTEGER
)
RETURNS JSONB AS $$
DECLARE
  v_total_offers INTEGER;
  v_accepted INTEGER;
  v_rejected INTEGER;
  v_acceptance_rate NUMERIC;
  v_fraud_score INTEGER := 0;
BEGIN
  -- Get stats from last 24 hours
  SELECT 
    COUNT(*),
    COUNT(*) FILTER (WHERE action = 'accept'),
    COUNT(*) FILTER (WHERE action = 'reject')
  INTO v_total_offers, v_accepted, v_rejected
  FROM order_actions
  WHERE rider_id = p_rider_id
    AND timestamp > NOW() - INTERVAL '24 hours';
  
  IF v_total_offers = 0 THEN
    RETURN jsonb_build_object('fraud_score', 0);
  END IF;
  
  v_acceptance_rate := (v_accepted::NUMERIC / v_total_offers::NUMERIC) * 100;
  
  -- Suspicious: 100% acceptance (bot behavior)
  IF v_acceptance_rate = 100 AND v_total_offers > 10 THEN
    v_fraud_score := 60;
  END IF;
  
  -- Suspicious: 0% acceptance (gaming system)
  IF v_acceptance_rate = 0 AND v_total_offers > 20 THEN
    v_fraud_score := 40;
  END IF;
  
  IF v_fraud_score > 0 THEN
    INSERT INTO fraud_logs (
      rider_id,
      fraud_type,
      severity,
      description,
      evidence
    ) VALUES (
      p_rider_id,
      'suspicious_acceptance_pattern',
      'medium',
      format('Unusual acceptance rate: %s%% (%s/%s)', 
             v_acceptance_rate, v_accepted, v_total_offers),
      jsonb_build_object(
        'acceptance_rate', v_acceptance_rate,
        'total_offers', v_total_offers,
        'accepted', v_accepted,
        'rejected', v_rejected
      )
    );
  END IF;
  
  RETURN jsonb_build_object(
    'fraud_score', v_fraud_score,
    'acceptance_rate', v_acceptance_rate
  );
END;
$$ LANGUAGE plpgsql;
```

## Blacklist/Whitelist Management

### Blacklist History Tracking

```sql
-- Function to blacklist rider
CREATE OR REPLACE FUNCTION blacklist_rider(
  p_rider_id INTEGER,
  p_reason TEXT,
  p_admin_user_id INTEGER
)
RETURNS VOID AS $$
BEGIN
  -- Update rider status
  UPDATE riders
  SET status = 'BANNED'
  WHERE id = p_rider_id;
  
  -- Log blacklist action
  INSERT INTO blacklist_history (
    rider_id,
    reason,
    banned,
    admin_user_id
  ) VALUES (
    p_rider_id,
    p_reason,
    TRUE,
    p_admin_user_id
  );
  
  -- Disable all devices
  UPDATE rider_devices
  SET allowed = FALSE
  WHERE rider_id = p_rider_id;
  
  -- Log admin action
  INSERT INTO admin_action_logs (
    admin_user_id,
    action,
    entity_type,
    entity_id,
    reason
  ) VALUES (
    p_admin_user_id,
    'RIDER_BLACKLIST',
    'rider',
    p_rider_id,
    p_reason
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
```

### Auto-Blacklist on Fraud Detection

```sql
-- Trigger to auto-blacklist on critical fraud
CREATE OR REPLACE FUNCTION auto_blacklist_on_critical_fraud()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.severity = 'critical' AND NEW.resolved = FALSE THEN
    -- Auto-blacklist rider
    UPDATE riders
    SET status = 'BANNED'
    WHERE id = NEW.rider_id;
    
    -- Log blacklist
    INSERT INTO blacklist_history (
      rider_id,
      reason,
      banned
    ) VALUES (
      NEW.rider_id,
      format('Auto-blacklisted due to %s fraud', NEW.fraud_type),
      TRUE
    );
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER auto_blacklist_fraud_trigger
  AFTER INSERT ON fraud_logs
  FOR EACH ROW
  WHEN (NEW.severity = 'critical')
  EXECUTE FUNCTION auto_blacklist_on_critical_fraud();
```

## Document Reupload History

### Document Version Tracking

```sql
-- Function to get document history
CREATE OR REPLACE FUNCTION get_document_history(
  p_rider_id INTEGER,
  p_doc_type document_type
)
RETURNS TABLE (
  id BIGINT,
  file_url TEXT,
  verified BOOLEAN,
  rejected_reason TEXT,
  created_at TIMESTAMP
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    rd.id,
    rd.file_url,
    rd.verified,
    rd.rejected_reason,
    rd.created_at
  FROM rider_documents rd
  WHERE rd.rider_id = p_rider_id
    AND rd.doc_type = p_doc_type
  ORDER BY rd.created_at DESC;
END;
$$ LANGUAGE plpgsql;
```

### Document Rejection Tracking

```sql
-- Function to track rejection reasons
CREATE OR REPLACE FUNCTION reject_document(
  p_document_id BIGINT,
  p_reason TEXT,
  p_verifier_user_id INTEGER
)
RETURNS VOID AS $$
BEGIN
  UPDATE rider_documents
  SET 
    verified = FALSE,
    rejected_reason = p_reason,
    verifier_user_id = p_verifier_user_id
  WHERE id = p_document_id;
  
  -- Update rider KYC status
  UPDATE riders
  SET kyc_status = 'REJECTED'
  WHERE id = (SELECT rider_id FROM rider_documents WHERE id = p_document_id);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
```

## Auto Logout Triggers

### Device Change Detection

```sql
-- Function to detect device change and auto-logout
CREATE OR REPLACE FUNCTION detect_device_change(
  p_rider_id INTEGER,
  p_device_id TEXT,
  p_ip_address TEXT
)
RETURNS BOOLEAN AS $$
DECLARE
  v_existing_device rider_devices%ROWTYPE;
  v_device_changed BOOLEAN := FALSE;
BEGIN
  -- Get latest device
  SELECT * INTO v_existing_device
  FROM rider_devices
  WHERE rider_id = p_rider_id
    AND allowed = TRUE
  ORDER BY last_seen DESC
  LIMIT 1;
  
  -- Check if device changed
  IF v_existing_device IS NOT NULL AND v_existing_device.device_id != p_device_id THEN
    v_device_changed := TRUE;
    
    -- Log device change
    INSERT INTO fraud_logs (
      rider_id,
      fraud_type,
      severity,
      description,
      evidence
    ) VALUES (
      p_rider_id,
      'device_change',
      'low',
      'Device change detected',
      jsonb_build_object(
        'old_device_id', v_existing_device.device_id,
        'new_device_id', p_device_id,
        'ip_address', p_ip_address
      )
    );
    
    -- Optionally disable old device
    UPDATE rider_devices
    SET allowed = FALSE
    WHERE id = v_existing_device.id;
  END IF;
  
  RETURN v_device_changed;
END;
$$ LANGUAGE plpgsql;
```

### Suspicious Activity Auto-Logout

```sql
-- Function to check for suspicious activity and auto-logout
CREATE OR REPLACE FUNCTION check_suspicious_activity(
  p_rider_id INTEGER
)
RETURNS BOOLEAN AS $$
DECLARE
  v_fraud_count INTEGER;
  v_recent_frauds INTEGER;
BEGIN
  -- Count recent frauds
  SELECT COUNT(*) INTO v_recent_frauds
  FROM fraud_logs
  WHERE rider_id = p_rider_id
    AND severity IN ('high', 'critical')
    AND resolved = FALSE
    AND created_at > NOW() - INTERVAL '1 hour';
  
  -- Auto-logout if multiple high-severity frauds
  IF v_recent_frauds >= 3 THEN
    -- Disable all devices
    UPDATE rider_devices
    SET allowed = FALSE
    WHERE rider_id = p_rider_id;
    
    -- Log action
    INSERT INTO admin_action_logs (
      admin_user_id,
      action,
      entity_type,
      entity_id,
      reason
    ) VALUES (
      0, -- System
      'AUTO_LOGOUT',
      'rider',
      p_rider_id,
      format('Auto-logout due to %s recent fraud incidents', v_recent_frauds)
    );
    
    RETURN TRUE;
  END IF;
  
  RETURN FALSE;
END;
$$ LANGUAGE plpgsql;
```

## Data Integrity Constraints

### Referential Integrity

```sql
-- Ensure referred_by is valid
ALTER TABLE riders
ADD CONSTRAINT riders_referred_by_fk
FOREIGN KEY (referred_by) REFERENCES riders(id)
ON DELETE SET NULL;

-- Ensure referral code uniqueness
ALTER TABLE riders
ADD CONSTRAINT riders_referral_code_unique
UNIQUE (referral_code) WHERE referral_code IS NOT NULL;
```

### Business Logic Constraints

```sql
-- Ensure withdrawal amount is positive
ALTER TABLE withdrawal_requests
ADD CONSTRAINT withdrawal_amount_positive
CHECK (amount > 0);

-- Ensure rating is between 1 and 5
ALTER TABLE ratings
ADD CONSTRAINT rating_range
CHECK (rating >= 1 AND rating <= 5);

-- Ensure order status transitions are valid
-- (This would be enforced in application logic or via triggers)
```

## Security Best Practices

### 1. Encrypt Sensitive Data

```sql
-- Use Supabase Vault for sensitive fields
-- Aadhaar, PAN numbers should be encrypted at rest
-- Use pgcrypto extension for encryption if needed
```

### 2. Audit All Admin Actions

```sql
-- All admin actions are logged in admin_action_logs
-- Includes IP address, user agent, timestamp
-- Cannot be deleted (append-only)
```

### 3. Rate Limiting

```typescript
// Implement rate limiting for sensitive operations
// - Login attempts: 5 per hour
// - Withdrawal requests: 3 per day
// - Document uploads: 10 per day
```

### 4. Two-Factor Authentication (Future)

```sql
-- Add 2FA table for additional security
CREATE TABLE rider_2fa (
  id BIGSERIAL PRIMARY KEY,
  rider_id INTEGER NOT NULL REFERENCES riders(id),
  method TEXT NOT NULL, -- 'sms', 'totp', 'email'
  secret TEXT,
  verified BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT NOW()
);
```

## Monitoring & Alerts

### Fraud Alert Thresholds

1. **Critical**: Auto-blacklist immediately
   - Location spoofing with score > 80
   - Payment fraud attempts
   - Multiple device violations

2. **High**: Review within 1 hour
   - Suspicious acceptance patterns
   - Unusual withdrawal patterns
   - Device change with location anomaly

3. **Medium**: Review within 24 hours
   - Low acceptance rate
   - Document rejection
   - Wallet balance anomalies

### Alert Queries

```sql
-- Get unresolved critical frauds
SELECT * FROM fraud_logs
WHERE severity = 'critical'
  AND resolved = FALSE
  AND created_at > NOW() - INTERVAL '1 hour';

-- Get riders with multiple fraud incidents
SELECT rider_id, COUNT(*) as fraud_count
FROM fraud_logs
WHERE created_at > NOW() - INTERVAL '7 days'
  AND resolved = FALSE
GROUP BY rider_id
HAVING COUNT(*) >= 3;
```

This comprehensive fraud detection and security system ensures data integrity and protects against various fraud patterns common in gig-economy applications.
