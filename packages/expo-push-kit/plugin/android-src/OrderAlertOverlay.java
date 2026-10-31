package {{PACKAGE}};

import android.content.Context;
import android.content.SharedPreferences;
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
import android.view.MotionEvent;
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
 * Shown only over the lock screen / other apps (home). Never while Partner is
 * the foreground app — IncomingOrderModal owns in-app Accept/Reject.
 *
 * User can close or swipe the card away without stopping the buzzer; the same
 * session will not reappear until a new order arrives.
 */
public final class OrderAlertOverlay {
  private static final String TAG = "OVERLAY_DEBUG";
  private static final String PREFS = "gatimitra_order_overlay_v1";
  private static final String KEY_CARD_DISMISSED = "card_dismissed_sessions";
  private static final Object LOCK = new Object();
  private static final Handler MAIN = new Handler(Looper.getMainLooper());
  private static final float SWIPE_DISMISS_DP = 96f;

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
    // The single gate for "may a native card be on screen right now".
    //
    // It lives here rather than at each call site because there are four of
    // them and every one has to agree; one that forgets puts this card on top
    // of the in-app sheet, which is exactly what riders and merchants saw.
    //
    // js_attached is the authoritative half: the app says it is presenting this
    // offer itself. shouldSuppressOverlayWindow covers the cases JS cannot
    // report — a locked keyguard, or the app being in front before the React
    // tree has attached to the alert.
    if (!OrderAlertPresentation.shouldMountOverlay(
        OrderAlertController.isJsOwned(context, sid),
        OrderAlertVisibility.shouldHideBecausePartnerIsOpen(context),
        OrderAlertVisibility.isDeviceLocked(context),
        isCardDismissed(context, sid))) {
      hideAll(context);
      return;
    }
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

  /**
   * User closed / swiped the floating card. Hides UI only — buzzer keeps playing
   * until Accept/Reject/expire. Same session will not re-show the card.
   */
  static void dismissCardByUser(Context context, String sessionId) {
    if (context == null) return;
    String sid = sessionId == null ? "" : sessionId.trim();
    if (sid.length() == 0) sid = attachedSessionId == null ? "" : attachedSessionId;
    if (sid.length() > 0) markCardDismissed(context, sid);
    hide(context, sid);
    OrderAlertLockActivity.finishLive();
    AlertEngineLog.log(context, "OVERLAY_USER_DISMISS", sid, "", "buzzer_continues=1");
  }

  static boolean isCardDismissed(Context context, String sessionId) {
    if (context == null || sessionId == null || sessionId.trim().length() == 0) return false;
    String raw = prefs(context).getString(KEY_CARD_DISMISSED, "");
    return raw.contains("|" + sessionId.trim() + "|");
  }

  /** Clear dismiss markers that no longer match an active session (new order). */
  static void pruneDismissed(Context context, String activeSessionId) {
    if (context == null) return;
    SharedPreferences p = prefs(context);
    String raw = p.getString(KEY_CARD_DISMISSED, "");
    if (raw.length() == 0) return;
    if (activeSessionId != null && activeSessionId.trim().length() > 0) {
      String keep = "|" + activeSessionId.trim() + "|";
      if (raw.contains(keep) && raw.equals(keep)) return;
      // Drop markers for sessions that are no longer active.
      if (!raw.contains(keep)) {
        p.edit().putString(KEY_CARD_DISMISSED, "").apply();
      }
    } else {
      p.edit().putString(KEY_CARD_DISMISSED, "").apply();
    }
  }

  private static void markCardDismissed(Context context, String sessionId) {
    SharedPreferences p = prefs(context);
    String token = "|" + sessionId + "|";
    String raw = p.getString(KEY_CARD_DISMISSED, "");
    if (raw.contains(token)) return;
    String next = raw + token;
    if (next.length() > 4000) next = next.substring(next.length() - 4000);
    p.edit().putString(KEY_CARD_DISMISSED, next).commit();
  }

