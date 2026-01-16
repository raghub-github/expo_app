# Development Workflow Guide

## After Installing Development Build on Your Device

### ✅ Keep Metro Bundler Running

**Answer: Keep `npx expo start --dev-client` running continuously while developing.**

You don't need to stop/start it every time you open the app. Here's how it works:

## Development Workflow

### 1. Start Metro Bundler (Once Per Session)

```bash
cd apps/gatimitra-riderApp
npx expo start --dev-client
```

**Keep this terminal running** - this is your development server that serves your JavaScript code.

### 2. Open App on Device

- **First time:** Scan the QR code shown in the terminal, or the app will automatically connect if on the same network
- **Subsequent times:** Just open the app - it will automatically connect to the running Metro bundler

### 3. Development Cycle

```
┌─────────────────────────────────────────┐
│ 1. Metro Bundler Running (Terminal)     │
│    npx expo start --dev-client          │
│    ↓                                    │
│ 2. Make Code Changes                    │
│    ↓                                    │
│ 3. Save File                            │
│    ↓                                    │
│ 4. App Auto-Reloads (Hot Reload)       │
│    OR Press 'r' in terminal to reload  │
└─────────────────────────────────────────┘
```

### 4. When to Restart Metro Bundler

**Restart Metro ONLY when:**
- ✅ You change `.env` file (environment variables)
- ✅ You install new npm packages
- ✅ You modify native code configuration
- ✅ Metro bundler crashes or stops responding

**DON'T restart Metro when:**
- ❌ Opening/closing the app
- ❌ Making JavaScript/TypeScript code changes (hot reload handles this)
- ❌ Switching between app screens

## Common Scenarios

### Scenario 1: Starting Development Session

```bash
# Terminal 1: Start Metro bundler
cd apps/gatimitra-riderApp
npx expo start --dev-client

# Terminal shows QR code and connection info
# Open app on device → Scan QR code → App connects
# Now you can develop!
```

### Scenario 2: Opening App Later (Same Day)

```bash
# Metro bundler is still running from earlier
# Just open the app on your device
# It will automatically reconnect to Metro
# No need to restart Metro or scan QR again
```

### Scenario 3: Changed Environment Variables

```bash
# 1. Stop Metro bundler (Ctrl+C in terminal)
# 2. Update .env file
# 3. Restart Metro bundler
npx expo start --dev-client
# 4. Reload app on device (shake device → Reload)
```

### Scenario 4: App Not Connecting

```bash
# If app can't connect to Metro:
# 1. Check both device and computer are on same WiFi
# 2. Or use tunnel mode:
npx expo start --dev-client --tunnel

# Tunnel works even on different networks
```

## Metro Bundler Commands

While Metro is running, you can use these commands:

- **`r`** - Reload app
- **`m`** - Toggle menu
- **`d`** - Open developer menu on device
- **`j`** - Open debugger
- **`Ctrl+C`** - Stop Metro bundler

## Network Options

### Same Network (Fastest)
```bash
npx expo start --dev-client
# Device and computer must be on same WiFi
```

### Tunnel (Works Anywhere)
```bash
npx expo start --dev-client --tunnel
# Works even if device and computer are on different networks
# Slightly slower but more reliable
```

### LAN (Local Network)
```bash
npx expo start --dev-client --lan
# Explicitly use local network
```

## Hot Reload vs Full Reload

### Hot Reload (Automatic)
- ✅ Triggers automatically when you save files
- ✅ Fast - only reloads changed components
- ✅ Preserves app state
- ✅ Works for most code changes

### Full Reload (Manual)
- Press `r` in Metro terminal
- OR Shake device → "Reload"
- ✅ Reloads entire app
- ✅ Use when hot reload doesn't work

## Best Practices

1. **Keep Metro Running:** Don't close the terminal while developing
2. **One Metro Instance:** Only run one Metro bundler at a time
3. **Check Connection:** If app shows "Unable to connect", check Metro terminal for errors
4. **Network Issues:** Use `--tunnel` if same-network connection fails
5. **Restart When Needed:** Restart Metro after changing `.env` or installing packages

## Troubleshooting

### App Shows "Unable to connect to Metro"

**Solutions:**
1. Check Metro bundler is running
2. Verify device and computer are on same network
3. Try tunnel mode: `npx expo start --dev-client --tunnel`
4. Restart Metro bundler

### Changes Not Reflecting

**Solutions:**
1. Save the file (Ctrl+S / Cmd+S)
2. Check Metro terminal for errors
3. Press `r` in Metro terminal to force reload
4. Shake device → "Reload"

### Metro Bundler Crashes

**Solutions:**
1. Stop Metro (Ctrl+C)
2. Clear cache: `npx expo start --dev-client --clear`
3. Restart Metro bundler

## Summary

**TL;DR:**
- ✅ **Keep Metro running** while developing
- ✅ **Open/close app freely** - it auto-connects
- ✅ **Only restart Metro** when changing `.env` or installing packages
- ✅ **Hot reload** handles most code changes automatically

The Metro bundler is your development server - think of it like a web server that needs to stay running while you develop!
