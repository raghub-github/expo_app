package {{PACKAGE}};

import android.util.Log;
import com.google.firebase.messaging.RemoteMessage;
import expo.modules.notifications.service.ExpoFirebaseMessagingService;

/**
 * Subclasses Expo's FCM service so killed/background data messages can start
 * the native order-alert FGS without replacing Expo token / tray handling.
 *
 * Display (notification+data) messages still go to Expo via super, except
 * silent control payloads (gmAlertControl=1) which must not create a second tray item.
 */
public class CriticalAlertMessagingService extends ExpoFirebaseMessagingService {
  private static final String TAG = "GmOrderAlertFcm";

  @Override
  public void onMessageReceived(RemoteMessage remoteMessage) {
    boolean nativeOwns = false;
    try {
      OrderAlertOverlay.debug(
          this,
          "FCM_RECEIVED",
          remoteMessage != null && remoteMessage.getData() != null
              ? String.valueOf(remoteMessage.getData().get("alertSessionId"))
              : "",
          remoteMessage != null && remoteMessage.getData() != null
              ? String.valueOf(remoteMessage.getData().get("orderId"))
              : "",
          "from=" + (remoteMessage != null ? remoteMessage.getFrom() : "")
      );
      // true ⇒ native FGS/HeadsUp owns the tray; Expo must not post a twin.
      nativeOwns = OrderAlertController.handleRemoteMessage(this, remoteMessage);
    } catch (Throwable t) {
      Log.w(TAG, "handleRemoteMessage failed: " + t.getMessage());
    }
    if (nativeOwns) {
      Log.i(TAG, "consumed critical/control FCM, skip Expo renderer");
      return;
    }
    super.onMessageReceived(remoteMessage);
  }
}
