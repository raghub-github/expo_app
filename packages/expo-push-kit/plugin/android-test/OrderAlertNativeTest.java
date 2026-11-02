package {{PACKAGE}};

/**
 * Plain-JVM tests for the Android-free half of the native alert stack.
 *
 * Run by scripts/test-order-alert-native.mjs, which templates {{PACKAGE}} and
 * {{ROLE}} and runs the suite once per role. There is no Android SDK in CI and
 * no JUnit on this toolchain, so assertions are hand-rolled and the process
 * exits non-zero on the first failure.
 */
public final class OrderAlertNativeTest {
  private static int passed;
  private static int failed;
  private static final String ROLE = "{{ROLE}}";
  private static final boolean RIDER = "rider".equals(ROLE);

  public static void main(String[] args) {
    acceptPlan();
    cardText();
    countdown();
    presentation();
    decisionLedger();

    System.out.println("  " + passed + " passed, " + failed + " failed  [role=" + ROLE + "]");
    if (failed > 0) System.exit(1);
  }

  // ---------------------------------------------------------------- accept

  private static void acceptPlan() {
    // The regression this whole change exists for: a rider's Accept used to fall
    // into the merchant branch, fail its storeId guard, and send nothing.
    OrderAlertAcceptPlan rider = OrderAlertAcceptPlan.build(
        "rider", "https://api.gatimitra.com", "tok", "RIDER_NEW_ORDER:ORD9:4:1", "ORD9", "ORD9", "", "");
    check("rider plan is sendable with no storeId", rider.isSendable());
    eq("rider endpoint",
        "https://api.gatimitra.com/v1/rider/orders/ORD9/accept", rider.url);
    eq("rider method", "POST", rider.method);
    eq("rider body", "{}", rider.body);
    eq("rider idempotency key is the alert session",
        "gm-native-accept:RIDER_NEW_ORDER:ORD9:4:1", rider.idempotencyKey);

    OrderAlertAcceptPlan merchant = OrderAlertAcceptPlan.build(
        "merchant", "https://api.gatimitra.com", "tok", "MERCHANT_NEW_ORDER:100046:12",
        "100046", "", "12", "100046");
    check("merchant plan still builds", merchant.isSendable());
    eq("merchant endpoint",
        "https://api.gatimitra.com/v1/merchant-partner/stores/12/food-orders/100046", merchant.url);
    eq("merchant method", "PATCH", merchant.method);
    check("merchant body sets ACCEPTED", merchant.body.contains("\"status\":\"ACCEPTED\""));

    // A merchant accept genuinely cannot be addressed without a store.
    eq("merchant without storeId is refused, not silently dropped", "no_order_ref",
        OrderAlertAcceptPlan.build("merchant", "https://x", "tok", "s", "100046", "", "", "").reason);

    eq("missing credentials are reported", "not_signed_in",
        OrderAlertAcceptPlan.build("rider", "", "", "s", "ORD9", "", "", "").reason);
    eq("blank token is reported", "not_signed_in",
        OrderAlertAcceptPlan.build("rider", "https://x", "   ", "s", "ORD9", "", "", "").reason);
    eq("rider with no reference at all is refused", "no_order_ref",
        OrderAlertAcceptPlan.build("rider", "https://x", "tok", "s", "", "", "", "").reason);

    eq("rider falls back to offerId when orderId is absent",
        "https://x/v1/rider/orders/OFFER7/accept",
        OrderAlertAcceptPlan.build("rider", "https://x", "tok", "s", "", "OFFER7", "", "").url);

    eq("trailing slashes on the base url do not double up",
        "https://x/v1/rider/orders/ORD9/accept",
        OrderAlertAcceptPlan.build("rider", "https://x///", "tok", "s", "ORD9", "", "", "").url);

    // An order reference is opaque; it must not be able to alter the path.
    eq("order reference is path-encoded",
        "https://x/v1/rider/orders/A%2FB%20C/accept",
        OrderAlertAcceptPlan.build("rider", "https://x", "tok", "s", "A/B C", "", "", "").url);

    eq("no session id falls back to the order reference for idempotency",
        "gm-native-accept:ORD9",
        OrderAlertAcceptPlan.build("rider", "https://x", "tok", "", "ORD9", "", "", "").idempotencyKey);

    // Overlay button and notification action are one offer, so one accept.
    OrderAlertAcceptPlan a = OrderAlertAcceptPlan.build(
        "rider", "https://x", "tok", "SID1", "ORD9", "", "", "");
    OrderAlertAcceptPlan b = OrderAlertAcceptPlan.build(
        "rider", "https://x", "tok", "SID1", "ORD9", "", "", "");
    eq("the same offer yields the same idempotency key", a.idempotencyKey, b.idempotencyKey);
  }

