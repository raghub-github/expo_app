/**
 * Punjabi Translations (ਪੰਜਾਬੀ)
 * Complete translation file for the GatiMitra Rider App
 */

import type { TranslationKeys } from "./en";
import { en } from "./en";

// Punjabi translations - using English as base with key translations
export const pa: TranslationKeys = {
  ...en,
  tabs: {
    orders: "ਆਰਡਰ",
    earnings: "ਕਮਾਈ",
    ledger: "ਖਾਤਾ",
    offers: "ਪੇਸ਼ਕਸ਼ਾਂ",
    profile: "ਪ੍ਰੋਫਾਈਲ",
  },
  topbar: {
    dutyOn: "ਆਨ-ਡਿਊਟੀ",
    dutyOff: "ਆਫ-ਡਿਊਟੀ",
    language: "ਭਾਸ਼ਾ",
    notifications: "ਸੂਚਨਾਵਾਂ",
    noNotifications: "ਕੋਈ ਸੂਚਨਾਵਾਂ ਨਹੀਂ",
    noNotificationsMessage: "ਤੁਸੀਂ ਸਭ ਕੁਝ ਦੇਖ ਲਿਆ ਹੈ! ਨਵੀਆਂ ਸੂਚਨਾਵਾਂ ਇੱਥੇ ਦਿਖਾਈ ਦੇਣਗੀਆਂ।",
    selectLanguage: "ਭਾਸ਼ਾ ਚੁਣੋ",
    cancel: "ਰੱਦ ਕਰੋ",
  },
  location: {
    required: "ਟਿਕਾਣਾ ਲੋੜੀਂਦਾ",
    permissionDenied: "ਐਪ ਵਰਤਣ ਲਈ ਟਿਕਾਣਾ ਇਜਾਜ਼ਤ ਲੋੜੀਂਦੀ ਹੈ। ਕਿਰਪਾ ਕਰਕੇ ਸੈਟਿੰਗਜ਼ ਵਿੱਚ ਟਿਕਾਣਾ ਐਕਸੈਸ ਯੋਗ ਕਰੋ।",
    gpsDisabled: "GPS ਅਯੋਗ ਹੈ",
    gpsDisabledMessage: "ਜਾਰੀ ਰੱਖਣ ਲਈ GPS/ਟਿਕਾਣਾ ਸੇਵਾਵਾਂ ਚਾਲੂ ਕਰੋ। ਆਰਡਰ ਪ੍ਰਾਪਤ ਕਰਨ ਲਈ ਟਿਕਾਣਾ ਲਾਜ਼ਮੀ ਹੈ।",
    enableLocation: "ਟਿਕਾਣਾ ਯੋਗ ਕਰੋ",
    turnedOn: "ਮੈਂ ਇਸਨੂੰ ਚਾਲੂ ਕਰ ਦਿੱਤਾ",
    gettingLocation: "ਤੁਹਾਡਾ ਟਿਕਾਣਾ ਪ੍ਰਾਪਤ ਕੀਤਾ ਜਾ ਰਿਹਾ ਹੈ…",
    liveLocation: "ਲਾਈਵ ਟਿਕਾਣਾ",
    waitingForFix: "ਫਿਕਸ ਲਈ ਉਡੀਕ ਕੀਤੀ ਜਾ ਰਹੀ ਹੈ…",
    mandatory: "ਆਰਡਰ ਪ੍ਰਾਪਤ ਕਰਨ ਲਈ ਟਿਕਾਣਾ ਲਾਜ਼ਮੀ ਹੈ",
    servicesRequired: "ਟਿਕਾਣਾ ਸੇਵਾਵਾਂ ਲੋੜੀਂਦੀਆਂ",
    servicesMessage: "ਕਿਰਪਾ ਕਰਕੇ ਆਰਡਰ ਪ੍ਰਾਪਤ ਕਰਨ ਲਈ ਟਿਕਾਣਾ/GPS ਸੇਵਾਵਾਂ ਚਾਲੂ ਕਰੋ। ਰਾਈਡਰਾਂ ਲਈ ਟਿਕਾਣਾ ਲਾਜ਼ਮੀ ਹੈ।",
    openSettings: "ਸੈਟਿੰਗਜ਼ ਖੋਲ੍ਹੋ",
  },
  orders: {
    title: "ਸਰਗਰਮ ਆਰਡਰ",
    noOrders: "ਅਜੇ ਤੱਕ ਕੋਈ ਆਰਡਰ ਨਹੀਂ",
    noOrdersMessage: "ਜਦੋਂ ਤੁਸੀਂ ON-DUTY ਹੋਵੋਗੇ ਤਾਂ ਨਵੇਂ ਆਰਡਰ ਇੱਥੇ ਦਿਖਾਈ ਦੇਣਗੇ",
    goOnDutyMessage: "ਆਰਡਰ ਪ੍ਰਾਪਤ ਕਰਨ ਲਈ ON-DUTY 'ਤੇ ਜਾਓ",
    loading: "ਆਰਡਰ ਲੋਡ ਹੋ ਰਹੇ ਹਨ...",
    accept: "ਸਵੀਕਾਰ ਕਰੋ",
    reject: "ਰੱਦ ਕਰੋ",
    orderNumber: "ਆਰਡਰ #{{number}}",
    awayDistance: "{{distance}} ਕਿ.ਮੀ. ਦੂਰ",
    estimatedEarning: "₹{{amount}}",
  },
  orderCategories: {
    food: "ਭੋਜਨ",
    parcel: "ਪਾਰਸਲ",
    ride: "ਰਾਈਡ",
    grocery: "ਕਿਰਾਨਾ",
    medicine: "ਦਵਾਈ",
    other: "ਹੋਰ",
  },
  orderStatus: {
    pending: "ਲੰਬਿਤ",
    accepted: "ਸਵੀਕਾਰ ਕੀਤਾ",
    pickedUp: "ਚੁੱਕਿਆ",
    inTransit: "ਰਸਤੇ ਵਿੱਚ",
    delivered: "ਡਿਲੀਵਰ ਕੀਤਾ",
    cancelled: "ਰੱਦ ਕੀਤਾ",
    rejected: "ਰੱਦ ਕੀਤਾ",
  },
  login: {
    welcome: "GatiMitra ਵਿੱਚ ਤੁਹਾਡਾ ਸੁਆਗਤ ਹੈ",
    tagline: "ਸਹਿਜ ਲੌਜਿਸਟਿਕਸ ਲਈ ਤੁਹਾਡਾ ਡਿਲੀਵਰੀ ਪਾਰਟਨਰ",
    enterPhone: "ਫੋਨ ਨੰਬਰ ਦਾਖਲ ਕਰੋ",
    phoneDescription: "ਅਸੀਂ ਤੁਹਾਡੇ ਨੰਬਰ ਦੀ ਪੁਸ਼ਟੀ ਕਰਨ ਲਈ ਇੱਕ OTP ਭੇਜਾਂਗੇ",
    phoneNumber: "ਫੋਨ ਨੰਬਰ",
    phonePlaceholder: "+91 98765 43210",
    sendOtp: "OTP ਭੇਜੋ",
    enterOtp: "OTP ਦਾਖਲ ਕਰੋ",
    otpDescription: "ਅਸੀਂ {{phone}} 'ਤੇ 6 ਅੰਕਾਂ ਦਾ ਕੋਡ ਭੇਜਿਆ ਹੈ",
    otpCode: "OTP ਕੋਡ",
    otpPlaceholder: "000000",
    verifyOtp: "OTP ਦੀ ਪੁਸ਼ਟੀ ਕਰੋ",
    resendOtp: "OTP ਦੁਬਾਰਾ ਭੇਜੋ",
    didntReceive: "ਕੋਡ ਨਹੀਂ ਮਿਲਿਆ?",
    resendIn: "{{count}} ਸੈਕਿੰਡ ਵਿੱਚ ਦੁਬਾਰਾ ਭੇਜੋ",
    changePhone: "ਫੋਨ ਨੰਬਰ ਬਦਲੋ",
    terms: "ਜਾਰੀ ਰੱਖ ਕੇ, ਤੁਸੀਂ GatiMitra ਦੀਆਂ ਸੇਵਾ ਸ਼ਰਤਾਂ ਅਤੇ ਗੋਪਨੀਯਤਾ ਨੀਤੀ ਨਾਲ ਸਹਿਮਤ ਹੋ",
    failedRequest: "OTP ਬੇਨਤੀ ਅਸਫਲ",
    failedVerify: "OTP ਪੁਸ਼ਟੀ ਅਸਫਲ",
    invalidOtp: "ਅਯੋਗ OTP ਕੋਡ",
    sessionExpired: "ਸੈਸ਼ਨ ਮਿਆਦ ਪੁੱਗ ਗਈ। ਕਿਰਪਾ ਕਰਕੇ ਦੁਬਾਰਾ ਲੌਗਇਨ ਕਰੋ",
  },
};

