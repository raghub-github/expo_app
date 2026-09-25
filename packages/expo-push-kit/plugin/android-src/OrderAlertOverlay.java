package {{PACKAGE}};

import android.content.Context;
import android.content.Intent;
import android.graphics.Color;
import android.graphics.PixelFormat;
import android.graphics.Typeface;
import android.graphics.drawable.GradientDrawable;
import android.os.Build;
import android.os.Handler;
import android.os.Looper;
import android.os.Process;
import android.provider.Settings;
import android.util.Log;
import android.view.Gravity;
import android.view.View;
import android.view.ViewGroup;
import android.view.WindowManager;
import android.widget.Button;
import android.widget.LinearLayout;
import android.widget.TextView;
import org.json.JSONObject;

/**
 * Native SYSTEM_ALERT_WINDOW overlay for a critical incoming order.
 *
 * Created from OrderAlertForegroundService (not JS / React Activity).
 * Uses TYPE_APPLICATION_OVERLAY on API 26+ so the card can sit above the
 * currently visible app when Settings.canDrawOverlays is true.
 */
public final class OrderAlertOverlay {
  private static final String TAG = "OVERLAY_DEBUG";
  private static final Object LOCK = new Object();
  private static final Handler MAIN = new Handler(Looper.getMainLooper());

  private static View attachedView;
  private static String attachedSessionId;
  private static WindowManager attachedWm;

  private OrderAlertOverlay() {}

