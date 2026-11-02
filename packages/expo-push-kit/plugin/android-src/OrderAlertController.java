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
  private static final String KEY_RETIRED = "retiredSessions";
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
  /** Active alert may ring. Muted = app opened / UI attached, audio forbidden. */
  static final String STATE_ACTIVE = "active";
  static final String STATE_MUTED = "muted";
  static final String STATE_TERMINAL = "terminal";
  private static final long RETIRED_TTL_MS = 24L * 60L * 60L * 1000L;

  private static final Object LOCK = new Object();
  private static MediaPlayer player;
  private static AudioManager audioManager;
  private static AudioFocusRequest focusRequest;
  private static String playingSessionId;

  private OrderAlertController() {}

  /**
   * @return true when native owns this message end-to-end (Expo/FCM tray must not
   * also post — that was the duplicate "New order" + "NEW ORDER" shade pair).
   */
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
      String orderId = first(data, "foodOrderId", "food_order_id", "orderId", "order_id", "offerId", "offer_id");
      if (sessionId.length() > 0) {
        // Session-scoped stop. Merchant sessions include food id; rider waves use
        // distinct session ids so a stop does not kill a newer wave.
        stop(context, sessionId);
      } else if (orderId.length() > 0) {
        stop(context, orderId);
      }
      // Always retire payload order tokens so a delayed START cannot revive
      // after the session row was already removed.
      if (orderId.length() > 0) {
        retireSession(context, orderId);
        retireSession(context, "merchant-order-" + orderId);
        retireSession(context, "rider-offer-" + orderId);
      }
      if (sessionId.length() > 0) {
        retireSession(context, sessionId);
        String extracted = extractOrderToken(sessionId);
        if (extracted.length() > 0) {
          retireSession(context, extracted);
          retireSession(context, "merchant-order-" + extracted);
        }
      }
      return true;
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

    // Accepted / rejected / expired sessions must never resurrect from delayed FCM.
    if (isRetired(context, sessionId)) {
      AlertEngineLog.log(context, "ALERT_IGNORED_RETIRED", sessionId, previewOrder, null);
      return true;
    }
    // Delayed START after a global stop: alertStopAt / version in a prior stop
    // is recorded via retireSession. Also refuse START when payload itself is a stop.
    if ("stop".equalsIgnoreCase(first(data, "gmAlertAction", "alertAction"))) {
      return true;
    }

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
    // Native FGS + overlay owns the tray. Skipping Expo prevents the duplicate shade row.
    return true;
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
    String tripKm = first(data, "tripDistanceKm", "trip_distance_km");
    String itemsJson = first(data, "itemsJson", "items_json", "orderItemsJson", "itemsSummary");
    String special = first(
        data,
        "specialInstructions",
        "special_instructions",
        "preparationNotes",
        "customerNote"
    );
    String payment = first(data, "paymentMethod", "payment_method", "paymentMode");
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
        if (tripKm.length() > 0 && !"0".equals(tripKm)) row.put("tripDistanceKm", tripKm);
        if (itemsJson.length() > 0) row.put("itemsJson", itemsJson);
        if (special.length() > 0) row.put("specialInstructions", special);
        if (payment.length() > 0) row.put("paymentMethod", payment);
        if (title != null && title.trim().length() > 0) row.put("title", title.trim());
        if (body != null && body.trim().length() > 0) row.put("body", body.trim());
        upsertSession(context, row);
      } catch (Exception ignored) {
      }
    }
    try {
      JSONObject row = OrderAlertController.getActive(context);
      if (row != null) {
        if (OrderAlertVisibility.shouldSuppressOverlayWindow(context)) {
          OrderAlertOverlay.hideAll(context);
        } else {
          OrderAlertOverlay.show(context, row);
        }
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
      // Last resort when no id field came through. GMF is food; rides and parcels
      // carry their own prefixes, and matching food only is why those cards showed
      // no order id at all.
      String blob = first(data, "title", "body", "message", "orderNumber", "order_number");
      java.util.regex.Matcher m = java.util.regex.Pattern
          .compile("GM[A-Z]\\d+", java.util.regex.Pattern.CASE_INSENSITIVE)
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

    if (isRetired(context, sid)) {
      AlertEngineLog.log(context, "ALERT_IGNORED_RETIRED", sid, oid, "start");
      return;
    }

    synchronized (LOCK) {
      JSONObject existing = findSession(context, sid, oid, offer);
      if (existing != null) {
        String existingId = existing.optString("sessionId", sid);
        String state = existing.optString("alertState", STATE_ACTIVE);
        // Terminal / muted sessions must never restart the buzzer from a retry.
        if (STATE_TERMINAL.equals(state)) {
          AlertEngineLog.log(context, "ALERT_IGNORED_TERMINAL", existingId, oid, null);
          return;
        }
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
        if (STATE_MUTED.equals(state)) {
          // Keep the session for in-app UI, but do not re-arm FGS audio.
          AlertEngineLog.log(context, "ALERT_KEEP_MUTED", existingId, oid, null);
          Log.i(TAG, "start idempotent muted sessionId=" + existingId);
          return;
        }
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
        row.put("alertState", STATE_ACTIVE);
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

    // New session → allow the floating card again (previous dismiss was for another order).
    try {
      OrderAlertOverlay.pruneDismissed(context, sid);
    } catch (Throwable ignored) {
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
      JSONObject doomed = findSession(context, sid, sid, sid);
      if (doomed != null) {
        retireSession(context, doomed.optString("sessionId", sid));
        String oid = doomed.optString("foodOrderId", "");
        if (oid.length() == 0) oid = doomed.optString("orderId", "");
        if (oid.length() > 0) retireSession(context, oid);
        retireSession(context, "merchant-order-" + oid);
      } else {
        retireSession(context, sid);
      }
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
    // Always release the current player; remaining sessions restart via ensureService.
    stopAudio();
    if (empty) {
      OrderAlertOverlay.hideAll(context);
      OrderAlertHeadsUp.cancel(context);
      OrderAlertLockActivity.finishLive();
      stopService(context);
      AlertEngineLog.log(context, "ALERT_STOPPED", sid, "", "remaining=0");
      Log.i(TAG, "stop sessionId=" + sid);
      return;
    }
    OrderAlertOverlay.hide(context, sid);
    JSONObject next = getActive(context);
    if (next != null && STATE_ACTIVE.equals(next.optString("alertState", STATE_ACTIVE))) {
      if (!OrderAlertVisibility.shouldSuppressOverlayWindow(context)) {
        OrderAlertOverlay.show(context, next);
      }
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
    } else if (next == null) {
      OrderAlertHeadsUp.cancel(context);
      OrderAlertLockActivity.finishLive();
      stopService(context);
    }
    Log.i(TAG, "stop sessionId=" + sid + " remaining=" + listSessions(context).length());
  }

  /** Watchdog / notification Stop action when no session extra is present. */
  public static void stopAll(Context context) {
    if (context == null) return;
    synchronized (LOCK) {
      JSONArray all = listSessions(context);
      for (int i = 0; i < all.length(); i++) {
        try {
          retireSession(context, all.getJSONObject(i).optString("sessionId", ""));
        } catch (Exception ignored) {
        }
      }
      clearSessions(context);
      putPrimary(context, "");
    }
    OrderAlertOverlay.hideAll(context);
    OrderAlertHeadsUp.cancel(context);
    OrderAlertLockActivity.finishLive();
    stopAudio();
    stopService(context);
    Log.i(TAG, "stop all");
  }

  /**
   * Device reboot: drop every locally cached alert. Accepted/rejected orders must
   * never come back as "waiting for acceptance". Pending ones are re-fetched from
   * the backend after the app reconnects.
   */
  public static void clearPersistedAlertsOnBoot(Context context) {
    if (context == null) return;
    AlertEngineLog.log(context, "BOOT_CLEAR_ALERTS", "", "", null);
    stopAll(context);
  }

  /**
   * App opened / foregrounded while a buzzer is playing. Stops audio immediately,
   * keeps the session for in-app pending UI, and forbids any restart until a
   * genuinely new alertSessionId arrives.
   */
  public static JSONObject mute(Context context, String sessionId) {
    if (context == null) return null;
    String sid = sessionId == null ? "" : sessionId.trim();
    JSONObject row;
    synchronized (LOCK) {
      row = sid.length() > 0 ? findSession(context, sid, sid, sid) : getActive(context);
      if (row == null) {
        stopAudio();
        return null;
      }
      try {
        row.put("alertState", STATE_MUTED);
        row.put("owner", "js_attached");
        upsertSession(context, row);
        putPrimary(context, row.optString("sessionId", sid));
      } catch (Exception ignored) {
      }
    }
    stopAudio();
    try {
      OrderAlertOverlay.hideAll(context);
      OrderAlertHeadsUp.cancel(context);
      OrderAlertLockActivity.finishLive();
      // Drop the FGS so START_STICKY cannot resurrect the looping MediaPlayer.
      stopService(context);
    } catch (Throwable ignored) {
    }
    AlertEngineLog.log(
        context,
        "ALERT_MUTED",
        row.optString("sessionId", sid),
        row.optString("orderId", ""),
        "app_open=1"
    );
    return row;
  }

  /** Mute every active session — used on AppState → active. */
  public static void muteAll(Context context) {
    if (context == null) return;
    JSONArray all;
    synchronized (LOCK) {
      all = listSessions(context);
    }
    if (all.length() == 0) {
      stopAudio();
      return;
    }
    for (int i = 0; i < all.length(); i++) {
      try {
        mute(context, all.getJSONObject(i).optString("sessionId", ""));
      } catch (Exception ignored) {
      }
    }
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

  /**
   * True while the React UI is presenting this alert itself.
   *
   * The one authoritative answer to "is a card already on screen". Process
   * importance only guesses at it, and guessing is how the overlay ended up
   * stacked on top of the in-app sheet.
   */
  public static boolean isJsOwned(Context context, String sessionId) {
    if (context == null) return false;
    synchronized (LOCK) {
      JSONObject row = findSession(context, sessionId, sessionId, sessionId);
      if (row == null) return false;
      return "js_attached".equals(row.optString("owner", "native"));
    }
  }

  public static JSONObject claim(Context context, String sessionId) {
    synchronized (LOCK) {
      JSONObject row = findSession(context, sessionId, sessionId, sessionId);
      if (row == null) return getActive(context);
      try {
        row.put("owner", "js_attached");
        // claim attaches in-app UI only. Audio continues until mute()/stop() —
        // required so a genuinely new order while the app is already open can ring.
        upsertSession(context, row);
        putPrimary(context, row.optString("sessionId", sessionId));
      } catch (Exception ignored) {
      }
      // The overlay may already be mounted — the FCM can beat the React tree to
      // the screen. Retire it now that the app is presenting the same offer.
      try {
        OrderAlertOverlay.hide(context, row.optString("sessionId", sessionId));
      } catch (Throwable ignored) {
      }
      return row;
    }
  }

  public static JSONObject release(Context context, String sessionId) {
    JSONObject result;
    synchronized (LOCK) {
      JSONObject row = findSession(context, sessionId, sessionId, sessionId);
      if (row == null) return getActive(context);
      try {
        row.put("owner", "native");
        upsertSession(context, row);
      } catch (Exception ignored) {
      }
      result = row;
    }
    // Handing the card back: if the app is no longer in front, the native
    // overlay is now the only thing that can present this offer.
    try {
      if (!OrderAlertVisibility.shouldSuppressOverlayWindow(context)) {
        OrderAlertOverlay.show(context, result);
      }
    } catch (Throwable ignored) {
    }
    return result;
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
      if (isRetired(context, sessionId)) {
        AlertEngineLog.log(context, "BUZZER_START", sessionId, "", "skipped=retired");
        return;
      }
      JSONObject row = findSession(context, sessionId, sessionId, sessionId);
      if (row != null) {
        String state = row.optString("alertState", STATE_ACTIVE);
        if (STATE_MUTED.equals(state) || STATE_TERMINAL.equals(state)) {
          AlertEngineLog.log(context, "BUZZER_START", sessionId, "", "skipped=state_" + state);
          return;
        }
      }
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
    String orderId = row.optString("orderId", "");
    String offerId = row.optString("offerId", "");
    String foodId = row.optString("foodOrderId", "");
    if (token.equals(sessionId)
        || token.equals(orderId)
        || token.equals(offerId)
        || token.equals(foodId)) {
      return true;
    }
    // JS may omit waveNumber (`RIDER_NEW_ORDER:order:rider`) while FCM includes it.
    if (sessionId.length() > 0
        && (sessionId.startsWith(token + ":") || token.startsWith(sessionId + ":"))) {
      return true;
    }
    // Unify merchant-order-<id> ↔ MERCHANT_NEW_ORDER:<id>:<store> ↔ raw food id.
    String extracted = extractOrderToken(token);
    if (extracted.length() > 0) {
      if (extracted.equals(orderId) || extracted.equals(offerId) || extracted.equals(foodId)) {
        return true;
      }
      if (sessionId.equals("merchant-order-" + extracted)
          || sessionId.equals("rider-offer-" + extracted)
          || sessionId.startsWith("MERCHANT_NEW_ORDER:" + extracted + ":")
          || sessionId.startsWith("RIDER_NEW_ORDER:" + extracted + ":")) {
        return true;
      }
      String sessionExtracted = extractOrderToken(sessionId);
      if (sessionExtracted.length() > 0 && sessionExtracted.equals(extracted)) {
        return true;
      }
    }
    return false;
  }

  /** Pull the stable food/order id out of native or JS session id formats. */
  private static String extractOrderToken(String token) {
    if (token == null) return "";
    String t = token.trim();
    if (t.length() == 0) return "";
    if (t.startsWith("merchant-order-")) return t.substring("merchant-order-".length());
    if (t.startsWith("rider-offer-")) return t.substring("rider-offer-".length());
    if (t.startsWith("MERCHANT_NEW_ORDER:")) {
      String rest = t.substring("MERCHANT_NEW_ORDER:".length());
      int colon = rest.indexOf(':');
      return colon >= 0 ? rest.substring(0, colon) : rest;
    }
    if (t.startsWith("RIDER_NEW_ORDER:")) {
      String rest = t.substring("RIDER_NEW_ORDER:".length());
      int colon = rest.indexOf(':');
      return colon >= 0 ? rest.substring(0, colon) : rest;
    }
    return t;
  }

  private static void putPrimary(Context context, String sessionId) {
    prefs(context).edit().putString(KEY_PRIMARY, sessionId == null ? "" : sessionId).apply();
  }

  private static void retireSession(Context context, String token) {
    String t = token == null ? "" : token.trim();
    if (t.length() == 0) return;
    try {
      JSONObject map = readRetired(context);
      map.put(t, System.currentTimeMillis());
      // Bound growth: drop entries older than TTL.
      java.util.Iterator<String> keys = map.keys();
      java.util.ArrayList<String> drop = new java.util.ArrayList<>();
      long now = System.currentTimeMillis();
      while (keys.hasNext()) {
        String k = keys.next();
        if (now - map.optLong(k, 0L) > RETIRED_TTL_MS) drop.add(k);
      }
      for (String k : drop) map.remove(k);
      prefs(context).edit().putString(KEY_RETIRED, map.toString()).apply();
    } catch (Exception ignored) {
    }
  }

  private static boolean isRetired(Context context, String token) {
    String t = token == null ? "" : token.trim();
    if (t.length() == 0 || context == null) return false;
    try {
      JSONObject map = readRetired(context);
      if (nowFresh(map.optLong(t, 0L))) return true;
      String extracted = extractOrderToken(t);
      if (extracted.length() == 0) return false;
      if (nowFresh(map.optLong(extracted, 0L))) return true;
      if (nowFresh(map.optLong("merchant-order-" + extracted, 0L))) return true;
      if (nowFresh(map.optLong("rider-offer-" + extracted, 0L))) return true;
      java.util.Iterator<String> keys = map.keys();
      while (keys.hasNext()) {
        String k = keys.next();
        if (k.contains(extracted) && nowFresh(map.optLong(k, 0L))) return true;
      }
      return false;
    } catch (Exception ignored) {
      return false;
    }
  }

  private static boolean nowFresh(long at) {
    return at > 0L && System.currentTimeMillis() - at <= RETIRED_TTL_MS;
  }

  private static JSONObject readRetired(Context context) {
    try {
      String raw = prefs(context).getString(KEY_RETIRED, "{}");
      return new JSONObject(raw == null || raw.length() == 0 ? "{}" : raw);
    } catch (Exception e) {
      return new JSONObject();
    }
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
