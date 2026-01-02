# Backend API Integration Guide

## Overview

This document provides guidance on how backend APIs should interact with the database schema, including transaction handling, RPC functions, Row-Level Security, and caching strategies.

## Database Connection

### Drizzle ORM Setup

```typescript
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './db/schema';

const connectionString = process.env.DATABASE_URL!;
const client = postgres(connectionString);
export const db = drizzle(client, { schema });
```

## Writing Data

### 1. Single Table Inserts

```typescript
// Insert new rider
const [newRider] = await db.insert(riders).values({
  mobile: '+919876543210',
  countryCode: '+91',
  name: 'John Doe',
  onboardingStage: 'MOBILE_VERIFIED',
  kycStatus: 'PENDING',
  status: 'INACTIVE',
}).returning();

// Insert document
await db.insert(riderDocuments).values({
  riderId: newRider.id,
  docType: 'aadhaar',
  fileUrl: 'https://storage.../aadhaar.pdf',
  verified: false,
});
```

### 2. Multi-Table Transactions

**Critical**: Always use transactions for operations that span multiple tables.

```typescript
// Example: Create order with events
await db.transaction(async (tx) => {
  // Create order
  const [order] = await tx.insert(orders).values({
    orderType: 'food',
    riderId: riderId,
    pickupAddress: '...',
    dropAddress: '...',
    pickupLat: 19.0760,
    pickupLon: 72.8777,
    dropLat: 19.2183,
    dropLon: 72.9781,
    status: 'assigned',
  }).returning();

  // Create order event
  await tx.insert(orderEvents).values({
    orderId: order.id,
    event: 'assigned',
    actorType: 'system',
    metadata: { assignedAt: new Date() },
  });

  // Create order action
  await tx.insert(orderActions).values({
    orderId: order.id,
    riderId: riderId,
    action: 'accept',
  });

  return order;
});
```

### 3. Wallet Operations (Critical Transactions)

```typescript
// Wallet credit/debit MUST be atomic
async function creditWallet(
  riderId: number,
  amount: number,
  entryType: WalletEntryType,
  ref?: string,
  refType?: string
) {
  return await db.transaction(async (tx) => {
    // Get current balance
    const [lastEntry] = await tx
      .select({ balance: walletLedger.balance })
      .from(walletLedger)
      .where(eq(walletLedger.riderId, riderId))
      .orderBy(desc(walletLedger.createdAt))
      .limit(1);

    const currentBalance = lastEntry?.balance ?? 0;
    const newBalance = Number(currentBalance) + Number(amount);

    // Insert ledger entry
    const [entry] = await tx
      .insert(walletLedger)
      .values({
        riderId,
        entryType,
        amount: amount.toString(),
        balance: newBalance.toString(),
        ref,
        refType,
      })
      .returning();

    // Invalidate Redis cache
    await redis.del(`rider:wallet:balance:${riderId}`);

    return entry;
  });
}
```

## RPC Functions (Supabase Functions)

### Recommended RPC Functions

#### 1. Get Rider Wallet Balance

```sql
CREATE OR REPLACE FUNCTION get_rider_wallet_balance(p_rider_id INTEGER)
RETURNS NUMERIC AS $$
DECLARE
  v_balance NUMERIC;
BEGIN
  SELECT COALESCE(balance, 0)
  INTO v_balance
  FROM wallet_ledger
  WHERE rider_id = p_rider_id
  ORDER BY created_at DESC
  LIMIT 1;
  
  RETURN COALESCE(v_balance, 0);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
```

**Usage**:
```typescript
const { data } = await supabase.rpc('get_rider_wallet_balance', {
  p_rider_id: riderId
});
```

#### 2. Update Order Status with Event

```sql
CREATE OR REPLACE FUNCTION update_order_status(
  p_order_id INTEGER,
  p_new_status order_status,
  p_actor_type TEXT,
  p_actor_id INTEGER DEFAULT NULL
)
RETURNS VOID AS $$
BEGIN
  -- Update order
  UPDATE orders
  SET status = p_new_status, updated_at = NOW()
  WHERE id = p_order_id;
  
  -- Create event
  INSERT INTO order_events (order_id, event, actor_type, actor_id)
  VALUES (p_order_id, p_new_status::TEXT, p_actor_type, p_actor_id);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
```

#### 3. Accept Order (Atomic Operation)

