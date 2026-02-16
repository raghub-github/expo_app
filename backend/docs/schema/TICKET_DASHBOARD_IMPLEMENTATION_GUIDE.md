# Enterprise Ticket Dashboard - Implementation Guide

## Quick Start

This guide provides step-by-step instructions for implementing the enterprise ticket dashboard system.

---

## Phase 1: Database Setup

### 1.1 Run Migrations

```bash
# Run the enhancement migration
psql -U postgres -d your_database -f backend/drizzle/0061_enterprise_ticket_dashboard_enhancements.sql
```

### 1.2 Verify Tables

```sql
-- Check all new tables exist
SELECT table_name 
FROM information_schema.tables 
WHERE table_schema = 'public' 
  AND table_name LIKE 'ticket_%' 
ORDER BY table_name;
```

### 1.3 Seed Initial Data

```sql
-- Verify default priorities
SELECT * FROM ticket_priorities ORDER BY priority_level;

-- Verify default statuses
SELECT * FROM ticket_statuses ORDER BY display_order;

-- Verify default roles
SELECT * FROM roles WHERE role_type = 'system';
```

---

## Phase 2: Backend API Implementation

### 2.1 API Endpoints Structure

```
/api/tickets/
  GET    /                    # List tickets (with filters)
  POST   /                    # Create ticket
  GET    /:id                 # Get ticket detail
  PATCH  /:id                 # Update ticket
  POST   /:id/assign          # Assign ticket
  POST   /:id/resolve         # Resolve ticket
  POST   /:id/close           # Close ticket
  POST   /:id/reopen          # Reopen ticket
  GET    /:id/messages        # Get messages
  POST   /:id/messages        # Send message
  GET    /:id/timeline        # Get activity timeline
  GET    /:id/attachments     # Get attachments
  POST   /:id/attachments     # Upload attachment

/api/tickets/filters/
  GET    /saved               # Get saved filters
  POST   /saved               # Save filter
  DELETE /saved/:id           # Delete saved filter

/api/tickets/assignment/
  POST   /auto                # Trigger auto-assignment
  GET    /queue               # Get assignment queue status

/api/tickets/admin/
  GET    /custom-fields       # List custom fields
  POST   /custom-fields       # Create custom field
  GET    /sla-policies        # List SLA policies
  POST   /sla-policies        # Create SLA policy
  GET    /routing-rules       # List routing rules
  POST   /routing-rules       # Create routing rule
  GET    /automation-rules    # List automation rules
  POST   /automation-rules    # Create automation rule

/api/tickets/analytics/
  GET    /csat                # CSAT analytics
  GET    /dsat                # DSAT analytics
  GET    /performance         # Agent performance
```

### 2.2 Permission Checks

**Example: Check permission before action**

```typescript
// lib/tickets/permissions.ts
export async function checkTicketPermission(
  userId: number,
  action: 'view' | 'assign' | 'reply' | 'resolve' | 'close',
  serviceType: TicketServiceType,
  ticketSection?: TicketSection
): Promise<boolean> {
  const permissionCode = `ticket.${action === 'view' ? 'view' : 'action.${action}'}.${serviceType}${ticketSection ? `.${ticketSection}` : ''}`;
  
  const hasPermission = await db.query(`
    SELECT EXISTS(
      SELECT 1
      FROM user_roles ur
      JOIN role_permissions rp ON ur.role_id = rp.role_id
      JOIN permissions p ON rp.permission_id = p.id
      WHERE ur.user_id = $1
        AND ur.is_active = TRUE
        AND (ur.expires_at IS NULL OR ur.expires_at > NOW())
        AND rp.grant_type = 'allow'
        AND p.permission_code = $2
        AND p.is_active = TRUE
    )
  `, [userId, permissionCode]);
  
  return hasPermission.rows[0].exists;
}
```

### 2.3 Auto-Assignment Worker

**Example: Assignment worker implementation**

