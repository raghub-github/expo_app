# i18n (Internationalization) Documentation

Complete guide for using multi-language support in the GatiMitra Rider App.

## Table of Contents
1. [Supported Languages](#supported-languages)
2. [Basic Usage](#basic-usage)
3. [Dynamic Data Translation](#dynamic-data-translation)
4. [Formatters](#formatters)
5. [Adding New Translations](#adding-new-translations)
6. [Best Practices](#best-practices)

## Supported Languages

The app currently supports **10 languages**:

| Code | Language | Native Name |
|------|----------|-------------|
| `en` | English | English |
| `hi` | Hindi | हिंदी |
| `mr` | Marathi | मराठी |
| `ta` | Tamil | தமிழ் |
| `te` | Telugu | తెలుగు |
| `kn` | Kannada | ಕನ್ನಡ |
| `gu` | Gujarati | ગુજરાતી |
| `bn` | Bengali | বাংলা |
| `ml` | Malayalam | മലയാളം |
| `pa` | Punjabi | ਪੰਜਾਬੀ |

## Basic Usage

### 1. Using translations in components

```typescript
import { useTranslation } from "react-i18next";

export function MyComponent() {
  const { t } = useTranslation();
  
  return (
    <View>
      <Text>{t("orders.title")}</Text>
      <Text>{t("orders.noOrders")}</Text>
    </View>
  );
}
```

### 2. Using translations with variables

```typescript
const { t } = useTranslation();

// With single variable
<Text>{t("orders.orderNumber", { number: "12345" })}</Text>

// With multiple variables
<Text>{t("orders.awayDistance", { distance: 2.5 })}</Text>
```

### 3. Using the enhanced hook

```typescript
import { useTranslations } from "@/src/i18n/hooks/useTranslations";

export function MyComponent() {
  const { t, formatCurrency, formatDate } = useTranslations();
  
  return (
    <View>
      <Text>{t("earnings.totalBalance")}: {formatCurrency(5000)}</Text>
      <Text>{formatDate(new Date(), "medium")}</Text>
    </View>
  );
}
```

## Dynamic Data Translation

### Translating API responses

```typescript
import { useTranslations } from "@/src/i18n/hooks/useTranslations";

export function OrderCard({ order }) {
  const { translateOrderCategory, translateOrderStatus } = useTranslations();
  
  return (
    <View>
      <Text>{translateOrderCategory(order.category)}</Text>
      <Text>{translateOrderStatus(order.status)}</Text>
    </View>
  );
}
```

### Translating error messages

```typescript
import { useTranslations } from "@/src/i18n/hooks/useTranslations";

export function MyComponent() {
  const { translateError } = useTranslations();
  
  try {
    // ... some code
  } catch (error) {
    Alert.alert("Error", translateError(error));
  }
}
```

## Formatters

### Currency Formatting

```typescript
const { formatCurrency } = useTranslations();

// Format amount in rupees
formatCurrency(1234.56) // ₹1,234.56 (varies by locale)
```

### Date and Time Formatting

```typescript
const { formatDate, formatTime, formatDateTime } = useTranslations();

formatDate(new Date(), "short")   // 30/12/2025
formatDate(new Date(), "medium")  // 30 Dec 2025
formatDate(new Date(), "long")    // 30 December 2025

formatTime(new Date())            // 2:30 PM
formatDateTime(new Date())        // 30 Dec 2025, 2:30 PM
```

### Relative Time

```typescript
const { formatRelativeTime } = useTranslations();

formatRelativeTime(new Date(Date.now() - 3600000)) // "1 hour ago"
formatRelativeTime(new Date(Date.now() + 86400000)) // "in 1 day"
```

### Distance and Numbers

```typescript
const { formatDistance, formatNumber } = useTranslations();

formatDistance(2.5)      // "2.5 km"
formatNumber(1234567)    // "12,34,567" (Indian numbering)
```

### Phone Numbers

```typescript
const { formatPhoneNumber } = useTranslations();

formatPhoneNumber("9876543210") // "+91 98765 43210"
```

## Adding New Translations

### 1. Add to English base file

Edit `src/i18n/locales/en.ts`:

```typescript
export const en = {
  // ... existing translations
  myNewFeature: {
    title: "My Feature",
    description: "Feature description",
    action: "Do Something",
  },
};
```

### 2. Add to all language files

Update each language file (`hi.ts`, `mr.ts`, `ta.ts`, etc.) with the translated text:

```typescript
export const hi: TranslationKeys = {
  // ... existing translations
  myNewFeature: {
    title: "मेरी सुविधा",
    description: "सुविधा विवरण",
    action: "कुछ करें",
  },
};
```

### 3. Use in components

```typescript
const { t } = useTranslation();

<Text>{t("myNewFeature.title")}</Text>
```

## Best Practices

### ✅ DO

1. **Always use translation keys for user-facing text**
   ```typescript
   // Good
   <Text>{t("orders.accept")}</Text>
   
   // Bad
   <Text>Accept</Text>
   ```

2. **Use namespaced keys for organization**
   ```typescript
   t("orders.title")
   t("earnings.totalBalance")
   t("profile.logout")
   ```

3. **Use variables for dynamic content**
   ```typescript
   t("orders.orderNumber", { number: orderId })
   ```

4. **Use formatters for numbers, dates, currency**
   ```typescript
   formatCurrency(amount)
   formatDate(date)
   ```

5. **Keep translation keys flat and descriptive**
   ```typescript
   // Good
   "orders.noOrders"
   "orders.noOrdersMessage"
   
   // Avoid deep nesting
   "orders.empty.state.message.noOrders"
   ```

### ❌ DON'T

1. **Don't hardcode user-facing strings**
   ```typescript
   // Bad
   <Text>No orders yet</Text>
   ```

2. **Don't use translation for non-user-facing content**
   ```typescript
   // Bad
   console.log(t("debug.message"));
   
   // Good
   console.log("Debug message");
   ```

3. **Don't concatenate translated strings**
   ```typescript
   // Bad
   `${t("hello")} ${username}`
   
   // Good
   t("greeting", { username })
   ```

4. **Don't forget to add translations for all languages**
   - When adding new keys, update ALL language files
   - Use English as fallback if translation not ready

## Language Selection Flow

1. User opens app for first time
2. Language selection screen appears (`(onboarding)/language.tsx`)
3. User selects preferred language
4. Selection is saved to storage and synced with i18n
5. All future app launches use the selected language
6. User can change language anytime from:
   - Global top bar language switcher
   - Profile settings

## File Structure

```
src/i18n/
├── index.ts                    # Main i18n configuration
├── locales/                    # Translation files
│   ├── en.ts                   # English (base)
│   ├── hi.ts                   # Hindi
│   ├── mr.ts                   # Marathi
│   ├── ta.ts                   # Tamil
│   ├── te.ts                   # Telugu
│   ├── kn.ts                   # Kannada
│   ├── gu.ts                   # Gujarati
│   ├── bn.ts                   # Bengali
│   ├── ml.ts                   # Malayalam
│   └── pa.ts                   # Punjabi
├── utils/                      # Translation utilities
│   ├── dynamicTranslation.ts   # Dynamic content translation
│   ├── formatters.ts           # Number, date, currency formatters
│   └── index.ts                # Exports
├── hooks/                      # Custom hooks
│   └── useTranslations.ts      # Enhanced translation hook
└── README.md                   # This file
```

## Testing Translations

To test all languages:

1. Open the app
2. Navigate to language selection
3. Try each language
4. Verify:
   - All screens display text correctly
   - Numbers format correctly (Indian numbering system)
   - Dates format correctly for locale
   - Currency displays with ₹ symbol
   - No missing translation keys

## Troubleshooting

### Translation not appearing

1. Check if key exists in `locales/en.ts`
2. Verify key exists in all language files
3. Check for typos in translation key
4. Ensure i18n is initialized (`initI18n()` called in AppProviders)

### Wrong language displayed

1. Check language store: `useLanguageStore()`
2. Verify localStorage: `gm_selected_language_v1`
3. Check i18n language: `i18n.language`
4. Ensure language sync is working

### Formatting issues

1. Verify locale mapping in `formatters.ts`
2. Check `Intl` API support on device
3. Test with different language selections

## Support

For issues or questions about translations:
1. Check this README
2. Review existing translations in `locales/` folder
3. Check console for i18n warnings
4. Review i18n logs (search for `[i18n]` or `[LanguageStore]`)

