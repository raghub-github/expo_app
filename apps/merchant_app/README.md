# GatiMitra Merchant App

Professional merchant app for GatiMitra (Swiggy/Zomato/Magicpin/Eatsure-style). Built in the `apps` folder with GatiMitra brand colors and a high-level SaaS UI.

## Features

- **Bottom navigation**: Home | Orders | Menu | Earnings | Profile
- **Dashboard (Home)**: Store status, today’s stats (orders, earnings, menu items, rating), quick actions, recent orders
- **Orders**: Filter chips (All, Pending, Preparing, Ready, Completed), order cards with status
- **Menu / Items**: Add item CTA, category filters, item list with availability
- **Earnings & Payments**: Balance hero card, today/month mini cards, recent payouts
- **Profile**: Store info, account (business details, address, hours, bank), preferences, support, logout

## Tech

- Expo SDK 54, Expo Router (file-based)
- React Native, TypeScript
- GatiMitra theme: primary mint `#16A34A`, deep mint gradient, white/surface cards
- Icons: `@expo/vector-icons` (Ionicons)

## Run

From repo root:

```bash
npm install
cd apps/merchant_app && npx expo start
```

Or from root:

```bash
npm --workspace apps/merchant_app run start
```

## Reuse

- `@gatimitra/contracts` (shared DTOs)
- Same backend API as customer/dashboard
