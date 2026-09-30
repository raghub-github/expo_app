package {{PACKAGE}};

import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.graphics.Color;
import android.graphics.PixelFormat;
import android.graphics.Typeface;
import android.graphics.drawable.GradientDrawable;
import android.os.Build;
import android.os.Handler;
import android.os.Looper;
import android.view.Gravity;
import android.view.MotionEvent;
import android.view.View;
import android.view.WindowManager;
import android.widget.FrameLayout;
import android.widget.TextView;

/**
 * One compact persistent "Orders N" window. Hidden while Partner is foreground.
 * Count 0 still shows the pill. Drag is device-local. A drag to the top edge
 * hides the view only; it does not turn off push or the Appear-on-top setting.
 */
public final class OrderAlertPill {
  static final String PREFS = "gatimitra_order_pill_v1";
  static final String KEY_ENABLED = "enabled";
  static final String KEY_COUNT = "count";
  static final String KEY_ORDER_ID = "orderId";
  static final String KEY_DISMISSED = "dismissed";
  static final String KEY_X = "x";
  static final String KEY_Y = "y";
  static final String KEY_POS = "hasPos";
  public static final String ACTION_PILL = "{{PACKAGE}}.ORDER_PILL_HOLD";

  private static final Object LOCK = new Object();
  private static final Handler MAIN = new Handler(Looper.getMainLooper());
  private static FrameLayout view;
  private static TextView badge;
  private static WindowManager wm;
  private static WindowManager.LayoutParams params;
  private static boolean partnerForeground;
  private static boolean pendingAttention;
  private static GradientDrawable pillBackground;

  private OrderAlertPill() {}

  static boolean isEnabled(Context context) {
    if (context == null) return false;
    return prefs(context).getBoolean(KEY_ENABLED, false);
  }

  static int count(Context context) {
    if (context == null) return 0;
    return Math.max(0, prefs(context).getInt(KEY_COUNT, 0));
  }

  static String orderId(Context context) {
    if (context == null) return "";
    return prefs(context).getString(KEY_ORDER_ID, "");
  }

  static void setState(Context context, boolean enabled, int count, String orderId) {
    if (context == null) return;
    SharedPreferences p = prefs(context);
    int prev = Math.max(0, p.getInt(KEY_COUNT, 0));
    boolean wasEnabled = p.getBoolean(KEY_ENABLED, false);
    int n = Math.max(0, count);
    SharedPreferences.Editor ed = p.edit()
        .putBoolean(KEY_ENABLED, enabled)
        .putInt(KEY_COUNT, n)
        .putString(KEY_ORDER_ID, orderId == null ? "" : orderId);
    if (!enabled) {
      ed.putBoolean(KEY_DISMISSED, false).commit();
      hide(context);
      return;
    }
    if ((!wasEnabled) || n > prev) ed.putBoolean(KEY_DISMISSED, false);
    ed.commit();
    apply(context);
  }

  /** One shake and one count step per new alert session. Repeat FCM does not call this. */
  static void onNewOrder(Context context, String sessionId) {
    if (context == null || sessionId == null || sessionId.length() == 0) return;
    if (!markOnce(context, "seen_new", sessionId)) return;
    SharedPreferences p = prefs(context);
    int next = Math.max(0, p.getInt(KEY_COUNT, 0)) + 1;
    SharedPreferences.Editor ed = p.edit().putInt(KEY_COUNT, next);
    if (OrderAlertOverlay.canDraw(context)) {
      ed.putBoolean(KEY_ENABLED, true).putBoolean(KEY_DISMISSED, false);
    }
    ed.commit();
    pendingAttention = true;
    apply(context);
    MAIN.postDelayed(() -> pendingAttention = false, 1500L);
  }

  /** One decrement per closed session. The pill stays up at zero. */
  static void onOrderClosed(Context context, String sessionId) {
    if (context == null || sessionId == null || sessionId.length() == 0) return;
    if (!isEnabled(context)) return;
    if (!markOnce(context, "seen_closed", sessionId)) return;
    SharedPreferences p = prefs(context);
    int next = Math.max(0, p.getInt(KEY_COUNT, 0) - 1);
    p.edit().putInt(KEY_COUNT, next).commit();
    apply(context);
  }

  static void setPartnerForeground(Context context, boolean foreground) {
    partnerForeground = foreground;
    apply(context);
  }

  /** Idempotent. Safe to call on every resume, permission grant, and service start. */
  static void apply(Context context) {
    if (context == null) return;
    if (!isEnabled(context) || !OrderAlertOverlay.canDraw(context) || isDismissed(context) || partnerForeground) {
      hide(context);
      return;
    }
    show(context, count(context));
  }

