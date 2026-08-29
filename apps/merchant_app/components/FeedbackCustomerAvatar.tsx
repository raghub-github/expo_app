import { useEffect, useState } from "react";
import { StyleSheet, View } from "react-native";
import { AppText as Text } from "@/components/AppText";
import { GatiMitraMerchant } from "@/constants/theme";
import { AuthProxyImage } from "@/components/AuthProxyImage";

export function customerNameInitial(name?: string | null): string {
  const trimmed = (name ?? "").trim();
  if (!trimmed) return "C";
  const ch = Array.from(trimmed)[0];
  return ch ? ch.toUpperCase() : "C";
}

function usableCustomerPhotoUrl(uri?: string | null): string | null {
  const s = (uri ?? "").trim();
  if (!s) return null;
  const u = s.toLowerCase();
  if (u.includes("fallback.png")) return null;
  if (u.includes("d=mp") || u.includes("d=404")) return null;
  if (u.includes("customers/profile-images")) return s;
  if (!u.includes("/attachments/proxy")) return null;
  try {
    const parsed = /^https?:\/\//i.test(s) ? new URL(s) : new URL(s, "https://local.invalid");
    const key = `${parsed.searchParams.get("key") ?? ""} ${parsed.searchParams.get("url") ?? ""}`.toLowerCase();
    if (key.includes("customers/profile-images")) return s;
  } catch {
    /* letter fallback */
  }
  return null;
}

export function FeedbackCustomerAvatar({
  uri,
  name,
  token,
  size = 36,
}: {
  uri?: string | null;
  name?: string | null;
  token?: string | null;
  size?: number;
}) {
  const photo = usableCustomerPhotoUrl(uri);
  const [imgFailed, setImgFailed] = useState(false);

  useEffect(() => {
    setImgFailed(false);
  }, [photo]);

  return (
    <View
      style={[
        styles.fallback,
        { width: size, height: size, borderRadius: size / 2, overflow: "hidden" },
      ]}
    >
      <Text style={[styles.letter, { fontSize: Math.round(size * 0.38) }]}>
        {customerNameInitial(name)}
      </Text>
      {photo && !imgFailed ? (
        <AuthProxyImage
          uri={photo}
          token={token}
          showPlaceholder={false}
          resizeMode="cover"
          onError={() => setImgFailed(true)}
          style={StyleSheet.absoluteFillObject}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  fallback: {
    backgroundColor: GatiMitraMerchant.surfaceSubtle,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: GatiMitraMerchant.border,
  },
  letter: {
    fontWeight: "800",
    color: GatiMitraMerchant.navy,
  },
});
