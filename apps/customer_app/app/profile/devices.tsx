/**
 * Logged-in devices — shows active customer device sessions (where / which phone).
 */

import { useCallback, useEffect, useState } from "react";
import {
  View,
  ScrollView,
  StyleSheet,
  RefreshControl,
  ActivityIndicator,
} from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import { Ionicons } from "@expo/vector-icons";
import { AppText } from "@/components/AppText";
import { ProfileSubpageHeader } from "@/components/profile/ProfileSubpageHeader";
import { ProfileTheme } from "@/constants/profileTheme";
import api from "@/services/api";

const { greenDark: GREEN_DARK, text: TEXT, muted: MUTED, border: BORDER, pageBg: PAGE_BG } =
  ProfileTheme;

type DeviceSession = {
  id: number;
  deviceId: string | null;
  deviceType: string | null;
  deviceName: string | null;
  deviceModel: string | null;
  os: string | null;
  osVersion: string | null;
  appVersion: string | null;
  ipAddress: string | null;
  location: string | null;
  loginState: string | null;
  loginDistrict: string | null;
  loginTown: string | null;
  loginVillage: string | null;
  loginMethod: string | null;
  loginTime: string;
  lastActive: string;
  isActive: boolean;
  isCurrentDevice: boolean;
};

function formatWhen(iso: string): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function placeLabel(s: DeviceSession): string {
  const parts = [s.loginTown, s.loginDistrict, s.loginState, s.location].filter(
    (p): p is string => Boolean(p && p.trim())
  );
  const unique: string[] = [];
  for (const p of parts) {
    if (!unique.includes(p)) unique.push(p);
  }
  return unique.slice(0, 3).join(", ") || "Location unavailable";
}

function deviceTitle(s: DeviceSession): string {
  const name = (s.deviceName || s.deviceModel || "Mobile device").trim();
  const os = [s.os, s.osVersion].filter(Boolean).join(" ");
  return os ? `${name} · ${os}` : name;
}

export default function DevicesScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sessions, setSessions] = useState<DeviceSession[]>([]);

  const load = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    setError(null);
    try {
      const { data } = await api.get<{
        activeCount?: number;
        sessions?: DeviceSession[];
      }>("/v1/me/device-sessions", { timeout: 12_000 });
      setSessions(Array.isArray(data?.sessions) ? data.sessions : []);
    } catch {
      setError("Could not load devices. Pull to retry.");
      setSessions([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <View style={styles.screen}>
      <StatusBar style="dark" backgroundColor="#fff" />
      <ProfileSubpageHeader title="Logged-in devices" onBack={() => router.back()} />

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 24 }]}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={() => void load(true)} />
        }
        showsVerticalScrollIndicator={false}
      >
        <AppText style={styles.hint}>
          Places and phones where your GatiMitra account is currently signed in. Use
          Sign out → All devices to log out everywhere.
        </AppText>

        {loading ? (
          <View style={styles.center}>
            <ActivityIndicator color={GREEN_DARK} />
          </View>
        ) : error ? (
          <AppText style={styles.error}>{error}</AppText>
        ) : sessions.length === 0 ? (
          <View style={styles.emptyCard}>
            <Ionicons name="phone-portrait-outline" size={28} color={MUTED} />
            <AppText style={styles.emptyText}>
              No active devices yet. Sign in again to capture this phone.
            </AppText>
          </View>
        ) : (
          sessions.map((s) => (
            <View key={s.id} style={[styles.card, s.isCurrentDevice && styles.cardCurrent]}>
              <View style={styles.cardTop}>
                <View style={styles.iconWrap}>
                  <Ionicons name="phone-portrait-outline" size={20} color={GREEN_DARK} />
                </View>
                <View style={styles.cardText}>
                  <AppText style={styles.title} numberOfLines={2}>
                    {deviceTitle(s)}
                  </AppText>
                  {s.isCurrentDevice ? (
                    <AppText style={styles.badge}>This device</AppText>
                  ) : null}
                </View>
              </View>
              <View style={styles.metaRow}>
                <Ionicons name="location-outline" size={15} color={MUTED} />
                <AppText style={styles.meta} numberOfLines={2}>
                  {placeLabel(s)}
                </AppText>
              </View>
              <View style={styles.metaRow}>
                <Ionicons name="time-outline" size={15} color={MUTED} />
                <AppText style={styles.meta}>Last active {formatWhen(s.lastActive)}</AppText>
              </View>
              <View style={styles.metaRow}>
                <Ionicons name="log-in-outline" size={15} color={MUTED} />
                <AppText style={styles.meta}>Signed in {formatWhen(s.loginTime)}</AppText>
              </View>
            </View>
          ))
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: PAGE_BG },
  scroll: { flex: 1 },
  content: { paddingHorizontal: 16, paddingTop: 12 },
  hint: {
    fontSize: 13,
    color: MUTED,
    lineHeight: 19,
    marginBottom: 14,
  },
  center: { paddingVertical: 40, alignItems: "center" },
  error: { color: "#DC2626", fontSize: 14, marginTop: 8 },
  emptyCard: {
    backgroundColor: "#fff",
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: BORDER,
    padding: 20,
    alignItems: "center",
    gap: 10,
  },
  emptyText: { fontSize: 14, color: MUTED, textAlign: "center", lineHeight: 20 },
  card: {
    backgroundColor: "#fff",
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: BORDER,
    padding: 14,
    marginBottom: 10,
    gap: 8,
  },
  cardCurrent: {
    borderColor: "rgba(20,184,166,0.45)",
  },
  cardTop: { flexDirection: "row", alignItems: "flex-start", gap: 10 },
  iconWrap: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: "rgba(20,184,166,0.12)",
    alignItems: "center",
    justifyContent: "center",
  },
  cardText: { flex: 1, minWidth: 0 },
  title: { fontSize: 15, fontWeight: "700", color: TEXT },
  badge: {
    marginTop: 4,
    alignSelf: "flex-start",
    fontSize: 11,
    fontWeight: "700",
    color: GREEN_DARK,
  },
  metaRow: { flexDirection: "row", alignItems: "center", gap: 6, paddingLeft: 2 },
  meta: { flex: 1, fontSize: 13, color: MUTED, lineHeight: 18 },
});
