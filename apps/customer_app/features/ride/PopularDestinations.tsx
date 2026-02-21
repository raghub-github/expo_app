/**
 * Horizontal scroll of popular destination cards – city-based.
 * Place image area (gradient) + icon, smooth scroll, tap feedback.
 */

import { useState, useEffect } from "react";
import {
  View,
  Text,
  ScrollView,
  Pressable,
  StyleSheet,
  Dimensions,
  ActivityIndicator,
} from "react-native";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
} from "react-native-reanimated";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import { GatiMitraColors } from "@/constants/gatimitra";
import { getNearbyPlaces, type NearbyPlace } from "@/services/location.service";

const PAD = 18;
const CARD_WIDTH = 172;
const CARD_HEIGHT = 112;
const GAP = 12;
const SPRING = { damping: 18, stiffness: 260 };

const CARD_GRADIENTS: Record<string, readonly [string, string]> = {
  airport: ["#0ea5e9", "#0284c7"],
  railway: ["#64748b", "#475569"],
  bus: ["#059669", "#047857"],
  city: ["#f97316", "#ea580c"],
  place: ["#6366f1", "#4f46e5"],
};

type PopularDestinationsProps = {
  coords?: { latitude: number; longitude: number } | null;
  onDestinationPress?: (place: NearbyPlace) => void;
};

function PlaceCard({
  place,
  onPress,
}: {
  place: NearbyPlace;
  onPress: () => void;
}) {
  const scale = useSharedValue(1);
  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  return (
    <Animated.View style={animatedStyle}>
      <Pressable
        onPress={onPress}
        onPressIn={() => {
          scale.value = withSpring(0.97, SPRING);
        }}
        onPressOut={() => {
          scale.value = withSpring(1, SPRING);
        }}
        style={styles.cardWrap}
      >
        <LinearGradient
          colors={CARD_GRADIENTS[place.type] ?? CARD_GRADIENTS.place}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.card}
        >
          {/* Place "image" area – gradient with icon */}
          <View style={styles.imageArea}>
            <View style={styles.iconOverlay}>
              <Ionicons
                name={place.icon as keyof typeof Ionicons.glyphMap}
                size={32}
                color="rgba(255,255,255,0.95)"
              />
            </View>
          </View>
          <View style={styles.labelWrap}>
            <Text style={styles.label} numberOfLines={2}>
              {place.name}
            </Text>
          </View>
        </LinearGradient>
      </Pressable>
    </Animated.View>
  );
}

export function PopularDestinations({ coords, onDestinationPress }: PopularDestinationsProps) {
  const [places, setPlaces] = useState<NearbyPlace[]>([]);
  const [loading, setLoading] = useState(!!coords);

  useEffect(() => {
    if (!coords?.latitude || !coords?.longitude) {
      setPlaces([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    getNearbyPlaces(coords.longitude, coords.latitude)
      .then(setPlaces)
      .catch(() => setPlaces([]))
      .finally(() => setLoading(false));
  }, [coords?.latitude, coords?.longitude]);

  if (loading) {
    return (
      <View style={styles.wrap}>
        <Text style={styles.sectionTitle}>Popular places nearby</Text>
        <Text style={styles.sectionSubtitle}>City-based popular destinations</Text>
        <View style={styles.loadingWrap}>
          <ActivityIndicator size="small" color={GatiMitraColors.emerald} />
        </View>
      </View>
    );
  }

  if (places.length === 0) return null;

  return (
    <View style={styles.wrap}>
      <Text style={styles.sectionTitle}>Popular places nearby</Text>
      <Text style={styles.sectionSubtitle}>City-based popular destinations</Text>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        decelerationRate="fast"
        snapToInterval={CARD_WIDTH + GAP}
        snapToAlignment="start"
        contentContainerStyle={styles.scrollContent}
      >
        {places.map((d) => (
          <PlaceCard
            key={d.id}
            place={d}
            onPress={() => onDestinationPress?.(d)}
          />
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginBottom: 24 },
  sectionTitle: {
    fontSize: 18,
    fontWeight: "800",
    color: GatiMitraColors.textPrimary,
    paddingHorizontal: PAD,
    marginBottom: 2,
  },
  sectionSubtitle: {
    fontSize: 13,
    color: GatiMitraColors.textSecondary,
    paddingHorizontal: PAD,
    marginBottom: 14,
  },
  loadingWrap: { paddingVertical: 20, paddingHorizontal: PAD },
  scrollContent: {
    paddingHorizontal: PAD,
    paddingBottom: 8,
  },
  cardWrap: { width: CARD_WIDTH, marginRight: GAP },
  card: {
    width: CARD_WIDTH,
    height: CARD_HEIGHT,
    borderRadius: 18,
    overflow: "hidden",
    justifyContent: "flex-end",
    ...GatiMitraColors.elevationShadow,
  },
  imageArea: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    height: CARD_HEIGHT * 0.55,
    backgroundColor: "rgba(0,0,0,0.08)",
  },
  iconOverlay: {
    position: "absolute",
    top: 14,
    right: 14,
    width: 48,
    height: 48,
    borderRadius: 14,
    backgroundColor: "rgba(0,0,0,0.25)",
    alignItems: "center",
    justifyContent: "center",
  },
  labelWrap: {
    padding: 14,
    backgroundColor: "rgba(0,0,0,0.4)",
  },
  label: {
    fontSize: 14,
    fontWeight: "700",
    color: "#fff",
  },
});
