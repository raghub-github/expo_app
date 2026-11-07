/**
 * Scenario tests for the whole "where is the customer" flow: the real location store,
 * reconcile, reverse geocode and search code, with only the outside world simulated
 * (GPS, Mapbox over HTTP, the backend).
 */
import { test, mock, beforeEach } from "node:test";
import assert from "node:assert/strict";

(globalThis as unknown as { __DEV__: boolean }).__DEV__ = false;

// ---------- simulated device ----------
type Loc = {
  coords: { latitude: number; longitude: number; accuracy: number | null };
  timestamp: number;
};
type WatchCb = (loc: Loc) => void;

const Accuracy = { Lowest: 1, Low: 2, Balanced: 3, High: 4, Highest: 5 };

const device = {
  lastKnown: null as Loc | null,
  oneShot: (() => new Promise<Loc>(() => {})) as (arg: { accuracy: number }) => Promise<Loc>,
  watches: [] as WatchCb[],
  watchStarts: 0,
  removed: 0,
  geocoder: (async () => []) as () => Promise<unknown[]>,
};

const at = (latitude: number, longitude: number, accuracy: number | null, ageMs = 0): Loc => ({
  coords: { latitude, longitude, accuracy },
  timestamp: Date.now() - ageMs,
});

mock.module("expo-location", {
  namedExports: {
    Accuracy,
    getLastKnownPositionAsync: async () => device.lastKnown,
    getCurrentPositionAsync: (arg: { accuracy: number }) => device.oneShot(arg),
    watchPositionAsync: async (_opts: unknown, cb: WatchCb) => {
      device.watchStarts += 1;
      device.watches.push(cb);
      return {
        remove: () => {
          device.removed += 1;
          device.watches = device.watches.filter((w) => w !== cb);
        },
      };
    },
    getForegroundPermissionsAsync: async () => ({ status: "granted", canAskAgain: true }),
    hasServicesEnabledAsync: async () => true,
    reverseGeocodeAsync: () => device.geocoder(),
  },
});

// ---------- simulated storage / platform ----------
const storage = new Map<string, string>();
mock.module("@react-native-async-storage/async-storage", {
  defaultExport: {
    getItem: async (k: string) => storage.get(k) ?? null,
    setItem: async (k: string, v: string) => void storage.set(k, v),
    removeItem: async (k: string) => void storage.delete(k),
    multiGet: async (keys: string[]) => keys.map((k) => [k, storage.get(k) ?? null]),
  },
});
mock.module("react-native", { namedExports: { Platform: { OS: "android" } } });
mock.module("@/config/env", {
  namedExports: { getConfig: () => ({ mapboxAccessToken: "pk.test" }) },
});

// ---------- simulated backend (same retention rule + zod validation as the real route) ----------
type Saved = { id: number; label: string; fullAddress: string; latitude: number; longitude: number };
const backend = {
  boundId: null as number | null,
  saved: null as Saved | null,
  reconcileCalls: [] as Array<{ latitude: number; longitude: number; capturedAtMs?: number; address?: string | null }>,
  retentionM: 500,
};

