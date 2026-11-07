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
 * Count 0 still shows the pill. Drag is device-local. Dragging onto the
 * bottom-center dismiss target hides the view only for this process session;
 * it does not turn off push, the Appear-on-top setting, or the saved preference.
 * A fresh app process clears sessionDismissed automatically (static field).
 */
public final class OrderAlertPill {
  static final String PREFS = "gatimitra_order_pill_v1";
  static final String KEY_ENABLED = "enabled";
  static final String KEY_COUNT = "count";
  static final String KEY_ORDER_ID = "orderId";
  /** Legacy permanent dismiss flag — no longer read; stripped on write. */
  static final String KEY_DISMISSED_LEGACY = "dismissed";
  static final String KEY_X = "x";
  static final String KEY_Y = "y";
  static final String KEY_POS = "hasPos";
  public static final String ACTION_PILL = "{{PACKAGE}}.ORDER_PILL_HOLD";

  /**
   * App-specific pill fill (templated at prebuild via {{ROLE}}).
   * Rider keeps the original mint/teal; Merchant keeps premium dark-black.
   */
  private static final String APP_ROLE = "{{ROLE}}";
  private static final String PILL_FILL =
      "rider".equals(APP_ROLE) ? "#0F766E" : "#111111";
  /** Attention ring while shaking — rider mint accent; merchant white on black. */
  private static final String ATTENTION_STROKE =
      "rider".equals(APP_ROLE) ? "#22C55E" : "#FFFFFF";
  private static final String DISMISS_IDLE = "#B91C1C";
  private static final String DISMISS_HOT = "#DC2626";