```sql
CREATE OR REPLACE FUNCTION accept_order(
  p_order_id INTEGER,
  p_rider_id INTEGER
)
RETURNS BOOLEAN AS $$
DECLARE
  v_current_status order_status;
BEGIN
  -- Check current status
  SELECT status INTO v_current_status
  FROM orders
  WHERE id = p_order_id;
  
  IF v_current_status != 'assigned' THEN
    RETURN FALSE;
  END IF;
  
  -- Update order
  UPDATE orders
  SET status = 'accepted', rider_id = p_rider_id, updated_at = NOW()
  WHERE id = p_order_id;
  
  -- Create action
  INSERT INTO order_actions (order_id, rider_id, action)
  VALUES (p_order_id, p_rider_id, 'accept');
  
  -- Create event
  INSERT INTO order_events (order_id, event, actor_type, actor_id)
  VALUES (p_order_id, 'accepted', 'rider', p_rider_id);
  
  RETURN TRUE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
```

#### 4. Batch Insert Location Logs

```sql
CREATE OR REPLACE FUNCTION batch_insert_location_logs(
  p_logs JSONB
)
RETURNS INTEGER AS $$
DECLARE
  v_count INTEGER;
BEGIN
  INSERT INTO location_logs (rider_id, lat, lon, battery_percent, accuracy, speed, heading)
  SELECT 
    (log->>'rider_id')::INTEGER,
    (log->>'lat')::DOUBLE PRECISION,
    (log->>'lon')::DOUBLE PRECISION,
    (log->>'battery_percent')::INTEGER,
    (log->>'accuracy')::DOUBLE PRECISION,
    (log->>'speed')::DOUBLE PRECISION,
    (log->>'heading')::DOUBLE PRECISION
  FROM jsonb_array_elements(p_logs) AS log;
  
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
```

## Row-Level Security (RLS)

### RLS Policy Examples

#### 1. Riders Can Only Access Their Own Data

```sql
-- Enable RLS
ALTER TABLE riders ENABLE ROW LEVEL SECURITY;
ALTER TABLE wallet_ledger ENABLE ROW LEVEL SECURITY;
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;

-- Policy: Riders can view their own data
CREATE POLICY "riders_select_own" ON riders
  FOR SELECT
  USING (id = current_setting('app.current_rider_id', TRUE)::INTEGER);

-- Policy: Riders can update their own profile
CREATE POLICY "riders_update_own" ON riders
  FOR UPDATE
  USING (id = current_setting('app.current_rider_id', TRUE)::INTEGER);

-- Policy: Riders can view their own wallet
CREATE POLICY "wallet_select_own" ON wallet_ledger
  FOR SELECT
  USING (rider_id = current_setting('app.current_rider_id', TRUE)::INTEGER);

-- Policy: Riders can view their own orders
CREATE POLICY "orders_select_own" ON orders
  FOR SELECT
  USING (rider_id = current_setting('app.current_rider_id', TRUE)::INTEGER);
```

#### 2. Setting Current Rider Context

```typescript
// In your API middleware (after JWT verification)
async function setRiderContext(riderId: number) {
  await db.execute(
    sql`SET LOCAL app.current_rider_id = ${riderId.toString()}`
  );
}

// Usage in route handler
app.get('/api/rider/wallet', authenticateRider, async (req, res) => {
  await setRiderContext(req.user.riderId);
  const balance = await getWalletBalance(req.user.riderId);
  res.json({ balance });
});
```

#### 3. Admin Policies

```sql
-- Admin can view all data
CREATE POLICY "admin_select_all" ON riders
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM admin_users 
      WHERE id = current_setting('app.current_admin_id', TRUE)::INTEGER
      AND role = 'admin'
    )
  );
```

## Caching Strategy

### Redis Integration

```typescript
import Redis from 'ioredis';

const redis = new Redis(process.env.REDIS_URL);

// Cache rider duty status
async function getRiderDutyStatus(riderId: number): Promise<string | null> {
  const cacheKey = `rider:duty:${riderId}`;
  
  // Try cache first
  const cached = await redis.get(cacheKey);
  if (cached) return cached;
  
  // Query database
  const [latest] = await db
    .select({ status: dutyLogs.status })
    .from(dutyLogs)
    .where(eq(dutyLogs.riderId, riderId))
    .orderBy(desc(dutyLogs.timestamp))
    .limit(1);
  
  const status = latest?.status ?? 'OFF';
  
  // Cache for 5 minutes
  await redis.setex(cacheKey, 300, status);
  
  return status;
}

// Update duty status (invalidate cache)
async function updateDutyStatus(riderId: number, status: DutyStatus) {
  await db.transaction(async (tx) => {
    await tx.insert(dutyLogs).values({
      riderId,
      status,
    });
  });
  
  // Update cache
  await redis.setex(`rider:duty:${riderId}`, 300, status);
}

// Cache wallet balance
async function getWalletBalance(riderId: number): Promise<number> {
  const cacheKey = `rider:wallet:balance:${riderId}`;
  
  const cached = await redis.get(cacheKey);
  if (cached) return parseFloat(cached);
  
  // Use RPC function or query
  const balance = await getRiderWalletBalance(riderId);
  
  // Cache for 1 minute
  await redis.setex(cacheKey, 60, balance.toString());
  
  return balance;
}

// Invalidate on wallet update
async function invalidateWalletCache(riderId: number) {
  await redis.del(`rider:wallet:balance:${riderId}`);
}
```

