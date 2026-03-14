# Menu & Addon Audit Tracking

This document describes what actions are tracked for audit (agent/merchant accountability) across dashboard, partner site, merchant app, and merchant portal.

## Dashboard (agent/partner site)

Actions are sent to **`POST /api/audit/track`** and stored (e.g. in `system_audit_logs` or activity tables) with `dashboardType: "MERCHANT"`, `requestPath`, and the logged-in user.

### Tracked in Store Menu (StoreMenuClient)

| Action | resourceType | When |
|--------|--------------|------|
| Category create/update/delete | `merchant_menu_categories` | Agent creates/edits/deletes a category |
| Item create (with images) | `merchant_menu_items`, `merchant_menu_item_images` | Agent adds new item |
| Item update (with images) | `merchant_menu_items`, `merchant_menu_item_images` | Agent saves item edit |
| Item delete | `merchant_menu_items` | Agent deletes item |
| Item stock toggle | `merchant_menu_items` | Agent toggles in-stock |
| Change request create (create/update/delete) | `merchant_menu_item_change_requests` | Agent submits change request |
| **Item approval (approve)** | `merchant_menu_items` | Agent approves pending item |
| **Item rejection (reject)** | `merchant_menu_items` | Agent rejects pending item |

Variants, customizations, and combos are updated as part of item save or their own API calls; the main audit event is often the **item update** or **category** event. For finer-grained tracking of variants/customizations/combos, additional `trackAudit` calls can be added for those resource types.

### Tracked in Addon Library (AddonLibraryClient)

| Action | resourceType | When |
|--------|--------------|------|
| Addon group create | `merchant_modifier_groups` | Agent creates group (and options in one step) |
| Addon group update | `merchant_modifier_groups` | Agent edits group title/description/limits |
| Addon group delete | `merchant_modifier_groups` | Agent deletes group |
| Addon option add | `merchant_modifier_options` | Agent adds option to a group (e.g. from Options modal) |

## Merchant app (Expo)

The merchant app calls the **backend (Node) API** for menu and addon operations. The backend does not currently write to the same audit pipeline as the dashboard (no `POST /api/audit/track`). To track merchant actions from the app you would need either:

- Backend to log to an audit table or service when menu/addon/change-request APIs are called (with user/store context), or  
- Merchant app to call a dedicated audit endpoint (e.g. dashboard’s `/api/audit/track` with a server-side token or a backend audit API) for each action.

## Merchant portal (mxportal-main)

The merchant portal currently uses its own Supabase/Drizzle and **does not** implement the same menu/addon flows as the dashboard (no change requests, no modifier groups). When parity is implemented (see `dashboards/mxportal-main/docs/MENU_PARITY_IMPLEMENTATION.md`), audit tracking should be added for:

- Change request create (request add/edit/delete item)  
- Addon group create/update/delete  
- Addon option add/update/delete  
- Any direct variant/customization/combo edits  

Either by calling the same audit API as the dashboard or by having the backend log these actions when the portal uses backend APIs.

## Summary

- **Dashboard**: Item and category create/update/delete, stock toggle, change requests, **item approve/reject**, and **addon group + option** actions are tracked via `/api/audit/track`.  
- **Merchant app / Merchant portal**: Not yet sending to the same audit pipeline; backend or a shared audit API should be used when you need full coverage for agent and merchant actions.

To get **full coverage** (every action by agent or merchant in apps, partner site, dashboard, merchant portal), add backend-side audit logging for all menu/addon/change-request APIs and, if needed, have apps/portal call a single audit endpoint with user and context.