```typescript
// workers/ticket-assignment.ts
import Bull from 'bull';
import { getDb } from '@/lib/db';

const assignmentQueue = new Bull('ticket-assignment', {
  redis: { host: process.env.REDIS_HOST, port: 6379 }
});

assignmentQueue.process(async (job) => {
  const { ticketId } = job.data;
  const db = getDb();
  
  // Get ticket
  const ticket = await db.query('SELECT * FROM tickets WHERE id = $1', [ticketId]);
  
  // Get active routing rules (ordered by priority)
  const rules = await db.query(`
    SELECT * FROM ticket_routing_rules 
    WHERE is_active = TRUE 
    ORDER BY rule_priority DESC
  `);
  
  // Evaluate rules
  for (const rule of rules) {
    if (matchesConditions(ticket, rule.conditions)) {
      const agent = await findBestAgent(ticket, rule);
      if (agent) {
        await assignTicket(ticketId, agent.id, 'auto', rule.id);
        return { success: true, agentId: agent.id };
      }
    }
  }
  
  // Fallback: assign to default group
  throw new Error('No agent found');
});

async function matchesConditions(ticket: any, conditions: any): Promise<boolean> {
  // Implement condition matching logic
  if (conditions.service_type && !conditions.service_type.includes(ticket.service_type)) {
    return false;
  }
  if (conditions.priority && !conditions.priority.includes(ticket.priority)) {
    return false;
  }
  // ... more conditions
  return true;
}

async function findBestAgent(ticket: any, rule: any): Promise<any> {
  const db = getDb();
  
  // Get eligible agents based on routing strategy
  const agents = await db.query(`
    SELECT 
      u.id,
      u.full_name,
      ap.max_concurrent_tickets,
      ap.is_online,
      COUNT(ta.id) as current_tickets
    FROM system_users u
    JOIN agent_profiles ap ON u.id = ap.user_id
    LEFT JOIN tickets ta ON ta.current_assignee_user_id = u.id 
      AND ta.status NOT IN ('closed', 'resolved')
    WHERE ap.is_online = TRUE
      AND (ap.max_concurrent_tickets IS NULL OR COUNT(ta.id) < ap.max_concurrent_tickets)
    GROUP BY u.id, u.full_name, ap.max_concurrent_tickets, ap.is_online
    ORDER BY current_tickets ASC
    LIMIT 1
  `);
  
  return agents.rows[0] || null;
}
```

---

## Phase 3: WebSocket Server

### 3.1 WebSocket Server Setup

```typescript
// server/websocket/ticket-server.ts
import { Server } from 'socket.io';
import { createAdapter } from '@socket.io/redis-adapter';
import { createClient } from 'redis';

const io = new Server(server, {
  cors: { origin: process.env.FRONTEND_URL }
});

const pubClient = createClient({ url: process.env.REDIS_URL });
const subClient = pubClient.duplicate();

Promise.all([pubClient.connect(), subClient.connect()]).then(() => {
  io.adapter(createAdapter(pubClient, subClient));
});

// Room structure: ticket:{ticketId}
io.on('connection', (socket) => {
  // Subscribe to ticket
  socket.on('ticket:subscribe', async (ticketId: number) => {
    socket.join(`ticket:${ticketId}`);
  });
  
  // Unsubscribe from ticket
  socket.on('ticket:unsubscribe', async (ticketId: number) => {
    socket.leave(`ticket:${ticketId}`);
  });
  
  // Join conversation
  socket.on('conversation:join', async (conversationId: number) => {
    socket.join(`conversation:${conversationId}`);
  });
  
  // Send message
  socket.on('message:send', async (data: { conversationId: number, message: string }) => {
    // Validate permission
    // Save message to database
    // Broadcast to conversation room
    io.to(`conversation:${data.conversationId}`).emit('message:new', messageData);
  });
  
  // Typing indicator
  socket.on('typing:start', async (data: { conversationId: number }) => {
    socket.to(`conversation:${data.conversationId}`).emit('typing:user_typing', {
      userId: socket.data.userId,
      conversationId: data.conversationId
    });
  });
});
```

### 3.2 Database Triggers for Realtime Updates

```sql
-- Trigger function for ticket updates
CREATE OR REPLACE FUNCTION notify_ticket_update() RETURNS TRIGGER AS $$
BEGIN
  PERFORM pg_notify('ticket_updated', json_build_object(
    'ticket_id', NEW.id,
    'changes', json_build_object(
      'status', CASE WHEN OLD.status != NEW.status THEN NEW.status ELSE NULL END,
      'assignee', CASE WHEN OLD.current_assignee_user_id != NEW.current_assignee_user_id THEN NEW.current_assignee_user_id ELSE NULL END,
      'priority', CASE WHEN OLD.priority != NEW.priority THEN NEW.priority ELSE NULL END
    )
  )::text);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER ticket_update_notify
  AFTER UPDATE ON tickets
  FOR EACH ROW
  EXECUTE FUNCTION notify_ticket_update();
```

