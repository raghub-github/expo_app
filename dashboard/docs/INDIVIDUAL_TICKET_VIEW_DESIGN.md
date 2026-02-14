# Individual Ticket View — Production Design

Staff-level design for a Freshdesk/Zendesk-style individual ticket page: enterprise UI, scalable schema, real-time, full audit trail.

---

## 1. Architecture Diagram (Text)

```
┌─────────────────────────────────────────────────────────────────────────────────────────┐
│                                    CLIENT (Next.js Dashboard)                              │
├──────────────┬──────────────────────────────────────────────────────┬────────────────────┤
│              │                                                       │                    │
│  Hierarchical│   CENTRAL CONTENT (Individual Ticket View)            │  Properties Panel  │
│  Sidebar     │   ┌─────────────────────────────────────────────┐   │  (Single Right     │
│  (Filter /   │   │ Sticky: Breadcrumb | Ticket ID               │   │   Sidebar)         │
│   Nav)       │   │ Sticky: Reply | Add Note | Forward | Merge   │   │  ┌──────────────┐  │
│              │   │         | Close | Assign | Status | ...      │   │  │ Assignment   │  │
│  - Dashboard │   ├─────────────────────────────────────────────┤   │  │ Agent, Group  │  │
│  - Tickets   │   │ Ticket Header                                │   │  │ Status, Prio │  │
│  - ...       │   │ #784512 • OPEN • HIGH • Created 2h via App    │   │  │ Type, Tags    │  │
│              │   ├─────────────────────────────────────────────┤   │  │ Custom fields │  │
│              │   │ [Show activities] [<] [>] Next/Prev           │   │  │ Contact       │  │
│              │   ├─────────────────────────────────────────────┤   │  │ Update btn    │  │
│              │   │ Conversation (messages)                      │   │  └──────────────┘  │
│              │   │   - Public (white) / Private (light yellow)   │   │                    │
│              │   │   - Avatar, name, type, time, attachments    │   │                    │
│              │   │ Optional: Activity Timeline (when toggled)    │   │                    │
│              │   │   - ticket_created, assigned, status_changed  │   │                    │
│              │   │   - reply_sent, private_note, merged, etc.    │   │                    │
│              │   └─────────────────────────────────────────────┘   │                    │
└──────────────┴──────────────────────────────────────────────────────┴────────────────────┘

┌─────────────────────────────────────────────────────────────────────────────────────────┐
│  API LAYER (Next.js Route Handlers)                                                       │
│  GET/PATCH /api/tickets/[id]  |  GET/POST /api/tickets/[id]/messages                       │
│  GET /api/tickets/[id]/activities (cursor)  |  GET/POST /api/tickets/[id]/properties       │
│  GET /api/tickets/next-prev?id=&filters= (for < > navigation)                             │
└─────────────────────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────────────────────┐
│  REAL-TIME (Optional: SSE or WebSocket)                                                   │
│  Channel: ticket:{id}  →  events: message_added | property_updated | assignment_changed   │
└─────────────────────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────────────────────┐
│  DATABASE (PostgreSQL)                                                                    │
│  tickets | ticket_messages | ticket_actions_audit (activities) | ticket_participants       │
│  ticket_assignments | ticket_status_history | ticket_custom_fields | ticket_field_values   │
│  ticket_tags | ticket_tag_map | ticket_attachments (metadata)                              │
└─────────────────────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────────────────────┐
│  STORAGE (Cloudflare R2)  |  SEARCH (Elasticsearch / Meilisearch)                          │
└─────────────────────────────────────────────────────────────────────────────────────────┘
```

---

## 2. DB SQL (Extend Existing Schema)

Existing: `tickets`, `ticket_messages`, `ticket_actions_audit`, `ticket_participants`, `ticket_assignments`, `ticket_status_history`, `ticket_tags`, `ticket_tag_map`, `ticket_ratings`, `ticket_groups`, `ticket_titles`.

Add/ensure:

- **tickets**: `group_id` (FK ticket_groups), `requester_id` (polymorphic), `requester_type`, `source` (email/app/api), `is_merged`, `merged_into_ticket_id`, `spam_at`, `reopened_at`, `scenario_tag` (or use title).
- **ticket_activities**: Use existing `ticket_actions_audit`; ensure `action_type` covers all events (see Activity section).
- **ticket_custom_fields**: id, field_key, field_name, field_type, is_required, options (JSONB), display_order, created_at, updated_at.
- **ticket_field_values**: id, ticket_id, field_id, value (JSONB), updated_at.
- **ticket_attachments**: id, ticket_id, message_id (nullable), file_key (R2), file_name, mime_type, size_bytes, uploaded_by_user_id, created_at.

