package {{PACKAGE}};

import android.app.Activity;
import android.app.ActivityManager;
import android.app.Application;
import android.app.KeyguardManager;
import android.content.Context;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;

/**
 * Shows the persistent pill only while GatiMitra Partner is not the foreground app.
 * A short delay avoids flicker when activities hand off inside the same app.
 *
 * Also remounts the incoming-order WindowManager card after background/unlock.
 * Without that remount, the small order-count pill can remain while the full
 * NEW ORDER card is missing — process importance often still reports FOREGROUND
 * briefly after onPause, which used to skip OrderAlertOverlay.show().
 */
public final class OrderAlertVisibility {
  private static final Handler MAIN = new Handler(Looper.getMainLooper());
  private static final long SHOW_DELAY_MS = 320L;
  private static int resumed;
  private static boolean registered;
  private static Runnable pendingShow;
  /**
   * Set after the pause delay when resumed==0. Lets remount trust the lifecycle
   * counter instead of a lagging ActivityManager.IMPORTANCE_FOREGROUND reading.
   */
  private static volatile boolean forcedBackground;

  private OrderAlertVisibility() {}

  static void register(Context context) {
    if (context == null || registered) return;
    Context app = context.getApplicationContext();
    if (!(app instanceof Application)) return;
    registered = true;
    ((Application) app).registerActivityLifecycleCallbacks(new Application.ActivityLifecycleCallbacks() {
      @Override public void onActivityCreated(Activity activity, Bundle savedInstanceState) {}
      @Override public void onActivityStarted(Activity activity) {}
      @Override public void onActivityResumed(Activity activity) {
        if (!samePackage(activity)) return;
        // Lock-screen FSI activity is not "Partner open" — keep its card + overlay.
        if (activity instanceof OrderAlertLockActivity) return;
        forcedBackground = false;
        resumed++;
        MAIN.removeCallbacks(pendingShow);
        Context appCtx = activity.getApplicationContext();
        OrderAlertPill.setPartnerForeground(appCtx, true);
        // Partner UI owns Accept/Reject while foreground — drop duplicate native card.
        OrderAlertOverlay.hideAll(appCtx);
      }
      @Override public void onActivityPaused(Activity activity) {
        if (!samePackage(activity)) return;
        if (activity instanceof OrderAlertLockActivity) {
          // Lock activity finishing (unlock / dismiss) must remount home card.
          MAIN.removeCallbacks(pendingShow);
          final Context appCtx = activity.getApplicationContext();
          pendingShow = () -> remountIncomingCardIfNeeded(appCtx);
          MAIN.postDelayed(pendingShow, SHOW_DELAY_MS);
          return;
        }
        resumed = Math.max(0, resumed - 1);
        if (resumed > 0) return;
        MAIN.removeCallbacks(pendingShow);
        final Context appCtx = activity.getApplicationContext();
        pendingShow = () -> {
          if (resumed != 0) return;
          forcedBackground = true;
          OrderAlertPill.setPartnerForeground(appCtx, false);
          remountIncomingCardIfNeeded(appCtx);
        };
        MAIN.postDelayed(pendingShow, SHOW_DELAY_MS);
      }
      @Override public void onActivityStopped(Activity activity) {}
      @Override public void onActivitySaveInstanceState(Activity activity, Bundle outState) {}
      @Override public void onActivityDestroyed(Activity activity) {}
    });
  }

