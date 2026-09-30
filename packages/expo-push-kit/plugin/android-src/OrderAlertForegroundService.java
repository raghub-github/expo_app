package {{PACKAGE}};

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.content.pm.ServiceInfo;
import android.os.Build;
import android.os.Handler;
import android.os.IBinder;
import android.os.Looper;
import android.os.PowerManager;
import android.util.Log;
import androidx.core.app.NotificationCompat;
import org.json.JSONObject;

/**
 * Owns the continuous order/dispatch buzzer AND the native TYPE_APPLICATION_OVERLAY
 * incoming-order card. Started from FCM (no JS required) or from the JS bridge.
 * stopWithTask=false so swipe-from-recents does not kill the siren while Android
 * still allows the process to live.
 */
public class OrderAlertForegroundService extends Service {
  public static final String ACTION_START = "{{PACKAGE}}.ORDER_ALERT_START";
  public static final String CHANNEL_ID = "order_alert_fgs_ongoing_v1";
  public static final int NOTIFICATION_ID = 94001;
  private static final String TAG = "GmOrderAlertFgs";
  private static final long MAX_ALERT_MS = 20L * 60L * 1000L;

  private final Handler handler = new Handler(Looper.getMainLooper());
  private PowerManager.WakeLock wakeLock;
  private final Runnable watchdog = () -> {
    Log.w(TAG, "watchdog stop after " + MAX_ALERT_MS + "ms");
    OrderAlertController.stopAll(this);
    stopSelf();
  };

  @Override
  public void onCreate() {
    super.onCreate();
    acquireWakeLock();
  }

  @Override
  public int onStartCommand(Intent intent, int flags, int startId) {
    OrderAlertVisibility.register(this);
    if (intent == null) {
      return holdPillOrStop();
    }
    if (OrderAlertPill.ACTION_PILL.equals(intent.getAction())) {
      if (OrderAlertVisibility.shouldHideBecausePartnerIsOpen(this)) {
        OrderAlertPill.setPartnerForeground(this, true);
      }
      OrderAlertPill.apply(this);
      if (OrderAlertController.getActive(this) != null) {
        return START_STICKY;
      }
      try {
        startAsForeground(buildPillNotification(OrderAlertPill.count(this)));
      } catch (Throwable ignored) {
      }
      return START_STICKY;
    }

    if (intent != null && OrderAlertController.ACTION_STOP.equals(intent.getAction())) {
      stopInternal();
      if (OrderAlertPill.isEnabled(this) && OrderAlertOverlay.canDraw(this)) return START_STICKY;
      return START_NOT_STICKY;
    }

    String sessionId = intent != null ? intent.getStringExtra(OrderAlertController.EXTRA_SESSION_ID) : null;
    String orderId = intent != null ? intent.getStringExtra(OrderAlertController.EXTRA_ORDER_ID) : "";
    String offerId = intent != null ? intent.getStringExtra(OrderAlertController.EXTRA_OFFER_ID) : "";
    String soundType = intent != null ? intent.getStringExtra(OrderAlertController.EXTRA_SOUND_TYPE) : "notification";
    String title = intent != null ? intent.getStringExtra(OrderAlertController.EXTRA_TITLE) : null;
    String body = intent != null ? intent.getStringExtra(OrderAlertController.EXTRA_BODY) : null;
    String pickup = intent != null ? intent.getStringExtra(OrderAlertController.EXTRA_PICKUP) : "";
    String drop = intent != null ? intent.getStringExtra(OrderAlertController.EXTRA_DROP) : "";
    String orderType = intent != null ? intent.getStringExtra(OrderAlertController.EXTRA_ORDER_TYPE) : "";

    JSONObject active = OrderAlertController.getActive(this);
    if ((sessionId == null || sessionId.trim().length() == 0) && active != null) {
      sessionId = active.optString("sessionId", "");
      if (orderId == null || orderId.length() == 0) orderId = active.optString("orderId", "");
      if (offerId == null || offerId.length() == 0) offerId = active.optString("offerId", "");
      if (soundType == null || soundType.length() == 0) soundType = active.optString("soundType", "notification");
      if (title == null || title.length() == 0) title = active.optString("title", "");
      if (body == null || body.length() == 0) body = active.optString("body", "");
      if (pickup == null || pickup.length() == 0) pickup = active.optString("pickup", "");
      if (drop == null || drop.length() == 0) drop = active.optString("drop", "");
      if (orderType == null || orderType.length() == 0) orderType = active.optString("orderType", "");
    }

    if (sessionId == null || sessionId.trim().length() == 0) {
      return holdPillOrStop();
    }

    Notification notification = buildNotification(sessionId, orderId, title, body);
    AlertEngineLog.log(this, "NOTIFICATION_POST_START", sessionId, orderId, "id=" + NOTIFICATION_ID);
    try {
      startAsForeground(notification);
      AlertEngineLog.log(this, "NOTIFICATION_POST_SUCCESS", sessionId, orderId, "id=" + NOTIFICATION_ID);
    } catch (Throwable t) {
      AlertEngineLog.log(this, "NOTIFICATION_POST_FAILED", sessionId, orderId, "err=" + t.getMessage());
    }
    OrderAlertOverlay.debug(this, "FGS_STARTED", sessionId, orderId, "sound=" + soundType);
    OrderAlertOverlay.debug(this, "NOTIFICATION_POSTED", sessionId, orderId, "id=" + NOTIFICATION_ID);
    AlertEngineLog.log(this, "FGS_START", sessionId, orderId, "started=1");
    OrderAlertController.onServiceStart(this, intent);
    AlertEngineLog.log(this, "OVERLAY_START", sessionId, orderId, null);
    // Overlay MUST use this Service as WindowManager host (not MainActivity).
    // Independent of JS / Manage Communication / selected-sound cache.
    // startForeground() already ran so Android allows the overlay window.
    OrderAlertOverlay.show(this, sessionId, orderId, offerId, title, body, pickup, drop, orderType);
    OrderAlertPill.apply(this);
    handler.removeCallbacks(watchdog);
    handler.postDelayed(watchdog, MAX_ALERT_MS);
    Log.i(TAG, "started sessionId=" + sessionId + " orderId=" + orderId);
    return START_STICKY;
  }