  private static SharedPreferences prefs(Context context) {
    return context.getApplicationContext().getSharedPreferences(PREFS, Context.MODE_PRIVATE);
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
      // Never mount over Partner UI or the lock screen (LockActivity hosts lock UI).
      if (OrderAlertVisibility.shouldSuppressOverlayWindow(app)) {
        debug(app, "OVERLAY_SKIP", sessionId, orderId, "reason=partner_or_locked");
        removeLocked(app, attachedSessionId, "reason=partner_or_locked");
        return;
      }
      pruneDismissed(app, sessionId);
      if (isCardDismissed(app, sessionId)) {
        debug(app, "OVERLAY_SKIP", sessionId, orderId, "reason=user_dismissed_card");
        return;
      }
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
      // Swipe on title/price only — leave × and Accept/Reject fully tappable.
      View titleHandle = card.findViewWithTag("gm_overlay_title");
      View priceHandle = card.findViewWithTag("gm_overlay_price");
      if (titleHandle != null) attachSwipeToDismiss(app, titleHandle, card, sessionId);
      if (priceHandle != null) attachSwipeToDismiss(app, priceHandle, card, sessionId);
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

  /**
   * Swipe left/right on the header to hide the card. Gesture target is the header
   * so Accept / Reject / close taps are not stolen.
   */
  private static void attachSwipeToDismiss(
      final Context context,
      final View gestureTarget,
      final View translateTarget,
      final String sessionId
  ) {
    if (gestureTarget == null || translateTarget == null) return;
    final float[] start = new float[3]; // rawX, translationX baseline, moved
    final float dismissPx = SWIPE_DISMISS_DP * context.getResources().getDisplayMetrics().density;
    gestureTarget.setOnTouchListener((v, event) -> {
      switch (event.getActionMasked()) {
        case MotionEvent.ACTION_DOWN:
          start[0] = event.getRawX();
          start[1] = translateTarget.getTranslationX();
          start[2] = 0f;
          return true;
        case MotionEvent.ACTION_MOVE: {
          float dx = event.getRawX() - start[0];
          if (Math.abs(dx) > dp(context, 8)) start[2] = 1f;
          translateTarget.setTranslationX(start[1] + dx);
          return true;
        }
        case MotionEvent.ACTION_UP:
        case MotionEvent.ACTION_CANCEL: {
          float dx = translateTarget.getTranslationX();
          if (start[2] > 0f && Math.abs(dx) >= dismissPx) {
            dismissCardByUser(context, sessionId);
            return true;
          }
          translateTarget.animate().translationX(0f).setDuration(160).start();
          return true;
        }
        default:
          return false;
      }
    });
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

    JSONObject active = null;
    try {
      active = OrderAlertController.getActive(context);
    } catch (Throwable ignored) {
    }
    String displayId = active != null ? active.optString("displayOrderId", "") : "";
    if (displayId.matches("^\\d+$")) displayId = "";
    String amount = active != null ? active.optString("amount", "") : "";
    String customer = active != null ? active.optString("customerName", "") : "";
    String amountLabel = formatAmount(amount);

    // Row 1: NEW ORDER ........ ₹price  [×]
    LinearLayout header = new LinearLayout(context);
    header.setOrientation(LinearLayout.HORIZONTAL);
    header.setGravity(Gravity.CENTER_VERTICAL);
    header.setLayoutParams(new LinearLayout.LayoutParams(
        ViewGroup.LayoutParams.MATCH_PARENT,
        ViewGroup.LayoutParams.WRAP_CONTENT
    ));

    TextView heading = new TextView(context);
    heading.setText(headingFor(orderType));
    heading.setTag("gm_overlay_title");
    heading.setTextColor(Color.parseColor("#F9FAFB"));
    heading.setTextSize(16);
    heading.setTypeface(Typeface.DEFAULT_BOLD);
    heading.setLetterSpacing(0.04f);
    LinearLayout.LayoutParams headingLp = new LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f);
    heading.setLayoutParams(headingLp);
    header.addView(heading);

    if (amountLabel.length() > 0) {
      TextView price = new TextView(context);
      // Riders are sent their own payout in this field; merchants are sent the
      // order total. Rendering both as a bare rupee figure invites a rider to
      // read the number as the fare.
      price.setText(OrderAlertCardText.amountLabel(amount));
      price.setTag("gm_overlay_price");
      price.setTextColor(Color.WHITE);
      price.setTextSize(16);
      price.setTypeface(Typeface.DEFAULT_BOLD);
      price.setGravity(Gravity.END | Gravity.CENTER_VERTICAL);
      price.setPadding(dp(context, 8), 0, dp(context, 8), 0);
      header.addView(price);
    }

    // Countdown, server-authoritative. Only elapsed time is read from this device;
    // the deadline itself came from the backend, so a wrong device clock cannot
    // extend an offer. Absent deadline => no timer, rather than a fake one.
    long expiresAtMs = parseEpochMs(active != null ? active.optString("expiresAt", "") : "");
    if (expiresAtMs > 0L) {
      TextView countdown = new TextView(context);
      countdown.setTag("gm_overlay_countdown");
      countdown.setTextColor(Color.parseColor("#5EEAD4"));
      countdown.setTextSize(15);
      countdown.setTypeface(Typeface.DEFAULT_BOLD);
      countdown.setGravity(Gravity.END | Gravity.CENTER_VERTICAL);
      countdown.setPadding(dp(context, 8), 0, dp(context, 8), 0);
      header.addView(countdown);
      startCountdown(context, countdown, sessionId, expiresAtMs);
    }

    TextView close = new TextView(context);
    close.setText("×");
    close.setTextColor(Color.parseColor("#D1D5DB"));
    close.setTextSize(22);
    close.setTypeface(Typeface.DEFAULT_BOLD);
    close.setGravity(Gravity.CENTER);
    close.setPadding(dp(context, 10), dp(context, 4), dp(context, 4), dp(context, 4));
    close.setContentDescription("Close");
    close.setClickable(true);
    close.setOnClickListener(v -> dismissCardByUser(context, sessionId));
    header.addView(close);
    card.addView(header);

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

    String tripKm = active != null ? safeText(active.optString("tripDistanceKm", "")) : "";
    if (tripKm.length() > 0 && !"0".equals(tripKm)) {
      card.addView(metaRow(context, "Trip: " + tripKm + " km"));
    }

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
    // Amount is on the header row — do not repeat on a 3rd row.

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

  /**
   * Ticks the remaining seconds once per second and retires the alert at zero.
   *
   * Keyed on sessionId: a tick that fires after a newer offer replaced this card
   * must not stop the new one, and a detached view must not keep a timer alive.
   */
  private static void startCountdown(
      final Context context,
      final TextView view,
      final String sessionId,
      final long expiresAtMs
  ) {
    final Context app = context.getApplicationContext();
    final Runnable[] tick = new Runnable[1];
    tick[0] = () -> {
      if (view.getParent() == null) return;
      long leftMs = expiresAtMs - System.currentTimeMillis();
      if (leftMs <= 0L) {
        view.setText("0s");
        try {
          OrderAlertController.stop(app, sessionId);
        } catch (Throwable ignored) {
        }
        return;
      }
      view.setText(OrderAlertCardText.countdownLabel(expiresAtMs, System.currentTimeMillis()));
      MAIN.postDelayed(tick[0], 1000L);
    };
    MAIN.post(tick[0]);
  }

  /** Accepts epoch millis or an ISO-8601 instant; 0 means "no usable deadline". */
  static long parseEpochMs(String raw) {
    return OrderAlertCardText.parseEpochMs(raw);
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

  private static String headingFor(String orderType) {
    return OrderAlertCardText.headingFor(orderType);
  }

  private static String displayOrderType(String raw) {
    return OrderAlertCardText.displayOrderType(raw);
  }

  private static String displayPickup(String raw) {
    return OrderAlertCardText.displayPickup(raw);
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
    return OrderAlertCardText.formatAmount(raw);
  }

  private static String sessionSafe(String value) {
    return value == null || value.trim().length() == 0 ? "-" : value.trim();
  }

  private static int dp(Context context, int value) {
    float density = context.getResources().getDisplayMetrics().density;
    return Math.round(value * density);
  }
}
