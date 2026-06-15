/**
 * Supabase @supabase/realtime-js imports Node's `ws` package.
 * React Native provides global WebSocket — use it instead.
 */
module.exports = global.WebSocket;
