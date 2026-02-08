# 🚀 START HERE - Rider Onboarding Setup

## Step 1: Install Dependencies (30 seconds)
```bash
cd dashboard
npm install
```

## Step 2: Run SQL Script (30 seconds)

### Option A: Simple Version (Recommended)
**Open this file**: `dashboard/FINAL_SQL_SCRIPT.sql`

**Copy everything** → Paste into **Supabase SQL Editor** → Click **Run**

### Option B: Full Version (More test data)
**Open this file**: `dashboard/RUN_THIS_IN_SQL_EDITOR.sql`

**Copy everything** → Paste into **Supabase SQL Editor** → Click **Run**

## Step 3: Test It! (2 minutes)

Navigate to: `http://localhost:3000/dashboard/riders/[ID]/onboarding`

Replace `[ID]` with rider ID from SQL output (check console after running SQL)

### What to Do:
1. Click green checkmark ✓ on **Aadhaar Front** → Click "Approve"
2. Click green checkmark ✓ on **Aadhaar Back** → Click "Approve"
3. Click green checkmark ✓ on **PAN** → Click "Approve"
4. Click green checkmark ✓ on **Selfie** → Click "Approve"

**Watch the magic**: KYC Status changes to "APPROVED" automatically! 🎉

5. Click green checkmark ✓ on **DL Front** → Click "Approve"
6. Click green checkmark ✓ on **DL Back** → Click "Approve"
7. Click green checkmark ✓ on **RC** → Click "Approve"

**Watch**: Onboarding Stage changes to "DOCUMENTS_VERIFIED"! 🎉

## Test Riders Created:

| Rider ID | Name | Type | Status | Test This |
|----------|------|------|--------|-----------|
| GMR1001 | Amit Kumar | EV Bike | All Pending | ✅ Full approval flow |
| GMR1002 | Priya Sharma | Petrol Bike | Mixed | ✅ Partial approval |
| GMR1003 | Anjali Gupta | EV Bike | **ACTIVE** | ✅ Success case |
| GMR1004 | Vikram Reddy | Petrol Bike | Rejected | ✅ Rejection flow |
| GMR1005 | Karan Malhotra | Bike | Incomplete | ✅ Missing docs |

## Features Now Working:

✅ **Progressive Status Updates**
- Approve identity docs → KYC becomes APPROVED
- Approve vehicle docs → Stage becomes DOCUMENTS_VERIFIED  
- Complete payment → Status becomes ACTIVE

✅ **R2 Auto-Renewal**
- Document images always load (never expire!)

✅ **Enhanced UI**
- Vehicle info card
- Progress bars showing completion
- Better document status

✅ **Referral Data Fixed**
- Total count now accurate

## Valid Enum Values

### Vehicle Types:
- `bike` (Petrol bike)
- `ev_bike` (Electric bike)
- `auto` (Auto rickshaw)
- `car` (Car)
- `taxi`, `ev_car`, `e_rickshaw`, `cycle`

### Onboarding Stages:
- `MOBILE_VERIFIED` → `KYC` → `PAYMENT` → `APPROVAL` → `ACTIVE`

### KYC Status:
- `PENDING` → `APPROVED` or `REJECTED`

## That's It!

**Run the SQL script and start testing!** 🎉

Need help? Check:
- `dashboard/QUICK_START.md` - Detailed guide
- `dashboard/ENUM_VALUES_REFERENCE.md` - All enum values
- `dashboard/SETUP_INSTRUCTIONS.md` - Full setup
