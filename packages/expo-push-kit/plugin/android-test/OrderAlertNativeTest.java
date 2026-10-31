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

  // --------------------------------------------------------------- harness

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
