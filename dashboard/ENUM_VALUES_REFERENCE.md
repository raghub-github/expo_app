# Database Enum Values Reference

## Valid Enum Values for Riders

### onboarding_stage
- `MOBILE_VERIFIED` (default)
- `KYC`
- `PAYMENT`
- `APPROVAL`
- `ACTIVE`

### kyc_status
- `PENDING` (default)
- `REJECTED`
- `APPROVED`
- `REVIEW` (optional)

### rider_status
- `INACTIVE` (default)
- `ACTIVE`
- `SUSPENDED`
- `BLOCKED`

### vehicle_type
- `bike` (Petrol/Diesel motorcycle)
- `ev_bike` (Electric bike/scooter)
- `cycle` (Bicycle)
- `car` (Petrol/Diesel car)
- `auto` (Auto rickshaw - CNG)
- `cng_auto` (CNG auto)
- `ev_auto` (Electric auto)
- `taxi` (Taxi)
- `e_rickshaw` (Electric rickshaw)
- `ev_car` (Electric car)
- `other`

### fuel_type
- `petrol`
- `diesel`
- `cng`
- `electric`
- `hybrid`

### document_verification_status
- `pending` (default)
- `approved`
- `rejected`
- `under_review` (optional)
- `re_upload_requested` (optional)

### verification_method
- `MANUAL_UPLOAD` (default)
- `APP_VERIFIED` (via DigiLocker)

### service_type (for service_types array)
- `food`
- `parcel`
- `person_ride`

## Common Mistakes to Avoid

❌ **Wrong**: `two_wheeler` → ✅ **Correct**: `bike` or `ev_bike`
❌ **Wrong**: `auto_rickshaw` → ✅ **Correct**: `auto`
❌ **Wrong**: `DOCUMENTS_UPLOADED` → ✅ **Correct**: `KYC` or `PAYMENT`
❌ **Wrong**: `IN_PROGRESS` → ✅ **Correct**: `PENDING`
❌ **Wrong**: `petrol_bike` → ✅ **Correct**: `bike` (fuel_type should be `petrol`)

## SQL Script Updates

All SQL scripts have been fixed with correct enum values:
- ✅ `dashboard/RUN_THIS_IN_SQL_EDITOR.sql`
- ✅ `dashboard/drizzle/TEST_DATA_RIDERS_WITH_DOCS.sql`

**Run the script again - it should work now!**
