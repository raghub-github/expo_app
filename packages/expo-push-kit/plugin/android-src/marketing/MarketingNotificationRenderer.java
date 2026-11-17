package {{PACKAGE}};

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.net.Uri;
import android.os.Build;
import android.os.Handler;
import android.os.Looper;
import android.os.SystemClock;
import android.util.Log;
import android.widget.RemoteViews;
import androidx.core.app.NotificationCompat;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import org.json.JSONArray;
import org.json.JSONObject;

/**
 * Builds Android tray notifications with custom RemoteViews for
 * banner_image / category_row / countdown marketing campaigns.
 */
public final class MarketingNotificationRenderer {
  private static final String TAG = "GmMarketingNotif";
  public static final String CHANNEL_ID = "customer_marketing";
  private static final ExecutorService IO = Executors.newSingleThreadExecutor();

  private MarketingNotificationRenderer() {}

  public static boolean shouldHandle(Map<String, String> data) {
    if (data == null || data.isEmpty()) return false;
    if ("1".equals(first(data, "gm_marketing_layout"))) return true;
    String style = first(data, "layout_style", "layoutStyle");
    if (style != null) {
      style = style.trim().toLowerCase();
      if ("banner_image".equals(style)
          || "category_row".equals(style)
          || "countdown".equals(style)) {
        return true;
      }
    }
    // Countdown without explicit layout_style still gets a live Chronometer tray.
    String cd = first(data, "countdown_enabled", "countdownEnabled");
    if ("true".equalsIgnoreCase(cd) || "1".equals(cd) || "on".equalsIgnoreCase(cd)) {
      return true;
    }
    return first(data, "remaining_ms") != null && first(data, "ends_at", "endsAt") != null;
  }

  public static boolean handleRemoteMessage(Context context, Map<String, String> data) {
    if (context == null || !shouldHandle(data)) return false;
    final Context app = context.getApplicationContext();
    final Map<String, String> payload = data;
    IO.execute(
        () -> {
          try {
            postNotification(app, payload);
          } catch (Throwable t) {
            Log.w(TAG, "post failed: " + t.getMessage(), t);
          }
        });
    return true;
  }

