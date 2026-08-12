import { useEffect, useState } from "react";
import { AppText as Text } from "@/components/AppText";
import { View, StyleSheet, ScrollView, ActivityIndicator, Image, TouchableOpacity } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  GatiMitraMerchant,
  H_PADDING,
  CARD_RADIUS,
  TAB_BAR_SCROLL_CONTENT_PADDING,
} from "@/constants/theme";
import { useAuth } from "@/context/AuthContext";
import { useSelectedStore } from "@/context/SelectedStoreContext";
import { fetchMenuItem, type MenuItemDetail } from "@/services/menuApi";
import { resolveImageUrl } from "@/services/outletApi";

function InfoRow({
  label,
  value,
  valueStyle,
}: {
  label: string;
  value: string;
  valueStyle?: object;
}) {
  return (
    <View style={styles.infoRow}>
      <Text style={styles.infoLabel}>{label}</Text>
      <Text style={[styles.infoValue, valueStyle]} numberOfLines={2}>
        {value}
      </Text>
    </View>
  );
}

export default function ItemDetailsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { id } = useLocalSearchParams<{ id: string }>();

  const { token } = useAuth();
  const { selectedStore } = useSelectedStore();
  const storeId = selectedStore?.store_id ?? null;

  const [item, setItem] = useState<MenuItemDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const numericId = id != null ? parseInt(id, 10) : NaN;

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      if (!token || !storeId || !id || Number.isNaN(numericId)) {
        setLoading(false);
        setError("Missing store or item.");
        return;
      }
      try {
        const data = await fetchMenuItem(storeId, numericId, token);
        if (cancelled) return;
        if (!data) {
          setError("Item not found.");
        } else {
          setItem(data);
        }
      } catch (e) {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : "Failed to load item.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    load();
    return () => {
      cancelled = true;
    };
  }, [storeId, token, id, numericId]);

  const scrollBottomPadding = TAB_BAR_SCROLL_CONTENT_PADDING + 16;

  const imageUri =
    item?.images?.[0]?.image_url != null
      ? resolveImageUrl(item.images[0].image_url) ?? item.images[0].image_url
      : item?.item_image_url
      ? resolveImageUrl(item.item_image_url) ?? item.item_image_url
      : null;

  return (
    <View style={styles.container}>
      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <TouchableOpacity
          onPress={() => router.back()}
          style={styles.headerBtn}
          hitSlop={8}
        >
          <Ionicons
            name="chevron-back"
            size={20}
            color={GatiMitraMerchant.textPrimary}
          />
        </TouchableOpacity>
        <Text style={styles.headerTitle} numberOfLines={1}>
          Item details
        </Text>
        <TouchableOpacity
          onPress={() => {
            if (!item) return;
            router.push({
              pathname: "/menu/add-edit-item",
              params: { itemId: String(item.id) },
            } as any);
          }}
          style={styles.headerEditBtn}
          hitSlop={8}
        >
          <Ionicons
            name="pencil-outline"
            size={20}
            color={GatiMitraMerchant.primary}
          />
          <Text style={styles.headerEditText}>Edit</Text>
        </TouchableOpacity>
      </View>

      {loading ? (
        <View style={[styles.centered, { flex: 1 }]}>
          <ActivityIndicator size="large" color={GatiMitraMerchant.primary} />
        </View>
      ) : error ? (
        <View style={[styles.centered, { flex: 1, paddingHorizontal: H_PADDING }]}>
          <Text style={styles.errorText}>{error}</Text>
        </View>
      ) : !item ? (
        <View style={[styles.centered, { flex: 1 }]}>
          <Text style={styles.errorText}>Item not found.</Text>
        </View>
      ) : (
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={[
            styles.scrollContent,
            { paddingBottom: scrollBottomPadding },
          ]}
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.card}>
            <View style={styles.imageRow}>
              <View style={styles.imageWrap}>
                {imageUri ? (
                  <Image
                    source={{ uri: imageUri }}
                    style={styles.image}
                    resizeMode="cover"
                  />
                ) : (
                  <View style={styles.imagePlaceholder}>
                    <Ionicons
                      name="restaurant-outline"
                      size={40}
                      color={GatiMitraMerchant.primary}
                    />
                  </View>
                )}
              </View>
              <View style={styles.basicInfo}>
                <Text style={styles.itemName} numberOfLines={2}>
                  {item.item_name}
                </Text>
                {item.item_description?.trim() ? (
                  <Text
                    style={styles.itemDescription}
                    numberOfLines={3}
                  >
                    {item.item_description.trim()}
                  </Text>
                ) : null}
                <View style={styles.badgeRow}>
                  {item.food_type && (
                    <View style={styles.badge}>
                      <Text style={styles.badgeText}>{item.food_type}</Text>
                    </View>
                  )}
                  {item.serves_label && (
                    <View style={styles.badge}>
                      <Text style={styles.badgeText}>{item.serves_label}</Text>
                    </View>
                  )}
                  {item.item_size_value != null &&
                    item.item_size_unit && (
                      <View style={styles.badge}>
                        <Text style={styles.badgeText}>
                          {item.item_size_value} {item.item_size_unit}
                        </Text>
                      </View>
                    )}
                </View>
              </View>
            </View>

            <View style={styles.priceRow}>
              <Text style={styles.priceLabel}>Selling price</Text>
              <Text style={styles.priceValue}>
                ₹{Number(item.selling_price).toFixed(0)}
              </Text>
            </View>
            <View style={styles.priceRow}>
              <Text style={styles.priceLabel}>Base price</Text>
              <Text style={styles.priceSub}>
                ₹{Number(item.base_price).toFixed(0)}
              </Text>
            </View>
          </View>

          {/* Item info / composition */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Item info</Text>
            <View style={styles.infoGrid}>
              <InfoRow
                label="Stock"
                value={item.in_stock ? "In stock" : "Out of stock"}
                valueStyle={item.in_stock ? styles.infoValueSuccess : styles.infoValueMuted}
              />
              {(item as any).approval_status && (
                <InfoRow
                  label="Status"
                  value={(item as any).approval_status}
                />
              )}
              {item.preparation_time_minutes != null && item.preparation_time_minutes > 0 && (
                <InfoRow label="Prep time" value={`${item.preparation_time_minutes} min`} />
              )}
              {(item as any).packaging_charges != null && Number((item as any).packaging_charges) > 0 && (
                <InfoRow label="Packaging" value={`₹${Number((item as any).packaging_charges).toFixed(0)}`} />
              )}
              {item.spice_level && (
                <InfoRow label="Spice level" value={String(item.spice_level)} />
              )}
              {item.cuisine_type && (
                <InfoRow label="Cuisine" value={String(item.cuisine_type)} />
              )}
              {(item.serves_label || (item.serves != null && item.serves > 0)) && (
                <InfoRow
                  label="Serves"
                  value={item.serves_label?.trim() || `${item.serves} person(s)`}
                />
              )}
              {item.item_size_value != null && item.item_size_unit && (
                <InfoRow
                  label="Size"
                  value={`${item.item_size_value} ${item.item_size_unit}`}
                />
              )}
              {item.allergens?.length ? (
                <InfoRow label="Allergens" value={item.allergens.join(", ")} />
              ) : null}
              {item.item_tags?.length ? (
                <InfoRow label="Tags" value={item.item_tags.join(", ")} />
              ) : null}
            </View>
          </View>

          {/* Nutritional info if present */}
          {((item as any).calories_kcal != null || (item as any).weight_per_serving != null) && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Nutrition & weight</Text>
              <View style={styles.infoGrid}>
                {(item as any).calories_kcal != null && (
                  <InfoRow label="Calories" value={`${(item as any).calories_kcal} kcal`} />
                )}
                {(item as any).weight_per_serving != null && (
                  <InfoRow
                    label="Weight/serving"
                    value={`${(item as any).weight_per_serving} ${(item as any).weight_per_serving_unit || "g"}`}
                  />
                )}
                {(item as any).protein != null && (
                  <InfoRow label="Protein" value={`${(item as any).protein} ${(item as any).protein_unit || "g"}`} />
                )}
                {(item as any).carbohydrates != null && (
                  <InfoRow label="Carbs" value={`${(item as any).carbohydrates} ${(item as any).carbohydrates_unit || "g"}`} />
                )}
                {(item as any).fat != null && (
                  <InfoRow label="Fat" value={`${(item as any).fat} ${(item as any).fat_unit || "g"}`} />
                )}
              </View>
            </View>
          )}

          {/* Variants — always show section */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>
              Variants {item.variants?.length ? `· ${item.variants.length}` : ""}
            </Text>
            {item.variants?.length ? (
              item.variants.map((v) => (
                <View key={v.id} style={styles.rowCard}>
                  <Text style={styles.rowPrimary} numberOfLines={1}>
                    {v.variant_name}
                  </Text>
                  <Text style={styles.rowMeta}>
                    ₹{Number(v.variant_price).toFixed(0)}
                    {v.is_default ? " · Default" : ""}
                    {v.in_stock === false ? " · Out of stock" : ""}
                  </Text>
                </View>
              ))
            ) : (
              <Text style={styles.emptySectionText}>No variants added.</Text>
            )}
          </View>

          {/* Customizations & add-ons — always show section */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>
              Customizations & add-ons {item.customizations?.length ? `· ${item.customizations.length} group(s)` : ""}
            </Text>
            {item.customizations?.length ? (
              item.customizations.map((g) => (
                <View key={g.id} style={styles.rowCard}>
                  <Text style={styles.rowPrimary} numberOfLines={1}>
                    {g.customization_title}
                  </Text>
                  <Text style={styles.rowMeta}>
                    {g.is_required ? "Required" : "Optional"} · Min {g.min_selection} · Max {g.max_selection}
                  </Text>
                  {g.options?.length ? (
                    <View style={styles.optionsList}>
                      <Text style={styles.optionsListLabel}>Add-ons:</Text>
                      {g.options.map((o) => (
                        <Text key={o.id} style={styles.optionLine} numberOfLines={1}>
                          {o.addon_name} · ₹{Number(o.addon_price).toFixed(0)}
                          {o.in_stock === false ? " · Out of stock" : ""}
                        </Text>
                      ))}
                    </View>
                  ) : (
                    <Text style={styles.emptyOptionText}>No add-on options.</Text>
                  )}
                </View>
              ))
            ) : (
              <Text style={styles.emptySectionText}>No customizations or add-ons added.</Text>
            )}
          </View>

          {/* Linked addon groups (reusable from Addon Library) */}
          {item.linked_modifier_groups && item.linked_modifier_groups.length > 0 ? (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>
                Linked addon groups · {item.linked_modifier_groups.length}
              </Text>
              {item.linked_modifier_groups.map((link) => (
                <View key={link.id} style={styles.rowCard}>
                  <Text style={styles.rowPrimary} numberOfLines={1}>
                    {link.title}
                  </Text>
                  <Text style={styles.rowMeta}>
                    {link.is_required ? "Required" : "Optional"} · Min {link.min_selection} · Max {link.max_selection}
                  </Text>
                  {link.options?.length ? (
                    <View style={styles.optionsList}>
                      <Text style={styles.optionsListLabel}>Options:</Text>
                      {link.options.map((o) => (
                        <Text key={o.id} style={styles.optionLine} numberOfLines={1}>
                          {o.name} · +₹{Number(o.price_delta).toFixed(0)}
                          {o.in_stock === false ? " · Out of stock" : ""}
                        </Text>
                      ))}
                    </View>
                  ) : null}
                </View>
              ))}
            </View>
          ) : null}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: GatiMitraMerchant.background },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: H_PADDING,
    paddingBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: GatiMitraMerchant.border,
    backgroundColor: GatiMitraMerchant.cardBg,
  },
  headerBtn: { width: 32 },
  headerTitle: {
    flex: 1,
    textAlign: "center",
    fontSize: 18,
    fontWeight: "700",
    color: GatiMitraMerchant.textPrimary,
  },
  headerEditBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  headerEditText: {
    fontSize: 13,
    fontWeight: "600",
    color: GatiMitraMerchant.primary,
  },
  scroll: { flex: 1 },
  scrollContent: {
    paddingHorizontal: H_PADDING,
    paddingTop: 16,
    gap: 16,
  },
  centered: {
    justifyContent: "center",
    alignItems: "center",
  },
  errorText: { fontSize: 14, color: GatiMitraMerchant.error },
  card: {
    backgroundColor: GatiMitraMerchant.cardBg,
    borderRadius: CARD_RADIUS,
    padding: 14,
    borderWidth: 1,
    borderColor: GatiMitraMerchant.border,
    ...GatiMitraMerchant.shadowSm,
  },
  imageRow: {
    flexDirection: "row",
    gap: 12,
  },
  imageWrap: {
    width: 88,
    height: 88,
    borderRadius: 12,
    overflow: "hidden",
    backgroundColor: GatiMitraMerchant.surfaceSubtle,
  },
  image: { width: "100%", height: "100%" },
  imagePlaceholder: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  basicInfo: { flex: 1, minWidth: 0 },
  itemName: {
    fontSize: 17,
    fontWeight: "800",
    color: GatiMitraMerchant.textPrimary,
    letterSpacing: -0.3,
  },
  itemDescription: {
    fontSize: 13,
    color: GatiMitraMerchant.textSecondary,
    marginTop: 4,
  },
  badgeRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
    marginTop: 6,
  },
  badge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
    backgroundColor: GatiMitraMerchant.surfaceSubtle,
  },
  badgeText: {
    fontSize: 11,
    fontWeight: "600",
    color: GatiMitraMerchant.textSecondary,
  },
  priceRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: 10,
  },
  priceLabel: {
    fontSize: 12,
    color: GatiMitraMerchant.textSecondary,
  },
  priceValue: {
    fontSize: 18,
    fontWeight: "800",
    color: GatiMitraMerchant.primary,
  },
  priceSub: {
    fontSize: 14,
    color: GatiMitraMerchant.textSecondary,
  },
  section: {
    backgroundColor: GatiMitraMerchant.cardBg,
    borderRadius: CARD_RADIUS,
    padding: 14,
    borderWidth: 1,
    borderColor: GatiMitraMerchant.border,
    ...GatiMitraMerchant.shadowSm,
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: "700",
    color: GatiMitraMerchant.textPrimary,
    marginBottom: 8,
  },
  rowCard: {
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: GatiMitraMerchant.divider,
  },
  rowPrimary: {
    fontSize: 14,
    fontWeight: "600",
    color: GatiMitraMerchant.textPrimary,
  },
  rowMeta: {
    fontSize: 12,
    color: GatiMitraMerchant.textSecondary,
    marginTop: 2,
  },
  optionsList: {
    marginTop: 6,
    gap: 4,
    paddingLeft: 4,
  },
  optionsListLabel: {
    fontSize: 11,
    fontWeight: "700",
    color: GatiMitraMerchant.textTertiary,
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginBottom: 2,
  },
  optionLine: {
    fontSize: 13,
    color: GatiMitraMerchant.textSecondary,
  },
  emptyOptionText: {
    fontSize: 12,
    color: GatiMitraMerchant.textTertiary,
    fontStyle: "italic",
    marginTop: 4,
  },
  emptySectionText: {
    fontSize: 13,
    color: GatiMitraMerchant.textTertiary,
    fontStyle: "italic",
    paddingVertical: 8,
  },
  infoGrid: { gap: 2 },
  infoRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 6,
    borderBottomWidth: 1,
    borderBottomColor: GatiMitraMerchant.divider || GatiMitraMerchant.border,
  },
  infoLabel: {
    fontSize: 12,
    fontWeight: "600",
    color: GatiMitraMerchant.textSecondary,
    marginRight: 12,
  },
  infoValue: {
    fontSize: 13,
    fontWeight: "500",
    color: GatiMitraMerchant.textPrimary,
    flex: 1,
    textAlign: "right",
  },
  infoValueSuccess: { color: GatiMitraMerchant.primary, fontWeight: "600" },
  infoValueMuted: { color: GatiMitraMerchant.textTertiary },
});

