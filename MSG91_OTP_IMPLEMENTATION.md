# MSG91 OTP Verification Implementation

## Overview
This document describes the implementation of MSG91 OTP verification system for both signup (initial mobile verification) and login flows in the GatiMitra Rider App.

## Architecture

### Client-Side (Rider App)
- **Technology**: MSG91 React Native SDK (`@msg91comm/sendotp-react-native`)
- **Widget ID**: `356c71695646393436333739`
- **OTP Length**: 4 digits (configured in MSG91 dashboard)
- **Flow**: Client-side OTP verification using MSG91 Widget SDK

### Server-Side (Backend)
- **Endpoint**: `/v1/auth/msg91/verify-token`
- **Purpose**: Verify MSG91 access token and issue session JWT
- **Configuration**: Uses `MSG91_AUTH_KEY` from environment variables

## Implementation Details

### 1. Frontend Implementation

#### MSG91 Service (`apps/gatimitra-riderApp/src/services/auth/otp/msg91OtpService.ts`)
- Initializes MSG91 widget on first use
- Handles OTP sending via `OTPWidget.sendOTP()`
- Handles OTP verification via `OTPWidget.verifyOTP()`
- Exchanges MSG91 auth token for backend session
- Supports biometric authentication
- Supports OTP retry on different channels

#### Login Screen (`apps/gatimitra-riderApp/app/(auth)/login.tsx`)
- Modern UI with 4-digit OTP input
- Biometric authentication option (Face ID/Touch ID/Fingerprint)
- OTP resend functionality with countdown timer
- Error handling and user feedback
- Auto-focus on OTP input field

### 2. Backend Implementation

#### MSG91 Token Verification (`backend/src/modules/auth/auth.routes.ts`)
- Endpoint: `POST /v1/auth/msg91/verify-token`
- Verifies MSG91 access token using MSG91 API
- Creates or updates rider record
- Issues Supabase-compatible JWT session
- Handles both new rider signup and existing rider login

### 3. Configuration

#### Environment Variables

**Backend** (`.env`):
```env
MSG91_AUTH_KEY=483466A9gWqQENhMod699337aeP1
MSG91_TEMPLATE_ID=6993113aac517f37a558a086
MSG91_WIDGET_ID=356c71695646393436333739
MSG91_OTP_EXPIRY_SEC=300
```

**Rider App**:
- Widget ID is hardcoded in `msg91OtpService.ts` (can be moved to config if needed)
- No secrets stored in app (all OTP operations use backend)

#### iOS Configuration (`apps/gatimitra-riderApp/app.config.js`)
- Added `NSFaceIDUsageDescription` for biometric authentication

## Features

### ✅ Implemented
1. **4-Digit OTP**: All OTPs are 4 digits as configured in MSG91 dashboard
2. **Client-Side Verification**: Uses MSG91 React Native SDK for OTP verification
3. **Biometric Support**: Face ID, Touch ID, and Fingerprint authentication
4. **OTP Retry**: Resend OTP functionality with countdown timer
5. **Modern UI**: Clean, user-friendly interface with proper error handling
6. **Backend Token Verification**: Secure token verification on backend
7. **Session Management**: Issues JWT sessions after successful verification
8. **Rider Onboarding**: Handles both new rider signup and existing rider login

### 🔄 Flow

1. **User enters phone number** → Clicks "Send OTP"
2. **App calls MSG91 SDK** → `OTPWidget.sendOTP()` sends OTP via SMS
3. **User receives 4-digit OTP** → Enters OTP in app
4. **App verifies OTP** → `OTPWidget.verifyOTP()` verifies and returns auth token
5. **App sends token to backend** → `/v1/auth/msg91/verify-token`
6. **Backend verifies token** → Calls MSG91 API to verify token
7. **Backend issues session** → Returns JWT session token
8. **App stores session** → User is logged in

### 🔐 Security Features

- OTP never exposed in client-side code
- Token verification happens on backend
- Phone number validation
- Rate limiting (handled by MSG91)
- Session expiration (6 hours)
- Biometric authentication support

## Testing

### Prerequisites
1. MSG91 widget configured with:
   - 4-digit OTP length
   - Mobile Integration enabled
   - Widget ID: `356c71695646393436333739`

### Test Scenarios
1. **New Rider Signup**
   - Enter new phone number
   - Receive OTP
   - Verify OTP
   - Should create new rider and start onboarding

2. **Existing Rider Login**
   - Enter existing phone number
   - Receive OTP
   - Verify OTP
   - Should log in and redirect based on onboarding status

3. **Biometric Authentication**
   - On devices with biometric support
   - Should show biometric option
   - Should authenticate using Face ID/Touch ID/Fingerprint

4. **OTP Retry**
   - Click "Resend OTP" after countdown
   - Should receive new OTP
   - Should reset countdown timer

5. **Error Handling**
   - Invalid OTP → Show error message
   - Expired OTP → Show error and allow resend
   - Network errors → Show appropriate error

## Dependencies

### Rider App
- `@msg91comm/sendotp-react-native`: MSG91 React Native SDK

### Backend
- No additional dependencies (uses native `fetch` for MSG91 API calls)

## Notes

1. **Widget Configuration**: Ensure "Mobile Integration" is enabled in MSG91 widget settings
2. **OTP Length**: Configured as 4 digits in MSG91 dashboard (widget: `otpauth`)
3. **No DLT ID**: Implementation works without DLT ID as per MSG91 documentation
4. **Token Verification**: Backend verifies tokens using MSG91 API endpoint
5. **Biometric**: Requires iOS Info.plist configuration (already added)

## Future Enhancements

1. Move widget ID to environment configuration
2. Add voice OTP retry option
3. Add WhatsApp OTP retry option
4. Implement passwordless login with biometric
5. Add OTP analytics and monitoring
