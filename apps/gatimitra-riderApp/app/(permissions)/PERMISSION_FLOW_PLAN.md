# First-Time Permission Flow - Implementation Plan

## Overview
Beautiful, modern, sequential permission flow for Expo Rider App with one-by-one permission requests, auto-progression, and exact deep linking to device settings.

## Permission Sequence

### Step 1: Location Permission (MANDATORY)
- **Foreground Location**: Required for showing nearby orders
- **Background Location**: Required for active duty tracking (always-on)
- **Deep Link**: Opens app-specific location permission page
- **Auto-progression**: Yes, after both foreground + background are granted AND GPS is enabled
- **Special Handling**: 
  - Check GPS/Location services enabled
  - Request foreground first, then background
  - Verify location services are actually enabled

### Step 2: Notification Permission (OPTIONAL but recommended)
- **Purpose**: Receive order alerts, updates, earnings notifications
- **Features**: Vibration + Sound enabled
- **Deep Link**: Opens app notification settings
- **Auto-progression**: Yes, after permission granted/denied
- **Special Handling**:
  - Request notification permissions with sound and vibration
  - Handle iOS vs Android differences

### Step 3: Battery Optimization (OPTIONAL)
- **Purpose**: Ensure continuous location tracking and order updates
- **Deep Link**: Opens exact "Ignore Battery Optimization" settings page
- **Auto-progression**: Yes, after opening settings (user can toggle)
- **Special Handling**:
  - Android only (iOS handles automatically)
  - Opens battery optimization settings directly
  - Shows toggle/instruction to disable optimization

### Step 4: Background Running (OPTIONAL)
- **Purpose**: Receive orders in background, continuous location tracking
- **Deep Link**: Opens app info page with background running option
- **Auto-progression**: Yes, after opening settings
- **Special Handling**:
  - Android only (iOS handles automatically)
  - Opens app info page where user can enable background running

## Technical Implementation

### 1. Permission Manager Enhancements
- Enhanced location request (foreground + background in sequence)
- Notification request with vibration and sound
- Better error handling and status checking

### 2. Deep Linking Improvements
- Exact Android intent actions for each permission type
- Fallback handling for different Android versions (10-14)
- iOS graceful handling

### 3. UI Components
- Beautiful animated permission screen
- Progress indicator (Step X of 4)
- Modern card-based design with gradients
- Smooth animations (fade, slide)
- Icon illustrations for each permission
- Clear explanations with micro text

### 4. State Management
- Sequential navigation state
- Permission status tracking
- Auto-progression logic
- Retry handling for denied permissions

## UI/UX Requirements

### Design Elements
- ✅ Onboarding-style slides
- ✅ Icons and illustrations
- ✅ Clean, modern layout
- ✅ Progress indicator (Step 1/4, Step 2/4...)
- ✅ Button: "Allow & Continue"
- ✅ Micro text explaining why permission is required
- ✅ Gradient backgrounds
- ✅ Smooth animations

### User Flow
1. User opens app for first time
2. Permission screen #1 (Location) appears
3. User taps "Allow & Continue"
4. System permission dialog appears
5. After granting → automatically move to screen #2
6. Repeat for each permission
7. After last permission → redirect to dashboard

### Error Handling
- Permission denied once → show retry button
- Permission permanently denied → show "Open Settings" button
- Visual feedback for each state
- No black screens, graceful fallbacks

## Platform Support
- ✅ Android 10 - Android 14
- ✅ iOS (gracefully skip unsupported permission types)
- ✅ Web (minimal support)

## Files to Create/Update
1. `app/(permissions)/request.tsx` - Main permission flow screen
2. `src/services/permissions/permissionManager.ts` - Enhanced permission logic
3. `src/services/permissions/androidIntents.ts` - Improved deep linking
4. `src/services/permissions/notificationsWrapper.ts` - Notification with vibration/sound
5. `src/components/ui/PermissionCard.tsx` - Beautiful permission card component (optional)
