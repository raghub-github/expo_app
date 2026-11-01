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
 */
public final class OrderAlertVisibility {
  private static final Handler MAIN = new Handler(Looper.getMainLooper());
  private static final long SHOW_DELAY_MS = 320L;
  private static int resumed;
  private static boolean registered;
  private static Runnable pendingShow;

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
        resumed++;
        MAIN.removeCallbacks(pendingShow);
        Context appCtx = activity.getApplicationContext();
        OrderAlertPill.setPartnerForeground(appCtx, true);
        // Partner UI owns Accept/Reject while foreground — drop duplicate native card.
        OrderAlertOverlay.hideAll(appCtx);
      }
      @Override public void onActivityPaused(Activity activity) {
        if (!samePackage(activity)) return;
        if (activity instanceof OrderAlertLockActivity) return;
        resumed = Math.max(0, resumed - 1);
        if (resumed > 0) return;
        MAIN.removeCallbacks(pendingShow);
        final Context appCtx = activity.getApplicationContext();
        pendingShow = () -> {
          if (resumed != 0) return;
          OrderAlertPill.setPartnerForeground(appCtx, false);
          // Re-show home-screen overlay only when unlocked + session still active.
          try {
            if (isDeviceLocked(appCtx)) return;
            org.json.JSONObject active = OrderAlertController.getActive(appCtx);
            if (active == null) return;
            String sid = active.optString("sessionId", "");
            if (OrderAlertOverlay.isCardDismissed(appCtx, sid)) return;
            // The app is gone from the screen, so whatever it claimed it can no
            // longer present. Take the card back before showing it, or the
            // js_attached gate in show() would keep the rider with nothing.
            OrderAlertController.release(appCtx, sid);
          } catch (Throwable ignored) {
          }
        };
        MAIN.postDelayed(pendingShow, SHOW_DELAY_MS);
      }
      @Override public void onActivityStopped(Activity activity) {}
      @Override public void onActivitySaveInstanceState(Activity activity, Bundle outState) {}
      @Override public void onActivityDestroyed(Activity activity) {}
    });
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
    if (resumed > 0) return true;
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
