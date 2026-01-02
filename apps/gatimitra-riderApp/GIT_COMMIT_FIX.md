# Fix: package.json Not Found in EAS Build

## Root Cause

**EAS Build relies on git to determine what files to include in the archive.** If your repository has no commits, or if `package.json` is not tracked by git, it won't be included in the build archive.

## Solution: Commit Files to Git

You must commit all files to git before running EAS Build:

```bash
# From the repository root
git add .
git commit -m "Initial commit: Add GatiMitra Rider App"

# Then run the build
cd apps/gatimitra-riderApp
eas build --profile development --platform android --clear-cache
```

## Verification

After committing, verify that `package.json` is tracked:

```bash
git ls-files apps/gatimitra-riderApp/package.json
```

This should output: `apps/gatimitra-riderApp/package.json`

## Why This Happens

1. EAS Build creates an archive based on **git-tracked files**
2. If there are no commits, EAS can't determine what files to include
3. The archive is uploaded to EAS servers
4. During extraction, if `package.json` wasn't in the archive, it won't exist at the expected path

## Alternative: Use EAS Build with Local Files

If you can't commit to git (e.g., in development), you can use:

```bash
eas build --profile development --platform android --local
```

This builds locally using your actual filesystem, but requires:
- Android SDK installed locally
- More setup and time

## Next Steps

1. ✅ Commit all files to git
2. ✅ Verify `package.json` is tracked
3. ✅ Run EAS Build from `apps/gatimitra-riderApp` directory
4. ✅ Build should now find `package.json`
