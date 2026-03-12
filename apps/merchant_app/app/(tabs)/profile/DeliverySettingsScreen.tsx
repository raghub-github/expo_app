import { useEffect, useState } from "react";
import { View, Text, StyleSheet, Switch, Modal, Pressable, TextInput, ScrollView, Alert } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { GatiMitraMerchant, H_PADDING } from "@/constants/theme";
import { useStoreStatus } from "@/context/StoreStatusContext";
import { useProfileNav } from "@/context/ProfileNavContext";
import { useStoreSettings } from "@/context/StoreSettingsContext";
import { useAuth } from "@/context/AuthContext";
import { useSelectedStore } from "@/context/SelectedStoreContext";
import {
  createSelfDeliveryRider,
  getSelfDeliveryRiders,
  type SelfDeliveryRider,
  updateSelfDeliveryRider,
  deleteSelfDeliveryRider,
} from "@/services/selfDeliveryRidersApi";
import {
  getDeliveryCharges,
  updateDeliveryCharges,
  type DeliveryCharges,
} from "@/services/deliveryChargesApi";

/** Offset from top of content area; use with insets so effective padding is never negative. */
const CONTENT_TOP_OFFSET = -20;
const MIN_TOP_PADDING = 8;

export default function DeliverySettingsScreen() {
  const insets = useSafeAreaInsets();
  const {
    isOnline,
    loading,
    toggle,
    refresh,
    autoOpenFromSchedule,
    manualActivationLock,
    toggleAutoOpenFromSchedule,
    toggleManualActivationLock,
  } = useStoreStatus();
  const { setLastProfileSlug } = useProfileNav();
  const { settings, update } = useStoreSettings();
  const { token } = useAuth();
  const { selectedStore } = useSelectedStore();

  const [closeModalVisible, setCloseModalVisible] = useState(false);
  const [goingOffline, setGoingOffline] = useState(false);
  const [deliveryModeLoading, setDeliveryModeLoading] = useState(false);
  const [riders, setRiders] = useState<SelfDeliveryRider[]>([]);
  const [ridersLoaded, setRidersLoaded] = useState(false);
  const [ridersLoading, setRidersLoading] = useState(false);
  const [addRiderVisible, setAddRiderVisible] = useState(false);
  const [newRiderName, setNewRiderName] = useState("");
  const [newRiderMobile, setNewRiderMobile] = useState("");
  const [newRiderEmail, setNewRiderEmail] = useState("");
  const [newRiderVehicle, setNewRiderVehicle] = useState("");

  const [deliveryModeWarning, setDeliveryModeWarning] = useState<{
    visible: boolean;
    action: "toPlatform" | "toSelf" | null;
  }>({ visible: false, action: null });

  const [editingRider, setEditingRider] = useState<SelfDeliveryRider | null>(null);
  const [riderStatusWarning, setRiderStatusWarning] = useState<{
    visible: boolean;
    rider: SelfDeliveryRider | null;
  }>({ visible: false, rider: null });
  const [charges, setCharges] = useState<DeliveryCharges | null>(null);
  const [chargesLoading, setChargesLoading] = useState(false);
  const [chargesSaving, setChargesSaving] = useState(false);
  const [chargeModal, setChargeModal] = useState<{
    visible: boolean;
    type: "packaging" | "delivery" | null;
    value: string;
  }>({ visible: false, type: null, value: "" });

  const storeId = selectedStore?.id ?? null;
  const [secondsTick, setSecondsTick] = useState(0);

  useEffect(() => {
    setLastProfileSlug("address");
    void refresh();
  }, [setLastProfileSlug, refresh]);

  const subtitle = isOnline
    ? "Outlet is currently accepting orders."
    : "Outlet is currently not accepting orders.";
  const subtitleColor = isOnline ? GatiMitraMerchant.statusCompleted : GatiMitraMerchant.error;

  const hasStore = !!storeId && !!token;

  useEffect(() => {
    const id = setInterval(() => {
      setSecondsTick((prev) => prev + 1);
    }, 1000);
    return () => clearInterval(id);
  }, []);

  const loadRiders = async (): Promise<SelfDeliveryRider[]> => {
    if (!hasStore) return riders;
    setRidersLoading(true);
    try {
      // Fetch both active and inactive riders so store can re-activate later.
      const list = await getSelfDeliveryRiders(storeId!, token!, false);
      setRiders(list);
      setRidersLoaded(true);
      return list;
    } catch {
      // keep previous state
      return riders;
    } finally {
      setRidersLoading(false);
    }
  };

  const loadCharges = async () => {
    if (!hasStore) return;
    setChargesLoading(true);
    try {
      const data = await getDeliveryCharges(storeId!, token!);
      setCharges(data);
    } catch {
      // keep previous
    } finally {
      setChargesLoading(false);
    }
  };

  useEffect(() => {
    if (settings.self_delivery && hasStore && !ridersLoaded && !ridersLoading) {
      void loadRiders();
    }
  }, [settings.self_delivery, hasStore, ridersLoaded, ridersLoading]);

  useEffect(() => {
    if (hasStore) {
      void loadCharges();
    } else {
      setCharges(null);
    }
  }, [hasStore]);

  const formatRemaining = (seconds: number): string => {
    if (seconds <= 0) return "00:00:00:00";
    let remaining = seconds;
    const days = Math.floor(remaining / (24 * 3600));
    remaining -= days * 24 * 3600;
    const hours = Math.floor(remaining / 3600);
    remaining -= hours * 3600;
    const mins = Math.floor(remaining / 60);
    const secs = remaining - mins * 60;
    const dd = String(days).padStart(2, "0");
    const hh = String(hours).padStart(2, "0");
    const mm = String(mins).padStart(2, "0");
    const ss = String(secs).padStart(2, "0");
    // Format: DD:HH:MM:SS with unit labels so meaning is clear.
    return `${dd}D:${hh}H:${mm}M:${ss}S`;
  };

  const formatUpdatedAt = (iso?: string | null): string => {
    if (!iso) return "-";
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return "-";
    return d.toLocaleString("en-IN", {
      day: "2-digit",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const openChargeModal = (type: "packaging" | "delivery") => {
    if (!charges) return;
    const locked =
      type === "packaging"
        ? charges.packaging_charge_locked
        : charges.delivery_charge_locked;
    if (locked) {
      const secs =
        type === "packaging"
          ? charges.packaging_charge_seconds_until_edit
          : charges.delivery_charge_seconds_until_edit;
      Alert.alert("Not editable yet", formatRemaining(secs));
      return;
    }
    const current =
      type === "packaging"
        ? charges.packaging_charge_amount
        : charges.delivery_charge_per_km;
    setChargeModal({
      visible: true,
      type,
      value: current != null ? String(current) : "",
    });
  };

  const saveChargeFromModal = async () => {
    if (!hasStore || !token || !chargeModal.type || !charges) return;
    const raw = chargeModal.value.trim();
    const num = Number(raw);
    if (!Number.isFinite(num)) {
      Alert.alert("Invalid amount", "Please enter a valid number.");
      return;
    }
    if (chargeModal.type === "packaging" && (num < 6 || num > 15)) {
      Alert.alert(
        "Invalid packaging charge",
        "Packaging charge must be between 6 and 15."
      );
      return;
    }
    if (chargeModal.type === "delivery" && (num < 7 || num > 15)) {
      Alert.alert(
        "Invalid delivery charge",
        "Delivery charge per km must be between 7 and 15."
      );
      return;
    }
    setChargesSaving(true);
    try {
      const body =
        chargeModal.type === "packaging"
          ? { packaging_charge_amount: num }
          : { delivery_charge_per_km: num };
      const updated = await updateDeliveryCharges(storeId!, body, token!);
      setCharges(updated);
      setChargeModal({ visible: false, type: null, value: "" });
    } catch (e) {
      const msg =
        e instanceof Error ? e.message : "Failed to update delivery charges";
      Alert.alert("Could not save", msg);
    } finally {
      setChargesSaving(false);
    }
  };

  const handleEnablePlatformDelivery = async () => {
    if (!hasStore) return;
    setDeliveryModeLoading(true);
    try {
      await update({
        platform_delivery: true,
        self_delivery: false,
      });
    } finally {
      setDeliveryModeLoading(false);
    }
  };

  const handleAttemptEnableSelfDelivery = async () => {
    if (!hasStore) return;
    // Ensure we know current riders
    let currentRiders = riders;
    if (!ridersLoaded) {
      currentRiders = await loadRiders();
    }
    const hasRiders = currentRiders.length > 0;
    if (!hasRiders) {
      setAddRiderVisible(true);
      return;
    }
    setDeliveryModeLoading(true);
    try {
      await update({
        platform_delivery: false,
        self_delivery: true,
      });
    } finally {
      setDeliveryModeLoading(false);
    }
  };

  const handleSaveNewRider = async () => {
    if (!hasStore || !token) return;
    const name = newRiderName.trim();
    const mobile = newRiderMobile.trim();
    if (!name || !mobile) {
      return;
    }
    setDeliveryModeLoading(true);
    try {
      if (editingRider) {
        const updatedRider = await updateSelfDeliveryRider(
          storeId!,
          editingRider.id,
          {
            rider_name: name,
            rider_mobile: mobile,
            rider_email: newRiderEmail.trim() || null,
            vehicle_number: newRiderVehicle.trim() || null,
          },
          token!
        );
        setRiders((prev) =>
          prev.map((r) => (r.id === updatedRider.id ? updatedRider : r))
        );
      } else {
        const rider = await createSelfDeliveryRider(
          storeId!,
          {
            rider_name: name,
            rider_mobile: mobile,
            rider_email: newRiderEmail.trim() || null,
            vehicle_number: newRiderVehicle.trim() || null,
            is_primary: riders.length === 0,
          },
          token!
        );
        const nextRiders = [...riders, rider];
        setRiders(nextRiders);
        setRidersLoaded(true);
        // After at least one rider exists, enable self-delivery mode.
        await update({
          platform_delivery: false,
          self_delivery: true,
        });
      }
      setAddRiderVisible(false);
      setEditingRider(null);
      setNewRiderName("");
      setNewRiderMobile("");
      setNewRiderEmail("");
      setNewRiderVehicle("");
    } finally {
      setDeliveryModeLoading(false);
    }
  };

  const handleToggleRiderActive = async (r: SelfDeliveryRider) => {
    if (!hasStore || !token) return;
    const nextActive = !r.is_active;
    setRiders((prev) =>
      prev.map((x) => (x.id === r.id ? { ...x, is_active: nextActive } : x))
    );
    try {
      const updated = await updateSelfDeliveryRider(
        storeId!,
        r.id,
        { is_active: nextActive },
        token!
      );
      setRiders((prev) =>
        prev.map((x) => (x.id === updated.id ? updated : x))
      );
    } catch (e) {
      setRiders((prev) =>
        prev.map((x) => (x.id === r.id ? { ...x, is_active: r.is_active } : x))
      );
      const msg = e instanceof Error ? e.message : "Failed to update rider";
      Alert.alert("Could not change status", msg);
    }
  };

  const handleEditRider = (r: SelfDeliveryRider) => {
    setEditingRider(r);
    setNewRiderName(r.rider_name);
    setNewRiderMobile(r.rider_mobile);
    setNewRiderEmail(r.rider_email ?? "");
    setNewRiderVehicle(r.vehicle_number ?? "");
    setAddRiderVisible(true);
  };

  const handleMakePrimary = async (r: SelfDeliveryRider) => {
    if (!hasStore || !token) return;
    setDeliveryModeLoading(true);
    try {
      const updated = await updateSelfDeliveryRider(
        storeId!,
        r.id,
        { is_primary: true },
        token!
      );
      setRiders((prev) =>
        prev.map((x) =>
          x.id === updated.id ? updated : { ...x, is_primary: false }
        )
      );
    } catch (e) {
      const msg =
        e instanceof Error ? e.message : "Failed to update primary rider";
      Alert.alert("Could not set primary rider", msg);
    } finally {
      setDeliveryModeLoading(false);
    }
  };

  const handleDeleteRider = (r: SelfDeliveryRider) => {
    if (!hasStore || !token) return;
    Alert.alert(
      "Remove rider?",
      "This rider will be marked inactive and will not receive orders.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Remove",
          style: "destructive",
          onPress: async () => {
            setRiders((prev) =>
              prev.map((x) => (x.id === r.id ? { ...x, is_active: false } : x))
            );
            try {
              await deleteSelfDeliveryRider(storeId!, r.id, token!);
            } catch (e) {
              const msg =
                e instanceof Error ? e.message : "Failed to remove rider";
              Alert.alert("Could not remove rider", msg);
              // reload full list to be safe
              void loadRiders();
            }
          },
        },
      ]
    );
  };

  return (
    <View style={[styles.container, { paddingTop: Math.max(MIN_TOP_PADDING, insets.top + CONTENT_TOP_OFFSET) }]}>
      <ScrollView
        style={styles.body}
        contentContainerStyle={styles.bodyContent}
        showsVerticalScrollIndicator={false}
      >
        <View style={[styles.card, !isOnline && styles.cardOffline]}>
          <View style={styles.row}>
            <View style={styles.left}>
              <View style={styles.titleRow}>
                <Ionicons
                  name="bicycle-outline"
                  size={18}
                  color={GatiMitraMerchant.primary}
                  style={styles.titleIcon}
                />
                <Text style={styles.cardTitle}>Delivery Status</Text>
              </View>
              <Text style={[styles.cardSubtitle, { color: subtitleColor }]}>{subtitle}</Text>
            </View>
            <Switch
              value={isOnline}
              onValueChange={() => {
                if (isOnline) {
                  setGoingOffline(true);
                  setCloseModalVisible(true);
                } else {
                  toggle();
                }
              }}
              disabled={loading}
              trackColor={{ false: "#4B5563", true: GatiMitraMerchant.primary }}
              thumbColor={isOnline ? "#FFFFFF" : "#F9FAFB"}
            />
          </View>
        </View>
        <View style={styles.pricingCard}>
          <View style={styles.pricingHeaderRow}>
            <View style={styles.left}>
              <Text style={styles.secondaryTitle}>Packaging charges</Text>
              <Text style={styles.secondarySubtitle}>
                Add a small packaging fee per order.
              </Text>
            </View>
            <Pressable
              onPress={() => openChargeModal("packaging")}
              disabled={chargesLoading || chargesSaving}
              style={({ pressed }) => [
                styles.pricingPill,
                pressed && styles.pressed,
              ]}
            >
              <Text style={styles.pricingPillText}>
                {charges?.packaging_charge_amount != null
                  ? `₹${charges.packaging_charge_amount.toFixed(2)}`
                  : "Set amount"}
              </Text>
            </Pressable>
          </View>
          {charges && (
            <Text
              style={styles.pricingStatusInline}
              numberOfLines={1}
              ellipsizeMode="tail"
            >
              <Text style={styles.pricingMetaInline}>
                Last updated:{" "}
                {formatUpdatedAt(charges.packaging_charge_last_updated_at)}
              </Text>
              {"   "}
              <Text style={styles.pricingStatusTextDanger}>
                {formatRemaining(
                  Math.max(
                    0,
                    charges.packaging_charge_seconds_until_edit - secondsTick
                  )
                )}
              </Text>
            </Text>
          )}
        </View>
        <View style={styles.secondaryCard}>
          <View style={styles.secondaryHeaderRow}>
            <Text style={styles.secondaryTitle}>Delivery mode</Text>
          </View>
          <View style={styles.modeRow}>
            <View style={styles.modeTextWrap}>
              <Text style={styles.modeLabel}>GatiMitra delivery</Text>
              <Text style={styles.modeSubtitle}>Platform riders assigned by GatiMitra</Text>
            </View>
            <Switch
              value={settings.platform_delivery}
              onValueChange={(next) => {
                if (!next || !hasStore) return;
                setDeliveryModeWarning({ visible: true, action: "toPlatform" });
              }}
              disabled={loading || deliveryModeLoading || !hasStore}
              trackColor={{ false: "#4B5563", true: GatiMitraMerchant.primary }}
              thumbColor={settings.platform_delivery ? "#FFFFFF" : "#F9FAFB"}
            />
          </View>
          <View style={styles.divider} />
          <View style={styles.modeRow}>
            <View style={styles.modeTextWrap}>
              <Text style={styles.modeLabel}>Self delivery</Text>
              <Text style={styles.modeSubtitle}>Your own riders deliver the orders</Text>
            </View>
            <Switch
              value={settings.self_delivery}
              onValueChange={(next) => {
                if (!hasStore) return;
                if (!next) {
                  // Turning OFF self-delivery -> back to platform.
                  setDeliveryModeWarning({ visible: true, action: "toPlatform" });
                } else {
                  // Turning ON self-delivery.
                  setDeliveryModeWarning({ visible: true, action: "toSelf" });
                }
              }}
              disabled={loading || deliveryModeLoading || !hasStore}
              trackColor={{ false: "#4B5563", true: GatiMitraMerchant.primary }}
              thumbColor={settings.self_delivery ? "#FFFFFF" : "#F9FAFB"}
            />
          </View>
          {settings.self_delivery && (
            <View style={styles.ridersSection}>
              <Text style={styles.ridersTitle}>Self-delivery riders</Text>
              {ridersLoading && !ridersLoaded ? (
                <Text style={styles.ridersHint}>Loading riders…</Text>
              ) : riders.length === 0 ? (
                <Text style={styles.ridersHint}>
                  No riders added. Add at least one rider to keep self delivery ON.
                </Text>
              ) : (
                <View style={styles.ridersList}>
                  {riders.map((r) => (
                    <View key={r.id} style={styles.riderRow}>
                      <View style={styles.riderLeft}>
                        <Text style={styles.riderName}>
                          {r.rider_name}
                          {r.is_primary && <Text style={styles.riderPrimaryBadge}>  • Primary</Text>}
                        </Text>
                        <Text style={styles.riderDetail}>Mobile: {r.rider_mobile}</Text>
                        {r.rider_email && (
                          <Text style={styles.riderDetail}>Email: {r.rider_email}</Text>
                        )}
                        {r.vehicle_number && (
                          <Text style={styles.riderDetail}>Vehicle: {r.vehicle_number}</Text>
                        )}
                        <View style={styles.riderActionsRow}>
                          <Pressable
                            onPress={() => handleEditRider(r)}
                            style={({ pressed }) => pressed && styles.pressed}
                          >
                            <Text style={styles.riderActionText}>Edit</Text>
                          </Pressable>
                          <Text style={styles.riderActionDivider}>•</Text>
                          <Pressable
                            onPress={() => handleDeleteRider(r)}
                            style={({ pressed }) => pressed && styles.pressed}
                          >
                            <Text style={styles.riderActionText}>Remove</Text>
                          </Pressable>
                          {!r.is_primary && (
                            <>
                              <Text style={styles.riderActionDivider}>•</Text>
                              <Pressable
                                onPress={() => handleMakePrimary(r)}
                                style={({ pressed }) =>
                                  pressed && styles.pressed
                                }
                              >
                                <Text style={styles.riderActionText}>
                                  Make primary
                                </Text>
                              </Pressable>
                            </>
                          )}
                        </View>
                      </View>
                      <Pressable
                        onPress={() =>
                          setRiderStatusWarning({ visible: true, rider: r })
                        }
                        style={styles.riderStatusPill}
                      >
                        <View style={styles.riderStatusInner}>
                          <Ionicons
                            name={r.is_active ? "toggle" : "toggle-outline"}
                            size={18}
                            color={
                              r.is_active
                                ? GatiMitraMerchant.storeOnline
                                : GatiMitraMerchant.textSecondary
                            }
                            style={styles.riderStatusIcon}
                          />
                          <Text style={styles.riderStatusText}>
                            {r.is_active ? "Active" : "Inactive"}
                          </Text>
                        </View>
                      </Pressable>
                    </View>
                  ))}
                </View>
              )}
              <Pressable
                onPress={() => {
                  setAddRiderVisible(true);
                }}
                style={({ pressed }) => [
                  styles.addRiderBtn,
                  pressed && styles.pressed,
                ]}
              >
                <Text style={styles.addRiderText}>Add rider</Text>
              </Pressable>
            </View>
          )}
        </View>
        {settings.self_delivery && charges && (
          <View style={styles.pricingCard}>
            <View style={styles.pricingHeaderRow}>
              <View style={styles.left}>
                <Text style={styles.secondaryTitle}>Self-delivery charges</Text>
                <Text style={styles.secondarySubtitle}>
                  Per km delivery charge for your riders.
                </Text>
              </View>
              <Pressable
                onPress={() => openChargeModal("delivery")}
                disabled={chargesLoading || chargesSaving}
                style={({ pressed }) => [
                  styles.pricingPill,
                  pressed && styles.pressed,
                ]}
              >
                <Text style={styles.pricingPillText}>
                  {charges.delivery_charge_per_km != null
                    ? `₹${charges.delivery_charge_per_km.toFixed(2)}/km`
                    : "Set per km"}
                </Text>
              </Pressable>
            </View>
            <Text
              style={styles.pricingStatusInline}
              numberOfLines={1}
              ellipsizeMode="tail"
            >
              <Text style={styles.pricingMetaInline}>
                Last updated:{" "}
                {formatUpdatedAt(charges.delivery_charge_per_km_last_updated_at)}
              </Text>
              {"   "}
              <Text style={styles.pricingStatusTextDanger}>
                {formatRemaining(
                  Math.max(
                    0,
                    charges.delivery_charge_seconds_until_edit - secondsTick
                  )
                )}
              </Text>
            </Text>
          </View>
        )}
        <View style={styles.secondaryCard}>
          <View style={styles.row}>
            <View style={styles.left}>
              <Text style={styles.secondaryTitle}>Auto-open from schedule</Text>
              <Text style={styles.secondarySubtitle}>
                Store will open and close automatically as per operating hours.
              </Text>
            </View>
            <Switch
              value={autoOpenFromSchedule}
              onValueChange={() =>
                Alert.alert(
                  autoOpenFromSchedule
                    ? "Disable auto-open from schedule?"
                    : "Enable auto-open from schedule?",
                  autoOpenFromSchedule
                    ? "Store will no longer open and close automatically by schedule."
                    : "Store will automatically open and close according to operating hours.",
                  [
                    { text: "Cancel", style: "cancel" },
                    {
                      text: "Confirm",
                      style: "default",
                      onPress: () => {
                        toggleAutoOpenFromSchedule();
                      },
                    },
                  ]
                )
              }
              disabled={loading}
              trackColor={{ false: "#4B5563", true: GatiMitraMerchant.primary }}
              thumbColor={autoOpenFromSchedule ? "#FFFFFF" : "#F9FAFB"}
            />
          </View>
        </View>
        <View style={styles.secondaryCard}>
          <View style={styles.row}>
            <View style={styles.left}>
              <Text style={styles.secondaryTitle}>Manual activation lock</Text>
              <Text style={styles.secondarySubtitle}>
                Keep store closed until you turn it ON. Prevents automatic opening.
              </Text>
            </View>
            <Switch
              value={manualActivationLock}
              onValueChange={() =>
                Alert.alert(
                  manualActivationLock
                    ? "Disable manual activation lock?"
                    : "Enable manual activation lock?",
                  manualActivationLock
                    ? "Store can open automatically again based on schedule and availability."
                    : "Store will stay closed until you manually turn it ON.",
                  [
                    { text: "Cancel", style: "cancel" },
                    {
                      text: "Confirm",
                      style: "default",
                      onPress: () => {
                        toggleManualActivationLock();
                      },
                    },
                  ]
                )
              }
              disabled={loading}
              trackColor={{ false: "#4B5563", true: GatiMitraMerchant.primary }}
              thumbColor={manualActivationLock ? "#FFFFFF" : "#F9FAFB"}
            />
          </View>
        </View>
      </ScrollView>
      <Modal
        visible={closeModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setCloseModalVisible(false)}
      >
        <Pressable
          style={styles.modalOverlay}
          onPress={() => setCloseModalVisible(false)}
        >
          <Pressable
            style={styles.modalCard}
            onPress={(e) => e.stopPropagation()}
          >
            <View style={styles.modalIconWrap}>
              <Ionicons
                name="warning-outline"
                size={28}
                color={GatiMitraMerchant.warning}
              />
            </View>
            <Text style={styles.modalTitle}>Mark store as closed?</Text>
            <Text style={styles.modalMessage}>
              You will stop receiving new orders until you turn the store back
              ON.
            </Text>
            <View style={styles.modalActions}>
              <Pressable
                onPress={() => setCloseModalVisible(false)}
                style={({ pressed }) => [
                  styles.modalBtn,
                  styles.modalBtnCancel,
                  pressed && styles.pressed,
                ]}
              >
                <Text style={styles.modalBtnCancelText}>Cancel</Text>
              </Pressable>
              <Pressable
                onPress={() => {
                  if (goingOffline) {
                    toggle();
                  }
                  setCloseModalVisible(false);
                  setGoingOffline(false);
                }}
                style={({ pressed }) => [
                  styles.modalBtn,
                  styles.modalBtnConfirm,
                  pressed && styles.pressed,
                ]}
              >
                <Text style={styles.modalBtnConfirmText}>Confirm</Text>
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
      <Modal
        visible={chargeModal.visible}
        transparent
        animationType="fade"
        onRequestClose={() =>
          setChargeModal({ visible: false, type: null, value: "" })
        }
      >
        <Pressable
          style={styles.modalOverlay}
          onPress={() =>
            setChargeModal({ visible: false, type: null, value: "" })
          }
        >
          <Pressable
            style={styles.modalCard}
            onPress={(e) => e.stopPropagation()}
          >
            <Text style={styles.modalTitle}>
              {chargeModal.type === "delivery"
                ? "Set delivery charge per km"
                : "Set packaging charge"}
            </Text>
            <Text style={styles.modalMessage}>
              {chargeModal.type === "delivery"
                ? "Enter per km delivery charge (7 – 15)."
                : "Enter packaging charge per order (6 – 15)."}
            </Text>
            <View style={styles.formField}>
              <Text style={styles.formLabel}>Amount (₹)</Text>
              <TextInput
                value={chargeModal.value}
                onChangeText={(t) =>
                  setChargeModal((prev) => ({ ...prev, value: t }))
                }
                keyboardType="numeric"
                placeholder="0.00"
                placeholderTextColor={GatiMitraMerchant.textTertiary}
                style={styles.input}
              />
            </View>
            <View style={styles.modalActions}>
              <Pressable
                onPress={() =>
                  setChargeModal({ visible: false, type: null, value: "" })
                }
                style={({ pressed }) => [
                  styles.modalBtn,
                  styles.modalBtnCancel,
                  pressed && styles.pressed,
                ]}
              >
                <Text style={styles.modalBtnCancelText}>Cancel</Text>
              </Pressable>
              <Pressable
                onPress={saveChargeFromModal}
                disabled={chargesSaving}
                style={({ pressed }) => [
                  styles.modalBtn,
                  styles.modalBtnConfirm,
                  pressed && styles.pressed,
                ]}
              >
                <Text style={styles.modalBtnConfirmText}>
                  {chargesSaving ? "Saving…" : "Save"}
                </Text>
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
      <Modal
        visible={riderStatusWarning.visible}
        transparent
        animationType="fade"
        onRequestClose={() =>
          setRiderStatusWarning({ visible: false, rider: null })
        }
      >
        <Pressable
          style={styles.modalOverlay}
          onPress={() =>
            setRiderStatusWarning({ visible: false, rider: null })
          }
        >
          <Pressable
            style={styles.modalCard}
            onPress={(e) => e.stopPropagation()}
          >
            <Text style={styles.modalTitle}>
              {riderStatusWarning.rider?.is_active
                ? "Mark rider as Inactive?"
                : "Mark rider as Active?"}
            </Text>
            <Text style={styles.modalMessage}>
              {riderStatusWarning.rider?.is_active
                ? "This rider will stop receiving self-delivery orders."
                : "This rider will start receiving self-delivery orders."}
            </Text>
            <View style={styles.modalActions}>
              <Pressable
                onPress={() =>
                  setRiderStatusWarning({ visible: false, rider: null })
                }
                style={({ pressed }) => [
                  styles.modalBtn,
                  styles.modalBtnCancel,
                  pressed && styles.pressed,
                ]}
              >
                <Text style={styles.modalBtnCancelText}>Cancel</Text>
              </Pressable>
              <Pressable
                onPress={() => {
                  const rider = riderStatusWarning.rider;
                  setRiderStatusWarning({ visible: false, rider: null });
                  if (rider) {
                    void handleToggleRiderActive(rider);
                  }
                }}
                style={({ pressed }) => [
                  styles.modalBtn,
                  styles.modalBtnConfirm,
                  pressed && styles.pressed,
                ]}
              >
                <Text style={styles.modalBtnConfirmText}>Confirm</Text>
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
      <Modal
        visible={deliveryModeWarning.visible}
        transparent
        animationType="fade"
        onRequestClose={() =>
          setDeliveryModeWarning((prev) => ({ ...prev, visible: false }))
        }
      >
        <Pressable
          style={styles.modalOverlay}
          onPress={() =>
            setDeliveryModeWarning((prev) => ({ ...prev, visible: false }))
          }
        >
          <Pressable
            style={styles.modalCard}
            onPress={(e) => e.stopPropagation()}
          >
            <Text style={styles.modalTitle}>
              {deliveryModeWarning.action === "toSelf"
                ? "Switch to Self delivery?"
                : "Switch to GatiMitra delivery?"}
            </Text>
            <Text style={styles.modalMessage}>
              {deliveryModeWarning.action === "toSelf"
                ? "Your own riders will handle deliveries. Make sure riders are available before switching."
                : "Platform riders from GatiMitra will handle all deliveries for this store."}
            </Text>
            <View style={styles.modalActions}>
              <Pressable
                onPress={() =>
                  setDeliveryModeWarning((prev) => ({ ...prev, visible: false }))
                }
                style={({ pressed }) => [
                  styles.modalBtn,
                  styles.modalBtnCancel,
                  pressed && styles.pressed,
                ]}
              >
                <Text style={styles.modalBtnCancelText}>Cancel</Text>
              </Pressable>
              <Pressable
                onPress={() => {
                  const action = deliveryModeWarning.action;
                  setDeliveryModeWarning({ visible: false, action: null });
                  if (action === "toPlatform") {
                    void handleEnablePlatformDelivery();
                  } else if (action === "toSelf") {
                    void handleAttemptEnableSelfDelivery();
                  }
                }}
                style={({ pressed }) => [
                  styles.modalBtn,
                  styles.modalBtnConfirm,
                  pressed && styles.pressed,
                ]}
              >
                <Text style={styles.modalBtnConfirmText}>Confirm</Text>
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
      <Modal
        visible={addRiderVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setAddRiderVisible(false)}
      >
        <Pressable
          style={styles.modalOverlay}
          onPress={() => setAddRiderVisible(false)}
        >
          <Pressable style={styles.modalCard} onPress={(e) => e.stopPropagation()}>
            <ScrollView
              contentContainerStyle={{ paddingBottom: 24 }}
              keyboardShouldPersistTaps="handled"
            >
              <Text style={styles.modalTitle}>Add self-delivery rider</Text>
              <View style={styles.formField}>
                <Text style={styles.formLabel}>Rider name *</Text>
                <TextInput
                  value={newRiderName}
                  onChangeText={setNewRiderName}
                  placeholder="Enter rider name"
                  placeholderTextColor={GatiMitraMerchant.textTertiary}
                  style={styles.input}
                />
              </View>
              <View style={styles.formField}>
                <Text style={styles.formLabel}>Mobile *</Text>
                <TextInput
                  value={newRiderMobile}
                  onChangeText={setNewRiderMobile}
                  placeholder="10-digit mobile number"
                  keyboardType="phone-pad"
                  placeholderTextColor={GatiMitraMerchant.textTertiary}
                  style={styles.input}
                />
              </View>
              <View style={styles.formField}>
                <Text style={styles.formLabel}>Email (optional)</Text>
                <TextInput
                  value={newRiderEmail}
                  onChangeText={setNewRiderEmail}
                  placeholder="Rider email"
                  keyboardType="email-address"
                  autoCapitalize="none"
                  placeholderTextColor={GatiMitraMerchant.textTertiary}
                  style={styles.input}
                />
              </View>
              <View style={styles.formField}>
                <Text style={styles.formLabel}>Vehicle number (optional)</Text>
                <TextInput
                  value={newRiderVehicle}
                  onChangeText={setNewRiderVehicle}
                  placeholder="e.g. RJ14 AB 1234"
                  placeholderTextColor={GatiMitraMerchant.textTertiary}
                  style={styles.input}
                />
              </View>
              <View style={styles.modalActions}>
                <Pressable
                  onPress={() => setAddRiderVisible(false)}
                  style={({ pressed }) => [
                    styles.modalBtn,
                    styles.modalBtnCancel,
                    pressed && styles.pressed,
                  ]}
                >
                  <Text style={styles.modalBtnCancelText}>Cancel</Text>
                </Pressable>
                <Pressable
                  onPress={handleSaveNewRider}
                  style={({ pressed }) => [
                    styles.modalBtn,
                    styles.modalBtnConfirm,
                    pressed && styles.pressed,
                  ]}
                >
                  <Text style={styles.modalBtnConfirmText}>Save</Text>
                </Pressable>
              </View>
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: GatiMitraMerchant.background,
  },
  header: {
    paddingHorizontal: H_PADDING,
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: GatiMitraMerchant.border,
  },
  title: {
    fontSize: 18,
    fontWeight: "600",
    color: GatiMitraMerchant.textPrimary,
  },
  body: {
    flex: 1,
  },
  bodyContent: {
    paddingHorizontal: H_PADDING,
    paddingTop: 16,
    paddingBottom: 24,
    gap: 16,
  },
  card: {
    borderRadius: 14,
    backgroundColor: GatiMitraMerchant.cardBg,
    paddingVertical: 14,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderColor: GatiMitraMerchant.border,
    ...GatiMitraMerchant.shadowSm,
  },
  cardOffline: {
    borderColor: GatiMitraMerchant.error,
    backgroundColor: "#FEF2F2",
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  left: {
    flex: 1,
    minWidth: 0,
  },
  titleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginBottom: 4,
  },
  titleIcon: {
    marginRight: 2,
  },
  cardTitle: {
    fontSize: 15,
    fontWeight: "600",
    color: GatiMitraMerchant.textPrimary,
  },
  cardSubtitle: {
    fontSize: 13,
    marginTop: 2,
  },
  pressed: {
    opacity: 0.7,
  },
  secondaryCard: {
    borderRadius: 14,
    backgroundColor: GatiMitraMerchant.cardBg,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderColor: GatiMitraMerchant.border,
    marginTop: 14,
  },
  secondaryTitle: {
    fontSize: 14,
    fontWeight: "600",
    color: GatiMitraMerchant.textPrimary,
    marginBottom: 2,
  },
  secondarySubtitle: {
    fontSize: 12,
    color: GatiMitraMerchant.textSecondary,
  },
  pricingCard: {
    borderRadius: 14,
    backgroundColor: GatiMitraMerchant.cardBg,
    paddingVertical: 14,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderColor: GatiMitraMerchant.border,
    marginTop: 14,
    ...GatiMitraMerchant.shadowSm,
  },
  pricingHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  pricingPill: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: GatiMitraMerchant.primary,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  pricingPillText: {
    fontSize: 13,
    fontWeight: "600",
    color: GatiMitraMerchant.primary,
  },
  pricingHelperText: {
    marginTop: 8,
    fontSize: 11,
    color: GatiMitraMerchant.textSecondary,
  },
  pricingStatusText: {
    marginTop: 4,
    fontSize: 11,
    color: GatiMitraMerchant.textTertiary,
  },
  pricingMetaText: {
    marginTop: 6,
    fontSize: 11,
    color: GatiMitraMerchant.textSecondary,
  },
  pricingStatusTextDanger: {
    fontSize: 11,
    fontWeight: "600",
    color: GatiMitraMerchant.error,
  },
  pricingStatusInline: {
    marginTop: 6,
    fontSize: 11,
    color: GatiMitraMerchant.textSecondary,
  },
  pricingMetaInline: {
    fontSize: 11,
    color: GatiMitraMerchant.textSecondary,
  },
  secondaryHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 8,
  },
  modeRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    paddingVertical: 4,
  },
  modeTextWrap: {
    flex: 1,
    minWidth: 0,
  },
  modeLabel: {
    fontSize: 14,
    fontWeight: "600",
    color: GatiMitraMerchant.textPrimary,
  },
  modeSubtitle: {
    fontSize: 12,
    color: GatiMitraMerchant.textSecondary,
    marginTop: 2,
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: GatiMitraMerchant.border,
    marginVertical: 6,
  },
  ridersSection: {
    marginTop: 8,
    gap: 6,
  },
  ridersTitle: {
    fontSize: 13,
    fontWeight: "600",
    color: GatiMitraMerchant.textPrimary,
  },
  ridersHint: {
    fontSize: 12,
    color: GatiMitraMerchant.textSecondary,
  },
  ridersList: {
    marginTop: 4,
    gap: 8,
  },
  riderRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    paddingVertical: 6,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: GatiMitraMerchant.border,
  },
  riderLeft: {
    flex: 1,
    minWidth: 0,
  },
  riderName: {
    fontSize: 13,
    fontWeight: "600",
    color: GatiMitraMerchant.textPrimary,
    marginBottom: 2,
  },
  riderPrimaryBadge: {
    fontSize: 11,
    fontWeight: "600",
    color: GatiMitraMerchant.primary,
  },
  riderDetail: {
    fontSize: 12,
    color: GatiMitraMerchant.textSecondary,
  },
  riderStatusPill: {
    alignSelf: "flex-start",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: GatiMitraMerchant.surfaceSubtle,
  },
  riderStatusInner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  riderStatusIcon: {
    marginRight: 2,
  },
  riderStatusText: {
    fontSize: 11,
    fontWeight: "600",
    color: GatiMitraMerchant.textSecondary,
  },
  riderActionsRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 4,
  },
  riderActionText: {
    fontSize: 13,
    fontWeight: "600",
    color: GatiMitraMerchant.primary,
  },
  riderActionDivider: {
    fontSize: 11,
    color: GatiMitraMerchant.textSecondary,
  },
  addRiderBtn: {
    marginTop: 4,
    alignSelf: "flex-start",
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: GatiMitraMerchant.primary,
  },
  addRiderText: {
    fontSize: 12,
    fontWeight: "600",
    color: GatiMitraMerchant.primary,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.55)",
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
  },
  modalCard: {
    width: "100%",
    maxWidth: 340,
    borderRadius: 16,
    backgroundColor: GatiMitraMerchant.cardBg,
    padding: 22,
    ...GatiMitraMerchant.shadowSm,
  },
  modalIconWrap: {
    alignItems: "center",
    marginBottom: 8,
  },
  modalTitle: {
    fontSize: 17,
    fontWeight: "700",
    color: GatiMitraMerchant.textPrimary,
    textAlign: "center",
    marginBottom: 6,
  },
  modalMessage: {
    fontSize: 14,
    color: GatiMitraMerchant.textSecondary,
    textAlign: "center",
    marginBottom: 18,
  },
  modalActions: {
    flexDirection: "row",
    gap: 10,
    marginTop: 16,
  },
  modalBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
  },
  modalBtnCancel: {
    backgroundColor: GatiMitraMerchant.surfaceSubtle,
  },
  modalBtnConfirm: {
    backgroundColor: GatiMitraMerchant.navy,
  },
  modalBtnCancelText: {
    fontSize: 15,
    fontWeight: "600",
    color: GatiMitraMerchant.textPrimary,
  },
  modalBtnConfirmText: {
    fontSize: 15,
    fontWeight: "600",
    color: "#fff",
  },
  formField: {
    marginTop: 12,
  },
  formLabel: {
    fontSize: 13,
    fontWeight: "600",
    color: GatiMitraMerchant.textPrimary,
    marginBottom: 4,
  },
  inputShell: {
    minHeight: 40,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: GatiMitraMerchant.border,
    paddingHorizontal: 10,
    justifyContent: "center",
  },
  input: {
    minHeight: 40,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: GatiMitraMerchant.border,
    paddingHorizontal: 10,
    fontSize: 14,
    color: GatiMitraMerchant.textPrimary,
  },
});

