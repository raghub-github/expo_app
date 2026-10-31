package {{PACKAGE}};

import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.util.Log;
import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import org.json.JSONObject;

/**
 * Accept / Reject from the overlay, lock-screen activity, or notification action.
 * Accept is sent before the React tree mounts. Reject opens the app so the user
 * can pick a required reason.
 *
 * The accept endpoint differs per app, so it is chosen by build role rather than
 * inferred from the payload. Inferring it is what made a rider accept a silent
 * no-op: the merchant branch bailed on the missing storeId, yet the buzzer still
 * stopped and the card still closed, so the rider was shown a successful accept
 * for an order nobody had accepted.
 */
public final class OrderAlertActions {
  private static final String TAG = "GmOrderAlertAction";
  private static final String PREFS = "gatimitra_order_alert_action_v1";
  private static final String KEY_PENDING = "pendingAction";
  private static final String APP_ROLE = "{{ROLE}}";

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
    // Stash first: the HTTP call below merges its outcome into this row, so an app
    // that cold-starts mid-flight reads "pending" instead of a false success.
    stashPending(context, act, sid, row);
    if ("accept".equals(act)) {
      postAccept(context, sid, row);
    }
    try {
      // Stop by session AND order id so JS/native format mismatches cannot leave the buzzer running.
      if (sid.length() > 0) OrderAlertController.stop(context, sid);
      String orderToken = row != null ? row.optString("foodOrderId", "") : "";
      if (orderToken.length() == 0 && row != null) orderToken = row.optString("orderId", "");
      if (orderToken.length() > 0) OrderAlertController.stop(context, orderToken);
      if (sid.length() == 0 && orderToken.length() == 0) OrderAlertController.stopAll(context);
    } catch (Throwable ignored) {
    }
    OrderAlertHeadsUp.cancel(context);
    OrderAlertLockActivity.finishLive();
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
      pending.put("offerId", row != null ? row.optString("offerId", "") : "");
      pending.put("foodOrderId", row != null ? row.optString("foodOrderId", "") : "");
      pending.put("displayOrderId", row != null ? row.optString("displayOrderId", "") : "");
      pending.put("storeId", row != null ? row.optString("storeId", "") : "");
      // Reject never posts from native — the app collects a reason first.
      pending.put("result", "accept".equals(action) ? "pending" : "ok");
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

  private static void postAccept(Context context, String sessionId, JSONObject row) {
    if (row == null) return;
    SharedPreferences prefs = context.getApplicationContext().getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    final String bearerToken = prefs.getString("token", "");
    OrderAlertAcceptPlan plan = OrderAlertAcceptPlan.build(
        APP_ROLE,
        prefs.getString("baseUrl", ""),
        bearerToken,
        sessionId,
        row.optString("orderId", ""),
        row.optString("offerId", ""),
        row.optString("storeId", prefs.getString("storeId", "")),
        row.optString("foodOrderId", "")
    );
    if (!plan.isSendable()) {
      // Never drop the tap silently — the card has already closed by now, which
      // on its own looks exactly like a successful accept.
      recordResult(context, "failed", 0, plan.reason);
      AlertEngineLog.log(context, "ACCEPT_FAILED", sessionId, plan.orderToken, plan.reason);
      return;
    }

    final String url = plan.url;
    final String method = plan.method;
    final String payload = plan.body;
    final String orderToken = plan.orderToken;
    final String idempotencyKey = plan.idempotencyKey;
    final String bearer =
        bearerToken.startsWith("Bearer ") ? bearerToken : "Bearer " + bearerToken;
    final Context appContext = context.getApplicationContext();
    Thread t = new Thread(() -> {
      HttpURLConnection conn = null;
      try {
        conn = (HttpURLConnection) new URL(url).openConnection();
        conn.setConnectTimeout(8000);
        conn.setReadTimeout(12000);
        conn.setRequestMethod(method);
        conn.setDoOutput(true);
        conn.setRequestProperty("Content-Type", "application/json");
        conn.setRequestProperty("Authorization", bearer);
        conn.setRequestProperty("x-idempotency-key", idempotencyKey);
        OutputStream os = conn.getOutputStream();
        os.write(payload.getBytes(StandardCharsets.UTF_8));
        os.close();
        int code = conn.getResponseCode();
        boolean ok = code >= 200 && code < 300;
        recordResult(appContext, ok ? "ok" : "failed", code, ok ? "" : readError(conn));
        AlertEngineLog.log(
            appContext, ok ? "ACCEPT_SENT" : "ACCEPT_FAILED", sessionId, orderToken, "http=" + code);
      } catch (Throwable err) {
        recordResult(appContext, "failed", 0, "network");
        AlertEngineLog.log(appContext, "ACCEPT_FAILED", sessionId, orderToken, err.getMessage());
      } finally {
        if (conn != null) conn.disconnect();
      }
    }, "gm-order-accept");
    t.start();
  }

  /** Merge the HTTP outcome into the stash the app reads on its next launch. */
  private static void recordResult(Context context, String result, int httpStatus, String detail) {
    try {
      SharedPreferences prefs =
          context.getApplicationContext().getSharedPreferences(PREFS, Context.MODE_PRIVATE);
      String raw = prefs.getString(KEY_PENDING, "");
      if (raw == null || raw.length() == 0) return;
      JSONObject pending = new JSONObject(raw);
      pending.put("result", result);
      pending.put("httpStatus", httpStatus);
      if (detail != null && detail.length() > 0) pending.put("detail", detail);
      prefs.edit().putString(KEY_PENDING, pending.toString()).commit();
    } catch (Throwable ignored) {
    }
  }

  /** Server's `error` field, so the app can say *why* an accept was refused. */
  private static String readError(HttpURLConnection conn) {
    try {
      InputStream in = conn.getErrorStream();
      if (in == null) return "";
      ByteArrayOutputStream buf = new ByteArrayOutputStream();
      byte[] chunk = new byte[1024];
      int n;
      int total = 0;
      while ((n = in.read(chunk)) > 0 && total < 4096) {
        buf.write(chunk, 0, n);
        total += n;
      }
      in.close();
      return new JSONObject(new String(buf.toByteArray(), StandardCharsets.UTF_8))
          .optString("error", "");
    } catch (Throwable ignored) {
      return "";
    }
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