  static void show(final Context context, final int count) {
    if (context == null) return;
    Runnable task = () -> showOnMain(context.getApplicationContext(), Math.max(0, count));
    if (Looper.myLooper() == Looper.getMainLooper()) task.run();
    else MAIN.post(task);
  }

  static void hide(final Context context) {
    Runnable task = () -> {
      synchronized (LOCK) {
        removeLocked();
      }
    };
    if (Looper.myLooper() == Looper.getMainLooper()) task.run();
    else MAIN.post(task);
  }

  private static void showOnMain(Context context, int count) {
    synchronized (LOCK) {
      if (partnerForeground || isDismissed(context) || !OrderAlertOverlay.canDraw(context)) {
        removeLocked();
        return;
      }
      if (view != null && params != null && wm != null) {
        bindBadge(count);
        if (pendingAttention) {
          pendingAttention = false;
          playAttention(context);
        }
        return;
      }
      WindowManager windowManager;
      try {
        windowManager = (WindowManager) context.getSystemService(Context.WINDOW_SERVICE);
      } catch (Throwable t) {
        return;
      }
      if (windowManager == null) return;

      int size = dp(context, 62);
      int box = dp(context, 64);
      FrameLayout root = new FrameLayout(context);
      FrameLayout circle = new FrameLayout(context);
      GradientDrawable bg = normalBackground(context);
      pillBackground = bg;
      circle.setBackground(bg);
      if (Build.VERSION.SDK_INT >= 21) circle.setElevation(dp(context, 6));
      FrameLayout.LayoutParams circleLp = new FrameLayout.LayoutParams(size, size, Gravity.CENTER);
      root.addView(circle, circleLp);

      TextView brand = new TextView(context);
      brand.setText("GatiMitra");
      brand.setTextColor(Color.WHITE);
      brand.setTextSize(11);
      brand.setMaxLines(1);
      brand.setSingleLine(true);
      brand.setLetterSpacing(0.04f);
      brand.setGravity(Gravity.CENTER);
      brand.setTypeface(Typeface.DEFAULT_BOLD);
      brand.setPadding(dp(context, 4), 0, dp(context, 4), 0);
      circle.addView(brand, new FrameLayout.LayoutParams(
          FrameLayout.LayoutParams.MATCH_PARENT,
          FrameLayout.LayoutParams.MATCH_PARENT,
          Gravity.CENTER
      ));

      TextView mark = new TextView(context);
      mark.setTextColor(Color.WHITE);
      mark.setTextSize(10);
      mark.setTypeface(Typeface.DEFAULT_BOLD);
      mark.setGravity(Gravity.CENTER);
      GradientDrawable badgeBg = new GradientDrawable();
      badgeBg.setShape(GradientDrawable.OVAL);
      badgeBg.setColor(Color.parseColor("#E11D48"));
      badgeBg.setStroke(dp(context, 1), Color.WHITE);
      mark.setBackground(badgeBg);
      int badgeSize = dp(context, 18);
      FrameLayout.LayoutParams badgeLp = new FrameLayout.LayoutParams(badgeSize, badgeSize, Gravity.TOP | Gravity.END);
      root.addView(mark, badgeLp);
      badge = mark;
      bindBadge(count);

      WindowManager.LayoutParams lp = new WindowManager.LayoutParams(
          box,
          box,
          WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY,
          WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE
              | WindowManager.LayoutParams.FLAG_LAYOUT_IN_SCREEN,
          PixelFormat.TRANSLUCENT
      );
      lp.gravity = Gravity.TOP | Gravity.START;
      int screenW = context.getResources().getDisplayMetrics().widthPixels;
      int screenH = context.getResources().getDisplayMetrics().heightPixels;
      SharedPreferences p = prefs(context);
      if (p.getBoolean(KEY_POS, false)) {
        lp.x = p.getInt(KEY_X, dp(context, 16));
        lp.y = p.getInt(KEY_Y, screenH - dp(context, 160));
      } else {
        lp.x = Math.max(0, screenW - dp(context, 74));
        lp.y = Math.max(0, (int) (screenH * 0.46f));
      }
      root.setOnTouchListener((v, event) -> onDrag(context, root, lp, screenW, screenH, event));
      try {
        windowManager.addView(root, lp);
        view = root;
        wm = windowManager;
        params = lp;
        if (pendingAttention) {
          pendingAttention = false;
          playAttention(context);
        }
      } catch (Throwable ignored) {
        view = null;
        badge = null;
        wm = null;
        params = null;
      }
    }
  }

  private static void bindBadge(int count) {
    if (badge == null) return;
    int n = Math.max(0, count);
    if (n <= 0) {
      badge.setVisibility(View.GONE);
      return;
    }
    badge.setVisibility(View.VISIBLE);
    badge.setText(n > 9 ? "9+" : String.valueOf(n));
  }