Indexes: (ticket_id, created_at) on activities; (ticket_id, field_id) unique on field_values; cursor-friendly indexes on tickets for next/prev.

---

## 3. API Structure

| Method | Path | Purpose |
|--------|------|--------|
| GET | `/api/tickets/[id]` | Ticket detail + assignee, title, messages, participants, tags, custom field values |
| PATCH | `/api/tickets/[id]` | Update status, priority, assignee, group_id, sla_due_at, etc.; log activity |
| GET | `/api/tickets/[id]/messages` | List messages (cursor: before_id / after_id, limit); filter by type if needed |
| POST | `/api/tickets/[id]/messages` | Create reply or private note; optional status update (atomic); attachments via R2 keys |
| GET | `/api/tickets/[id]/activities` | Activity timeline (cursor by created_at, limit); filter by action_type |
| GET | `/api/tickets/next-prev` | Query: id, direction=next|prev, same filters as list → return adjacent ticket id |
| GET | `/api/tickets/reference-data` | Statuses, priorities, groups, tags (existing) |
| GET | `/api/tickets/custom-fields` | List custom field definitions |
| PATCH | `/api/tickets/[id]/properties` | Bulk update properties + custom field values; log activities |

Reply send options (body or query): `sendOption`: `no_change` | `pending` | `resolved` | `closed` | `waiting_for_user` | `provisionally_resolved`.

---

## 4. Component Tree

```
TicketViewPage (/dashboard/tickets/[id])
├── TicketViewLayout
│   ├── TicketBreadcrumb (Open tickets > #784512)
│   ├── TicketActionBar (sticky)
│   │   ├── ReplyButton (dropdown: Send & set status options)
│   │   ├── AddNoteButton
│   │   ├── ForwardButton, MergeButton, CloseButton
│   │   ├── MoreDropdown (Assign, Change Status, Priority, Spam)
│   │   ├── ShowActivitiesToggle
│   │   └── TicketNavArrows (Prev / Next)
│   ├── TicketHeader
│   │   ├── TicketTitle, TicketId, StatusBadge, PriorityBadge
│   │   ├── Source, CreatedTime, SLATimer, ScenarioTag
│   ├── ConversationPanel
│   │   ├── MessageList (virtualized)
│   │   │   └── MessageItem (avatar, name, actor type, time, edited, attachments; public=white, private=light yellow)
│   │   └── ReplyEditor (rich: markdown, bold, list, code, link, emoji, attach; Send dropdown)
│   └── ActivityTimeline (when Show activities on)
│       └── ActivityItem (actor_type, action_type, old_value, new_value, timestamp, metadata)
│
└── TicketPropertiesPanel (right sidebar — single panel)
    ├── Assignment (Agent, Group)
    ├── TicketData (Status, Priority, Type, Tags multi-select)
    ├── CustomFields (dynamic from ticket_custom_fields + ticket_field_values)
    ├── ContactDetails (from participants / requester)
    └── UpdateButton
```

---

## 5. Real-Time Design

- **Option A — SSE**: `GET /api/tickets/[id]/stream`. Server sends events: `message_added`, `property_updated`, `assignment_changed`, `activity_added`. Client subscribes when ticket view is open; reconnects with Last-Event-ID.
- **Option B — WebSocket**: Single channel per ticket or per user (e.g. `ticket:{id}`). Same event types. Prefer one connection per open ticket tab.
- **Payload**: `{ type, payload: { ticketId, messageId?, actorId?, ... } }`. Client invalidates React Query keys or merges payload into cache.
- **Permission**: Only agents with ticket access receive events. Private notes not sent to non-agent subscribers.

---

## 6. Activity Tracking Logic

**Store every change in `ticket_actions_audit` (or unified `ticket_activities`):**

| action_type | When | old_value / new_value / metadata |
|-------------|------|----------------------------------|
| ticket_created | On create | new_value: { status, priority, source, requester_id } |
| assigned_to_agent | Assignment | old: prev_agent_id, new: agent_id, metadata: assigned_by |
| reassigned | Same | old/new agent_id |
| status_changed | Status update | old_status, new_status, reason? |
| priority_changed | Priority update | old_priority, new_priority |
| tag_added / tag_removed | Tag change | tag_id, tag_code |
| reply_sent | Public reply | message_id, send_option (status if set) |
| private_note_added | Internal note | message_id |
| forwarded | Forward | to_agent_id / to_group_id, metadata |
| merged | Merge | merged_into_ticket_id |
| reopened | Reopen | previous status |
| closed | Close | closed_by, resolution? |
| automation_triggered | Bot/rule | automation_id, action_taken |
| sla_breached | SLA job | sla_due_at, breached_at |
| spam_marked | Spam | — |
| custom_field_updated | Field change | field_id, old_value, new_value |

