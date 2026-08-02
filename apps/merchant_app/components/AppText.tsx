/**
 * App-wide typography — Lora for alphabetic text, Poppins for numeric text (₹, digits, %).
 * Prefer this over React Native `Text` for mixed letter/digit content.
 * Babel rewrites `import { Text } from "react-native"` to this component.
 */
import React from "react";
import { StyleSheet, type TextProps, type TextStyle } from "react-native";
import {
  isBoldFontWeight,
  isNonBrandFontFamily,
  segmentFontFamily,
  splitMixedTypography,
} from "@/lib/mixedTypography";
import { getTextHost } from "@/lib/textHost";
import { useTypographyVariant } from "@/lib/typographyVariant";
import { MerchantFonts } from "@/constants/typography";

type Props = TextProps & {
  /** Override bold detection from style.fontWeight */
  bold?: boolean;
  /** Force Poppins for letters (incoming sheet). Overrides context when set. */
  variant?: "brand" | "sans";
};

function hasComplexChildren(children: React.ReactNode): boolean {
  if (children == null || typeof children === "boolean") return false;
  if (typeof children === "string" || typeof children === "number") return false;
  if (Array.isArray(children)) {
    return children.some((child) => hasComplexChildren(child));
  }
  return React.isValidElement(children);
}

function childrenToPlainText(children: React.ReactNode): string {
  if (children == null || typeof children === "boolean") return "";
  if (typeof children === "string") return children;
  if (typeof children === "number") return String(children);
  if (Array.isArray(children)) return children.map(childrenToPlainText).join("");
  return "";
}

/** Lora for letters, Poppins for digits / ₹ / % — or all-Poppins when variant=sans. */
export function AppText({ style, bold, variant: variantProp, children, ...rest }: Props) {
  const Host = getTextHost();
  const ctxVariant = useTypographyVariant();
  const variant = variantProp ?? ctxVariant;
  const flat = StyleSheet.flatten(style) ?? {};
  const existingFamily = (flat as TextStyle).fontFamily;

  // Preserve monospace / custom faces (e.g. FormattedOrderId).
  if (isNonBrandFontFamily(existingFamily)) {
    return (
      <Host style={style} {...rest}>
        {children}
      </Host>
    );
  }

  const isBold = bold ?? isBoldFontWeight(flat.fontWeight);
  // Android drops custom fonts when fontWeight doesn't match the font file —
  // always pick the concrete face and strip fontWeight.
  const { fontWeight: _fw, fontFamily: _ff, fontStyle: _fs, ...segmentBase } = flat as TextStyle;

  const alphaFamily =
    variant === "sans"
      ? isBold
        ? MerchantFonts.poppinsBold
        : MerchantFonts.poppinsSemiBold
      : segmentFontFamily("alpha", isBold);
  const numericFamily = segmentFontFamily("numeric", isBold);

  if (hasComplexChildren(children)) {
    return (
      <Host style={[segmentBase, { fontFamily: alphaFamily }]} {...rest}>
        {children}
      </Host>
    );
  }

  const plain = childrenToPlainText(children);
  const segments = splitMixedTypography(plain);

  if (
    segments.length <= 1 &&
    segments[0]?.kind === "alpha" &&
    !/\d/.test(plain) &&
    !plain.includes("₹")
  ) {
    return (
      <Host style={[segmentBase, { fontFamily: alphaFamily }]} {...rest}>
        {plain}
      </Host>
    );
  }

  if (segments.length <= 1 && segments[0]?.kind === "numeric") {
    return (
      <Host style={[segmentBase, { fontFamily: numericFamily }]} {...rest}>
        {plain}
      </Host>
    );
  }

  const inheritedColor = segmentBase.color;
  return (
    <Host style={segmentBase} {...rest}>
      {segments.map((seg, index) => (
        <Host
          key={`${index}-${seg.value.slice(0, 8)}`}
          style={[
            {
              fontFamily: seg.kind === "numeric" ? numericFamily : alphaFamily,
            },
            inheritedColor != null ? { color: inheritedColor } : null,
          ]}
        >
          {seg.value}
        </Host>
      ))}
    </Host>
  );
}

export default AppText;
