import AsyncStorage from "@react-native-async-storage/async-storage";

const KEY = "gm.customer.push.deviceTokens.v1";

export type CustomerPushDeviceTokens = {
  expo: string | null;
  native: string | null;
};

export async function readCustomerPushDeviceTokens(): Promise<CustomerPushDeviceTokens> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    if (!raw) return { expo: null, native: null };
    const parsed = JSON.parse(raw) as Partial<CustomerPushDeviceTokens>;
    return {
      expo: typeof parsed.expo === "string" && parsed.expo.trim() ? parsed.expo.trim() : null,
      native: typeof parsed.native === "string" && parsed.native.trim() ? parsed.native.trim() : null,
    };
  } catch {
    return { expo: null, native: null };
  }
}

export async function writeCustomerPushDeviceTokens(tokens: CustomerPushDeviceTokens): Promise<void> {
  try {
    if (!tokens.expo && !tokens.native) {
      await AsyncStorage.removeItem(KEY);
      return;
    }
    await AsyncStorage.setItem(KEY, JSON.stringify(tokens));
  } catch {
    /* registration still proceeds in memory */
  }
}
