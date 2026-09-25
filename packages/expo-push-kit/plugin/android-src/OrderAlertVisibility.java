package {{PACKAGE}};

import android.app.Activity;
import android.app.ActivityManager;
import android.app.Application;
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
  private static boolean leftForegroundOnce;
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
        resumed++;
        MAIN.removeCallbacks(pendingShow);
        OrderAlertPill.setPartnerForeground(activity.getApplicationContext(), true);
      }
      @Override public void onActivityPaused(Activity activity) {
        if (!samePackage(activity)) return;
        leftForegroundOnce = true;
        resumed = Math.max(0, resumed - 1);
        if (resumed > 0) return;
        MAIN.removeCallbacks(pendingShow);
        final Context appCtx = activity.getApplicationContext();
        pendingShow = () -> {
          if (resumed == 0) OrderAlertPill.setPartnerForeground(appCtx, false);
        };
        MAIN.postDelayed(pendingShow, SHOW_DELAY_MS);
      }
      @Override public void onActivityStopped(Activity activity) {}
      @Override public void onActivitySaveInstanceState(Activity activity, Bundle outState) {}
      @Override public void onActivityDestroyed(Activity activity) {}
    });
  }

  /** True only before the user has sent Partner to the background. */
  static boolean shouldHideBecausePartnerIsOpen(Context context) {
    if (resumed > 0) return true;
    if (leftForegroundOnce) return false;
    return processLooksForeground(context);
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
