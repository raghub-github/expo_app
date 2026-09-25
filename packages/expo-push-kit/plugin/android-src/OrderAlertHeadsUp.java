package {{PACKAGE}};

import android.app.KeyguardManager;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.media.AudioAttributes;
import android.net.Uri;
import android.os.Build;
import androidx.core.app.NotificationCompat;
import androidx.core.content.FileProvider;
import java.io.File;
import org.json.JSONObject;

/**
 * Lock-screen / shade notification with Accept and Reject.
 * Sound is the partner-selected file when Android can read it; otherwise the
 * foreground service MediaPlayer remains the buzzer.
 */
public final class OrderAlertHeadsUp {
  static final String CHANNEL_ID = "order_alert_heads_up_v3";
  static final int NOTIFICATION_ID = 94002;
  static final String ACTION_ACCEPT = "{{PACKAGE}}.ORDER_ALERT_ACCEPT";
  static final String ACTION_REJECT = "{{PACKAGE}}.ORDER_ALERT_REJECT";

  private OrderAlertHeadsUp() {}

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
    String amount = row.optString("amount", "");
    String title = "NEW ORDER";
    StringBuilder body = new StringBuilder();
    if (display.length() > 0) body.append(display);
    String amountLabel = amount.length() > 0 && !"0".equals(amount) ? ("₹" + amount.replace("₹", "")) : "";
    if (amountLabel.length() > 0) {
      if (body.length() > 0) body.append(" · ");
      body.append(amountLabel);
    }
    if (body.length() == 0) {
      String fallback = row.optString("body", "");
      body.append(fallback.length() > 0 ? fallback : "Open GatiMitra Partner to respond");
    }

    int flags = PendingIntent.FLAG_UPDATE_CURRENT;
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) flags |= PendingIntent.FLAG_IMMUTABLE;

    Intent accept = new Intent(context, OrderAlertActionReceiver.class);
    accept.setAction(ACTION_ACCEPT);
    accept.putExtra(OrderAlertController.EXTRA_SESSION_ID, sid);
    Intent reject = new Intent(context, OrderAlertActionReceiver.class);
    reject.setAction(ACTION_REJECT);
    reject.putExtra(OrderAlertController.EXTRA_SESSION_ID, sid);

    Intent launch = context.getPackageManager().getLaunchIntentForPackage(context.getPackageName());
    if (launch == null) launch = new Intent();
    launch.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP);
    launch.putExtra("alertSessionId", sid);
    launch.putExtra("gmOverlayAction", "open");

    PendingIntent content = PendingIntent.getActivity(context, NOTIFICATION_ID, launch, flags);
    PendingIntent acceptPi = PendingIntent.getBroadcast(context, NOTIFICATION_ID + 2, accept, flags);
    PendingIntent rejectPi = PendingIntent.getBroadcast(context, NOTIFICATION_ID + 3, reject, flags);

    NotificationCompat.Builder b = new NotificationCompat.Builder(context, CHANNEL_ID)
        .setSmallIcon(smallIcon(context))
        .setContentTitle(title)
        .setContentText(body.toString())
        .setStyle(new NotificationCompat.BigTextStyle().bigText(body.toString()))
        .setCategory(NotificationCompat.CATEGORY_CALL)
        .setPriority(NotificationCompat.PRIORITY_MAX)
        .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
        .setOngoing(true)
        .setAutoCancel(false)
        .setContentIntent(content)
        .addAction(0, "REJECT", rejectPi)
        .addAction(0, "ACCEPT", acceptPi);

    if (isLocked(context)) {
      Intent lock = new Intent(context, OrderAlertLockActivity.class);
      lock.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_NO_USER_ACTION);
      lock.putExtra(OrderAlertController.EXTRA_SESSION_ID, sid);
      PendingIntent full = PendingIntent.getActivity(context, NOTIFICATION_ID + 4, lock, flags);
      b.setFullScreenIntent(full, true);
    }

    try {
      nm.notify(NOTIFICATION_ID, b.build());
      AlertEngineLog.log(context, "HEADS_UP_POSTED", sid, display, "locked=" + isLocked(context));
    } catch (Throwable t) {
      AlertEngineLog.log(context, "HEADS_UP_FAILED", sid, display, t.getMessage());
    }
  }

  static void cancel(Context context) {
    if (context == null) return;
    try {
      NotificationManager nm = (NotificationManager) context.getSystemService(Context.NOTIFICATION_SERVICE);
      if (nm != null) nm.cancel(NOTIFICATION_ID);
    } catch (Throwable ignored) {
    }
  }

  private static void ensureChannel(Context context) {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return;
    NotificationManager nm = (NotificationManager) context.getSystemService(Context.NOTIFICATION_SERVICE);
    if (nm == null) return;
    File selected = OrderAlertSoundStore.selectedFile(context);
    String channelId = CHANNEL_ID;
    Uri sound = soundUri(context, selected);
    NotificationChannel existing = nm.getNotificationChannel(channelId);
    if (existing != null) return;
    NotificationChannel channel = new NotificationChannel(
        channelId,
        "Incoming order",
        NotificationManager.IMPORTANCE_HIGH
    );
    channel.setLockscreenVisibility(Notification.VISIBILITY_PUBLIC);
    channel.enableVibration(true);
    channel.setBypassDnd(false);
    if (sound != null) {
      AudioAttributes attrs = new AudioAttributes.Builder()
          .setUsage(AudioAttributes.USAGE_NOTIFICATION_RINGTONE)
          .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
          .build();
      channel.setSound(sound, attrs);
    }
    nm.createNotificationChannel(channel);
  }

  private static Uri soundUri(Context context, File file) {
    if (file == null || !file.isFile()) return null;
    try {
      return FileProvider.getUriForFile(context, context.getPackageName() + ".orderalert.fileprovider", file);
    } catch (Throwable t) {
      return null;
    }
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
