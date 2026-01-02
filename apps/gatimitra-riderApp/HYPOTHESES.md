# Debug Hypotheses - package.json Not Found

## Hypothesis H1: Archive Structure Mismatch
**Theory:** EAS creates archive from `apps/gatimitra-riderApp` but extracts to `/home/expo/expo_app/apps/gatimitra-riderApp`, expecting the full monorepo structure. The archive only contains app files, not the parent directory structure.

**Evidence needed:**
- What files are actually in the archive
- Where EAS extracts the archive
- What path structure EAS expects

## Hypothesis H2: .easignore Still Excluding package.json
**Theory:** Even though we removed `.easignore`, there might be a cached version or EAS is using a different ignore file (like root `.gitignore`).

**Evidence needed:**
- Whether `.easignore` exists during build
- What ignore patterns are active
- Whether package.json is in the archive

## Hypothesis H3: EAS Pre-install Hook Path Issue
**Theory:** EAS's built-in "Pre-install hook" is hardcoded to look for `package.json` at `/home/expo/expo_app/apps/gatimitra-riderApp` based on the project slug/name, but the archive extracts to a different location.

**Evidence needed:**
- Where the archive actually extracts
- What the working directory is during pre-install hook
- Whether package.json exists but at a different path

## Hypothesis H4: Archive Creation from Wrong Directory
**Theory:** EAS might be creating the archive from the root directory (`expo_app`) instead of from `apps/gatimitra-riderApp`, causing a path mismatch.

**Evidence needed:**
- What directory EAS uses to create the archive
- What the archive root contains
- Whether the archive preserves full paths

## Hypothesis H5: EAS Monorepo Configuration Missing
**Theory:** EAS doesn't know this is a monorepo and needs explicit configuration (like `workingDirectory` in `eas.json`) to handle the nested structure correctly.

**Evidence needed:**
- Whether `eas.json` needs monorepo-specific config
- What EAS expects for monorepo projects
- Whether we need to build from root with different config
