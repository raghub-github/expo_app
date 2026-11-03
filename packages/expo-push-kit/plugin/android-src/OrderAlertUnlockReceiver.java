package {{PACKAGE}};

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

/**
 * Remounts the home-screen incoming-order card after the user unlocks.
 *
 * While the keyguard is up, presentation is LOCK_SCREEN (FSI / HeadsUp) and the
 * WindowManager card is suppressed. Unlocking does not always resume a Partner
 * activity, so without this receiver the small order-count pill can remain alone.
 */
public class OrderAlertUnlockReceiver extends BroadcastReceiver {
  @Override
  public void onReceive(Context context, Intent intent) {
    if (context == null || intent == null) return;
    String action = intent.getAction();
    if (action == null) return;
    if (!Intent.ACTION_USER_PRESENT.equals(action)
        && !Intent.ACTION_SCREEN_ON.equals(action)) {
      return;
    }
    try {
      OrderAlertVisibility.register(context.getApplicationContext());
      // Slight delay so KeyguardManager.isKeyguardLocked() flips after USER_PRESENT.
      new android.os.Handler(android.os.Looper.getMainLooper()).postDelayed(
          () -> OrderAlertVisibility.remountIncomingCardIfNeeded(context.getApplicationContext()),
          400L
      );
    } catch (Throwable ignored) {
    }
  }
}