  @Override
  public void onDestroy() {
    handler.removeCallbacks(watchdog);
    OrderAlertOverlay.hideAll(this);
    OrderAlertPill.hide(this);
    OrderAlertController.onServiceDestroy();
    releaseWakeLock();
    try {
      stopForeground(true);
    } catch (Throwable ignored) {
    }
    super.onDestroy();
  }

  @Override
  public IBinder onBind(Intent intent) {
    return null;
  }

  private int holdPillOrStop() {
    if (OrderAlertPill.isEnabled(this) && OrderAlertOverlay.canDraw(this)) {
      if (OrderAlertVisibility.shouldHideBecausePartnerIsOpen(this)) {
        OrderAlertPill.setPartnerForeground(this, true);
      }
      OrderAlertPill.apply(this);
      try {
        startAsForeground(buildPillNotification(OrderAlertPill.count(this)));
      } catch (Throwable ignored) {
      }
      return START_STICKY;
    }
    stopInternal();
    return START_NOT_STICKY;
  }

  private void stopInternal() {
    handler.removeCallbacks(watchdog);
    OrderAlertOverlay.hideAll(this);
    OrderAlertController.onServiceDestroy();
    if (OrderAlertPill.isEnabled(this) && OrderAlertOverlay.canDraw(this)) {
      OrderAlertPill.apply(this);
      try {
        startAsForeground(buildPillNotification(OrderAlertPill.count(this)));
      } catch (Throwable ignored) {
      }
      return;
    }
    OrderAlertPill.hide(this);
    try {
      stopForeground(true);
    } catch (Throwable ignored) {
    }
    stopSelf();
  }