function metres(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371000;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

mock.module("@/services/address.service", {
  namedExports: {
    addressService: {
      reconcileActiveLocation: async (p: {
        latitude: number;
        longitude: number;
        address?: string | null;
        capturedAtMs?: number;
      }) => {
        // reconcileActiveLocationBodySchema: capturedAtMs is z.number().int().positive().
        if (p.capturedAtMs != null && !Number.isInteger(p.capturedAtMs)) {
          throw new Error("HTTP 400: capturedAtMs must be an integer");
        }
        backend.reconcileCalls.push(p);
        const current = (switchedToCurrent: boolean, reason: string, distanceM: number | null) => ({
          latitude: p.latitude,
          longitude: p.longitude,
          address: p.address ?? "Current location",
          addressId: null,
          lockedForOrder: false,
          source: "current",
          switchedToCurrent,
          reason,
          distanceM,
          retentionRadiusM: backend.retentionM,
          savedAddress: null,
        });
        if (backend.boundId == null || !backend.saved) return current(false, "no_bound_address", null);
        const s = backend.saved;
        const d = Math.round(metres(p.latitude, p.longitude, s.latitude, s.longitude));
        if (d <= backend.retentionM) {
          return {
            latitude: s.latitude,
            longitude: s.longitude,
            address: s.fullAddress,
            addressId: s.id,
            lockedForOrder: false,
            source: "selected",
            switchedToCurrent: false,
            reason: "kept_nearby",
            distanceM: d,
            retentionRadiusM: backend.retentionM,
            savedAddress: { ...s, city: "Patna", state: "Bihar", pincode: "800001" },
          };
        }
        backend.boundId = null; // the real backend clears the binding for good here
        return current(true, "switched_far", d);
      },
      getAddresses: async () => [],
      setActiveLocation: async () => {},
    },
  },
});
mock.module("@/store/authStore", {
  namedExports: { useAuthStore: { getState: () => ({ session: { accessToken: "t" } }) } },
});
mock.module("@/store/smsPermissionStore", {
  namedExports: { isSmsBlockingLocationPrompts: () => false },
});
mock.module("@/lib/applyActiveLocationFromBackend", {
  namedExports: { applyActiveLocationFromBackend: async () => false },
});
mock.module("@/lib/invalidateFoodHomeLocationQueries", {
  namedExports: {
    debouncedInvalidateFoodHomeListingQueries: () => {},
    invalidateFoodHomeLocationQueries: async () => {},
  },
});
mock.module("@/lib/promptCartIfLocationBrokeServiceability", {
  namedExports: { promptCartIfLocationBrokeServiceability: async () => {} },
});

// ---------- simulated Mapbox over HTTP ----------
type Route = (url: string, signal?: AbortSignal) => Promise<unknown> | "hang" | "error" | "http500";
const net = {
  calls: [] as string[],
  route: null as Route | null,
};

const v6Reverse = (name: string, lng: number, lat: number) => ({
  features: [
    {
      geometry: { coordinates: [lng, lat] },
      properties: { feature_type: "address", name, full_address: `${name}, Patna, 800001, India` },
    },
    { geometry: { coordinates: [lng, lat] }, properties: { feature_type: "postcode", name: "800001" } },
    { geometry: { coordinates: [lng, lat] }, properties: { feature_type: "locality", name: "Mithapur" } },
    { geometry: { coordinates: [lng, lat] }, properties: { feature_type: "place", name: "Patna" } },
    { geometry: { coordinates: [lng, lat] }, properties: { feature_type: "region", name: "Bihar" } },
  ],
});

function hang(signal?: AbortSignal): Promise<never> {
  return new Promise((_, reject) => {
    signal?.addEventListener("abort", () => reject(new Error("aborted")));
  });
}

globalThis.fetch = (async (input: unknown, init?: { signal?: AbortSignal }) => {
  const url = String(input);
  net.calls.push(url);
  const answer = net.route?.(url, init?.signal);
  if (answer === "hang") return hang(init?.signal);
  if (answer === "error") throw new TypeError("Network request failed");
  if (answer === "http500") return { ok: false, status: 500, json: async () => ({}) };
  const body = await answer;
  return { ok: true, status: 200, headers: new Map(), json: async () => body ?? {} };
}) as unknown as typeof fetch;

const tick = (ms = 5) => new Promise((r) => setTimeout(r, ms));
async function until(check: () => boolean, ms = 3_000): Promise<boolean> {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    if (check()) return true;
    await tick(5);
  }
  return check();
}

const HOME = { latitude: 25.5941, longitude: 85.1376 };
/** ~11 km away from HOME. */
const OFFICE = { latitude: 25.6941, longitude: 85.1376 };
const SAVED_HOME: Saved = { id: 7, label: "Home", fullAddress: "Home Lane, Patna", ...HOME };

async function load() {
  const store = await import("@/store/locationStore");
  const reconcile = await import("@/lib/reconcileActiveLocationFromGps");
  const location = await import("@/services/location.service");
  const search = await import("@/services/locationSearch.service");
  const mapbox = await import("@/services/mapboxSearch.service");
  return { ...store, ...reconcile, ...location, ...search, mapbox };
}

function endGpsSession() {
  // A goal-quality fix ends any running session.
  for (const cb of [...device.watches]) cb(at(HOME.latitude, HOME.longitude, 5));
}

beforeEach(async () => {
  const { useLocationStore } = await load();
  const { clearLastKnownLocation } = await import("@/lib/lastKnownLocationCache");
  endGpsSession();
  await tick(10);
  clearLastKnownLocation();
  device.lastKnown = null;
  device.oneShot = () => new Promise(() => {});
  device.watches = [];
  device.watchStarts = 0;
  device.removed = 0;
  device.geocoder = async () => [];
  backend.boundId = null;
  backend.saved = null;
  backend.reconcileCalls = [];
  net.calls = [];
  net.route = (url) => {
    if (url.includes("/geocode/v6/reverse")) {
      const u = new URL(url);
      const lng = Number(u.searchParams.get("longitude"));
      const lat = Number(u.searchParams.get("latitude"));
      return Promise.resolve(v6Reverse(`Road at ${lat.toFixed(3)}`, lng, lat));
    }
    return Promise.resolve({});
  };
  // A selected write clears the store's address anchor and supersedes any old session.
  useLocationStore.getState().setAddressAndCoords(
    { primary: "x", secondary: "", fullAddress: "x" },
    { latitude: 1, longitude: 1 },
    { source: "selected" }
  );
  useLocationStore.setState({
    coords: null,
    address: null,
    coordsAccuracy: null,
    coordsUpdatedAt: null,
    coordsSource: null,
    locationFreshness: "UNKNOWN",
    locationSource: null,
    sessionSelectionKind: null,
    sessionBoundAddressId: null,
    permissionStatus: "granted",
    loading: false,
    refining: false,
  });
});

