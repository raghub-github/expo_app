#!/bin/bash
# EAS Build Hooks - Ensure package.json exists
# This script runs before the build to verify files exist

set -e

echo "🔍 EAS Build Hook - Checking for package.json..."

# The working directory should be the app directory
WORK_DIR="${EAS_BUILD_WORKINGDIR:-/home/expo/workingdir/build}"
APP_DIR="${WORK_DIR}/apps/gatimitra-riderApp"

# Try multiple possible locations
if [ -f "package.json" ]; then
  echo "✅ Found package.json in current directory: $(pwd)"
  ls -la package.json
elif [ -f "${APP_DIR}/package.json" ]; then
  echo "✅ Found package.json at: ${APP_DIR}/package.json"
  ls -la "${APP_DIR}/package.json"
elif [ -f "apps/gatimitra-riderApp/package.json" ]; then
  echo "✅ Found package.json at: apps/gatimitra-riderApp/package.json"
  ls -la "apps/gatimitra-riderApp/package.json"
else
  echo "❌ package.json not found!"
  echo "Current directory: $(pwd)"
  echo "Listing files:"
  ls -la
  echo "Looking for package.json in subdirectories:"
  find . -name "package.json" -type f 2>/dev/null || true
  exit 1
fi

echo "✅ package.json verification complete"
