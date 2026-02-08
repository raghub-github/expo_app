# Onboarding & Document Verification System - Complete Improvement Plan

## Overview
This document outlines all improvements to make the rider onboarding and document verification system modern, accurate, and advanced.

## Test Data Created
✅ **File**: `dashboard/drizzle/TEST_DATA_RIDERS_WITH_DOCS.sql`

**10 Test Riders with diverse scenarios:**
1. **GMR1001** (9999001001): Complete EV Bike - All docs pending verification
2. **GMR1002** (9999002002): Petrol Bike - Mixed verification (some approved, some pending)
3. **GMR1003** (9999003003): Auto Rickshaw - Person Ride service
4. **GMR1004** (9999004004): EV Rental - Using rental proof instead of RC
5. **GMR1005** (9999005005): Rejected Documents - Needs re-upload
6. **GMR1006** (9999006006): Fully Verified - Active rider (SUCCESS CASE)
7. **GMR1007** (9999007007): Car for Person Ride
8. **GMR1008** (9999008008): APP_VERIFIED via DigiLocker
9. **GMR1009** (9999009009): Missing Critical Documents
10. **GMR1010** (9999010010): Complete EV with expiry dates

**To Run:**
```sql
-- In PostgreSQL/Supabase SQL Editor
-- Copy and paste the entire contents of TEST_DATA_RIDERS_WITH_DOCS.sql
```

## Issues Identified & Solutions

### 1. Document Verification Logic

**Current Issues:**
- Verification status not updating properly
- Rider status not progressing through onboarding stages
- KYC status stuck at PENDING
- Service activation not happening after all docs verified

**Solution:**
Update `dashboard/src/lib/db/operations/riders.ts` - `approveRiderDocument()` function:

