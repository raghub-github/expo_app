# Quick Start Guide - Rider Onboarding System

## Step 1: Install Dependencies (2 minutes)

```bash
cd dashboard
npm install
```

This installs AWS SDK for R2 integration.

## Step 2: Run the SQL Script (1 minute)

**Copy the entire contents of this file and paste into Supabase SQL Editor:**
```
dashboard/RUN_THIS_IN_SQL_EDITOR.sql
```

Click "Run" - this will:
- ✅ Sync referrals from riders.referred_by
- ✅ Create 5 test riders with complete document data
- ✅ Show summary of created riders

## Step 3: Configure R2 (Optional - for production)

Add to `dashboard/.env.local`:

```env
R2_ACCOUNT_ID=your_account_id
R2_ACCESS_KEY_ID=your_access_key
R2_SECRET_ACCESS_KEY=your_secret_key
R2_BUCKET_NAME=rider-documents
```

**Note**: For testing, this is optional. Test riders use placeholder images.

## Step 4: Test the System (5 minutes)

1. **Navigate to Rider Onboarding**:
   ```
   http://localhost:3000/dashboard/riders/1001/onboarding
   ```
   (Replace 1001 with actual GMR ID from SQL output)

2. **Test Verification Flow**:
   - Click "Approve" on Aadhaar Front
   - Click "Approve" on Aadhaar Back
   - Click "Approve" on PAN
   - Click "Approve" on Selfie
   - **Watch**: KYC Status changes to "APPROVED"
   
3. **Complete Vehicle Docs**:
   - Click "Approve" on DL Front
   - Click "Approve" on DL Back  
   - Click "Approve" on RC
   - **Watch**: Stage changes to "DOCUMENTS_VERIFIED"

4. **Test Rejection**:
   - Go to Rider GMR1004
   - Documents already rejected
   - See rejection reasons displayed
   - Try re-approving them

5. **View Success Case**:
   - Go to Rider GMR1003
   - All docs approved
   - Status shows "ACTIVE"
   - This is how a fully onboarded rider looks

## What You'll See

### ✅ Enhanced UI:
- Vehicle information card (type, registration, make, model, fuel)
- Verification progress bars showing completion
- Document status badges (Pending/Approved/Rejected)
- Success message when all docs verified

### ✅ Progressive Status Updates:
- Identity docs verified → KYC: APPROVED
- All docs verified → Stage: DOCUMENTS_VERIFIED
- Payment done → Status: ACTIVE

### ✅ Auto-Renewed Image URLs:
- R2 signed URLs regenerated on every page load
- Images never expire
- Fresh URLs valid for 1 hour

### ✅ Better Document Display:
- Shows document number
- Shows verification method (Manual/App Verified)
- Shows rejected reason if applicable
- Shows verifier details

## Test Riders Created

| Rider ID | Mobile | Scenario | Status |
|----------|--------|----------|--------|
| GMR1001 | 9999001001 | EV Bike - All pending | INACTIVE |
| GMR1002 | 9999002002 | Petrol - Mixed verification | INACTIVE |
| GMR1003 | 9999003003 | Fully Verified | ACTIVE ✓ |
| GMR1004 | 9999004004 | Rejected Docs | INACTIVE |
| GMR1005 | 9999005005 | Missing Critical Docs | INACTIVE |

## Common Actions

### Approve a Document:
1. Click green checkmark button
2. Confirm approval
3. Status updates automatically

### Reject a Document:
1. Click red X button
2. Enter rejection reason (required)
3. Click "Reject Document"
4. Rider can see reason and re-upload

### View Document:
1. Click "View" button
2. Full-size image opens
3. Can zoom and inspect details

## Verification Logic

### Identity Documents Required:
- ✅ Aadhaar (Front + Back OR single)
- ✅ PAN Card
- ✅ Selfie

### Vehicle Documents Required:
- ✅ Driving License (Front + Back OR single)
- ✅ RC Certificate OR Rental Proof (for EV rentals)
- ✅ EV Proof (for EV vehicles)

### Additional Documents:
- Bank Proof (Passbook/Statement)
- Insurance Certificate
- Vehicle Photo
- UPI QR Proof

## Troubleshooting

**Q: Status not updating after approval?**
- Check browser console for errors
- Refresh the page
- Verify all required docs are approved

**Q: Images not loading?**
- Test riders use placeholder images (via.placeholder.com)
- For production, configure R2 credentials
- Check if r2_key column has values

**Q: Referral count still 0?**
- Run the sync SQL script (Part 1 in RUN_THIS_IN_SQL_EDITOR.sql)
- Refresh the referral data page
- Check if riders have referred_by values

## Files Changed

✅ Created:
- `dashboard/src/lib/r2/url-generator.ts` - R2 URL auto-renewal
- `dashboard/drizzle/TEST_DATA_RIDERS_WITH_DOCS.sql` - Full test data
- `dashboard/drizzle/0090_sync_referrals_from_riders_referred_by.sql` - Referral sync
- `dashboard/RUN_THIS_IN_SQL_EDITOR.sql` - Combined SQL script
- `dashboard/.env.example` - Environment template
- `dashboard/SETUP_INSTRUCTIONS.md` - Detailed setup
- `dashboard/QUICK_START.md` - This file

✅ Updated:
- `dashboard/src/lib/db/operations/riders.ts` - Enhanced verification logic
- `dashboard/src/app/dashboard/riders/[id]/onboarding/page.tsx` - UI improvements
- `dashboard/src/app/api/riders/[id]/referral-data/route.ts` - Fixed referral count
- `dashboard/package.json` - Added AWS SDK dependencies

## Success! 🎉

Your rider onboarding system is now:
- ✅ Modern and accurate
- ✅ Progressive status updates
- ✅ Auto-renewing image URLs
- ✅ Better UI/UX
- ✅ Comprehensive test data
- ✅ Production-ready

**Start testing now**: Run the SQL script and navigate to the onboarding page!
