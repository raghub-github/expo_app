package {{PACKAGE}};

import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.media.AudioAttributes;
import android.media.AudioFocusRequest;
import android.media.AudioManager;
import android.media.MediaPlayer;
import android.media.RingtoneManager;
import android.net.Uri;
import android.os.Build;
import android.os.PowerManager;
import android.util.Log;
import com.google.firebase.messaging.RemoteMessage;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import org.json.JSONArray;
import org.json.JSONObject;

/**
 * Single native owner for critical order/dispatch looping audio.
 *
 * Ownership model:
 *   Native OrderAlertForegroundService always owns the buzzer when this
 *   module is present. JS expo-audio / expo-av must not play the same
 *   alertSessionId. claimAlert attaches UI without starting a second player.
 */
public final class OrderAlertController {
  private static final String TAG = "GmOrderAlert";
  private static final String PREFS = "gatimitra_order_alert_v1";
  private static final String KEY_SESSIONS = "sessions";
  private static final String KEY_PRIMARY = "primarySessionId";
  private static final String APP_ROLE = "{{ROLE}}";
  static final String ACTION_STOP = "{{PACKAGE}}.ORDER_ALERT_STOP";
  static final String EXTRA_SESSION_ID = "alertSessionId";
  static final String EXTRA_ORDER_ID = "orderId";
  static final String EXTRA_OFFER_ID = "offerId";
  static final String EXTRA_SOUND_TYPE = "soundType";
  static final String EXTRA_TITLE = "alertTitle";
  static final String EXTRA_BODY = "alertBody";
  static final String EXTRA_PICKUP = "alertPickup";
  static final String EXTRA_DROP = "alertDrop";
  static final String EXTRA_ORDER_TYPE = "alertOrderType";

  private static final Object LOCK = new Object();
  private static MediaPlayer player;
  private static AudioManager audioManager;
  private static AudioFocusRequest focusRequest;
  private static String playingSessionId;

  private OrderAlertController() {}

  public static boolean handleRemoteMessage(Context context, RemoteMessage message) {
    if (context == null || message == null) return false;
    Map<String, String> data = message.getData();
    if (data == null) data = java.util.Collections.emptyMap();

    String previewSession = resolveSessionId(data);
    String previewOrder = first(data, "orderId", "order_id", "foodOrderId", "offerId", "offer_id");
    OrderAlertOverlay.debug(
        context,
        "FCM_RECEIVED",
        previewSession,
        previewOrder,
        "control=" + first(data, "gmAlertControl", "alertControl")
            + " action=" + first(data, "gmAlertAction", "alertAction")
            + " type=" + first(data, "type", "event", "gmType")
    );
    AlertEngineLog.log(
        context,
        "FCM_RECEIVED",
        previewSession,
        previewOrder,
        "control=" + first(data, "gmAlertControl", "alertControl")
            + " type=" + first(data, "type", "event", "gmType")
    );

    String action = first(data, "gmAlertAction", "alertAction");
    boolean controlOnly = "1".equals(first(data, "gmAlertControl", "alertControl"));
    if ("stop".equalsIgnoreCase(action)) {
      String sessionId = resolveSessionId(data);
      if (sessionId.length() > 0) {
        // Session-scoped stop only. Also stopping by orderId would kill a newer
        // rider wave that reused the same order/offer id.
        stop(context, sessionId);
      } else {
        String orderId = first(data, "orderId", "order_id", "foodOrderId", "offerId", "offer_id");
        if (orderId.length() > 0) stop(context, orderId);
      }
      return controlOnly || sessionId.length() > 0;
    }

    if (!isCriticalForThisApp(data)) {
      return false;
    }

    String sessionId = resolveSessionId(data);
    OrderAlertOverlay.debug(context, "CRITICAL_ORDER_DETECTED", sessionId, previewOrder, "role=" + APP_ROLE);
    AlertEngineLog.log(context, "CRITICAL_EVENT_DETECTED", sessionId, previewOrder, "role=" + APP_ROLE);
    OrderAlertOverlay.debug(
        context,
        "DRAW_OVERLAYS_PERMISSION=" + OrderAlertOverlay.canDraw(context),
        sessionId,
        previewOrder,
        null
    );
    if (sessionId.length() == 0) return controlOnly;

    String orderId = first(data, "orderId", "order_id", "foodOrderId", "food_order_id");
    String offerId = first(data, "offerId", "offer_id", "orderId", "order_id");
    String soundType = resolveSoundType(data);
    String title = first(data, "title");
    String body = first(data, "body", "message");
    if (title.length() == 0 && message.getNotification() != null) {
      title = String.valueOf(message.getNotification().getTitle());
    }
    if (body.length() == 0 && message.getNotification() != null) {
      body = String.valueOf(message.getNotification().getBody());
    }

    start(
        context,
        sessionId,
        orderId,
        offerId,
        soundType,
        title,
        body,
        resolvePickup(data),
        resolveDrop(data),
        resolveOrderType(data)
    );
    rememberPresentation(context, sessionId, data, title, body);
    return controlOnly;
  }

