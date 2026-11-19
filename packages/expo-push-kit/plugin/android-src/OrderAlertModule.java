package {{PACKAGE}};

import android.content.Intent;
import android.content.Context;
import androidx.annotation.NonNull;
import com.facebook.react.bridge.Arguments;
import com.facebook.react.bridge.Promise;
import com.facebook.react.bridge.ReactApplicationContext;
import com.facebook.react.bridge.ReactContextBaseJavaModule;
import com.facebook.react.bridge.ReactMethod;
import com.facebook.react.bridge.WritableMap;
import org.json.JSONObject;

public class OrderAlertModule extends ReactContextBaseJavaModule {
  public OrderAlertModule(ReactApplicationContext context) {
    super(context);
    OrderAlertVisibility.register(context);
  }

  @NonNull
  @Override
  public String getName() {
    return "GatimitraOrderAlert";
  }

  @ReactMethod
  public void startAlert(String sessionId, String orderId, String offerId, String soundType, Promise promise) {
    try {
      OrderAlertController.start(
          getReactApplicationContext(),
          sessionId,
          orderId,
          offerId,
          soundType,
          null,
          null
      );
      promise.resolve(toMap(OrderAlertController.getActive(getReactApplicationContext())));
    } catch (Throwable t) {
      promise.reject("E_ALERT_START", t);
    }
  }

  /**
   * startAlert plus the offer details the app already holds (addresses,
   * earnings, distances, deadline, items). Without them an app-started alert
   * drew a detail-less card until a push happened to land. `detailsJson` is a
   * flat JSON object using the same keys as the FCM data payload.
   */
  @ReactMethod
  public void startAlertWithDetails(
      String sessionId,
      String orderId,
      String offerId,
      String soundType,
      String detailsJson,
      Promise promise
  ) {
    try {
      Context ctx = getReactApplicationContext();
      java.util.Map<String, String> details = parseDetails(detailsJson);
      OrderAlertController.start(
          ctx,
          sessionId,
          orderId,
          offerId,
          soundType,
          details.get("title"),
          details.get("body")
      );
      OrderAlertController.applyDetails(ctx, sessionId, details);
      promise.resolve(toMap(OrderAlertController.getActive(ctx)));
    } catch (Throwable t) {
      promise.reject("E_ALERT_START", t);
    }
  }

  /** Refresh the details of a live alert (e.g. FCM-started, app now knows more). */
  @ReactMethod
  public void updateAlertDetails(String sessionId, String detailsJson, Promise promise) {
    try {
      OrderAlertController.applyDetails(getReactApplicationContext(), sessionId, parseDetails(detailsJson));
      promise.resolve(true);
    } catch (Throwable t) {
      promise.reject("E_ALERT_DETAILS", t);
    }
  }

  /** Flat string map from the app's JSON; nested values and nulls are dropped. */
  private static java.util.Map<String, String> parseDetails(String json) {
    java.util.Map<String, String> out = new java.util.HashMap<>();
    if (json == null || json.trim().length() == 0) return out;
    try {
      JSONObject obj = new JSONObject(json);
      java.util.Iterator<String> keys = obj.keys();
      while (keys.hasNext()) {
        String key = keys.next();
        Object value = obj.opt(key);
        if (value == null || value == JSONObject.NULL) continue;
        if (value instanceof JSONObject || value instanceof org.json.JSONArray) continue;
        String text = String.valueOf(value).trim();
        if (text.length() == 0 || "null".equalsIgnoreCase(text)) continue;
        out.put(key, text.length() > 2000 ? text.substring(0, 2000) : text);
      }
    } catch (Throwable ignored) {
    }
    return out;
  }

  @ReactMethod
  public void persistSoundSettings(
      boolean enabled,
      String fileUri,
      int slot,
      boolean ringInSilent,
      double volume01,
      Promise promise
  ) {
    try {
      String path = OrderAlertSoundStore.persist(
          getReactApplicationContext(),
          enabled,
          fileUri,
          slot,
          ringInSilent,
          (float) volume01
      );
      AlertEngineLog.log(
          getReactApplicationContext(),
          "SOUND_SETTING_READ",
          "",
          "",
          "persisted=1 enabled=" + enabled + " slot=" + slot + " path=" + (path == null ? "" : path)
      );
      promise.resolve(path);
    } catch (Throwable t) {
      promise.reject("E_SOUND_PERSIST", t);
    }
  }

  @ReactMethod
  public void canDrawOverlays(Promise promise) {
    try {
      promise.resolve(OrderAlertOverlay.canDraw(getReactApplicationContext()));
    } catch (Throwable t) {
      promise.reject("E_OVERLAY_PERM", t);
    }
  }

