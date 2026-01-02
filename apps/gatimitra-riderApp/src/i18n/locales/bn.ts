/**
 * Bengali Translations (বাংলা)
 * Complete translation file for the GatiMitra Rider App
 */

import type { TranslationKeys } from "./en";
import { en } from "./en";

// Bengali translations - using English as base with key translations
export const bn: TranslationKeys = {
  ...en,
  tabs: {
    orders: "অর্ডার",
    earnings: "আয়",
    ledger: "লেজার",
    offers: "অফার",
    profile: "প্রোফাইল",
  },
  topbar: {
    dutyOn: "অন-ডিউটি",
    dutyOff: "অফ-ডিউটি",
    language: "ভাষা",
    notifications: "বিজ্ঞপ্তি",
    noNotifications: "কোন বিজ্ঞপ্তি নেই",
    noNotificationsMessage: "আপনি সব দেখেছেন! নতুন বিজ্ঞপ্তি এখানে প্রদর্শিত হবে।",
    selectLanguage: "ভাষা নির্বাচন করুন",
    cancel: "বাতিল",
  },
  location: {
    required: "অবস্থান প্রয়োজন",
    permissionDenied: "অ্যাপ ব্যবহার করার জন্য অবস্থান অনুমতি প্রয়োজন। দয়া করে সেটিংসে অবস্থান অ্যাক্সেস সক্ষম করুন।",
    gpsDisabled: "GPS নিষ্ক্রিয়",
    gpsDisabledMessage: "চালিয়ে যেতে GPS/অবস্থান সেবা চালু করুন। অর্ডার পেতে অবস্থান বাধ্যতামূলক।",
    enableLocation: "অবস্থান সক্ষম করুন",
    turnedOn: "আমি এটি চালু করেছি",
    gettingLocation: "আপনার অবস্থান পাচ্ছি…",
    liveLocation: "লাইভ অবস্থান",
    waitingForFix: "ফিক্সের জন্য অপেক্ষা করছি…",
    mandatory: "অর্ডার পেতে অবস্থান বাধ্যতামূলক",
    servicesRequired: "অবস্থান সেবা প্রয়োজন",
    servicesMessage: "দয়া করে অর্ডার পেতে অবস্থান/GPS সেবা চালু করুন। রাইডারদের জন্য অবস্থান বাধ্যতামূলক।",
    openSettings: "সেটিংস খুলুন",
  },
  orders: {
    title: "সক্রিয় অর্ডার",
    noOrders: "এখনও কোন অর্ডার নেই",
    noOrdersMessage: "আপনি ON-DUTY থাকলে নতুন অর্ডার এখানে প্রদর্শিত হবে",
    goOnDutyMessage: "অর্ডার পেতে ON-DUTY তে যান",
    loading: "অর্ডার লোড হচ্ছে...",
    accept: "গ্রহণ করুন",
    reject: "প্রত্যাখ্যান করুন",
    orderNumber: "অর্ডার #{{number}}",
    awayDistance: "{{distance}} কিমি দূরে",
    estimatedEarning: "₹{{amount}}",
  },
  orderCategories: {
    food: "খাবার",
    parcel: "পার্সেল",
    ride: "রাইড",
    grocery: "মুদি",
    medicine: "ওষুধ",
    other: "অন্যান্য",
  },
  orderStatus: {
    pending: "মুলতুবি",
    accepted: "গৃহীত",
    pickedUp: "তোলা হয়েছে",
    inTransit: "পথে",
    delivered: "সরবরাহ করা হয়েছে",
    cancelled: "বাতিল",
    rejected: "প্রত্যাখ্যাত",
  },
  login: {
    welcome: "GatiMitra তে স্বাগতম",
    tagline: "সহজ লজিস্টিকসের জন্য আপনার ডেলিভারি পার্টনার",
    enterPhone: "ফোন নম্বর লিখুন",
    phoneDescription: "আমরা আপনার নম্বর যাচাই করতে একটি OTP পাঠাব",
    phoneNumber: "ফোন নম্বর",
    phonePlaceholder: "+91 98765 43210",
    sendOtp: "OTP পাঠান",
    enterOtp: "OTP লিখুন",
    otpDescription: "আমরা {{phone}} এ 6 সংখ্যার কোড পাঠিয়েছি",
    otpCode: "OTP কোড",
    otpPlaceholder: "000000",
    verifyOtp: "OTP যাচাই করুন",
    resendOtp: "OTP পুনরায় পাঠান",
    didntReceive: "কোড পাননি?",
    resendIn: "{{count}} সেকেন্ডে পুনরায় পাঠান",
    changePhone: "ফোন নম্বর পরিবর্তন করুন",
    terms: "চালিয়ে যাওয়ার মাধ্যমে, আপনি GatiMitra এর সেবার শর্তাবলী এবং গোপনীয়তা নীতিতে সম্মত হন",
    failedRequest: "OTP অনুরোধ ব্যর্থ",
    failedVerify: "OTP যাচাইকরণ ব্যর্থ",
    invalidOtp: "অবৈধ OTP কোড",
    sessionExpired: "সেশন মেয়াদ শেষ। দয়া করে আবার লগইন করুন",
  },
};