  /** Public order id, amount, and partner ids for the overlay and lock-screen notification. */
  static void rememberPresentation(
      Context context,
      String sessionId,
      Map<String, String> data,
      String title,
      String body
  ) {
    if (context == null || sessionId == null || sessionId.trim().length() == 0) return;
    String display = publicOrderId(data);
    String amount = first(data, "amount", "orderAmount", "grandTotal");
    String customer = first(data, "customerName", "customerLabel", "customer");
    String storeId = first(data, "storeId", "store_id", "merchantStoreId");
    String foodId = first(data, "foodOrderId", "food_order_id");
    String expires = first(data, "expiresAt", "expires_at", "acceptUntil");
    synchronized (LOCK) {
      JSONObject row = findSession(context, sessionId, "", "");
      if (row == null) return;
      try {
        if (display.length() > 0) row.put("displayOrderId", display);
        if (amount.length() > 0 && !"0".equals(amount) && !"0.0".equals(amount)) row.put("amount", amount);
        if (customer.length() > 0) row.put("customerName", customer);
        if (storeId.length() > 0) row.put("storeId", storeId);
        if (foodId.length() > 0) row.put("foodOrderId", foodId);
        if (expires.length() > 0) row.put("expiresAt", expires);
        if (title != null && title.trim().length() > 0) row.put("title", title.trim());
        if (body != null && body.trim().length() > 0) row.put("body", body.trim());
        upsertSession(context, row);
      } catch (Exception ignored) {
      }
    }
    try {
      JSONObject row = OrderAlertController.getActive(context);
      if (row != null) {
        OrderAlertOverlay.show(context, row);
        ensureService(
            context,
            row.optString("sessionId", sessionId),
            row.optString("orderId", ""),
            row.optString("offerId", ""),
            row.optString("soundType", defaultSound()),
            row.optString("title", title),
            row.optString("body", body),
            row.optString("pickup", ""),
            row.optString("drop", ""),
            row.optString("orderType", "")
        );
      }
    } catch (Throwable ignored) {
    }
  }

  static String publicOrderId(Map<String, String> data) {
    String display = first(
        data,
        "displayOrderId",
        "display_order_id",
        "orderShortId",
        "formattedOrderId",
        "formatted_order_id"
    );
    if (display.matches("^\\d+$")) display = "";
    if (display.length() == 0) {
      String blob = first(data, "title", "body", "message", "orderNumber", "order_number");
      java.util.regex.Matcher m = java.util.regex.Pattern
          .compile("GMF\\d+", java.util.regex.Pattern.CASE_INSENSITIVE)
          .matcher(blob);
      if (m.find()) display = m.group().toUpperCase();
    }
    return display;
  }

  public static void start(
      Context context,
      String sessionId,
      String orderId,
      String offerId,
      String soundType,
      String title,
      String body
  ) {
    start(context, sessionId, orderId, offerId, soundType, title, body, "", "", "");
  }