```typescript
export async function approveRiderDocument(
  docId: number,
  agentId: number
): Promise<{ 
  approved: Record<string, unknown>; 
  riderState: { 
    kycStatus: string; 
    onboardingStage: string; 
    status: string;
    serviceActivationStatus?: Record<string, boolean>;
  } 
} | null> {
  const db = getDb();

  // 1. Update document to approved
  const [approved] = await db
    .update(riderDocuments)
    .set({
      verified: true,
      verificationStatus: 'approved',
      verifiedAt: new Date(),
      verifiedBy: agentId,
      verifierUserId: agentId,
      rejectedReason: null,
      updatedAt: new Date(),
    })
    .where(eq(riderDocuments.id, docId))
    .returning();

  if (!approved) return null;

  const riderId = approved.riderId as number;
  
  // 2. Get rider and vehicle info
  const [rider, vehicle, allDocs] = await Promise.all([
    getRiderById(riderId),
    db.select().from(riderVehicles).where(eq(riderVehicles.riderId, riderId)).limit(1),
    db.select().from(riderDocuments).where(eq(riderDocuments.riderId, riderId))
  ]);

  if (!rider) return { approved, riderState: { kycStatus: "PENDING", onboardingStage: "MOBILE_VERIFIED", status: "INACTIVE" } };

  // 3. Check verification status
  const identityVerified = checkIdentityDocsVerified(allDocs);
  const vehicleDocsVerified = checkVehicleDocsVerified(allDocs, vehicle[0]?.vehicleType);
  const bankProofVerified = allDocs.some(d => d.docType === 'bank_proof' && d.verified);
  
  // 4. Progressive status updates
  let kycStatus = rider.kycStatus;
  let onboardingStage = rider.onboardingStage;
  let status = rider.status;
  let serviceActivation: Record<string, boolean> = {};

  // Identity docs verified → KYC APPROVED
  if (identityVerified && kycStatus === 'PENDING') {
    kycStatus = 'APPROVED';
    onboardingStage = 'KYC_APPROVED';
    await db.update(riders).set({ kycStatus, onboardingStage, updatedAt: new Date() })
      .where(eq(riders.id, riderId));
  }

  // All required docs verified → DOCUMENTS_VERIFIED stage
  if (identityVerified && vehicleDocsVerified && bankProofVerified) {
    onboardingStage = 'DOCUMENTS_VERIFIED';
    
    // Check payment status
    const paymentCompleted = await checkOnboardingPaymentCompleted(riderId);
    
    if (paymentCompleted) {
      // All done → ACTIVE
      status = 'ACTIVE';
      onboardingStage = 'ACTIVE';
      
      // Activate services based on vehicle type and docs
      if (vehicle[0]) {
        const services = vehicle[0].serviceTypes as string[] || [];
        services.forEach(service => {
          serviceActivation[service] = true;
        });
      }
    } else {
      // Waiting for payment
      onboardingStage = 'PAYMENT_PENDING';
    }
    
    await db.update(riders).set({ kycStatus, onboardingStage, status, updatedAt: new Date() })
      .where(eq(riders.id, riderId));
  }

  return { 
    approved, 
    riderState: { kycStatus, onboardingStage, status, serviceActivationStatus: serviceActivation } 
  };
}

// Helper functions
function checkIdentityDocsVerified(docs: any[]): boolean {
  const hasAadhaar = docs.some(d => 
    (d.docType === 'aadhaar_front' || d.docType === 'aadhaar') && d.verified
  );
  const hasSelfie = docs.some(d => d.docType === 'selfie' && d.verified);
  const hasPan = docs.some(d => d.docType === 'pan' && d.verified);
  
  return hasAadhaar && hasSelfie && hasPan;
}

function checkVehicleDocsVerified(docs: any[], vehicleType?: string): boolean {
  const hasDL = docs.some(d => (d.docType === 'dl_front' || d.docType === 'dl') && d.verified);
  const hasRC = docs.some(d => d.docType === 'rc' && d.verified);
  const hasRentalProof = docs.some(d => d.docType === 'rental_proof' && d.verified);
  const hasEVProof = docs.some(d => d.docType === 'ev_proof' && d.verified);
  
  // DL is always required
  if (!hasDL) return false;
  
  // RC or Rental Proof required
  if (!hasRC && !hasRentalProof) return false;
  
  // EV bikes need EV proof
  if (vehicleType?.includes('ev') || vehicleType?.includes('electric')) {
    return hasEVProof || hasRentalProof;
  }
  
  return true;
}
```

### 2. R2 Signed URL Auto-Renewal

**Create**: `dashboard/src/lib/r2/url-generator.ts`

```typescript
import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

const R2_ACCOUNT_ID = process.env.R2_ACCOUNT_ID!;
const R2_ACCESS_KEY_ID = process.env.R2_ACCESS_KEY_ID!;
const R2_SECRET_ACCESS_KEY = process.env.R2_SECRET_ACCESS_KEY!;
const R2_BUCKET_NAME = process.env.R2_BUCKET_NAME || 'rider-documents';

const r2Client = new S3Client({
  region: 'auto',
  endpoint: `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: R2_ACCESS_KEY_ID,
    secretAccessKey: R2_SECRET_ACCESS_KEY,
  },
});

/**
 * Generate a signed URL for an R2 object
 * @param r2Key - The R2 storage key
 * @param expiresIn - Expiry time in seconds (default: 1 hour)
 */
export async function generateSignedUrl(
  r2Key: string,
  expiresIn: number = 3600
): Promise<string> {
  const command = new GetObjectCommand({
    Bucket: R2_BUCKET_NAME,
    Key: r2Key,
  });

  const url = await getSignedUrl(r2Client, command, { expiresIn });
  return url;
}

/**
 * Batch generate signed URLs for multiple documents
 */
export async function batchGenerateSignedUrls(
  r2Keys: string[]
): Promise<Record<string, string>> {
  const urls: Record<string, string> = {};
  
  await Promise.all(
    r2Keys.map(async (key) => {
      if (key) {
        urls[key] = await generateSignedUrl(key);
      }
    })
  );
  
  return urls;
}

