package {{PACKAGE}};

/**
 * Remembers which alerts are already DECIDED, so a decided order can never be
 * made to beep again.
 *
 * Why this exists
 * ---------------
 * The alert engine was purely edge-triggered: a "start" push created a session
 * and looped the buzzer, a "stop" push or a local Accept/Reject removed it.
 * Nothing ever asked "is this order still undecided?", so every way of losing,
 * duplicating, re-ordering or mis-keying a control message left a merchant with
 * a buzzer that would not stop:
 *
 *   - FCM holds messages for an offline device and start/stop use DIFFERENT
 *     collapse keys, so after the phone is powered on the queued "start" can be
 *     delivered AFTER the "stop" that was meant to cancel it. The stop is
 *     applied to nothing, then the start begins looping an order that was
 *     accepted an hour ago. (This is the reported "it comes back after I switch
 *     the device off and on".)
 *   - The session row lives in SharedPreferences with no expiry, and both
 *     OrderAlertForegroundService.onStartCommand and
 *     OrderAlertController.onServiceStart fall back to getActive() when an
 *     intent carries no session id. Any later service start - the pill, an app
 *     launch, a START_STICKY restart - therefore resurrects it.
 *   - The session id is assembled independently in several backend call sites
 *     as `MERCHANT_NEW_ORDER:<foodOrderId or coreOrderId>:<storeId>`. When the
 *     food-order lookup resolves at start time but not at stop time (or the
 *     reverse) the two ids differ and no amount of matching can unify them.
 *
 * A device-side decision ledger makes `start` idempotent instead: once an order
 * is decided, a replayed or late start for it is refused outright. That is a
 * level-triggered guarantee, so it does not depend on any single message being
 * delivered, delivered once, or delivered in order.
 *
 * Role matters
 * ------------
 * For a MERCHANT an accepted or rejected order is terminal - it must never
 * alert that store again, on any device. For a RIDER the same order id is
 * legitimately re-offered in a later dispatch wave, so keying on the order
 * would silently cost riders work. Rider decisions are therefore keyed on the
 * full wave-scoped session id and merchant decisions on the stable order token.
 *
 * Android-free on purpose: this is the half of the engine that can be executed
 * by scripts/test-order-alert-native.mjs on a plain JVM.
 */
public final class OrderAlertDecisionLedger {
  /**
   * How long a decision suppresses re-alerting. Must outlast FCM's offline
   * queue and a device being off overnight, and be far longer than any order
   * lifecycle, while still bounding what we store.
   */
  public static final long DEFAULT_TTL_MS = 24L * 60L * 60L * 1000L;

  /**
   * A session older than this can never be legitimately alerting: the
   * foreground service's own watchdog gives up at 20 minutes. Anything beyond
   * that is leftover state, and resurrecting it is the bug.
   */
  public static final long DEFAULT_SESSION_MAX_AGE_MS = 25L * 60L * 1000L;

  /** Bounds the stored string; oldest entries are dropped first. */
  public static final int MAX_ENTRIES = 200;

  private static final char ENTRY_SEP = '|';
  private static final char TIME_SEP = '@';

  private OrderAlertDecisionLedger() {}

  /**
   * Reduce any id shape the stack uses to the stable order token.
   *
   * `MERCHANT_NEW_ORDER:100058:12` -> `100058`
   * `merchant-order-100058`        -> `100058`
   * `100058`                       -> `100058`
   */
  public static String canonicalToken(String raw) {
    if (raw == null) return "";
    String t = raw.trim();
    if (t.length() == 0) return "";
    if (t.startsWith("merchant-order-")) return sanitize(t.substring("merchant-order-".length()));
    if (t.startsWith("rider-offer-")) return sanitize(t.substring("rider-offer-".length()));
    if (t.startsWith("MERCHANT_NEW_ORDER:")) return sanitize(head(t.substring("MERCHANT_NEW_ORDER:".length())));
    if (t.startsWith("RIDER_NEW_ORDER:")) return sanitize(head(t.substring("RIDER_NEW_ORDER:".length())));
    return sanitize(t);
  }

  private static String head(String rest) {
    int colon = rest.indexOf(':');
    return colon >= 0 ? rest.substring(0, colon) : rest;
  }

  /** The separators are not legal in any id we mint; drop them defensively. */
  private static String sanitize(String value) {
    if (value == null) return "";
    String t = value.trim();
    if (t.length() == 0) return "";
    StringBuilder sb = new StringBuilder(t.length());
    for (int i = 0; i < t.length(); i++) {
      char c = t.charAt(i);
      if (c == ENTRY_SEP || c == TIME_SEP) continue;
      sb.append(c);
    }
    return sb.toString();
  }