  public static void start(
      Context context,
      String sessionId,
      String orderId,
      String offerId,
      String soundType,
      String title,
      String body,
      String pickup,
      String drop,
      String orderType
  ) {
    if (context == null) return;
    String sid = sessionId == null ? "" : sessionId.trim();
    if (sid.length() == 0) return;
    String oid = orderId == null ? "" : orderId.trim();
    String offer = offerId == null ? "" : offerId.trim();
    String sound = soundType == null || soundType.trim().length() == 0
        ? defaultSound()
        : soundType.trim();
    String pickupText = pickup == null ? "" : pickup.trim();
    String dropText = drop == null ? "" : drop.trim();
    String typeText = orderType == null ? "" : orderType.trim();

    synchronized (LOCK) {
      JSONObject existing = findSession(context, sid, oid, offer);
      if (existing != null) {
        String existingId = existing.optString("sessionId", sid);
        try {
          if (pickupText.length() > 0) existing.put("pickup", pickupText);
          if (dropText.length() > 0) existing.put("drop", dropText);
          if (typeText.length() > 0) existing.put("orderType", typeText);
          if (title != null && title.trim().length() > 0) existing.put("title", title.trim());
          if (body != null && body.trim().length() > 0) existing.put("body", body.trim());
          upsertSession(context, existing);
        } catch (Exception ignored) {
        }
        putPrimary(context, existingId);
        ensureService(
            context,
            existingId,
            oid,
            offer,
            sound,
            title,
            body,
            existing.optString("pickup", pickupText),
            existing.optString("drop", dropText),
            existing.optString("orderType", typeText)
        );
        Log.i(TAG, "start idempotent sessionId=" + existingId);
        return;
      }
      JSONObject row = new JSONObject();
      try {
        row.put("sessionId", sid);
        row.put("orderId", oid);
        row.put("offerId", offer);
        row.put("soundType", sound);
        row.put("owner", "native");
        row.put("startedAt", System.currentTimeMillis());
        if (title != null) row.put("title", title);
        if (body != null) row.put("body", body);
        row.put("pickup", pickupText);
        row.put("drop", dropText);
        row.put("orderType", typeText);
      } catch (Exception ignored) {
      }
      addSession(context, row);
      putPrimary(context, sid);
    }

    ensureService(context, sid, oid, offer, sound, title, body, pickupText, dropText, typeText);
    OrderAlertPill.onNewOrder(context, sid);
    AlertEngineLog.log(context, "ALERT_SESSION_CREATED", sid, oid, "sound=" + sound + " type=" + typeText);
    Log.i(TAG, "start sessionId=" + sid + " orderId=" + oid + " sound=" + sound);
  }

  public static void stop(Context context, String sessionId) {
    if (context == null) return;
    String sid = sessionId == null ? "" : sessionId.trim();
    // Empty id from JS must not wipe every session. Watchdog / FGS stop use stopAll().
    if (sid.length() == 0) return;
    AlertEngineLog.log(context, "ALERT_STOP", sid, "", null);
    OrderAlertPill.onOrderClosed(context, sid);
    boolean empty;
    synchronized (LOCK) {
      removeSession(context, sid);
      empty = listSessions(context).length() == 0;
      if (empty) {
        putPrimary(context, "");
      } else {
        JSONArray left = listSessions(context);
        try {
          putPrimary(context, left.getJSONObject(0).optString("sessionId", ""));
        } catch (Exception ignored) {
        }
      }
    }
    if (empty) {
      OrderAlertOverlay.hide(context, sid);
      OrderAlertHeadsUp.cancel(context);
      stopAudio();
      stopService(context);
      AlertEngineLog.log(context, "ALERT_STOPPED", sid, "", "remaining=0");
      Log.i(TAG, "stop sessionId=" + sid);
      return;
    }
    OrderAlertOverlay.hide(context, sid);
    JSONObject next = getActive(context);
    if (next != null) {
      ensureService(
          context,
          next.optString("sessionId", ""),
          next.optString("orderId", ""),
          next.optString("offerId", ""),
          next.optString("soundType", defaultSound()),
          next.optString("title", ""),
          next.optString("body", ""),
          next.optString("pickup", ""),
          next.optString("drop", ""),
          next.optString("orderType", "")
      );
    }
    Log.i(TAG, "stop sessionId=" + sid + " remaining=" + listSessions(context).length());
  }

