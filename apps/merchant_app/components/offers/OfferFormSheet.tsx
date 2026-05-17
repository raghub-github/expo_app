import { useEffect, useState, useMemo } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  ActivityIndicator,
  Image,
  TextInput,
  Modal,
  KeyboardAvoidingView,
  Platform,
  Alert,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { GatiMitraMerchant } from "@/constants/theme";
import type { OfferType } from "@/services/offersApi";
import type { MenuItemRow } from "@/services/menuApi";
import {
  WIZARD_STEPS,
  validateWizardStep,
  buildReviewRows,
  type OfferFormValues,
} from "@/lib/offers/offer-form";
import { OFFERS_UI } from "./offers-theme";

const OFFER_TYPES: { value: OfferType; label: string; icon: string }[] = [
  { value: "PERCENTAGE", label: "% Off Items", icon: "trending-down-outline" },
  { value: "FLAT", label: "Flat ₹ Off", icon: "cash-outline" },
  { value: "CART_PERCENTAGE", label: "% Off Cart", icon: "cart-outline" },
  { value: "CART_FLAT", label: "Flat ₹ Cart", icon: "wallet-outline" },
  { value: "BUY_X_GET_Y", label: "Buy X Get Y", icon: "gift-outline" },
  { value: "BUY_N_GET_M", label: "Buy N Get M", icon: "gift-outline" },
  { value: "BOGO", label: "Buy 1 Get 1", icon: "copy-outline" },
  { value: "COUPON", label: "Coupon Code", icon: "ticket-outline" },
  { value: "FREE_DELIVERY", label: "Free Delivery", icon: "bicycle-outline" },
  { value: "FREE_ITEM", label: "Free Item", icon: "fast-food-outline" },
  { value: "TIERED", label: "Tiered", icon: "podium-outline" },
  { value: "BUNDLE", label: "Bundle", icon: "layers-outline" },
];

export type OfferFormSheetProps = {
  visible: boolean;
  editing: boolean;
  saving: boolean;
  uploadingImage: boolean;
  values: OfferFormValues;
  onChange: (patch: Partial<OfferFormValues>) => void;
  menuItems: MenuItemRow[];
  menuLoading: boolean;
  menuSearch: string;
  onMenuSearchChange: (q: string) => void;
  onToggleMenuItem: (itemId: string) => void;
  isMenuItemDisabled?: (item: MenuItemRow) => boolean;
  onPickImage: () => void;
  onSave: () => void;
  onClose: () => void;
};

function ToggleRow({
  label,
  value,
  onPress,
}: {
  label: string;
  value: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable onPress={onPress} style={styles.toggleRow}>
      <Ionicons
        name={value ? "checkbox" : "square-outline"}
        size={22}
        color={GatiMitraMerchant.primary}
      />
      <Text style={styles.toggleLabel}>{label}</Text>
    </Pressable>
  );
}