/** Yesterday's location on screen, as a cold start paints it. */
async function paintStale(point: { latitude: number; longitude: number }, primary = "Old Road") {
  const { useLocationStore, noteAddressResolvedAt } = await load();
  noteAddressResolvedAt(point);
  useLocationStore.setState({
    coords: { ...point },
    address: { primary, secondary: "", fullAddress: `${primary}, Patna`, city: "Patna", state: "Bihar", pincode: "800001" },
    coordsAccuracy: 15,
    coordsUpdatedAt: Date.now() - 20 * 3_600_000,
    coordsSource: "accurate",
    locationFreshness: "STALE",
    locationSource: "current",
  });
}

// ================= app open =================

test("stale cache: the header moves to the real location as soon as the first fix lands", async () => {
  const { useLocationStore } = await load();
  await paintStale(HOME);
  device.oneShot = async () => at(OFFICE.latitude, OFFICE.longitude, 80);

  await useLocationStore.getState().requestPermissionAndFetch({ forceDevice: true });

  assert.ok(await until(() => useLocationStore.getState().coords?.latitude === OFFICE.latitude));
  assert.ok(await until(() => useLocationStore.getState().address?.primary === "Road at 25.694"));
});

test("stale cache: reconcile decides on the live position, not the cached one", async () => {
  const { reconcileActiveLocationFromGps, useLocationStore } = await load();
  await paintStale(HOME);
  backend.boundId = SAVED_HOME.id;
  backend.saved = SAVED_HOME;
  device.lastKnown = at(OFFICE.latitude, OFFICE.longitude, 20, 2_000);

  const result = await reconcileActiveLocationFromGps();

  assert.equal(backend.reconcileCalls[0]!.latitude, OFFICE.latitude);
  assert.equal(result?.reason, "switched_far");
  assert.equal(useLocationStore.getState().locationSource, "current");
});

test("a coarse first fix must not un-bind a saved address the user is standing at", async () => {
  const { reconcileActiveLocationFromGps, useLocationStore } = await load();
  await paintStale(HOME, "Home");
  backend.boundId = SAVED_HOME.id;
  backend.saved = SAVED_HOME;
  // Cell tower: ~1.1 km off, and honest about it. GPS lands a moment later, at home.
  device.oneShot = async (arg) =>
    arg.accuracy === Accuracy.Low ? at(HOME.latitude + 0.01, HOME.longitude, 1_500) : new Promise(() => {});
  const pending = reconcileActiveLocationFromGps();
  await tick(100);
  for (const cb of device.watches) cb(at(HOME.latitude, HOME.longitude, 10));
  await pending;

  assert.equal(backend.boundId, SAVED_HOME.id, "the saved address binding was destroyed");
  assert.equal(useLocationStore.getState().sessionBoundAddressId, SAVED_HOME.id);
});

test("GPS late, cell fix within its error radius: the saved address stays bound", async () => {
  const { reconcileActiveLocationFromGps, useLocationStore } = await load();
  await paintStale(HOME, "Home");
  backend.boundId = SAVED_HOME.id;
  backend.saved = SAVED_HOME;
  device.oneShot = async (arg) =>
    arg.accuracy === Accuracy.Low ? at(HOME.latitude + 0.01, HOME.longitude, 1_500) : new Promise(() => {});
  await reconcileActiveLocationFromGps();
  assert.equal(backend.boundId, SAVED_HOME.id, "binding destroyed on a fix that proved nothing");
  assert.equal(backend.reconcileCalls[0]!.latitude, HOME.latitude);
  assert.equal(useLocationStore.getState().sessionBoundAddressId, SAVED_HOME.id);
});

test("approximate-location permission: a coarse fix far outside its error still switches", async () => {
  const { reconcileActiveLocationFromGps, useLocationStore } = await load();
  await paintStale(HOME, "Home");
  backend.boundId = SAVED_HOME.id;
  backend.saved = SAVED_HOME;
  // Android "approximate" only ever gives ~2 km accuracy; the user is 11 km from home.
  device.oneShot = async (arg) =>
    arg.accuracy === Accuracy.Low ? at(OFFICE.latitude, OFFICE.longitude, 2_000) : new Promise(() => {});
  const result = await reconcileActiveLocationFromGps();
  assert.equal(result?.reason, "switched_far");
  assert.equal(useLocationStore.getState().locationSource, "current");
});

test("no binding + cached fallback: a newer live pin is not moved back onto the old coords", async () => {
  const { reconcileActiveLocationFromGps, useLocationStore } = await load();
  await paintStale(HOME);
  // Coarse, inside its own error of the cached pin, so the decision falls back to the cache.
  const coarse = at(HOME.latitude + 0.01, HOME.longitude, 1_500);
  device.oneShot = async (arg) => (arg.accuracy === Accuracy.Low ? coarse : new Promise(() => {}));
  await reconcileActiveLocationFromGps();
  assert.equal(useLocationStore.getState().coords?.latitude, coarse.coords.latitude);
});

