# Rider Onboarding & Verification System - Setup Instructions

## 1. Install Dependencies

```bash
cd dashboard
npm install
```

This will install the new AWS SDK packages for R2 integration.

## 2. Configure Environment Variables

Create or update `dashboard/.env.local`:

```env
# Cloudflare R2 Configuration (Required for document storage)
R2_ACCOUNT_ID=your_account_id_here
R2_ACCESS_KEY_ID=your_access_key_here
R2_SECRET_ACCESS_KEY=your_secret_key_here
R2_BUCKET_NAME=rider-documents
```

### How to get R2 credentials:
1. Go to Cloudflare Dashboard → R2
2. Create a bucket called `rider-documents` (if not exists)
3. Generate API tokens with read/write access
4. Copy the credentials to `.env.local`

## 3. Run Database Migrations

### a) Sync Referrals Table
```sql
-- Run in Supabase SQL Editor
\i dashboard/drizzle/0090_sync_referrals_from_riders_referred_by.sql
```

### b) Create Test Data (OPTIONAL - for testing)
```sql
-- Run in Supabase SQL Editor
-- Copy and paste contents of: dashboard/drizzle/TEST_DATA_RIDERS_WITH_DOCS.sql
```

This creates 10 test riders with various document states.

## 4. Test the System

### Test Riders Created:
- **GMR1001** (9999001001): All docs pending - test fresh verification
- **GMR1002** (9999002002): Mixed status - test partial verification
- **GMR1003** (9999003003): Auto rickshaw - test person_ride service
- **GMR1004** (9999004004): EV rental - test rental proof flow
- **GMR1005** (9999005005): Rejected docs - test rejection flow
- **GMR1006** (9999006006): Fully active - test success case
- **GMR1007** (9999007007): Car - test car verification
- **GMR1008** (9999008008): APP_VERIFIED - test DigiLocker flow
- **GMR1009** (9999009009): Missing docs - test incomplete flow
- **GMR1010** (9999010010): Complete with expiry - test expiry dates

### Testing Flow:

1. **Navigate to Onboarding Page**:
   - Go to `/dashboard/riders/1001/onboarding` (or any test rider)

2. **Verify Identity Documents**:
   - Click "Approve" on Aadhaar Front
   - Click "Approve" on Aadhaar Back (or single Aadhaar)
   - Click "Approve" on PAN
   - Click "Approve" on Selfie
   - **Expected**: KYC Status → APPROVED, Onboarding Stage → KYC_APPROVED

3. **Verify Vehicle Documents**:
   - Click "Approve" on DL Front
   - Click "Approve" on DL Back (or single DL)
   - Click "Approve" on RC (or Rental Proof for EV rentals)
   - **Expected**: Onboarding Stage → DOCUMENTS_VERIFIED

4. **Test Rejection**:
   - Click "Reject" on any document
   - Enter reason: "Image is blurry"
   - **Expected**: Document shows rejected with reason, KYC Status may change to REJECTED

5. **Complete Onboarding**:
   - If payment is completed, status should go to ACTIVE

## 5. Features Implemented

✅ **Progressive Status Updates**:
- Identity docs verified → KYC APPROVED
- All docs verified → DOCUMENTS_VERIFIED  
- Payment completed → ACTIVE

✅ **R2 Signed URL Auto-Renewal**:
- URLs regenerated on every page load
- Utility functions in `dashboard/src/lib/r2/url-generator.ts`
- Integrated with existing `getSignedUrlFromKey` service

✅ **Enhanced UI**:
- Vehicle information card showing all details
- Verification progress bars with completion status
- Better document status indicators
- More document types supported

✅ **Document Verification Actions**:
- Approve: Updates verification status + updates rider status
- Reject: Marks doc as rejected with reason + may update KYC to REJECTED
- View: Opens full-size document viewer
- Edit: Allows updating document number or re-uploading

✅ **Service Activation**:
- Services activated based on vehicle type
- Tracked through rider status and vehicle service_types

## 6. API Endpoints

### Document Approval
`POST /api/riders/[id]/documents/[docId]/approve`
- Approves document
- Updates rider KYC/onboarding status
- Returns updated rider state

### Document Rejection
`POST /api/riders/[id]/documents/[docId]/reject`
- Rejects document with reason
- Updates rider KYC status if critical doc
- Returns rejected document

### Get Rider Data
`GET /api/riders/[id]`
- Auto-renews all R2 signed URLs
- Returns rider, documents, vehicle, wallet, etc.

## 7. Database Schema

### Key Tables:
- `riders`: Core rider info + status fields
- `rider_documents`: Document uploads with verification status
- `rider_document_files`: Multi-file support (front/back)
- `rider_vehicles`: Vehicle information
- `referrals`: Referral tracking (now synced from riders.referred_by)

### Status Enums:
- `onboarding_stage`: MOBILE_VERIFIED → KYC_APPROVED → DOCUMENTS_VERIFIED → PAYMENT_PENDING → ACTIVE
- `kyc_status`: PENDING → APPROVED / REJECTED
- `rider_status`: INACTIVE → ACTIVE
- `document_verification_status`: pending → approved / rejected

## 8. Troubleshooting

### Documents not showing:
- Check R2 credentials in `.env.local`
- Check if `r2_key` column has values in `rider_documents` table
- Check browser console for URL generation errors

### Status not updating:
- Check if `approveRiderDocument` function is being called
- Check database for updated `verification_status` column
- Check if all required documents are verified

### Images not loading:
- Verify R2 bucket permissions
- Check CORS settings in R2 bucket
- Ensure signed URLs are generated correctly

## 9. Production Checklist

- [ ] Set up R2 bucket with proper CORS
- [ ] Configure R2 credentials in production
- [ ] Run sync referrals migration
- [ ] Test document upload flow end-to-end
- [ ] Set up monitoring for failed URL generations
- [ ] Configure webhook for payment completion
- [ ] Set up automated KYC verification (optional)

## Need Help?

Check the detailed implementation in:
- `dashboard/ONBOARDING_VERIFICATION_IMPROVEMENTS.md`