  @ReactMethod
  public void persistActionCredentials(String baseUrl, String token, String storeId, Promise promise) {
    try {
      OrderAlertActions.saveCredentials(getReactApplicationContext(), baseUrl, token, storeId);
      promise.resolve(true);
    } catch (Throwable t) {
      promise.reject("E_ALERT_AUTH", t);
    }
  }

  @ReactMethod
  public void consumePendingAction(Promise promise) {
    try {
      promise.resolve(OrderAlertActions.consumePending(getReactApplicationContext()));
    } catch (Throwable t) {
      promise.reject("E_ALERT_PENDING", t);
    }
  }

  @ReactMethod
  public void setPersistentPill(boolean enabled, int count, String orderId, Promise promise) {
    try {
      Context ctx = getReactApplicationContext();
      OrderAlertVisibility.register(ctx);
      if (OrderAlertVisibility.shouldHideBecausePartnerIsOpen(ctx)) {
        OrderAlertPill.setPartnerForeground(ctx, true);
      }
      // WindowManager overlay only — do NOT start FGS / wake lock for the pill.
      // FGS is reserved for active incoming-order buzzer sessions.
      OrderAlertPill.setState(ctx, enabled, count, orderId);
      promise.resolve(true);
    } catch (Throwable t) {
      promise.reject("E_PILL", t);
    }
  }

  @ReactMethod
  public void consumePillLaunch(Promise promise) {
    try {
      WritableMap map = Arguments.createMap();
      android.app.Activity activity = getCurrentActivity();
      Intent intent = activity != null ? activity.getIntent() : null;
      String kind = intent != null ? intent.getStringExtra("gmPill") : null;
      if (!"orders".equals(kind)) {
        promise.resolve(null);
        return;
      }
      map.putString("kind", "orders");
      map.putInt("count", intent.getIntExtra("gmPillCount", 0));
      map.putString("orderId", intent.getStringExtra("gmPillOrderId"));
      intent.removeExtra("gmPill");
      promise.resolve(map);
    } catch (Throwable t) {
      promise.reject("E_PILL_LAUNCH", t);
    }
  }

  @ReactMethod
  public void stopAlert(String sessionId, Promise promise) {
    try {
      OrderAlertController.stop(getReactApplicationContext(), sessionId);
      promise.resolve(true);
    } catch (Throwable t) {
      promise.reject("E_ALERT_STOP", t);
    }
  }

  @ReactMethod
  public void getActiveAlert(Promise promise) {
    try {
      promise.resolve(toMap(OrderAlertController.getActive(getReactApplicationContext())));
    } catch (Throwable t) {
      promise.reject("E_ALERT_GET", t);
    }
  }

  @ReactMethod
  public void claimAlert(String sessionId, Promise promise) {
    try {
      promise.resolve(toMap(OrderAlertController.claim(getReactApplicationContext(), sessionId)));
    } catch (Throwable t) {
      promise.reject("E_ALERT_CLAIM", t);
    }
  }

  /** Stop buzzer on app open without retiring the pending order session. */
  @ReactMethod
  public void muteAlert(String sessionId, Promise promise) {
    try {
      promise.resolve(toMap(OrderAlertController.mute(getReactApplicationContext(), sessionId)));
    } catch (Throwable t) {
      promise.reject("E_ALERT_MUTE", t);
    }
  }

  @ReactMethod
  public void muteAllAlerts(Promise promise) {
    try {
      OrderAlertController.muteAll(getReactApplicationContext());
      promise.resolve(true);
    } catch (Throwable t) {
      promise.reject("E_ALERT_MUTE_ALL", t);
    }
  }

  @ReactMethod
  public void releaseAlert(String sessionId, Promise promise) {
    try {
      promise.resolve(toMap(OrderAlertController.release(getReactApplicationContext(), sessionId)));
    } catch (Throwable t) {
      promise.reject("E_ALERT_RELEASE", t);
    }
  }

  private static WritableMap toMap(JSONObject row) {
    if (row == null) return null;
    WritableMap map = Arguments.createMap();
    map.putString("sessionId", row.optString("sessionId", ""));
    map.putString("orderId", row.optString("orderId", ""));
    map.putString("offerId", row.optString("offerId", ""));
    map.putString("soundType", row.optString("soundType", ""));
    map.putString("owner", row.optString("owner", "native"));
    // active | muted | terminal — JS uses this for bg→in-app audio handoff.
    map.putString("alertState", row.optString("alertState", "active"));
    map.putDouble("startedAt", row.optLong("startedAt", 0L));
    String expiresAt = row.optString("expiresAt", "");
    if (expiresAt != null && expiresAt.length() > 0) {
      map.putString("expiresAt", expiresAt);
    }
    return map;
  }
}
