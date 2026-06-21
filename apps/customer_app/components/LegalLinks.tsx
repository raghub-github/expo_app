/**
 * Reusable legal-link components for in-context disclosures throughout the
 * app — checkout footer, ride-cancellation modal, subscription page,
 * refund-claim sheet, safety SOS panel, etc.
 *
 * Two surfaces:
 *   <LegalFooter prefix="By placing this order you agree to" docIds={…} />
 *     One-line, muted, with each doc rendered as a tappable link.
 *   <LegalLink id="refund-cancellation-policy" />
 *     Bare inline link — drop anywhere you want a single doc reference.
 */

import { memo } from "react";
import { Text, View, StyleSheet, type TextStyle } from "react-native";
import { useRouter } from "expo-router";
import { LEGAL_DOC_BY_ID } from "@/lib/legal-registry";

const MUTED = "#6B7280";
const LINK = "#15803D";

type LegalLinkProps = {
  id: string;
  /** Override the displayed title (default: doc.title). */
  label?: string;
  /** Style merged into the link text. */
  style?: TextStyle;
};

export const LegalLink = memo(function LegalLink({ id, label, style }: LegalLinkProps) {
  const router = useRouter();
  const doc = LEGAL_DOC_BY_ID[id];
  const displayLabel = label ?? doc?.title ?? id;
  if (!doc) {
    // Render the label as plain text if the id is wrong so we never crash
    // a checkout flow because of a typo.
    return <Text style={[styles.link, style, { textDecorationLine: "none", color: MUTED }]}>{displayLabel}</Text>;
  }
  return (
    <Text
      style={[styles.link, style]}
      onPress={() => router.push(`/profile/legal/${doc.id}` as never)}
      accessibilityRole="link"
    >
      {displayLabel}
    </Text>
  );
});

type LegalFooterProps = {
  /** Lead text shown before the links, e.g. "By placing this order you agree to". */
  prefix: string;
  /** Doc ids to link, in order. */
  docIds: string[];
  /** Style merged into the wrapping <Text>. */
  style?: TextStyle;
  /** Tighter padding for sticky checkout footers. */
  compact?: boolean;
};

export const LegalFooter = memo(function LegalFooter({ prefix, docIds, style, compact = false }: LegalFooterProps) {
  return (
    <View style={[styles.footerWrap, compact && styles.footerWrapCompact]}>
      <Text style={[styles.footer, style]}>
        {prefix}{" "}
        {docIds.map((id, idx) => {
          const isLast = idx === docIds.length - 1;
          const isSecondLast = idx === docIds.length - 2;
          return (
            <Text key={id}>
              <LegalLink id={id} />
              {isSecondLast ? " and " : isLast ? "." : ", "}
            </Text>
          );
        })}
      </Text>
    </View>
  );
});

const styles = StyleSheet.create({
  link: {
    color: LINK,
    textDecorationLine: "underline",
    fontWeight: "500",
  },
  footerWrap: { paddingHorizontal: 16, paddingVertical: 10 },
  footerWrapCompact: { paddingHorizontal: 4, paddingVertical: 4 },
  footer: { fontSize: 11.5, color: MUTED, lineHeight: 17, textAlign: "center" },
});

export default LegalFooter;
