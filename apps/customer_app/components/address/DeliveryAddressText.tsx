/**
 * Renders a delivery address with the shared 45 / 45 / 35 character wrap rules.
 * Expands vertically; never relies on a fixed-height container.
 */

import { StyleSheet, type StyleProp, type TextStyle } from "react-native";
import { AppText } from "@/components/AppText";
import { CheckoutText } from "@/components/checkout/CheckoutText";
import { formatDeliveryAddressLines } from "@/lib/formatDeliveryAddressLines";
import { GatiMitraColors } from "@/constants/gatimitra";

type Props = {
  address: string | null | undefined;
  style?: StyleProp<TextStyle>;
  /** Use CheckoutText (serif-safe checkout chrome) instead of AppText. */
  variant?: "app" | "checkout";
  /** Fallback when address is empty. */
  emptyLabel?: string;
};

export function DeliveryAddressText({
  address,
  style,
  variant = "app",
  emptyLabel = "Add a delivery address",
}: Props) {
  const lines = formatDeliveryAddressLines(address);
  const body = lines.length > 0 ? lines.join("\n") : emptyLabel;

  if (variant === "checkout") {
    return (
      <CheckoutText style={[styles.base, styles.checkout, style]}>
        {body}
      </CheckoutText>
    );
  }

  return <AppText style={[styles.base, style]}>{body}</AppText>;
}

const styles = StyleSheet.create({
  base: {
    flexShrink: 1,
    minWidth: 0,
    width: "100%",
    fontSize: 12,
    lineHeight: 17,
    color: GatiMitraColors.textSecondary,
  },
  checkout: {
    marginTop: 2,
  },
});
