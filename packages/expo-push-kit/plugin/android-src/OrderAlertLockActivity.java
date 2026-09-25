package {{PACKAGE}};

import android.app.Activity;
import android.os.Build;
import android.os.Bundle;
import android.view.Gravity;
import android.view.WindowManager;
import android.view.View;
import android.widget.FrameLayout;
import org.json.JSONObject;

/**
 * Shown over the keyguard via full-screen intent. Does not mount React Native.
 * The card is the same bottom order alert; Accept/Reject go through OrderAlertActions.
 */
public class OrderAlertLockActivity extends Activity {
  @Override
  protected void onCreate(Bundle savedInstanceState) {
    super.onCreate(savedInstanceState);
    if (Build.VERSION.SDK_INT >= 27) {
      setShowWhenLocked(true);
      setTurnScreenOn(true);
    } else {
      getWindow().addFlags(
          WindowManager.LayoutParams.FLAG_SHOW_WHEN_LOCKED
              | WindowManager.LayoutParams.FLAG_TURN_SCREEN_ON
      );
    }
    JSONObject row = OrderAlertController.getActive(this);
    if (row == null) {
      finish();
      return;
    }
    String sid = getIntent() != null
        ? getIntent().getStringExtra(OrderAlertController.EXTRA_SESSION_ID)
        : "";
    if (sid == null || sid.length() == 0) sid = row.optString("sessionId", "");
    FrameLayout root = new FrameLayout(this);
    root.setBackgroundColor(0x66000000);
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
    lp.leftMargin = 0;
    lp.rightMargin = 0;
    lp.bottomMargin = OrderAlertOverlay.bottomSafePx(this);
    root.addView(card, lp);
    setContentView(root);
  }
}