---

## Phase 4: Frontend Implementation

### 4.1 Component Structure

```
src/
├── app/
│   └── dashboard/
│       └── tickets/
│           ├── page.tsx                    # Main dashboard
│           ├── [id]/
│           │   └── page.tsx               # Ticket detail
│           └── layout.tsx                 # Layout with filters
├── components/
│   └── tickets/
│       ├── TicketList.tsx
│       ├── TicketCard.tsx
│       ├── TicketDetail.tsx
│       ├── TicketFilters.tsx
│       ├── TicketChat.tsx
│       └── ...
└── hooks/
    └── tickets/
        ├── useTickets.ts
        ├── useTicketWebSocket.ts
        └── ...
```

### 4.2 Main Dashboard Page

```typescript
// app/dashboard/tickets/page.tsx
'use client';

import { TicketList } from '@/components/tickets/TicketList';
import { TicketFilters } from '@/components/tickets/TicketFilters';
import { useTickets } from '@/hooks/tickets/useTickets';
import { useTicketFilters } from '@/hooks/tickets/useTicketFilters';

export default function TicketsPage() {
  const { filters, updateFilter } = useTicketFilters();
  const { tickets, isLoading, refetch } = useTickets(filters);
  
  return (
    <div className="flex h-screen">
      {/* Main Content */}
      <div className="flex-1 flex flex-col">
        {/* Filter Bar */}
        <TicketFilters filters={filters} onFilterChange={updateFilter} />
        
        {/* Ticket List */}
        <div className="flex-1 overflow-auto">
          <TicketList tickets={tickets} isLoading={isLoading} />
        </div>
      </div>
    </div>
  );
}
```

### 4.3 WebSocket Hook

```typescript
// hooks/tickets/useTicketWebSocket.ts
import { useEffect, useRef } from 'react';
import { io, Socket } from 'socket.io-client';

export function useTicketWebSocket(ticketId: number) {
  const socketRef = useRef<Socket | null>(null);
  
  useEffect(() => {
    const socket = io(process.env.NEXT_PUBLIC_WS_URL!);
    socketRef.current = socket;
    
    socket.emit('ticket:subscribe', ticketId);
    
    socket.on('ticket:updated', (data) => {
      // Handle ticket update
      console.log('Ticket updated:', data);
    });
    
    socket.on('message:new', (data) => {
      // Handle new message
      console.log('New message:', data);
    });
    
    return () => {
      socket.emit('ticket:unsubscribe', ticketId);
      socket.disconnect();
    };
  }, [ticketId]);
  
  return socketRef.current;
}
```

### 4.4 Filter Component

```typescript
// components/tickets/TicketFilters.tsx
'use client';

import { useState } from 'react';
import { Filter, X } from 'lucide-react';

interface TicketFiltersProps {
  filters: FilterState;
  onFilterChange: (filters: FilterState) => void;
}

export function TicketFilters({ filters, onFilterChange }: TicketFiltersProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  
  return (
    <div className="border-b bg-white">
      {/* Quick Filters */}
      <div className="flex items-center gap-2 p-4">
        <button
          onClick={() => setIsExpanded(!isExpanded)}
          className="flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-gray-100"
        >
          <Filter className="w-4 h-4" />
          Filters
        </button>
        
        {/* Active Filters */}
        {Object.entries(filters).map(([key, value]) => (
          value && (
            <div key={key} className="flex items-center gap-1 px-2 py-1 bg-blue-100 rounded">
              <span className="text-sm">{key}: {value}</span>
              <button onClick={() => onFilterChange({ ...filters, [key]: null })}>
                <X className="w-3 h-3" />
              </button>
            </div>
          )
        ))}
      </div>
      
      {/* Expanded Filters */}
      {isExpanded && (
        <div className="p-4 border-t grid grid-cols-4 gap-4">
          {/* Service Type */}
          <div>
            <label className="block text-sm font-medium mb-1">Service</label>
            <select
              value={filters.serviceType || ''}
              onChange={(e) => onFilterChange({ ...filters, serviceType: e.target.value })}
              className="w-full px-3 py-2 border rounded"
            >
              <option value="">All</option>
              <option value="food">Food</option>
              <option value="parcel">Parcel</option>
              <option value="person_ride">Person Ride</option>
            </select>
          </div>
          
          {/* Status */}
          <div>
            <label className="block text-sm font-medium mb-1">Status</label>
            <select
              value={filters.status || ''}
              onChange={(e) => onFilterChange({ ...filters, status: e.target.value })}
              className="w-full px-3 py-2 border rounded"
            >
              <option value="">All</option>
              <option value="open">Open</option>
              <option value="assigned">Assigned</option>
              <option value="in_progress">In Progress</option>
              <option value="resolved">Resolved</option>
              <option value="closed">Closed</option>
            </select>
          </div>
          
          {/* Priority */}
          <div>
            <label className="block text-sm font-medium mb-1">Priority</label>
            <select
              value={filters.priority || ''}
              onChange={(e) => onFilterChange({ ...filters, priority: e.target.value })}
              className="w-full px-3 py-2 border rounded"
            >
              <option value="">All</option>
              <option value="low">Low</option>
              <option value="medium">Medium</option>
              <option value="high">High</option>
              <option value="urgent">Urgent</option>
              <option value="critical">Critical</option>
            </select>
          </div>
          
          {/* Date Range */}
          <div>
            <label className="block text-sm font-medium mb-1">Date Range</label>
            <input
              type="date"
              value={filters.dateFrom || ''}
              onChange={(e) => onFilterChange({ ...filters, dateFrom: e.target.value })}
              className="w-full px-3 py-2 border rounded"
            />
          </div>
        </div>
      )}
    </div>
  );
}
```

