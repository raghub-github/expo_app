package {{PACKAGE}};

import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.util.Log;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import org.json.JSONObject;

/**
 * Accept / Reject from the overlay, lock-screen activity, or notification action.
 * Accept is sent before the React tree mounts. Reject opens Partner so the
 * merchant can pick a required cancellation reason.
 */
public final class OrderAlertActions {
  private static final String TAG = "GmOrderAlertAction";
  private static final String PREFS = "gatimitra_order_alert_action_v1";
  private static final String KEY_PENDING = "pendingAction";

  private OrderAlertActions() {}

  public static void handle(Context context, String action, String sessionId) {
    if (context == null) return;
    String act = action == null ? "" : action.trim().toLowerCase();
    String sid = sessionId == null ? "" : sessionId.trim();
    if (!"accept".equals(act) && !"reject".equals(act)) return;
    if (!claim(context, sid, act)) {
      Log.i(TAG, "duplicate " + act + " session=" + sid);
      return;
    }
    JSONObject row = OrderAlertController.getActive(context);
    AlertEngineLog.log(context, "accept".equals(act) ? "ACCEPT_CLICKED" : "REJECT_CLICKED", sid, "", null);
    if ("accept".equals(act)) {
      postAccept(context, row);
    }
    stashPending(context, act, sid, row);
    try {
      if (sid.length() > 0) OrderAlertController.stop(context, sid);
      else OrderAlertController.stopAll(context);
    } catch (Throwable ignored) {
    }
    OrderAlertHeadsUp.cancel(context);
    launch(context, act, sid, row);
  }

  private static boolean claim(Context context, String sessionId, String action) {
    SharedPreferences prefs = context.getApplicationContext().getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    String key = "done:" + sessionId + ":" + action;
    long prev = prefs.getLong(key, 0L);
    long now = System.currentTimeMillis();
    if (prev > 0 && now - prev < 20000L) return false;
    prefs.edit().putLong(key, now).commit();
    return true;
  }

  private static void stashPending(Context context, String action, String sessionId, JSONObject row) {
    try {
      JSONObject pending = new JSONObject();
      pending.put("action", action);
      pending.put("sessionId", sessionId);
      pending.put("orderId", row != null ? row.optString("orderId", "") : "");
      pending.put("foodOrderId", row != null ? row.optString("foodOrderId", "") : "");
      pending.put("displayOrderId", row != null ? row.optString("displayOrderId", "") : "");
      pending.put("storeId", row != null ? row.optString("storeId", "") : "");
      pending.put("at", System.currentTimeMillis());
      context.getApplicationContext().getSharedPreferences(PREFS, Context.MODE_PRIVATE)
          .edit()
          .putString(KEY_PENDING, pending.toString())
          .commit();
    } catch (Throwable ignored) {
    }
  }

  static String consumePending(Context context) {
    if (context == null) return "";
    SharedPreferences prefs = context.getApplicationContext().getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    String raw = prefs.getString(KEY_PENDING, "");
    if (raw != null && raw.length() > 0) {
      prefs.edit().remove(KEY_PENDING).commit();
    }
    return raw == null ? "" : raw;
  }

  static void saveCredentials(Context context, String baseUrl, String token, String storeId) {
    if (context == null) return;
    SharedPreferences.Editor ed = context.getApplicationContext().getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit();
    if (baseUrl != null) ed.putString("baseUrl", baseUrl.trim());
    if (token != null) ed.putString("token", token.trim());
    if (storeId != null && storeId.trim().length() > 0) ed.putString("storeId", storeId.trim());
    ed.commit();
  }

  private static void postAccept(Context context, JSONObject row) {
    if (row == null) return;
    SharedPreferences prefs = context.getApplicationContext().getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    String base = prefs.getString("baseUrl", "");
    String token = prefs.getString("token", "");
    String storeId = row.optString("storeId", prefs.getString("storeId", ""));
    String foodId = row.optString("foodOrderId", "");
    if (foodId.length() == 0) foodId = digitsOnly(row.optString("orderId", ""));
    if (base == null || token == null || base.length() == 0 || token.length() == 0) return;
    if (storeId.length() == 0 || !foodId.matches("^\\d+$")) return;
    final String url = base.replaceAll("/+$", "")
        + "/v1/merchant-partner/stores/" + storeId
        + "/food-orders/" + foodId;
    final String bearer = token;
    Thread t = new Thread(() -> {
      HttpURLConnection conn = null;
      try {
        conn = (HttpURLConnection) new URL(url).openConnection();
        conn.setConnectTimeout(8000);
        conn.setReadTimeout(8000);
        conn.setRequestMethod("PATCH");
        conn.setDoOutput(true);
        conn.setRequestProperty("Content-Type", "application/json");
        conn.setRequestProperty("Authorization", bearer.startsWith("Bearer ") ? bearer : "Bearer " + bearer);
        byte[] body = "{\"status\":\"ACCEPTED\",\"action_source\":\"notification\",\"accept_mode\":\"manual\"}"
            .getBytes(StandardCharsets.UTF_8);
        OutputStream os = conn.getOutputStream();
        os.write(body);
        os.close();
        int code = conn.getResponseCode();
        AlertEngineLog.log(context, code >= 200 && code < 300 ? "ACCEPT_SENT" : "ACCEPT_FAILED", "", foodId, "http=" + code);
      } catch (Throwable err) {
        AlertEngineLog.log(context, "ACCEPT_FAILED", "", foodId, err.getMessage());
      } finally {
        if (conn != null) conn.disconnect();
      }
    }, "gm-order-accept");
    t.start();
  }

  private static void launch(Context context, String action, String sessionId, JSONObject row) {
    try {
      Intent launch = context.getPackageManager().getLaunchIntentForPackage(context.getPackageName());
      if (launch == null) return;
      launch.addFlags(
          Intent.FLAG_ACTIVITY_NEW_TASK
              | Intent.FLAG_ACTIVITY_SINGLE_TOP
              | Intent.FLAG_ACTIVITY_REORDER_TO_FRONT
      );
      launch.putExtra("gmOverlayAction", action);
      launch.putExtra("alertSessionId", sessionId);
      if (row != null) {
        launch.putExtra("orderId", row.optString("foodOrderId", row.optString("orderId", "")));
        launch.putExtra("displayOrderId", row.optString("displayOrderId", ""));
      }
      context.startActivity(launch);
    } catch (Throwable t) {
      Log.w(TAG, "launch failed " + t.getMessage());
    }
  }

  private static String digitsOnly(String raw) {
    if (raw == null) return "";
    String v = raw.trim();
    return v.matches("^\\d+$") ? v : "";
  }
}