export function OfferFormSheet({
  visible,
  editing,
  saving,
  uploadingImage,
  values: v,
  onChange,
  menuItems,
  menuLoading,
  menuSearch,
  onMenuSearchChange,
  onToggleMenuItem,
  isMenuItemDisabled,
  onPickImage,
  onSave,
  onClose,
}: OfferFormSheetProps) {
  const [stepIndex, setStepIndex] = useState(0);
  const step = WIZARD_STEPS[stepIndex]?.id ?? "basic";

  useEffect(() => {
    if (visible) setStepIndex(0);
  }, [visible, editing]);

  const filteredMenu = useMemo(() => {
    const term = menuSearch.trim().toLowerCase();
    return menuItems.filter((m) => {
      const selected = v.selectedItemIds.includes(m.item_id);
      if (!selected && isMenuItemDisabled?.(m)) return false;
      if (!term) return true;
      return (
        m.item_name.toLowerCase().includes(term) || m.item_id.toLowerCase().includes(term)
      );
    });
  }, [menuItems, menuSearch, isMenuItemDisabled, v.selectedItemIds]);

  const reviewRows = useMemo(() => buildReviewRows(v), [v]);

  const goNext = () => {
    const err = validateWizardStep(step, v);
    if (err) {
      Alert.alert("Required", err);
      return;
    }
    if (stepIndex < WIZARD_STEPS.length - 1) setStepIndex((i) => i + 1);
    else onSave();
  };

  const goBack = () => {
    if (stepIndex > 0) setStepIndex((i) => i - 1);
    else onClose();
  };

  const renderBasic = () => (
    <>
      <Text style={styles.stepHint}>Name your offer and add an optional banner image.</Text>
      <Text style={styles.label}>Offer title *</Text>
      <TextInput
        style={styles.input}
        value={v.title}
        onChangeText={(t) => onChange({ title: t })}
        placeholder="e.g. Summer dhamaka"
        placeholderTextColor={GatiMitraMerchant.textTertiary}
      />
      <Text style={styles.label}>Description</Text>
      <TextInput
        style={[styles.input, { minHeight: 72 }]}
        value={v.description}
        onChangeText={(t) => onChange({ description: t })}
        placeholder="Optional — shown to customers"
        placeholderTextColor={GatiMitraMerchant.textTertiary}
        multiline
      />
      <Text style={styles.label}>Offer image</Text>
      <View style={styles.imageRow}>
        <Pressable onPress={onPickImage} style={styles.imageBtn}>
          <Ionicons name="image-outline" size={18} color="#fff" />
          <Text style={styles.imageBtnText}>{v.imagePreview ? "Change" : "Upload"}</Text>
        </Pressable>
        {v.imagePreview ? (
          <Image source={{ uri: v.imagePreview }} style={styles.imagePreview} />
        ) : null}
      </View>
      {uploadingImage ? (
        <View style={styles.uploadRow}>
          <ActivityIndicator size="small" color={GatiMitraMerchant.primary} />
          <Text style={styles.uploadText}>Uploading image…</Text>
        </View>
      ) : null}
    </>
  );

  const renderType = () => (
    <>
      <Text style={styles.stepHint}>Choose how customers get the discount.</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.typeScroll}>
        {OFFER_TYPES.map((t) => (
          <Pressable
            key={t.value}
            onPress={() => onChange({ offerType: t.value })}
            style={[styles.typeChip, v.offerType === t.value && styles.typeChipActive]}
          >
            <Ionicons
              name={t.icon as keyof typeof Ionicons.glyphMap}
              size={16}
              color={v.offerType === t.value ? "#fff" : GatiMitraMerchant.textSecondary}
            />
            <Text style={[styles.typeChipText, v.offerType === t.value && styles.typeChipTextActive]}>
              {t.label}
            </Text>
          </Pressable>
        ))}
      </ScrollView>

      {["PERCENTAGE", "CART_PERCENTAGE"].includes(v.offerType) && (
        <>
          <Text style={styles.label}>Discount % *</Text>
          <TextInput
            style={styles.input}
            value={v.discountValue}
            onChangeText={(t) => onChange({ discountValue: t })}
            keyboardType="decimal-pad"
            placeholder="e.g. 12"
            placeholderTextColor={GatiMitraMerchant.textTertiary}
          />
          <Text style={styles.label}>Max discount cap ₹</Text>
          <TextInput
            style={styles.input}
            value={v.maxDiscountAmount}
            onChangeText={(t) => onChange({ maxDiscountAmount: t })}
            keyboardType="decimal-pad"
            placeholder="Optional"
            placeholderTextColor={GatiMitraMerchant.textTertiary}
          />
        </>
      )}

      {["FLAT", "CART_FLAT"].includes(v.offerType) && (
        <>
          <Text style={styles.label}>Flat discount ₹ *</Text>
          <TextInput
            style={styles.input}
            value={v.discountValue}
            onChangeText={(t) => onChange({ discountValue: t })}
            keyboardType="decimal-pad"
            placeholder="e.g. 50"
            placeholderTextColor={GatiMitraMerchant.textTertiary}
          />
        </>
      )}

      {["BUY_N_GET_M", "BUY_X_GET_Y", "BOGO"].includes(v.offerType) && (
        <View style={styles.row}>
          <View style={styles.half}>
            <Text style={styles.label}>Buy qty *</Text>
            <TextInput
              style={styles.input}
              value={v.buyQty}
              onChangeText={(t) => onChange({ buyQty: t })}
              keyboardType="number-pad"
              placeholder={v.offerType === "BOGO" ? "1" : "2"}
              placeholderTextColor={GatiMitraMerchant.textTertiary}
            />
          </View>
          <View style={styles.half}>
            <Text style={styles.label}>Get free qty</Text>
            <TextInput
              style={styles.input}
              value={v.getQty}
              onChangeText={(t) => onChange({ getQty: t })}
              keyboardType="number-pad"
              placeholder="1"
              placeholderTextColor={GatiMitraMerchant.textTertiary}
            />
          </View>
        </View>
      )}

      {v.offerType === "COUPON" && (
        <>
          <Text style={styles.label}>Coupon code *</Text>
          <TextInput
            style={styles.input}
            value={v.couponCode}
            onChangeText={(t) => onChange({ couponCode: t.toUpperCase() })}
            autoCapitalize="characters"
            placeholder="SAVE20"
            placeholderTextColor={GatiMitraMerchant.textTertiary}
          />
          <Text style={styles.label}>Discount % or ₹ amount</Text>
          <TextInput
            style={styles.input}
            value={v.discountValue}
            onChangeText={(t) => onChange({ discountValue: t })}
            keyboardType="decimal-pad"
            placeholder="% or flat ₹"
            placeholderTextColor={GatiMitraMerchant.textTertiary}
          />
        </>
      )}

      {["FREE_DELIVERY", "FREE_ITEM", "BUNDLE", "TIERED"].includes(v.offerType) && (
        <View style={styles.infoBox}>
          <Ionicons name="information-circle-outline" size={18} color={GatiMitraMerchant.navy} />
          <Text style={styles.infoText}>
            {v.offerType === "TIERED"
              ? "Tier rules can be configured on partner portal / dashboard."
              : "No extra discount value needed for this offer type."}
          </Text>
        </View>
      )}
    </>
  );

  const renderApplicability = () => (
    <>
      <Text style={styles.stepHint}>All orders or specific menu items only.</Text>
      <View style={styles.segment}>
        <Pressable
          onPress={() => onChange({ applyToSpecificItems: false, selectedItemIds: [] })}
          style={[styles.segBtn, !v.applyToSpecificItems && styles.segBtnActive]}
        >
          <Text style={[styles.segText, !v.applyToSpecificItems && styles.segTextActive]}>All orders</Text>
        </Pressable>
        <Pressable
          onPress={() => onChange({ applyToSpecificItems: true })}
          style={[styles.segBtn, v.applyToSpecificItems && styles.segBtnActive]}
        >
          <Text style={[styles.segText, v.applyToSpecificItems && styles.segTextActive]}>
            Specific items
          </Text>
        </Pressable>
      </View>

      {v.applyToSpecificItems ? (
        <>
          <TextInput
            style={[styles.input, { marginTop: 12 }]}
            value={menuSearch}
            onChangeText={onMenuSearchChange}
            placeholder="Search menu items…"
            placeholderTextColor={GatiMitraMerchant.textTertiary}
          />
          {menuLoading ? (
            <ActivityIndicator style={{ marginTop: 16 }} color={GatiMitraMerchant.primary} />
          ) : (
            <View style={styles.menuList}>
              {filteredMenu.slice(0, 80).map((item) => {
                const selected = v.selectedItemIds.includes(item.item_id);
                return (
                  <Pressable
                    key={item.item_id}
                    onPress={() => onToggleMenuItem(item.item_id)}
                    style={[styles.menuRow, selected && styles.menuRowSelected]}
                  >
                    <Ionicons
                      name={selected ? "checkbox" : "square-outline"}
                      size={20}
                      color={selected ? GatiMitraMerchant.primary : GatiMitraMerchant.textTertiary}
                    />
                    <View style={styles.menuTextCol}>
                      <Text style={styles.menuName} numberOfLines={1}>
                        {item.item_name}
                      </Text>
                      <Text style={styles.menuId}>{item.item_id}</Text>
                    </View>
                  </Pressable>
                );
              })}
              {filteredMenu.length === 0 ? (
                <Text style={styles.emptyMenu}>No items match your search.</Text>
              ) : null}
            </View>
          )}
          <Text style={styles.selectedCount}>{v.selectedItemIds.length} item(s) selected</Text>
        </>
      ) : null}
    </>
  );

  const renderConditions = () => (
    <>
      <Text style={styles.stepHint}>Dates, limits, and who can use this offer.</Text>
      <View style={styles.row}>
        <View style={styles.half}>
          <Text style={styles.label}>Valid from *</Text>
          <TextInput
            style={styles.input}
            value={v.validFrom}
            onChangeText={(t) => onChange({ validFrom: t })}
            placeholder="YYYY-MM-DD"
            placeholderTextColor={GatiMitraMerchant.textTertiary}
          />
        </View>
        <View style={styles.half}>
          <Text style={styles.label}>Valid till *</Text>
          <TextInput
            style={styles.input}
            value={v.validTill}
            onChangeText={(t) => onChange({ validTill: t })}
            placeholder="YYYY-MM-DD"
            placeholderTextColor={GatiMitraMerchant.textTertiary}
          />
        </View>
      </View>

      <View style={styles.row}>
        <View style={styles.half}>
          <Text style={styles.label}>Daily start (HH:mm)</Text>
          <TextInput
            style={styles.input}
            value={v.applicableTimeStart}
            onChangeText={(t) => onChange({ applicableTimeStart: t })}
            placeholder="09:00"
            placeholderTextColor={GatiMitraMerchant.textTertiary}
          />
        </View>
        <View style={styles.half}>
          <Text style={styles.label}>Daily end (HH:mm)</Text>
          <TextInput
            style={styles.input}
            value={v.applicableTimeEnd}
            onChangeText={(t) => onChange({ applicableTimeEnd: t })}
            placeholder="22:00"
            placeholderTextColor={GatiMitraMerchant.textTertiary}
          />
        </View>
      </View>

      <View style={styles.row}>
        <View style={styles.half}>
          <Text style={styles.label}>Min order ₹</Text>
          <TextInput
            style={styles.input}
            value={v.minOrder}
            onChangeText={(t) => onChange({ minOrder: t })}
            keyboardType="decimal-pad"
            placeholder="Optional"
            placeholderTextColor={GatiMitraMerchant.textTertiary}
          />
        </View>
        <View style={styles.half}>
          <Text style={styles.label}>Max order ₹</Text>
          <TextInput
            style={styles.input}
            value={v.maxOrder}
            onChangeText={(t) => onChange({ maxOrder: t })}
            keyboardType="decimal-pad"
            placeholder="Optional"
            placeholderTextColor={GatiMitraMerchant.textTertiary}
          />
        </View>
      </View>

      <View style={styles.row}>
        <View style={styles.half}>
          <Text style={styles.label}>Total uses</Text>
          <TextInput
            style={styles.input}
            value={v.maxUsesTotal}
            onChangeText={(t) => onChange({ maxUsesTotal: t })}
            keyboardType="number-pad"
            placeholder="Unlimited"
            placeholderTextColor={GatiMitraMerchant.textTertiary}
          />
        </View>
        <View style={styles.half}>
          <Text style={styles.label}>Per user</Text>
          <TextInput
            style={styles.input}
            value={v.maxUsesPerUser}
            onChangeText={(t) => onChange({ maxUsesPerUser: t })}
            keyboardType="number-pad"
            placeholder="Unlimited"
            placeholderTextColor={GatiMitraMerchant.textTertiary}
          />
        </View>
      </View>

      <Text style={styles.label}>Priority (0 = default)</Text>
      <TextInput
        style={styles.input}
        value={v.priority}
        onChangeText={(t) => onChange({ priority: t })}
        keyboardType="number-pad"
        placeholderTextColor={GatiMitraMerchant.textTertiary}
      />

      <ToggleRow label="Offer active" value={v.isActive} onPress={() => onChange({ isActive: !v.isActive })} />
      <ToggleRow label="Auto-apply (no coupon code)" value={v.autoApply} onPress={() => onChange({ autoApply: !v.autoApply })} />
      <ToggleRow label="Stackable with other offers" value={v.isStackable} onPress={() => onChange({ isStackable: !v.isStackable })} />
      <ToggleRow label="First order only" value={v.firstOrderOnly} onPress={() => onChange({ firstOrderOnly: !v.firstOrderOnly })} />
      <ToggleRow label="New users only" value={v.newUserOnly} onPress={() => onChange({ newUserOnly: !v.newUserOnly })} />
    </>
  );

  const renderReview = () => (
    <>
      <Text style={styles.stepHint}>
        {editing ? "Review changes before updating." : "Review before creating."}
      </Text>
      <View style={styles.reviewCard}>
        {reviewRows.map((row) => (
          <View key={row.label} style={styles.reviewRow}>
            <Text style={styles.reviewLabel}>{row.label}</Text>
            <Text style={styles.reviewValue}>{row.value}</Text>
          </View>
        ))}
      </View>
    </>
  );

  const renderStep = () => {
    switch (step) {
      case "basic":
        return renderBasic();
      case "type":
        return renderType();
      case "applicability":
        return renderApplicability();
      case "conditions":
        return renderConditions();
      case "review":
        return renderReview();
      default:
        return null;
    }
  };

  const isLast = stepIndex === WIZARD_STEPS.length - 1;
  const primaryLabel = isLast ? (editing ? "Update offer" : "Create offer") : "Next";

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <KeyboardAvoidingView style={styles.root} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <View style={styles.header}>
          <Pressable onPress={goBack} hitSlop={12}>
            <Ionicons name={stepIndex === 0 ? "close" : "chevron-back"} size={24} color={OFFERS_UI.text} />
          </Pressable>
          <View style={styles.headerCenter}>
            <Text style={styles.headerTitle} numberOfLines={1}>
              {editing ? (v.title.trim() ? `Edit: ${v.title.trim()}` : "Edit offer") : "Create offer"}
            </Text>
            <Text style={styles.headerStep}>
              Step {stepIndex + 1}/{WIZARD_STEPS.length}: {WIZARD_STEPS[stepIndex].label}
            </Text>
          </View>
          <View style={{ width: 28 }} />
        </View>

        <View style={styles.progress}>
          {WIZARD_STEPS.map((s, i) => (
            <View
              key={s.id}
              style={[styles.progressDot, i <= stepIndex && styles.progressDotActive]}
            />
          ))}
        </View>

        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
        >
          {renderStep()}
        </ScrollView>

        <View style={styles.footer}>
          {stepIndex > 0 ? (
            <Pressable onPress={() => setStepIndex((i) => i - 1)} style={styles.backBtn}>
              <Text style={styles.backBtnText}>Back</Text>
            </Pressable>
          ) : (
            <View style={styles.backBtnPlaceholder} />
          )}
          <Pressable
            onPress={goNext}
            disabled={saving}
            style={({ pressed }) => [
              styles.primaryBtn,
              saving && styles.primaryDisabled,
              pressed && !saving && { opacity: 0.92 },
            ]}
          >
            {saving ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.primaryBtnText}>{primaryLabel}</Text>
            )}
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#fff" },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: OFFERS_UI.cardBorder,
  },
  headerCenter: { flex: 1, alignItems: "center" },
  headerTitle: { fontSize: 17, fontWeight: "800", color: OFFERS_UI.text },
  headerStep: { fontSize: 12, color: GatiMitraMerchant.textSecondary, marginTop: 2 },
  progress: {
    flexDirection: "row",
    gap: 6,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  progressDot: {
    flex: 1,
    height: 4,
    borderRadius: 2,
    backgroundColor: GatiMitraMerchant.surfaceSubtle,
  },
  progressDotActive: { backgroundColor: GatiMitraMerchant.primary },
  scroll: { flex: 1 },
  scrollContent: { padding: 16, paddingBottom: 32 },
  stepHint: { fontSize: 13, color: GatiMitraMerchant.textSecondary, marginBottom: 14, lineHeight: 19 },
  label: {
    fontSize: 11,
    fontWeight: "700",
    color: GatiMitraMerchant.textSecondary,
    textTransform: "uppercase",
    letterSpacing: 0.4,
    marginTop: 8,
    marginBottom: 4,
  },
  input: {
    borderWidth: 1,
    borderColor: GatiMitraMerchant.border,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 11,
    fontSize: 15,
    color: GatiMitraMerchant.textPrimary,
    backgroundColor: "#fff",
  },
  row: { flexDirection: "row", gap: 10 },
  half: { flex: 1 },
  typeScroll: { marginBottom: 8 },
  typeChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 99,
    backgroundColor: GatiMitraMerchant.surfaceSubtle,
    marginRight: 8,
    borderWidth: 1,
    borderColor: GatiMitraMerchant.border,
  },
  typeChipActive: { backgroundColor: GatiMitraMerchant.primary, borderColor: GatiMitraMerchant.primary },
  typeChipText: { fontSize: 12, fontWeight: "600", color: GatiMitraMerchant.textSecondary },
  typeChipTextActive: { color: "#fff" },
  imageRow: { flexDirection: "row", alignItems: "center", gap: 12, marginTop: 4 },
  imageBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: GatiMitraMerchant.primary,
  },
  imageBtnText: { color: "#fff", fontWeight: "700", fontSize: 13 },
  imagePreview: { width: 64, height: 64, borderRadius: 10, borderWidth: 1, borderColor: GatiMitraMerchant.border },
  uploadRow: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 8 },
  uploadText: { fontSize: 12, color: GatiMitraMerchant.textSecondary },
  toggleRow: { flexDirection: "row", alignItems: "center", gap: 10, marginTop: 12 },
  toggleLabel: { fontSize: 14, color: GatiMitraMerchant.textPrimary, flex: 1 },
  infoBox: {
    flexDirection: "row",
    gap: 8,
    backgroundColor: "#F0F9FF",
    padding: 12,
    borderRadius: 10,
    marginTop: 12,
  },
  infoText: { flex: 1, fontSize: 13, color: GatiMitraMerchant.navy, lineHeight: 18 },
  segment: {
    flexDirection: "row",
    backgroundColor: GatiMitraMerchant.surfaceSubtle,
    borderRadius: 10,
    padding: 4,
    gap: 4,
  },
  segBtn: { flex: 1, paddingVertical: 10, borderRadius: 8, alignItems: "center" },
  segBtnActive: { backgroundColor: "#fff", ...GatiMitraMerchant.shadowSm },
  segText: { fontSize: 13, fontWeight: "600", color: GatiMitraMerchant.textSecondary },
  segTextActive: { color: GatiMitraMerchant.textPrimary, fontWeight: "700" },
  menuList: { marginTop: 8, maxHeight: 280 },
  menuRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: GatiMitraMerchant.border,
  },
  menuRowSelected: { backgroundColor: OFFERS_UI.accentSoft },
  menuTextCol: { flex: 1 },
  menuName: { fontSize: 14, fontWeight: "600", color: GatiMitraMerchant.textPrimary },
  menuId: { fontSize: 11, color: GatiMitraMerchant.textTertiary },
  emptyMenu: { textAlign: "center", color: GatiMitraMerchant.textTertiary, padding: 16 },
  selectedCount: { fontSize: 12, fontWeight: "600", color: GatiMitraMerchant.primary, marginTop: 8 },
  reviewCard: {
    borderWidth: 1,
    borderColor: GatiMitraMerchant.border,
    borderRadius: 12,
    overflow: "hidden",
  },
  reviewRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingHorizontal: 14,
    paddingVertical: 11,
    borderBottomWidth: 1,
    borderBottomColor: GatiMitraMerchant.border,
    gap: 12,
  },
  reviewLabel: { fontSize: 13, color: GatiMitraMerchant.textSecondary, flex: 1 },
  reviewValue: { fontSize: 13, fontWeight: "700", color: GatiMitraMerchant.textPrimary, flex: 1, textAlign: "right" },
  footer: {
    flexDirection: "row",
    gap: 10,
    padding: 16,
    paddingBottom: Platform.OS === "ios" ? 28 : 16,
    borderTopWidth: 1,
    borderTopColor: OFFERS_UI.cardBorder,
  },
  backBtn: {
    paddingHorizontal: 20,
    justifyContent: "center",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: GatiMitraMerchant.border,
  },
  backBtnPlaceholder: { width: 72 },
  backBtnText: { fontSize: 15, fontWeight: "600", color: GatiMitraMerchant.textSecondary },
  primaryBtn: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 14,
    borderRadius: 12,
    backgroundColor: GatiMitraMerchant.primary,
  },
  primaryDisabled: { opacity: 0.65 },
  primaryBtnText: { fontSize: 16, fontWeight: "700", color: "#fff" },
});
