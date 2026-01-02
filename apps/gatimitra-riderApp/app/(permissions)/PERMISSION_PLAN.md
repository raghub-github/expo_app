# Permission Flow Plan - GatiMitra Rider App

## Permission Requirements

### 1. Location Permission (MANDATORY)
- **Foreground Location**: Required for showing nearby orders
- **Background Location**: Required for active duty tracking
- **Deep Link**: Opens app-specific location permission page
- **Auto-progression**: Yes, after GPS is enabled

### 2. Notification Permission (OPTIONAL)
- **Purpose**: Receive order alerts and updates
- **Deep Link**: Opens app notification settings
- **Auto-progression**: Yes, after permission granted/denied

### 3. Battery Optimization (OPTIONAL)
- **Purpose**: Ensure continuous location tracking
- **Deep Link**: Opens exact "Ignore Battery Optimization" page
- **Auto-progression**: Yes, after opening settings

### 4. Background Running (OPTIONAL)
- **Purpose**: Receive orders in background
- **Deep Link**: Opens app info page with background running option
- **Auto-progression**: Yes, after opening settings

## Design Requirements

1. **Modern UI**: Clean, attractive, premium design
2. **Progress Indicator**: Circular steps with checkmarks
3. **Logo Integration**: Use Logo component everywhere
4. **Smooth Animations**: Fade and slide transitions
5. **Error Handling**: No black screens, graceful fallbacks
6. **Exact Deep Linking**: Direct to specific settings pages

## Technical Requirements

1. **No expo-notifications direct imports**: Use wrapper only
2. **Error boundaries**: Prevent crashes
3. **State management**: Proper permission state tracking
4. **Auto-progression**: Smart flow after permissions
5. **Platform detection**: Handle iOS/Android/Web differences