test("a coarse-only device still reconciles, once it has nothing better to offer", async () => {
  const { reconcileActiveLocationFromGps } = await load();
  device.oneShot = async (arg) =>
    arg.accuracy === Accuracy.Low ? at(OFFICE.latitude, OFFICE.longitude, 2_000) : new Promise(() => {});
  const result = await reconcileActiveLocationFromGps();
  assert.equal(backend.reconcileCalls.length, 1);
  assert.equal(result?.source, "current");
});

test("final fix corrects a decision made on a poor first fix", async () => {
  const { reconcileActiveLocationFromGps, useLocationStore } = await load();
  await paintStale(HOME, "Home");
  backend.boundId = SAVED_HOME.id;
  backend.saved = SAVED_HOME;
  // A cached OS fix from just before leaving says "still home"; GPS says otherwise.
  device.lastKnown = at(HOME.latitude, HOME.longitude, 20, 30_000);
  await reconcileActiveLocationFromGps();
  assert.equal(useLocationStore.getState().sessionBoundAddressId, SAVED_HOME.id);

  for (const cb of device.watches) cb(at(OFFICE.latitude, OFFICE.longitude, 8));

  assert.ok(await until(() => useLocationStore.getState().locationSource === "current"));
  assert.equal(backend.boundId, null);
  // "Home" must not survive as the label of a place 11 km from home.
  assert.ok(await until(() => useLocationStore.getState().address?.primary === "Road at 25.694"));
});

test("iOS fractional timestamps do not get reconcile rejected by the backend (HTTP 400)", async () => {
  const { reconcileActiveLocationFromGps } = await load();
  device.lastKnown = {
    coords: { latitude: HOME.latitude, longitude: HOME.longitude, accuracy: 10 },
    timestamp: Date.now() - 1_000.5,
  };
  const result = await reconcileActiveLocationFromGps();
  assert.equal(backend.reconcileCalls.length, 1, "reconcile was rejected");
  assert.ok(Number.isInteger(backend.reconcileCalls[0]!.capturedAtMs));
  assert.equal(result?.source, "current");
});

test("every caller on app open shares one GPS session", async () => {
  const { reconcileActiveLocationFromGps, useLocationStore } = await load();
  await paintStale(HOME);
  const s = useLocationStore.getState();
  void s.requestPermissionAndFetch({ forceDevice: true });
  void s.requestPermissionAndFetch({ forceDevice: true });
  void s.refetchLocation({ forceDevice: true });
  void reconcileActiveLocationFromGps();
  await tick(50);
  assert.equal(device.watchStarts, 1);
});

test("a fix under 2 minutes old starts no GPS at all", async () => {
  const { useLocationStore } = await load();
  await paintStale(HOME);
  useLocationStore.setState({ coordsUpdatedAt: Date.now() - 30_000, coordsAccuracy: 20 });
  await useLocationStore.getState().requestPermissionAndFetch({ forceDevice: true });
  await tick(30);
  assert.equal(device.watchStarts, 0);
});

test("the GPS is released after a good fix", async () => {
  const { useLocationStore } = await load();
  await paintStale(HOME);
  void useLocationStore.getState().requestPermissionAndFetch({ forceDevice: true });
  await tick(20);
  for (const cb of [...device.watches]) cb(at(HOME.latitude, HOME.longitude, 8));
  assert.ok(await until(() => device.removed === 1));
});

// ================= address label =================

test("a cached pin with no address gets one, even when the live fix is no better", async () => {
  const { useLocationStore } = await load();
  // Killed last session between saving the fix and its geocode finishing.
  useLocationStore.setState({
    coords: { ...HOME },
    address: null,
    coordsAccuracy: 10,
    coordsUpdatedAt: Date.now() - 30_000,
    coordsSource: "accurate",
    locationSource: "current",
  });
  await useLocationStore.getState().requestPermissionAndFetch({ forceDevice: true });
  assert.ok(
    await until(() => useLocationStore.getState().address?.primary === "Road at 25.594"),
    `address stuck at ${JSON.stringify(useLocationStore.getState().address)}`
  );
});

test("small GPS wobble does not re-geocode", async () => {
  const { useLocationStore } = await load();
  await paintStale(HOME, "Known Road");
  void useLocationStore.getState().requestPermissionAndFetch({ forceDevice: true });
  await tick(20);
  for (const cb of [...device.watches]) cb(at(HOME.latitude + 0.0001, HOME.longitude, 40));
  await tick(50);
  assert.equal(net.calls.filter((u) => u.includes("/reverse")).length, 0);
  assert.equal(useLocationStore.getState().address?.primary, "Known Road");
});

const metresNorth = (m: number) => HOME.latitude + m / 111_320;

async function countPinMoves(lastKnown: Loc, fixes: Array<[metres: number, accuracy: number]>) {
  const { useLocationStore } = await load();
  let moves = 0;
  const unsubscribe = useLocationStore.subscribe((s, p) => {
    if (s.coords !== p.coords) moves += 1;
  });
  device.lastKnown = lastKnown;
  void useLocationStore.getState().requestPermissionAndFetch({ forceDevice: true });
  await until(() => device.watches.length > 0);
  for (const [m, accuracy] of fixes) {
    for (const cb of [...device.watches]) cb(at(metresNorth(m), HOME.longitude, accuracy));
    await tick(30);
  }
  unsubscribe();
  return { moves, state: useLocationStore.getState() };
}