---

## Phase 5: Testing

### 5.1 Load Testing

```bash
# Install k6
brew install k6

# Run load test
k6 run load-test.js
```

**load-test.js:**
```javascript
import http from 'k6/http';
import { check } from 'k6';

export const options = {
  stages: [
    { duration: '1m', target: 100 },  // Ramp up
    { duration: '5m', target: 100 },   // Stay at 100 users
    { duration: '1m', target: 0 },    // Ramp down
  ],
};

export default function () {
  const res = http.get('http://localhost:3000/api/tickets');
  check(res, {
    'status is 200': (r) => r.status === 200,
    'response time < 500ms': (r) => r.timings.duration < 500,
  });
}
```

### 5.2 Performance Monitoring

**Key Metrics to Monitor:**
- API response times (p50, p95, p99)
- Database query times
- WebSocket connection count
- Assignment queue processing time
- Cache hit rate

---

## Phase 6: Deployment

### 6.1 Environment Variables

```bash
# Database
DATABASE_URL=postgresql://user:pass@host:5432/db

# Redis
REDIS_URL=redis://host:6379

# WebSocket
WS_URL=ws://localhost:3001

# Cloudflare R2
R2_ACCOUNT_ID=your_account_id
R2_ACCESS_KEY_ID=your_access_key
R2_SECRET_ACCESS_KEY=your_secret_key
R2_BUCKET_NAME=ticket-attachments
```

### 6.2 Deployment Checklist

- [ ] Run database migrations
- [ ] Seed initial data
- [ ] Deploy backend API
- [ ] Deploy WebSocket server
- [ ] Deploy frontend
- [ ] Set up monitoring
- [ ] Configure load balancer
- [ ] Set up read replicas
- [ ] Enable caching
- [ ] Test end-to-end

---

## Troubleshooting

### Common Issues

**1. Slow Ticket List Queries**
- Check indexes are created
- Use EXPLAIN ANALYZE to find slow queries
- Consider adding read replicas

**2. WebSocket Connection Issues**
- Check Redis connection
- Verify CORS settings
- Check firewall rules

**3. Assignment Not Working**
- Check assignment queue worker is running
- Verify routing rules are active
- Check agent availability

**4. Permission Denied Errors**
- Verify user roles are assigned
- Check permission codes match
- Verify role_permissions mapping

---

## Next Steps

1. **Review Architecture Document** - Understand full system design
2. **Run Migrations** - Set up database schema
3. **Implement Backend APIs** - Build REST endpoints
4. **Set up WebSocket** - Implement realtime features
5. **Build Frontend** - Create UI components
6. **Test Thoroughly** - Load test and security test
7. **Deploy Gradually** - Use feature flags for rollout
8. **Monitor & Optimize** - Track metrics and improve

---

**End of Implementation Guide**