  private Notification buildPillNotification(int count) {
    ensurePillChannel();
    Intent launch = getPackageManager().getLaunchIntentForPackage(getPackageName());
    if (launch == null) launch = new Intent();
    launch.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP);
    launch.putExtra("gmPill", "orders");
    int flags = PendingIntent.FLAG_UPDATE_CURRENT;
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) flags |= PendingIntent.FLAG_IMMUTABLE;
    PendingIntent content = PendingIntent.getActivity(this, 94011, launch, flags);
    return new NotificationCompat.Builder(this, "order_pill_v1")
        .setSmallIcon(smallIcon())
        .setContentTitle("Orders " + Math.max(0, count))
        .setContentText("Tap to open GatiMitra Partner")
        .setOngoing(true)
        .setOnlyAlertOnce(true)
        .setSilent(true)
        .setPriority(NotificationCompat.PRIORITY_MIN)
        .setContentIntent(content)
        .setForegroundServiceBehavior(NotificationCompat.FOREGROUND_SERVICE_IMMEDIATE)
        .build();
  }

  private void ensurePillChannel() {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return;
    NotificationManager nm = getSystemService(NotificationManager.class);
    if (nm == null || nm.getNotificationChannel("order_pill_v1") != null) return;
    NotificationChannel channel = new NotificationChannel(
        "order_pill_v1",
        "Order count",
        NotificationManager.IMPORTANCE_MIN
    );
    channel.setSound(null, null);
    channel.enableVibration(false);
    channel.setShowBadge(false);
    nm.createNotificationChannel(channel);
  }

  private void startAsForeground(Notification notification) {
    try {
      if (Build.VERSION.SDK_INT >= 34) {
        startForeground(
            NOTIFICATION_ID,
            notification,
            ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PLAYBACK
        );
      } else if (Build.VERSION.SDK_INT >= 29) {
        startForeground(
            NOTIFICATION_ID,
            notification,
            ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PLAYBACK
        );
      } else {
        startForeground(NOTIFICATION_ID, notification);
      }
    } catch (Throwable t) {
      Log.w(TAG, "startForeground failed: " + t.getMessage());
      try {
        startForeground(NOTIFICATION_ID, notification);
      } catch (Throwable ignored) {
      }
    }
  }

  private Notification buildNotification(String sessionId, String orderId, String title, String body) {
    ensureChannel();
    String safeTitle = "NEW ORDER";
    JSONObject active = OrderAlertController.getActive(this);
    String display = active != null ? active.optString("displayOrderId", "") : "";
    if (display.matches("^\\d+$")) display = "";
    String amount = active != null ? active.optString("amount", "") : "";
    String safeBody;
    if (display.length() > 0) {
      safeBody = amount.length() > 0 && !"0".equals(amount) ? (display + " · ₹" + amount.replace("₹", "")) : display;
    } else if (body != null && body.trim().length() > 0) {
      safeBody = body.trim();
    } else {
      safeBody = "Open the app to respond";
    }

    Intent launch = getPackageManager().getLaunchIntentForPackage(getPackageName());
    if (launch == null) {
      try {
        launch = new Intent(this, Class.forName("{{PACKAGE}}.MainActivity"));
      } catch (Exception ignored) {
        launch = new Intent();
      }
    }
    launch.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_CLEAR_TOP);
    if (sessionId != null) launch.putExtra("alertSessionId", sessionId);
    if (orderId != null) launch.putExtra("orderId", orderId);

    int flags = PendingIntent.FLAG_UPDATE_CURRENT;
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
      flags |= PendingIntent.FLAG_IMMUTABLE;
    }
    PendingIntent content = PendingIntent.getActivity(this, NOTIFICATION_ID, launch, flags);

    Intent acceptIntent = new Intent(this, OrderAlertActionReceiver.class);
    acceptIntent.setAction(OrderAlertHeadsUp.ACTION_ACCEPT);
    acceptIntent.putExtra(OrderAlertController.EXTRA_SESSION_ID, sessionId);
    Intent rejectIntent = new Intent(this, OrderAlertActionReceiver.class);
    rejectIntent.setAction(OrderAlertHeadsUp.ACTION_REJECT);
    rejectIntent.putExtra(OrderAlertController.EXTRA_SESSION_ID, sessionId);
    PendingIntent acceptPi = PendingIntent.getBroadcast(this, NOTIFICATION_ID + 2, acceptIntent, flags);
    PendingIntent rejectPi = PendingIntent.getBroadcast(this, NOTIFICATION_ID + 3, rejectIntent, flags);

    NotificationCompat.Builder builder = new NotificationCompat.Builder(this, CHANNEL_ID)
        .setSmallIcon(smallIcon())
        .setContentTitle(safeTitle)
        .setContentText(safeBody)
        .setStyle(new NotificationCompat.BigTextStyle().bigText(safeBody))
        .setOngoing(true)
        .setAutoCancel(false)
        // Channel itself is silent so MediaPlayer owns the selected looping sound.
        // Do not setSilent(true) — OEM trays often hide fully-silent FGS notices.
        .setOnlyAlertOnce(true)
        .setCategory(NotificationCompat.CATEGORY_CALL)
        .setPriority(NotificationCompat.PRIORITY_MAX)
        .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
        .setContentIntent(content)
        .addAction(0, "REJECT", rejectPi)
        .addAction(0, "ACCEPT", acceptPi)
        .setForegroundServiceBehavior(NotificationCompat.FOREGROUND_SERVICE_IMMEDIATE);

    if (isLocked()) {
      Intent lock = new Intent(this, OrderAlertLockActivity.class);
      lock.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_NO_USER_ACTION);
      lock.putExtra(OrderAlertController.EXTRA_SESSION_ID, sessionId);
      PendingIntent full = PendingIntent.getActivity(this, NOTIFICATION_ID + 4, lock, flags);
      builder.setFullScreenIntent(full, true);
    }
    return builder.build();
  }

  private boolean isLocked() {
    try {
      android.app.KeyguardManager km =
          (android.app.KeyguardManager) getSystemService(android.content.Context.KEYGUARD_SERVICE);
      return km != null && km.isKeyguardLocked();
    } catch (Throwable t) {
      return false;
    }
  }

  private void ensureChannel() {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return;
    NotificationManager nm = getSystemService(NotificationManager.class);
    if (nm == null) return;
    if (nm.getNotificationChannel(CHANNEL_ID) != null) return;
    NotificationChannel channel = new NotificationChannel(
        CHANNEL_ID,
        "Ongoing order alert",
        NotificationManager.IMPORTANCE_HIGH
    );
    channel.setDescription("Continuous alert while a new order or dispatch offer is waiting");
    channel.setSound(null, null);
    channel.enableVibration(false);
    channel.setLockscreenVisibility(Notification.VISIBILITY_PUBLIC);
    channel.setShowBadge(false);
    nm.createNotificationChannel(channel);
  }

  private int smallIcon() {
    int res = getResources().getIdentifier("notification_icon", "drawable", getPackageName());
    if (res != 0) return res;
    res = getResources().getIdentifier("ic_launcher", "mipmap", getPackageName());
    if (res != 0) return res;
    return android.R.drawable.ic_dialog_info;
  }

  private static String defaultTitle() {
    return "{{ROLE}}".equals("rider") ? "Incoming order" : "New order received";
  }

  private void acquireWakeLock() {
    try {
      if (wakeLock != null && wakeLock.isHeld()) return;
      PowerManager pm = (PowerManager) getSystemService(Context.POWER_SERVICE);
      if (pm == null) return;
      wakeLock = pm.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "gatimitra:order-alert");
      wakeLock.setReferenceCounted(false);
      wakeLock.acquire(MAX_ALERT_MS + 5000L);
    } catch (Throwable ignored) {
    }
  }

  private void releaseWakeLock() {
    try {
      if (wakeLock != null && wakeLock.isHeld()) wakeLock.release();
    } catch (Throwable ignored) {
    }
    wakeLock = null;
  }
}
