# Customer App — Production Hardening Validation Runbook

Companion to branch `perf/customer-app-stability-hardening`.

Every item below is a **pass/fail gate with a concrete threshold**, so the result
does not depend on judgement. Record the numbers in the results table at the
bottom. Where a gate fails, the "if it fails, look at" column names the exact
code path to investigate first.

**Build under test must be a release build.** Several of the changes (the console
silencer, the global error handler's non-fatal swallow) only take effect when
`__DEV__` is false, and a dev build's JS performance is not representative.

```bash
cd apps/customer_app
npx expo run:android --variant release
```

---

## 0. Baseline first

Do not skip this. Every gate below is a comparison, and without a pre-change
baseline a "good" number proves nothing.

```bash
git stash                      # or check out the pre-branch commit
npx expo run:android --variant release
# capture §1–§6 on the OLD build, then rebuild from the branch
```

---

## 1. CPU Profiler — scroll cost

**Tool:** Android Studio → Profiler → CPU → *Callstack Sample Recording*

| Screen | Action | Gate |
|---|---|---|
| Restaurant Listing (category) | 30 s continuous scroll | `mqt_js` thread ≤ **40 %** avg |
| Home | 30 s continuous scroll | `mqt_js` thread ≤ **40 %** avg |
| Restaurant Details | 30 s scroll through full menu | `mqt_js` thread ≤ **40 %** avg |

Also confirm in the recording:
- **No `useAnimatedCount` frames** appearing 60×/s. Expect ~15/s during a bill change only.
- **No `setQueriesData` frames** during live tracking.

*If it fails, look at:* `app/home/category/[slug].tsx` (FlashList windowing),
`hooks/useCardAnimationsEnabled.ts` (is the scroll gate actually firing?).

---

## 2. Memory Profiler — leak detection

**Tool:** Profiler → Memory → *Java/Kotlin + Native*

**Navigation loop ×20:** Home → Category → Restaurant Details → Cart → Checkout → back ×4.

1. Force GC (trash icon) at start, record heap.
2. Run the loop 20×.
3. Force GC again, record heap.

| Gate | Threshold |
|---|---|
| Heap delta after 20 loops + GC | ≤ **15 MB** growth |
| Retained `GMRestaurantCardV2` instances after leaving listing | **0** |
| Retained `WebView` instances after leaving Live Tracking | **0** |
| Native heap growth over 30 min session | ≤ **50 MB** |

Capture a heap dump at the end and inspect *Shallow Size* ordered descending.
Watch specifically for retained `Bitmap` — that is the image cache.

*If it fails, look at:* `lib/prefetchQueue.ts` (`MAX_TRACKED_URIS` trim),
`components/maps/MapboxWebDeliveryMap.tsx` (WebView teardown).

---

## 3. Network Inspector — polling & duplicate connections

**Tool:** Profiler → Network (or `adb logcat | grep -i okhttp`)

| Scenario | Gate |
|---|---|
| Active food order, app foregrounded, WS healthy | ≤ **6 req/min** per order to `/orders/:id` |
| Active food order, app foregrounded, WS healthy | **0** requests to `/eta/:id` (arrives over WS) |
| Active food order, **screen off 5 min** | **0** requests — this is the key battery gate |
| Airplane mode, trigger any screen fetch | ≤ **3** attempts total, then stop |
| Live Tracking open | exactly **1** WebSocket to `/v1/ws` |
| Background → foreground ×10 during an active order | still exactly **1** WebSocket |

The duplicate-socket check is the one most likely to regress: watch for a second
socket opening before the first `onclose` lands.

*If it fails, look at:* `hooks/useOrderRealtime.ts` — the `disposed` flag and
`connectGen` guard in the WS effect; `services/api.ts` + `lib/queryClient.ts` for retry counts.

---

## 4. Perfetto / System Trace — frame timing

**Tool:** `Profiler → System Trace`, or Perfetto UI with the `sched` + `gfx` categories.

| Screen | Gate |
|---|---|
| Restaurant Listing, 30 s scroll | **≥ 95 %** frames under 16.6 ms |
| Home, 30 s scroll | **≥ 95 %** frames under 16.6 ms |
| Checkout, 20 quantity taps | **0** frames over 100 ms |
| Live Tracking, 5 min | **0** sustained `RenderThread` spikes |

Look at the `Janky frames` track. Any frame over **700 ms** is a potential ANR
precursor and must be investigated regardless of the percentage gate.

---

## 5. React DevTools Profiler — re-render counts

**Tool:** `npx react-devtools`, Profiler tab, "Record why each component rendered" **on**.

| Action | Gate |
|---|---|
| Checkout: one quantity tap | `CheckoutScreen` renders **≤ 2×** (was ~30×) |
| Checkout: one quantity tap | `AnimatedRupeeAmount` renders ~4× — expected, it owns the tween |
| Home: toggle veg filter | `GMRestaurantCardV2` renders **only for visible rows** |
| Listing: idle 10 s | **0** renders from `MerchantOfferRow` / `NearFastDeliveryMeta` while scrolling |

*If it fails, look at:* `components/checkout/AnimatedRupeeAmount.tsx`,
and the `React.memo` comparators added to the per-item components.

---

## 6. Battery Historian — drain

```bash
adb shell dumpsys batterystats --reset
# ... run the 30-minute session in §7 ...
adb shell dumpsys batterystats > bs.txt
# upload bs.txt to Battery Historian
```

| Gate | Threshold |
|---|---|
| Wakelocks held while backgrounded with an active order | **0** |
| App CPU time, 30 min mixed session | ≤ **4 min** |
| Estimated drain, 30 min | ≤ **6 %** |
| GPS/location requests while backgrounded | **0** |

---

## 7. Real-device session matrix

Run on a **low-end device** (2–3 GB RAM, e.g. Redmi A-series / Galaxy M-series).
A flagship will hide the exact problems this pass targets.

| # | Flow | Watch for |
|---|---|---|
| 1 | Home — 5 min browse | heating, scroll jank |
| 2 | Restaurant Listing — scroll 100+ cards | frame drops, memory growth |
| 3 | Restaurant Details — full menu scroll | image load stalls |
| 4 | Search — 20 queries, rapid typing | duplicate requests, debounce |
| 5 | Cart — add/remove 20 items rapidly | re-render storms |
| 6 | Checkout — apply/remove coupons ×10 | full-tree re-renders |
| 7 | Live Tracking — 15 min with active order | WebView memory, socket count |
| 8 | Orders tab — switch active/past ×20 | poll cadence |
| 9 | Profile — open every sub-screen | leaks on unmount |
| 10 | Ride Booking — full flow | map WebView teardown |
| 11 | Background → foreground ×20 | duplicate sockets, resync storms |
| 12 | Lock / unlock ×20 | wakelocks, poll resumption |
| 13 | Force close → reopen ×10 | cold-start crash, state restore |
| 14 | Low network (throttle to 2G) | retry storms, stuck spinners |
| 15 | **Long session 20–30 min**, all of the above | cumulative heat + memory |

**During #15, track device temperature:**
```bash
adb shell dumpsys thermalservice | grep -i temperature
```
Gate: skin temperature stays below **40 °C**.

---

## 8. Crash & ANR gates

| Check | How | Gate |
|---|---|---|
| Native crashes | `adb logcat -b crash` | **0** |
| ANRs | `adb shell ls /data/anr/` + logcat `am_anr` | **0** |
| JS fatals | `adb logcat -s ReactNativeJS:E` | **0** |
| OOM kills | `adb logcat \| grep -i "lowmemorykiller\|OutOfMemory"` | **0** |

**Error-boundary smoke test** — this verifies the crash fix actually works and
must be done on a **release** build:

1. Temporarily add `throw new Error("boundary-test")` to a screen's render.
2. Build release, open that screen.
3. **Expected:** the "Something went wrong" retry screen. **Not** an app close.
4. Revert the throw.

If step 3 closes the app, the boundary is not wired for that route — check
`app/_layout.tsx` and the exported `ErrorBoundary`.

---

## 9. Regression checklist (business logic must be unchanged)

The performance pass touched behaviour-adjacent code. Confirm each explicitly:

- [ ] Order status still advances promptly on merchant accept (status poll was slowed 5 s → 10 s under a healthy WS)
- [ ] ETA still updates during tracking (REST ETA fetch is skipped while WS is up)
- [ ] Prep-delay banner fires exactly once, not repeatedly
- [ ] Offer/ETA ticker rows do **not** collapse to one line while scrolling
- [ ] Ken Burns + banner carousel resume after a scroll settles
- [ ] Locked platform offers still show their coupon code (`CheckoutOffersSheet` fix)
- [ ] Category listing shows the same merchants, order, and filters as before
- [ ] Screens behind a modal still render correctly (`freezeOnBlur` risk)
- [ ] Bill totals animate and land on the exact final value
- [ ] Menu/banner images still load (prefetch is now capped, not removed)

---

## Results

| Gate | Baseline | After | Pass? |
|---|---|---|---|
| §1 JS thread — listing scroll | | | |
| §2 heap delta ×20 loops | | | |
| §3 req/min active order | | | |
| §3 requests, screen off | | | |
| §3 WebSocket count | | | |
| §4 frames < 16.6 ms | | | |
| §5 CheckoutScreen renders/tap | | | |
| §6 drain over 30 min | | | |
| §7 skin temp, 30 min | | | |
| §8 crashes / ANRs | | | |
