# Monorepo Build Fix

## Issues Found

1. **Missing workspace packages**: `.easignore` was excluding `packages/` directory
2. **Environment variables not resolving**: Using `${VAR}` instead of `$VAR` syntax
3. **Missing root package.json**: Needed for workspace resolution

## Fixes Applied

### 1. Updated `.easignore`
Added workspace packages to the include list:
```
!../../packages/
!../../package.json
!../../package-lock.json
```

### 2. Fixed Environment Variable Syntax
Changed from `${VAR}` to `$VAR` in `eas.json`:
- `${EXPO_PUBLIC_MAPBOX_PUBLIC_TOKEN}` → `$EXPO_PUBLIC_MAPBOX_PUBLIC_TOKEN`
- `${RNMAPBOX__MAPS_DOWNLOAD_TOKEN}` → `$RNMAPBOX__MAPS_DOWNLOAD_TOKEN`

### 3. Re-added env section to eas.json
The env section is needed to properly resolve environment variables from EAS.

## Why This Fixes It

1. **Workspace Packages**: The app depends on `@gatimitra/contracts` and `@gatimitra/sdk` from the monorepo. These need to be included in the build.

2. **Environment Variables**: EAS uses `$VAR` syntax (not `${VAR}`) to reference environment variables. The `${VAR}` syntax was being treated as a literal string.

3. **Root package.json**: Needed for npm/yarn workspace resolution during the build.

## Next Steps

1. **Verify environment variables are set:**
   ```bash
   eas env:list --environment development
   ```

2. **Build again:**
   ```bash
   eas build --profile development --platform android --clear-cache
   ```

## Expected Result

- Build should find `package.json` correctly
- Environment variables should resolve to actual values (not literal strings)
- Workspace packages should be included in the build
