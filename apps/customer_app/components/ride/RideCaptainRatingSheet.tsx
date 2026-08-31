/**
 * Bottom sheet for rating a ride captain after trip completion.
 * Stars first; captain name + photo appear only after a star is selected.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { AppText } from "@/components/AppText";

import {
  View,
  Pressable,
  StyleSheet,
  TextInput,
  ActivityIndicator,
  ScrollView,
  Image,
  Modal,
  Platform,
  Keyboard,
  Dimensions,
  useWindowDimensions,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { GatiMitraColors } from "@/constants/gatimitra";
import {
  RIDE_CAPTAIN_RATING_TAGS,
  defaultTagsForRating,
} from "@/lib/post-delivery-rating-tags";

const MINT_DARK = GatiMitraColors.deepMintStart;
const TEXT = GatiMitraColors.textPrimaryNew;
const MUTED = GatiMitraColors.textSecondary;

function headlineForRating(rating: number): string {
  if (rating >= 5) return "Glad you had a great ride";
  if (rating >= 4) return "Thanks for your feedback";
  if (rating >= 3) return "Tell us what could be better";
  return "We're sorry the ride missed the mark";
}

export type RideCaptainRatingSubmitPayload = {
  deliveryRating: number;
  riderReviewTags: string[];
  riderReviewText: string | null;
};

type Props = {
  visible: boolean;
  captainName: string;
  captainPhotoUri?: string | null;
  initialRating?: number;
  initialTags?: string[];
  initialReviewText?: string;
  submitting?: boolean;
  onClose: () => void;
  onSubmit: (payload: RideCaptainRatingSubmitPayload) => void;
};

export function RideCaptainRatingSheet({
  visible,
  captainName,
  captainPhotoUri,
  initialRating = 0,
  initialTags,
  initialReviewText = "",
  submitting = false,
  onClose,
  onSubmit,
}: Props) {
  const insets = useSafeAreaInsets();
  const { height: winH } = useWindowDimensions();
  const [rating, setRating] = useState(0);
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [reviewText, setReviewText] = useState("");
  const [keyboardInset, setKeyboardInset] = useState(0);
  const openedRef = useRef(false);

  useEffect(() => {
    if (!visible) {
      openedRef.current = false;
      setKeyboardInset(0);
      return;
    }
    if (openedRef.current) return;
    openedRef.current = true;
    const nextRating = initialRating > 0 ? initialRating : 0;
    setRating(nextRating);
    setSelectedTags(
      initialTags && initialTags.length > 0
        ? [...initialTags]
        : nextRating > 0
          ? defaultTagsForRating(RIDE_CAPTAIN_RATING_TAGS, nextRating)
          : []
    );
    setReviewText(initialReviewText);
  }, [visible]);

  useEffect(() => {
    if (!visible) {
      setKeyboardInset(0);
      return;
    }
    const showEvt = Platform.OS === "ios" ? "keyboardWillShow" : "keyboardDidShow";
    const hideEvt = Platform.OS === "ios" ? "keyboardWillHide" : "keyboardDidHide";
    const lockedScreenH = Dimensions.get("screen").height;
    const showSub = Keyboard.addListener(showEvt, (e) => {
      const kbH = Math.max(0, e.endCoordinates.height);
      const windowH = Dimensions.get("window").height;
      const alreadyResized = lockedScreenH - windowH >= kbH * 0.55;
      setKeyboardInset(alreadyResized ? 0 : kbH);
    });
    const hideSub = Keyboard.addListener(hideEvt, () => setKeyboardInset(0));
    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, [visible]);

  const headline = useMemo(() => headlineForRating(rating), [rating]);
  const starSelected = rating >= 1;
  const canSubmit = starSelected && !submitting;
  const sheetMaxH = Math.round(winH * 0.88) - keyboardInset;

  const handleRatingChange = (stars: number) => {
    setRating(stars);
    setSelectedTags(defaultTagsForRating(RIDE_CAPTAIN_RATING_TAGS, stars));
  };

  const toggleTag = (tag: string) => {
    setSelectedTags((prev) =>
      prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]
    );
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
      statusBarTranslucent
      presentationStyle="overFullScreen"
    >
      <View style={styles.modalRoot}>
        <Pressable style={styles.backdrop} onPress={onClose} accessibilityRole="button" />
        <View
          style={[
            styles.sheet,
            {
              maxHeight: sheetMaxH,
              paddingBottom: keyboardInset > 0 ? 12 : Math.max(insets.bottom, 16),
              marginBottom: keyboardInset,
            },
          ]}
        >
          <View style={styles.headerRow}>
            <View style={styles.headerSide} />
            <AppText style={styles.sheetTitle}>Rate your captain</AppText>
            <Pressable onPress={onClose} hitSlop={8} style={styles.headerClose} accessibilityRole="button">
              <Ionicons name="close" size={22} color="#111827" />
            </Pressable>
          </View>

          <View style={styles.starsRow}>
            {[1, 2, 3, 4, 5].map((n) => (
              <Pressable key={n} onPress={() => handleRatingChange(n)} hitSlop={8} style={styles.starHit}>
                <Ionicons
                  name={n <= rating ? "star" : "star-outline"}
                  size={38}
                  color={n <= rating ? "#F59E0B" : "#D1D5DB"}
                />
              </Pressable>
            ))}
          </View>

          {!starSelected ? (
            <AppText style={styles.starHint}>Tap a star to rate this ride</AppText>
          ) : (
            <ScrollView
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
              nestedScrollEnabled
              style={styles.detailsScroll}
              contentContainerStyle={styles.detailsScrollContent}
            >
              <AppText style={styles.headline}>{headline}</AppText>
              <View style={styles.captainIdentity}>
                {captainPhotoUri ? (
                  <Image source={{ uri: captainPhotoUri }} style={styles.captainPhoto} />
                ) : (
                  <View style={styles.captainPhotoFallback}>
                    <Ionicons name="person" size={22} color="#6B7280" />
                  </View>
                )}
                <AppText style={styles.captainName}>{captainName}</AppText>
              </View>

              <AppText style={styles.prompt}>What stood out?</AppText>
              <View style={styles.tagsWrap}>
                {RIDE_CAPTAIN_RATING_TAGS.map((tag) => {
                  const active = selectedTags.includes(tag);
                  return (
                    <Pressable
                      key={tag}
                      style={[styles.tag, active && styles.tagActive]}
                      onPress={() => toggleTag(tag)}
                    >
                      <AppText style={[styles.tagText, active && styles.tagTextActive]}>{tag}</AppText>
                    </Pressable>
                  );
                })}
              </View>

              <AppText style={styles.noteLabel}>Write a review (optional)</AppText>
              <TextInput
                style={styles.noteInput}
                placeholder="Share your ride experience"
                placeholderTextColor="#9CA3AF"
                value={reviewText}
                onChangeText={setReviewText}
                multiline
                maxLength={500}
                textAlignVertical="top"
              />

              <Pressable
                style={[styles.submitBtn, !canSubmit && styles.submitBtnDisabled]}
                disabled={!canSubmit}
                onPress={() =>
                  onSubmit({
                    deliveryRating: rating,
                    riderReviewTags: selectedTags,
                    riderReviewText: reviewText.trim() || null,
                  })
                }
              >
                {submitting ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <AppText style={styles.submitText}>Submit rating</AppText>
                )}
              </Pressable>
            </ScrollView>
          )}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  modalRoot: {
    flex: 1,
    justifyContent: "flex-end",
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.5)",
  },
  sheet: {
    width: "100%",
    backgroundColor: "#fff",
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingTop: 4,
    ...(Platform.OS === "android" ? { elevation: 16 } : {}),
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 8,
    paddingTop: 4,
    minHeight: 48,
  },
  headerSide: {
    width: 40,
    height: 40,
  },
  headerClose: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#F3F4F6",
  },
  sheetTitle: {
    flex: 1,
    fontSize: 18,
    fontWeight: "800",
    color: TEXT,
    textAlign: "center",
  },
  starsRow: {
    flexDirection: "row",
    justifyContent: "center",
    gap: 10,
    marginTop: 8,
    marginBottom: 8,
  },
  starHit: {
    padding: 4,
  },
  starHint: {
    fontSize: 14,
    color: MUTED,
    textAlign: "center",
    marginTop: 4,
    marginBottom: 20,
    fontWeight: "500",
  },
  detailsScroll: {
    flexGrow: 0,
  },
  detailsScrollContent: {
    paddingBottom: 8,
  },
  headline: {
    fontSize: 18,
    fontWeight: "800",
    color: TEXT,
    textAlign: "center",
    paddingHorizontal: 20,
    marginTop: 8,
  },
  captainIdentity: {
    alignItems: "center",
    marginTop: 14,
    marginBottom: 18,
    gap: 8,
  },
  captainPhoto: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: "#E5E7EB",
  },
  captainPhotoFallback: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: "#F3F4F6",
    alignItems: "center",
    justifyContent: "center",
  },
  captainName: {
    fontSize: 15,
    color: TEXT,
    textAlign: "center",
    fontWeight: "700",
  },
  prompt: {
    fontSize: 15,
    fontWeight: "700",
    color: TEXT,
    paddingHorizontal: 20,
    marginBottom: 10,
  },
  tagsWrap: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
    paddingHorizontal: 20,
    marginBottom: 18,
  },
  tag: {
    borderWidth: 1,
    borderColor: GatiMitraColors.border,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    backgroundColor: "#fff",
  },
  tagActive: {
    borderColor: MINT_DARK,
    backgroundColor: "#ECFDF5",
  },
  tagText: { fontSize: 13, fontWeight: "600", color: TEXT },
  tagTextActive: { color: MINT_DARK },
  noteLabel: {
    fontSize: 14,
    fontWeight: "700",
    color: TEXT,
    paddingHorizontal: 20,
    marginBottom: 8,
  },
  noteInput: {
    marginHorizontal: 20,
    minHeight: 96,
    borderWidth: 1,
    borderColor: GatiMitraColors.border,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 14,
    color: TEXT,
    backgroundColor: "#FAFAFA",
    marginBottom: 20,
  },
  submitBtn: {
    marginHorizontal: 20,
    backgroundColor: MINT_DARK,
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: "center",
  },
  submitBtnDisabled: { opacity: 0.45 },
  submitText: { fontSize: 16, fontWeight: "700", color: "#fff" },
});
