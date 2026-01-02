#!/bin/bash
# EAS Build Pre-install Hook
# This runs before npm install to diagnose why package.json might not be found

set -e

echo "🔍 EAS Build Pre-install Hook - Diagnostic Mode"
echo "================================================"

# Log current directory and environment
echo "Current directory: $(pwd)"
echo "EAS_BUILD_WORKINGDIR: ${EAS_BUILD_WORKINGDIR:-not set}"
echo "EAS_BUILD_PROJECT_ID: ${EAS_BUILD_PROJECT_ID:-not set}"

# Expected location based on error message
EXPECTED_PATH="/home/expo/expo_app/apps/gatimitra-riderApp"
echo "Expected package.json path: $EXPECTED_PATH"

# Check multiple possible locations
echo ""
echo "📂 Checking for package.json in various locations:"
echo "---------------------------------------------------"

# Location 1: Current directory
if [ -f "package.json" ]; then
  echo "✅ Found package.json in current directory: $(pwd)/package.json"
  ls -la package.json
  cat package.json | head -5
else
  echo "❌ package.json NOT in current directory: $(pwd)"
fi

# Location 2: Expected path (if we're at root)
if [ -f "$EXPECTED_PATH/package.json" ]; then
  echo "✅ Found package.json at expected path: $EXPECTED_PATH/package.json"
  ls -la "$EXPECTED_PATH/package.json"
else
  echo "❌ package.json NOT at expected path: $EXPECTED_PATH/package.json"
fi

# Location 3: apps/gatimitra-riderApp (if we're at root)
if [ -f "apps/gatimitra-riderApp/package.json" ]; then
  echo "✅ Found package.json at: apps/gatimitra-riderApp/package.json"
  ls -la "apps/gatimitra-riderApp/package.json"
else
  echo "❌ package.json NOT at: apps/gatimitra-riderApp/package.json"
fi

# Location 4: Check if we're in the app directory
if [ -d "apps/gatimitra-riderApp" ]; then
  if [ -f "apps/gatimitra-riderApp/package.json" ]; then
    echo "✅ Found package.json at: apps/gatimitra-riderApp/package.json"
  else
    echo "❌ apps/gatimitra-riderApp directory exists but no package.json"
  fi
fi

# List all package.json files found
echo ""
echo "🔍 Searching for all package.json files:"
find . -name "package.json" -type f 2>/dev/null | head -10 || echo "No package.json files found"

# List directory structure
echo ""
echo "📁 Current directory structure:"
ls -la | head -20

# If we're at root, show apps directory
if [ -d "apps" ]; then
  echo ""
  echo "📁 apps directory contents:"
  ls -la apps/ | head -10
fi

# Check if we need to copy package.json
if [ ! -f "package.json" ]; then
  echo ""
  echo "⚠️  package.json not found in current directory, attempting to locate and copy..."
  
  # Try to find and copy from various locations
  if [ -f "apps/gatimitra-riderApp/package.json" ]; then
    echo "📋 Found package.json at apps/gatimitra-riderApp/package.json, copying..."
    mkdir -p "$(dirname package.json)" 2>/dev/null || true
    cp apps/gatimitra-riderApp/package.json package.json
    echo "✅ package.json copied to current directory"
    ls -la package.json
  elif [ -f "../package.json" ] && [ -d "../apps/gatimitra-riderApp" ]; then
    echo "📋 Found package.json in parent, checking if we're in a subdirectory..."
    if [ -f "../apps/gatimitra-riderApp/package.json" ]; then
      cp ../apps/gatimitra-riderApp/package.json package.json
      echo "✅ package.json copied from ../apps/gatimitra-riderApp/"
      ls -la package.json
    fi
  else
    echo "❌ Could not locate package.json to copy"
    echo "Current directory: $(pwd)"
    echo "Directory listing:"
    ls -la | head -10
  fi
fi

# Final check - if package.json still doesn't exist, this is a critical error
if [ ! -f "package.json" ]; then
  echo ""
  echo "❌ CRITICAL: package.json still not found after all attempts!"
  echo "This build will fail. Please ensure package.json is committed to git."
  exit 1
else
  echo ""
  echo "✅ package.json verified and ready"
fi

echo ""
echo "✅ Pre-install hook complete"
