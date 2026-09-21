package {{PACKAGE}};

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
