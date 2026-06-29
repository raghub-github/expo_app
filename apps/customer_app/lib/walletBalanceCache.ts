import AsyncStorage from "@react-native-async-storage/async-storage";
import type { QueryClient } from "@tanstack/react-query";
import { STORAGE_KEYS } from "@/constants";
import type { WalletBalance } from "@/services/wallet.service";

const ZERO_BALANCE: WalletBalance = {
  balance: 0,
  locked_amount: 0,
  available_balance: 0,
  currency: "INR",
};

let memoryCache: WalletBalance | undefined;

function parseWalletBalance(raw: unknown): WalletBalance | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const row = raw as Partial<WalletBalance>;
  if (row.currency !== "INR") return undefined;
  const balance = Number(row.balance ?? row.available_balance ?? 0);
  const locked = Number(row.locked_amount ?? 0);
  const available = Number(row.available_balance ?? balance - locked);
  if (!Number.isFinite(balance) || !Number.isFinite(available)) return undefined;
  return {
    balance,
    locked_amount: Number.isFinite(locked) ? locked : 0,
    available_balance: available,
    currency: "INR",
  };
}

export function readSyncWalletBalance(): WalletBalance | undefined {
  return memoryCache;
}

export async function hydrateWalletBalanceFromStorage(): Promise<WalletBalance | undefined> {
  if (memoryCache) return memoryCache;
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEYS.WALLET_BALANCE_CACHE);
    if (!raw) return undefined;
    const parsed = parseWalletBalance(JSON.parse(raw));
    if (parsed) memoryCache = parsed;
    return parsed;
  } catch {
    return undefined;
  }
}

export async function writeWalletBalanceCache(balance: WalletBalance): Promise<void> {
  memoryCache = balance;
  try {
    await AsyncStorage.setItem(STORAGE_KEYS.WALLET_BALANCE_CACHE, JSON.stringify(balance));
  } catch {
    // Non-blocking — memory cache still helps this session.
  }
}

export async function clearWalletBalanceCache(): Promise<void> {
  memoryCache = undefined;
  try {
    await AsyncStorage.removeItem(STORAGE_KEYS.WALLET_BALANCE_CACHE);
  } catch {
    /* ignore */
  }
}

export function seedWalletBalanceQuery(queryClient: QueryClient): void {
  const cached = readSyncWalletBalance();
  if (!cached) return;
  const existing = queryClient.getQueryData<WalletBalance>(["wallet", "balance"]);
  if (existing) return;
  queryClient.setQueryData(["wallet", "balance"], cached);
}

export async function hydrateWalletBalanceQuery(queryClient: QueryClient): Promise<void> {
  seedWalletBalanceQuery(queryClient);
  if (queryClient.getQueryData(["wallet", "balance"])) return;
  const cached = await hydrateWalletBalanceFromStorage();
  if (cached) queryClient.setQueryData(["wallet", "balance"], cached);
}

export function walletBalanceFallback(): WalletBalance {
  return readSyncWalletBalance() ?? ZERO_BALANCE;
}

void hydrateWalletBalanceFromStorage();
