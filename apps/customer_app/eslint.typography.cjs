/**
 * Typography guard for customer app.
 *
 * Prefer AppText (Lora + Poppins) over RN Text. Full tree check:
 *   npm run lint:typography
 *
 * When ESLint is adopted for this package, enable:
 *   no-restricted-imports against importing Text from react-native
 *   (allowlist: CheckoutText, MarkdownView, login monospace, location-map coords).
 */

/** @type {import('eslint').Linter.Config[]} */
module.exports = [
  {
    files: ["app/**/*.{ts,tsx}", "components/**/*.{ts,tsx}", "features/**/*.{ts,tsx}"],
    ignores: [
      "components/checkout/CheckoutText.tsx",
      "components/AppText.tsx",
      "components/store/StoreText.tsx",
      "components/MarkdownView.tsx",
      "app/(auth)/login.tsx",
      "app/location-map.tsx",
    ],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: [
            {
              name: "react-native",
              importNames: ["Text"],
              message:
                "Use AppText from @/components/AppText (Lora for text, Poppins for numbers) instead of RN Text.",
            },
          ],
        },
      ],
    },
  },
];