  /**
   * The keys a decision is recorded and looked up under.
   *
   * Merchant: every known id for the order, canonicalised, so a stop keyed on
   * the core order id still blocks a start keyed on the food order id.
   * Rider: the wave-scoped session id alone, so a later wave still alerts.
   */
  public static String[] decisionKeys(
      String role,
      String sessionId,
      String orderId,
      String offerId,
      String foodOrderId
  ) {
    return decisionKeys(role, sessionId, orderId, offerId, foodOrderId, "");
  }

  /**
   * As above, plus the human-facing order id.
   *
   * A stop can arrive carrying only the display id (`GMF-10058`): the Partner
   * Website and the eventBus fan-out build their session string from whatever
   * the order row gave them, which is not always the numeric food order id the
   * ringing session was keyed on. Canonicalising it into the same `o:` space
   * lets such a stop block a start that uses the numeric id.
   *
   * It stays an ORDER key, so riders are unaffected: their keys remain the
   * wave-scoped session id alone, and a display id must never retire a rider's
   * next wave.
   */
  public static String[] decisionKeys(
      String role,
      String sessionId,
      String orderId,
      String offerId,
      String foodOrderId,
      String formattedOrderId
  ) {
    return decisionKeys(
        role,
        sessionId,
        new String[] {orderId, offerId, foodOrderId, formattedOrderId});
  }

  /**
   * The general form: a session id plus every other id this order answers to.
   *
   * One order reaches the device under four or five different names - numeric
   * food id, core order id, offer id, display id, and whichever of them the
   * backend happened to bake into the session string. They are minted in
   * several independent places, so which one a given START or STOP carries is
   * not something this layer can assume. Canonicalising all of them into one
   * `o:` key space is what lets a stop keyed on any single form block a start
   * keyed on another.
   *
   * Riders are deliberately exempt: their key is the wave-scoped session id
   * alone, because the same order is legitimately re-offered in a later wave
   * and an order-scoped key would silently retire every wave after the first.
   */
  public static String[] decisionKeys(String role, String sessionId, String[] orderIds) {
    java.util.LinkedHashSet<String> keys = new java.util.LinkedHashSet<String>();
    if ("rider".equals(role)) {
      String sid = sanitize(sessionId);
      if (sid.length() > 0) keys.add("s:" + sid);
      return keys.toArray(new String[0]);
    }
    addOrderKey(keys, sessionId);
    if (orderIds != null) {
      for (int i = 0; i < orderIds.length; i++) addOrderKey(keys, orderIds[i]);
    }
    return keys.toArray(new String[0]);
  }

  private static void addOrderKey(java.util.LinkedHashSet<String> keys, String raw) {
    String token = canonicalToken(raw);
    if (token.length() > 0) keys.add("o:" + token);
  }

  /**
   * Which session id a decision should be recorded under.
   *
   * Callers legitimately stop by ORDER id, not session id: the rider app's
   * stopRiderDispatchBuzzer passes activeOrderIdRef, and the merchant JS tries
   * several token shapes in turn. Because a rider decision is keyed on the
   * wave-scoped session id, keying it on that needle would record
   * `s:&lt;orderId&gt;` - which no real RIDER_NEW_ORDER:&lt;order&gt;:&lt;rider&gt;:&lt;wave&gt;
   * session id can ever match, leaving riders with no replay protection.
   *
   * So prefer the session id carried by the session row that was actually
   * found, and fall back to the needle only when there is no row (the
   * stop-before-start case, where the needle IS the best id available).
   */
  public static String resolveDecisionSessionId(String needle, String rowSessionId) {
    String row = rowSessionId == null ? "" : rowSessionId.trim();
    if (row.length() > 0) return row;
    return needle == null ? "" : needle.trim();
  }

  /**
   * Rider session ids may omit the wave suffix in JS
   * (`RIDER_NEW_ORDER:order:rider`) while FCM includes it
   * (`RIDER_NEW_ORDER:order:rider:wave`). Treat those as the same decision for
   * replay protection. Distinct waves (`…:1` vs `…:2`) are NOT related — neither
   * is a prefix of the other with a trailing ':'.
   */
  public static boolean riderSessionKeysRelated(String a, String b) {
    if (a == null || b == null) return false;
    if (a.equals(b)) return true;
    String ka = a.startsWith("s:") ? a.substring(2) : a;
    String kb = b.startsWith("s:") ? b.substring(2) : b;
    if (!ka.startsWith("RIDER_NEW_ORDER:") || !kb.startsWith("RIDER_NEW_ORDER:")) return false;
    return ka.startsWith(kb + ":") || kb.startsWith(ka + ":");
  }

