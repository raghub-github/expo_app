import { useEffect, useRef, useState } from "react";
import { AppText as Text } from "@/components/AppText";
import { View, StyleSheet, ScrollView, Switch, ActivityIndicator, Alert, TextInput, Pressable } from "react-native";
import { GatiMitraMerchant, H_PADDING } from "@/constants/theme";
import { useStoreSettings } from "@/context/StoreSettingsContext";
import { useSelectedStore } from "@/context/SelectedStoreContext";
import { useAuth } from "@/context/AuthContext";
import { getOutlet, updateOutlet } from "@/services/outletApi";

/** Small gap below MerchantHeader on profile sub-screens. */
const CONTENT_TOP = 10;

export default function NotificationsScreen() {
  const { selectedStore } = useSelectedStore();
  const { settings, loading, saving, update } = useStoreSettings();
  const [localValue, setLocalValue] = useState(settings.show_floating_orders);
  const { token } = useAuth();

  const [detailsLoading, setDetailsLoading] = useState(false);
  const [savingRadius, setSavingRadius] = useState(false);
  const [savingMinOrder, setSavingMinOrder] = useState(false);
  const [savingPrepTime, setSavingPrepTime] = useState(false);
  const [deliveryRadiusKm, setDeliveryRadiusKm] = useState<string>("");
  const [minOrderAmount, setMinOrderAmount] = useState<string>("");
  const [avgPrepMinutes, setAvgPrepMinutes] = useState<string>("");
  const [savedRadiusKm, setSavedRadiusKm] = useState<string>("");
  const [savedMinOrderAmount, setSavedMinOrderAmount] = useState<string>("");
  const [savedAvgPrepMinutes, setSavedAvgPrepMinutes] = useState<string>("");
  const [pureVeg, setPureVeg] = useState(false);
  const [acceptsOnline, setAcceptsOnline] = useState(true);
  const [acceptsCash, setAcceptsCash] = useState(true);

  const [toast, setToast] = useState({ visible: false, message: "" });
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const hasStore = !!selectedStore;
  const disabled = !hasStore || loading || saving;

  const canLoadDetails = !!token && !!selectedStore?.id;

  useEffect(
    () => () => {
      if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    },
    []
  );

  const showToast = (message: string) => {
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    setToast({ visible: true, message });
    toastTimerRef.current = setTimeout(() => {
      setToast({ visible: false, message: "" });
      toastTimerRef.current = null;
    }, 2500);
  };

  const loadDetails = async () => {
    if (!canLoadDetails) return;
    setDetailsLoading(true);
    try {
      const outlet = await getOutlet(selectedStore!.id, token!);
      const radiusStr =
        outlet.delivery_radius_km != null
          ? Number(outlet.delivery_radius_km).toFixed(2)
          : "";
      const minOrderStr =
        outlet.min_order_amount != null
          ? Number(outlet.min_order_amount).toFixed(2)
          : "0.00";
      const prepStr =
        outlet.avg_preparation_time_minutes != null
          ? String(outlet.avg_preparation_time_minutes)
          : "30";
      setDeliveryRadiusKm(radiusStr);
      setMinOrderAmount(minOrderStr);
      setAvgPrepMinutes(prepStr);
      setSavedRadiusKm(radiusStr);
      setSavedMinOrderAmount(minOrderStr);
      setSavedAvgPrepMinutes(prepStr);
      setPureVeg(outlet.is_pure_veg === true);
      setAcceptsOnline(outlet.accepts_online_payment !== false);
      setAcceptsCash(outlet.accepts_cash !== false);
    } catch (e) {
      const msg =
        e instanceof Error ? e.message : "Failed to load store preferences";
      Alert.alert("Could not load preferences", msg);
    } finally {
      setDetailsLoading(false);
    }
  };

  useEffect(() => {
    if (canLoadDetails) {
      void loadDetails();
    }
  }, [canLoadDetails]);

  const handleToggle = async (next: boolean) => {
    if (!hasStore) return;
    setLocalValue(next);
    try {
      await update({ show_floating_orders: next });
      showToast(
        next
          ? "Floating new-order count enabled."
          : "Floating new-order count disabled."
      );
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Failed to update preference";
      Alert.alert("Could not save preference", msg);
      setLocalValue(settings.show_floating_orders);
    }
  };

  const handleSaveRadius = async () => {
    if (!canLoadDetails) return;
    const radiusNum = deliveryRadiusKm.trim()
      ? Number(deliveryRadiusKm.trim())
      : NaN;
    if (
      deliveryRadiusKm.trim() &&
      (!Number.isFinite(radiusNum) || radiusNum < 1 || radiusNum > 50)
    ) {
      Alert.alert(
        "Invalid delivery radius",
        "Please enter a value between 1 and 50 km."
      );
      return;
    }
    setSavingRadius(true);
    try {
      await updateOutlet(
        selectedStore!.id,
        {
          delivery_radius_km: deliveryRadiusKm.trim() ? radiusNum : null,
        },
        token!
      );
      const normalized = deliveryRadiusKm.trim()
        ? radiusNum.toFixed(2)
        : "";
      setDeliveryRadiusKm(normalized);
      setSavedRadiusKm(normalized);
      showToast("Delivery radius updated.");
    } catch (e) {
      const msg =
        e instanceof Error ? e.message : "Failed to update delivery radius";
      Alert.alert("Could not save", msg);
    } finally {
      setSavingRadius(false);
    }
  };

  const handleSaveMinOrder = async () => {
    if (!canLoadDetails) return;
    const minOrderNum = minOrderAmount.trim()
      ? Number(minOrderAmount.trim())
      : 0;
    if (!Number.isFinite(minOrderNum) || minOrderNum < 0) {
      Alert.alert(
        "Invalid minimum order",
        "Minimum order amount cannot be negative."
      );
      return;
    }
    setSavingMinOrder(true);
    try {
      await updateOutlet(
        selectedStore!.id,
        {
          min_order_amount: minOrderNum,
        },
        token!
      );
      const normalized = minOrderNum.toFixed(2);
      setMinOrderAmount(normalized);
      setSavedMinOrderAmount(normalized);
      showToast("Minimum order amount updated.");
    } catch (e) {
      const msg =
        e instanceof Error ? e.message : "Failed to update minimum order";
      Alert.alert("Could not save", msg);
    } finally {
      setSavingMinOrder(false);
    }
  };

  const handleSavePrepTime = async () => {
    if (!canLoadDetails) return;
    const prepNum = avgPrepMinutes.trim()
      ? Number(avgPrepMinutes.trim())
      : 30;
    if (!Number.isInteger(prepNum) || prepNum <= 0) {
      Alert.alert(
        "Invalid preparation time",
        "Please enter a positive whole number for minutes."
      );
      return;
    }
    setSavingPrepTime(true);
    try {
      await updateOutlet(
        selectedStore!.id,
        {
          avg_preparation_time_minutes: prepNum,
        },
        token!
      );
      const normalized = String(prepNum);
      setAvgPrepMinutes(normalized);
      setSavedAvgPrepMinutes(normalized);
      showToast("Preparation time updated.");
    } catch (e) {
      const msg =
        e instanceof Error ? e.message : "Failed to update preparation time";
      Alert.alert("Could not save", msg);
    } finally {
      setSavingPrepTime(false);
    }
  };

  const handleTogglePureVeg = async (next: boolean) => {
    if (!canLoadDetails) return;
    const prev = pureVeg;
    setPureVeg(next);
    try {
      await updateOutlet(
        selectedStore!.id,
        { is_pure_veg: next },
        token!
      );
      showToast(
        next ? "Marked outlet as pure veg." : "Marked outlet as non-veg."
      );
    } catch (e) {
      setPureVeg(prev);
      const msg =
        e instanceof Error ? e.message : "Failed to update veg preference";
      Alert.alert("Could not save", msg);
    }
  };

  const handleToggleAcceptsOnline = async (next: boolean) => {
    if (!canLoadDetails) return;
    const prev = acceptsOnline;
    setAcceptsOnline(next);
    try {
      await updateOutlet(
        selectedStore!.id,
        { accepts_online_payment: next },
        token!
      );
      showToast(
        next ? "Online payments enabled for this store." : "Online payments disabled."
      );
    } catch (e) {
      setAcceptsOnline(prev);
      const msg =
        e instanceof Error ? e.message : "Failed to update payment option";
      Alert.alert("Could not save", msg);
    }
  };

  const handleToggleAcceptsCash = async (next: boolean) => {
    if (!canLoadDetails) return;
    const prev = acceptsCash;
    setAcceptsCash(next);
    try {
      await updateOutlet(
        selectedStore!.id,
        { accepts_cash: next },
        token!
      );
      showToast(
        next ? "Cash on delivery enabled." : "Cash on delivery disabled."
      );
    } catch (e) {
      setAcceptsCash(prev);
      const msg =
        e instanceof Error ? e.message : "Failed to update cash option";
      Alert.alert("Could not save", msg);
    }
  };

  const radiusDirty =
    deliveryRadiusKm.trim() !== savedRadiusKm.trim();
  const minOrderDirty =
    minOrderAmount.trim() !== savedMinOrderAmount.trim();
  const prepTimeDirty =
    avgPrepMinutes.trim() !== savedAvgPrepMinutes.trim();

  return (
    <View style={[styles.container, { paddingTop: CONTENT_TOP }]}>
      <ScrollView
        style={styles.body}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.card}>
          <View style={styles.cardHeaderRow}>
            <View style={styles.iconCircle}>
              <Text style={styles.iconGlyph}>📦</Text>
            </View>
            <View style={styles.cardTitleWrap}>
              <Text style={styles.cardTitle}>
                Floating live order count
              </Text>
              <Text style={styles.cardSubtitle}>
                Show the in-app new-order pill while you use the app, so orders waiting to accept stay visible. Off hides it.
              </Text>
            </View>
            <Switch
              value={localValue}
              onValueChange={handleToggle}
              disabled={disabled}
              trackColor={{
                false: "#4B5563",
                true: GatiMitraMerchant.primary,
              }}
              thumbColor={localValue ? "#FFFFFF" : "#F9FAFB"}
            />
          </View>
        </View>

        <View style={styles.prefsSectionHeaderRow}>
          <Text style={styles.prefsTitle}>Store preferences</Text>
          {detailsLoading && (
            <ActivityIndicator size="small" color={GatiMitraMerchant.primary} />
          )}
        </View>

        {/* Numeric setting cards: 2 per row where possible */}
        <View style={styles.prefsGridRow}>
          <View style={[styles.prefsCard, radiusDirty && styles.prefsCardDirty]}>
            <Text style={styles.prefsLabel}>Delivery radius (km)</Text>
            <Text style={styles.prefsHint}>Recommended between 1–50 km</Text>
            <View style={styles.prefsInputWrap}>
              <TextInput
                value={deliveryRadiusKm}
                onChangeText={setDeliveryRadiusKm}
                keyboardType="numeric"
                placeholder="10"
                placeholderTextColor={GatiMitraMerchant.textTertiary}
                style={styles.prefsInput}
              />
              <View style={styles.prefsSuffix}>
                <Text style={styles.prefsSuffixText}>km</Text>
              </View>
            </View>
            {radiusDirty && (
              <View style={styles.prefsCardActions}>
                <Pressable
                  onPress={handleSaveRadius}
                  disabled={!canLoadDetails || savingRadius}
                  style={({ pressed }) => [
                    styles.prefsSaveButton,
                    (!canLoadDetails || savingRadius) && styles.prefsSaveDisabled,
                    pressed && !savingRadius && styles.pressed,
                  ]}
                >
                  <Text style={styles.prefsSaveText}>
                    {savingRadius ? "Saving…" : "Save"}
                  </Text>
                </Pressable>
              </View>
            )}
          </View>

          <View style={[styles.prefsCard, minOrderDirty && styles.prefsCardDirty]}>
            <Text style={styles.prefsLabel}>Minimum order amount</Text>
            <Text style={styles.prefsHint}>Customers must order at least this amount</Text>
            <View style={styles.prefsInputWrap}>
              <TextInput
                value={minOrderAmount}
                onChangeText={setMinOrderAmount}
                keyboardType="numeric"
                placeholder="0.00"
                placeholderTextColor={GatiMitraMerchant.textTertiary}
                style={styles.prefsInput}
              />
              <View style={styles.prefsSuffix}>
                <Text style={styles.prefsSuffixText}>₹</Text>
              </View>
            </View>
            {minOrderDirty && (
              <View style={styles.prefsCardActions}>
                <Pressable
                  onPress={handleSaveMinOrder}
                  disabled={!canLoadDetails || savingMinOrder}
                  style={({ pressed }) => [
                    styles.prefsSaveButton,
                    (!canLoadDetails || savingMinOrder) && styles.prefsSaveDisabled,
                    pressed && !savingMinOrder && styles.pressed,
                  ]}
                >
                  <Text style={styles.prefsSaveText}>
                    {savingMinOrder ? "Saving…" : "Save"}
                  </Text>
                </Pressable>
              </View>
            )}
          </View>
        </View>

        <View style={styles.prefsGridRow}>
          <View style={[styles.prefsCard, prepTimeDirty && styles.prefsCardDirty]}>
            <Text style={styles.prefsLabel}>Avg preparation time</Text>
            <Text style={styles.prefsHint}>Shown to customers as cooking time</Text>
            <View style={styles.prefsInputWrap}>
              <TextInput
                value={avgPrepMinutes}
                onChangeText={setAvgPrepMinutes}
                keyboardType="numeric"
                placeholder="30"
                placeholderTextColor={GatiMitraMerchant.textTertiary}
                style={styles.prefsInput}
              />
              <View style={styles.prefsSuffix}>
                <Text style={styles.prefsSuffixText}>min</Text>
              </View>
            </View>
            {prepTimeDirty && (
              <View style={styles.prefsCardActions}>
                <Pressable
                  onPress={handleSavePrepTime}
                  disabled={!canLoadDetails || savingPrepTime}
                  style={({ pressed }) => [
                    styles.prefsSaveButton,
                    (!canLoadDetails || savingPrepTime) && styles.prefsSaveDisabled,
                    pressed && !savingPrepTime && styles.pressed,
                  ]}
                >
                  <Text style={styles.prefsSaveText}>
                    {savingPrepTime ? "Saving…" : "Save"}
                  </Text>
                </Pressable>
              </View>
            )}
          </View>

          <View
            style={[
              styles.prefsToggleCard,
              pureVeg && styles.prefsToggleCardOn,
            ]}
          >
            <View style={styles.switchRow}>
              <View style={styles.switchLeft}>
                <Text style={styles.prefsLabel}>Pure veg outlet</Text>
                <Text style={styles.prefsHint}>Only vegetarian items are served</Text>
              </View>
              <Switch
                value={pureVeg}
                onValueChange={handleTogglePureVeg}
                trackColor={{ false: "#4B5563", true: GatiMitraMerchant.primary }}
                thumbColor={pureVeg ? "#FFFFFF" : "#F9FAFB"}
              />
            </View>
          </View>
        </View>

        <View style={styles.prefsGridRow}>
          <View
            style={[
              styles.prefsToggleCard,
              acceptsOnline && styles.prefsToggleCardOn,
            ]}
          >
            <View style={styles.switchRow}>
              <View style={styles.switchLeft}>
                <Text style={styles.prefsLabel}>Accepts online payment</Text>
                <Text style={styles.prefsHint}>UPI, cards and wallets</Text>
              </View>
              <Switch
                value={acceptsOnline}
                onValueChange={handleToggleAcceptsOnline}
                trackColor={{ false: "#4B5563", true: GatiMitraMerchant.primary }}
                thumbColor={acceptsOnline ? "#FFFFFF" : "#F9FAFB"}
              />
            </View>
          </View>

          <View
            style={[
              styles.prefsToggleCard,
              acceptsCash && styles.prefsToggleCardOn,
              styles.prefsToggleCardDisabled,
            ]}
          >
            <View style={styles.switchRow}>
              <View style={styles.switchLeft}>
                <Text style={styles.prefsLabel}>Accepts cash</Text>
                <Text style={styles.prefsHint}>Cash on delivery is managed by GatiMitra and cannot be changed here</Text>
              </View>
              <Switch
                value={acceptsCash}
                disabled
                trackColor={{ false: "#4B5563", true: GatiMitraMerchant.primary }}
                thumbColor={acceptsCash ? "#FFFFFF" : "#F9FAFB"}
              />
            </View>
          </View>
        </View>

        {toast.visible && (
          <View style={styles.toastWrap}>
            <View style={styles.toast}>
              <Text style={styles.toastText}>{toast.message}</Text>
            </View>
          </View>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: GatiMitraMerchant.background,
  },
  body: {
    flex: 1,
  },
  content: {
    paddingHorizontal: H_PADDING,
    paddingTop: 8,
    paddingBottom: 32,
    gap: 16,
  },
  pageTitle: {
    fontSize: 22,
    fontWeight: "700",
    fontFamily: "Lora_700Bold",
    color: GatiMitraMerchant.textPrimary,
    marginBottom: 4,
  },
  sectionLabel: {
    fontSize: 13,
    fontWeight: "600",
    textTransform: "uppercase",
    letterSpacing: 0.6,
    color: GatiMitraMerchant.textSecondary,
  },
  card: {
    borderRadius: 16,
    backgroundColor: GatiMitraMerchant.cardBg,
    padding: 14,
    borderWidth: 1,
    borderColor: GatiMitraMerchant.border,
    ...GatiMitraMerchant.shadowSm,
  },
  cardHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  iconCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: GatiMitraMerchant.surfaceSubtle,
    alignItems: "center",
    justifyContent: "center",
  },
  iconGlyph: {
    fontSize: 20,
  },
  cardTitleWrap: {
    flex: 1,
    minWidth: 0,
  },
  cardTitle: {
    fontSize: 15,
    fontWeight: "600",
    color: GatiMitraMerchant.textPrimary,
  },
  cardSubtitle: {
    marginTop: 4,
    fontSize: 12,
    color: GatiMitraMerchant.textSecondary,
  },
  metaRow: {
    marginTop: 10,
  },
  metaText: {
    fontSize: 12,
    color: GatiMitraMerchant.textSecondary,
    lineHeight: 16,
  },
  metaBadge: {
    alignSelf: "flex-start",
    fontSize: 11,
    color: GatiMitraMerchant.navy,
    backgroundColor: "#E0F2FE",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
    fontWeight: "600",
  },
  helperNote: {
    marginTop: 4,
    padding: 12,
    borderRadius: 12,
    backgroundColor: GatiMitraMerchant.surfaceSubtle,
  },
  helperText: {
    fontSize: 12,
    color: GatiMitraMerchant.textSecondary,
    marginBottom: 4,
  },
  helperTextDim: {
    fontSize: 11,
    color: GatiMitraMerchant.textTertiary,
  },
  prefsSectionHeaderRow: {
    marginTop: 16,
    marginBottom: 8,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  prefsTitle: {
    fontSize: 14,
    fontWeight: "600",
    color: GatiMitraMerchant.textPrimary,
  },
  prefsGridRow: {
    flexDirection: "row",
    gap: 12,
    marginBottom: 10,
  },
  prefsCard: {
    borderRadius: 14,
    backgroundColor: GatiMitraMerchant.cardBg,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: GatiMitraMerchant.border,
    ...GatiMitraMerchant.shadowSm,
    flex: 1,
    gap: 8,
  },
  prefsCardDirty: {
    borderColor: GatiMitraMerchant.primary,
    backgroundColor: "#ECFEF3",
  },
  prefsToggleCard: {
    borderRadius: 14,
    backgroundColor: GatiMitraMerchant.cardBg,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: GatiMitraMerchant.border,
    ...GatiMitraMerchant.shadowSm,
    flex: 1,
  },
  prefsToggleCardOn: {
    borderColor: GatiMitraMerchant.primary,
    backgroundColor: "#ECFEF3",
  },
  prefsToggleCardDisabled: {
    opacity: 0.72,
  },
  prefsRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  prefsRowLeft: {
    flex: 1,
    minWidth: 0,
  },
  prefsLabel: {
    fontSize: 12.5,
    fontWeight: "500",
    color: GatiMitraMerchant.textPrimary,
  },
  prefsHint: {
    marginTop: 2,
    fontSize: 10.5,
    color: GatiMitraMerchant.textSecondary,
  },
  prefsInputWrap: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 999,
    borderWidth: 1,
    borderColor: GatiMitraMerchant.border,
    paddingLeft: 10,
    paddingRight: 2,
    paddingVertical: 5,
    minWidth: 120,
    justifyContent: "space-between",
    backgroundColor: GatiMitraMerchant.surfaceSubtle,
  },
  prefsInput: {
    flex: 1,
    minWidth: 0,
    textAlign: "left",
    fontSize: 13,
    color: GatiMitraMerchant.textPrimary,
    paddingVertical: 0,
    paddingHorizontal: 0,
  },
  prefsSuffix: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: "#E5F3FF",
    marginLeft: 4,
  },
  prefsSuffixText: {
    fontSize: 11.5,
    fontWeight: "600",
    color: GatiMitraMerchant.navy,
  },
  switchRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 4,
  },
  switchLeft: {
    flex: 1,
    minWidth: 0,
    paddingRight: 12,
  },
  prefsActions: {
    marginTop: 10,
    gap: 8,
  },
  prefsInfoText: {
    fontSize: 11,
    color: GatiMitraMerchant.textSecondary,
  },
  prefsButtonsRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-end",
  },
  prefsSaveWrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  prefsSaveButton: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: GatiMitraMerchant.primary,
  },
  prefsSaveDisabled: {
    opacity: 0.5,
  },
  prefsSaveText: {
    color: "#FFFFFF",
    fontSize: 12.5,
    fontWeight: "600",
  },
  prefsCardActions: {
    marginTop: 8,
    flexDirection: "row",
    justifyContent: "flex-end",
  },
  pressed: {
    opacity: 0.75,
  },
  toastWrap: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 24,
    alignItems: "center",
    pointerEvents: "box-none",
  },
  toast: {
    backgroundColor: "#111827",
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 999,
    ...GatiMitraMerchant.shadowSm,
  },
  toastText: {
    fontSize: 13,
    fontWeight: "600",
    color: "#FFFFFF",
  },
});

