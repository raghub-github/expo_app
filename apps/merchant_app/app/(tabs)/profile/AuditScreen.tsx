/**
 * Change history / Audit — lists store profile changes (edited by, last changes at, old/new data).
 * Read-only; data from GET store audit-logs.
 */

import { useState, useEffect } from "react";
import { AppText as Text } from "@/components/AppText";
import { View, ScrollView, StyleSheet, ActivityIndicator, Pressable } from "react-native";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { GatiMitraMerchant, H_PADDING, CARD_RADIUS } from "@/constants/theme";
import { useSelectedStore } from "@/context/SelectedStoreContext";
import { useAuth } from "@/context/AuthContext";
import { getStoreAuditLogs, type AuditLogEntry } from "@/services/outletApi";

function parsePgTimestamp(value: unknown): Date | null {
  if (value == null) return null;
  const raw = String(value).trim();
  let d = new Date(raw);
  if (!Number.isNaN(d.getTime())) return d;

  const m =
    /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2}):(\d{2})(?:\.(\d+))?(?:([+-]\d{2})(?::?(\d{2}))?)?$/.exec(
      raw,
    );
  if (!m) return null;
  const [, y, mo, da, h, mi, s, frac, offH, offM] = m;
  const year = Number(y);
  const month = Number(mo) - 1;
  const day = Number(da);
  const hour = Number(h);
  const minute = Number(mi);
  const sec = Number(s);
  const ms = frac ? Number(frac.slice(0, 3).padEnd(3, "0")) : 0;

  let utcMs = Date.UTC(year, month, day, hour, minute, sec, ms);
  if (offH) {
    const sign = offH.startsWith("-") ? -1 : 1;
    const absH = Math.abs(Number(offH));
    const absM = offM ? Number(offM) : 0;
    const offsetMinutes = sign * (absH * 60 + absM);
    utcMs -= offsetMinutes * 60 * 1000;
  }
  return new Date(utcMs);
}

function formatDate(value: unknown): string {
  if (value == null || value === "") return "—";
  const d = parsePgTimestamp(value);
  if (!d) return String(value);
  return d.toLocaleString("en-IN", {
    timeZone: "Asia/Kolkata",
    dateStyle: "medium",
    timeStyle: "short",
  });
}

function formatFieldLabel(field: string | null): string {
  if (!field) return "—";
  const map: Record<string, string> = {
    store_name: "Store name",
    full_address: "Address",
    city: "City",
    state: "State",
    postal_code: "Postal code",
    pickup_instruction: "Pickup instructions",
    cuisine_types: "Cuisines",
    food_categories: "Food categories",
  };
  return map[field] ?? field.replace(/_/g, " ");
}

function valueSummary(val: Record<string, unknown> | null): string {
  if (val == null) return "—";
  if (typeof val === "string") return val;
  if (typeof val === "number" || typeof val === "boolean") return String(val);
  if (Array.isArray(val)) return val.slice(0, 5).join(", ") + (val.length > 5 ? "…" : "");
  if (val && typeof val === "object") {
    if ("text" in val && typeof (val as any).text === "string") return (val as any).text;
    const parts = Object.entries(val)
      .slice(0, 3)
      .map(([k, v]) => `${k}: ${v}`);
    return parts.join(" · ") || "—";
  }
  return "—";
}

type AuditGroup = {
  id: string;
  created_at: string;
  performed_by: string;
  performed_by_name: string | null;
  performed_by_email: string | null;
  sections: string[];
  changes: AuditLogEntry[];
};

function groupAuditLogs(entries: AuditLogEntry[]): AuditGroup[] {
  const groups = new Map<string, AuditGroup>();
  for (const e of entries) {
    const meta = (e.audit_metadata ?? {}) as Record<string, unknown>;
    const requestId = typeof meta.request_id === "string" && meta.request_id.trim() ? meta.request_id.trim() : null;
    const createdKey = (() => {
      const d = parsePgTimestamp(e.created_at);
      if (!d) return String(e.created_at ?? "");
      // fallback bucket by minute (older logs without request_id)
      return d.toISOString().slice(0, 16);
    })();
    const key = requestId ?? `${e.performed_by_id ?? "na"}-${createdKey}`;
    const section = typeof meta.section === "string" ? meta.section : null;
    const existing = groups.get(key);
    if (!existing) {
      groups.set(key, {
        id: key,
        created_at: String(e.created_at ?? ""),
        performed_by: e.performed_by,
        performed_by_name: e.performed_by_name ?? null,
        performed_by_email: e.performed_by_email ?? null,
        sections: section ? [section] : [],
        changes: [e],
      });
    } else {
      existing.changes.push(e);
      if (section && !existing.sections.includes(section)) existing.sections.push(section);
      // keep newest timestamp in group header
      if (String(e.created_at ?? "") > existing.created_at) existing.created_at = String(e.created_at ?? "");
    }
  }
  // sort groups newest first
  return Array.from(groups.values()).sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));
}

function normalizeChanges(changes: AuditLogEntry[]): Array<{ label: string; oldText: string; newText: string }> {
  const byField = new Map<string, AuditLogEntry>();
  for (const c of changes) {
    const k = c.action_field ?? "";
    if (!k) continue;
    byField.set(k, c);
  }
  const hasLat = byField.has("latitude");
  const hasLon = byField.has("longitude");
  const out: Array<{ label: string; oldText: string; newText: string }> = [];

  if (hasLat || hasLon) {
    const lat = byField.get("latitude");
    const lon = byField.get("longitude");
    const oldLat = lat ? valueSummary(lat.old_value) : "—";
    const oldLon = lon ? valueSummary(lon.old_value) : "—";
    const newLat = lat ? valueSummary(lat.new_value) : "—";
    const newLon = lon ? valueSummary(lon.new_value) : "—";
    out.push({
      label: "Location (lat, lon)",
      oldText: `${oldLat}, ${oldLon}`,
      newText: `${newLat}, ${newLon}`,
    });
    byField.delete("latitude");
    byField.delete("longitude");
  }

  const ordered = Array.from(byField.values()).sort((a, b) => String(a.action_field).localeCompare(String(b.action_field)));
  for (const c of ordered) {
    out.push({
      label: formatFieldLabel(c.action_field),
      oldText: valueSummary(c.old_value),
      newText: valueSummary(c.new_value),
    });
  }
  return out;
}