  /** Watchdog / notification Stop action when no session extra is present. */
  public static void stopAll(Context context) {
    if (context == null) return;
    synchronized (LOCK) {
      clearSessions(context);
      putPrimary(context, "");
    }
    OrderAlertOverlay.hideAll(context);
    OrderAlertHeadsUp.cancel(context);
    stopAudio();
    stopService(context);
    Log.i(TAG, "stop all");
  }

  public static JSONObject getActive(Context context) {
    synchronized (LOCK) {
      String primary = prefs(context).getString(KEY_PRIMARY, "");
      JSONObject row = findSession(context, primary, "", "");
      if (row == null) {
        JSONArray all = listSessions(context);
        if (all.length() > 0) {
          try {
            row = all.getJSONObject(0);
          } catch (Exception ignored) {
          }
        }
      }
      return row;
    }
  }

  public static JSONObject claim(Context context, String sessionId) {
    synchronized (LOCK) {
      JSONObject row = findSession(context, sessionId, sessionId, sessionId);
      if (row == null) return getActive(context);
      try {
        row.put("owner", "js_attached");
        upsertSession(context, row);
        putPrimary(context, row.optString("sessionId", sessionId));
      } catch (Exception ignored) {
      }
      return row;
    }
  }

  public static JSONObject release(Context context, String sessionId) {
    synchronized (LOCK) {
      JSONObject row = findSession(context, sessionId, sessionId, sessionId);
      if (row == null) return getActive(context);
      try {
        row.put("owner", "native");
        upsertSession(context, row);
      } catch (Exception ignored) {
      }
      return row;
    }
  }

  static void onServiceStart(Context context, Intent intent) {
    String sid = intent != null ? intent.getStringExtra(EXTRA_SESSION_ID) : null;
    String sound = intent != null ? intent.getStringExtra(EXTRA_SOUND_TYPE) : null;
    if (sid == null || sid.trim().length() == 0) {
      JSONObject active = getActive(context);
      if (active != null) {
        sid = active.optString("sessionId", "");
        if (sound == null || sound.trim().length() == 0) {
          sound = active.optString("soundType", defaultSound());
        }
      }
    }
    if (sid != null && sid.trim().length() > 0) {
      ensureAudio(context, sid.trim(), sound);
    }
  }

  static void onServiceDestroy() {
    stopAudio();
  }

