/**
 * Soft typography defaults for rider app (Lora).
 * Screen `Text` imports are rewritten to `AppText` via babel-plugin-app-text.
 */
export function installGlobalTypography(): void {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const RN = require("react-native") as {
      Text?: { defaultProps?: Record<string, unknown>; __riderTypographyPatched?: boolean };
      TextInput?: { defaultProps?: Record<string, unknown>; __riderTypographyPatched?: boolean };
    };

    const Text = RN.Text;
    if (Text && !Text.__riderTypographyPatched) {
      const prev = Text.defaultProps ?? {};
      const prevStyle = prev.style;
      Text.defaultProps = {
        ...prev,
        style: [
          { fontFamily: "Lora_400Regular" },
          ...(Array.isArray(prevStyle) ? prevStyle : prevStyle != null ? [prevStyle] : []),
        ],
      };
      Text.__riderTypographyPatched = true;
    }

    const TI = RN.TextInput;
    if (TI && !TI.__riderTypographyPatched) {
      const prev = TI.defaultProps ?? {};
      const prevStyle = prev.style;
      TI.defaultProps = {
        ...prev,
        style: [
          // Bold face for filled values — weight alone is ignored when a Regular family is set.
          { fontFamily: "Lora_700Bold", fontWeight: "700" },
          ...(Array.isArray(prevStyle) ? prevStyle : prevStyle != null ? [prevStyle] : []),
        ],
      };
      TI.__riderTypographyPatched = true;
    }
  } catch {
    /* never block app boot on typography defaults */
  }
}
