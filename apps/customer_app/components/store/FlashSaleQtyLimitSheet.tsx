/**
 * Flash Sale qty-cap sheet — root-hosted overlay (no RN Modal).
 * Absolute overlay avoids Android elevated Continue-dock painting over footer CTAs.
 */

import { useEffect, useState } from "react";
import { View, Pressable, StyleSheet, Text, TouchableOpacity } from "react-native";
import { Image } from "expo-image";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { AppText } from "@/components/AppText";
import { DietIndicator } from "@/components/store/DietIndicator";
import { flashSaleItemQtyLimitMessage, formatOfferRupee } from "@/lib/itemOfferDisplay";
import type { ItemDiet } from "@/lib/itemDiet";
import { StoreFonts } from "@/constants/storeTypography";
import { StoreTheme } from "@/constants/storeTheme";
import { GatiMitraColors } from "@/constants/gatimitra";

const CTA_HEIGHT = 56;
const STEPPER_WIDTH = 132;
const ADD_GREEN = "#137243";
const QTY_FILL = "#E8F5EE";
const THUMB = 48;
const RIPPLE_GREEN = "rgba(19, 114, 67, 0.18)";

export type FlashSaleQtyLimitSheetProps = {
  visible: boolean;
  maxFlashQuantity: number;
  itemName: string;
  itemSubtitle?: string | null;
  imageUri?: string | null;
  diet: ItemDiet;
  quantity: number;
  /** Payable line total (flash split already applied). */
  lineTotal: number;
  onGotIt: () => void;
  onWantMore: () => void;
  onIncrement: () => void;
  onDecrement: () => void;
  onClose: () => void;
};