  private static boolean onDrag(
      Context context,
      FrameLayout pill,
      WindowManager.LayoutParams lp,
      int screenW,
      int screenH,
      MotionEvent event
  ) {
    switch (event.getActionMasked()) {
      case MotionEvent.ACTION_DOWN:
        pill.setTag(Rtag.start(event, lp));
        return true;
      case MotionEvent.ACTION_MOVE: {
        float[] start = (float[]) pill.getTag();
        if (start == null) return true;
        int nx = (int) (start[2] + (event.getRawX() - start[0]));
        int ny = (int) (start[3] + (event.getRawY() - start[1]));
        int maxX = Math.max(0, screenW - pill.getWidth());
        int maxY = Math.max(0, screenH - pill.getHeight());
        lp.x = Math.max(0, Math.min(maxX, nx));
        lp.y = Math.max(0, Math.min(maxY, ny));
        if (Math.abs(event.getRawX() - start[0]) + Math.abs(event.getRawY() - start[1]) > dp(context, 8)) {
          start[4] = 1f;
        }
        try {
          if (wm != null) wm.updateViewLayout(pill, lp);
        } catch (Throwable ignored) {
        }
        return true;
      }
      case MotionEvent.ACTION_UP:
      case MotionEvent.ACTION_CANCEL: {
        float[] start = (float[]) pill.getTag();
        boolean moved = start != null && start[4] > 0f;
        if (!moved) {
          openApp(context);
          return true;
        }
        prefs(context).edit().putBoolean(KEY_POS, true).putInt(KEY_X, lp.x).putInt(KEY_Y, lp.y).commit();
        if (event.getRawY() < screenH * 0.12f) {
          prefs(context).edit().putBoolean(KEY_DISMISSED, true).commit();
          hide(context);
        }
        return true;
      }
      default:
        return false;
    }
  }

  private static void removeLocked() {
    try {
      if (wm != null && view != null && view.getParent() != null) wm.removeView(view);
    } catch (Throwable ignored) {
    }
    view = null;
    badge = null;
    wm = null;
    params = null;
  }

  private static void openApp(Context context) {
    try {
      Intent launch = context.getPackageManager().getLaunchIntentForPackage(context.getPackageName());
      if (launch == null) return;
      launch.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_REORDER_TO_FRONT);
      launch.putExtra("gmPill", "orders");
      launch.putExtra("gmPillCount", count(context));
      launch.putExtra("gmPillOrderId", orderId(context));
      context.startActivity(launch);
    } catch (Throwable ignored) {
    }
  }

  private static boolean isDismissed(Context context) {
    return prefs(context).getBoolean(KEY_DISMISSED, false);
  }

  private static GradientDrawable normalBackground(Context context) {
    GradientDrawable bg = new GradientDrawable();
    bg.setShape(GradientDrawable.OVAL);
    bg.setColor(Color.parseColor("#0F766E"));
    return bg;
  }

  private static void playAttention(Context context) {
    if (view == null) return;
    if (pillBackground != null) {
      pillBackground.setStroke(dp(context, 2), Color.parseColor("#22C55E"));
      view.setBackground(pillBackground);
    }
    shake(0);
    MAIN.postDelayed(() -> {
      if (pillBackground != null) pillBackground.setStroke(0, Color.TRANSPARENT);
      if (view != null) view.setTranslationX(0f);
    }, 1000L);
  }

  private static void shake(int step) {
    if (view == null) return;
    if (step >= 8) {
      view.setTranslationX(0f);
      return;
    }
    float delta = (step % 2 == 0 ? 14f : -14f) * view.getResources().getDisplayMetrics().density;
    view.setTranslationX(delta);
    MAIN.postDelayed(() -> shake(step + 1), 90L);
  }

  private static boolean markOnce(Context context, String bucket, String id) {
    SharedPreferences p = prefs(context);
    String key = "ids_" + bucket;
    String raw = p.getString(key, "");
    String token = "|" + id + "|";
    if (raw.contains(token)) return false;
    String next = raw + token;
    if (next.length() > 4000) next = next.substring(next.length() - 4000);
    p.edit().putString(key, next).commit();
    return true;
  }

  private static SharedPreferences prefs(Context context) {
    return context.getApplicationContext().getSharedPreferences(PREFS, Context.MODE_PRIVATE);
  }

  private static int dp(Context context, int value) {
    return Math.round(value * context.getResources().getDisplayMetrics().density);
  }

  /** Avoid android.R collisions; a tiny holder for the gesture origin. */
  private static final class Rtag {
    static float[] start(MotionEvent event, WindowManager.LayoutParams lp) {
      return new float[] { event.getRawX(), event.getRawY(), lp.x, lp.y, 0f };
    }
  }
}
