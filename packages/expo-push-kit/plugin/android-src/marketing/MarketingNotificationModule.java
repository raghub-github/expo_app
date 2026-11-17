package {{PACKAGE}};

import androidx.annotation.NonNull;
import com.facebook.react.bridge.Promise;
import com.facebook.react.bridge.ReactApplicationContext;
import com.facebook.react.bridge.ReactContextBaseJavaModule;
import com.facebook.react.bridge.ReactMethod;
import com.facebook.react.bridge.ReadableMap;
import com.facebook.react.bridge.ReadableMapKeySetIterator;
import com.facebook.react.bridge.ReadableType;
import java.util.HashMap;
import java.util.Map;

/** JS bridge so foreground campaign trays can use live Chronometer RemoteViews. */
public class MarketingNotificationModule extends ReactContextBaseJavaModule {
  public MarketingNotificationModule(ReactApplicationContext context) {
    super(context);
  }

  @NonNull
  @Override
  public String getName() {
    return "GatimitraMarketingNotification";
  }

  @ReactMethod
  public void show(ReadableMap data, Promise promise) {
    try {
      Map<String, String> flat = flatten(data);
      if (!MarketingNotificationRenderer.shouldHandle(flat)) {
        // Force countdown layout when remaining/ends_at present so Chronometer still binds.
        if (flat.containsKey("ends_at")
            || flat.containsKey("endsAt")
            || flat.containsKey("remaining_ms")
            || "true".equalsIgnoreCase(String.valueOf(flat.get("countdown_enabled")))) {
          flat.put("layout_style", "countdown");
          flat.put("gm_marketing_layout", "1");
        }
      }
      boolean ok = MarketingNotificationRenderer.handleRemoteMessage(getReactApplicationContext(), flat);
      promise.resolve(ok);
    } catch (Throwable t) {
      promise.reject("E_MARKETING_SHOW", t);
    }
  }

  @ReactMethod
  public void isAvailable(Promise promise) {
    promise.resolve(true);
  }

  private static Map<String, String> flatten(ReadableMap map) {
    Map<String, String> out = new HashMap<>();
    if (map == null) return out;
    ReadableMapKeySetIterator it = map.keySetIterator();
    while (it.hasNextKey()) {
      String key = it.nextKey();
      ReadableType type = map.getType(key);
      if (type == ReadableType.Null) continue;
      if (type == ReadableType.String) {
        out.put(key, map.getString(key));
      } else if (type == ReadableType.Boolean) {
        out.put(key, map.getBoolean(key) ? "true" : "false");
      } else if (type == ReadableType.Number) {
        double n = map.getDouble(key);
        if (n == Math.rint(n)) out.put(key, String.valueOf((long) n));
        else out.put(key, String.valueOf(n));
      } else if (type == ReadableType.Map || type == ReadableType.Array) {
        // category_chips already stringified on the wire; ignore nested objects
      }
    }
    return out;
  }
}
