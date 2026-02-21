/**
 * Search page – opens when user taps search on home.
 * Back, location (Work + address), search bar with placeholder and mic.
 */

import { useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useLocationStore } from "@/store/locationStore";

const BG = "#FFFFFF";
const TITLE_DARK = "#1A1A1A";
const TEXT_GRAY = "#6B7280";
const BORDER = "#E5E7EB";
const TEAL = "#14b8a6";

export default function SearchScreen() {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const { address } = useLocationStore();
  const locationLabel = address?.primary ?? "Current location";
  const addressLine = address?.fullAddress ?? address?.secondary ?? "Turn on location for address";

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      {/* Header: back + location */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={24} color={TITLE_DARK} />
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.locationBlock}
          activeOpacity={0.8}
          onPress={() => router.push("/location")}
        >
          <Text style={styles.locationLabel} numberOfLines={1}>{locationLabel}</Text>
          <Ionicons name="chevron-down" size={18} color={TEXT_GRAY} />
        </TouchableOpacity>
      </View>
      <View style={styles.addressRow}>
        <Text style={styles.addressText} numberOfLines={2}>
          {addressLine}
        </Text>
      </View>

      {/* Search bar */}
      <View style={styles.searchWrap}>
        <View style={styles.searchBar}>
          <Ionicons name="search" size={22} color={TEXT_GRAY} />
          <TextInput
            style={styles.searchInput}
            placeholder="Search for outlets, deals & more"
            placeholderTextColor={TEXT_GRAY}
            value={query}
            onChangeText={setQuery}
            returnKeyType="search"
            autoCapitalize="none"
            autoCorrect={false}
          />
          <TouchableOpacity style={styles.micBtn} hitSlop={8}>
            <Ionicons name="mic-outline" size={22} color={TITLE_DARK} />
          </TouchableOpacity>
        </View>
      </View>

      {/* Empty state / results area */}
      <View style={styles.content}>
        {!query.trim() ? (
          <View style={styles.emptyState}>
            <Ionicons name="search-outline" size={48} color={BORDER} />
            <Text style={styles.emptyText}>Search for outlets, deals & more</Text>
          </View>
        ) : null}
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: BG,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingTop: 0,
    paddingBottom: 4,
  },
  backBtn: {
    padding: 8,
    marginRight: 8,
  },
  locationBlock: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
  },
  locationLabel: {
    fontSize: 18,
    fontWeight: "700",
    color: TITLE_DARK,
    marginRight: 4,
  },
  addressRow: {
    paddingHorizontal: 16,
    paddingLeft: 48,
    paddingBottom: 16,
  },
  addressText: {
    fontSize: 13,
    color: TEXT_GRAY,
    lineHeight: 20,
  },
  searchWrap: {
    paddingHorizontal: 16,
    marginBottom: 24,
  },
  searchBar: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#F5F5F5",
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderWidth: 1,
    borderColor: BORDER,
  },
  searchInput: {
    flex: 1,
    marginLeft: 12,
    fontSize: 16,
    color: TITLE_DARK,
    paddingVertical: 0,
  },
  micBtn: {
    padding: 4,
  },
  content: {
    flex: 1,
    paddingHorizontal: 16,
  },
  emptyState: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 48,
  },
  emptyText: {
    fontSize: 15,
    color: TEXT_GRAY,
    marginTop: 12,
  },
});