  static boolean canDraw(Context context) {
    if (context == null) return false;
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.M) return true;
    try {
      return Settings.canDrawOverlays(context.getApplicationContext());
    } catch (Throwable t) {
      return false;
    }
  }

  static void debug(
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
    sb.append("[OVERLAY_DEBUG] ").append(event);
    sb.append(" package=").append(pkg);
    sb.append(" orderId=").append(sessionSafe(orderId));
    sb.append(" alertSessionId=").append(sessionSafe(sessionId));
    sb.append(" pid=").append(Process.myPid());
    sb.append(" ts=").append(System.currentTimeMillis());
    if (extra != null && extra.length() > 0) {
      sb.append(" ").append(extra);
    }
    Log.i(TAG, sb.toString());
  }

  static void show(
      final Context context,
      final String sessionId,
      final String orderId,
      final String offerId,
      final String title,
      final String body,
      final String pickup,
      final String drop,
      final String orderType
  ) {
    if (context == null) return;
    final String sid = sessionId == null ? "" : sessionId.trim();
    if (sid.length() == 0) return;
    // Keep the FGS/service instance for WindowManager.addView. Application
    // context alone is less reliable on some OEMs for TYPE_APPLICATION_OVERLAY.
    final Context host = context;
    final Context app = context.getApplicationContext();
    Runnable task = () -> showOnMain(host, app, sid, orderId, offerId, title, body, pickup, drop, orderType);
    if (Looper.myLooper() == Looper.getMainLooper()) {
      task.run();
    } else {
      MAIN.post(task);
    }
  }

  static void show(Context context, JSONObject row) {
    if (row == null) return;
    show(
        context,
        row.optString("sessionId", ""),
        row.optString("orderId", ""),
        row.optString("offerId", ""),
        row.optString("title", ""),
        row.optString("body", ""),
        row.optString("pickup", ""),
        row.optString("drop", ""),
        row.optString("orderType", "")
    );
  }

  static void hide(final Context context, final String sessionId) {
    final String sid = sessionId == null ? "" : sessionId.trim();
    final Context app = context != null ? context.getApplicationContext() : null;
    Runnable task = () -> {
      synchronized (LOCK) {
        if (attachedView == null) return;
        if (sid.length() > 0
            && attachedSessionId != null
            && attachedSessionId.length() > 0
            && !sid.equals(attachedSessionId)
            && !attachedSessionId.startsWith(sid + ":")
            && !sid.startsWith(attachedSessionId + ":")) {
          return;
        }
        removeLocked(app, attachedSessionId, "");
      }
    };
    if (Looper.myLooper() == Looper.getMainLooper()) {
      task.run();
    } else {
      MAIN.post(task);
    }
  }

  static void hideAll(final Context context) {
    final Context app = context != null ? context.getApplicationContext() : null;
    Runnable task = () -> {
      synchronized (LOCK) {
        removeLocked(app, attachedSessionId, "");
      }
    };
    if (Looper.myLooper() == Looper.getMainLooper()) {
      task.run();
    } else {
      MAIN.post(task);
    }
  }

  private static void showOnMain(
      Context host,
      Context app,
      String sessionId,
      String orderId,
      String offerId,
      String title,
      String body,
      String pickup,
      String drop,
      String orderType
  ) {
    synchronized (LOCK) {
      debug(app, "OVERLAY_CREATE_START", sessionId, orderId, "orderType=" + sessionSafe(orderType));
      boolean allowed = canDraw(app);
      debug(app, "DRAW_OVERLAYS_PERMISSION=" + allowed, sessionId, orderId, null);
      if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) {
        debug(app, "OVERLAY_ADD_VIEW_FAILED", sessionId, orderId, "reason=api_below_26");
        return;
      }
      if (!allowed) {
        debug(app, "OVERLAY_ADD_VIEW_FAILED", sessionId, orderId, "reason=canDrawOverlays_false");
        return;
      }

      if (attachedView != null
          && sessionId.equals(attachedSessionId)
          && attachedView.getParent() != null) {
        debug(app, "OVERLAY_VISIBLE", sessionId, orderId, "reason=already_attached");
        return;
      }

      if (attachedView != null) {
        removeLocked(app, attachedSessionId, "reason=replace_session");
      }

      Context wmContext = host != null ? host : app;
      WindowManager wm;
      try {
        wm = (WindowManager) wmContext.getSystemService(Context.WINDOW_SERVICE);
      } catch (Throwable t) {
        debug(app, "OVERLAY_ADD_VIEW_FAILED", sessionId, orderId, "reason=no_window_manager err=" + t.getMessage());
        return;
      }
      if (wm == null) {
        debug(app, "OVERLAY_ADD_VIEW_FAILED", sessionId, orderId, "reason=window_manager_null");
        return;
      }

      View card = buildCard(app, sessionId, orderId, offerId, title, body, pickup, drop, orderType);
      WindowManager.LayoutParams params = overlayParams(app);
      try {
        wm.addView(card, params);
        attachedView = card;
        attachedSessionId = sessionId;
        attachedWm = wm;
        debug(
            app,
            "OVERLAY_ADD_VIEW_SUCCESS",
            sessionId,
            orderId,
            "type=TYPE_APPLICATION_OVERLAY host=" + wmContext.getClass().getSimpleName()
        );
        debug(app, "OVERLAY_VISIBLE", sessionId, orderId, null);
        AlertEngineLog.log(app, "OVERLAY_VISIBLE", sessionId, orderId, "type=TYPE_APPLICATION_OVERLAY");
      } catch (Throwable t) {
        attachedView = null;
        attachedSessionId = null;
        attachedWm = null;
        debug(
            app,
            "OVERLAY_ADD_VIEW_FAILED",
            sessionId,
            orderId,
            "reason=addView_exception err=" + t.getMessage()
        );
      }
    }
  }

  private static void removeLocked(Context app, String sessionId, String extra) {
    if (attachedView == null) return;
    String sid = sessionId == null ? "" : sessionId;
    try {
      WindowManager wm = attachedWm;
      if (wm == null && app != null) {
        wm = (WindowManager) app.getSystemService(Context.WINDOW_SERVICE);
      }
      if (wm != null && attachedView.getParent() != null) {
        wm.removeView(attachedView);
      }
    } catch (Throwable t) {
      try {
        if (attachedWm != null) attachedWm.removeViewImmediate(attachedView);
      } catch (Throwable ignored) {
      }
    }
    attachedView = null;
    attachedSessionId = null;
    attachedWm = null;
    debug(app, "OVERLAY_REMOVED", sid, "", extra);
  }

  private static WindowManager.LayoutParams overlayParams(Context context) {
    WindowManager.LayoutParams params = new WindowManager.LayoutParams(
        WindowManager.LayoutParams.MATCH_PARENT,
        WindowManager.LayoutParams.WRAP_CONTENT,
        WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY,
        WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE
            | WindowManager.LayoutParams.FLAG_NOT_TOUCH_MODAL
            | WindowManager.LayoutParams.FLAG_LAYOUT_IN_SCREEN
            | WindowManager.LayoutParams.FLAG_HARDWARE_ACCELERATED
            | WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON,
        PixelFormat.TRANSLUCENT
    );
    params.gravity = Gravity.BOTTOM | Gravity.CENTER_HORIZONTAL;
    params.y = bottomSafePx(context);
    params.format = PixelFormat.TRANSLUCENT;
    if (Build.VERSION.SDK_INT >= 28) {
      params.layoutInDisplayCutoutMode =
          WindowManager.LayoutParams.LAYOUT_IN_DISPLAY_CUTOUT_MODE_SHORT_EDGES;
    }
    return params;
  }

  static View buildCard(
      final Context context,
      final String sessionId,
      final String orderId,
      final String offerId,
      String title,
      String body,
      String pickup,
      String drop,
      String orderType
  ) {
    int pad = dp(context, 12);
    LinearLayout root = new LinearLayout(context);
    root.setOrientation(LinearLayout.VERTICAL);
    root.setPadding(pad, pad, pad, 0);
    root.setLayoutParams(new ViewGroup.LayoutParams(
        ViewGroup.LayoutParams.MATCH_PARENT,
        ViewGroup.LayoutParams.WRAP_CONTENT
    ));

    LinearLayout card = new LinearLayout(context);
    card.setOrientation(LinearLayout.VERTICAL);
    card.setPadding(dp(context, 16), dp(context, 14), dp(context, 16), dp(context, 14));
    GradientDrawable bg = new GradientDrawable();
    bg.setColor(Color.parseColor("#111827"));
    bg.setCornerRadius(dp(context, 16));
    bg.setStroke(dp(context, 1), Color.parseColor("#14B8A6"));
    card.setBackground(bg);
    if (Build.VERSION.SDK_INT >= 21) {
      card.setElevation(dp(context, 10));
    }

    TextView heading = new TextView(context);
    heading.setText("NEW ORDER");
    heading.setTextColor(Color.parseColor("#F9FAFB"));
    heading.setTextSize(16);
    heading.setTypeface(Typeface.DEFAULT_BOLD);
    heading.setLetterSpacing(0.04f);
    card.addView(heading);

    String typeLabel = displayOrderType(orderType);
    if (typeLabel.length() > 0) {
      card.addView(metaRow(context, "Order type: " + typeLabel));
    }

    String pickupLabel = displayPickup(pickup);
    if (pickupLabel.length() > 0) {
      card.addView(metaRow(context, "Pickup: " + pickupLabel));
    }

    String dropLabel = safeText(drop);
    if (dropLabel.length() > 0) {
      card.addView(metaRow(context, "Drop: " + dropLabel));
    }

    JSONObject active = null;
    try {
      active = OrderAlertController.getActive(context);
    } catch (Throwable ignored) {
    }
    String displayId = active != null ? active.optString("displayOrderId", "") : "";
    if (displayId.matches("^\\d+$")) displayId = "";
    String amount = active != null ? active.optString("amount", "") : "";
    String customer = active != null ? active.optString("customerName", "") : "";

    if (displayId.length() > 0) {
      TextView idView = new TextView(context);
      idView.setText(displayId);
      idView.setTextColor(Color.WHITE);
      idView.setTextSize(20);
      idView.setTypeface(Typeface.DEFAULT_BOLD);
      LinearLayout.LayoutParams idLp = new LinearLayout.LayoutParams(
          ViewGroup.LayoutParams.MATCH_PARENT,
          ViewGroup.LayoutParams.WRAP_CONTENT
      );
      idLp.topMargin = dp(context, 6);
      idView.setLayoutParams(idLp);
      card.addView(idView);
    }

    if (customer.length() > 0 && !"Customer".equalsIgnoreCase(customer)) {
      card.addView(metaRow(context, customer));
    }
    String amountLabel = formatAmount(amount);
    if (amountLabel.length() > 0) {
      TextView amt = metaRow(context, amountLabel);
      amt.setTextColor(Color.WHITE);
      amt.setTextSize(16);
      amt.setTypeface(Typeface.DEFAULT_BOLD);
      card.addView(amt);
    }

    String detail = firstNonEmpty(title, body);
    boolean genericTitle = detail.length() == 0
        || "NEW ORDER".equalsIgnoreCase(detail)
        || detail.toLowerCase().contains("new order")
        || detail.matches("(?i)^order\\s*#?\\s*\\d+$");
    if (!genericTitle) {
      TextView detailView = metaRow(context, detail);
      detailView.setMaxLines(2);
      card.addView(detailView);
    }

    LinearLayout actions = new LinearLayout(context);
    actions.setOrientation(LinearLayout.HORIZONTAL);
    LinearLayout.LayoutParams actionsLp = new LinearLayout.LayoutParams(
        ViewGroup.LayoutParams.MATCH_PARENT,
        ViewGroup.LayoutParams.WRAP_CONTENT
    );
    actionsLp.topMargin = dp(context, 12);
    actions.setLayoutParams(actionsLp);

    Button reject = actionButton(context, "REJECT", Color.parseColor("#374151"), Color.parseColor("#F9FAFB"));
    Button accept = actionButton(context, "ACCEPT", Color.parseColor("#059669"), Color.WHITE);
    LinearLayout.LayoutParams btnLp = new LinearLayout.LayoutParams(0, dp(context, 44), 1f);
    LinearLayout.LayoutParams rejectLp = new LinearLayout.LayoutParams(0, dp(context, 44), 1f);
    rejectLp.rightMargin = dp(context, 8);
    reject.setLayoutParams(rejectLp);
    accept.setLayoutParams(btnLp);

    reject.setOnClickListener(v -> {
      v.setEnabled(false);
      accept.setEnabled(false);
      OrderAlertActions.handle(context, "reject", sessionId);
    });
    accept.setOnClickListener(v -> {
      v.setEnabled(false);
      reject.setEnabled(false);
      OrderAlertActions.handle(context, "accept", sessionId);
    });

    actions.addView(reject);
    actions.addView(accept);
    card.addView(actions);
    root.addView(card);
    return root;
  }

  /** Gap above the system navigation bar so Accept/Reject stay tappable. */
  static int bottomSafePx(Context context) {
    int nav = 0;
    try {
      int resId = context.getResources().getIdentifier("navigation_bar_height", "dimen", "android");
      if (resId > 0) nav = context.getResources().getDimensionPixelSize(resId);
    } catch (Throwable ignored) {
    }
    return nav + dp(context, 16);
  }

  private static TextView metaRow(Context context, String text) {
    TextView tv = new TextView(context);
    tv.setText(text);
    tv.setTextColor(Color.parseColor("#D1D5DB"));
    tv.setTextSize(13);
    LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(
        ViewGroup.LayoutParams.MATCH_PARENT,
        ViewGroup.LayoutParams.WRAP_CONTENT
    );
    lp.topMargin = dp(context, 4);
    tv.setLayoutParams(lp);
    return tv;
  }

  private static Button actionButton(Context context, String label, int bgColor, int fg) {
    Button btn = new Button(context);
    btn.setText(label);
    btn.setAllCaps(true);
    btn.setTextColor(fg);
    btn.setTextSize(14);
    btn.setTypeface(Typeface.DEFAULT_BOLD);
    GradientDrawable bg = new GradientDrawable();
    bg.setColor(bgColor);
    bg.setCornerRadius(dp(context, 10));
    btn.setBackground(bg);
    btn.setPadding(dp(context, 8), 0, dp(context, 8), 0);
    if (Build.VERSION.SDK_INT >= 21) {
      btn.setStateListAnimator(null);
      btn.setElevation(0);
    }
    return btn;
  }

  private static void launchApp(
      Context context,
      String action,
      String sessionId,
      String orderId,
      String offerId
  ) {
    try {
      Intent launch = context.getPackageManager().getLaunchIntentForPackage(context.getPackageName());
      if (launch == null) {
        launch = new Intent(context, Class.forName("{{PACKAGE}}.MainActivity"));
      }
      launch.addFlags(
          Intent.FLAG_ACTIVITY_NEW_TASK
              | Intent.FLAG_ACTIVITY_SINGLE_TOP
              | Intent.FLAG_ACTIVITY_REORDER_TO_FRONT
      );
      launch.putExtra("gmOverlayAction", action);
      launch.putExtra("alertSessionId", sessionId);
      if (orderId != null) launch.putExtra("orderId", orderId);
      if (offerId != null) launch.putExtra("offerId", offerId);
      context.startActivity(launch);
    } catch (Throwable t) {
      debug(context, "OVERLAY_ADD_VIEW_FAILED", sessionId, orderId, "reason=launch_app err=" + t.getMessage());
    }
  }

  private static String displayOrderType(String raw) {
    String v = safeText(raw).toLowerCase();
    if (v.length() == 0) return "";
    if ("food".equals(v)) return "Food";
    if ("parcel".equals(v)) return "Parcel";
    if ("ride".equals(v) || "person_ride".equals(v) || "person-ride".equals(v)) return "Ride";
    if (v.length() == 1) return v.toUpperCase();
    return Character.toUpperCase(v.charAt(0)) + v.substring(1);
  }

  private static String displayPickup(String raw) {
    String v = safeText(raw);
    if (v.length() == 0) return "";
    if (v.matches("^\\d+$")) return v + " m";
    return v;
  }

  private static String firstNonEmpty(String a, String b) {
    String x = safeText(a);
    if (x.length() > 0) return x;
    return safeText(b);
  }

  private static String safeText(String value) {
    if (value == null) return "";
    String v = value.trim();
    if (v.length() == 0 || "null".equalsIgnoreCase(v) || "undefined".equalsIgnoreCase(v)) {
      return "";
    }
    return v;
  }

  private static String formatAmount(String raw) {
    String v = safeText(raw);
    if (v.length() == 0 || "0".equals(v) || "0.0".equals(v) || "0.00".equals(v)) return "";
    if (v.startsWith("₹")) return v;
    try {
      double n = Double.parseDouble(v);
      if (n <= 0) return "";
      if (Math.abs(n - Math.rint(n)) < 0.001) {
        return "₹" + String.valueOf((long) Math.rint(n));
      }
      return "₹" + v;
    } catch (Throwable t) {
      return v;
    }
  }

  private static String sessionSafe(String value) {
    return value == null || value.trim().length() == 0 ? "-" : value.trim();
  }

  private static int dp(Context context, int value) {
    float density = context.getResources().getDisplayMetrics().density;
    return Math.round(value * density);
  }
}
