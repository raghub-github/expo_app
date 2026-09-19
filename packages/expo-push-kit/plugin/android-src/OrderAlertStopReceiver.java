package {{PACKAGE}};

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

/** Notification action / explicit stop. Never crashes. */
public class OrderAlertStopReceiver extends BroadcastReceiver {
  @Override
  public void onReceive(Context context, Intent intent) {
    if (context == null) return;
    String sessionId = intent != null ? intent.getStringExtra(OrderAlertController.EXTRA_SESSION_ID) : null;
    try {
      if (sessionId == null || sessionId.trim().length() == 0) {
        OrderAlertController.stopAll(context);
      } else {
        OrderAlertController.stop(context, sessionId);
      }
    } catch (Throwable ignored) {
    }
  }
}
