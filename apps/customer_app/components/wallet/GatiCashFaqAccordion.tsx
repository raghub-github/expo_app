import { useState } from "react";
import { AppText } from "@/components/AppText";

import { View, TouchableOpacity, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { ProfileTheme } from "@/constants/profileTheme";
import { GatiMitraColors } from "@/constants/gatimitra";
import type { GatiCashFaqBlock, GatiCashFaqItem } from "@/constants/gatiCashFaqs";

const { text: TEXT, muted: MUTED, border: BORDER } = ProfileTheme;
const ACCENT = GatiMitraColors.primaryMint;

function FaqAnswerBlocks({ blocks }: { blocks: GatiCashFaqBlock[] }) {
  return (
    <View style={styles.answerWrap}>
      {blocks.map((block, index) => {
        if (block.type === "text") {
          return (
            <AppText key={index} style={styles.answerText}>
              {block.text}
            </AppText>
          );
        }
        return (
          <View key={index} style={styles.bulletList}>
            {block.items.map((item) => (
              <View key={item} style={styles.bulletRow}>
                <AppText style={styles.bulletDot}>•</AppText>
                <AppText style={styles.bulletText}>{item}</AppText>
              </View>
            ))}
          </View>
        );
      })}
    </View>
  );
}

function FaqRow({ item, isLast }: { item: GatiCashFaqItem; isLast: boolean }) {
  const [open, setOpen] = useState(false);

  return (
    <View style={[styles.row, !isLast && styles.rowBorder]}>
      <TouchableOpacity
        style={styles.rowHeader}
        activeOpacity={0.75}
        onPress={() => setOpen((v) => !v)}
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
      >
        <AppText style={styles.question}>{item.question}</AppText>
        <Ionicons name={open ? "chevron-up" : "chevron-down"} size={18} color={MUTED} />
      </TouchableOpacity>
      {open ? <FaqAnswerBlocks blocks={item.blocks} /> : null}
    </View>
  );
}

export function GatiCashFaqAccordion({ items }: { items: GatiCashFaqItem[] }) {
  return (
    <View style={styles.card}>
      <View style={styles.cardTitleRow}>
        <View style={styles.accentBar} />
        <AppText style={styles.cardTitle}>GatiCash</AppText>
      </View>
      {items.map((item, index) => (
        <FaqRow key={item.id} item={item} isLast={index === items.length - 1} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: "#fff",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: BORDER,
    overflow: "hidden",
  },
  cardTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingTop: 18,
    paddingBottom: 14,
    gap: 8,
  },
  accentBar: {
    width: 3,
    height: 18,
    borderRadius: 2,
    backgroundColor: ACCENT,
  },
  cardTitle: {
    fontSize: 17,
    fontWeight: "800",
    color: TEXT,
  },
  row: {
    paddingHorizontal: 16,
  },
  rowBorder: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: BORDER,
  },
  rowHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    paddingVertical: 16,
  },
  question: {
    flex: 1,
    fontSize: 15,
    fontWeight: "600",
    color: TEXT,
    lineHeight: 21,
  },
  answerWrap: {
    paddingBottom: 16,
    gap: 8,
  },
  answerText: {
    fontSize: 14,
    color: MUTED,
    lineHeight: 21,
  },
  bulletList: {
    gap: 6,
    marginTop: 2,
  },
  bulletRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
    paddingLeft: 4,
  },
  bulletDot: {
    fontSize: 14,
    lineHeight: 21,
    color: MUTED,
  },
  bulletText: {
    flex: 1,
    fontSize: 14,
    color: MUTED,
    lineHeight: 21,
  },
});
