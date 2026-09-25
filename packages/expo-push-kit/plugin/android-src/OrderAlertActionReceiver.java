package {{PACKAGE}};

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

/** Notification shade / lock-screen Accept and Reject. */
public class OrderAlertActionReceiver extends BroadcastReceiver {
  @Override
  public void onReceive(Context context, Intent intent) {
    if (context == null || intent == null) return;
    String action = intent.getAction();
    String sessionId = intent.getStringExtra(OrderAlertController.EXTRA_SESSION_ID);
    if (OrderAlertHeadsUp.ACTION_ACCEPT.equals(action)) {
      OrderAlertActions.handle(context, "accept", sessionId);
      return;
    }
    if (OrderAlertHeadsUp.ACTION_REJECT.equals(action)) {
      OrderAlertActions.handle(context, "reject", sessionId);
    }
  }
}
