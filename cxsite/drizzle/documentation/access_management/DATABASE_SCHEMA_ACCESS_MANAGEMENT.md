# Access Management Domain - Complete Documentation

## 🔐 **ACCESS MANAGEMENT DOMAIN OVERVIEW**

The Access Management Domain provides comprehensive Role-Based Access Control (RBAC) with granular permissions, audit trails, and security features.

**Total Tables**: 36 tables

---

## 📋 **CORE TABLES** (16 tables)

### **1. User Management** (6 tables)

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

### **2. Roles & Permissions** (5 tables)

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

### **3. Access Control** (5 tables)

12. **`access_modules`** - Access modules
    - Module definitions
    - References: `access_modules.id` (self-referencing for parent)

13. **`access_pages`** - Access pages
    - Page definitions within modules
    - References: `access_modules.id`

14. **`access_ui_components`** - UI components
    - Component-level access control
    - References: `access_pages.id`

15. **`access_api_endpoints`** - API endpoints
    - Endpoint-level access control
    - No foreign keys (reference table)

16. **`access_feature_flags`** - Feature flags
    - Feature flag definitions
    - No foreign keys

---

## 📍 **AREA & SCOPE ASSIGNMENTS** (3 tables)

17. **`area_assignments`** - Geographic access
    - Area assignments, cities, postal codes, geo boundaries
    - References: `system_users.id`

18. **`service_scope_assignments`** - Service access
    - Service type access levels
    - References: `system_users.id`

19. **`entity_scope_assignments`** - Entity-specific access
    - Specific entity (merchant/rider/customer/order) access
    - References: `system_users.id`

---

## 🎯 **DOMAIN-SPECIFIC ACCESS CONTROLS** (10 tables)

20. **`order_access_controls`** - Order access
    - View/action/financial permissions for orders
    - References: `system_users.id` (1:1)

21. **`ticket_access_controls`** - Ticket access
    - Ticket type/action/priority permissions
    - References: `system_users.id` (1:1)

22. **`rider_management_access`** - Rider management access
    - View/onboarding/document permissions
    - References: `system_users.id` (1:1)

23. **`merchant_management_access`** - Merchant management access
    - View/onboarding/document permissions
    - References: `system_users.id` (1:1)

24. **`customer_management_access`** - Customer management access
    - View/action permissions
    - References: `system_users.id` (1:1)

25. **`payment_access_controls`** - Payment access
    - Payment view/action permissions
    - References: `system_users.id` (1:1)

26. **`payout_access_controls`** - Payout access
    - Payout view/action permissions
    - References: `system_users.id` (1:1)

27. **`refund_access_controls`** - Refund access
    - Refund view/action/approval permissions
    - References: `system_users.id` (1:1)

28. **`offer_management_access`** - Offer management access
    - Offer view/action permissions
    - References: `system_users.id` (1:1)

29. **`advertisement_management_access`** - Advertisement access
    - Ad view/action permissions
    - References: `system_users.id` (1:1)

---

## 📋 **AUDIT & SECURITY** (9 tables)

30. **`system_audit_logs`** - System audit logs
    - Comprehensive audit trail
    - References: `system_users.id` (optional)

31. **`access_activity_logs`** - Access activity logs
    - Access-related activities
    - References: `system_users.id`

32. **`permission_change_logs`** - Permission change logs
    - Permission change history
    - References: `system_users.id`, `system_roles.id`, `system_permissions.id`

33. **`security_events`** - Security events
    - Security incidents, breaches, suspicious activities
    - References: `system_users.id` (optional)

34. **`compliance_audit_trail`** - Compliance audit
    - Compliance-related audit trail
    - References: `system_users.id` (optional)

35. **`access_delegation`** - Access delegation
    - Temporary access delegation
    - References: `system_users.id` (delegator, delegatee)

36. **`access_approval_workflows`** - Approval workflows
    - Workflow definitions
    - References: `system_users.id` (optional)

37. **`access_approval_requests`** - Approval requests
    - Access approval requests
    - References: `system_users.id`, `access_approval_workflows.id`

38. **`access_restrictions`** - Access restrictions
    - Time-based, IP-based restrictions
    - References: `system_users.id`

39. **`access_emergency_mode`** - Emergency mode
    - Emergency access mode settings
    - References: `system_users.id` (optional)

---

## 🔗 **RELATIONSHIPS**

```
system_users (1)
    ↓
    ├─→ system_user_auth (1:1)
    ├─→ system_user_sessions (many)
    ├─→ system_user_login_history (many)
    ├─→ system_user_api_keys (many)
    ├─→ system_user_ip_whitelist (many)
    ├─→ user_roles (many)
    │       └─→ system_roles (many)
    │               └─→ role_permissions (many)
    │                       └─→ system_permissions (many)
    ├─→ user_permission_overrides (many)
    ├─→ area_assignments (many)
    ├─→ service_scope_assignments (many)
    ├─→ entity_scope_assignments (many)
    ├─→ order_access_controls (1:1)
    ├─→ ticket_access_controls (1:1)
    ├─→ rider_management_access (1:1)
    ├─→ merchant_management_access (1:1)
    ├─→ customer_management_access (1:1)
    ├─→ payment_access_controls (1:1)
    ├─→ payout_access_controls (1:1)
    ├─→ refund_access_controls (1:1)
    ├─→ offer_management_access (1:1)
    ├─→ advertisement_management_access (1:1)
    └─→ system_audit_logs (many)
```

---

## 📊 **SUMMARY**

| Category | Tables | Purpose |
|----------|--------|---------|
| User Management | 6 | User accounts, authentication, sessions |
| Roles & Permissions | 5 | RBAC system |
| Access Control | 5 | Module/page/component/endpoint access |
| Area & Scope | 3 | Geographic and service scope |
| Domain-Specific | 10 | Domain-level access controls |
| Audit & Security | 9 | Audit trails, security, compliance |

**Total**: 36 tables

---

## 📝 **NOTES**

1. **Comprehensive RBAC**: Granular permissions with role hierarchy
2. **Domain-Specific Controls**: Separate access controls for each domain
3. **Audit Trail**: Complete audit logging for compliance
4. **Security Features**: IP whitelisting, emergency mode, access restrictions

**For detailed attribute documentation**, refer to SQL migration files:
- `0016_access_management_complete.sql`
- `0017_access_controls_and_audit.sql`
- `0018_access_triggers_and_defaults.sql`