test("standing still: wobbling fixes do not re-render subscribers, but accuracy still improves", async () => {
  const { moves, state } = await countPinMoves(at(HOME.latitude, HOME.longitude, 30, 40_000), [
    [12, 48], [8, 42], [14, 38], [6, 33], [9, 28], [5, 24],
  ]);
  assert.ok(moves <= 1, `pin moved ${moves} times for a phone that never moved`);
  assert.equal(state.coordsAccuracy, 24);
});

test("indoors: a wandering fix does not churn the pin", async () => {
  const { moves } = await countPinMoves(at(metresNorth(40), HOME.longitude, 60, 60_000), [
    [30, 58], [22, 52], [35, 47], [18, 42], [28, 38], [20, 34], [26, 30],
  ]);
  assert.ok(moves <= 2, `pin moved ${moves} times indoors`);
});

test("walking: the pin follows, and never ends further from the user than its limit", async () => {
  const { moves, state } = await countPinMoves(at(HOME.latitude, HOME.longitude, 15, 150_000), [
    [15, 60], [40, 45], [70, 38], [100, 30], [130, 24],
  ]);
  assert.ok(moves >= 2, "a real walk has to move the pin");
  const gap = metres(state.coords!.latitude, state.coords!.longitude, metresNorth(130), HOME.longitude);
  assert.ok(gap <= 30, `pin ended ${gap} m behind the user`);
});

test("a sharp fix corrects a poor first fix straight away", async () => {
  const { state } = await countPinMoves(at(metresNorth(300), HOME.longitude, 400, 5_000), [[0, 12]]);
  assert.ok(metres(state.coords!.latitude, state.coords!.longitude, HOME.latitude, HOME.longitude) < 1);
});

test("a held pin does not re-geocode, even past the label's own 25 m", async () => {
  const { useLocationStore } = await load();
  await paintStale(HOME);
  useLocationStore.setState({ coordsAccuracy: 60, coordsUpdatedAt: Date.now() - 200_000 });
  const pin = useLocationStore.getState().coords;
  net.calls = [];
  void useLocationStore.getState().requestPermissionAndFetch({ forceDevice: true });
  await until(() => device.watches.length > 0);
  for (const cb of [...device.watches]) cb(at(metresNorth(28), HOME.longitude, 30));
  await tick(40);
  // The fix was taken (accuracy updated), the pin held, and the label needed no new lookup.
  assert.equal(useLocationStore.getState().coordsAccuracy, 30);
  assert.equal(useLocationStore.getState().coords, pin);
  assert.equal(net.calls.filter((u) => u.includes("reverse")).length, 0);
});

test("a picked location never counts as a pin to hold: 'use current' takes the real fix", async () => {
  const { useLocationStore } = await load();
  useLocationStore.getState().setAddressAndCoords(
    { primary: "Shop", secondary: "", fullAddress: "Shop" },
    { latitude: metresNorth(5), longitude: HOME.longitude },
    { source: "selected" }
  );
  void useLocationStore.getState().requestPermissionAndFetch({ forceDevice: true });
  await until(() => device.watches.length > 0);
  for (const cb of [...device.watches]) cb(at(HOME.latitude, HOME.longitude, 12));
  await until(() => useLocationStore.getState().locationSource === "current");
  const s = useLocationStore.getState();
  assert.equal(s.locationSource, "current");
  assert.ok(metres(s.coords!.latitude, s.coords!.longitude, HOME.latitude, HOME.longitude) < 1);
  assert.notEqual(s.address?.primary, "Shop");
});

test("geocoding failure: never stuck on 'Detecting address…', never an old city's name", async () => {
  const { useLocationStore } = await load();
  await paintStale(HOME, "Old Road");
  net.route = () => "http500";
  void useLocationStore.getState().requestPermissionAndFetch({ forceDevice: true });
  await tick(20);
  // A spot no other test has geocoded, so this really reaches the (failing) network.
  for (const cb of [...device.watches]) cb(at(26.7, 86.7, 10));
  assert.ok(await until(() => useLocationStore.getState().address?.primary === "Current location", 8_000));
});

test("geocoding recovers on the retry when the network comes back", async () => {
  const { useLocationStore } = await load();
  let fail = true;
  const good = net.route!;
  net.route = (url, signal) => (fail ? "http500" : good(url, signal));
  device.lastKnown = at(26.8, 86.8, 20, 1_000);
  void useLocationStore.getState().requestPermissionAndFetch({ forceDevice: true });
  await until(() => useLocationStore.getState().coords != null);
  await tick(50);
  assert.equal(useLocationStore.getState().address?.primary, "Detecting address\u2026");
  fail = false;
  assert.ok(await until(() => useLocationStore.getState().address?.primary === "Road at 26.800", 6_000));
});

// ================= user intent =================