  // ------------------------------------------------------------- card text

  private static void cardText() {
    eq("whole rupees stay whole", "₹120", OrderAlertCardText.formatAmount("120"));
    eq("paise are preserved", "₹120.5", OrderAlertCardText.formatAmount("120.5"));
    eq("zero shows nothing rather than a free job", "", OrderAlertCardText.formatAmount("0"));
    eq("zero decimal shows nothing", "", OrderAlertCardText.formatAmount("0.00"));
    eq("negative shows nothing", "", OrderAlertCardText.formatAmount("-5"));
    eq("absent shows nothing", "", OrderAlertCardText.formatAmount(null));
    eq("junk never reaches the card", "", OrderAlertCardText.formatAmount("TBD"));
    eq("an already-formatted figure passes through", "₹99",
        OrderAlertCardText.formatAmount("₹99"));

    if (RIDER) {
      eq("a rider's figure is named as their earning",
          "You earn ₹120", OrderAlertCardText.amountLabel("120"));
      eq("rider heading names the job",
          "NEW RIDE REQUEST", OrderAlertCardText.headingFor("person_ride"));
      eq("rider heading for food", "NEW FOOD REQUEST", OrderAlertCardText.headingFor("food"));
      eq("rider heading without a type", "NEW ORDER REQUEST", OrderAlertCardText.headingFor(""));
    } else {
      eq("a merchant's figure is the order total, unlabelled",
          "₹120", OrderAlertCardText.amountLabel("120"));
      eq("merchant heading is unchanged", "NEW ORDER", OrderAlertCardText.headingFor("food"));
    }
    eq("no amount means no label", "", OrderAlertCardText.amountLabel("0"));

    eq("food", "Food", OrderAlertCardText.displayOrderType("food"));
    eq("parcel", "Parcel", OrderAlertCardText.displayOrderType("parcel"));
    eq("person_ride reads as Ride", "Ride", OrderAlertCardText.displayOrderType("person_ride"));
    eq("unknown type is title-cased", "Scooter", OrderAlertCardText.displayOrderType("scooter"));
    eq("absent type shows nothing", "", OrderAlertCardText.displayOrderType(null));

    eq("bare metres get a unit", "1430 m", OrderAlertCardText.displayPickup("1430"));
    eq("a formatted distance is left alone", "1.4 km", OrderAlertCardText.displayPickup("1.4 km"));

    eq("the id field wins", "GMR000009",
        OrderAlertCardText.publicOrderId("GMR000009", "anything"));
    // The bug: the fallback matched GMF only, so ride and parcel showed no id.
    eq("a ride id is recovered from the body", "GMR000009",
        OrderAlertCardText.publicOrderId("", "Ride · GMR000009 · 1.2 km to pickup"));
    eq("a parcel id is recovered from the body", "GMP000123",
        OrderAlertCardText.publicOrderId("", "Parcel · GMP000123"));
    eq("a food id is still recovered", "GMF100046",
        OrderAlertCardText.publicOrderId("", "New order GMF100046"));
    eq("an internal row id is never shown", "",
        OrderAlertCardText.publicOrderId("100046", "no public id here"));
    eq("nothing to show", "", OrderAlertCardText.publicOrderId("", "New order received"));

    check("a generic title is dropped", OrderAlertCardText.isGenericDetail("New order received"));
    check("an empty title is dropped", OrderAlertCardText.isGenericDetail(""));
    check("a bare order number is dropped", OrderAlertCardText.isGenericDetail("Order #91"));
    check("real detail is kept",
        !OrderAlertCardText.isGenericDetail("Ride · 1.2 km to pickup"));
  }