/**
 * Check if URL needs renewal (expires in < 30 minutes)
 */
export function needsUrlRenewal(url: string): boolean {
  try {
    const urlObj = new URL(url);
    const expiresParam = urlObj.searchParams.get('X-Amz-Expires') || 
                         urlObj.searchParams.get('Expires');
    
    if (!expiresParam) return true; // No expiry, renew to be safe
    
    const expiresAt = parseInt(expiresParam) * 1000; // Convert to ms
    const now = Date.now();
    const thirtyMinutes = 30 * 60 * 1000;
    
    return (expiresAt - now) < thirtyMinutes;
  } catch {
    return true; // Invalid URL, renew
  }
}
```

**Update Document API Route**: `dashboard/src/app/api/riders/[id]/documents/route.ts`

```typescript
import { generateSignedUrl, batchGenerateSignedUrls } from '@/lib/r2/url-generator';

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  // ... existing code ...
  
  // After fetching documents
  const documents = await db.select().from(riderDocuments)
    .where(eq(riderDocuments.riderId, riderId));
  
  // Renew R2 signed URLs
  const r2Keys = documents
    .filter(d => d.r2Key && d.verificationMethod === 'MANUAL_UPLOAD')
    .map(d => d.r2Key!);
  
  const signedUrls = await batchGenerateSignedUrls(r2Keys);
  
  // Update documents with fresh URLs
  const docsWithFreshUrls = documents.map(doc => ({
    ...doc,
    fileUrl: doc.r2Key && signedUrls[doc.r2Key] 
      ? signedUrls[doc.r2Key] 
      : doc.fileUrl
  }));
  
  return NextResponse.json({
    success: true,
    data: { documents: docsWithFreshUrls }
  });
}
```

### 3. Enhanced UI for Document Verification

**Update**: `dashboard/src/app/dashboard/riders/[id]/onboarding/page.tsx`

Add vehicle information display and better document status:

```tsx
{/* Vehicle Information Card - ADD THIS */}
{vehicle && (
  <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm">
    <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
      <Car className="h-5 w-5 text-violet-600" />
      Vehicle Information
    </h3>
    <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
      <InfoItem label="Type" value={formatVehicleType(vehicle.vehicleType)} />
      <InfoItem label="Registration" value={vehicle.registrationNumber} className="font-mono" />
      <InfoItem label="Make" value={vehicle.make || '—'} />
      <InfoItem label="Model" value={vehicle.model || '—'} />
      <InfoItem label="Fuel" value={vehicle.fuelType || '—'} />
      <InfoItem label="Category" value={vehicle.vehicleCategory || '—'} />
      {vehicle.serviceTypes && (
        <div className="col-span-2">
          <p className="text-sm text-gray-500 mb-1">Eligible Services</p>
          <div className="flex gap-2 flex-wrap">
            {vehicle.serviceTypes.map(service => (
              <span key={service} className="px-2 py-1 bg-violet-100 text-violet-800 rounded text-xs font-medium">
                {service}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  </div>
)}

{/* Enhanced Document Status Summary - ADD THIS */}
<div className="bg-gradient-to-br from-blue-50 to-indigo-50 rounded-xl border border-blue-200 p-6">
  <h3 className="text-lg font-semibold mb-4">Verification Progress</h3>
  <div className="space-y-3">
    <ProgressBar label="Identity Documents" 
      current={identityDocsVerified} 
      total={identityDocsRequired} />
    <ProgressBar label="Vehicle Documents" 
      current={vehicleDocsVerified} 
      total={vehicleDocsRequired} />
    <ProgressBar label="Bank Proof" 
      current={bankProofVerified ? 1 : 0} 
      total={1} />
  </div>
  
  {allDocsVerified && (
    <div className="mt-4 p-3 bg-green-100 border border-green-200 rounded-lg">
      <p className="text-sm font-medium text-green-800">
        ✓ All required documents verified! {paymentCompleted ? 'Rider is ready to go ACTIVE.' : 'Waiting for onboarding payment.'}
      </p>
    </div>
  )}
</div>
```

### 4. Environment Variables Required

Add to `.env`:

```env
# Cloudflare R2 Storage
R2_ACCOUNT_ID=your_account_id
R2_ACCESS_KEY_ID=your_access_key
R2_SECRET_ACCESS_KEY=your_secret_key
R2_BUCKET_NAME=rider-documents
```

### 5. Database Enhancements

Update `verification_status` enum to include more states:

```sql
ALTER TYPE document_verification_status ADD VALUE IF NOT EXISTS 're_upload_requested';
ALTER TYPE document_verification_status ADD VALUE IF NOT EXISTS 'under_review';

-- Add service activation tracking
CREATE TABLE IF NOT EXISTS rider_service_activations (
  id BIGSERIAL PRIMARY KEY,
  rider_id INTEGER NOT NULL REFERENCES riders(id) ON DELETE CASCADE,
  service_type TEXT NOT NULL, -- 'food', 'parcel', 'person_ride'
  is_active BOOLEAN NOT NULL DEFAULT false,
  activated_at TIMESTAMPTZ,
  deactivated_at TIMESTAMPTZ,
  activation_reason TEXT,
  deactivation_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(rider_id, service_type)
);

CREATE INDEX rider_service_activations_rider_id_idx ON rider_service_activations(rider_id);
CREATE INDEX rider_service_activations_service_type_idx ON rider_service_activations(service_type);
```

### 6. Improved Reject Document Function

**Update**: `dashboard/src/lib/db/operations/riders.ts`

```typescript
export async function rejectRiderDocument(
  docId: number,
  reason: string,
  agentId: number,
  requestReupload: boolean = true
): Promise<Record<string, unknown> | null> {
  const db = getDb();

  const [rejected] = await db
    .update(riderDocuments)
    .set({
      verified: false,
      verificationStatus: requestReupload ? 're_upload_requested' : 'rejected',
      rejectedReason: reason,
      verifierUserId: agentId,
      verifiedAt: null,
      updatedAt: new Date(),
    })
    .where(eq(riderDocuments.id, docId))
    .returning();

  return rejected;
}
```

## Implementation Checklist

- [ ] Run TEST_DATA_RIDERS_WITH_DOCS.sql to create test riders
- [ ] Update `approveRiderDocument()` with progressive status logic
- [ ] Create R2 URL generator utility
- [ ] Update document fetching APIs to auto-renew signed URLs
- [ ] Enhance UI with vehicle info and verification progress
- [ ] Add environment variables for R2
- [ ] Run database migration for service_activations table
- [ ] Update reject document logic
- [ ] Test all 10 scenarios end-to-end
- [ ] Update onboarding stages enum if needed

## Testing Flow

1. **Test Identity Verification** (Rider 1):
   - Approve Aadhaar front, Aadhaar back, PAN, Selfie
   - Check: KYC Status → APPROVED, Stage → KYC_APPROVED

2. **Test Vehicle Docs** (Rider 1):
   - Approve DL, RC, EV Proof
   - Check: Stage → DOCUMENTS_VERIFIED

3. **Test Rejection** (Rider 5):
   - Reject blurry Aadhaar with reason
   - Check: Document shows rejected with reason

4. **Test Full Flow** (Rider 1):
   - Mark payment as completed
   - Check: Status → ACTIVE, Stage → ACTIVE

5. **Test Service Activation**:
   - Verify services activated based on vehicle type

## Notes

- Document verification is now progressive and accurate
- R2 URLs auto-renew on every fetch
- UI clearly shows verification progress
- Service activation tied to verified documents + vehicle type
- Comprehensive test data covers all scenarios