test("a location the user picked is never overwritten by GPS", async () => {
  const { useLocationStore } = await load();
  await paintStale(HOME);
  void useLocationStore.getState().requestPermissionAndFetch({ forceDevice: true });
  await tick(20);
  useLocationStore
    .getState()
    .setAddressAndCoords(
      { primary: "Picked", secondary: "", fullAddress: "Picked" },
      { latitude: 26, longitude: 86 },
      { source: "selected" }
    );
  for (const cb of [...device.watches]) cb(at(HOME.latitude, HOME.longitude, 8));
  await tick(30);
  assert.equal(useLocationStore.getState().address?.primary, "Picked");
  assert.equal(useLocationStore.getState().coords?.latitude, 26);
});

test("user pick during a forced session survives a later caller joining that session", async () => {
  const { awaitLiveDeviceFix, useLocationStore } = await load();
  await paintStale(HOME);
  void useLocationStore.getState().requestPermissionAndFetch({ forceDevice: true });
  await tick(20);
  useLocationStore
    .getState()
    .setAddressAndCoords(
      { primary: "Picked", secondary: "", fullAddress: "Picked" },
      { latitude: 26, longitude: 86 },
      { source: "selected" }
    );
  void awaitLiveDeviceFix(50); // e.g. the resume reconcile
  await tick(5);
  for (const cb of [...device.watches]) cb(at(HOME.latitude, HOME.longitude, 8));
  await tick(30);
  assert.equal(useLocationStore.getState().address?.primary, "Picked");
});

test("'Use current location' overrides a picked location", async () => {
  const { awaitLiveDeviceFix, useLocationStore } = await load();
  useLocationStore
    .getState()
    .setAddressAndCoords(
      { primary: "Picked", secondary: "", fullAddress: "Picked" },
      { latitude: 26, longitude: 86 },
      { source: "selected" }
    );
  useLocationStore.setState({ coordsUpdatedAt: Date.now() - 1_000, coordsAccuracy: 5 });
  device.lastKnown = at(HOME.latitude, HOME.longitude, 15, 1_000);
  await useLocationStore.getState().requestPermissionAndFetch({ forceDevice: true });
  await awaitLiveDeviceFix(500);
  assert.equal(useLocationStore.getState().locationSource, "current");
  assert.equal(useLocationStore.getState().coords?.latitude, HOME.latitude);
});

test("permission-free GPS failure: no fix leaves a picked location alone", async () => {
  const { awaitLiveDeviceFix, useLocationStore } = await load();
  useLocationStore
    .getState()
    .setAddressAndCoords(
      { primary: "Picked", secondary: "", fullAddress: "Picked" },
      { latitude: 26, longitude: 86 },
      { source: "selected" }
    );
  assert.equal(await awaitLiveDeviceFix(30), null);
  assert.equal(useLocationStore.getState().locationSource, "selected");
});

// ================= reverse geocode =================

test("reverse: healthy v6 is the only request made", async () => {
  const { reverseGeocode } = await load();
  const r = await reverseGeocode(77.1, 28.1);
  assert.equal(r.provider, "mapbox-v6");
  assert.equal(r.pincode, "800001");
  assert.equal(net.calls.length, 1);
  assert.ok(!net.calls[0]!.includes("types="), "v6 must be called with no types param");
});

test("reverse: concurrent asks for one spot share one request", async () => {
  const { reverseGeocode } = await load();
  await Promise.all([reverseGeocode(77.2, 28.2), reverseGeocode(77.2, 28.2), reverseGeocode(77.2, 28.2)]);
  assert.equal(net.calls.length, 1);
});

test("reverse: a stalled v6 is hedged to the next provider within about a second", async () => {
  const { reverseGeocode } = await load();
  net.route = (url) => {
    if (url.includes("/geocode/v6/reverse")) return "hang";
    if (url.includes("/geocoding/v5/")) {
      return Promise.resolve({
        features: [{ text: "V5 Road", place_name: "V5 Road, Patna, 800001", context: [] }],
      });
    }
    return Promise.resolve({ features: [] });
  };
  const t0 = Date.now();
  const r = await reverseGeocode(77.3, 28.3);
  assert.equal(r.provider, "mapbox-v5");
  assert.ok(Date.now() - t0 < 2_500, `took ${Date.now() - t0}ms`);
});

test("reverse: Mapbox down falls back to the device geocoder", async () => {
  const { reverseGeocode } = await load();
  net.route = () => "error";
  device.geocoder = async () => [
    { name: "Device Road", city: "Patna", region: "Bihar", postalCode: "800001", district: null, street: null, subregion: null },
  ];
  const r = await reverseGeocode(77.4, 28.4);
  assert.equal(r.provider, "device");
  assert.equal(r.primary, "Device Road");
  assert.equal(r.pincode, "800001");
});

test("reverse: everything hanging still answers: a hung native geocoder cannot freeze a screen", async () => {
  const { reverseGeocode, isUnresolvedReverseResult } = await load();
  net.route = () => "hang";
  device.geocoder = () => new Promise(() => {}); // the native module ignores abort signals
  const t0 = Date.now();
  const r = await Promise.race([
    reverseGeocode(77.5, 28.5),
    new Promise<null>((res) => setTimeout(() => res(null), 9_000)),
  ]);
  assert.ok(r, `reverseGeocode never answered (waited ${Date.now() - t0}ms)`);
  assert.equal(isUnresolvedReverseResult(r), true);
});

