package {{PACKAGE}};

import android.app.KeyguardManager;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.os.Build;
import androidx.core.app.NotificationCompat;
import org.json.JSONObject;

/**
 * Lock-screen / shade notification for an incoming order.
 * MediaPlayer in the FGS owns the looping buzzer — this channel is silent.
 * Primary action is OPEN TO ACCEPT (secure accept lives inside the app).
 */
public final class OrderAlertHeadsUp {
  static final String CHANNEL_ID = "order_alert_heads_up_v4";
  static final int NOTIFICATION_ID = 94002;
  static final String ACTION_ACCEPT = "{{PACKAGE}}.ORDER_ALERT_ACCEPT";
  static final String ACTION_REJECT = "{{PACKAGE}}.ORDER_ALERT_REJECT";
  static final String ACTION_OPEN = "{{PACKAGE}}.ORDER_ALERT_OPEN";

  private OrderAlertHeadsUp() {}

  /** Must match backend `gm_rider_order_{orderId}` FCM Android tag so we REPLACE the FCM card. */
  static String trayTagForOrder(String orderId) {
    String id = orderId == null ? "" : orderId.trim().replaceAll("[^a-zA-Z0-9_-]", "");
    if (id.length() == 0) return "gm_rider_order_active";
    if (id.length() > 48) id = id.substring(0, 48);
    return "gm_rider_order_" + id;
  }

  static void show(Context context, String sessionId) {
    if (context == null) return;
    JSONObject row = OrderAlertController.getActive(context);
    if (row == null) return;
    String sid = sessionId == null || sessionId.length() == 0
        ? row.optString("sessionId", "")
        : sessionId;
    ensureChannel(context);
    NotificationManager nm = (NotificationManager) context.getSystemService(Context.NOTIFICATION_SERVICE);
    if (nm == null) return;

    String display = row.optString("displayOrderId", "");
    if (display.matches("^\\d+$")) display = "";
    String orderId = row.optString("orderId", "");
    if (orderId.length() == 0) orderId = display;
    String trayTag = trayTagForOrder(orderId);
    String orderType = row.optString("orderType", "");
    String typeLabel = OrderAlertCardText.displayOrderType(orderType);
    String title = typeLabel.length() > 0
        ? OrderAlertCardText.brandLine() + " · " + typeLabel
        : OrderAlertCardText.headingFor(orderType);
    String body = OrderAlertCardText.shadeBodyRich(
        display,
        orderType,
        row.optString("amount", ""),
        row.optString("storeName", ""),
        row.optString("pickup", ""),
        row.optString("drop", ""),
        row.optString("toPickupKm", ""),
        row.optString("tripDistanceKm", ""),
        row.optString("customerName", ""),
        row.optString("itemsJson", ""),
        row.optString("body", "Open to accept")
    );

    int flags = PendingIntent.FLAG_UPDATE_CURRENT;
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) flags |= PendingIntent.FLAG_IMMUTABLE;

    Intent open = new Intent(context, OrderAlertActionReceiver.class);
    open.setAction(ACTION_OPEN);
    open.putExtra(OrderAlertController.EXTRA_SESSION_ID, sid);
    PendingIntent openPi = PendingIntent.getBroadcast(context, NOTIFICATION_ID + 2, open, flags);

    Intent launch = context.getPackageManager().getLaunchIntentForPackage(context.getPackageName());
    if (launch == null) launch = new Intent();
    launch.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP);
    launch.putExtra("alertSessionId", sid);
    launch.putExtra("gmOverlayAction", "open");

    PendingIntent content = PendingIntent.getActivity(context, NOTIFICATION_ID, launch, flags);

    NotificationCompat.Builder b = new NotificationCompat.Builder(context, CHANNEL_ID)
        .setSmallIcon(smallIcon(context))
        .setContentTitle(title)
        .setContentText(body)
        .setStyle(new NotificationCompat.BigTextStyle().bigText(body))
        .setCategory(NotificationCompat.CATEGORY_CALL)
        .setPriority(NotificationCompat.PRIORITY_MAX)
        .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
        .setOngoing(true)
        .setAutoCancel(false)
        .setOnlyAlertOnce(true)
        .setContentIntent(content)
        .addAction(0, OrderAlertCardText.openToAcceptLabel(), openPi);

    if (isLocked(context)) {
      Intent lock = new Intent(context, OrderAlertLockActivity.class);
      lock.addFlags(
          Intent.FLAG_ACTIVITY_NEW_TASK
              | Intent.FLAG_ACTIVITY_NO_USER_ACTION
              | Intent.FLAG_ACTIVITY_EXCLUDE_FROM_RECENTS
              | Intent.FLAG_ACTIVITY_CLEAR_TOP
              | Intent.FLAG_ACTIVITY_SINGLE_TOP
      );
      lock.putExtra(OrderAlertController.EXTRA_SESSION_ID, sid);
      PendingIntent full = PendingIntent.getActivity(context, NOTIFICATION_ID + 4, lock, flags);
      b.setFullScreenIntent(full, true);
    }

    try {
      // Tagged notify replaces the FCM tray card that used the same Android tag.
      nm.notify(trayTag, NOTIFICATION_ID, b.build());
      AlertEngineLog.log(context, "HEADS_UP_POSTED", sid, display, "tag=" + trayTag);
    } catch (Throwable t) {
      AlertEngineLog.log(context, "HEADS_UP_FAILED", sid, display, t.getMessage());
    }
  }

  static void cancel(Context context) {
    if (context == null) return;
    try {
      NotificationManager nm = (NotificationManager) context.getSystemService(Context.NOTIFICATION_SERVICE);
      if (nm == null) return;
      nm.cancel(NOTIFICATION_ID);
      JSONObject row = OrderAlertController.getActive(context);
      if (row != null) {
        String orderId = row.optString("orderId", "");
        if (orderId.length() == 0) orderId = row.optString("displayOrderId", "");
        nm.cancel(trayTagForOrder(orderId), NOTIFICATION_ID);
      }
    } catch (Throwable ignored) {
    }
  }

  private static void ensureChannel(Context context) {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return;
    NotificationManager nm = (NotificationManager) context.getSystemService(Context.NOTIFICATION_SERVICE);
    if (nm == null) return;
    // Delete legacy channels that still had a notification sound (dual audio with FGS).
    try {
      nm.deleteNotificationChannel("order_alert_heads_up_v3");
    } catch (Throwable ignored) {
    }
    if (nm.getNotificationChannel(CHANNEL_ID) != null) return;
    NotificationChannel channel = new NotificationChannel(
        CHANNEL_ID,
        "Incoming order",
        NotificationManager.IMPORTANCE_HIGH
    );
    channel.setLockscreenVisibility(Notification.VISIBILITY_PUBLIC);
    channel.enableVibration(true);
    channel.setBypassDnd(false);
    channel.setSound(null, null);
    nm.createNotificationChannel(channel);
  }

  private static boolean isLocked(Context context) {
    try {
      KeyguardManager km = (KeyguardManager) context.getSystemService(Context.KEYGUARD_SERVICE);
      return km != null && km.isKeyguardLocked();
    } catch (Throwable t) {
      return false;
    }
  }

  private static int smallIcon(Context context) {
    int res = context.getResources().getIdentifier("notification_icon", "drawable", context.getPackageName());
    if (res != 0) return res;
    return android.R.drawable.ic_dialog_info;
  }
}