export function FlashSaleQtyLimitSheet({
  visible,
  maxFlashQuantity,
  itemName,
  itemSubtitle,
  imageUri,
  diet,
  quantity,
  lineTotal,
  onGotIt,
  onWantMore,
  onIncrement,
  onDecrement,
  onClose,
}: FlashSaleQtyLimitSheetProps) {
  const insets = useSafeAreaInsets();
  const [wantMoreMode, setWantMoreMode] = useState(false);
  const [thumbFailed, setThumbFailed] = useState(false);

  useEffect(() => {
    if (!visible) {
      setWantMoreMode(false);
      setThumbFailed(false);
    }
  }, [visible]);

  if (!visible) return null;

  const showThumb = !!imageUri?.trim() && !thumbFailed;
  const payableTotal = Math.max(0, Math.round(lineTotal));

  const handleWantMore = () => {
    if (wantMoreMode) return;
    setWantMoreMode(true);
    onWantMore();
  };

  return (
    <View style={styles.overlay} pointerEvents="auto" collapsable={false}>
      <Pressable style={styles.backdrop} onPress={onClose} accessibilityRole="button" />

      <View style={styles.sheetWrap} collapsable={false}>
        <TouchableOpacity
          style={styles.closeBtn}
          onPress={onClose}
          hitSlop={12}
          activeOpacity={0.85}
          accessibilityRole="button"
          accessibilityLabel="Close"
        >
          <Ionicons name="close" size={22} color="#fff" />
        </TouchableOpacity>

        <View style={styles.sheet} collapsable={false}>
          <View style={styles.handle} />

          <View style={styles.header}>
            <View style={styles.headerTopRow}>
              <View style={styles.headerImageWrap}>
                {showThumb ? (
                  <Image
                    source={{ uri: imageUri! }}
                    style={styles.headerImage}
                    contentFit="cover"
                    cachePolicy="memory-disk"
                    transition={0}
                    onError={() => setThumbFailed(true)}
                  />
                ) : (
                  <View style={styles.headerImagePlaceholder}>
                    <DietIndicator type={diet} />
                  </View>
                )}
                {showThumb ? (
                  <View style={styles.dietOnThumb}>
                    <DietIndicator type={diet} />
                  </View>
                ) : null}
              </View>

              <View style={styles.headerTitleCol}>
                <AppText style={styles.headerName} numberOfLines={2}>
                  {itemName}
                </AppText>
                {itemSubtitle?.trim() ? (
                  <AppText style={styles.headerPortion} numberOfLines={2}>
                    {itemSubtitle.trim()}
                  </AppText>
                ) : (
                  <View style={styles.flashPill}>
                    <Ionicons name="flash" size={11} color="#0369A1" />
                    <AppText style={styles.flashPillText}>Flash Sale</AppText>
                  </View>
                )}
              </View>
            </View>
          </View>

          <View style={styles.body}>
            <View style={styles.iconBadge}>
              <Ionicons name="flash" size={22} color="#0284C7" />
            </View>
            <AppText style={styles.title}>Flash Sale limit</AppText>
            <AppText style={styles.message}>{flashSaleItemQtyLimitMessage(maxFlashQuantity)}</AppText>
            <AppText style={styles.hint}>
              Extra units after this are charged at the regular item price.
            </AppText>
          </View>

          <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, 16) }]} collapsable={false}>
            {wantMoreMode ? (
              <View style={styles.confirmRow}>
                <View style={styles.stepper}>
                  <Pressable
                    onPress={onDecrement}
                    disabled={quantity <= 1}
                    android_ripple={{ color: RIPPLE_GREEN, borderless: true, radius: 18 }}
                    style={({ pressed }) => [
                      styles.stepperSide,
                      pressed && quantity > 1 && styles.pressedIn,
                    ]}
                    accessibilityRole="button"
                    accessibilityLabel="Decrease quantity"
                    hitSlop={6}
                  >
                    <Text style={[styles.stepperGlyph, quantity <= 1 && styles.stepperGlyphDisabled]}>
                      −
                    </Text>
                  </Pressable>
                  <Text style={styles.stepperQuantity}>{quantity}</Text>
                  <Pressable
                    onPress={onIncrement}
                    android_ripple={{ color: RIPPLE_GREEN, borderless: true, radius: 18 }}
                    style={({ pressed }) => [styles.stepperSide, pressed && styles.pressedIn]}
                    accessibilityRole="button"
                    accessibilityLabel="Increase quantity"
                    hitSlop={6}
                  >
                    <Text style={styles.stepperGlyph}>+</Text>
                  </Pressable>
                </View>
                <TouchableOpacity
                  onPress={onGotIt}
                  activeOpacity={0.85}
                  style={styles.addItemBtn}
                  accessibilityRole="button"
                  accessibilityLabel={`Add item ${formatOfferRupee(payableTotal)}`}
                >
                  <Text style={styles.addItemText}>
                    Add item {formatOfferRupee(payableTotal)}
                  </Text>
                </TouchableOpacity>
              </View>
            ) : (
              <>
                <TouchableOpacity
                  onPress={onGotIt}
                  activeOpacity={0.85}
                  style={styles.gotItBtn}
                  accessibilityRole="button"
                  accessibilityLabel="Got it"
                >
                  <Text style={styles.gotItTitle}>Got it</Text>
                  <Text style={styles.gotItSub}>Stay at {maxFlashQuantity}</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={handleWantMore}
                  activeOpacity={0.85}
                  style={styles.wantMoreBtn}
                  accessibilityRole="button"
                  accessibilityLabel="Want more"
                >
                  <Ionicons name="add" size={18} color={ADD_GREEN} />
                  <Text style={styles.wantMoreText}>Want more</Text>
                </TouchableOpacity>
              </>
            )}
          </View>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: "flex-end",
    zIndex: 1,
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.55)",
  },
  sheetWrap: {
    width: "100%",
    alignItems: "center",
  },
  closeBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "rgba(0,0,0,0.78)",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 10,
  },
  sheet: {
    width: "100%",
    backgroundColor: "#FFFFFF",
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
  },
  handle: {
    alignSelf: "center",
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: "#CBD5E1",
    marginTop: 8,
    marginBottom: 4,
  },
  header: {
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: StoreTheme.border,
    backgroundColor: "#FFFFFF",
  },
  headerTopRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
  },
  headerImageWrap: {
    width: THUMB,
    height: THUMB,
    borderRadius: 10,
    overflow: "hidden",
    backgroundColor: "#F5F5F5",
    borderWidth: 1,
    borderColor: "#EEEEEE",
    position: "relative",
  },
  headerImage: {
    width: THUMB,
    height: THUMB,
  },
  headerImagePlaceholder: {
    width: THUMB,
    height: THUMB,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#F5F5F5",
  },
  dietOnThumb: {
    position: "absolute",
    top: 4,
    left: 4,
    backgroundColor: "#FFFFFF",
    borderRadius: 3,
    padding: 1,
  },
  headerTitleCol: {
    flex: 1,
    minWidth: 0,
    gap: 6,
    paddingTop: 2,
  },
  headerName: {
    fontSize: 16,
    fontWeight: "700",
    color: StoreTheme.textPrimary,
    lineHeight: 21,
  },
  headerPortion: {
    fontSize: 13,
    fontWeight: "500",
    color: StoreTheme.textSecondary,
    lineHeight: 18,
  },
  flashPill: {
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    backgroundColor: "#E0F2FE",
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  flashPillText: {
    fontSize: 11,
    fontWeight: "700",
    color: "#0369A1",
  },
  body: {
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 8,
    alignItems: "center",
  },
  iconBadge: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "#E0F2FE",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 10,
  },
  title: {
    fontFamily: StoreFonts.loraBold,
    fontSize: 18,
    color: GatiMitraColors.textPrimaryNew,
    textAlign: "center",
    marginBottom: 8,
  },
  message: {
    fontFamily: StoreFonts.poppinsSemiBold,
    fontSize: 14,
    lineHeight: 20,
    color: GatiMitraColors.textPrimaryNew,
    textAlign: "center",
    marginBottom: 6,
  },
  hint: {
    fontFamily: StoreFonts.poppinsSemiBold,
    fontSize: 12,
    lineHeight: 17,
    color: GatiMitraColors.textSecondary,
    textAlign: "center",
  },
  footer: {
    flexDirection: "column",
    alignItems: "stretch",
    paddingHorizontal: 16,
    paddingTop: 14,
    gap: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: StoreTheme.border,
    backgroundColor: "#fff",
    marginTop: 8,
  },
  wantMoreBtn: {
    width: "100%",
    height: CTA_HEIGHT,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    borderWidth: 1.5,
    borderColor: ADD_GREEN,
    borderRadius: 10,
    backgroundColor: QTY_FILL,
  },
  wantMoreText: {
    fontSize: 15,
    fontWeight: "800",
    color: ADD_GREEN,
  },
  confirmRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  stepper: {
    width: STEPPER_WIDTH,
    height: CTA_HEIGHT,
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1.5,
    borderColor: ADD_GREEN,
    borderRadius: 10,
    // Real inset from the green border — do not rely on space-between alone.
    paddingHorizontal: 10,
    backgroundColor: QTY_FILL,
    flexGrow: 0,
    flexShrink: 0,
    overflow: "hidden",
  },
  /** − / + hit targets inset from the border (not full-bleed edge Pressables). */
  stepperSide: {
    width: 36,
    height: 40,
    marginHorizontal: 2,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 8,
  },
  stepperGlyph: {
    fontSize: 22,
    lineHeight: 24,
    fontWeight: "700",
    color: ADD_GREEN,
    textAlign: "center",
    includeFontPadding: false,
  },
  stepperGlyphDisabled: {
    color: "#9CA3AF",
  },
  stepperQuantity: {
    flex: 1,
    fontSize: 16,
    fontWeight: "800",
    color: ADD_GREEN,
    textAlign: "center",
    includeFontPadding: false,
  },
  addItemBtn: {
    flex: 1,
    height: CTA_HEIGHT,
    borderRadius: 10,
    backgroundColor: ADD_GREEN,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 12,
  },
  addItemText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "800",
  },
  gotItBtn: {
    width: "100%",
    height: CTA_HEIGHT,
    borderRadius: 10,
    backgroundColor: ADD_GREEN,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 12,
  },
  gotItTitle: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "800",
  },
  gotItSub: {
    color: "rgba(255,255,255,0.88)",
    fontSize: 12,
    fontWeight: "600",
    marginTop: 1,
  },
  pressedIn: {
    opacity: 0.82,
  },
});
