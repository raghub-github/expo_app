/**
 * Shared ESLint base. Workspaces extend this and add framework-specific
 * presets on top (e.g. `next/core-web-vitals` for Next.js apps,
 * `expo` for Expo apps). The base intentionally stays small and uncontroversial
 * so adopting it doesn't generate noise across existing code.
 */
module.exports = {
  root: false,
  env: { es2022: true, node: true, browser: true },
  parser: "@typescript-eslint/parser",
  parserOptions: {
    ecmaVersion: 2022,
    sourceType: "module",
  },
  plugins: ["@typescript-eslint"],
  extends: ["eslint:recommended", "plugin:@typescript-eslint/recommended"],
  rules: {
    "@typescript-eslint/no-unused-vars": [
      "warn",
      { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
    ],
    "@typescript-eslint/no-explicit-any": "off",
    "no-console": "off",
    "prefer-const": "warn",
  },
  ignorePatterns: [
    "node_modules/**",
    "dist/**",
    "build/**",
    ".next/**",
    ".expo/**",
    "ios/**",
    "android/**",
    "coverage/**",
  ],
};