export default function AuditScreen() {
  const router = useRouter();
  const { selectedStore } = useSelectedStore();
  const { token } = useAuth();
  const [logs, setLogs] = useState<AuditLogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const storeId = selectedStore?.id ?? null;

  useEffect(() => {
    if (!storeId || !token) {
      setLoading(false);
      if (!token) setError("Not signed in.");
      else if (!storeId) setError("No store selected.");
      return;
    }
    let cancelled = false;
    getStoreAuditLogs(storeId, token)
      .then((list) => {
        if (!cancelled) setLogs(list);
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof Error ? e.message : "Failed to load");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [storeId, token]);

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={GatiMitraMerchant.primary} />
        <Text style={styles.loadingText}>Loading change history…</Text>
      </View>
    );
  }

  if (error) {
    return (
      <View style={styles.centered}>
        <Ionicons name="alert-circle-outline" size={48} color={GatiMitraMerchant.textTertiary} />
        <Text style={styles.errorText}>{error}</Text>
        <Pressable onPress={() => router.back()} style={styles.backBtn}>
          <Text style={styles.backBtnText}>Go back</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.sectionTitle}>Audit Logs</Text>
        {logs.length === 0 ? (
          <View style={styles.emptyCard}>
            <Ionicons name="document-text-outline" size={40} color={GatiMitraMerchant.textTertiary} />
            <Text style={styles.emptyText}>No changes recorded yet</Text>
          </View>
        ) : (
          groupAuditLogs(logs).map((g) => {
            const items = normalizeChanges(g.changes);
            const sections = g.sections.length ? g.sections.join(", ") : "store";
            const who = g.performed_by_name ?? g.performed_by_email ?? g.performed_by ?? "—";
            return (
              <View key={g.id} style={styles.card}>
                <View style={styles.cardHeader}>
                  <Text style={styles.fieldLabel}>Updated {sections}</Text>
                  <Text style={styles.dateText}>{formatDate(g.created_at)}</Text>
                </View>
                <View style={styles.metaRow}>
                  <Ionicons name="person-outline" size={14} color={GatiMitraMerchant.textSecondary} />
                  <Text style={styles.metaText}>Edited by {who}</Text>
                </View>
                <View style={styles.changesList}>
                  {items.map((it, idx) => (
                    <View key={idx} style={[styles.changeRow, idx === items.length - 1 && styles.changeRowLast]}>
                      <Text style={styles.changeLabel}>{it.label}</Text>
                      <Text style={styles.changeValue} numberOfLines={2}>
                        {it.oldText} → {it.newText}
                      </Text>
                    </View>
                  ))}
                </View>
              </View>
            );
          })
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: GatiMitraMerchant.surfaceWarm },
  centered: { flex: 1, justifyContent: "center", alignItems: "center", padding: H_PADDING },
  loadingText: { marginTop: 12, fontSize: 14, color: GatiMitraMerchant.textSecondary },
  errorText: { marginTop: 12, fontSize: 15, color: GatiMitraMerchant.textSecondary, textAlign: "center" },
  backBtn: { marginTop: 20, paddingVertical: 12, paddingHorizontal: 20, backgroundColor: GatiMitraMerchant.surfaceSubtle, borderRadius: 10 },
  backBtnText: { fontSize: 15, fontWeight: "600", color: GatiMitraMerchant.primary },

  scroll: { flex: 1 },
  scrollContent: { padding: H_PADDING, paddingBottom: 40 },
  sectionTitle: { fontSize: 15, fontWeight: "700", color: GatiMitraMerchant.textPrimary, marginBottom: 4 },
  hint: { fontSize: 13, color: GatiMitraMerchant.textSecondary, marginBottom: 12 },
  emptyCard: {
    backgroundColor: GatiMitraMerchant.cardBg,
    borderRadius: CARD_RADIUS,
    padding: 24,
    alignItems: "center",
    borderWidth: 1,
    borderColor: GatiMitraMerchant.border,
  },
  emptyText: { marginTop: 8, fontSize: 14, color: GatiMitraMerchant.textTertiary },

  card: {
    backgroundColor: GatiMitraMerchant.cardBg,
    borderRadius: CARD_RADIUS,
    padding: 12,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: GatiMitraMerchant.border,
  },
  cardHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 6 },
  fieldLabel: { fontSize: 14, fontWeight: "600", color: GatiMitraMerchant.textPrimary },
  dateText: { fontSize: 12, color: GatiMitraMerchant.textTertiary },
  metaRow: { flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 10 },
  metaText: { fontSize: 12, color: GatiMitraMerchant.textSecondary },
  changesList: { borderTopWidth: 1, borderTopColor: GatiMitraMerchant.divider, paddingTop: 10 },
  changeRow: { paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: GatiMitraMerchant.divider },
  changeRowLast: { borderBottomWidth: 0 },
  changeLabel: { fontSize: 11, fontWeight: "700", color: GatiMitraMerchant.textSecondary, textTransform: "uppercase", letterSpacing: 0.3, marginBottom: 2 },
  changeValue: { fontSize: 13, color: GatiMitraMerchant.textPrimary },
});
