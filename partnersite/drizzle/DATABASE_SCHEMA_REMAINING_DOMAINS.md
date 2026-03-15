# Remaining Domains - Access Management, Providers, Payments, System

## 🔐 **ACCESS MANAGEMENT DOMAIN**

### **Core Tables** (16 tables)

1. **`system_users`** - System users (agents, admins)
   - User details, roles, departments, status, authentication
   - References: `system_users.id` (self-referencing for reports_to)

2. **`system_user_auth`** - Authentication data
   - Password hash, 2FA, OTP, security questions
   - References: `system_users.id` (1:1)

3. **`system_user_sessions`** - Active sessions
   - Session tokens, device info, IP, location
   - References: `system_users.id`

4. **`system_user_login_history`** - Login history
   - Login attempts, success/failure, device, location
   - References: `system_users.id`, `system_user_sessions.id`

5. **`system_user_api_keys`** - API keys
   - API keys, permissions, rate limits
   - References: `system_users.id`

6. **`system_user_ip_whitelist`** - IP whitelist
   - Allowed IP addresses/ranges
   - References: `system_users.id`

7. **`system_roles`** - Roles
   - Role definitions, hierarchy, permissions
   - References: `system_roles.id` (self-referencing for parent_role)

8. **`system_permissions`** - Permissions
   - Permission definitions
   - No foreign keys

9. **`role_permissions`** - Role-permission mapping
   - Maps roles to permissions
   - References: `system_roles.id`, `system_permissions.id`

10. **`user_roles`** - User-role mapping
    - Maps users to roles
    - References: `system_users.id`, `system_roles.id`

11. **`user_permission_overrides`** - Permission overrides
    - User-specific permission overrides
    - References: `system_users.id`, `system_permissions.id`

12. **`access_modules`**, **`access_pages`**, **`access_ui_components`**, **`access_api_endpoints`** - Access control
    - Module/page/component/endpoint definitions
    - No foreign keys (reference tables)

13. **`access_feature_flags`** - Feature flags
    - Feature flag definitions
    - No foreign keys

### **Area & Scope Assignments** (3 tables)

14. **`area_assignments`** - Geographic access
    - Area assignments, cities, postal codes, geo boundaries
    - References: `system_users.id`

15. **`service_scope_assignments`** - Service access
    - Service type access levels
    - References: `system_users.id`

16. **`entity_scope_assignments`** - Entity-specific access
    - Specific entity (merchant/rider/customer/order) access
    - References: `system_users.id`

### **Domain-Specific Access Controls** (10 tables)

17. **`order_access_controls`** - Order access
    - View/action/financial permissions for orders
    - References: `system_users.id` (1:1)

18. **`ticket_access_controls`** - Ticket access
    - Ticket type/action/priority permissions
    - References: `system_users.id` (1:1)

19. **`rider_management_access`** - Rider management access
    - View/onboarding/document permissions
    - References: `system_users.id` (1:1)

20. **`merchant_management_access`** - Merchant management access
    - View/onboarding/document permissions
    - References: `system_users.id` (1:1)

21. **`customer_management_access`** - Customer management access
    - View/action permissions
    - References: `system_users.id` (1:1)

22. **`payment_access_controls`** - Payment access
    - Payment view/action permissions
    - References: `system_users.id` (1:1)

23. **`payout_access_controls`** - Payout access
    - Payout view/action permissions
    - References: `system_users.id` (1:1)

24. **`refund_access_controls`** - Refund access
    - Refund view/action/approval permissions
    - References: `system_users.id` (1:1)

25. **`offer_management_access`** - Offer management access
    - Offer view/action permissions
    - References: `system_users.id` (1:1)

26. **`advertisement_management_access`** - Advertisement access
    - Ad view/action permissions
    - References: `system_users.id` (1:1)

### **Audit & Security** (9 tables)

27. **`system_audit_logs`** - System audit logs
    - Comprehensive audit trail
    - References: `system_users.id` (optional)

28. **`access_activity_logs`** - Access activity logs
    - Access-related activities
    - References: `system_users.id`

29. **`permission_change_logs`** - Permission change logs
    - Permission change history
    - References: `system_users.id`, `system_roles.id`, `system_permissions.id`

30. **`security_events`** - Security events
    - Security incidents, breaches, suspicious activities
    - References: `system_users.id` (optional)

31. **`compliance_audit_trail`** - Compliance audit
    - Compliance-related audit trail
    - References: `system_users.id` (optional)

32. **`access_delegation`** - Access delegation
    - Temporary access delegation
    - References: `system_users.id` (delegator, delegatee)

33. **`access_approval_workflows`** - Approval workflows
    - Workflow definitions
    - References: `system_users.id` (optional)

34. **`access_approval_requests`** - Approval requests
    - Access approval requests
    - References: `system_users.id`, `access_approval_workflows.id`

35. **`access_restrictions`** - Access restrictions
    - Time-based, IP-based restrictions
    - References: `system_users.id`

36. **`access_emergency_mode`** - Emergency mode
    - Emergency access mode settings
    - References: `system_users.id` (optional)

**Total Access Management**: 36 tables

---

## 🔌 **PROVIDERS DOMAIN**

### **Core Tables** (9 tables)

1. **`provider_configs`** - Provider configuration
   - API keys, secrets, tokens, rate limits
   - No foreign keys (configuration table)