test("reverse: an unresolved answer is not cached, so the next ask tries again", async () => {
  const { reverseGeocode, isUnresolvedReverseResult } = await load();
  const good = net.route!;
  net.route = () => "error";
  assert.equal(isUnresolvedReverseResult(await reverseGeocode(77.6, 28.6)), true);
  net.route = good;
  assert.equal((await reverseGeocode(77.6, 28.6)).provider, "mapbox-v6");
});

// ================= search =================

const suggestion = (name: string, featureType = "poi") => ({
  name,
  mapbox_id: `id-${name}`,
  feature_type: featureType,
  place_formatted: "Patna, 800001, India",
  context: { place: { name: "Patna" } },
});
const forwardHit = (name: string, featureType = "street") => ({
  geometry: { coordinates: [85.14, 25.6] },
  properties: {
    name,
    feature_type: featureType,
    place_formatted: "Patna, 800001, India",
    context: { place: { name: "Patna" } },
  },
});
const searchRoute =
  (sb: unknown, v6: unknown): Route =>
  (url) => {
    if (url.includes("/searchbox/v1/suggest")) return sb as ReturnType<Route>;
    if (url.includes("/geocode/v6/forward")) return v6 as ReturnType<Route>;
    return Promise.resolve({});
  };

const uniqueQuery = (() => {
  let n = 0;
  return (base: string) => `${base} ${String.fromCharCode(97 + n++ % 26)}${n}`;
})();

test("search: results from both sources are merged", async () => {
  const { searchLocations } = await load();
  net.route = searchRoute(
    Promise.resolve({ suggestions: [suggestion("Patna Junction")] }),
    Promise.resolve({ features: [forwardHit("Boring Road")] })
  );
  const r = await searchLocations(uniqueQuery("merge"), { proximity: HOME });
  assert.deepEqual(r.map((x) => x.primary).sort(), ["Boring Road", "Patna Junction"]);
});

test("search: categories and brands are not offered as places", async () => {
  const { searchLocations } = await load();
  net.route = searchRoute(
    Promise.resolve({
      suggestions: [suggestion("Hospital", "category"), suggestion("McDonalds", "brand"), suggestion("Real Hospital")],
    }),
    Promise.resolve({ features: [] })
  );
  const r = await searchLocations(uniqueQuery("cat"), { proximity: HOME });
  assert.deepEqual(r.map((x) => x.primary), ["Real Hospital"]);
});

test("search: one source down still gives results, in either direction", async () => {
  const { searchLocations } = await load();
  net.route = searchRoute("error", Promise.resolve({ features: [forwardHit("Only V6")] }));
  assert.equal((await searchLocations(uniqueQuery("a"), { proximity: HOME }))[0]?.primary, "Only V6");
  net.route = searchRoute(Promise.resolve({ suggestions: [suggestion("Only SB")] }), "http500");
  assert.equal((await searchLocations(uniqueQuery("b"), { proximity: HOME }))[0]?.primary, "Only SB");
});

test("search: a slow source does not hold back the fast one", async () => {
  const { searchLocations } = await load();
  net.route = searchRoute("hang", Promise.resolve({ features: [forwardHit("Fast")] }));
  const partial: string[] = [];
  const t0 = Date.now();
  const final = await searchLocations(uniqueQuery("slow"), {
    proximity: HOME,
    onPartialResults: (r) => partial.push(r[0]!.primary),
  });
  assert.deepEqual(partial, ["Fast"]);
  assert.equal(final[0]?.primary, "Fast");
  assert.ok(Date.now() - t0 < 2_000, `took ${Date.now() - t0}ms`);
});

test("search: when everything is down it says so, and the failure is not remembered", async () => {
  const { searchLocations, LocationSearchUnavailableError } = await load();
  const q = uniqueQuery("down");
  net.route = searchRoute("error", "error");
  await assert.rejects(searchLocations(q, { proximity: HOME }), LocationSearchUnavailableError);
  net.route = searchRoute(Promise.resolve({ suggestions: [] }), Promise.resolve({ features: [forwardHit("Back")] }));
  assert.equal((await searchLocations(q, { proximity: HOME }))[0]?.primary, "Back");
});

test("search: 'no matches' is not treated as an outage", async () => {
  const { searchLocations } = await load();
  net.route = searchRoute(Promise.resolve({ suggestions: [] }), Promise.resolve({ features: [] }));
  assert.deepEqual(await searchLocations(uniqueQuery("none"), { proximity: HOME }), []);
});

test("search: an empty answer is not remembered, so the same query can succeed moments later", async () => {
  const { searchLocations } = await load();
  const q = uniqueQuery("blip");
  net.route = searchRoute(Promise.resolve({ suggestions: [] }), Promise.resolve({ features: [] }));
  assert.deepEqual(await searchLocations(q, { proximity: HOME }), []);
  net.route = searchRoute(Promise.resolve({ suggestions: [] }), Promise.resolve({ features: [forwardHit("Found")] }));
  assert.equal((await searchLocations(q, { proximity: HOME }))[0]?.primary, "Found");
});

