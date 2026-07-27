/**
 * Soft typography defaults for merchant app.
 *
 * New Architecture / Expo SDK 54: `react-native`'s `Text` export is a getter-only
 * property — assigning `RN.Text = …` throws:
 *   "Cannot assign to property 'Text' which has only a getter"
 *
 * Screen `Text` imports are rewritten to `AppText` via babel-plugin-app-text
 * (Lora for letters, Poppins for digits). These defaultProps cover TextInput and
 * any remaining native Text hosts (e.g. navigation).
 */
export function installGlobalTypography(): void {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const RN = require("react-native") as {
      Text?: { defaultProps?: Record<string, unknown>; __merchantTypographyPatched?: boolean };
      TextInput?: { defaultProps?: Record<string, unknown>; __merchantTypographyPatched?: boolean };
    };

    const Text = RN.Text;
    if (Text && !Text.__merchantTypographyPatched) {
      const prev = Text.defaultProps ?? {};
      const prevStyle = prev.style;
      Text.defaultProps = {
        ...prev,
        style: [
          { fontFamily: "Lora_400Regular" },
          ...(Array.isArray(prevStyle) ? prevStyle : prevStyle != null ? [prevStyle] : []),
        ],
      };
      Text.__merchantTypographyPatched = true;
    }

    const TI = RN.TextInput;
    if (TI && !TI.__merchantTypographyPatched) {
      const prev = TI.defaultProps ?? {};
      const prevStyle = prev.style;
      TI.defaultProps = {
        ...prev,
        style: [
          { fontFamily: "Lora_400Regular" },
          ...(Array.isArray(prevStyle) ? prevStyle : prevStyle != null ? [prevStyle] : []),
        ],
      };
      TI.__merchantTypographyPatched = true;
    }
  } catch {
    /* never block app boot on typography defaults */
  }
}
