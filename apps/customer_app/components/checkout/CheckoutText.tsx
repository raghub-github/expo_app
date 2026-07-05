import React from "react";
import { Text, StyleSheet, type TextProps, type TextStyle } from "react-native";
import {
  isBoldFontWeight,
  segmentFontFamily,
  splitMixedTypography,
} from "@/lib/mixedTypography";

type Props = TextProps & {
  /** Override bold detection from style.fontWeight */
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

/** Checkout typography — Lora for alphabetic text, Poppins for numeric text. */
export function CheckoutText({ style, bold, children, ...rest }: Props) {
  const flat = StyleSheet.flatten(style) ?? {};
  const isBold = bold ?? isBoldFontWeight(flat.fontWeight);
  const { fontWeight: _fw, fontFamily: _ff, ...segmentBase } = flat as TextStyle;

  if (hasComplexChildren(children)) {
    return (
      <Text style={segmentBase} {...rest}>
        {children}
      </Text>
    );
  }

  const plain = childrenToPlainText(children);
  const segments = splitMixedTypography(plain);

  if (segments.length <= 1 && segments[0]?.kind === "alpha" && !/\d/.test(plain) && !plain.includes("₹")) {
    return (
      <Text
        style={[segmentBase, { fontFamily: segmentFontFamily("alpha", isBold) }]}
        {...rest}
      >
        {plain}
      </Text>
    );
  }

  if (segments.length <= 1 && segments[0]?.kind === "numeric") {
    return (
      <Text
        style={[segmentBase, { fontFamily: segmentFontFamily("numeric", isBold) }]}
        {...rest}
      >
        {plain}
      </Text>
    );
  }

  return (
    <Text style={segmentBase} {...rest}>
      {segments.map((seg, index) => (
        <Text
          key={`${index}-${seg.value.slice(0, 8)}`}
          style={{ fontFamily: segmentFontFamily(seg.kind, isBold) }}
        >
          {seg.value}
        </Text>
      ))}
    </Text>
  );
}