## Query Patterns

### 1. Get Rider Profile with Documents

```typescript
const riderProfile = await db.query.riders.findFirst({
  where: eq(riders.id, riderId),
  with: {
    documents: {
      where: eq(riderDocuments.verified, true),
    },
    devices: {
      where: eq(riderDevices.allowed, true),
    },
  },
});
```

### 2. Get Active Orders for Rider

```typescript
const activeOrders = await db
  .select()
  .from(orders)
  .where(
    and(
      eq(orders.riderId, riderId),
      inArray(orders.status, ['assigned', 'accepted', 'reached_store', 'picked_up', 'in_transit'])
    )
  )
  .orderBy(desc(orders.createdAt));
```

### 3. Get Wallet Transactions with Pagination

```typescript
const transactions = await db
  .select()
  .from(walletLedger)
  .where(eq(walletLedger.riderId, riderId))
  .orderBy(desc(walletLedger.createdAt))
  .limit(20)
  .offset((page - 1) * 20);
```

### 4. Get Daily Analytics

```typescript
const analytics = await db
  .select()
  .from(riderDailyAnalytics)
  .where(
    and(
      eq(riderDailyAnalytics.riderId, riderId),
      gte(riderDailyAnalytics.date, startDate),
      lte(riderDailyAnalytics.date, endDate)
    )
  )
  .orderBy(desc(riderDailyAnalytics.date));
```

## Error Handling

### Transaction Rollback

```typescript
try {
  await db.transaction(async (tx) => {
    // Multiple operations
    await tx.insert(orders).values({...});
    await tx.insert(orderEvents).values({...});
    // If any operation fails, entire transaction rolls back
  });
} catch (error) {
  // Handle error
  console.error('Transaction failed:', error);
  throw error;
}
```

### Constraint Violations

```typescript
try {
  await db.insert(riders).values({ mobile: '+919876543210' });
} catch (error) {
  if (error.code === '23505') { // Unique violation
    throw new Error('Mobile number already exists');
  }
  throw error;
}
```

## Best Practices

### 1. Always Use Transactions for Multi-Table Operations
- Order creation with events
- Wallet updates
- Status changes with audit logs

### 2. Use RPC Functions for Complex Operations
- Atomic status updates
- Balance calculations
- Batch inserts

### 3. Implement RLS for Data Security
- Riders can only access their own data
- Admins have elevated privileges
- System operations use service accounts

### 4. Cache Aggressively
- Frequently accessed data (duty status, wallet balance)
- Expensive queries (leaderboards, analytics)
- Real-time data (active riders by city)

### 5. Batch Operations When Possible
- Location logs (batch insert every 5 seconds)
- Analytics aggregation (nightly cron)
- Cache warming (preload common queries)

### 6. Monitor Query Performance
- Log slow queries (>100ms)
- Use EXPLAIN ANALYZE for optimization
- Monitor index usage

## Example API Endpoints

### Rider Onboarding

```typescript
app.post('/api/rider/onboard', async (req, res) => {
  const { mobile, name, documents } = req.body;
  
  await db.transaction(async (tx) => {
    // Create rider
    const [rider] = await tx.insert(riders).values({
      mobile,
      name,
      onboardingStage: 'KYC',
    }).returning();
    
    // Upload documents
    for (const doc of documents) {
      await tx.insert(riderDocuments).values({
        riderId: rider.id,
        docType: doc.type,
        fileUrl: doc.url,
      });
    }
    
    res.json({ riderId: rider.id });
  });
});
```

### Accept Order

```typescript
app.post('/api/orders/:orderId/accept', authenticateRider, async (req, res) => {
  const { orderId } = req.params;
  const riderId = req.user.riderId;
  
  // Use RPC function for atomic operation
  const { data: success } = await supabase.rpc('accept_order', {
    p_order_id: parseInt(orderId),
    p_rider_id: riderId,
  });
  
  if (!success) {
    return res.status(400).json({ error: 'Order cannot be accepted' });
  }
  
  res.json({ success: true });
});
```

### Get Wallet Balance

```typescript
app.get('/api/rider/wallet/balance', authenticateRider, async (req, res) => {
  const riderId = req.user.riderId;
  
  // Use cached function
  const balance = await getWalletBalance(riderId);
  
  res.json({ balance });
});
```

This integration guide provides the foundation for building robust, scalable APIs that interact with the database schema efficiently and securely.
