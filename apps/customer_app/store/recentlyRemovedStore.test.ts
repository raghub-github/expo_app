import assert from "node:assert/strict";
import { beforeEach, describe, it, mock } from "node:test";

const memory = new Map<string, string>();

mock.module("@react-native-async-storage/async-storage", {
  defaultExport: {
    getItem: async (key: string) => memory.get(key) ?? null,
    setItem: async (key: string, value: string) => {
      memory.set(key, value);
    },
    removeItem: async (key: string) => {
      memory.delete(key);
    },
  },
});

mock.module("react-native", {
  namedExports: {
    Platform: { OS: "ios", select: (x: Record<string, unknown>) => x.ios },
  },
});

mock.module("expo-secure-store", {
  namedExports: {
    getItemAsync: async () => null,
    setItemAsync: async () => undefined,
    deleteItemAsync: async () => undefined,
  },
});

mock.module("@/lib/customerScope", {
  namedExports: {
    getActiveCustomerScopeId: () => "cust-1",
    isOwnedByActiveCustomer: (ownerId: string | null | undefined) =>
      !!ownerId && ownerId === "cust-1",
  },
});

async function loadStore() {
  return import("./recentlyRemovedStore");
}

type CartItem = {
  lineId: string;
  menuItemId: string;
  name: string;
  price: number;
  quantity: number;
  isVeg: boolean;
};

function item(partial: Partial<CartItem> & Pick<CartItem, "menuItemId" | "name">): CartItem {
  return {
    lineId: `${partial.menuItemId}::::`,
    price: 100,
    quantity: 1,
    isVeg: true,
    ...partial,
  };
}

