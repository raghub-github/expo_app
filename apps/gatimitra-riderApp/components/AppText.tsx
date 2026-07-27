/**
 * App-wide typography — Lora for alphabetic text, Poppins for numeric text (₹, digits, %).
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

type Props = TextProps & {
  bold?: boolean;
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

export function AppText({ style, bold, children, ...rest }: Props) {
  const Host = getTextHost();
  const flat = StyleSheet.flatten(style) ?? {};
  const existingFamily = (flat as TextStyle).fontFamily;

  if (isNonBrandFontFamily(existingFamily)) {
    return (
      <Host style={style} {...rest}>
        {children}
      </Host>
    );
  }

  const isBold = bold ?? isBoldFontWeight(flat.fontWeight);
  const { fontWeight: _fw, fontFamily: _ff, fontStyle: _fs, ...segmentBase } = flat as TextStyle;

  if (hasComplexChildren(children)) {
    return (
      <Host
        style={[segmentBase, { fontFamily: segmentFontFamily("alpha", isBold) }]}
        {...rest}
      >
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
      <Host
        style={[segmentBase, { fontFamily: segmentFontFamily("alpha", isBold) }]}
        {...rest}
      >
        {plain}
      </Host>
    );
  }

  if (segments.length <= 1 && segments[0]?.kind === "numeric") {
    return (
      <Host
        style={[segmentBase, { fontFamily: segmentFontFamily("numeric", isBold) }]}
        {...rest}
      >
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
            { fontFamily: segmentFontFamily(seg.kind, isBold) },
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