  /** True when any of these keys was decided and the decision has not expired. */
  public static boolean isDecided(String ledger, String[] keys, long nowMs, long ttlMs) {
    if (keys == null || keys.length == 0) return false;
    String raw = ledger == null ? "" : ledger;
    if (raw.length() == 0) return false;
    for (String entry : split(raw)) {
      int at = entry.lastIndexOf(TIME_SEP);
      if (at <= 0) continue;
      String key = entry.substring(0, at);
      long at_ms = parseLong(entry.substring(at + 1));
      if (at_ms <= 0 || expired(at_ms, nowMs, ttlMs)) continue;
      for (String k : keys) {
        if (k == null) continue;
        if (k.equals(key) || riderSessionKeysRelated(k, key)) return true;
      }
    }
    return false;
  }

  /** Record a decision for every key, pruning expired entries as we go. */
  public static String record(String ledger, String[] keys, long nowMs, long ttlMs) {
    java.util.LinkedHashMap<String, Long> live = parse(ledger, nowMs, ttlMs);
    if (keys != null) {
      for (String k : keys) {
        if (k == null || k.length() == 0) continue;
        live.remove(k); // re-insert so the newest decision sorts last
        live.put(k, nowMs);
      }
    }
    return serialize(live);
  }

  /** Drop expired entries without recording anything. */
  public static String prune(String ledger, long nowMs, long ttlMs) {
    return serialize(parse(ledger, nowMs, ttlMs));
  }

  /** Number of live entries - for tests and logging. */
  public static int size(String ledger) {
    return split(ledger == null ? "" : ledger).length;
  }

  /**
   * A session this old is leftover state. Guards resurrection of a persisted
   * row long after its order stopped mattering.
   */
  public static boolean isSessionStale(long startedAtMs, long nowMs, long maxAgeMs) {
    if (maxAgeMs <= 0) return false;
    // A row written by an older build has no startedAt. Treat it as stale
    // rather than immortal: that is the state this fix exists to clear.
    if (startedAtMs <= 0) return true;
    // Clock moved backwards (reboot, NTP, timezone fiddling) - a future
    // timestamp is not evidence of staleness, so keep the session.
    if (startedAtMs > nowMs) return false;
    return nowMs - startedAtMs > maxAgeMs;
  }

  private static boolean expired(long atMs, long nowMs, long ttlMs) {
    if (ttlMs <= 0) return false;
    if (atMs > nowMs) return false; // clock skew - keep it
    return nowMs - atMs > ttlMs;
  }

  private static java.util.LinkedHashMap<String, Long> parse(String ledger, long nowMs, long ttlMs) {
    java.util.LinkedHashMap<String, Long> out = new java.util.LinkedHashMap<String, Long>();
    for (String entry : split(ledger == null ? "" : ledger)) {
      int at = entry.lastIndexOf(TIME_SEP);
      if (at <= 0) continue;
      String key = entry.substring(0, at);
      long atMs = parseLong(entry.substring(at + 1));
      if (key.length() == 0 || atMs <= 0) continue;
      if (expired(atMs, nowMs, ttlMs)) continue;
      out.remove(key);
      out.put(key, atMs);
    }
    return out;
  }

  private static String serialize(java.util.LinkedHashMap<String, Long> live) {
    int drop = live.size() - MAX_ENTRIES;
    StringBuilder sb = new StringBuilder();
    int i = 0;
    for (java.util.Map.Entry<String, Long> e : live.entrySet()) {
      if (i++ < drop) continue; // oldest first - insertion order
      if (sb.length() > 0) sb.append(ENTRY_SEP);
      sb.append(e.getKey()).append(TIME_SEP).append(e.getValue().longValue());
    }
    return sb.toString();
  }

  private static String[] split(String raw) {
    if (raw == null || raw.length() == 0) return new String[0];
    java.util.ArrayList<String> parts = new java.util.ArrayList<String>();
    int start = 0;
    for (int i = 0; i <= raw.length(); i++) {
      if (i == raw.length() || raw.charAt(i) == ENTRY_SEP) {
        if (i > start) parts.add(raw.substring(start, i));
        start = i + 1;
      }
    }
    return parts.toArray(new String[0]);
  }

  private static long parseLong(String value) {
    if (value == null) return 0L;
    String t = value.trim();
    if (t.length() == 0) return 0L;
    try {
      return Long.parseLong(t);
    } catch (NumberFormatException e) {
      return 0L;
    }
  }
}
