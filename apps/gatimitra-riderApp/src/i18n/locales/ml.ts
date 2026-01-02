/**
 * Malayalam Translations (മലയാളം)
 * Complete translation file for the GatiMitra Rider App
 */

import type { TranslationKeys } from "./en";
import { en } from "./en";

// Malayalam translations - using English as base with key translations
export const ml: TranslationKeys = {
  ...en,
  tabs: {
    orders: "ഓർഡറുകൾ",
    earnings: "വരുമാനം",
    ledger: "ലെഡ്ജർ",
    offers: "ഓഫറുകൾ",
    profile: "പ്രൊഫൈൽ",
  },
  topbar: {
    dutyOn: "ഓൺ-ഡ്യൂട്ടി",
    dutyOff: "ഓഫ്-ഡ്യൂട്ടി",
    language: "ഭാഷ",
    notifications: "അറിയിപ്പുകൾ",
    noNotifications: "അറിയിപ്പുകളില്ല",
    noNotificationsMessage: "നിങ്ങൾ എല്ലാം കണ്ടു! പുതിയ അറിയിപ്പുകൾ ഇവിടെ ദൃശ്യമാകും.",
    selectLanguage: "ഭാഷ തിരഞ്ഞെടുക്കുക",
    cancel: "റദ്ദാക്കുക",
  },
  location: {
    required: "ലൊക്കേഷൻ ആവശ്യമാണ്",
    permissionDenied: "ആപ്പ് ഉപയോഗിക്കാൻ ലൊക്കേഷൻ അനുമതി ആവശ്യമാണ്. ദയവായി സെറ്റിംഗുകളിൽ ലൊക്കേഷൻ ആക്‌സസ് പ്രവർത്തനക്ഷമമാക്കുക.",
    gpsDisabled: "GPS നിർജ്ജീവമാക്കി",
    gpsDisabledMessage: "തുടരാൻ GPS/ലൊക്കേഷൻ സേവനങ്ങൾ ഓണാക്കുക. ഓർഡറുകൾ ലഭിക്കുന്നതിന് ലൊക്കേഷൻ നിർബന്ധമാണ്.",
    enableLocation: "ലൊക്കേഷൻ പ്രവർത്തനക്ഷമമാക്കുക",
    turnedOn: "ഞാൻ അത് ഓണാക്കി",
    gettingLocation: "നിങ്ങളുടെ ലൊക്കേഷൻ നേടുന്നു…",
    liveLocation: "ലൈവ് ലൊക്കേഷൻ",
    waitingForFix: "ഫിക്സിനായി കാത്തിരിക്കുന്നു…",
    mandatory: "ഓർഡറുകൾ സ്വീകരിക്കാൻ ലൊക്കേഷൻ നിർബന്ധമാണ്",
    servicesRequired: "ലൊക്കേഷൻ സേവനങ്ങൾ ആവശ്യമാണ്",
    servicesMessage: "ദയവായി ഓർഡറുകൾ ലഭിക്കുന്നതിന് ലൊക്കേഷൻ/GPS സേവനങ്ങൾ ഓണാക്കുക. റൈഡർമാർക്ക് ലൊക്കേഷൻ നിർബന്ധമാണ്.",
    openSettings: "സെറ്റിംഗുകൾ തുറക്കുക",
  },
  orders: {
    title: "സജീവ ഓർഡറുകൾ",
    noOrders: "ഇതുവരെ ഓർഡറുകളില്ല",
    noOrdersMessage: "നിങ്ങൾ ON-DUTY ആയിരിക്കുമ്പോൾ പുതിയ ഓർഡറുകൾ ഇവിടെ ദൃശ്യമാകും",
    goOnDutyMessage: "ഓർഡറുകൾ ലഭിക്കാൻ ON-DUTY ലേക്ക് പോകുക",
    loading: "ഓർഡറുകൾ ലോഡ് ചെയ്യുന്നു...",
    accept: "സ്വീകരിക്കുക",
    reject: "നിരസിക്കുക",
    orderNumber: "ഓർഡർ #{{number}}",
    awayDistance: "{{distance}} കി.മീ അകലെ",
    estimatedEarning: "₹{{amount}}",
  },
  orderCategories: {
    food: "ഭക്ഷണം",
    parcel: "പാഴ്‌സൽ",
    ride: "യാത്ര",
    grocery: "പലചരക്ക്",
    medicine: "മരുന്ന്",
    other: "മറ്റുള്ളവ",
  },
  orderStatus: {
    pending: "തീർപ്പാക്കാത്തത്",
    accepted: "സ്വീകരിച്ചു",
    pickedUp: "പിക്കപ്പ് ചെയ്തു",
    inTransit: "യാത്രയിൽ",
    delivered: "വിതരണം ചെയ്തു",
    cancelled: "റദ്ദാക്കി",
    rejected: "നിരസിച്ചു",
  },
  login: {
    welcome: "GatiMitra ലേക്ക് സ്വാഗതം",
    tagline: "തടസ്സമില്ലാത്ത ലോജിസ്റ്റിക്സിനുള്ള നിങ്ങളുടെ ഡെലിവറി പങ്കാളി",
    enterPhone: "ഫോൺ നമ്പർ നൽകുക",
    phoneDescription: "നിങ്ങളുടെ നമ്പർ സ്ഥിരീകരിക്കാൻ ഞങ്ങൾ ഒരു OTP അയയ്ക്കും",
    phoneNumber: "ഫോൺ നമ്പർ",
    phonePlaceholder: "+91 98765 43210",
    sendOtp: "OTP അയയ്ക്കുക",
    enterOtp: "OTP നൽകുക",
    otpDescription: "ഞങ്ങൾ {{phone}} ലേക്ക് 6 അക്ക കോഡ് അയച്ചു",
    otpCode: "OTP കോഡ്",
    otpPlaceholder: "000000",
    verifyOtp: "OTP സ്ഥിരീകരിക്കുക",
    resendOtp: "OTP വീണ്ടും അയയ്ക്കുക",
    didntReceive: "കോഡ് ലഭിച്ചില്ലേ?",
    resendIn: "{{count}} സെക്കന്റിൽ വീണ്ടും അയയ്ക്കുക",
    changePhone: "ഫോൺ നമ്പർ മാറ്റുക",
    terms: "തുടരുന്നതിലൂടെ, നിങ്ങൾ GatiMitra യുടെ സേവന നിബന്ധനകളും സ്വകാര്യതാ നയവും അംഗീകരിക്കുന്നു",
    failedRequest: "OTP അഭ്യർത്ഥന പരാജയപ്പെട്ടു",
    failedVerify: "OTP സ്ഥിരീകരണം പരാജയപ്പെട്ടു",
    invalidOtp: "അസാധുവായ OTP കോഡ്",
    sessionExpired: "സെഷൻ കാലഹരണപ്പെട്ടു. ദയവായി വീണ്ടും ലോഗിൻ ചെയ്യുക",
  },
};

