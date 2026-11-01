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
