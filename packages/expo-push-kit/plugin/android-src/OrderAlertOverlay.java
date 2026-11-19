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
import android.text.TextUtils;
import android.util.DisplayMetrics;
import android.util.Log;
import android.view.Gravity;
import android.view.MotionEvent;
import android.view.View;
import android.view.ViewGroup;
import android.view.WindowManager;
import android.view.animation.DecelerateInterpolator;
import android.view.animation.LinearInterpolator;
import android.widget.FrameLayout;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.TextView;
import org.json.JSONObject;

/**
 * Native SYSTEM_ALERT_WINDOW overlay for a critical incoming order.
 *
 * Shown only over the lock screen / other apps (home). Never while Partner is
 * the foreground app — IncomingOrderModal owns in-app Accept/Reject.
 *
 * The card mirrors the in-app offer sheet (rider IncomingOrderModal / merchant
 * IncomingOrderModal): white sheet, "New order!" badge, live timer bar, order
 * id, earnings breakdown or order items, distance strip and pickup → drop
 * timeline. Rows the payload did not carry are left out — never a placeholder.
 *
 * The card is REBUILT IN PLACE whenever the session's details change. An alert
 * started from the app (WebSocket offer, no details yet) used to draw an empty
 * card, and the rich FCM that landed a moment later was ignored as
 * "already attached" — which is how riders saw "Address unavailable".
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

  // Palette — matches the in-app sheets (slate text on white, brand accent).
  private static final String INK = "#0F172A";
  private static final String INK_2 = "#1E293B";
  private static final String MUTED = "#64748B";
  private static final String LINE = "#E2E8F0";
  private static final String SURFACE = "#F8FAFC";
  private static final String URGENT = "#DC2626";

  private static View attachedView;
  private static String attachedSessionId;
  private static String attachedSignature;
  private static WindowManager attachedWm;

  private OrderAlertOverlay() {}

  private static String accent() {
    return OrderAlertCardText.RIDER ? "#0F766E" : "#2E9B6E";
  }

  private static String accentSoft() {
    return OrderAlertCardText.RIDER ? "#F0FDFA" : "#ECFDF5";
  }

  private static String accentInk() {
    return OrderAlertCardText.RIDER ? "#115E59" : "#166534";
  }

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

  /** The session row this card renders; an empty row (never null) when it is gone. */
  static JSONObject sessionRow(Context context, String sessionId) {
    JSONObject row = null;
    try {
      if (sessionId != null && sessionId.trim().length() > 0) {
        row = OrderAlertController.getSessionById(context, sessionId.trim());
      }
    } catch (Throwable ignored) {
    }
    if (row == null) {
      try {
        row = OrderAlertController.getActive(context);
      } catch (Throwable ignored) {
      }
    }
    return row != null ? row : new JSONObject();
  }

  /**
   * Everything the card draws, as one string. Equal → the card on screen is
   * current; different → rebuild in place. pickup/drop/orderType fall back to
   * the caller's arguments exactly as buildCard does, so two callers passing
   * the same session never ping-pong rebuilds.
   */
  static String cardSignature(
      Context context,
      String sessionId,
      String pickup,
      String drop,
      String orderType
  ) {
    JSONObject row = sessionRow(context, sessionId);
    return OrderAlertCardText.signature(new String[] {
        sessionId,
        pick(row.optString("orderType", ""), orderType),
        pick(row.optString("pickup", ""), pickup),
        pick(row.optString("drop", ""), drop),
        row.optString("displayOrderId", ""),
        row.optString("amount", ""),
        row.optString("customerName", ""),
        row.optString("expiresAt", ""),
        row.optString("storeName", ""),
        row.optString("itemCount", ""),
        row.optString("toPickupKm", ""),
        row.optString("tripDistanceKm", ""),
        row.optString("overallKm", ""),
        row.optString("itemsJson", ""),
        row.optString("specialInstructions", ""),
        row.optString("paymentMethod", ""),
        row.optString("waitingEarning", ""),
        row.optString("surgeEarning", ""),
        row.optString("firstMileEarning", ""),
        row.optString("tipAmount", ""),
        row.optString("payAt", "")
    });
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

      String signature = cardSignature(app, sessionId, pickup, drop, orderType);
      if (attachedView != null
          && sessionId.equals(attachedSessionId)
          && attachedView.getParent() != null) {
        if (signature.equals(attachedSignature)) {
          debug(app, "OVERLAY_VISIBLE", sessionId, orderId, "reason=already_attached");
          return;
        }
        // Same offer, richer data (FCM after a detail-less app start, or the
        // app pushing its own details): refresh the card where it stands.
        try {
          View fresh = buildCard(app, sessionId, orderId, offerId, title, body, pickup, drop, orderType);
          if (swapCardContent(app, attachedView, fresh, sessionId)) {
            attachedSignature = signature;
            debug(app, "OVERLAY_REFRESHED", sessionId, orderId, "reason=details_changed");
            return;
          }
        } catch (Throwable t) {
          debug(app, "OVERLAY_REFRESH_FAILED", sessionId, orderId, "err=" + t.getMessage());
        }
        removeLocked(app, attachedSessionId, "reason=refresh_fallback");
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
      wireSwipe(app, card, sessionId);
      try {
        // Slide up + fade in — short, so the card feels instant.
        card.setAlpha(0f);
        card.setTranslationY(dp(app, 28));
        wm.addView(card, params);
        card.animate()
            .alpha(1f)
            .translationY(0f)
            .setDuration(200L)
            .setInterpolator(new DecelerateInterpolator())
            .start();
        attachedView = card;
        attachedSessionId = sessionId;
        attachedSignature = signature;
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
        attachedSignature = null;
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

  /**
   * Move a freshly built card's content into the root already on screen, so a
   * detail refresh never removes the window (no flicker, no re-animation, no
   * second permission round-trip).
   */
  static boolean swapCardContent(Context context, View host, View freshRoot, String sessionId) {
    if (!(host instanceof ViewGroup) || !(freshRoot instanceof ViewGroup)) return false;
    ViewGroup target = (ViewGroup) host;
    ViewGroup source = (ViewGroup) freshRoot;
    java.util.ArrayList<View> children = new java.util.ArrayList<>();
    for (int i = 0; i < source.getChildCount(); i++) children.add(source.getChildAt(i));
    source.removeAllViews();
    target.removeAllViews();
    for (View child : children) target.addView(child);
    host.setTranslationX(0f);
    wireSwipe(context, host, sessionId);
    return true;
  }

  /** Swipe on the header / id row only — the × and the CTA stay fully tappable. */
  static void wireSwipe(Context context, View card, String sessionId) {
    View titleHandle = card.findViewWithTag("gm_overlay_title");
    View priceHandle = card.findViewWithTag("gm_overlay_price");
    if (titleHandle != null) attachSwipeToDismiss(context, titleHandle, card, sessionId);
    if (priceHandle != null) attachSwipeToDismiss(context, priceHandle, card, sessionId);
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
    attachedSignature = null;
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

  // ------------------------------------------------------------------------
  // Card
  // ------------------------------------------------------------------------

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
    JSONObject row = sessionRow(context, sessionId);
    final boolean rider = OrderAlertCardText.RIDER;
    String type = pick(row.optString("orderType", ""), orderType);
    String pickupText = OrderAlertCardText.displayPickup(pick(row.optString("pickup", ""), pickup));
    String dropText = safeText(pick(row.optString("drop", ""), drop));
    String displayId = OrderAlertCardText.publicOrderId(
        row.optString("displayOrderId", ""),
        firstNonEmpty(row.optString("title", ""), row.optString("body", ""))
    );
    String amount = row.optString("amount", "");
    String customer = OrderAlertCardText.customerLine(row.optString("customerName", ""));
    String storeName = safeText(row.optString("storeName", ""));
    String itemsLabel = OrderAlertCardText.itemCountLabel(row.optString("itemCount", ""));
    String paymentMethod = row.optString("paymentMethod", "");
    String paymentChip = OrderAlertCardText.paymentChip(paymentMethod);
    long expiresAtMs = parseEpochMs(row.optString("expiresAt", ""));
    long startedAtMs = row.optLong("startedAt", 0L);

    LinearLayout root = new LinearLayout(context);
    root.setOrientation(LinearLayout.VERTICAL);
    root.setPadding(dp(context, 10), dp(context, 6), dp(context, 10), 0);
    root.setLayoutParams(new ViewGroup.LayoutParams(
        ViewGroup.LayoutParams.MATCH_PARENT,
        ViewGroup.LayoutParams.WRAP_CONTENT
    ));

    LinearLayout card = new LinearLayout(context);
    card.setOrientation(LinearLayout.VERTICAL);
    card.setPadding(0, dp(context, 14), 0, dp(context, 14));
    card.setBackground(rounded("#FFFFFF", dp(context, 22), LINE, dp(context, 1)));
    if (Build.VERSION.SDK_INT >= 21) {
      card.setElevation(dp(context, 14));
    }

    // ---- header: [• New ride!] ............ [0:27] [✕]
    LinearLayout header = new LinearLayout(context);
    header.setOrientation(LinearLayout.HORIZONTAL);
    header.setGravity(Gravity.CENTER_VERTICAL);
    header.setTag("gm_overlay_title");
    header.setPadding(dp(context, 16), 0, dp(context, 12), 0);
    header.setLayoutParams(matchWrap());

    TextView badge = text(context, "•  " + OrderAlertCardText.newOrderBadge(type), 12, "#FFFFFF", true);
    badge.setBackground(rounded(accent(), dp(context, 999), null, 0));
    badge.setPadding(dp(context, 11), dp(context, 5), dp(context, 12), dp(context, 5));
    badge.setLetterSpacing(0.02f);
    header.addView(badge);

    View spacer = new View(context);
    spacer.setLayoutParams(new LinearLayout.LayoutParams(0, 1, 1f));
    header.addView(spacer);

    TextView timer = null;
    if (expiresAtMs > 0L) {
      long now = System.currentTimeMillis();
      timer = text(context, OrderAlertCardText.countdownClock(expiresAtMs, now), 13, accentInk(), true);
      timer.setTag("gm_overlay_countdown");
      timer.setPadding(dp(context, 10), dp(context, 4), dp(context, 10), dp(context, 4));
      styleTimer(context, timer, OrderAlertCardText.isUrgent(expiresAtMs, now));
      header.addView(timer);
    }

    TextView close = text(context, "✕", 14, "#475569", true);
    close.setGravity(Gravity.CENTER);
    close.setBackground(rounded("#F1F5F9", dp(context, 999), null, 0));
    LinearLayout.LayoutParams closeLp = new LinearLayout.LayoutParams(dp(context, 32), dp(context, 32));
    closeLp.leftMargin = dp(context, 8);
    close.setLayoutParams(closeLp);
    close.setContentDescription("Close");
    close.setClickable(true);
    close.setOnClickListener(v -> dismissCardByUser(context, sessionId));
    header.addView(close);
    card.addView(header);

    // ---- live timer bar (shrinks to zero at the server deadline)
    View fill = null;
    if (expiresAtMs > 0L) {
      FrameLayout track = new FrameLayout(context);
      track.setBackground(rounded("#EEF2F6", dp(context, 2), null, 0));
      LinearLayout.LayoutParams trackLp = new LinearLayout.LayoutParams(
          ViewGroup.LayoutParams.MATCH_PARENT, dp(context, 4));
      trackLp.topMargin = dp(context, 10);
      trackLp.leftMargin = dp(context, 16);
      trackLp.rightMargin = dp(context, 16);
      track.setLayoutParams(trackLp);
      fill = new View(context);
      fill.setBackground(rounded(accent(), dp(context, 2), null, 0));
      fill.setLayoutParams(new FrameLayout.LayoutParams(
          ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
      fill.setPivotX(0f);
      float f = OrderAlertCardText.remainingFraction(startedAtMs, expiresAtMs, System.currentTimeMillis());
      fill.setScaleX(f < 0f ? 1f : f);
      track.addView(fill);
      card.addView(track);
    }

    // ---- scrollable body
    LinearLayout bodyCol = new LinearLayout(context);
    bodyCol.setOrientation(LinearLayout.VERTICAL);
    bodyCol.setPadding(dp(context, 16), dp(context, 12), dp(context, 16), 0);

    // Chips: category + payment
    String category = OrderAlertCardText.bannerLabel(type);
    if (category.length() > 0 || paymentChip.length() > 0) {
      LinearLayout chips = new LinearLayout(context);
      chips.setOrientation(LinearLayout.HORIZONTAL);
      chips.setGravity(Gravity.CENTER_VERTICAL);
      chips.setLayoutParams(matchWrap());
      if (category.length() > 0) {
        chips.addView(chip(context, category, accentSoft(), accentInk(), 0));
      }
      if (paymentChip.length() > 0) {
        boolean cash = "Cash".equals(paymentChip);
        chips.addView(chip(
            context,
            paymentChip,
            cash ? "#FFFBEB" : "#F0FDF4",
            cash ? "#92400E" : "#15803D",
            category.length() > 0 ? dp(context, 6) : 0));
      }
      bodyCol.addView(chips);
    }

    // Order id row (also a swipe handle)
    LinearLayout idRow = new LinearLayout(context);
    idRow.setOrientation(LinearLayout.HORIZONTAL);
    idRow.setGravity(Gravity.CENTER_VERTICAL);
    idRow.setTag("gm_overlay_price");
    LinearLayout.LayoutParams idRowLp = matchWrap();
    idRowLp.topMargin = dp(context, 8);
    idRow.setLayoutParams(idRowLp);
    TextView idView = text(
        context,
        displayId.length() > 0 ? displayId : OrderAlertCardText.headingFor(type),
        displayId.length() > 0 ? 20 : 17,
        INK,
        true);
    idView.setSingleLine(true);
    idView.setEllipsize(TextUtils.TruncateAt.END);
    idView.setLayoutParams(new LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f));
    idRow.addView(idView);
    TextView when = text(context, "Just now", 12, MUTED, false);
    when.setPadding(dp(context, 8), 0, 0, 0);
    idRow.addView(when);
    bodyCol.addView(idRow);

    if (rider) {
      buildRiderBody(context, bodyCol, row, type, amount, customer, storeName, itemsLabel,
          paymentMethod, pickupText, dropText);
    } else {
      buildMerchantBody(context, bodyCol, row, amount, customer, itemsLabel, paymentChip, title, body);
    }

    String special = safeText(row.optString("specialInstructions", ""));
    if (special.length() > 0) {
      TextView note = text(context, "Note:  " + special, 13, "#92400E", false);
      note.setMaxLines(3);
      note.setEllipsize(TextUtils.TruncateAt.END);
      note.setBackground(rounded("#FFFBEB", dp(context, 12), "#FDE68A", dp(context, 1)));
      note.setPadding(dp(context, 12), dp(context, 9), dp(context, 12), dp(context, 9));
      LinearLayout.LayoutParams noteLp = matchWrap();
      noteLp.topMargin = dp(context, 10);
      note.setLayoutParams(noteLp);
      bodyCol.addView(note);
    }

    card.addView(capHeight(context, bodyCol));

    // ---- CTA. Accept / Reject happen in the app's secure flow; the card opens it.
    TextView open = text(context, OrderAlertCardText.openButtonLabel(), 16, "#FFFFFF", true);
    open.setGravity(Gravity.CENTER);
    open.setBackground(rounded(accent(), dp(context, 14), null, 0));
    LinearLayout.LayoutParams openLp = new LinearLayout.LayoutParams(
        ViewGroup.LayoutParams.MATCH_PARENT, dp(context, 52));
    openLp.topMargin = dp(context, 14);
    openLp.leftMargin = dp(context, 16);
    openLp.rightMargin = dp(context, 16);
    open.setLayoutParams(openLp);
    open.setClickable(true);
    open.setContentDescription(OrderAlertCardText.openToAcceptLabel());
    open.setOnClickListener(v -> {
      v.setEnabled(false);
      v.setAlpha(0.75f);
      OrderAlertActions.handle(context, "open", sessionId);
    });
    card.addView(open);

    root.addView(card);
    if (timer != null) {
      startCountdown(context, timer, fill, sessionId, startedAtMs, expiresAtMs);
    }
    return root;
  }

  /** Rider body: who/what, parcel fare banner, earnings, distances, route. */
  private static void buildRiderBody(
      Context context,
      LinearLayout bodyCol,
      JSONObject row,
      String type,
      String amount,
      String customer,
      String storeName,
      String itemsLabel,
      String paymentMethod,
      String pickupText,
      String dropText
  ) {
    String lowerType = safeText(type).toLowerCase();
    boolean food = lowerType.equals("food") || lowerType.equals("grocery");

    // Who the job is for: passenger / sender for ride & parcel, store for food.
    String who = food ? storeName : customer;
    if (who.length() > 0 || (food && itemsLabel.length() > 0)) {
      LinearLayout whoRow = new LinearLayout(context);
      whoRow.setOrientation(LinearLayout.HORIZONTAL);
      whoRow.setGravity(Gravity.CENTER_VERTICAL);
      LinearLayout.LayoutParams whoLp = matchWrap();
      whoLp.topMargin = dp(context, 4);
      whoRow.setLayoutParams(whoLp);
      if (who.length() > 0) {
        TextView name = text(context, who, 14, INK_2, true);
        name.setMaxLines(2);
        name.setEllipsize(TextUtils.TruncateAt.END);
        name.setLayoutParams(new LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f));
        whoRow.addView(name);
      }
      if (food && itemsLabel.length() > 0) {
        whoRow.addView(chip(context, itemsLabel, accentSoft(), accentInk(), who.length() > 0 ? dp(context, 8) : 0));
      }
      bodyCol.addView(whoRow);
    }

    String fare = OrderAlertCardText.fareCollectLabel(type, paymentMethod, row.optString("payAt", ""));
    if (fare.length() > 0) {
      TextView fareChip = chip(context, fare, "#FFFBEB", "#92400E", 0);
      LinearLayout.LayoutParams fareLp = new LinearLayout.LayoutParams(
          ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT);
      fareLp.topMargin = dp(context, 8);
      fareChip.setLayoutParams(fareLp);
      bodyCol.addView(fareChip);
    }

    // Earnings — same rows, same order, same derived base as the in-app sheet.
    String[][] earnings = OrderAlertCardText.earningRows(
        type,
        amount,
        row.optString("waitingEarning", ""),
        row.optString("surgeEarning", ""),
        row.optString("firstMileEarning", ""),
        row.optString("tipAmount", ""));
    if (earnings.length > 0) {
      LinearLayout box = panel(context);
      for (String[] line : earnings) {
        boolean total = "total".equals(line[2]);
        if (total && earnings.length > 1) {
          View divider = new View(context);
          divider.setBackgroundColor(Color.parseColor(LINE));
          LinearLayout.LayoutParams dLp = new LinearLayout.LayoutParams(
              ViewGroup.LayoutParams.MATCH_PARENT, dp(context, 1));
          dLp.topMargin = dp(context, 6);
          dLp.bottomMargin = dp(context, 6);
          divider.setLayoutParams(dLp);
          box.addView(divider);
        }
        String tone = INK_2;
        if ("surge".equals(line[2])) tone = "#B45309";
        else if ("tip".equals(line[2])) tone = "#15803D";
        else if ("firstMile".equals(line[2])) tone = "#4F46E5";
        LinearLayout r = new LinearLayout(context);
        r.setOrientation(LinearLayout.HORIZONTAL);
        r.setGravity(Gravity.CENTER_VERTICAL);
        LinearLayout.LayoutParams rLp = matchWrap();
        if (!total) rLp.bottomMargin = dp(context, 4);
        r.setLayoutParams(rLp);
        TextView label = text(context, line[0], 13, total ? "#475569" : (tone.equals(INK_2) ? MUTED : tone), true);
        label.setLayoutParams(new LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f));
        r.addView(label);
        TextView value = text(context, line[1], total ? 24 : 14, total ? INK : tone, true);
        r.addView(value);
        box.addView(r);
      }
      bodyCol.addView(box);
    }

    // Distance strip: To pickup | Trip | Overall
    String[] cells = OrderAlertCardText.distanceCells(
        row.optString("toPickupKm", ""),
        row.optString("tripDistanceKm", ""),
        row.optString("overallKm", ""));
    if (cells.length == 3) {
      LinearLayout strip = new LinearLayout(context);
      strip.setOrientation(LinearLayout.HORIZONTAL);
      strip.setBackground(rounded(SURFACE, dp(context, 12), LINE, dp(context, 1)));
      strip.setPadding(dp(context, 6), dp(context, 8), dp(context, 6), dp(context, 8));
      LinearLayout.LayoutParams stripLp = matchWrap();
      stripLp.topMargin = dp(context, 10);
      strip.setLayoutParams(stripLp);
      String[] labels = new String[] {"TO PICKUP", "TRIP", "OVERALL"};
      for (int i = 0; i < 3; i++) {
        if (i > 0) {
          View div = new View(context);
          div.setBackgroundColor(Color.parseColor(LINE));
          div.setLayoutParams(new LinearLayout.LayoutParams(dp(context, 1), ViewGroup.LayoutParams.MATCH_PARENT));
          strip.addView(div);
        }
        LinearLayout cell = new LinearLayout(context);
        cell.setOrientation(LinearLayout.VERTICAL);
        cell.setGravity(Gravity.CENTER_HORIZONTAL);
        cell.setLayoutParams(new LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f));
        TextView l = text(context, labels[i], 10, MUTED, true);
        l.setLetterSpacing(0.04f);
        l.setGravity(Gravity.CENTER);
        cell.addView(l);
        TextView v = text(context, cells[i], 15, INK, true);
        v.setGravity(Gravity.CENTER);
        v.setPadding(0, dp(context, 3), 0, 0);
        cell.addView(v);
        strip.addView(cell);
      }
      bodyCol.addView(strip);
    }

    // Route timeline: • Pickup → • Drop
    String pickupLine = pickupText;
    if (food && storeName.length() > 0 && !storeName.equalsIgnoreCase(pickupText)) {
      pickupLine = pickupText.length() > 0 ? storeName + " · " + pickupText : storeName;
    } else if (pickupLine.length() == 0) {
      pickupLine = storeName;
    }
    boolean hasPickup = pickupLine.length() > 0;
    boolean hasDrop = dropText.length() > 0;
    if (hasPickup || hasDrop) {
      LinearLayout route = new LinearLayout(context);
      route.setOrientation(LinearLayout.VERTICAL);
      route.setBackground(rounded("#FFFFFF", dp(context, 12), LINE, dp(context, 1)));
      route.setPadding(dp(context, 12), dp(context, 10), dp(context, 12), dp(context, 4));
      LinearLayout.LayoutParams routeLp = matchWrap();
      routeLp.topMargin = dp(context, 10);
      route.setLayoutParams(routeLp);
      if (hasPickup) {
        route.addView(routeStop(context, "PICKUP", pickupLine,
            OrderAlertCardText.kmLabel(row.optString("toPickupKm", "")), "#22C55E", hasDrop));
      }
      if (hasDrop) {
        route.addView(routeStop(context, "DROP", dropText,
            OrderAlertCardText.kmLabel(row.optString("tripDistanceKm", "")), "#EF4444", false));
      }
      bodyCol.addView(route);
    }
  }

  /** Merchant body: customer, item list, order total — as the in-app sheet. */
  private static void buildMerchantBody(
      Context context,
      LinearLayout bodyCol,
      JSONObject row,
      String amount,
      String customer,
      String itemsLabel,
      String paymentChip,
      String title,
      String body
  ) {
    if (customer.length() > 0 || itemsLabel.length() > 0) {
      LinearLayout whoRow = new LinearLayout(context);
      whoRow.setOrientation(LinearLayout.HORIZONTAL);
      whoRow.setGravity(Gravity.CENTER_VERTICAL);
      LinearLayout.LayoutParams whoLp = matchWrap();
      whoLp.topMargin = dp(context, 4);
      whoRow.setLayoutParams(whoLp);
      TextView name = text(context, customer.length() > 0 ? customer : "Customer order", 14, INK_2, true);
      name.setMaxLines(1);
      name.setEllipsize(TextUtils.TruncateAt.END);
      name.setLayoutParams(new LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f));
      whoRow.addView(name);
      if (itemsLabel.length() > 0) {
        whoRow.addView(chip(context, itemsLabel, accentSoft(), accentInk(), dp(context, 8)));
      }
      bodyCol.addView(whoRow);
    }

    String itemsJson = safeText(row.optString("itemsJson", ""));
    final int maxRows = 5;
    String[][] items = OrderAlertCardText.itemCells(itemsJson, maxRows);
    if (items.length > 0) {
      TextView heading = text(context, "ORDER ITEMS", 11, MUTED, true);
      heading.setLetterSpacing(0.05f);
      LinearLayout.LayoutParams hLp = matchWrap();
      hLp.topMargin = dp(context, 12);
      heading.setLayoutParams(hLp);
      bodyCol.addView(heading);

      LinearLayout list = panel(context);
      ((LinearLayout.LayoutParams) list.getLayoutParams()).topMargin = dp(context, 6);
      for (int i = 0; i < items.length; i++) {
        LinearLayout r = new LinearLayout(context);
        r.setOrientation(LinearLayout.HORIZONTAL);
        r.setGravity(Gravity.CENTER_VERTICAL);
        LinearLayout.LayoutParams rLp = matchWrap();
        if (i > 0) rLp.topMargin = dp(context, 7);
        r.setLayoutParams(rLp);
        TextView qty = text(context, items[i][0] + "×", 12, accentInk(), true);
        qty.setGravity(Gravity.CENTER);
        qty.setMinWidth(dp(context, 34));
        qty.setBackground(rounded("#FFFFFF", dp(context, 8), LINE, dp(context, 1)));
        qty.setPadding(dp(context, 6), dp(context, 3), dp(context, 6), dp(context, 3));
        r.addView(qty);
        TextView n = text(context, items[i][1], 14, INK_2, false);
        n.setMaxLines(2);
        n.setEllipsize(TextUtils.TruncateAt.END);
        n.setPadding(dp(context, 10), 0, 0, 0);
        n.setLayoutParams(new LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f));
        r.addView(n);
        list.addView(r);
      }
      String more = OrderAlertCardText.moreItemsLabel(OrderAlertCardText.itemRowCount(itemsJson), items.length);
      if (more.length() > 0) {
        TextView moreView = text(context, more, 12, "#2563EB", true);
        moreView.setPadding(0, dp(context, 8), 0, 0);
        list.addView(moreView);
      }
      bodyCol.addView(list);
    } else {
      String detail = firstNonEmpty(title, body);
      if (!OrderAlertCardText.isGenericDetail(detail)) {
        TextView detailView = text(context, detail, 13, "#475569", false);
        detailView.setMaxLines(2);
        detailView.setPadding(0, dp(context, 6), 0, 0);
        bodyCol.addView(detailView);
      }
    }

    String money = OrderAlertCardText.formatAmount(amount);
    if (money.length() > 0) {
      LinearLayout totalRow = panel(context);
      totalRow.setOrientation(LinearLayout.HORIZONTAL);
      totalRow.setGravity(Gravity.CENTER_VERTICAL);
      TextView label = text(context, OrderAlertCardText.earningsCaption(), 13, "#475569", true);
      label.setLayoutParams(new LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f));
      totalRow.addView(label);
      if (paymentChip.length() > 0) {
        boolean cash = "Cash".equals(paymentChip);
        LinearLayout.LayoutParams pLp = new LinearLayout.LayoutParams(
            ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT);
        pLp.rightMargin = dp(context, 8);
        TextView pay = chip(context, cash ? "Cash" : "Paid", cash ? "#FFFBEB" : "#F0FDF4",
            cash ? "#92400E" : "#15803D", 0);
        pay.setLayoutParams(pLp);
        totalRow.addView(pay);
      }
      totalRow.addView(text(context, money, 22, INK, true));
      bodyCol.addView(totalRow);
    }
  }

  /** One timeline stop: coloured dot + connector, label + km chip, address. */
  private static LinearLayout routeStop(
      Context context,
      String label,
      String address,
      String kmChip,
      String dotColor,
      boolean connectorBelow
  ) {
    LinearLayout row = new LinearLayout(context);
    row.setOrientation(LinearLayout.HORIZONTAL);
    row.setLayoutParams(matchWrap());

    LinearLayout dotCol = new LinearLayout(context);
    dotCol.setOrientation(LinearLayout.VERTICAL);
    dotCol.setGravity(Gravity.CENTER_HORIZONTAL);
    dotCol.setPadding(0, dp(context, 4), 0, 0);
    dotCol.setLayoutParams(new LinearLayout.LayoutParams(dp(context, 12), ViewGroup.LayoutParams.MATCH_PARENT));
    View dot = new View(context);
    dot.setBackground(rounded(dotColor, dp(context, 5), null, 0));
    dot.setLayoutParams(new LinearLayout.LayoutParams(dp(context, 10), dp(context, 10)));
    dotCol.addView(dot);
    if (connectorBelow) {
      View connector = new View(context);
      connector.setBackgroundColor(Color.parseColor(LINE));
      LinearLayout.LayoutParams cLp = new LinearLayout.LayoutParams(dp(context, 2), 0, 1f);
      cLp.topMargin = dp(context, 4);
      connector.setLayoutParams(cLp);
      dotCol.addView(connector);
    }
    row.addView(dotCol);

    LinearLayout textCol = new LinearLayout(context);
    textCol.setOrientation(LinearLayout.VERTICAL);
    textCol.setPadding(dp(context, 10), 0, 0, dp(context, 10));
    textCol.setLayoutParams(new LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f));

    LinearLayout labelRow = new LinearLayout(context);
    labelRow.setOrientation(LinearLayout.HORIZONTAL);
    labelRow.setGravity(Gravity.CENTER_VERTICAL);
    labelRow.setLayoutParams(matchWrap());
    TextView labelView = text(context, label, 11, MUTED, true);
    labelView.setLetterSpacing(0.05f);
    labelView.setLayoutParams(new LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f));
    labelRow.addView(labelView);
    if (kmChip.length() > 0) {
      labelRow.addView(chip(context, kmChip, accentSoft(), accentInk(), dp(context, 6)));
    }
    textCol.addView(labelRow);

    TextView addr = text(context, address, 13, INK_2, false);
    addr.setMaxLines(3);
    addr.setEllipsize(TextUtils.TruncateAt.END);
    addr.setPadding(0, dp(context, 3), 0, 0);
    addr.setLineSpacing(dp(context, 2), 1f);
    textCol.addView(addr);
    row.addView(textCol);
    return row;
  }

  /**
   * Wrap the body in a ScrollView capped at half the screen, so a long item
   * list never pushes the CTA off a small phone. Short bodies keep their own
   * height (no empty scroll area).
   */
  private static View capHeight(Context context, LinearLayout bodyCol) {
    DisplayMetrics dm = context.getResources().getDisplayMetrics();
    int maxPx = Math.round(dm.heightPixels * 0.5f);
    int widthPx = Math.max(dp(context, 200), dm.widthPixels - dp(context, 20));
    int measured = 0;
    try {
      bodyCol.measure(
          View.MeasureSpec.makeMeasureSpec(widthPx, View.MeasureSpec.EXACTLY),
          View.MeasureSpec.makeMeasureSpec(0, View.MeasureSpec.UNSPECIFIED));
      measured = bodyCol.getMeasuredHeight();
    } catch (Throwable ignored) {
    }
    ScrollView scroll = new ScrollView(context);
    scroll.setVerticalScrollBarEnabled(false);
    scroll.setOverScrollMode(View.OVER_SCROLL_NEVER);
    scroll.setFillViewport(false);
    scroll.addView(bodyCol, new ViewGroup.LayoutParams(
        ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT));
    scroll.setLayoutParams(new LinearLayout.LayoutParams(
        ViewGroup.LayoutParams.MATCH_PARENT,
        measured > maxPx ? maxPx : ViewGroup.LayoutParams.WRAP_CONTENT));
    return scroll;
  }

  /**
   * Ticks the clock and the timer bar once per second.
   *
   * Stops once its view has left the window (card replaced, refreshed or
   * hidden) — a detached card must not keep a timer alive. Offer expiry itself
   * is owned by the foreground service, which runs whether or not a card is on
   * screen; the stop here is only the visible card's own courtesy.
   */
  private static void startCountdown(
      final Context context,
      final TextView label,
      final View fill,
      final String sessionId,
      final long startedAtMs,
      final long expiresAtMs
  ) {
    final Context app = context.getApplicationContext();
    final Runnable[] tick = new Runnable[1];
    final int[] attach = new int[] {0, 0}; // seen attached, ticks before attach
    final boolean[] urgentNow = new boolean[] {false};
    tick[0] = () -> {
      if (label.isAttachedToWindow()) {
        attach[0] = 1;
      } else if (attach[0] == 1 || ++attach[1] > 8) {
        return;
      }
      long now = System.currentTimeMillis();
      long leftMs = expiresAtMs - now;
      boolean urgent = OrderAlertCardText.isUrgent(expiresAtMs, now);
      if (urgent != urgentNow[0]) {
        urgentNow[0] = urgent;
        styleTimer(context, label, urgent);
        if (fill != null) fill.setBackground(rounded(urgent ? "#EF4444" : accent(), dp(context, 2), null, 0));
      }
      if (leftMs <= 0L) {
        label.setText("Expired");
        if (fill != null) fill.setScaleX(0f);
        try {
          OrderAlertController.stop(app, sessionId);
        } catch (Throwable ignored) {
        }
        return;
      }
      label.setText(OrderAlertCardText.countdownClock(expiresAtMs, now));
      if (fill != null) {
        float f = OrderAlertCardText.remainingFraction(startedAtMs, expiresAtMs, now + 1000L);
        if (f >= 0f) {
          fill.animate().scaleX(f).setDuration(1000L).setInterpolator(new LinearInterpolator()).start();
        }
      }
      MAIN.postDelayed(tick[0], 1000L);
    };
    MAIN.post(tick[0]);
  }

  private static void styleTimer(Context context, TextView timer, boolean urgent) {
    timer.setTextColor(Color.parseColor(urgent ? URGENT : accentInk()));
    timer.setBackground(rounded(urgent ? "#FEF2F2" : accentSoft(), dp(context, 999),
        urgent ? "#FECACA" : null, urgent ? dp(context, 1) : 0));
  }

  /** Accepts epoch millis or an ISO-8601 instant; 0 means "no usable deadline". */
  static long parseEpochMs(String raw) {
    return OrderAlertCardText.parseEpochMs(raw);
  }

  /** Gap above the system navigation bar so the CTA stays tappable. */
  static int bottomSafePx(Context context) {
    int nav = 0;
    try {
      int resId = context.getResources().getIdentifier("navigation_bar_height", "dimen", "android");
      if (resId > 0) nav = context.getResources().getDimensionPixelSize(resId);
    } catch (Throwable ignored) {
    }
    return nav + dp(context, 12);
  }

  // ------------------------------------------------------------------------
  // View helpers
  // ------------------------------------------------------------------------

  private static TextView text(Context context, String value, int sp, String color, boolean bold) {
    TextView tv = new TextView(context);
    tv.setText(value);
    tv.setTextSize(sp);
    tv.setTextColor(Color.parseColor(color));
    tv.setIncludeFontPadding(false);
    tv.setTypeface(bold ? Typeface.DEFAULT_BOLD : Typeface.create("sans-serif", Typeface.NORMAL));
    return tv;
  }

  private static TextView chip(Context context, String value, String bg, String fg, int leftMarginPx) {
    TextView tv = text(context, value, 11, fg, true);
    tv.setSingleLine(true);
    tv.setEllipsize(TextUtils.TruncateAt.END);
    tv.setBackground(rounded(bg, dp(context, 999), null, 0));
    tv.setPadding(dp(context, 9), dp(context, 4), dp(context, 9), dp(context, 4));
    LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(
        ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT);
    lp.leftMargin = leftMarginPx;
    tv.setLayoutParams(lp);
    return tv;
  }

  /** Soft slate panel (earnings / items / total), as the in-app cards. */
  private static LinearLayout panel(Context context) {
    LinearLayout box = new LinearLayout(context);
    box.setOrientation(LinearLayout.VERTICAL);
    box.setBackground(rounded(SURFACE, dp(context, 12), LINE, dp(context, 1)));
    box.setPadding(dp(context, 12), dp(context, 10), dp(context, 12), dp(context, 10));
    LinearLayout.LayoutParams lp = matchWrap();
    lp.topMargin = dp(context, 10);
    box.setLayoutParams(lp);
    return box;
  }

  private static GradientDrawable rounded(String fill, int radiusPx, String stroke, int strokePx) {
    GradientDrawable d = new GradientDrawable();
    d.setColor(Color.parseColor(fill));
    d.setCornerRadius(radiusPx);
    if (stroke != null && strokePx > 0) d.setStroke(strokePx, Color.parseColor(stroke));
    return d;
  }

  private static LinearLayout.LayoutParams matchWrap() {
    return new LinearLayout.LayoutParams(
        ViewGroup.LayoutParams.MATCH_PARENT,
        ViewGroup.LayoutParams.WRAP_CONTENT
    );
  }

  /** The session row's value when it has one, else the caller's argument. */
  private static String pick(String fromRow, String fromArgs) {
    String a = safeText(fromRow);
    return a.length() > 0 ? a : safeText(fromArgs);
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

  private static String sessionSafe(String value) {
    return value == null || value.trim().length() == 0 ? "-" : value.trim();
  }

  private static int dp(Context context, int value) {
    float density = context.getResources().getDisplayMetrics().density;
    return Math.round(value * density);
  }
}
