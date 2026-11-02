package {{PACKAGE}};

import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Every string the alert card puts in front of a rider or merchant.
 *
 * Android-free on purpose: this is the "detail information in the popup", and it
 * is the one part of the native stack that can be verified without a device.
 */
public final class OrderAlertCardText {
  /** Set from the build role so the card never mislabels whose money it shows. */
  public static final boolean RIDER = "rider".equals("{{ROLE}}");

  private OrderAlertCardText() {}

  static String safe(String raw) {
    return raw == null ? "" : raw.trim();
  }

  /**
   * Rupee figure, or "" when there is nothing worth showing. Zero is treated as
   * absent: a card reading "₹0" tells a rider the job pays nothing.
   */
  public static String formatAmount(String raw) {
    String v = safe(raw);
    if (v.length() == 0) return "";
    if (v.startsWith("₹")) return v;
    try {
      double n = Double.parseDouble(v);
      if (n <= 0) return "";
      if (Math.abs(n - Math.rint(n)) < 0.001) return "₹" + (long) Math.rint(n);
      return "₹" + v;
    } catch (Throwable t) {
      // Not a number at all — show nothing rather than raw payload text.
      return "";
    }
  }

  /**
   * Riders are sent their own payout in this field and merchants the order
   * total, so the same number needs a different sentence.
   */
  public static String amountLabel(String raw) {
    String amount = formatAmount(raw);
    if (amount.length() == 0) return "";
    return RIDER ? "You earn " + amount : amount;
  }

  /**
   * Distance as "3.7 km", or "" when there is nothing useful to show.
   *
   * The payload sends kilometres as a bare number. Zero and negatives are
   * treated as absent rather than printed: "0 km to pickup" is worse than no
   * row at all, and a missing field must never render as "null km".
   */
  public static String kmLabel(String raw) {
    String v = safe(raw);
    if (v.length() == 0) return "";
    if (v.toLowerCase().endsWith("km")) return v;
    try {
      double n = Double.parseDouble(v);
      if (!(n > 0)) return "";
      // One decimal, and no trailing ".0" - "4 km" reads better than "4.0 km".
      double rounded = Math.rint(n * 10.0) / 10.0;
      if (Math.abs(rounded - Math.rint(rounded)) < 0.001) {
        return ((long) Math.rint(rounded)) + " km";
      }
      return rounded + " km";
    } catch (Throwable t) {
      return "";
    }
  }

  /** "1 item" / "3 items", or "" when the count is missing or not positive. */
  public static String itemCountLabel(String raw) {
    String v = safe(raw);
    if (v.length() == 0) return "";
    try {
      double n = Double.parseDouble(v);
      long count = (long) Math.rint(n);
      if (count <= 0) return "";
      return count == 1 ? "1 item" : count + " items";
    } catch (Throwable t) {
      return "";
    }
  }

  /**
   * Label for the money headline on the card.
   *
   * A rider is shown what the job pays them; a merchant is shown what the
   * order is worth. Same field, different sentence - keep it in one place so
   * the two cards cannot drift apart.
   */
  public static String earningsCaption() {
    return RIDER ? "Total earnings" : "Order total";
  }

  /**
   * Store / counterparty line under the heading.
   *
   * A rider needs to know which restaurant to collect from. A merchant already
   * knows their own store, so showing it back to them is noise - they get the
   * customer instead, which the card adds separately.
   */
  public static String storeLine(String storeName) {
    if (!RIDER) return "";
    return safe(storeName);
  }

  /**
   * One compact "to pickup / trip / overall" summary, skipping any leg the
   * payload did not send so a partial payload still renders cleanly.
   *
   * Returns "" when no leg is known, so the caller can omit the whole row
   * rather than draw an empty strip.
   */
  public static String distanceSummary(String toPickupKm, String tripKm, String overallKm) {
    String a = kmLabel(toPickupKm);
    String b = kmLabel(tripKm);
    String c = kmLabel(overallKm);
    StringBuilder sb = new StringBuilder();
    if (a.length() > 0) sb.append("Pickup ").append(a);
    if (b.length() > 0) {
      if (sb.length() > 0) sb.append("  ·  ");
      sb.append("Trip ").append(b);
    }
    if (c.length() > 0) {
      if (sb.length() > 0) sb.append("  ·  ");
      sb.append("Total ").append(c);
    }
    return sb.toString();
  }

