# Rider Status Flow Diagram

## Status Enum Values

```
┌─────────────┬──────────────────────────────────────────────────┐
│   Status    │                  Description                     │
├─────────────┼──────────────────────────────────────────────────┤
│  INACTIVE   │ Not yet onboarded OR deactivated                 │
│  ACTIVE     │ Fully onboarded and operational                  │
│  BLOCKED    │ Blocked from services (can be unblocked)         │
│  BANNED     │ Permanently banned (cannot be unblocked)         │
└─────────────┴──────────────────────────────────────────────────┘
```

## New Rider Onboarding Flow

```
┌──────────────────┐
│  Registration    │ status = INACTIVE
│  Mobile OTP      │ onboardingStage = MOBILE_VERIFIED
└────────┬─────────┘
         │
         ▼
┌──────────────────┐
│  Upload Docs     │ status = INACTIVE
│  Identity + DL   │ onboardingStage = KYC
└────────┬─────────┘
         │
         ▼
┌──────────────────┐
│  Docs Verified   │ status = INACTIVE (still)
│  + Bank Proof    │ onboardingStage = DOCUMENTS_VERIFIED
└────────┬─────────┘
         │
         ▼
┌──────────────────┐
│  Payment Done    │ status = ACTIVE ✅
│  Complete!       │ onboardingStage = ACTIVE
└──────────────────┘
```

## Blocking Flow (FIXED)

### Before Fix (BUGGY ❌)

```
Block All Services (Permanent)
┌─────────────────┐
│ status = ACTIVE │
│ onboarding = ✅ │
└────────┬────────┘
         │ Block all services
         ▼
┌─────────────────────┐
│ status = INACTIVE   │  ❌ WRONG! Should be BLOCKED
│ onboarding = ✅     │
└─────────────────────┘

Unblock Any Rider
┌─────────────────────┐
│ status = INACTIVE   │
│ onboarding = ❌     │  (Not complete!)
└────────┬────────────┘
         │ Unblock
         ▼
┌─────────────────────┐
│ status = ACTIVE     │  ❌ CRITICAL BUG!
│ onboarding = ❌     │  Unverified rider is now active!
└─────────────────────┘
```

### After Fix (CORRECT ✅)

```
Block All Services (Permanent)
┌─────────────────┐
│ status = ACTIVE │
│ onboarding = ✅ │
└────────┬────────┘
         │ Block all services
         ▼
┌─────────────────────┐
│ status = BLOCKED    │  ✅ Correct enum
│ onboarding = ✅     │
└─────────────────────┘

Unblock Verified Rider
┌─────────────────────┐
│ status = BLOCKED    │
│ onboarding = ✅     │  (Complete!)
└────────┬────────────┘
         │ Unblock
         ▼
┌─────────────────────┐
│ status = ACTIVE     │  ✅ Correct - onboarding done
│ onboarding = ✅     │
└─────────────────────┘

Unblock Unverified Rider
┌─────────────────────┐
│ status = BLOCKED    │
│ onboarding = ❌     │  (Not complete!)
└────────┬────────────┘
         │ Unblock
         ▼
┌─────────────────────┐
│ status = INACTIVE   │  ✅ Correct - must complete onboarding
│ onboarding = ❌     │
└─────────────────────┘
         │ Must verify documents & pay
         ▼
┌─────────────────────┐
│ status = ACTIVE     │  ✅ Only after onboarding
│ onboarding = ✅     │
└─────────────────────┘
```

## Status Decision Tree

```
                    ┌──────────────────────────────┐
                    │  Blocking/Unblocking Action  │
                    └────────────┬─────────────────┘
                                 │
                ┌────────────────┴────────────────┐
                │                                  │
        ┌───────▼─────────┐              ┌────────▼────────┐
        │  BLOCKING       │              │  UNBLOCKING     │
        │  All Services   │              │  Any Service    │
        └───────┬─────────┘              └────────┬────────┘
                │                                  │
                ▼                                  │
        ┌───────────────┐                         │
        │ status =      │                         │
        │ BLOCKED       │                         │
        └───────────────┘                         │
                                                  │
                                ┌─────────────────┴─────────────────┐
                                │                                    │
                        ┌───────▼──────────┐              ┌─────────▼──────────┐
                        │ onboardingStage  │              │ onboardingStage    │
                        │ = ACTIVE?        │              │ != ACTIVE?         │
                        └───────┬──────────┘              └─────────┬──────────┘
                                │ YES                                │ NO
                                ▼                                    ▼
                        ┌───────────────┐              ┌─────────────────────┐
                        │ status =      │              │ status =            │
                        │ ACTIVE        │              │ INACTIVE            │
                        │               │              │                     │
                        │ ✅ Can work   │              │ ❌ Must complete    │
                        │               │              │    onboarding       │
                        └───────────────┘              └─────────────────────┘
```

## Key Validation Rules

### Rule 1: Block Action
```
IF action = "blacklist" AND isPermanent = true AND serviceType = "all"
THEN status = "BLOCKED"
```

### Rule 2: Unblock Action
```
IF action = "whitelist"
THEN status = (onboardingStage == "ACTIVE" ? "ACTIVE" : "INACTIVE")
```

### Rule 3: Onboarding Completion
```
IF allDocsVerified = true AND paymentComplete = true
THEN status = "ACTIVE" AND onboardingStage = "ACTIVE"
```

## UI Indicators

### Onboarding Verification Page

```
┌─────────────────────────────────────────────────────┐
│  🟢 Rider Already Verified                          │
│  This rider has completed onboarding and all        │
│  documents have been verified. The verification     │
│  process should not be repeated unless              │
│  re-verification is required.                       │
└─────────────────────────────────────────────────────┘
  ↑ Shows when: onboardingStage = ACTIVE AND kycStatus = APPROVED

┌─────────────────────────────────────────────────────┐
│  🔴 Rider Account Blocked                           │
│  This rider's account is currently blocked.         │
│  Please unblock the rider from the main dashboard   │
│  before attempting to verify documents.             │
│  Status: BLOCKED                                    │
└─────────────────────────────────────────────────────┘
  ↑ Shows when: status = BLOCKED OR status = BANNED
  
  All verification buttons (Approve/Reject/Edit) are disabled
  when rider is blocked.
```

## Database Schema Constraint (Future Enhancement)

```sql
-- Add constraint to ensure status logic is enforced at DB level
ALTER TABLE riders
ADD CONSTRAINT check_active_requires_onboarding
CHECK (
  status != 'ACTIVE' OR onboarding_stage = 'ACTIVE'
);

-- This prevents:
-- 1. Setting status to ACTIVE when onboardingStage != ACTIVE
-- 2. Bypassing onboarding verification
-- 3. Data inconsistencies between status and onboardingStage
```
