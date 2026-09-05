import AsyncStorage from "@react-native-async-storage/async-storage";

const PENDING_TOKEN_KEY = "pending.addressShareToken";

export async function storePendingAddressShareToken(token: string): Promise<void> {
  await AsyncStorage.setItem(PENDING_TOKEN_KEY, token.trim());
}

export async function peekPendingAddressShareToken(): Promise<string | null> {
  const token = await AsyncStorage.getItem(PENDING_TOKEN_KEY);
  return token?.trim() || null;
}

export async function clearPendingAddressShareToken(): Promise<void> {
  await AsyncStorage.removeItem(PENDING_TOKEN_KEY);
}

export async function resumePendingAddressShare(router: {
  replace: (path: string) => void;
}): Promise<void> {
  const token = await AsyncStorage.getItem(PENDING_TOKEN_KEY);
  if (token?.trim()) {
    router.replace(`/address/save?id=${encodeURIComponent(token.trim())}`);
  }
}
