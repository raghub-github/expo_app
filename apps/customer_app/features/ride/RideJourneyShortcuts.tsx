/**
 * Horizontal Recent rides + Favorite journeys rows (IRCTC-style tap-to-book).
 */
import { ScrollView, StyleSheet, TouchableOpacity, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { AppText } from "@/components/AppText";
import {
  placeCode,
  type RideJourney,
} from "@/store/recentLocationStore";

type Props = {
  recentJourneys: RideJourney[];
  favoriteJourneys: RideJourney[];
  onSelect: (journey: RideJourney) => void;
  onToggleFavorite: (journey: RideJourney) => void;
  isFavorite: (journey: RideJourney) => boolean;
  recentTitle?: string;
  favoriteTitle?: string;
  onClearRecent?: () => void;
  clearEnabled?: boolean;
};

function JourneyCard({
  journey,
  onSelect,
  onToggleFavorite,
  favorited,
  meta,
}: {
  journey: RideJourney;
  onSelect: () => void;
  onToggleFavorite: () => void;
  favorited: boolean;
  meta?: string;
}) {
  const fromCode = placeCode(journey.pickup?.primary ?? "");
  const toCode = placeCode(journey.drop?.primary ?? "");
  return (
    <TouchableOpacity style={styles.card} onPress={onSelect} activeOpacity={0.88}>
      <View style={styles.cardTop}>
        <View style={styles.codeCol}>
          <AppText style={styles.code}>{fromCode}</AppText>
          <AppText style={styles.city} numberOfLines={1}>
            {journey.pickup?.primary ?? "Pickup"}
          </AppText>
        </View>
        <Ionicons name="arrow-forward" size={14} color="#9CA3AF" style={styles.arrow} />
        <View style={styles.codeCol}>
          <AppText style={styles.code}>{toCode}</AppText>
          <AppText style={styles.city} numberOfLines={1}>
            {journey.drop?.primary ?? "Drop"}
          </AppText>
        </View>
        <TouchableOpacity onPress={onToggleFavorite} hitSlop={10} style={styles.heartBtn}>
          <Ionicons name={favorited ? "heart" : "heart-outline"} size={16} color={favorited ? "#E11D48" : "#9CA3AF"} />
        </TouchableOpacity>
      </View>
      {meta ? <AppText style={styles.meta}>{meta}</AppText> : null}
    </TouchableOpacity>
  );
}

export function RideJourneyShortcuts({
  recentJourneys,
  favoriteJourneys,
  onSelect,
  onToggleFavorite,
  isFavorite,
  recentTitle = "Recent rides",
  favoriteTitle = "Favorite journeys",
  onClearRecent,
  clearEnabled = true,
}: Props) {
  const recentOnly = recentJourneys.filter((journey) => !isFavorite(journey));
  if (recentOnly.length === 0 && favoriteJourneys.length === 0) return null;

  return (
    <View style={styles.wrap}>
      {recentOnly.length > 0 ? (
        <View style={styles.section}>
          <View style={styles.headingRow}>
            <AppText style={styles.heading}>{recentTitle}</AppText>
            {onClearRecent ? (
              <TouchableOpacity
                onPress={onClearRecent}
                disabled={!clearEnabled}
                hitSlop={8}
                activeOpacity={0.7}
                accessibilityRole="button"
                accessibilityState={{ disabled: !clearEnabled }}
                accessibilityLabel="Clear recent rides"
              >
                <AppText style={[styles.clearText, !clearEnabled && styles.clearTextDisabled]}>
                  Clear
                </AppText>
              </TouchableOpacity>
            ) : null}
          </View>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row}>
            {recentOnly.map((journey, index) => (
              <JourneyCard
                key={`r-${index}-${journey.savedAt}`}
                journey={journey}
                favorited={false}
                onSelect={() => onSelect(journey)}
                onToggleFavorite={() => onToggleFavorite(journey)}
                meta="Tap to book"
              />
            ))}
          </ScrollView>
        </View>
      ) : null}

      {favoriteJourneys.length > 0 ? (
        <View style={styles.section}>
          <AppText style={styles.heading}>{favoriteTitle}</AppText>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row}>
            {favoriteJourneys.map((journey, index) => (
              <JourneyCard
                key={`f-${index}-${journey.savedAt}`}
                journey={journey}
                favorited
                onSelect={() => onSelect(journey)}
                onToggleFavorite={() => onToggleFavorite(journey)}
              />
            ))}
          </ScrollView>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    marginTop: 4,
    marginBottom: 8,
    gap: 16,
  },
  section: {
    gap: 10,
  },
  headingRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    minHeight: 22,
  },
  heading: {
    fontSize: 15,
    fontWeight: "800",
    color: "#111827",
  },
  clearText: {
    fontSize: 13,
    fontWeight: "700",
    color: "#059669",
  },
  clearTextDisabled: {
    color: "#D1D5DB",
  },
  row: {
    gap: 10,
    paddingRight: 8,
  },
  card: {
    width: 248,
    backgroundColor: "#FFFFFF",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    paddingHorizontal: 12,
    paddingVertical: 12,
  },
  cardTop: {
    flexDirection: "row",
    alignItems: "flex-start",
  },
  codeCol: {
    flex: 1,
    minWidth: 0,
  },
  code: {
    fontSize: 15,
    fontWeight: "800",
    color: "#111827",
  },
  city: {
    marginTop: 2,
    fontSize: 11,
    color: "#9CA3AF",
    textTransform: "uppercase",
  },
  arrow: {
    marginTop: 4,
    marginHorizontal: 6,
  },
  heartBtn: {
    paddingLeft: 4,
    paddingTop: 2,
  },
  meta: {
    marginTop: 10,
    fontSize: 12,
    fontWeight: "700",
    color: "#111827",
  },
});