describe("recentlyRemovedStore", () => {
  beforeEach(() => {
    memory.clear();
  });

  it("does not record quantity changes that leave the item in cart (caller responsibility)", async () => {
    const { useRecentlyRemovedStore } = await loadStore();
    useRecentlyRemovedStore.setState({
      entries: [],
      restoringKeys: {},
      hydrated: true,
    });
    assert.equal(useRecentlyRemovedStore.getState().entries.length, 0);
  });

  it("captureRemoval bounds history to two unique configs", async () => {
    const { useRecentlyRemovedStore } = await loadStore();
    useRecentlyRemovedStore.setState({
      entries: [],
      restoringKeys: {},
      hydrated: true,
    });
    const store = useRecentlyRemovedStore.getState();
    store.captureRemoval({
      merchantId: "m1",
      merchantName: "R1",
      item: item({ menuItemId: "a", name: "A" }),
      quantity: 1,
    });
    store.captureRemoval({
      merchantId: "m1",
      merchantName: "R1",
      item: item({ menuItemId: "b", name: "B" }),
      quantity: 1,
    });
    store.captureRemoval({
      merchantId: "m1",
      merchantName: "R1",
      item: item({ menuItemId: "c", name: "C" }),
      quantity: 1,
    });
    const entries = useRecentlyRemovedStore.getState().getForMerchant("m1");
    assert.equal(entries.length, 2);
    assert.equal(entries[0]!.line.name, "C");
    assert.equal(entries[1]!.line.name, "B");
  });

  it("beginRestore blocks duplicate in-flight restores", async () => {
    const { useRecentlyRemovedStore } = await loadStore();
    useRecentlyRemovedStore.setState({
      entries: [],
      restoringKeys: {},
      hydrated: true,
    });
    const store = useRecentlyRemovedStore.getState();
    store.captureRemoval({
      merchantId: "m1",
      merchantName: "R1",
      item: item({ menuItemId: "a", name: "A" }),
      quantity: 2,
    });
    const key = useRecentlyRemovedStore.getState().entries[0]!.entryKey;
    assert.equal(store.beginRestore(key), true);
    assert.equal(useRecentlyRemovedStore.getState().beginRestore(key), false);
    useRecentlyRemovedStore.getState().endRestore(key);
    assert.equal(useRecentlyRemovedStore.getState().beginRestore(key), true);
  });

  it("keeps entry after recoverable failure (endRestore without remove)", async () => {
    const { useRecentlyRemovedStore } = await loadStore();
    useRecentlyRemovedStore.setState({
      entries: [],
      restoringKeys: {},
      hydrated: true,
    });
    const store = useRecentlyRemovedStore.getState();
    store.captureRemoval({
      merchantId: "m1",
      merchantName: "R1",
      item: item({ menuItemId: "a", name: "A" }),
      quantity: 1,
    });
    const key = useRecentlyRemovedStore.getState().entries[0]!.entryKey;
    assert.equal(store.beginRestore(key), true);
    store.endRestore(key);
    assert.equal(useRecentlyRemovedStore.getState().entries.length, 1);
    assert.equal(useRecentlyRemovedStore.getState().restoringKeys[key], undefined);
  });

  it("removeAfterSuccessfulRestore drops the entry", async () => {
    const { useRecentlyRemovedStore } = await loadStore();
    useRecentlyRemovedStore.setState({
      entries: [],
      restoringKeys: {},
      hydrated: true,
    });
    const store = useRecentlyRemovedStore.getState();
    store.captureRemoval({
      merchantId: "m1",
      merchantName: "R1",
      item: item({ menuItemId: "a", name: "A" }),
      quantity: 1,
    });
    const key = useRecentlyRemovedStore.getState().entries[0]!.entryKey;
    store.beginRestore(key);
    store.removeAfterSuccessfulRestore(key);
    assert.equal(useRecentlyRemovedStore.getState().entries.length, 0);
  });

  it("clearForMerchant isolates store-switching history", async () => {
    const { useRecentlyRemovedStore } = await loadStore();
    useRecentlyRemovedStore.setState({
      entries: [],
      restoringKeys: {},
      hydrated: true,
    });
    const store = useRecentlyRemovedStore.getState();
    store.captureRemoval({
      merchantId: "m1",
      merchantName: "R1",
      item: item({ menuItemId: "a", name: "A" }),
      quantity: 1,
    });
    store.captureRemoval({
      merchantId: "m2",
      merchantName: "R2",
      item: item({ menuItemId: "b", name: "B" }),
      quantity: 1,
    });
    store.clearForMerchant("m1");
    assert.equal(useRecentlyRemovedStore.getState().getForMerchant("m1").length, 0);
    assert.equal(useRecentlyRemovedStore.getState().getForMerchant("m2").length, 1);
  });

  it("clearAll wipes session history", async () => {
    const { useRecentlyRemovedStore } = await loadStore();
    useRecentlyRemovedStore.setState({
      entries: [],
      restoringKeys: {},
      hydrated: true,
    });
    const store = useRecentlyRemovedStore.getState();
    store.captureRemoval({
      merchantId: "m1",
      merchantName: "R1",
      item: item({ menuItemId: "a", name: "A" }),
      quantity: 1,
    });
    store.clearAll();
    assert.equal(useRecentlyRemovedStore.getState().entries.length, 0);
  });

  it("persists captures and restores them on hydrate", async () => {
    const { useRecentlyRemovedStore } = await loadStore();
    const { STORAGE_KEYS } = await import("@/constants");
    useRecentlyRemovedStore.setState({
      hydrated: false,
      entries: [],
      restoringKeys: {},
    });
    const store = useRecentlyRemovedStore.getState();
    store.captureRemoval({
      merchantId: "m1",
      merchantName: "R1",
      item: item({ menuItemId: "paneer", name: "Paneer" }),
      quantity: 2,
    });
    await store.persist();
    assert.ok(memory.has(STORAGE_KEYS.RECENTLY_REMOVED));

    useRecentlyRemovedStore.setState({
      hydrated: false,
      entries: [],
      restoringKeys: {},
    });
    await useRecentlyRemovedStore.getState().hydrate();
    const restored = useRecentlyRemovedStore.getState().getForMerchant("m1");
    assert.equal(restored.length, 1);
    assert.equal(restored[0]!.line.name, "Paneer");
    assert.equal(restored[0]!.quantity, 2);
  });
});
