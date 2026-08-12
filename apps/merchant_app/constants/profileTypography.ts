import { MerchantFonts } from "@/constants/typography";
import { GatiMitraMerchant } from "@/constants/theme";
import type { TextStyle } from "react-native";

/** Lora — profile section / screen headings (use with AppText variant="brand"). */
export const profileHeadingText: TextStyle = {
  fontFamily: MerchantFonts.loraBold,
  fontWeight: "700",
  color: GatiMitraMerchant.textPrimary,
};

/** Poppins body defaults are applied via TypographyVariantProvider in profile/_layout. */
export const profileSectionTitle: TextStyle = {
  ...profileHeadingText,
  fontSize: 16,
  marginBottom: 12,
};

export const profileScreenTitle: TextStyle = {
  ...profileHeadingText,
  fontSize: 18,
};