  public static String displayOrderType(String raw) {
    String v = safe(raw).toLowerCase();
    if (v.length() == 0) return "";
    if ("food".equals(v)) return "Food";
    if ("parcel".equals(v)) return "Parcel";
    if ("ride".equals(v) || "person_ride".equals(v) || "person-ride".equals(v)) return "Ride";
    if (v.length() == 1) return v.toUpperCase();
    return Character.toUpperCase(v.charAt(0)) + v.substring(1);
  }

  /** Rider cards name the job; a merchant card only ever receives orders. */
  public static String headingFor(String orderType) {
    if (!RIDER) return "NEW ORDER";
    String label = displayOrderType(orderType);
    return label.length() == 0 ? "NEW ORDER REQUEST" : "NEW " + label.toUpperCase() + " REQUEST";
  }

  /** A bare number from the payload is metres; anything else is already formatted. */
  public static String displayPickup(String raw) {
    String v = safe(raw);
    if (v.length() == 0) return "";
    return v.matches("^\\d+$") ? v + " m" : v;
  }

  /**
   * Public order id. Falls back to scraping the body text only when no id field
   * arrived — and matches every service prefix, not just food's GMF, which is
   * why ride and parcel cards used to show no id at all.
   */
  public static String publicOrderId(String idField, String blob) {
    String display = safe(idField);
    // A bare integer is an internal row id, never something to show.
    if (display.matches("^\\d+$")) display = "";
    if (display.length() > 0) return display;
    Matcher m = Pattern.compile("GM[A-Z]\\d+", Pattern.CASE_INSENSITIVE).matcher(safe(blob));
    return m.find() ? m.group().toUpperCase() : "";
  }

  /**
   * Epoch millis from the server, accepting millis, seconds, or an ISO-8601
   * instant. 0 means "no usable deadline" so the caller hides the timer instead
   * of rendering an expired one.
   */
  public static long parseEpochMs(String raw) {
    String v = safe(raw);
    if (v.length() == 0) return 0L;
    try {
      if (v.matches("^\\d+$")) {
        long n = Long.parseLong(v);
        // Seconds vs millis is only distinguishable by magnitude; below this a
        // value cannot be a sane millisecond timestamp.
        return n < 100000000000L ? n * 1000L : n;
      }
      return java.time.Instant.parse(v).toEpochMilli();
    } catch (Throwable ignored) {
      return 0L;
    }
  }

  /**
   * Seconds remaining, rounded up so a live offer never reads "0s". Negative
   * input means expired.
   */
  public static String countdownLabel(long expiresAtMs, long nowMs) {
    long leftMs = expiresAtMs - nowMs;
    if (leftMs <= 0L) return "0s";
    return ((leftMs + 999L) / 1000L) + "s";
  }

  /** Premium lock-screen clock, e.g. "0:47" / "1:05". */
  public static String countdownClock(long expiresAtMs, long nowMs) {
    long leftMs = expiresAtMs - nowMs;
    if (leftMs <= 0L) return "0:00";
    long totalSec = (leftMs + 999L) / 1000L;
    long mins = totalSec / 60L;
    long secs = totalSec % 60L;
    return mins + ":" + (secs < 10 ? "0" : "") + secs;
  }

  public static String openToAcceptLabel() {
    return "OPEN TO ACCEPT →";
  }