  /**
   * After unlock or app background: release JS claim and mount the floating card
   * when an alert session is still active. Idempotent.
   */
  static void remountIncomingCardIfNeeded(Context context) {
    if (context == null) return;
    final Context appCtx = context.getApplicationContext();
    try {
      if (isDeviceLocked(appCtx)) {
        // Keep heads-up / FSI path; do not mount WM twin over the keyguard.
        OrderAlertHeadsUp.show(appCtx, "");
        return;
      }
      org.json.JSONObject active = OrderAlertController.getActive(appCtx);
      if (active == null) return;
      String sid = active.optString("sessionId", "");
      if (sid.length() == 0) return;
      if (OrderAlertOverlay.isCardDismissed(appCtx, sid)) return;
      // Accepted / rejected / stopped elsewhere: never redraw the card. The
      // audio guards already refuse to ring, so without this the merchant would
      // get a silent NEW ORDER card for an order that is already gone.
      if (OrderAlertController.isSessionDecided(appCtx, sid, active.optString("orderId", ""))) {
        return;
      }
      // App is not presenting — reclaim ownership before WM show.
      // Also re-arms FGS audio when the session was only locally muted by app-open
      // handoff (alertState=muted). Global terminal sessions stay retired.
      OrderAlertController.release(appCtx, sid);
      OrderAlertController.rearmAfterLocalMuteIfNeeded(appCtx, sid);
      forcedBackground = resumed == 0;
      org.json.JSONObject refreshed = OrderAlertController.getActive(appCtx);
      if (refreshed != null) {
        OrderAlertOverlay.show(appCtx, refreshed);
      } else {
        OrderAlertOverlay.show(appCtx, active);
      }
      OrderAlertHeadsUp.show(appCtx, sid);
      OrderAlertPill.apply(appCtx);
    } catch (Throwable ignored) {
    }
  }

  /**
   * True while this app's own UI is in front, so a native card would land on
   * top of the in-app sheet.
   *
   * The resumed counter is the fast path but it is not trustworthy on its own:
   * register() can run after an activity has already resumed (the lifecycle
   * callback for that resume is gone), leaving the counter at 0 while the app
   * is plainly visible. This used to fall back to the process check only until
   * the first time the app was backgrounded, after which the stale counter was
   * the sole signal — and a desynced 0 meant the overlay mounted over the
   * foreground app for the rest of the process's life. The process check now
   * always backs it up.
   *
   * IMPORTANCE_FOREGROUND is a visible activity. A process running only our
   * alert foreground service reports IMPORTANCE_FOREGROUND_SERVICE, a
   * different value, so the running buzzer cannot make a backgrounded app look
   * foreground and wrongly suppress the card.
   */
  static boolean shouldHideBecausePartnerIsOpen(Context context) {
    if (resumed > 0) {
      forcedBackground = false;
      return true;
    }
    // After a confirmed pause with no resumed activities, trust lifecycle over
    // a lagging process-importance reading so the home floating card remounts.
    if (forcedBackground) return false;
    return processLooksForeground(context);
  }

  /** Keyguard locked — LockActivity owns the floating card; skip WindowManager twin. */
  static boolean isDeviceLocked(Context context) {
    if (context == null) return false;
    try {
      KeyguardManager km = (KeyguardManager) context.getSystemService(Context.KEYGUARD_SERVICE);
      return km != null && km.isKeyguardLocked();
    } catch (Throwable t) {
      return false;
    }
  }

  /** True when the native floating WindowManager card must not be mounted. */
  static boolean shouldSuppressOverlayWindow(Context context) {
    return shouldHideBecausePartnerIsOpen(context) || isDeviceLocked(context);
  }

  /** Best-effort snapshot used when the service starts before a lifecycle callback. */
  static boolean processLooksForeground(Context context) {
    if (resumed > 0) return true;
    try {
      ActivityManager am = (ActivityManager) context.getSystemService(Context.ACTIVITY_SERVICE);
      if (am == null) return false;
      java.util.List<ActivityManager.RunningAppProcessInfo> procs = am.getRunningAppProcesses();
      if (procs == null) return false;
      String pkg = context.getPackageName();
      for (ActivityManager.RunningAppProcessInfo info : procs) {
        if (info != null
            && pkg.equals(info.processName)
            && info.importance == ActivityManager.RunningAppProcessInfo.IMPORTANCE_FOREGROUND) {
          return true;
        }
      }
    } catch (Throwable ignored) {
    }
    return false;
  }

  private static boolean samePackage(Activity activity) {
    return activity != null && activity.getPackageName().equals(activity.getApplicationContext().getPackageName());
  }
}
