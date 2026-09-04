/**
 * Rider advisory when nearby Prevent Services blocks are active.
 * Does NOT change duty status — only explains why some requests may be hidden.
 * Shown once per signal version until Got It; resets when the restriction version changes.
 */

import React, { useCallback, useEffect, useRef, useState } from "react";
import { View, Text, Pressable, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as SecureStore from "expo-secure-store";
import { BlockingBottomSheetShell } from "@/src/components/vehicle/BlockingBottomSheetShell";
import { getRiderAppConfig } from "@/src/config/env";
import { useRiderLocationStore } from "@/src/stores/riderLocationStore";
import { onPreventServicesSignal } from "@/src/lib/preventServicesSignalBus";
import { colors } from "@/src/theme";

const ACK_KEY = "prevent_services_rider_ack_version";
const TITLE = "Service Restricted";
const BODY =
  "Some nearby delivery areas have been temporarily disabled by GatiMitra Admin.\n\nYou will continue receiving delivery requests from all active areas.\n\nOnly requests originating from blocked areas will be hidden.";

/** ~110m buckets — GPS jitter must not refetch impact on every store tick. */
function roundCoord3(v: number): number {
  return Math.round(v * 1000) / 1000;
}

type ImpactResponse = {
  ok?: boolean;
  affected?: boolean;
  signalVersion?: number;
};

async function fetchRiderImpact(lat: number, lng: number): Promise<ImpactResponse | null> {
  try {
    const base = getRiderAppConfig().apiBaseUrl.replace(/\/+$/, "");
    const qs = new URLSearchParams({ lat: String(lat), lng: String(lng) });
    const res = await fetch(`${base}/v1/prevent-services/impact/rider?${qs}`, {
      cache: "no-store",
    });
    if (!res.ok) return null;
    return (await res.json()) as ImpactResponse;
  } catch {
    return null;
  }
}

export function ServiceRestrictedSheet() {
  const lat = useRiderLocationStore((s) => {
    const v = s.coords?.latitude;
    return v != null && Number.isFinite(v) ? roundCoord3(v) : null;
  });
  const lng = useRiderLocationStore((s) => {
    const v = s.coords?.longitude;
    return v != null && Number.isFinite(v) ? roundCoord3(v) : null;
  });
  const [visible, setVisible] = useState(false);
  const [signalVersion, setSignalVersion] = useState(0);
  const [ackedVersion, setAckedVersion] = useState<number | null>(null);
  const [affected, setAffected] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastFetchKeyRef = useRef("");

  useEffect(() => {
    void (async () => {
      try {
        const raw = await SecureStore.getItemAsync(ACK_KEY);
        const n = raw != null ? Number(raw) : null;
        setAckedVersion(Number.isFinite(n as number) ? (n as number) : null);
      } catch {
        setAckedVersion(null);
      }
    })();
  }, []);

  const refresh = useCallback(async () => {
    if (lat == null || lng == null) {
      setAffected(false);
      setVisible(false);
      return;
    }
    const impact = await fetchRiderImpact(lat, lng);
    const version = Number(impact?.signalVersion ?? 0) || 0;
    setSignalVersion(version);
    const nextAffected = impact?.affected === true;
    setAffected(nextAffected);
    if (!nextAffected) {
      setVisible(false);
      return;
    }
    if (ackedVersion != null && version > 0 && ackedVersion >= version) {
      setVisible(false);
      return;
    }
    setVisible(true);
  }, [lat, lng, ackedVersion]);

  useEffect(() => {
    if (lat == null || lng == null) {
      lastFetchKeyRef.current = "";
      void refresh();
      return;
    }
    const key = `${lat},${lng}`;
    if (key === lastFetchKeyRef.current) {
      void refresh();
      return;
    }
    const first = lastFetchKeyRef.current === "";
    lastFetchKeyRef.current = key;
    if (first) {
      void refresh();
      return;
    }
    const t = setTimeout(() => {
      void refresh();
    }, 10_000);
    return () => clearTimeout(t);
  }, [lat, lng, refresh]);

  // Restriction cleared (or rider left the proximity) → hide immediately.
  useEffect(() => {
    if (!affected) setVisible(false);
  }, [affected]);

  useEffect(() => {
    const schedule = () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => {
        void refresh();
      }, 150);
    };
    const off = onPreventServicesSignal(schedule);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      off();
    };
  }, [refresh]);

  const onGotIt = useCallback(async () => {
    setVisible(false);
    setAckedVersion(signalVersion);
    try {
      await SecureStore.setItemAsync(ACK_KEY, String(signalVersion));
    } catch {}
  }, [signalVersion]);

  return (
    <BlockingBottomSheetShell visible={visible} maxHeightRatio={0.55}>
      <View style={styles.content}>
        <View style={styles.iconWrap}>
          <Ionicons name="shield-outline" size={28} color="#B45309" />
        </View>
        <Text style={styles.title}>{TITLE}</Text>
        <Text style={styles.body}>{BODY}</Text>
        <Pressable
          onPress={onGotIt}
          style={({ pressed }) => [styles.btn, pressed && { opacity: 0.9 }]}
        >
          <Text style={styles.btnText}>Got It</Text>
        </Pressable>
      </View>
    </BlockingBottomSheetShell>
  );
}

const styles = StyleSheet.create({
  content: {
    paddingHorizontal: 22,
    paddingTop: 8,
    paddingBottom: 8,
    alignItems: "center",
  },
  iconWrap: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: "#FEF3C7",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 14,
  },
  title: {
    fontSize: 18,
    fontWeight: "700",
    color: "#111827",
    textAlign: "center",
    marginBottom: 10,
  },
  body: {
    fontSize: 14,
    lineHeight: 21,
    color: "#4B5563",
    textAlign: "center",
    marginBottom: 22,
  },
  btn: {
    alignSelf: "stretch",
    backgroundColor: colors.primary[500],
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: "center",
  },
  btnText: {
    fontSize: 15,
    fontWeight: "700",
    color: "#FFFFFF",
  },
});