  // -------------------------------------------------------------- deadline

  private static void countdown() {
    eq("epoch millis pass through", 1730000000000L,
        OrderAlertCardText.parseEpochMs("1730000000000"));
    eq("epoch seconds are scaled up", 1730000000000L,
        OrderAlertCardText.parseEpochMs("1730000000"));
    eq("ISO-8601 is accepted", 1730000000000L,
        OrderAlertCardText.parseEpochMs("2024-10-27T03:33:20Z"));
    // An unreadable deadline must hide the timer, never render it expired.
    eq("junk yields no deadline", 0L, OrderAlertCardText.parseEpochMs("soon"));
    eq("absent yields no deadline", 0L, OrderAlertCardText.parseEpochMs(null));
    eq("empty yields no deadline", 0L, OrderAlertCardText.parseEpochMs("  "));

    long now = 1_000_000L;
    eq("a full second remaining", "30s", OrderAlertCardText.countdownLabel(now + 30_000, now));
    // Rounding up matters: a live offer must never read 0s.
    eq("a part second still reads 1s", "1s", OrderAlertCardText.countdownLabel(now + 1, now));
    eq("exactly expired", "0s", OrderAlertCardText.countdownLabel(now, now));
    eq("past the deadline", "0s", OrderAlertCardText.countdownLabel(now - 5_000, now));

    // A device clock running fast cannot extend the offer, only shorten it, and
    // the backend is the one that actually retires the assignment either way.
    eq("a device clock ahead of the server expires early",
        "0s", OrderAlertCardText.countdownLabel(now, now + 60_000));
  }

  // ---------------------------------------------------------- presentation

  private static final boolean JS = true, FG = true, LOCKED = true, DISMISSED = true;
  private static final boolean NO = false;

  private static void presentation() {
    // The defect this rule exists for: app open, native card also mounted.
    // Whichever way the app signalled it is up, the overlay must stay off.
    check("claimed by the app -> no overlay",
        !OrderAlertPresentation.shouldMountOverlay(JS, NO, NO, NO));
    check("app in front but not yet claimed -> still no overlay",
        !OrderAlertPresentation.shouldMountOverlay(NO, FG, NO, NO));
    check("claimed and in front -> no overlay",
        !OrderAlertPresentation.shouldMountOverlay(JS, FG, NO, NO));
    eq("an open app owns the card",
        OrderAlertPresentation.Surface.IN_APP,
        OrderAlertPresentation.resolve(JS, NO, NO, NO));

    // The only combination that earns a floating card.
    check("backgrounded, unlocked, not dismissed -> overlay",
        OrderAlertPresentation.shouldMountOverlay(NO, NO, NO, NO));
    eq("and that is the overlay surface",
        OrderAlertPresentation.Surface.OVERLAY,
        OrderAlertPresentation.resolve(NO, NO, NO, NO));

    // Lock screen wins outright — LockActivity hosts the card, a WindowManager
    // twin would be a second popup.
    for (boolean js : new boolean[] {NO, JS}) {
      for (boolean fg : new boolean[] {NO, FG}) {
        for (boolean dis : new boolean[] {NO, DISMISSED}) {
          eq("locked always defers to the lock screen",
              OrderAlertPresentation.Surface.LOCK_SCREEN,
              OrderAlertPresentation.resolve(js, fg, LOCKED, dis));
          check("locked never mounts the overlay",
              !OrderAlertPresentation.shouldMountOverlay(js, fg, LOCKED, dis));
        }
      }
    }

    // A swipe-away suppresses the card but nothing else.
    eq("dismissed in the background shows nothing",
        OrderAlertPresentation.Surface.NONE,
        OrderAlertPresentation.resolve(NO, NO, NO, DISMISSED));
    eq("dismissal does not stop the app presenting it",
        OrderAlertPresentation.Surface.IN_APP,
        OrderAlertPresentation.resolve(JS, NO, NO, DISMISSED));

    // Exhaustive: never more than one surface, and overlay is the rare case.
    int overlayCount = 0;
    for (int i = 0; i < 16; i++) {
      OrderAlertPresentation.Surface s = OrderAlertPresentation.resolve(
          (i & 1) != 0, (i & 2) != 0, (i & 4) != 0, (i & 8) != 0);
      check("every combination resolves to exactly one surface", s != null);
      if (s == OrderAlertPresentation.Surface.OVERLAY) overlayCount++;
    }
    eq("only one of the 16 states mounts a floating card", 1, overlayCount);
  }