  private static void postNotification(Context context, Map<String, String> data) {
    ensureChannel(context);
    String style = str(first(data, "layout_style", "layoutStyle")).toLowerCase();
    if (style.isEmpty()) {
      String cd = first(data, "countdown_enabled", "countdownEnabled");
      if ("true".equalsIgnoreCase(cd)
          || "1".equals(cd)
          || "on".equalsIgnoreCase(cd)
          || first(data, "remaining_ms") != null
          || first(data, "ends_at", "endsAt") != null) {
        style = "countdown";
      } else if (first(data, "category_chips", "categoryChips") != null) {
        style = "category_row";
      } else if (first(data, "imageUrl", "image_url") != null) {
        style = "banner_image";
      } else {
        style = "countdown";
      }
    }
    String title = firstNonEmpty(first(data, "title", "gmTitle"), "GatiMitra");
    String body = firstNonEmpty(first(data, "body", "message", "gmMessage"), "");
    String imageUrl = first(data, "imageUrl", "image_url");
    String deepLink = first(data, "deepLink", "deep_link", "screen");
    String nid = first(data, "notification_id", "message_id");
    int notifId = notificationId(nid);

    Bitmap hero = downloadBitmap(imageUrl, 1200, 800);
    List<Chip> chips = parseChips(first(data, "category_chips", "categoryChips"));
    for (Chip chip : chips) {
      chip.bitmap = downloadBitmap(chip.imageUrl, 400, 300);
    }

    long endsAtMs = parseEndsAtMs(data);
    String cta = first(data, "cta_label", "ctaLabel");

    RemoteViews collapsed =
        buildCollapsed(context, style, title, body, hero, chips, endsAtMs, cta);
    RemoteViews expanded =
        buildExpanded(context, style, title, body, hero, chips, endsAtMs, cta);

    wireChipClicks(context, collapsed, chips, notifId);
    wireChipClicks(context, expanded, chips, notifId);

    PendingIntent contentPi = deepLinkPendingIntent(context, deepLink, data, notifId);

    NotificationCompat.Builder builder =
        new NotificationCompat.Builder(context, CHANNEL_ID)
            .setSmallIcon(android.R.drawable.ic_dialog_info)
            .setContentTitle(title)
            .setContentText(body)
            .setAutoCancel(true)
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .setCategory(NotificationCompat.CATEGORY_PROMO)
            .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
            .setContentIntent(contentPi)
            .setStyle(new NotificationCompat.DecoratedCustomViewStyle())
            .setCustomContentView(collapsed)
            .setCustomBigContentView(expanded)
            .setOnlyAlertOnce(true);

    // Header chronometer as OEM fallback when custom RemoteViews chronometer is stripped.
    if ("countdown".equals(style) && endsAtMs > System.currentTimeMillis()) {
      builder.setWhen(endsAtMs).setUsesChronometer(true).setChronometerCountDown(true).setShowWhen(true);
    }

    if (hero != null && "banner_image".equals(style)) {
      builder.setLargeIcon(hero);
    }

    // Prefer branded notification icon when packaged by expo-notifications.
    int brandIcon =
        context
            .getResources()
            .getIdentifier("notification_icon", "drawable", context.getPackageName());
    if (brandIcon != 0) {
      builder.setSmallIcon(brandIcon);
      builder.setColor(0xFF14B8A6);
    }

    NotificationManager nm =
        (NotificationManager) context.getSystemService(Context.NOTIFICATION_SERVICE);
    if (nm == null) return;
    Notification notification = builder.build();
    String tag = nid != null && nid.length() > 0 ? ("gm_mkt_" + nid.replace("-", "").substring(0, Math.min(16, nid.replace("-", "").length()))) : "gm_mkt";
    new Handler(Looper.getMainLooper())
        .post(() -> nm.notify(tag, notifId, notification));
  }

  private static RemoteViews buildCollapsed(
      Context context,
      String style,
      String title,
      String body,
      Bitmap hero,
      List<Chip> chips,
      long endsAtMs,
      String cta) {
    if ("category_row".equals(style) && chips.size() >= 2) {
      int layout =
          resId(context, "layout", "gm_marketing_category_collapsed");
      RemoteViews rv = new RemoteViews(context.getPackageName(), layout);
      setText(rv, context, "gm_mkt_title", title);
      setText(rv, context, "gm_mkt_body", body);
      bindChips(rv, context, chips, false);
      return rv;
    }
    if ("countdown".equals(style)) {
      int layout = resId(context, "layout", "gm_marketing_countdown_collapsed");
      RemoteViews rv = new RemoteViews(context.getPackageName(), layout);
      setText(rv, context, "gm_mkt_title", title);
      setText(rv, context, "gm_mkt_body", body);
      bindChronometer(rv, context, endsAtMs);
      return rv;
    }
    int layout = resId(context, "layout", "gm_marketing_banner_collapsed");
    RemoteViews rv = new RemoteViews(context.getPackageName(), layout);
    setText(rv, context, "gm_mkt_title", title);
    setText(rv, context, "gm_mkt_body", body);
    if (hero != null) {
      int imgId = resId(context, "id", "gm_mkt_image");
      if (imgId != 0) rv.setImageViewBitmap(imgId, hero);
    }
    return rv;
  }

