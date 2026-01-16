# GatiMitra Unified Control Dashboard

Enterprise-grade unified control dashboard for managing the entire GatiMitra platform.

## Features

- **Unified Dashboard**: Single Next.js application controlling all platform operations
- **Hybrid Authentication**: Supabase Auth for identity, custom backend for authorization
- **Role-Based Access Control (RBAC)**: Granular permissions and access control
- **Multiple Domain Dashboards**: Customer, Rider, Merchant, Admin, Area Manager, Super Admin
- **Real-time Updates**: Built with Supabase Realtime support
- **Enterprise Security**: JWT validation, RLS, server-side authorization

## Tech Stack

- **Framework**: Next.js 14+ (App Router)
- **Language**: TypeScript
- **Styling**: Tailwind CSS
- **State Management**: Redux Toolkit Query (RTK Query)
- **Database**: PostgreSQL with Drizzle ORM
- **Authentication**: Supabase Auth
- **Icons**: Lucide React

## Getting Started

### Prerequisites

- Node.js 18+
- npm or yarn
- Supabase project
- PostgreSQL database

### Installation

1. Install dependencies:
```bash
npm install
```

2. Create `.env.local` file in the dashboard directory:
```env
# Supabase Configuration
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
SUPABASE_JWT_SECRET=your_jwt_secret

# Database Configuration
DATABASE_URL=your_database_url

# App Configuration
NEXTAUTH_URL=http://localhost:3000
NEXTAUTH_SECRET=your_nextauth_secret
```

3. Run the development server:
```bash
npm run dev
```

4. Open [http://localhost:3000](http://localhost:3000) in your browser.

## Project Structure

```
dashboard/
├── src/
│   ├── app/                    # Next.js App Router
│   │   ├── (auth)/            # Authentication routes
│   │   ├── (dashboard)/       # Protected dashboard routes
│   │   └── api/               # API routes
│   ├── components/            # React components
│   │   ├── layout/           # Layout components
│   │   ├── ui/               # UI components
│   │   └── dashboard/        # Dashboard-specific components
│   ├── lib/                   # Utilities and helpers
│   │   ├── auth/             # Authentication utilities
│   │   ├── permissions/      # RBAC engine
│   │   ├── db/               # Database client and schema
│   │   └── supabase/         # Supabase client
│   ├── store/                # Redux store
│   │   ├── api/              # RTK Query API slices
│   │   └── slices/           # Redux slices
│   └── types/                # TypeScript types
└── public/                   # Static assets
```

## Dashboard Modules

1. **Super Admin Console**: User management, roles, permissions
2. **Customer Dashboard**: Customer data, orders, payments, analytics
3. **Rider Dashboard**: Rider management, documents, orders, performance
4. **Merchant Dashboard**: Merchant/stores, menus, orders, settlements
5. **Order Management**: Global order search and management
6. **Area Manager Dashboard**: Area manager operations
7. **Ticket Resolution**: Support ticket management
8. **Agent Activity Tracking**: Audit logs and performance
9. **Payment Management**: Withdrawals and payments
10. **Offer Management**: Offers and banners
11. **System Configuration**: System settings and configuration
12. **Analytics**: Platform KPIs and reporting

## Authentication Flow

1. User logs in via Supabase Auth (Email/Password or OTP)
2. Supabase issues JWT token
3. Next.js middleware verifies JWT
4. Custom authorization engine checks permissions
5. User granted/denied access based on roles and permissions

## Environment Variables

Create `.env.local` in the `dashboard` directory with all required variables (see Installation section).

## Development

```bash
# Run development server
npm run dev

# Build for production
npm run build

# Start production server
npm start

# Lint code
npm run lint
```

## Security

- All API routes verify JWT tokens
- Server-side permission checks (never trust frontend)
- Row Level Security (RLS) enabled in database
- Audit logging for sensitive actions
- Rate limiting on API routes

## License

Private - GatiMitra Platform