  // --------------------------------------------------------------- harness

  // ------------------------------------------------------- decision ledger

  private static void decisionLedger() {
    final long TTL = OrderAlertDecisionLedger.DEFAULT_TTL_MS;
    final long NOW = 1_700_000_000_000L;

    // ---- canonicalisation: every id shape must reduce to one order token.
    eq("canonical from merchant session id",
        "100058", OrderAlertDecisionLedger.canonicalToken("MERCHANT_NEW_ORDER:100058:12"));
    eq("canonical from native session id",
        "100058", OrderAlertDecisionLedger.canonicalToken("merchant-order-100058"));
    eq("canonical from raw id",
        "100058", OrderAlertDecisionLedger.canonicalToken("100058"));
    eq("canonical from rider session id",
        "ORD9", OrderAlertDecisionLedger.canonicalToken("RIDER_NEW_ORDER:ORD9:4:1"));
    eq("canonical trims", "100058", OrderAlertDecisionLedger.canonicalToken("  100058 "));
    eq("canonical of null is empty", "", OrderAlertDecisionLedger.canonicalToken(null));
    eq("canonical of blank is empty", "", OrderAlertDecisionLedger.canonicalToken("   "));

    // ---- merchant keys unify the two id forms the backend mints.
    String[] startKeys = OrderAlertDecisionLedger.decisionKeys(
        "merchant", "MERCHANT_NEW_ORDER:100058:12", "100058", "", "100058");
    String[] stopByCoreId = OrderAlertDecisionLedger.decisionKeys(
        "merchant", "MERCHANT_NEW_ORDER:100058:12", "ord_abc", "", "100058");
    check("merchant keys are order-scoped", startKeys.length > 0);

    // THE CORE GUARANTEE: accept -> a replayed start for that order is refused.
    String led = OrderAlertDecisionLedger.record("", startKeys, NOW, TTL);
    check("decided right after accept",
        OrderAlertDecisionLedger.isDecided(led, startKeys, NOW, TTL));

    // The reported bug: phone off, FCM queues the start, the stop lands first or
    // is lost, the start arrives on power-on hours later. It must not beep.
    long afterReboot = NOW + (6L * 60L * 60L * 1000L);
    check("queued start after a reboot is still refused",
        OrderAlertDecisionLedger.isDecided(led, startKeys, afterReboot, TTL));

    // A stop keyed on the core order id must block a start keyed on the food id.
    String ledCore = OrderAlertDecisionLedger.record("", stopByCoreId, NOW, TTL);
    check("stop by a different id form still blocks the start",
        OrderAlertDecisionLedger.isDecided(ledCore, startKeys, NOW, TTL));

    // A stop that arrives BEFORE any start must still block it (FCM ordering).
    check("stop-before-start blocks the later start",
        OrderAlertDecisionLedger.isDecided(
            OrderAlertDecisionLedger.record("", stopByCoreId, NOW, TTL),
            startKeys, NOW + 5_000L, TTL));

    // ---- a different order is untouched.
    String[] other = OrderAlertDecisionLedger.decisionKeys(
        "merchant", "MERCHANT_NEW_ORDER:100059:12", "100059", "", "100059");
    check("a different order is NOT decided",
        !OrderAlertDecisionLedger.isDecided(led, other, NOW, TTL));

    // ---- expiry: the ledger must not grow forever.
    check("decision expires after the ttl",
        !OrderAlertDecisionLedger.isDecided(led, startKeys, NOW + TTL + 1L, TTL));
    eq("expired entries are pruned away",
        0, OrderAlertDecisionLedger.size(
            OrderAlertDecisionLedger.prune(led, NOW + TTL + 1L, TTL)));
    eq("live entries survive a prune",
        OrderAlertDecisionLedger.size(led),
        OrderAlertDecisionLedger.size(OrderAlertDecisionLedger.prune(led, NOW, TTL)));
    check("ttl of zero never expires",
        OrderAlertDecisionLedger.isDecided(led, startKeys, NOW + (99L * TTL), 0L));

    // ---- empty / malformed input must never throw or false-positive.
    check("empty ledger decides nothing",
        !OrderAlertDecisionLedger.isDecided("", startKeys, NOW, TTL));
    check("null ledger decides nothing",
        !OrderAlertDecisionLedger.isDecided(null, startKeys, NOW, TTL));
    check("no keys decides nothing",
        !OrderAlertDecisionLedger.isDecided(led, new String[0], NOW, TTL));
    check("null keys decides nothing",
        !OrderAlertDecisionLedger.isDecided(led, null, NOW, TTL));
    check("garbage ledger decides nothing",
        !OrderAlertDecisionLedger.isDecided("not-a-ledger|x@|@5", startKeys, NOW, TTL));
    eq("recording nothing on an empty ledger stays empty",
        "", OrderAlertDecisionLedger.record("", new String[0], NOW, TTL));

    // ---- separators can never corrupt an entry.
    String[] nasty = OrderAlertDecisionLedger.decisionKeys(
        "merchant", "", "10|00@58", "", "");
    String nastyLed = OrderAlertDecisionLedger.record("", nasty, NOW, TTL);
    eq("a token carrying separators yields exactly one entry", 1,
        OrderAlertDecisionLedger.size(nastyLed));
    check("the sanitised token round-trips",
        OrderAlertDecisionLedger.isDecided(nastyLed, nasty, NOW, TTL));

    // ---- re-recording the same order must not duplicate it.
    String twice = OrderAlertDecisionLedger.record(led, startKeys, NOW + 1_000L, TTL);
    eq("re-deciding does not grow the ledger",
        OrderAlertDecisionLedger.size(led), OrderAlertDecisionLedger.size(twice));

    // ---- bounded growth: oldest decisions are evicted, newest survive.
    String big = "";
    for (int i = 0; i < OrderAlertDecisionLedger.MAX_ENTRIES + 50; i++) {
      big = OrderAlertDecisionLedger.record(
          big,
          OrderAlertDecisionLedger.decisionKeys("merchant", "", "ord" + i, "", ""),
          NOW + i,
          TTL);
    }
    eq("ledger is capped", OrderAlertDecisionLedger.MAX_ENTRIES,
        OrderAlertDecisionLedger.size(big));
    check("the newest decision survives the cap",
        OrderAlertDecisionLedger.isDecided(
            big,
            OrderAlertDecisionLedger.decisionKeys(
                "merchant", "", "ord" + (OrderAlertDecisionLedger.MAX_ENTRIES + 49), "", ""),
            NOW + 10_000L,
            TTL));
    check("the oldest decision was evicted",
        !OrderAlertDecisionLedger.isDecided(
            big,
            OrderAlertDecisionLedger.decisionKeys("merchant", "", "ord0", "", ""),
            NOW + 10_000L,
            TTL));

    // ---- ROLE SPLIT. A rider's next wave must still ring; a merchant's
    // accepted order must not. Keying riders on the order id would silently
    // cost them work, so this split is load-bearing, not cosmetic.
    String[] wave1 = OrderAlertDecisionLedger.decisionKeys(
        "rider", "RIDER_NEW_ORDER:ORD9:4:1", "ORD9", "ORD9", "");
    String[] wave2 = OrderAlertDecisionLedger.decisionKeys(
        "rider", "RIDER_NEW_ORDER:ORD9:4:2", "ORD9", "ORD9", "");
    String riderLed = OrderAlertDecisionLedger.record("", wave1, NOW, TTL);
    check("rider wave 1 is decided",
        OrderAlertDecisionLedger.isDecided(riderLed, wave1, NOW, TTL));
    check("rider wave 2 for the SAME order still alerts",
        !OrderAlertDecisionLedger.isDecided(riderLed, wave2, NOW, TTL));
    check("rider keys are session-scoped, not order-scoped",
        !OrderAlertDecisionLedger.isDecided(
            riderLed,
            OrderAlertDecisionLedger.decisionKeys(
                "rider", "RIDER_NEW_ORDER:ORD9:7:1", "ORD9", "ORD9", ""),
            NOW, TTL));
    String merchLed = OrderAlertDecisionLedger.record(
        "", OrderAlertDecisionLedger.decisionKeys(
            "merchant", "MERCHANT_NEW_ORDER:555:3", "555", "", "555"), NOW, TTL);
    check("merchant re-push of a decided order is blocked",
        OrderAlertDecisionLedger.isDecided(
            merchLed,
            OrderAlertDecisionLedger.decisionKeys(
                "merchant", "MERCHANT_NEW_ORDER:555:3", "555", "", "555"),
            NOW + 60_000L, TTL));
    check("rider with an empty session id yields no keys",
        OrderAlertDecisionLedger.decisionKeys("rider", "", "ORD9", "ORD9", "").length == 0);

    // ---- THE INVARIANT THE WHOLE FIX RESTS ON.
    // Both payloads are built from the same two ids:
    //   start: orderId = core text ("GM100..."), foodOrderId = numeric,
    //          alertSessionId = MERCHANT_NEW_ORDER:<foodId ?? coreText>:<store>
    //   stop : the same, from order.status_changed
    // The food-order lookup can resolve on one side and not the other, so the
    // session ids can legitimately differ. Because BOTH always also carry the
    // core order id, their key sets always intersect on it. Verified against
    // production: orders_core.order_id is always "GM..."-prefixed (0 purely
    // numeric rows) and never collides with an orders_food.id, so the numeric
    // and GM namespaces cannot cross-silence a different order.
    final String CORE = "GM10000419";
    final String FOOD = "100058";
    final String STORE = "12";

    String[] startLookupOk = OrderAlertDecisionLedger.decisionKeys(
        "merchant", "MERCHANT_NEW_ORDER:" + FOOD + ":" + STORE, CORE, CORE, FOOD);
    String[] startLookupFailed = OrderAlertDecisionLedger.decisionKeys(
        "merchant", "MERCHANT_NEW_ORDER:" + CORE + ":" + STORE, CORE, CORE, "");
    String[] stopLookupOk = OrderAlertDecisionLedger.decisionKeys(
        "merchant", "MERCHANT_NEW_ORDER:" + FOOD + ":" + STORE, CORE, "", FOOD);
    String[] stopLookupFailed = OrderAlertDecisionLedger.decisionKeys(
        "merchant", "MERCHANT_NEW_ORDER:" + CORE + ":" + STORE, CORE, "", "");

    // All four lookup combinations must silence the start. Any single one of
    // these failing is a buzzer that never stops.
    check("stop(lookup ok) blocks start(lookup ok)",
        OrderAlertDecisionLedger.isDecided(
            OrderAlertDecisionLedger.record("", stopLookupOk, NOW, TTL), startLookupOk, NOW, TTL));
    check("stop(lookup ok) blocks start(lookup FAILED)",
        OrderAlertDecisionLedger.isDecided(
            OrderAlertDecisionLedger.record("", stopLookupOk, NOW, TTL), startLookupFailed, NOW, TTL));
    check("stop(lookup FAILED) blocks start(lookup ok)",
        OrderAlertDecisionLedger.isDecided(
            OrderAlertDecisionLedger.record("", stopLookupFailed, NOW, TTL), startLookupOk, NOW, TTL));
    check("stop(lookup FAILED) blocks start(lookup FAILED)",
        OrderAlertDecisionLedger.isDecided(
            OrderAlertDecisionLedger.record("", stopLookupFailed, NOW, TTL), startLookupFailed, NOW, TTL));

    // The numeric food id of one order must never silence a different order.
    check("a food id does not collide with another order's core id",
        !OrderAlertDecisionLedger.isDecided(
            OrderAlertDecisionLedger.record("", stopLookupOk, NOW, TTL),
            OrderAlertDecisionLedger.decisionKeys(
                "merchant", "MERCHANT_NEW_ORDER:999999:" + STORE, "GM10000420", "", "999999"),
            NOW, TTL));

    // ---- resolveDecisionSessionId: stopping by ORDER id must still record the
    // real wave. stopRiderDispatchBuzzer passes activeOrderIdRef, not a session
    // id, so without this a rider decision was filed under `s:<orderId>` - a key
    // no RIDER_NEW_ORDER:<order>:<rider>:<wave> id can ever match, leaving riders
    // with no replay protection at all.
    final String W1 = "RIDER_NEW_ORDER:ORD9:4:1";
    final String W2 = "RIDER_NEW_ORDER:ORD9:4:2";

    eq("prefers the row's session id over an order-id needle",
        W1, OrderAlertDecisionLedger.resolveDecisionSessionId("ORD9", W1));
    eq("falls back to the needle when no row was found",
        "ORD9", OrderAlertDecisionLedger.resolveDecisionSessionId("ORD9", ""));
    eq("falls back when the row has no session id",
        "ORD9", OrderAlertDecisionLedger.resolveDecisionSessionId("ORD9", "   "));
    eq("null row session id falls back to the needle",
        "ORD9", OrderAlertDecisionLedger.resolveDecisionSessionId("ORD9", null));
    eq("both blank resolves to empty",
        "", OrderAlertDecisionLedger.resolveDecisionSessionId(null, null));
    eq("trims the resolved id", W1,
        OrderAlertDecisionLedger.resolveDecisionSessionId("ORD9", "  " + W1 + " "));

    // End to end for the rider: stop arrives by ORDER id, the row is found, so
    // wave 1 is suppressed and wave 2 still rings.
    String riderByOrderId = OrderAlertDecisionLedger.record(
        "",
        OrderAlertDecisionLedger.decisionKeys(
            "rider",
            OrderAlertDecisionLedger.resolveDecisionSessionId("ORD9", W1),
            "ORD9", "ORD9", ""),
        NOW, TTL);
    check("rider stop by order id suppresses the wave it belongs to",
        OrderAlertDecisionLedger.isDecided(
            riderByOrderId,
            OrderAlertDecisionLedger.decisionKeys("rider", W1, "ORD9", "ORD9", ""),
            NOW, TTL));
    check("rider stop by order id still lets the NEXT wave ring",
        !OrderAlertDecisionLedger.isDecided(
            riderByOrderId,
            OrderAlertDecisionLedger.decisionKeys("rider", W2, "ORD9", "ORD9", ""),
            NOW, TTL));

    // ---- stale-session guard: what stops a persisted row being resurrected.
    final long MAXAGE = OrderAlertDecisionLedger.DEFAULT_SESSION_MAX_AGE_MS;
    check("a fresh session is not stale",
        !OrderAlertDecisionLedger.isSessionStale(NOW, NOW + 1_000L, MAXAGE));
    check("a session at the limit is not stale",
        !OrderAlertDecisionLedger.isSessionStale(NOW, NOW + MAXAGE, MAXAGE));
    check("a session past the limit is stale",
        OrderAlertDecisionLedger.isSessionStale(NOW, NOW + MAXAGE + 1L, MAXAGE));
    check("a day-old session is stale",
        OrderAlertDecisionLedger.isSessionStale(NOW, NOW + (24L * 60L * 60L * 1000L), MAXAGE));
    check("a row with no startedAt is stale, not immortal",
        OrderAlertDecisionLedger.isSessionStale(0L, NOW, MAXAGE));
    check("a future startedAt (clock skew) is not stale",
        !OrderAlertDecisionLedger.isSessionStale(NOW + 60_000L, NOW, MAXAGE));
    check("maxAge of zero disables the staleness guard",
        !OrderAlertDecisionLedger.isSessionStale(1L, NOW, 0L));
    check("the watchdog window is inside the staleness bound",
        MAXAGE > (20L * 60L * 1000L));
  }

  private static void check(String name, boolean ok) {
    if (ok) {
      passed++;
    } else {
      failed++;
      System.out.println("    FAIL  " + name);
    }
  }

  private static void eq(String name, Object expected, Object actual) {
    boolean ok = expected == null ? actual == null : expected.equals(actual);
    if (ok) {
      passed++;
    } else {
      failed++;
      System.out.println("    FAIL  " + name + "\n          expected <" + expected + ">\n          actual   <" + actual + ">");
    }
  }
}
