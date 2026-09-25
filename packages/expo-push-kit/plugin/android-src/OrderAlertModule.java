package {{PACKAGE}};

import android.os.Build;
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
      OrderAlertPill.setState(ctx, enabled, count, orderId);
      if (enabled && OrderAlertOverlay.canDraw(ctx)) {
        Intent intent = new Intent(ctx, OrderAlertForegroundService.class);
        intent.setAction(OrderAlertPill.ACTION_PILL);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
          ctx.startForegroundService(intent);
        } else {
          ctx.startService(intent);
        }
      }
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
    map.putDouble("startedAt", row.optLong("startedAt", 0L));
    return map;
  }
}