**Schema (existing ticket_actions_audit):** id, ticket_id, action_type, actor_type (agent/system/user), actor_user_id, actor_id, old_value (JSONB), new_value (JSONB), metadata (JSONB), created_at. Index: (ticket_id, created_at DESC) for timeline cursor.

---

## 7. Permission Model (RBAC)

- **Roles**: Admin, Supervisor, Agent, Viewer, Bot, System.
- **Ticket access**: By group/team (assignment), or super-admin sees all. Viewer: read-only; Agent: reply, add note, assign self, change status/priority; Supervisor: assign others, merge, close; Admin: full + spam, delete.
- **Private notes**: Only Agent+ can create and see. Viewer cannot see private notes.
- **API**: Every mutation checks role + ticket group/assignment. Enforce in middleware or per-route.

---

## 8. Message Flow

1. **Reply (public)**  
   Client POST `/api/tickets/[id]/messages` with `messageType: "reply"`, optional `sendOption`. Server: insert `ticket_messages`, optionally update `tickets.status` and insert `ticket_status_history` + `ticket_actions_audit` in one transaction. Emit real-time event. Return message.

2. **Add note (private)**  
   Same endpoint, `messageType: "internal_note"`. Only agents. Log activity `private_note_added`.

3. **Forward**  
   New endpoint or action: create message type `forward`, update assignment or create new ticket; log `forwarded`.

4. **Merge**  
   PATCH or POST merge: set `is_merged`, `merged_into_ticket_id` on source ticket; optionally copy messages; log `merged` on both.

5. **Close**  
   PATCH ticket status to `closed`, set `closed_at`; log `closed`.

Attachments: upload to R2 first (existing upload API); pass returned keys in `attachments` array on message create.

---

## 9. UI Wireframe (Text)

```
+------------------------------------------------------------------+-----------------+
| Open tickets  >  #784512                                    [▼]  | PROPERTIES      |
| [Reply ▼] [Add note] [Forward] [Merge] [Close] [···] [Show activities] [<] [>]  | Agent: [Select]  |
+------------------------------------------------------------------+ Group: [Select]  |
| ORDER DELAYED                                                     | Status: [Open]  |
| #784512    OPEN • HIGH PRIORITY                                    | Priority: [Med]  |
| Created 2h ago via Customer App    SLA: Due in 4h                   | Tags: [multi]    |
+------------------------------------------------------------------+ ---               |
| [Avatar] Customer Name  •  Customer  •  2h ago                     | Order ID: 123    |
|          "My order is delayed..."                                  | Trans ID: 456    |
|------------------------------------------------------------------| Contact: name    |
| [Avatar] Agent Name  •  Agent  •  1h ago                            | email, phone     |
|          "We’re looking into it..." (public reply, white bg)       | [Update]         |
|------------------------------------------------------------------|                  |
| [Avatar] Agent  •  Private note  •  30m ago                        |                  |
|          "Escalating to ops." (light yellow bg)                    |                  |
+------------------------------------------------------------------+-----------------+
| [Rich editor: B I U | list | code | link | emoji | attach]         |                  |
| [Saved] [🗑] [Send ▼]  → Send without change | Pending | Resolved | Closed | ...     |
+------------------------------------------------------------------+-----------------+
```

When "Show activities" is ON, a timeline section appears (above or below conversation) with rows: "Agent A assigned ticket", "Status changed Open → In progress", "Reply sent", etc.

---

## 10. Production Best Practices

- **Cursor pagination**: Use `created_at` + `id` for messages and activities; no OFFSET for large tables.
- **Indexes**: (ticket_id, created_at), (ticket_id, message_type), (assigned_to, status), (status, created_at). Composite for list filters.
- **JSONB**: Use for old_value, new_value, metadata, attachments; GIN if querying inside.
- **Avoid N+1**: Load ticket + messages (limit 50) + participants + tags + field_values in one or two queries; activities in separate cursor request.
- **Idempotency**: For reply send, accept idempotency key header to avoid duplicate messages on retry.
- **Rate limit**: Per-user and per-ticket on reply/add-note.
- **Audit**: Never delete from ticket_actions_audit; append-only. Soft-delete for tickets (e.g. spam_at).
- **Storage**: R2 keys in ticket_messages.attachments or ticket_attachments; signed URLs for download.
- **Search**: Index ticket_number, subject, description, message content in Elasticsearch/Meilisearch; list API uses DB; search API uses search engine.
- **Keyboard**: Shortcuts (e.g. R = Reply, N = Note, Esc = Close panel) and command palette (K) for power users.

---

*End of design document.*