  private static RemoteViews buildExpanded(
      Context context,
      String style,
      String title,
      String body,
      Bitmap hero,
      List<Chip> chips,
      long endsAtMs,
      String cta) {
    if ("category_row".equals(style) && chips.size() >= 2) {
      int layout = resId(context, "layout", "gm_marketing_category_expanded");
      RemoteViews rv = new RemoteViews(context.getPackageName(), layout);
      setText(rv, context, "gm_mkt_title", title);
      setText(rv, context, "gm_mkt_body", body);
      bindChips(rv, context, chips, true);
      return rv;
    }
    if ("countdown".equals(style)) {
      int layout = resId(context, "layout", "gm_marketing_countdown_expanded");
      RemoteViews rv = new RemoteViews(context.getPackageName(), layout);
      setText(rv, context, "gm_mkt_title", title);
      setText(rv, context, "gm_mkt_body", body);
      if (cta != null && cta.trim().length() > 0) {
        setText(rv, context, "gm_mkt_cta", cta.trim());
        int ctaId = resId(context, "id", "gm_mkt_cta");
        if (ctaId != 0) rv.setViewVisibility(ctaId, android.view.View.VISIBLE);
      }
      if (hero != null) {
        int imgId = resId(context, "id", "gm_mkt_image");
        if (imgId != 0) rv.setImageViewBitmap(imgId, hero);
      }
      bindChronometer(rv, context, endsAtMs);
      return rv;
    }
    int layout = resId(context, "layout", "gm_marketing_banner_expanded");
    RemoteViews rv = new RemoteViews(context.getPackageName(), layout);
    setText(rv, context, "gm_mkt_title", title);
    setText(rv, context, "gm_mkt_body", body);
    if (hero != null) {
      int imgId = resId(context, "id", "gm_mkt_image");
      if (imgId != 0) rv.setImageViewBitmap(imgId, hero);
    }
    return rv;
  }

  private static void bindChips(
      RemoteViews rv, Context context, List<Chip> chips, boolean expanded) {
    String[] imgIds = {"gm_mkt_chip1_img", "gm_mkt_chip2_img", "gm_mkt_chip3_img"};
    String[] labelIds = {"gm_mkt_chip1_label", "gm_mkt_chip2_label", "gm_mkt_chip3_label"};
    String[] wrapIds = {"gm_mkt_chip1", "gm_mkt_chip2", "gm_mkt_chip3"};
    for (int i = 0; i < 3; i++) {
      int wrap = resId(context, "id", wrapIds[i]);
      if (i < chips.size()) {
        Chip chip = chips.get(i);
        if (wrap != 0) rv.setViewVisibility(wrap, android.view.View.VISIBLE);
        if (chip.bitmap != null) {
          int img = resId(context, "id", imgIds[i]);
          if (img != 0) rv.setImageViewBitmap(img, chip.bitmap);
        }
        setText(rv, context, labelIds[i], chip.label);
      } else if (wrap != 0) {
        rv.setViewVisibility(wrap, android.view.View.GONE);
      }
    }
  }

  private static void wireChipClicks(
      Context context, RemoteViews rv, List<Chip> chips, int notifId) {
    String[] wrapIds = {"gm_mkt_chip1", "gm_mkt_chip2", "gm_mkt_chip3"};
    for (int i = 0; i < chips.size() && i < 3; i++) {
      int wrap = resId(context, "id", wrapIds[i]);
      if (wrap == 0) continue;
      Chip chip = chips.get(i);
      PendingIntent pi =
          deepLinkPendingIntent(
              context,
              chip.deepLink,
              chipAsData(chip),
              notifId + 10 + i);
      rv.setOnClickPendingIntent(wrap, pi);
    }
  }

  private static Map<String, String> chipAsData(Chip chip) {
    java.util.HashMap<String, String> m = new java.util.HashMap<>();
    m.put("deepLink", chip.deepLink);
    m.put("deep_link", chip.deepLink);
    m.put("screen", chip.deepLink);
    m.put("target_type", "CATEGORY");
    m.put("target_category_id", chip.categoryId);
    m.put("target_id", chip.categoryId);
    if (chip.serviceId != null) m.put("target_service_id", chip.serviceId);
    return m;
  }