test("search: hanging sources are bounded, not an endless spinner", async () => {
  const { searchLocations, LocationSearchUnavailableError } = await load();
  net.route = searchRoute("hang", "hang");
  await assert.rejects(searchLocations(uniqueQuery("hang"), { proximity: HOME }), LocationSearchUnavailableError);
});

test("search: a full typed address falls back to a simpler form", async () => {
  const { searchLocations } = await load();
  net.route = (url) => {
    if (url.includes("/geocode/v6/forward") && url.includes("q=Kankarbagh%2C%20Patna")) {
      return Promise.resolve({ features: [forwardHit("Kankarbagh", "locality")] });
    }
    if (url.includes("/searchbox/v1/suggest")) return Promise.resolve({ suggestions: [] });
    return Promise.resolve({ features: [] });
  };
  const r = await searchLocations(`Flat 203, Shanti Apartment ${uniqueQuery("x")}, Kankarbagh, Patna`, { proximity: HOME });
  assert.equal(r[0]?.primary, "Kankarbagh");
});

test("search: GPS wobble under ~1 km reuses the cached answer", async () => {
  const { searchLocations } = await load();
  const q = uniqueQuery("cache");
  net.route = searchRoute(Promise.resolve({ suggestions: [] }), Promise.resolve({ features: [forwardHit("Cached")] }));
  await searchLocations(q, { proximity: { latitude: 25.5941, longitude: 85.1376 } });
  const before = net.calls.length;
  await searchLocations(q, { proximity: { latitude: 25.5942, longitude: 85.1377 } });
  assert.equal(net.calls.length, before);
});

test("search: pincode uses v6 first and matches the exact PIN only", async () => {
  const { searchLocations } = await load();
  net.route = (url) => {
    if (url.includes("/geocode/v6/forward") && url.includes("types=postcode")) {
      return Promise.resolve({
        features: [forwardHit("800021", "postcode"), forwardHit("800020", "postcode")],
      });
    }
    return Promise.resolve({ features: [] });
  };
  const r = await searchLocations("800020", { proximity: HOME });
  assert.equal(r.length, 1);
  assert.equal(r[0]!.pincode, "800020");
  assert.equal(r[0]!.isPincodeResult, true);
});

test("search: pincode lookup during an outage is reported as an outage, not 'we don't deliver here'", async () => {
  const { searchLocations, LocationSearchUnavailableError } = await load();
  net.route = () => "error";
  await assert.rejects(searchLocations("800099", { proximity: HOME }), LocationSearchUnavailableError);
});

// ================= picking a result =================

test("tap: a retrieve that fails twice falls back to geocoding the result's own text", async () => {
  const { mapbox } = await load();
  net.route = (url) => {
    if (url.includes("/retrieve/")) return "error";
    if (url.includes("/geocode/v6/forward")) return Promise.resolve({ features: [forwardHit("Same Place")] });
    return Promise.resolve({});
  };
  const place = mapbox.suggestionToEnrichedPreview(suggestion("Same Place") as never, "same");
  const r = await mapbox.resolveMapboxEnrichedPlace(place, "food-delivery");
  assert.equal(r.latitude, 25.6);
  assert.equal(r.pendingRetrieve, false);
  assert.equal(net.calls.filter((u) => u.includes("/retrieve/")).length, 2);
});

test("tap: total failure returns the place without coordinates, it does not throw", async () => {
  const { mapbox } = await load();
  net.route = () => "error";
  const place = mapbox.suggestionToEnrichedPreview(suggestion("Nowhere") as never, "now");
  const r = await mapbox.resolveMapboxEnrichedPlace(place, "food-delivery");
  assert.equal(r.latitude, 0);
});

test("tap: suggest and retrieve use the same billing session token", async () => {
  const { searchPlacesEnriched, mapbox } = await load();
  net.route = (url) => {
    if (url.includes("/searchbox/v1/suggest")) return Promise.resolve({ suggestions: [suggestion("Sess")] });
    if (url.includes("/retrieve/")) {
      return Promise.resolve({
        features: [
          {
            type: "Feature",
            geometry: { type: "Point", coordinates: [85.14, 25.6] },
            properties: { name: "Sess", feature_type: "poi", coordinates: { latitude: 25.6, longitude: 85.14 } },
          },
        ],
      });
    }
    return Promise.resolve({ features: [] });
  };
  const [place] = await searchPlacesEnriched(uniqueQuery("session"), {
    proximity: HOME,
    sessionContext: "add-address",
  });
  await mapbox.resolveMapboxEnrichedPlace(place!, "add-address");
  const tokenOf = (needle: string) =>
    new URL(net.calls.find((u) => u.includes(needle))!).searchParams.get("session_token");
  assert.ok(tokenOf("/suggest"));
  assert.equal(tokenOf("/suggest"), tokenOf("/retrieve/"));
});
