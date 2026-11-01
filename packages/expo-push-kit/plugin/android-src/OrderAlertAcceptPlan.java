package {{PACKAGE}};

/**
 * Decides what an Accept tapped outside the app should send, and whether it can
 * be sent at all.
 *
 * Deliberately free of every Android type so it can be unit-tested on a plain
 * JVM. This is the logic that was previously wrong in a way no compiler and no
 * test could catch: a rider's tap fell into the merchant branch, failed its
 * guard, and returned without sending anything or reporting anything.
 */
public final class OrderAlertAcceptPlan {
  /** Absolute endpoint, or null when {@link #reason} says why not. */
  public final String url;
  public final String method;
  public final String body;
  public final String idempotencyKey;
  /** Order reference used for logging and for the idempotency fallback. */
  public final String orderToken;
  /** null when the plan is sendable; otherwise a stable machine-readable cause. */
  public final String reason;

  private OrderAlertAcceptPlan(
      String url, String method, String body, String idempotencyKey, String orderToken, String reason) {
    this.url = url;
    this.method = method;
    this.body = body;
    this.idempotencyKey = idempotencyKey;
    this.orderToken = orderToken;
    this.reason = reason;
  }

  public boolean isSendable() {
    return reason == null;
  }

  private static OrderAlertAcceptPlan refuse(String reason) {
    return new OrderAlertAcceptPlan(null, null, null, null, "", reason);
  }

  private static String trim(String v) {
    return v == null ? "" : v.trim();
  }

  /**
   * Keyed on the alert session so the overlay button and the notification action
   * for one offer collapse into a single accept server-side. Falls back to the
   * order reference only when no session id reached us.
   */
  static String idempotencyKeyFor(String sessionId, String orderToken) {
    String sid = trim(sessionId);
    return "gm-native-accept:" + (sid.length() > 0 ? sid : orderToken);
  }

  public static OrderAlertAcceptPlan build(
      String role,
      String baseUrl,
      String token,
      String sessionId,
      String orderId,
      String offerId,
      String storeId,
      String foodOrderId
  ) {
    String base = trim(baseUrl);
    // No credentials means nobody has signed in on this device since the alert
    // stack was installed. That is a reportable state, not a silent drop.
    if (base.length() == 0 || trim(token).length() == 0) return refuse("not_signed_in");
    String root = base.replaceAll("/+$", "");

    if ("rider".equals(role)) {
      String ref = trim(orderId);
      if (ref.length() == 0) ref = trim(offerId);
      if (ref.length() == 0) return refuse("no_order_ref");
      return new OrderAlertAcceptPlan(
          root + "/v1/rider/orders/" + encodePathSegment(ref) + "/accept",
          "POST",
          // Matches riderApi.acceptOrder — the route takes no body fields.
          "{}",
          idempotencyKeyFor(sessionId, ref),
          ref,
          null
      );
    }

    String store = trim(storeId);
    String food = trim(foodOrderId);
    if (food.length() == 0) {
      String fromOrderId = trim(orderId);
      food = fromOrderId.matches("^\\d+$") ? fromOrderId : "";
    }
    if (store.length() == 0 || !food.matches("^\\d+$")) return refuse("no_order_ref");
    return new OrderAlertAcceptPlan(
        root + "/v1/merchant-partner/stores/" + store + "/food-orders/" + food,
        "PATCH",
        "{\"status\":\"ACCEPTED\",\"action_source\":\"notification\",\"accept_mode\":\"manual\"}",
        idempotencyKeyFor(sessionId, food),
        food,
        null
    );
  }

  /**
   * Order references are opaque and may contain characters that would otherwise
   * change the path. URLEncoder is form encoding, so its "+" has to become %20.
   */
  static String encodePathSegment(String raw) {
    try {
      return java.net.URLEncoder.encode(raw, "UTF-8").replace("+", "%20");
    } catch (Throwable ignored) {
      return raw;
    }
  }
}
