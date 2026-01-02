# Database Schema - Quick Reference

## Rider ID Format

**IMPORTANT**: Rider IDs are **INTEGER** (auto-incrementing), not UUID or text.

- ✅ `1, 2, 3, 100, 1000` - Valid
- ❌ `R001, rid_123, uuid` - Invalid

## Quick Schema Overview

### Core Tables

```typescript
riders                    // INTEGER id, mobile, status, kyc_status
rider_documents          // Document history (allows reupload)
rider_devices            // Device tracking
duty_logs                // ON/OFF duty tracking
location_logs            // Partitioned by month
orders                   // Multi-category orders
order_actions            // Accept/reject logs
order_events             // Timeline events
wallet_ledger            // Partitioned by rider_id hash
withdrawal_requests      // Withdrawal management
onboarding_payments      // Registration fees
offers                   // Campaign offers
offer_participation      // Rider participation
ratings                  // Customer/merchant ratings
tickets                  // Support tickets
referrals                // Referral system
rider_daily_analytics    // Pre-aggregated metrics
fraud_logs               // Fraud detection
admin_action_logs        // Admin audit trail
blacklist_history        // Blacklist tracking
```

## Common Queries

### Get Rider by ID
```typescript
const rider = await db.query.riders.findFirst({
  where: eq(riders.id, riderId)
});
```

### Get Active Orders
```typescript
const orders = await db.select()
  .from(orders)
  .where(
    and(
      eq(orders.riderId, riderId),
      inArray(orders.status, ['assigned', 'accepted', 'in_transit'])
    )
  );
```

### Get Wallet Balance
```typescript
// Use RPC function
const { data } = await supabase.rpc('get_rider_wallet_balance', {
  p_rider_id: riderId
});
```

## Migration Commands

```bash
# Generate migration
npm run db:generate

# Apply migration
npm run db:push

# Check migration status
supabase migration list
```

## Important Notes

1. **Always use transactions** for multi-table operations
2. **Use RPC functions** for complex atomic operations
3. **Cache frequently** accessed data (duty status, wallet balance)
4. **Partition large tables** (location_logs, wallet_ledger)
5. **Enable RLS** on all tables for security

See full documentation in `/docs` folder.