2. **`webhook_events`** - Webhook events
   - Incoming webhooks from providers
   - References: `orders.id` (optional)

3. **`provider_order_mapping`** - Order mapping
   - Maps internal orders to provider orders
   - References: `orders.id`
   - Unique: `(provider_type, provider_order_id)`

4. **`provider_rider_mapping`** - Rider mapping
   - Maps internal riders to provider riders
   - References: `riders.id`

5. **`provider_order_status_sync`** - Status sync
   - Status synchronization tracking
   - References: `orders.id`

6. **`provider_order_payment_mapping`** - Payment mapping
   - Payment synchronization
   - References: `orders.id`, `order_payments.id`

7. **`provider_order_refund_mapping`** - Refund mapping
   - Refund synchronization
   - References: `orders.id`, `order_refunds.id`

8. **`provider_order_item_mapping`** - Item mapping
   - Item synchronization
   - References: `orders.id`, `order_items.id`

9. **`provider_order_conflicts`** - Order conflicts
   - Conflict detection and resolution
   - References: `orders.id`

10. **`provider_order_analytics`** - Provider analytics
    - Analytics data for providers
    - References: `orders.id` (optional)

### **Logging & Monitoring** (3 tables)

11. **`api_call_logs`** - API call logs
    - All API calls to providers
    - References: `orders.id` (optional)

12. **`order_sync_logs`** - Order sync logs
    - Order synchronization logs
    - References: `orders.id`

13. **`provider_rate_limits`** - Rate limits
    - Rate limit tracking
    - No foreign keys

14. **`webhook_configurations`** - Webhook configurations
    - Webhook endpoint configurations
    - No foreign keys

**Total Providers Domain**: 14 tables

---

## 💳 **PAYMENTS DOMAIN**

### **Payment Processing** (Already documented in Orders Domain)
- `order_payments` - Payment attempts (Orders Domain Part 4)
- `order_refunds` - Refunds (Orders Domain Part 4)

### **Additional Payment Tables** (5 tables)

1. **`payment_webhooks`** - Payment webhooks
   - Webhook events from payment gateways
   - No foreign keys (webhook processing)

2. **`rider_wallet_ledger`** - Rider wallet ledger (if exists)
   - Rider wallet transactions
   - References: `riders.id`

3. **`rider_withdrawal_requests`** - Withdrawal requests (if exists)
   - Rider withdrawal requests
   - References: `riders.id`

4. **`settlement_batches`** - Settlement batches
   - Batch settlement processing
   - No foreign keys (batch processing)

5. **`commission_history`** - Commission history
   - Commission calculation history
   - References: `orders.id`, `riders.id` (optional)

**Total Payments Domain**: 5 tables (additional to Orders Domain)

---

## ⚙️ **SYSTEM DOMAIN**

### **Configuration & Settings** (5 tables)

1. **`system_config`** - System configuration
   - Key-value configuration
   - No foreign keys

2. **`app_versions`** - App versions
   - Android/iOS version management
   - No foreign keys

3. **`notification_preferences`** - Notification preferences
   - User notification preferences
   - References: `riders.id` (or customers if exists)

4. **`notification_logs`** - Notification logs
   - All notifications sent
   - References: Various entities (order_id, customer_id, etc.)

5. **`api_rate_limits`** - API rate limits
   - Rate limit tracking
   - No foreign keys

### **Verification & Security** (2 tables)

6. **`otp_verification_logs`** - OTP verification logs
   - OTP send/verify tracking
   - No foreign keys

7. **`rider_vehicles`** - Rider vehicles
   - Vehicle registration and verification
   - References: `riders.id`

### **Business Logic** (3 tables)

8. **`order_cancellation_reasons`** - Cancellation reasons
   - Order cancellation tracking
   - References: `orders.id`

9. **`insurance_policies`** - Insurance policies
   - Insurance policy management
   - References: `riders.id` (optional)

10. **`offers`** - Platform offers (if exists)
    - Platform-wide offers
    - No foreign keys (or references customers/orders)

**Total System Domain**: 10 tables

---

## 📊 **COMPLETE SUMMARY**

| Domain | Tables | Status |
|--------|--------|--------|
| Rider Domain | 20 | ✅ Complete |
| Customer Domain | 44 | ✅ Complete |
| Orders Domain | 28 | ✅ Complete |
| Merchant Domain | 35 | ✅ Complete |
| Tickets Domain | 5 | ✅ Complete |
| Access Management | 36 | ✅ Documented |
| Providers Domain | 14 | ✅ Documented |
| Payments Domain | 5 | ✅ Documented |
| System Domain | 10 | ✅ Documented |

**Total**: 217 tables documented

---

## 📝 **NOTES**

1. **Access Management**: Comprehensive RBAC system with granular permissions
2. **Providers**: External provider integration (Swiggy, Zomato, Rapido, etc.)
3. **Payments**: Payment processing integrated with Orders Domain
4. **System**: Configuration, versions, notifications, verification

All tables include:
- Primary keys (`id BIGSERIAL`)
- Foreign key relationships
- Indexes for performance
- Timestamps (`created_at`, `updated_at`)
- Status flags where applicable

---

**For detailed attribute documentation**, refer to the SQL migration files in `backend/drizzle/`:
- `0016_access_management_complete.sql`
- `0017_access_controls_and_audit.sql`
- `0006_external_providers_integration.sql`
- `0009_external_provider_order_enhancements.sql`
- `0004_production_enhancements.sql`
