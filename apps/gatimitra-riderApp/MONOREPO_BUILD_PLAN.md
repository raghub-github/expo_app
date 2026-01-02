# Monorepo EAS Build Fix - Implementation Plan

## Problem Analysis

1. **EAS Build runs from `apps/gatimitra-riderApp` directory**
   - Creates archive from this directory
   - `.easignore` with `../../` patterns don't work (relative paths fail)
   - Workspace packages (`@gatimitra/contracts`, `@gatimitra/sdk`) are not included

2. **package.json not found error**
   - EAS looks for package.json in `/home/expo/expo_app/apps/gatimitra-riderApp`
   - But workspace dependencies aren't resolved

3. **Environment variables showing as literal strings**
   - Fixed: Changed `${VAR}` to `$VAR` syntax

## Solution Strategy

### Option 1: Pre-build Hook (Recommended)
Create a script that copies workspace packages into the app before build.

### Option 2: Simplified .easignore
Use absolute patterns that work from app directory.

### Option 3: Build from Root
Move eas.json to root and configure working directory.

## Chosen Solution: Pre-build Hook + Fixed .easignore

This approach:
- ✅ Keeps eas.json in app directory (standard)
- ✅ Ensures workspace packages are available
- ✅ Works with EAS build system
- ✅ No need to restructure project

## Implementation Steps

1. Create `eas-build-pre-install.sh` script
2. Update `eas.json` to run the script
3. Fix `.easignore` to include necessary files
4. Test the build
