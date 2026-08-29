import { useState } from "react";
import { Pressable, ScrollView, StyleSheet, View } from "react-native";
import { AuthProxyImage } from "@/components/AuthProxyImage";
import { FeedbackImageViewerModal } from "@/components/FeedbackImageViewerModal";
import { GatiMitraMerchant } from "@/constants/theme";

export function FeedbackImageRow({
  urls,
  token,
  variant = "row",
}: {
  urls?: string[] | null;
  token?: string | null;
  variant?: "row" | "hero";
}) {
  const list = (urls ?? []).map((u) => String(u).trim()).filter(Boolean).slice(0, 8);
  const [viewerIndex, setViewerIndex] = useState<number | null>(null);
  if (list.length === 0) return null;

  const openAt = (index: number) => setViewerIndex(index);

  const viewer = (
    <FeedbackImageViewerModal
      visible={viewerIndex != null}
      urls={list}
      initialIndex={viewerIndex ?? 0}
      token={token}
      onClose={() => setViewerIndex(null)}
    />
  );

  if (variant === "hero") {
    const [first, ...rest] = list;
    return (
      <View style={styles.heroWrap}>
        <Pressable onPress={() => openAt(0)} accessibilityRole="button" accessibilityLabel="View photo">
          <AuthProxyImage uri={first} token={token} style={styles.hero} resizeMode="cover" />
        </Pressable>
        {rest.length > 0 ? (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.row}
          >
            {rest.map((uri, i) => (
              <Pressable
                key={uri}
                onPress={() => openAt(i + 1)}
                style={styles.thumbWrap}
                accessibilityRole="button"
                accessibilityLabel={`View photo ${i + 2}`}
              >
                <AuthProxyImage uri={uri} token={token} style={styles.thumb} resizeMode="cover" />
              </Pressable>
            ))}
          </ScrollView>
        ) : null}
        {viewer}
      </View>
    );
  }

  return (
    <View>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.row}
      >
        {list.map((uri, i) => (
          <Pressable
            key={uri}
            onPress={() => openAt(i)}
            style={styles.thumbWrap}
            accessibilityRole="button"
            accessibilityLabel={`View photo ${i + 1}`}
          >
            <AuthProxyImage uri={uri} token={token} style={styles.thumb} resizeMode="cover" />
          </Pressable>
        ))}
      </ScrollView>
      {viewer}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    gap: 8,
    paddingVertical: 6,
  },
  heroWrap: {
    gap: 8,
    marginTop: 4,
  },
  hero: {
    width: "100%",
    height: 180,
    borderRadius: 12,
    backgroundColor: GatiMitraMerchant.surfaceSubtle,
  },
  thumbWrap: {
    width: 72,
    height: 72,
    borderRadius: 10,
    overflow: "hidden",
    backgroundColor: GatiMitraMerchant.surfaceSubtle,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: GatiMitraMerchant.border,
  },
  thumb: {
    width: 72,
    height: 72,
    borderRadius: 10,
  },
});