  private static final Object LOCK = new Object();
  private static final Handler MAIN = new Handler(Looper.getMainLooper());
  private static FrameLayout view;
  private static TextView badge;
  private static WindowManager wm;
  private static WindowManager.LayoutParams params;
  private static FrameLayout dismissView;
  private static WindowManager.LayoutParams dismissParams;
  private static GradientDrawable dismissBackground;
  private static TextView dismissIcon;
  private static boolean partnerForeground;
  private static boolean pendingAttention;
  private static GradientDrawable pillBackground;
  /**
   * Process-scoped only. Survives Activity recreation and screen navigation.
   * Resets when the app process is killed / restarted.
   */
  private static volatile boolean sessionDismissed;

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
    boolean wasEnabled = p.getBoolean(KEY_ENABLED, false);
    int n = Math.max(0, count);
    SharedPreferences.Editor ed = p.edit()
        .putBoolean(KEY_ENABLED, enabled)
        .putInt(KEY_COUNT, n)
        .putString(KEY_ORDER_ID, orderId == null ? "" : orderId)
        .remove(KEY_DISMISSED_LEGACY);
    if (!enabled) {
      // Preference off → hide now; clear session dismiss so a later enable shows immediately.
      sessionDismissed = false;
      ed.commit();
      hide(context);
      return;
    }
    // Only a fresh preference enable clears a prior session dismiss — not count bumps / FCM.
    if (!wasEnabled) sessionDismissed = false;
    ed.commit();
    apply(context);
  }

  /**
   * One shake and one count step per new alert session. Repeat FCM does not call this.
   * Never force-enables the pill against the saved JS preference (KEY_ENABLED).
   * Never clears session dismiss — realtime must not resurrect a dismissed circle.
   */
  static void onNewOrder(Context context, String sessionId) {
    if (context == null || sessionId == null || sessionId.length() == 0) return;
    if (!markOnce(context, "seen_new", sessionId)) return;
    SharedPreferences p = prefs(context);
    int next = Math.max(0, p.getInt(KEY_COUNT, 0)) + 1;
    p.edit().putInt(KEY_COUNT, next).remove(KEY_DISMISSED_LEGACY).commit();
    if (isEnabled(context)) pendingAttention = true;
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
        hideDismissLocked();
        removeLocked();
      }
    };
    if (Looper.myLooper() == Looper.getMainLooper()) task.run();
    else MAIN.post(task);
  }

  private static void showOnMain(Context context, int count) {
    synchronized (LOCK) {
      if (partnerForeground || isDismissed(context) || !OrderAlertOverlay.canDraw(context)) {
        hideDismissLocked();
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
      // Guarantee a single WindowManager surface — never stack duplicate pills.
      hideDismissLocked();
      removeLocked();

      WindowManager windowManager;
      try {
        windowManager = (WindowManager) context.getSystemService(Context.WINDOW_SERVICE);
      } catch (Throwable t) {
        return;
      }
      if (windowManager == null) return;

      int size = dp(context, 62);
      // Extra padding so the circle + badge are never clipped by the window edge.
      int inset = dp(context, 10);
      int box = size + inset * 2;
      FrameLayout root = new FrameLayout(context);
      root.setClipChildren(false);
      root.setClipToPadding(false);
      root.setPadding(inset, inset, inset, inset);
      FrameLayout circle = new FrameLayout(context);
      GradientDrawable bg = normalBackground(context);
      pillBackground = bg;
      circle.setBackground(bg);
      if (Build.VERSION.SDK_INT >= 21) circle.setElevation(dp(context, 4));
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
      // Badge must sit above the elevated circle (Android draws by elevation).
      if (Build.VERSION.SDK_INT >= 21) mark.setElevation(dp(context, 12));
      if (Build.VERSION.SDK_INT >= 21) mark.setTranslationZ(dp(context, 12));
      int badgeSize = dp(context, 18);
      FrameLayout.LayoutParams badgeLp = new FrameLayout.LayoutParams(badgeSize, badgeSize, Gravity.TOP | Gravity.END);
      badgeLp.topMargin = dp(context, 2);
      badgeLp.rightMargin = dp(context, 2);
      root.addView(mark, badgeLp);
      mark.bringToFront();
      badge = mark;
      bindBadge(count);

      WindowManager.LayoutParams lp = new WindowManager.LayoutParams(
          box,
          box,
          WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY,
          WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE
              | WindowManager.LayoutParams.FLAG_LAYOUT_IN_SCREEN
              | WindowManager.LayoutParams.FLAG_LAYOUT_NO_LIMITS,
          PixelFormat.TRANSLUCENT
      );
      lp.gravity = Gravity.TOP | Gravity.START;
      int screenW = context.getResources().getDisplayMetrics().widthPixels;
      int screenH = context.getResources().getDisplayMetrics().heightPixels;
      int edge = dp(context, 12);
      SharedPreferences p = prefs(context);
      if (p.getBoolean(KEY_POS, false)) {
        lp.x = clamp(p.getInt(KEY_X, edge), 0, Math.max(0, screenW - box - edge));
        lp.y = clamp(p.getInt(KEY_Y, screenH - dp(context, 160)), edge, Math.max(edge, screenH - box - edge));
      } else {
        // Keep fully on-screen: inset from right + vertical mid.
        lp.x = Math.max(edge, screenW - box - edge);
        lp.y = Math.max(edge, Math.min(screenH - box - edge, (int) (screenH * 0.46f)));
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
        int edge = dp(context, 12);
        int maxX = Math.max(edge, screenW - pill.getWidth() - edge);
        int maxY = Math.max(edge, screenH - pill.getHeight() - edge);
        lp.x = clamp(nx, edge, maxX);
        lp.y = clamp(ny, edge, maxY);
        if (Math.abs(event.getRawX() - start[0]) + Math.abs(event.getRawY() - start[1]) > dp(context, 8)) {
          start[4] = 1f;
          ensureDismissTarget(context, screenW, screenH);
        }
        boolean over = isOverDismiss(lp, pill.getWidth(), pill.getHeight(), screenW, screenH);
        setDismissHot(over);
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
        boolean over = moved && isOverDismiss(lp, pill.getWidth(), pill.getHeight(), screenW, screenH);
        hideDismissLocked();
        if (!moved) {
          openApp(context);
          return true;
        }
        prefs(context).edit().putBoolean(KEY_POS, true).putInt(KEY_X, lp.x).putInt(KEY_Y, lp.y).commit();
        if (over) {
          dismissSmooth(context);
        }
        return true;
      }
      default:
        return false;
    }
  }

  /** Bottom-center drop zone — Zomato-style close target while dragging. */
  private static void ensureDismissTarget(Context context, int screenW, int screenH) {
    synchronized (LOCK) {
      if (wm == null) return;
      if (dismissView != null && dismissParams != null) {
        try {
          dismissView.setAlpha(1f);
          wm.updateViewLayout(dismissView, dismissParams);
        } catch (Throwable ignored) {
        }
        return;
      }
      int size = dp(context, 64);
      FrameLayout root = new FrameLayout(context);
      GradientDrawable bg = new GradientDrawable();
      bg.setShape(GradientDrawable.OVAL);
      bg.setColor(Color.parseColor(DISMISS_IDLE));
      bg.setStroke(dp(context, 2), Color.parseColor("#7F1D1D"));
      dismissBackground = bg;
      root.setBackground(bg);
      if (Build.VERSION.SDK_INT >= 21) root.setElevation(dp(context, 8));

      TextView icon = new TextView(context);
      icon.setText("×");
      icon.setTextColor(Color.WHITE);
      icon.setTextSize(30);
      icon.setTypeface(Typeface.DEFAULT_BOLD);
      icon.setGravity(Gravity.CENTER);
      icon.setIncludeFontPadding(false);
      root.addView(icon, new FrameLayout.LayoutParams(
          FrameLayout.LayoutParams.MATCH_PARENT,
          FrameLayout.LayoutParams.MATCH_PARENT,
          Gravity.CENTER
      ));
      dismissIcon = icon;

      WindowManager.LayoutParams lp = new WindowManager.LayoutParams(
          size,
          size,
          WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY,
          WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE
              | WindowManager.LayoutParams.FLAG_NOT_TOUCHABLE
              | WindowManager.LayoutParams.FLAG_LAYOUT_IN_SCREEN
              | WindowManager.LayoutParams.FLAG_LAYOUT_NO_LIMITS,
          PixelFormat.TRANSLUCENT
      );
      lp.gravity = Gravity.TOP | Gravity.START;
      lp.x = Math.max(0, (screenW - size) / 2);
      // Bottom-center, clear of gesture nav / home indicator.
      lp.y = Math.max(0, screenH - size - dp(context, 36));
      root.setAlpha(0f);
      try {
        wm.addView(root, lp);
        dismissView = root;
        dismissParams = lp;
        root.animate().alpha(1f).setDuration(140).start();
      } catch (Throwable ignored) {
        dismissView = null;
        dismissParams = null;
        dismissBackground = null;
        dismissIcon = null;
      }
    }
  }

  private static void setDismissHot(boolean hot) {
    if (dismissBackground == null) return;
    dismissBackground.setColor(Color.parseColor(hot ? DISMISS_HOT : DISMISS_IDLE));
    if (dismissView != null) {
      float scale = hot ? 1.08f : 1f;
      dismissView.setScaleX(scale);
      dismissView.setScaleY(scale);
    }
  }

  private static boolean isOverDismiss(
      WindowManager.LayoutParams pillLp,
      int pillW,
      int pillH,
      int screenW,
      int screenH
  ) {
    if (dismissParams == null) return false;
    int dismissSize = dismissParams.width;
    int dx = dismissParams.x;
    int dy = dismissParams.y;
    // Expand hit area slightly so the drop feels forgiving.
    int pad = Math.max(8, dismissSize / 5);
    int pillCx = pillLp.x + pillW / 2;
    int pillCy = pillLp.y + pillH / 2;
    int zoneL = dx - pad;
    int zoneT = dy - pad;
    int zoneR = dx + dismissSize + pad;
    int zoneB = dy + dismissSize + pad;
    return pillCx >= zoneL && pillCx <= zoneR && pillCy >= zoneT && pillCy <= zoneB;
  }

  private static void dismissSmooth(Context context) {
    sessionDismissed = true;
    // Drop any legacy permanent flag so process restart can show the pill again.
    try {
      prefs(context).edit().remove(KEY_DISMISSED_LEGACY).commit();
    } catch (Throwable ignored) {
    }
    final FrameLayout pill = view;
    if (pill == null) {
      hide(context);
      return;
    }
    pill.animate()
        .alpha(0f)
        .scaleX(0.82f)
        .scaleY(0.82f)
        .setDuration(180)
        .withEndAction(() -> hide(context))
        .start();
  }

  private static void hideDismissLocked() {
    try {
      if (wm != null && dismissView != null && dismissView.getParent() != null) {
        wm.removeView(dismissView);
      }
    } catch (Throwable ignored) {
    }
    dismissView = null;
    dismissParams = null;
    dismissBackground = null;
    dismissIcon = null;
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
    pillBackground = null;
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
    return sessionDismissed;
  }

  private static GradientDrawable normalBackground(Context context) {
    GradientDrawable bg = new GradientDrawable();
    bg.setShape(GradientDrawable.OVAL);
    bg.setColor(Color.parseColor(PILL_FILL));
    return bg;
  }

  private static void playAttention(Context context) {
    if (view == null) return;
    // Stroke the circle only — never paint the oval onto the root (that covered the badge).
    if (pillBackground != null) {
      pillBackground.setStroke(dp(context, 2), Color.parseColor(ATTENTION_STROKE));
    }
    if (badge != null) badge.bringToFront();
    shake(0);
    MAIN.postDelayed(() -> {
      if (pillBackground != null) pillBackground.setStroke(0, Color.TRANSPARENT);
      if (view != null) view.setTranslationX(0f);
      if (badge != null) badge.bringToFront();
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

  private static int clamp(int value, int min, int max) {
    if (max < min) return min;
    return Math.max(min, Math.min(max, value));
  }

  /** Avoid android.R collisions; a tiny holder for the gesture origin. */
  private static final class Rtag {
    static float[] start(MotionEvent event, WindowManager.LayoutParams lp) {
      return new float[] { event.getRawX(), event.getRawY(), lp.x, lp.y, 0f };
    }
  }
}