  /**
   * Parse a compact items payload into display lines.
   * Accepts JSON array [{"q":1,"n":"Paneer Burger"}] or pipe form "1x A|2x B".
   * Android-free (no org.json) so the plain-JVM suite can verify it.
   */
  public static String[] itemLines(String raw, int maxLines) {
    String v = safe(raw);
    if (v.length() == 0) return new String[0];
    int cap = Math.max(1, Math.min(12, maxLines));
    if (v.startsWith("[")) {
      java.util.ArrayList<String> lines = new java.util.ArrayList<>();
      int i = 0;
      while (i < v.length() && lines.size() < cap) {
        int objStart = v.indexOf('{', i);
        if (objStart < 0) break;
        int objEnd = v.indexOf('}', objStart);
        if (objEnd < 0) break;
        String obj = v.substring(objStart, objEnd + 1);
        int q = Math.max(1, parseJsonInt(obj, "q", parseJsonInt(obj, "qty", 1)));
        String name = parseJsonString(obj, "n");
        if (name.length() == 0) name = parseJsonString(obj, "name");
        if (name.length() == 0) name = "Item";
        String variant = parseJsonString(obj, "v");
        if (variant.length() == 0) variant = parseJsonString(obj, "variant");
        lines.add(q + " × " + name + (variant.length() > 0 ? " (" + variant + ")" : ""));
        i = objEnd + 1;
      }
      return lines.toArray(new String[0]);
    }
    String[] parts = v.split("\\|");
    int n = Math.min(cap, parts.length);
    String[] out = new String[n];
    for (int j = 0; j < n; j++) out[j] = safe(parts[j]);
    return out;
  }

  private static String parseJsonString(String obj, String key) {
    String needle = "\"" + key + "\"";
    int at = obj.indexOf(needle);
    if (at < 0) return "";
    int colon = obj.indexOf(':', at + needle.length());
    if (colon < 0) return "";
    int q1 = obj.indexOf('"', colon + 1);
    if (q1 < 0) return "";
    int q2 = obj.indexOf('"', q1 + 1);
    if (q2 < 0) return "";
    return safe(obj.substring(q1 + 1, q2));
  }

  private static int parseJsonInt(String obj, String key, int fallback) {
    String needle = "\"" + key + "\"";
    int at = obj.indexOf(needle);
    if (at < 0) return fallback;
    int colon = obj.indexOf(':', at + needle.length());
    if (colon < 0) return fallback;
    int i = colon + 1;
    while (i < obj.length() && Character.isWhitespace(obj.charAt(i))) i++;
    int j = i;
    while (j < obj.length() && (Character.isDigit(obj.charAt(j)))) j++;
    if (j == i) return fallback;
    try {
      return Integer.parseInt(obj.substring(i, j));
    } catch (Throwable t) {
      return fallback;
    }
  }

  /** Shade / BigText body with order id, amount, and up to a few items. */
  public static String shadeBody(
      String displayOrderId,
      String amountRaw,
      String customer,
      String itemsJson,
      String fallback
  ) {
    StringBuilder sb = new StringBuilder();
    String id = safe(displayOrderId);
    String amount = formatAmount(amountRaw);
    if (id.length() > 0) sb.append(id);
    if (amount.length() > 0) {
      if (sb.length() > 0) sb.append(" · ");
      sb.append(amount);
    }
    String cust = safe(customer);
    if (cust.length() > 0 && !"Customer".equalsIgnoreCase(cust)) {
      if (sb.length() > 0) sb.append('\n');
      sb.append(cust);
    }
    String[] lines = itemLines(itemsJson, 4);
    for (String line : lines) {
      if (line.length() == 0) continue;
      if (sb.length() > 0) sb.append('\n');
      sb.append(line);
    }
    if (sb.length() == 0) {
      String fb = safe(fallback);
      return fb.length() > 0 ? fb : "Open to accept";
    }
    return sb.toString();
  }

  /**
   * True when the title/body adds nothing the card has not already shown in a
   * dedicated row, so the detail line can be dropped instead of repeating it.
   */
  public static boolean isGenericDetail(String detail) {
    String v = safe(detail);
    if (v.length() == 0) return true;
    String lower = v.toLowerCase();
    return lower.contains("new order") || v.matches("(?i)^order\\s*#?\\s*\\d+$");
  }
}
