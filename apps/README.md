# Apps

- `gatimitra-riderApp`: Rider app (Expo React Native) — built first
- `customer_app`: Customer app (later)
- `merchant_app`: Merchant app (later)

All apps must:
- Use shared models from `packages/contracts`
- Use API client from `packages/sdk`
- Call **only** the shared backend (`backend/`) via REST
- Never contain secrets or provider integrations (MSG91/Karza/Razorpay)