  private static void bindChronometer(RemoteViews rv, Context context, long endsAtMs) {
    int chronoId = resId(context, "id", "gm_mkt_chrono");
    if (chronoId == 0 || endsAtMs <= 0) return;
    long remaining = Math.max(0L, endsAtMs - System.currentTimeMillis());
    long base = SystemClock.elapsedRealtime() + remaining;
    // countDown MUST be set before setChronometer on many OEMs so the tray ticks live.
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) {
      rv.setChronometerCountDown(chronoId, true);
    }
    rv.setChronometer(chronoId, base, null, true);
  }

  private static PendingIntent deepLinkPendingIntent(
      Context context, String deepLink, Map<String, String> data, int requestCode) {
    String path = deepLink != null ? deepLink.trim() : "";
    if (path.length() == 0) path = "/home";
    if (!path.startsWith("/")) path = "/" + path;
    Uri uri = Uri.parse("gatimitra://" + path.replaceFirst("^/", ""));
    Intent intent = new Intent(Intent.ACTION_VIEW, uri);
    intent.setPackage(context.getPackageName());
    intent.addFlags(
        Intent.FLAG_ACTIVITY_NEW_TASK
            | Intent.FLAG_ACTIVITY_CLEAR_TOP
            | Intent.FLAG_ACTIVITY_SINGLE_TOP);
    if (data != null) {
      for (Map.Entry<String, String> e : data.entrySet()) {
        if (e.getKey() != null && e.getValue() != null) {
          intent.putExtra(e.getKey(), e.getValue());
        }
      }
    }
    intent.putExtra("deepLink", path);
    intent.putExtra("deep_link", path);
    intent.putExtra("screen", path);
    int flags = PendingIntent.FLAG_UPDATE_CURRENT;
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
      flags |= PendingIntent.FLAG_IMMUTABLE;
    }
    return PendingIntent.getActivity(context, requestCode, intent, flags);
  }

  private static void ensureChannel(Context context) {
    if (Build.VERSION.SDK_INT < 26) return;
    NotificationManager nm =
        (NotificationManager) context.getSystemService(Context.NOTIFICATION_SERVICE);
    if (nm == null || nm.getNotificationChannel(CHANNEL_ID) != null) return;
    NotificationChannel channel =
        new NotificationChannel(CHANNEL_ID, "Offers & campaigns", NotificationManager.IMPORTANCE_HIGH);
    channel.enableVibration(true);
    channel.setShowBadge(true);
    channel.setLockscreenVisibility(Notification.VISIBILITY_PUBLIC);
    nm.createNotificationChannel(channel);
  }

  private static List<Chip> parseChips(String raw) {
    List<Chip> out = new ArrayList<>();
    if (raw == null || raw.trim().isEmpty()) return out;
    try {
      JSONArray arr = new JSONArray(raw);
      for (int i = 0; i < arr.length() && out.size() < 3; i++) {
        JSONObject o = arr.optJSONObject(i);
        if (o == null) continue;
        Chip c = new Chip();
        c.categoryId =
            firstNonEmpty(o.optString("categoryId"), o.optString("category_id"), o.optString("id"));
        c.label = firstNonEmpty(o.optString("label"), o.optString("name"));
        c.imageUrl =
            firstNonEmpty(o.optString("imageUrl"), o.optString("image_url"), o.optString("cover"));
        c.deepLink = firstNonEmpty(o.optString("deepLink"), o.optString("deep_link"));
        c.serviceId = firstNonEmpty(o.optString("serviceId"), o.optString("service_id"));
        if (c.categoryId.isEmpty() || c.label.isEmpty() || c.deepLink.isEmpty()) continue;
        if (c.imageUrl.isEmpty() || !c.imageUrl.startsWith("https://")) continue;
        out.add(c);
      }
    } catch (Throwable t) {
      Log.w(TAG, "chips parse: " + t.getMessage());
    }
    return out;
  }

  private static long parseEndsAtMs(Map<String, String> data) {
    String remaining = first(data, "remaining_ms");
    if (remaining != null) {
      try {
        long ms = Long.parseLong(remaining.trim());
        if (ms > 0) return System.currentTimeMillis() + ms;
      } catch (NumberFormatException ignored) {
      }
    }
    String ends = first(data, "ends_at", "endsAt");
    if (ends == null) return 0L;
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      try {
        return java.time.Instant.parse(ends).toEpochMilli();
      } catch (Throwable ignored) {
      }
    }
    try {
      // 2026-11-17T10:00:00.000Z / without millis
      java.text.SimpleDateFormat sdf =
          new java.text.SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'", java.util.Locale.US);
      sdf.setTimeZone(java.util.TimeZone.getTimeZone("UTC"));
      java.util.Date d = sdf.parse(ends);
      if (d != null) return d.getTime();
    } catch (Throwable ignored) {
    }
    try {
      java.text.SimpleDateFormat sdf2 =
          new java.text.SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss'Z'", java.util.Locale.US);
      sdf2.setTimeZone(java.util.TimeZone.getTimeZone("UTC"));
      java.util.Date d2 = sdf2.parse(ends);
      if (d2 != null) return d2.getTime();
    } catch (Throwable ignored) {
    }
    return 0L;
  }

  private static Bitmap downloadBitmap(String urlStr, int maxW, int maxH) {
    if (urlStr == null || !urlStr.startsWith("https://")) return null;
    HttpURLConnection conn = null;
    try {
      URL url = new URL(urlStr);
      conn = (HttpURLConnection) url.openConnection();
      conn.setConnectTimeout(8000);
      conn.setReadTimeout(10000);
      conn.setInstanceFollowRedirects(true);
      conn.connect();
      if (conn.getResponseCode() != 200) return null;
      InputStream in = conn.getInputStream();
      Bitmap raw = BitmapFactory.decodeStream(in);
      in.close();
      if (raw == null) return null;
      int w = raw.getWidth();
      int h = raw.getHeight();
      if (w <= maxW && h <= maxH) return raw;
      float scale = Math.min((float) maxW / w, (float) maxH / h);
      int nw = Math.max(1, Math.round(w * scale));
      int nh = Math.max(1, Math.round(h * scale));
      Bitmap scaled = Bitmap.createScaledBitmap(raw, nw, nh, true);
      if (scaled != raw) raw.recycle();
      return scaled;
    } catch (Throwable t) {
      Log.w(TAG, "image download failed: " + t.getMessage());
      return null;
    } finally {
      if (conn != null) conn.disconnect();
    }
  }

  private static void setText(RemoteViews rv, Context context, String idName, String text) {
    int id = resId(context, "id", idName);
    if (id != 0) rv.setTextViewText(id, text != null ? text : "");
  }

  private static int resId(Context context, String type, String name) {
    return context.getResources().getIdentifier(name, type, context.getPackageName());
  }

  private static int notificationId(String nid) {
    if (nid == null || nid.isEmpty()) return 71001;
    return 71000 + Math.abs(nid.hashCode() % 100000);
  }

  private static String first(Map<String, String> data, String... keys) {
    if (data == null) return null;
    for (String k : keys) {
      String v = data.get(k);
      if (v != null && v.trim().length() > 0) return v.trim();
    }
    return null;
  }

  private static String firstNonEmpty(String... vals) {
    if (vals == null) return "";
    for (String v : vals) {
      if (v != null && v.trim().length() > 0) return v.trim();
    }
    return "";
  }

  private static String str(String v) {
    return v == null ? "" : v;
  }

  private static final class Chip {
    String categoryId = "";
    String label = "";
    String imageUrl = "";
    String deepLink = "";
    String serviceId = "";
    Bitmap bitmap;
  }
}
