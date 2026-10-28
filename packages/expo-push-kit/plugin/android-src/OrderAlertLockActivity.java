package {{PACKAGE}};

import android.app.Activity;
import android.graphics.Color;
import android.os.Build;
import android.os.Bundle;
import android.os.PowerManager;
import android.view.Gravity;
import android.view.MotionEvent;
import android.view.View;
import android.view.Window;
import android.view.WindowManager;
import android.widget.FrameLayout;
import java.lang.ref.WeakReference;
import org.json.JSONObject;

/**
 * Lock-screen host for the same floating NEW ORDER card shown on the home screen.
 * Turns the screen on and shows over the keyguard. Transparent window — no dimmed
 * full-screen flash (that was the unwanted duplicate UI).
 */
public class OrderAlertLockActivity extends Activity {
  private static WeakReference<OrderAlertLockActivity> live;
  private static final float SWIPE_DISMISS_DP = 96f;
  private PowerManager.WakeLock screenWake;

  static void finishLive() {
    try {
      OrderAlertLockActivity activity = live != null ? live.get() : null;
      if (activity != null && !activity.isFinishing()) {
        activity.runOnUiThread(() -> {
          try {
            if (!activity.isFinishing()) activity.finish();
          } catch (Throwable ignored) {
          }
        });
      }
    } catch (Throwable ignored) {
    }
  }

  @Override
  protected void onCreate(Bundle savedInstanceState) {
    super.onCreate(savedInstanceState);
    live = new WeakReference<>(this);

    JSONObject row = OrderAlertController.getActive(this);
    String sid = "";
    if (getIntent() != null) {
      String fromIntent = getIntent().getStringExtra(OrderAlertController.EXTRA_SESSION_ID);
      if (fromIntent != null) sid = fromIntent.trim();
    }
    if (sid.length() == 0 && row != null) sid = row.optString("sessionId", "");

    if (row == null || sid.length() == 0 || OrderAlertOverlay.isCardDismissed(this, sid)) {
      finish();
      return;
    }

    // While lock UI hosts the card, hide any WindowManager twin to avoid duplicates.
    try {
      OrderAlertOverlay.hideAll(getApplicationContext());
    } catch (Throwable ignored) {
    }

    requestShowOverKeyguard();
    pulseScreenOn();

    Window window = getWindow();
    if (window != null) {
      window.setBackgroundDrawableResource(android.R.color.transparent);
      window.clearFlags(WindowManager.LayoutParams.FLAG_DIM_BEHIND);
      WindowManager.LayoutParams wp = window.getAttributes();
      if (wp != null) {
        wp.dimAmount = 0f;
        window.setAttributes(wp);
      }
    }

    FrameLayout root = new FrameLayout(this);
    root.setBackgroundColor(Color.TRANSPARENT);
    View card = OrderAlertOverlay.buildCard(
        this,
        sid,
        row.optString("orderId", ""),
        row.optString("offerId", ""),
        "NEW ORDER",
        row.optString("body", ""),
        row.optString("pickup", ""),
        row.optString("drop", ""),
        row.optString("orderType", "")
    );
    FrameLayout.LayoutParams lp = new FrameLayout.LayoutParams(
        FrameLayout.LayoutParams.MATCH_PARENT,
        FrameLayout.LayoutParams.WRAP_CONTENT
    );
    lp.gravity = Gravity.BOTTOM;
    lp.bottomMargin = OrderAlertOverlay.bottomSafePx(this);
    root.addView(card, lp);

    View titleHandle = card.findViewWithTag("gm_overlay_title");
    View priceHandle = card.findViewWithTag("gm_overlay_price");
    if (titleHandle != null) attachSwipe(titleHandle, card, sid);
    if (priceHandle != null) attachSwipe(priceHandle, card, sid);

    setContentView(root);
    AlertEngineLog.log(this, "LOCK_CARD_SHOWN", sid, row.optString("orderId", ""), null);
  }

  private void requestShowOverKeyguard() {
    try {
      if (Build.VERSION.SDK_INT >= 27) {
        setShowWhenLocked(true);
        setTurnScreenOn(true);
      } else {
        getWindow().addFlags(
            WindowManager.LayoutParams.FLAG_SHOW_WHEN_LOCKED
                | WindowManager.LayoutParams.FLAG_TURN_SCREEN_ON
                | WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON
        );
      }
      getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
    } catch (Throwable ignored) {
    }
  }

  private void pulseScreenOn() {
    try {
      PowerManager pm = (PowerManager) getSystemService(POWER_SERVICE);
      if (pm == null) return;
      // Deprecated flags still work for turning the display on from a lock FSI.
      @SuppressWarnings("deprecation")
      int flags = PowerManager.SCREEN_BRIGHT_WAKE_LOCK | PowerManager.ACQUIRE_CAUSES_WAKEUP;
      screenWake = pm.newWakeLock(flags, "gatimitra:order-lock-card");
      screenWake.setReferenceCounted(false);
      screenWake.acquire(15_000L);
    } catch (Throwable ignored) {
    }
  }

  private void attachSwipe(final View gestureTarget, final View translateTarget, final String sessionId) {
    final float dismissPx = SWIPE_DISMISS_DP * getResources().getDisplayMetrics().density;
    final float[] start = new float[3];
    gestureTarget.setOnTouchListener((v, event) -> {
      switch (event.getActionMasked()) {
        case MotionEvent.ACTION_DOWN:
          start[0] = event.getRawX();
          start[1] = translateTarget.getTranslationX();
          start[2] = 0f;
          return true;
        case MotionEvent.ACTION_MOVE: {
          float dx = event.getRawX() - start[0];
          if (Math.abs(dx) > 8f * getResources().getDisplayMetrics().density) start[2] = 1f;
          translateTarget.setTranslationX(start[1] + dx);
          return true;
        }
        case MotionEvent.ACTION_UP:
        case MotionEvent.ACTION_CANCEL: {
          float dx = translateTarget.getTranslationX();
          if (start[2] > 0f && Math.abs(dx) >= dismissPx) {
            OrderAlertOverlay.dismissCardByUser(this, sessionId);
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

  @Override
  protected void onResume() {
    super.onResume();
    if (OrderAlertController.getActive(this) == null) {
      finish();
    }
  }

  @Override
  protected void onDestroy() {
    try {
      if (screenWake != null && screenWake.isHeld()) screenWake.release();
    } catch (Throwable ignored) {
    }
    screenWake = null;
    try {
      OrderAlertLockActivity cur = live != null ? live.get() : null;
      if (cur == this) live = null;
    } catch (Throwable ignored) {
    }
    super.onDestroy();
  }
}