  private static void ensureService(
      Context context,
      String sessionId,
      String orderId,
      String offerId,
      String soundType,
      String title,
      String body,
      String pickup,
      String drop,
      String orderType
  ) {
    try {
      Intent intent = new Intent(context, OrderAlertForegroundService.class);
      intent.setAction(OrderAlertForegroundService.ACTION_START);
      intent.putExtra(EXTRA_SESSION_ID, sessionId);
      intent.putExtra(EXTRA_ORDER_ID, orderId);
      intent.putExtra(EXTRA_OFFER_ID, offerId);
      intent.putExtra(EXTRA_SOUND_TYPE, soundType);
      if (title != null) intent.putExtra(EXTRA_TITLE, title);
      if (body != null) intent.putExtra(EXTRA_BODY, body);
      if (pickup != null) intent.putExtra(EXTRA_PICKUP, pickup);
      if (drop != null) intent.putExtra(EXTRA_DROP, drop);
      if (orderType != null) intent.putExtra(EXTRA_ORDER_TYPE, orderType);
      AlertEngineLog.log(context, "FGS_START", sessionId, orderId, "soundType=" + soundType);
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
        context.getApplicationContext().startForegroundService(intent);
      } else {
        context.getApplicationContext().startService(intent);
      }
    } catch (Throwable t) {
      Log.w(TAG, "startForegroundService failed: " + t.getMessage());
      AlertEngineLog.log(context, "FGS_START", sessionId, orderId, "failed=" + t.getMessage());
    }
  }

  private static void stopService(Context context) {
    try {
      Intent intent = new Intent(context, OrderAlertForegroundService.class);
      intent.setAction(ACTION_STOP);
      context.getApplicationContext().stopService(intent);
    } catch (Throwable ignored) {
    }
  }

  private static void ensureAudio(Context context, String sessionId, String soundType) {
    synchronized (LOCK) {
      boolean enabled = OrderAlertSoundStore.isBuzzerEnabled(context);
      AlertEngineLog.log(
          context,
          "SOUND_SETTING_READ",
          sessionId,
          "",
          "enabled=" + enabled
              + " slot=" + OrderAlertSoundStore.slot(context)
              + " ringInSilent=" + OrderAlertSoundStore.ringInSilent(context)
      );
      if (!enabled) {
        AlertEngineLog.log(context, "BUZZER_START", sessionId, "", "skipped=sound_alerts_off");
        return;
      }
      if (silentWithoutRingThrough(context)) {
        AlertEngineLog.log(context, "BUZZER_START", sessionId, "", "skipped=ringer_silent");
        return;
      }
      if (player != null && player.isPlaying() && sessionId.equals(playingSessionId)) {
        AlertEngineLog.log(context, "BUZZER_STARTED", sessionId, "", "idempotent=1");
        return;
      }
      stopAudioLocked();
      AlertEngineLog.log(context, "BUZZER_START", sessionId, "", "soundType=" + soundType);
      MediaPlayer next = createPlayer(context, sessionId, soundType);
      if (next == null) {
        AlertEngineLog.log(context, "BUZZER_START", sessionId, "", "failed=createPlayer_null");
        return;
      }
      try {
        requestFocus(context);
        next.setWakeMode(context, PowerManager.PARTIAL_WAKE_LOCK);
        next.setLooping(true);
        next.start();
        player = next;
        playingSessionId = sessionId;
        OrderAlertOverlay.debug(context, "BUZZER_STARTED", sessionId, "", "sound=" + soundType);
        AlertEngineLog.log(context, "BUZZER_STARTED", sessionId, "", "soundType=" + soundType);
      } catch (Throwable t) {
        Log.w(TAG, "audio start failed: " + t.getMessage());
        AlertEngineLog.log(context, "BUZZER_START", sessionId, "", "failed=" + t.getMessage());
        try {
          next.release();
        } catch (Throwable ignored) {
        }
      }
    }
  }

  private static void stopAudio() {
    synchronized (LOCK) {
      stopAudioLocked();
    }
  }

  private static void stopAudioLocked() {
    if (player != null) {
      try {
        if (player.isPlaying()) player.stop();
      } catch (Throwable ignored) {
      }
      try {
        player.reset();
      } catch (Throwable ignored) {
      }
      try {
        player.release();
      } catch (Throwable ignored) {
      }
      player = null;
    }
    playingSessionId = null;
    abandonFocus();
  }

  private static boolean silentWithoutRingThrough(Context context) {
    if (context == null || OrderAlertSoundStore.ringInSilent(context)) return false;
    try {
      AudioManager am = (AudioManager) context.getSystemService(Context.AUDIO_SERVICE);
      if (am == null) return false;
      int mode = am.getRingerMode();
      return mode == AudioManager.RINGER_MODE_SILENT || mode == AudioManager.RINGER_MODE_VIBRATE;
    } catch (Throwable ignored) {
      return false;
    }
  }

  private static AudioAttributes alertAudioAttributes(Context context) {
    // Alarm usage still plays the partner-selected file when the screen is locked
    // or the ringer is silent, if the partner left ring-in-silent enabled.
    int usage = OrderAlertSoundStore.ringInSilent(context)
        ? AudioAttributes.USAGE_ALARM
        : AudioAttributes.USAGE_NOTIFICATION_RINGTONE;
    return new AudioAttributes.Builder()
        .setUsage(usage)
        .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
        .build();
  }

  /**
   * Native-safe waterfall. Never requires JS / Manage Communication:
   *   selected cached file → bundled res/raw → system ringtone.
   * A missing or corrupt selected file must not produce a silent buzzer.
   */
  private static MediaPlayer createPlayer(Context context, String sessionId, String soundType) {
    AudioAttributes attrs = alertAudioAttributes(context);

    java.io.File selected = OrderAlertSoundStore.selectedFile(context);
    if (selected != null) {
      MediaPlayer fromFile = playerFromFile(context, selected, attrs);
      if (fromFile != null) {
        AlertEngineLog.log(
            context,
            "SOUND_RESOLVED",
            sessionId,
            "",
            "source=selected_file path=" + selected.getName()
                + " slot=" + OrderAlertSoundStore.slot(context)
        );
        return fromFile;
      }
      AlertEngineLog.log(
          context,
          "SOUND_RESOLVED",
          sessionId,
          "",
          "source=selected_file_failed fallback=bundled path=" + selected.getName()
      );
    } else {
      AlertEngineLog.log(
          context,
          "SOUND_RESOLVED",
          sessionId,
          "",
          "source=no_selected_file fallback=bundled (first-install / never cached)"
      );
    }

    String[] rawNames = new String[] {
        soundType == null ? "" : soundType.trim().replaceAll("\\.(wav|mp3|ogg)$", ""),
        defaultSound(),
        "notification",
        "food_order",
        "parcel_order",
        "ride_order"
    };
    for (String raw : rawNames) {
      if (raw == null || raw.trim().length() == 0) continue;
      MediaPlayer fromRaw = playerFromRaw(context, raw.trim(), attrs);
      if (fromRaw != null) {
        AlertEngineLog.log(context, "SOUND_RESOLVED", sessionId, "", "source=bundled_raw name=" + raw.trim());
        return fromRaw;
      }
    }

    MediaPlayer fromSystem = playerFromSystem(context, attrs);
    if (fromSystem != null) {
      AlertEngineLog.log(context, "SOUND_RESOLVED", sessionId, "", "source=system_ringtone");
      return fromSystem;
    }

    AlertEngineLog.log(context, "SOUND_RESOLVED", sessionId, "", "failed=no_sound_source");
    return null;
  }

  private static MediaPlayer playerFromFile(Context context, java.io.File file, AudioAttributes attrs) {
    MediaPlayer mp = null;
    try {
      mp = new MediaPlayer();
      mp.setAudioAttributes(attrs);
      mp.setDataSource(file.getAbsolutePath());
      mp.prepare();
      mp.setLooping(true);
      return mp;
    } catch (Throwable t) {
      releaseQuietly(mp);
      return null;
    }
  }

  private static MediaPlayer playerFromRaw(Context context, String rawName, AudioAttributes attrs) {
    try {
      int resId = context.getResources().getIdentifier(rawName, "raw", context.getPackageName());
      if (resId == 0) return null;
      MediaPlayer mp = MediaPlayer.create(context, resId, attrs, 0);
      if (mp == null) return null;
      mp.setLooping(true);
      return mp;
    } catch (Throwable t) {
      return null;
    }
  }

  private static MediaPlayer playerFromSystem(Context context, AudioAttributes attrs) {
    MediaPlayer mp = null;
    try {
      Uri uri = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_ALARM);
      if (uri == null) uri = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_NOTIFICATION);
      if (uri == null) return null;
      mp = new MediaPlayer();
      mp.setAudioAttributes(attrs);
      mp.setDataSource(context, uri);
      mp.prepare();
      mp.setLooping(true);
      return mp;
    } catch (Throwable t) {
      releaseQuietly(mp);
      return null;
    }
  }

  private static void releaseQuietly(MediaPlayer mp) {
    if (mp == null) return;
    try {
      mp.release();
    } catch (Throwable ignored) {
    }
  }

  private static void requestFocus(Context context) {
    try {
      audioManager = (AudioManager) context.getSystemService(Context.AUDIO_SERVICE);
      if (audioManager == null) return;
      if (Build.VERSION.SDK_INT >= 26) {
        focusRequest = new AudioFocusRequest.Builder(AudioManager.AUDIOFOCUS_GAIN_TRANSIENT_MAY_DUCK)
            .setAudioAttributes(alertAudioAttributes(context))
            .build();
        audioManager.requestAudioFocus(focusRequest);
      } else {
        audioManager.requestAudioFocus(
            null,
            AudioManager.STREAM_ALARM,
            AudioManager.AUDIOFOCUS_GAIN_TRANSIENT_MAY_DUCK
        );
      }
    } catch (Throwable ignored) {
    }
  }

  private static void abandonFocus() {
    try {
      if (audioManager != null) {
        if (Build.VERSION.SDK_INT >= 26 && focusRequest != null) {
          audioManager.abandonAudioFocusRequest(focusRequest);
        } else {
          audioManager.abandonAudioFocus(null);
        }
      }
    } catch (Throwable ignored) {
    }
    focusRequest = null;
  }

  private static boolean isCriticalForThisApp(Map<String, String> data) {
    String role = first(data, "appRole", "role").toLowerCase(Locale.US);
    if (role.length() > 0 && !role.equals(APP_ROLE) && !role.equals("merchant") && !role.equals("rider")) {
      return false;
    }
    if ("merchant".equals(APP_ROLE)) {
      if (role.length() > 0 && !"merchant".equals(role)) return false;
      return isMerchantNewOrder(data);
    }
    if (role.length() > 0 && !"rider".equals(role)) return false;
    return isRiderDispatch(data);
  }

  private static boolean isMerchantNewOrder(Map<String, String> data) {
    String t = first(data, "type", "event", "gmType", "template_code").toLowerCase(Locale.US);
    String template = first(data, "template_code", "templateCode", "gmType").toUpperCase(Locale.US);
    String screen = first(data, "screen").toLowerCase(Locale.US);
    return "merchant_new_order".equals(t)
        || "new_order".equals(t)
        || "new_order".equals(screen)
        || "MERCHANT_NEW_ORDER".equals(template);
  }

  private static boolean isRiderDispatch(Map<String, String> data) {
    String t = first(data, "type", "event", "gmType", "template_code").toLowerCase(Locale.US);
    String template = first(data, "template_code", "templateCode", "gmType").toUpperCase(Locale.US);
    return "dispatch_offer".equals(t)
        || "rider_dispatch_offer".equals(t)
        || "rider_new_order".equals(t)
        || "incoming_order".equals(t)
        || "force_assignment_offer".equals(t)
        || "new_order".equals(t)
        || "RIDER_DISPATCH_OFFER".equals(template)
        || "RIDER_NEW_ORDER".equals(template)
        || "DISPATCH_OFFER".equals(template);
  }

  static String resolveSessionId(Map<String, String> data) {
    String explicit = first(data, "alertSessionId", "alert_session_id");
    if (explicit.length() > 0) return explicit;
    if ("merchant".equals(APP_ROLE)) {
      String orderId = first(data, "foodOrderId", "food_order_id", "orderId", "order_id");
      if (orderId.length() > 0) return "merchant-order-" + orderId;
    } else {
      String offerId = first(data, "offerId", "offer_id", "orderId", "order_id");
      if (offerId.length() > 0) return "rider-offer-" + offerId;
    }
    return "";
  }

  static String resolveSoundType(Map<String, String> data) {
    String explicit = first(data, "soundType", "sound", "channelSound");
    if (explicit.length() > 0) {
      return explicit.replaceAll("\\.(wav|mp3|ogg)$", "");
    }
    if ("merchant".equals(APP_ROLE)) return "notification";
    String service = first(data, "serviceType", "category").toLowerCase(Locale.US);
    if ("food".equals(service)) return "food_order";
    if ("parcel".equals(service)) return "parcel_order";
    if ("ride".equals(service) || "person_ride".equals(service)) return "ride_order";
    return "notification";
  }

  private static String resolvePickup(Map<String, String> data) {
    String labeled = first(data, "pickupDistance", "pickup", "pickupAddress", "merchantName");
    if (labeled.length() > 0) return labeled;
    String meters = first(data, "pickupDistanceMeters");
    if (meters.length() > 0) return meters;
    return "";
  }

  private static String resolveDrop(Map<String, String> data) {
    return first(data, "dropArea", "drop", "dropAddress");
  }

  private static String resolveOrderType(Map<String, String> data) {
    return first(data, "serviceType", "category", "orderType");
  }

  private static String defaultSound() {
    return "merchant".equals(APP_ROLE) ? "notification" : "notification";
  }

  private static SharedPreferences prefs(Context context) {
    return context.getApplicationContext().getSharedPreferences(PREFS, Context.MODE_PRIVATE);
  }

  private static JSONArray listSessions(Context context) {
    try {
      String raw = prefs(context).getString(KEY_SESSIONS, "[]");
      return new JSONArray(raw);
    } catch (Exception e) {
      return new JSONArray();
    }
  }

  private static void saveSessions(Context context, JSONArray arr) {
    prefs(context).edit().putString(KEY_SESSIONS, arr.toString()).apply();
  }

  private static void addSession(Context context, JSONObject row) {
    JSONArray arr = listSessions(context);
    arr.put(row);
    saveSessions(context, arr);
  }

  private static void upsertSession(Context context, JSONObject row) {
    String sid = row.optString("sessionId", "");
    JSONArray arr = listSessions(context);
    JSONArray next = new JSONArray();
    boolean replaced = false;
    for (int i = 0; i < arr.length(); i++) {
      try {
        JSONObject cur = arr.getJSONObject(i);
        if (sid.equals(cur.optString("sessionId", ""))) {
          next.put(row);
          replaced = true;
        } else {
          next.put(cur);
        }
      } catch (Exception ignored) {
      }
    }
    if (!replaced) next.put(row);
    saveSessions(context, next);
  }

  private static void removeSession(Context context, String token) {
    JSONArray arr = listSessions(context);
    JSONArray next = new JSONArray();
    String needle = token.trim();
    for (int i = 0; i < arr.length(); i++) {
      try {
        JSONObject cur = arr.getJSONObject(i);
        if (matches(cur, needle)) continue;
        next.put(cur);
      } catch (Exception ignored) {
      }
    }
    saveSessions(context, next);
  }

  private static void clearSessions(Context context) {
    saveSessions(context, new JSONArray());
  }

  private static JSONObject findSession(Context context, String sessionId, String orderId, String offerId) {
    JSONArray arr = listSessions(context);
    List<String> keys = new ArrayList<>();
    if (sessionId != null && sessionId.trim().length() > 0) keys.add(sessionId.trim());
    if (orderId != null && orderId.trim().length() > 0) keys.add(orderId.trim());
    if (offerId != null && offerId.trim().length() > 0) keys.add(offerId.trim());
    for (int i = 0; i < arr.length(); i++) {
      try {
        JSONObject cur = arr.getJSONObject(i);
        for (String key : keys) {
          if (matches(cur, key)) return cur;
        }
      } catch (Exception ignored) {
      }
    }
    return null;
  }

  private static boolean matches(JSONObject row, String token) {
    if (token == null || token.length() == 0) return false;
    String sessionId = row.optString("sessionId", "");
    if (token.equals(sessionId)
        || token.equals(row.optString("orderId", ""))
        || token.equals(row.optString("offerId", ""))) {
      return true;
    }
    // JS may omit waveNumber (`RIDER_NEW_ORDER:order:rider`) while FCM includes it.
    if (sessionId.length() > 0
        && (sessionId.startsWith(token + ":") || token.startsWith(sessionId + ":"))) {
      return true;
    }
    return false;
  }

  private static void putPrimary(Context context, String sessionId) {
    prefs(context).edit().putString(KEY_PRIMARY, sessionId == null ? "" : sessionId).apply();
  }

  private static String first(Map<String, String> data, String... keys) {
    if (data == null) return "";
    for (String key : keys) {
      String v = data.get(key);
      if (v != null && v.trim().length() > 0 && !"null".equalsIgnoreCase(v.trim())) {
        return v.trim();
      }
    }
    return "";
  }
}
