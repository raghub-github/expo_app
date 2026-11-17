package {{PACKAGE}};

import android.util.Log;
import com.google.firebase.messaging.RemoteMessage;
import expo.modules.notifications.service.ExpoFirebaseMessagingService;
import java.util.Map;

/**
 * Customer-app FCM entry for Zomato-style marketing layouts.
 * When layout_style is set, native RemoteViews owns the tray (skip Expo twin).
 */
public class CustomerMarketingMessagingService extends ExpoFirebaseMessagingService {
  private static final String TAG = "GmMarketingFcm";

  @Override
  public void onMessageReceived(RemoteMessage remoteMessage) {
    boolean nativeOwns = false;
    try {
      Map<String, String> data =
          remoteMessage != null ? remoteMessage.getData() : null;
      if (data != null && MarketingNotificationRenderer.shouldHandle(data)) {
        nativeOwns = MarketingNotificationRenderer.handleRemoteMessage(this, data);
      }
    } catch (Throwable t) {
      Log.w(TAG, "marketing render failed: " + t.getMessage());
    }
    if (nativeOwns) {
      Log.i(TAG, "consumed marketing FCM, skip Expo renderer");
      return;
    }
    super.onMessageReceived(remoteMessage);
  }
}
