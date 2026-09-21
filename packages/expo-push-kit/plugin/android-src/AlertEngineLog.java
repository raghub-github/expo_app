package {{PACKAGE}};

import android.content.Context;
import android.os.Process;
import android.util.Log;

/** Production-safe critical-alert engine logs. Never pass full FCM tokens. */
public final class AlertEngineLog {
  private static final String TAG = "ALERT_ENGINE";

  private AlertEngineLog() {}

  public static void log(
      Context context,
      String event,
      String sessionId,
      String orderId,
      String extra
  ) {
    String pkg = "?";
    try {
      if (context != null) pkg = context.getPackageName();
    } catch (Throwable ignored) {
    }
    StringBuilder sb = new StringBuilder(192);
    sb.append("[ALERT_ENGINE] ").append(event);
    sb.append(" package=").append(pkg);
    sb.append(" orderId=").append(safe(orderId));
    sb.append(" alertSessionId=").append(safe(sessionId));
    sb.append(" pid=").append(Process.myPid());
    sb.append(" ts=").append(System.currentTimeMillis());
    if (extra != null && extra.length() > 0) {
      sb.append(" ").append(extra);
    }
    Log.i(TAG, sb.toString());
  }

  private static String safe(String value) {
    return value == null || value.trim().length() == 0 ? "-" : value.trim();
  }
}
