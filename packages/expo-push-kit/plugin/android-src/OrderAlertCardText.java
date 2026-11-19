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
    String v = safe(raw).toLowerCase().replace('-', '_');
    if (v.length() == 0) return "";
    if ("food".equals(v)) return "Food Delivery";
    if ("grocery".equals(v)) return "Grocery Delivery";
    if ("parcel".equals(v)) return "Parcel Delivery";
    if ("ride".equals(v) || "person_ride".equals(v) || "bike".equals(v) || "bike_ride".equals(v)) {
      return "Bike Ride";
    }
    if (v.length() == 1) return v.toUpperCase();
    return Character.toUpperCase(v.charAt(0)) + v.substring(1).replace('_', ' ');
  }

  /** Brand line above the alert heading. */
  public static String brandLine() {
    return RIDER ? "GatiMitra Rider" : "GatiMitra";
  }

  /** Rider cards name the job; a merchant card only ever receives orders. */
  public static String headingFor(String orderType) {
    if (!RIDER) return "NEW ORDER";
    return "NEW ORDER RECEIVED";
  }

  /** Type chip under the heading — never invent a category. */
  public static String typeLine(String orderType) {
    return displayOrderType(orderType);
  }

  /** A bare number from the payload is metres; anything else is already formatted. */
  public static String displayPickup(String raw) {
    String v = safe(raw);
    if (v.length() == 0) return "";
    // Pure metres from a mis-wired distance field — show as distance, not address.
    if (v.matches("^\\d+$")) return v + " m";
    return v;
  }

  /** "Accept within 0:25" — empty when no deadline. */
  public static String acceptWithinLabel(long expiresAtMs, long nowMs) {
    if (expiresAtMs <= 0L) return "";
    return "Accept within " + countdownClock(expiresAtMs, nowMs);
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
    return shadeBodyRich(
        displayOrderId, "", amountRaw, "", "", "", "", "", customer, itemsJson, fallback);
  }

  /**
   * Rich shade body for background / lock-screen notifications: type, pickup,
   * drop, distances, rider earning. Missing fields are skipped — never invented.
   */
  public static String shadeBodyRich(
      String displayOrderId,
      String orderType,
      String amountRaw,
      String storeName,
      String pickup,
      String drop,
      String toPickupKm,
      String tripKm,
      String customer,
      String itemsJson,
      String fallback
  ) {
    StringBuilder sb = new StringBuilder();
    String type = displayOrderType(orderType);
    if (type.length() > 0) sb.append(type);
    String id = safe(displayOrderId);
    if (id.length() > 0) {
      if (sb.length() > 0) sb.append(" · ");
      sb.append(id);
    }
    String earn = amountLabel(amountRaw);
    if (earn.length() > 0) {
      if (sb.length() > 0) sb.append('\n');
      sb.append(earn);
    }
    String store = storeLine(storeName);
    String pickupLine = displayPickup(pickup);
    if (store.length() > 0 || pickupLine.length() > 0) {
      if (sb.length() > 0) sb.append('\n');
      sb.append("Pickup: ");
      if (store.length() > 0) sb.append(store);
      if (store.length() > 0 && pickupLine.length() > 0 && !pickupLine.equalsIgnoreCase(store)) {
        sb.append(" · ").append(pickupLine);
      } else if (store.length() == 0) {
        sb.append(pickupLine);
      }
    }
    String dropLine = safe(drop);
    if (dropLine.length() > 0) {
      if (sb.length() > 0) sb.append('\n');
      sb.append("Drop: ").append(dropLine);
    }
    String distances = distanceSummary(toPickupKm, tripKm, "");
    if (distances.length() > 0) {
      if (sb.length() > 0) sb.append('\n');
      sb.append(distances);
    }
    String cust = safe(customer);
    if (cust.length() > 0 && !"Customer".equalsIgnoreCase(cust)) {
      if (sb.length() > 0) sb.append('\n');
      sb.append(cust);
    }
    String[] lines = itemLines(itemsJson, 3);
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

  // ------------------------------------------------------------------------
  // Rich card (mirrors the in-app IncomingOrderModal sheets)
  // ------------------------------------------------------------------------

  /** Whole rupees from a payload number, or 0 for missing / zero / garbage. */
  public static long rupees(String raw) {
    String v = safe(raw).replace("₹", "").replace(",", "").trim();
    if (v.length() == 0) return 0L;
    try {
      double n = Double.parseDouble(v);
      if (!(n > 0)) return 0L;
      return Math.round(n);
    } catch (Throwable t) {
      return 0L;
    }
  }

  private static double km(String raw) {
    String v = safe(raw).toLowerCase().replace("km", "").trim();
    if (v.length() == 0) return 0d;
    try {
      double n = Double.parseDouble(v);
      return n > 0 ? n : 0d;
    } catch (Throwable t) {
      return 0d;
    }
  }

  private static boolean isRide(String orderType) {
    String v = safe(orderType).toLowerCase().replace('-', '_');
    return "ride".equals(v) || "person_ride".equals(v) || "bike".equals(v) || "bike_ride".equals(v);
  }

  private static boolean isParcel(String orderType) {
    return "parcel".equals(safe(orderType).toLowerCase());
  }

  /** The pill over the card, as the in-app fuse badge words it. */
  public static String newOrderBadge(String orderType) {
    if (!RIDER) return "New order!";
    if (isRide(orderType)) return "New ride!";
    if (isParcel(orderType)) return "New parcel!";
    return "New order!";
  }

  /** Category chip text; never invents a category the payload did not send. */
  public static String bannerLabel(String orderType) {
    return displayOrderType(orderType);
  }

  /**
   * Rider earnings breakdown exactly as the in-app offer sheet builds it: the
   * base line is DERIVED (total − waiting − surge − first-mile − tip) so the
   * rows always add up to the total the rider is promised.
   *
   * Each row is {label, value, kind}; kind is base | waiting | surge |
   * firstMile | tip | total. The total row is always last. Merchants never get
   * a breakdown, and no total means no rows at all (never a "₹0" card).
   */
  public static String[][] earningRows(
      String orderType,
      String totalRaw,
      String waitingRaw,
      String surgeRaw,
      String firstMileRaw,
      String tipRaw
  ) {
    if (!RIDER) return new String[0][];
    long total = rupees(totalRaw);
    if (total <= 0) return new String[0][];
    long waiting = rupees(waitingRaw);
    long surge = rupees(surgeRaw);
    long firstMile = rupees(firstMileRaw);
    long tip = rupees(tipRaw);
    java.util.ArrayList<String[]> rows = new java.util.ArrayList<>();
    if (waiting + surge + firstMile + tip > 0) {
      long base = Math.max(0L, total - waiting - surge - firstMile - tip);
      String baseLabel = isRide(orderType) ? "Base earnings" : "Trip earning";
      rows.add(new String[] {baseLabel, "₹" + base, "base"});
      if (waiting > 0) rows.add(new String[] {"Waiting charge", "+ ₹" + waiting, "waiting"});
      if (surge > 0) rows.add(new String[] {"Surge", "+ ₹" + surge, "surge"});
      if (firstMile > 0) rows.add(new String[] {"First-mile allowance", "+ ₹" + firstMile, "firstMile"});
      if (tip > 0) rows.add(new String[] {"Customer tip", "+ ₹" + tip, "tip"});
    }
    rows.add(new String[] {"Total earnings", "₹" + total, "total"});
    return rows.toArray(new String[0][]);
  }

  /**
   * Overall distance, computed as the in-app sheet does: to-pickup + trip when
   * both legs are known, else the overall the payload carried, else whichever
   * single leg is known. Returns a bare km number ("5.7") or "".
   */
  public static String overallKm(String toPickupKm, String tripKm, String overallKm) {
    double a = km(toPickupKm);
    double b = km(tripKm);
    double sent = km(overallKm);
    double total = a > 0 && b > 0 ? a + b : (sent > 0 ? sent : (b > 0 ? b : a));
    if (!(total > 0)) return "";
    double rounded = Math.rint(total * 10.0) / 10.0;
    if (Math.abs(rounded - Math.rint(rounded)) < 0.001) return String.valueOf((long) Math.rint(rounded));
    return String.valueOf(rounded);
  }

  /**
   * The To pickup / Trip / Overall strip. "—" marks an unknown leg so the three
   * columns stay aligned; an empty array means no leg is known and the caller
   * drops the whole strip instead of printing "Distance unavailable".
   */
  public static String[] distanceCells(String toPickupKm, String tripKm, String overallKm) {
    String a = kmLabel(toPickupKm);
    String b = kmLabel(tripKm);
    String c = kmLabel(overallKm(toPickupKm, tripKm, overallKm));
    if (a.length() == 0 && b.length() == 0 && c.length() == 0) return new String[0];
    return new String[] {
        a.length() > 0 ? a : "—",
        b.length() > 0 ? b : "—",
        c.length() > 0 ? c : "—",
    };
  }

  /** Short payment chip: "Cash", "Paid online", or "" when unknown. */
  public static String paymentChip(String paymentMethod) {
    String v = safe(paymentMethod).toLowerCase();
    if (v.length() == 0) return "";
    if (v.contains("cash") || v.contains("cod")) return "Cash";
    if (v.contains("online") || v.contains("upi") || v.contains("card") || v.contains("wallet")
        || v.contains("prepaid") || v.contains("paid") || v.contains("razorpay")) {
      return "Paid online";
    }
    return "";
  }

  /**
   * Parcel fare banner, worded as the in-app sheet: paid online / collect at
   * pickup / collect at drop. Empty for other services, and when the payload
   * says nothing about payment — never guessed.
   */
  public static String fareCollectLabel(String orderType, String paymentMethod, String payAt) {
    if (!RIDER || !isParcel(orderType)) return "";
    String chip = paymentChip(paymentMethod);
    String at = safe(payAt).toLowerCase();
    if ("Paid online".equals(chip) && at.length() == 0) return "Payment paid";
    if ("drop".equals(at)) return "Fare collect at Drop";
    if ("pickup".equals(at) || "Cash".equals(chip)) return "Fare collect at Pickup";
    return "";
  }

  /** "" for a missing or placeholder customer name ("Customer"). */
  public static String customerLine(String name) {
    String v = safe(name);
    if (v.length() == 0 || "customer".equalsIgnoreCase(v) || "null".equalsIgnoreCase(v)) return "";
    return v;
  }

  /** {qty, name} rows for the merchant item list; variant folded into the name. */
  public static String[][] itemCells(String raw, int maxRows) {
    String v = safe(raw);
    if (v.length() == 0 || !v.startsWith("[")) {
      String[] lines = itemLines(raw, maxRows);
      String[][] out = new String[lines.length][];
      for (int i = 0; i < lines.length; i++) {
        Matcher m = Pattern.compile("^(\\d+)\\s*(?:x|X|×)\\s*(.+)$").matcher(lines[i]);
        out[i] = m.find() ? new String[] {m.group(1), safe(m.group(2))} : new String[] {"1", lines[i]};
      }
      return out;
    }
    String[] lines = itemLines(v, maxRows);
    String[][] out = new String[lines.length][];
    for (int i = 0; i < lines.length; i++) {
      String sep = " × ";
      int at = lines[i].indexOf(sep);
      out[i] = at > 0
          ? new String[] {lines[i].substring(0, at), lines[i].substring(at + sep.length())}
          : new String[] {"1", lines[i]};
    }
    return out;
  }

  /** Number of item rows the payload carried (variants count once). */
  public static int itemRowCount(String raw) {
    String v = safe(raw);
    if (v.length() == 0) return 0;
    if (v.startsWith("[")) {
      int n = 0;
      for (int i = 0; i < v.length(); i++) if (v.charAt(i) == '{') n++;
      return n;
    }
    return v.split("\\|").length;
  }

  /** "+3 more items" when the list was cut, else "". */
  public static String moreItemsLabel(int totalRows, int shownRows) {
    int more = totalRows - shownRows;
    if (more <= 0) return "";
    return "+" + more + (more == 1 ? " more item" : " more items");
  }

  /**
   * Fraction of the acceptance window still left (0..1) for the shrinking
   * timer bar. A missing or implausible start falls back to a 60 s window;
   * -1 means "no deadline", so the caller hides the bar.
   */
  public static float remainingFraction(long startedAtMs, long expiresAtMs, long nowMs) {
    if (expiresAtMs <= 0L) return -1f;
    long left = expiresAtMs - nowMs;
    if (left <= 0L) return 0f;
    long window = expiresAtMs - startedAtMs;
    if (startedAtMs <= 0L || window <= 0L || window > 15L * 60L * 1000L || left > window) {
      window = Math.max(left, 60_000L);
    }
    float f = (float) left / (float) window;
    return f < 0f ? 0f : (f > 1f ? 1f : f);
  }

  /** Last ten seconds: the timer turns red. */
  public static boolean isUrgent(long expiresAtMs, long nowMs) {
    return expiresAtMs > 0L && expiresAtMs - nowMs <= 10_000L;
  }

  /** Mixed-case CTA for the card button (the shade action keeps the caps form). */
  public static String openButtonLabel() {
    return "Open to accept  →";
  }

  /** Heads-up title: "Bike Ride · You earn ₹75" / "New order · ₹420". */
  public static String headsUpTitle(String orderType, String amountRaw) {
    String type = displayOrderType(orderType);
    String head = type.length() > 0 ? type : (RIDER ? "New order received" : "New order");
    String money = amountLabel(amountRaw);
    return money.length() > 0 ? head + " · " + money : head;
  }

  /**
   * Change detector for the floating card. Equal signatures mean the card on
   * screen already shows this data; anything else is rebuilt in place, which is
   * how a card first drawn from a detail-less start fills in when the rich push
   * lands a moment later.
   */
  public static String signature(String[] parts) {
    StringBuilder sb = new StringBuilder();
    if (parts != null) {
      for (String p : parts) {
        sb.append(p == null ? "" : p.trim()).append('\u001F');
      }
    }
    return sb.toString();
  }
}
