/**
 * Android offline connectivity monitor (Zomato-style tray alert while process is alive).
 *
 * Registers ConnectivityManager.NetworkCallback via a ContentProvider so the
 * callback stays active whenever the merchant app process is running
 * (foreground OR background). Posts / clears a local notification on loss / restore.
 *
 * Note: force-stopped apps cannot receive callbacks until the user opens them again
 * (Android platform limit — same for any app without an always-on FGS).
 *
 * Props: title, body, channelId, channelName, notificationId
 */
const fs = require("fs");
const path = require("path");
const {
  withAndroidManifest,
  withDangerousMod,
  AndroidConfig,
} = require("@expo/config-plugins");

const DEFAULTS = {
  title: "🚫 Oops, no network available!",
  body: "Please check your internet connection and try again",
  channelId: "merchant_connectivity",
  channelName: "Connectivity",
  notificationId: 91002,
};

function ensureUsesPermission(androidManifest, name) {
  const manifest = androidManifest.manifest;
  if (!manifest["uses-permission"]) manifest["uses-permission"] = [];
  const list = manifest["uses-permission"];
  if (!list.some((p) => p?.$?.["android:name"] === name)) {
    list.push({ $: { "android:name": name } });
  }
}

function ensureAccessNetworkState(androidManifest) {
  ensureUsesPermission(androidManifest, "android.permission.ACCESS_NETWORK_STATE");
  ensureUsesPermission(androidManifest, "android.permission.POST_NOTIFICATIONS");
  ensureUsesPermission(androidManifest, "android.permission.VIBRATE");
}

function ensureProvider(androidManifest, packageName) {
  const app = AndroidConfig.Manifest.getMainApplicationOrThrow(androidManifest);
  if (!app.provider) app.provider = [];
  const name = `${packageName}.OfflineConnectivityInitProvider`;
  if (app.provider.some((p) => p?.$?.["android:name"] === name)) return;
  app.provider.push({
    $: {
      "android:name": name,
      "android:authorities": `${packageName}.offline-connectivity-init`,
      "android:exported": "false",
      "android:initOrder": "99",
    },
  });
}

function monitorJavaSource({ packageName, title, body, channelId, channelName, notificationId }) {
  const esc = (s) => String(s).replace(/\\/g, "\\\\").replace(/"/g, '\\"');
  return `package ${packageName};

import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.net.ConnectivityManager;
import android.net.Network;
import android.net.NetworkCapabilities;
import android.os.Build;
import android.os.Handler;
import android.os.Looper;
import androidx.annotation.NonNull;
import androidx.core.app.NotificationCompat;
import androidx.core.app.NotificationManagerCompat;

/**
 * Process-scoped network monitor. Survives Activity pause / backgrounding as long
 * as the app process is alive (same window Zomato uses for offline tray alerts).
 */
public final class OfflineConnectivityMonitor {
  private static final String CHANNEL_ID = "${esc(channelId)}";
  private static final String CHANNEL_NAME = "${esc(channelName)}";
  private static final int NOTIFICATION_ID = ${Number(notificationId) || 91002};
  private static final String TITLE = "${esc(title)}";
  private static final String BODY = "${esc(body)}";
  /** Debounce flaky handoffs (wifi↔cell) so we don't spam the tray. */
  private static final long OFFLINE_DEBOUNCE_MS = 1200L;

  private static final Object LOCK = new Object();
  private static boolean registered = false;
  private static ConnectivityManager.NetworkCallback callback;
  private static final Handler MAIN = new Handler(Looper.getMainLooper());
  private static Runnable pendingOffline;

  private OfflineConnectivityMonitor() {}

  public static void ensureStarted(@NonNull Context context) {
    final Context app = context.getApplicationContext();
    synchronized (LOCK) {
      if (registered) return;
      ConnectivityManager cm =
          (ConnectivityManager) app.getSystemService(Context.CONNECTIVITY_SERVICE);
      if (cm == null) return;

      callback =
          new ConnectivityManager.NetworkCallback() {
            @Override
            public void onAvailable(@NonNull Network network) {
              cancelPendingOffline();
              MAIN.post(() -> dismissOffline(app));
            }

            @Override
            public void onLost(@NonNull Network network) {
              scheduleOfflineCheck(app, cm);
            }

            @Override
            public void onUnavailable() {
              scheduleOfflineCheck(app, cm);
            }

            @Override
            public void onCapabilitiesChanged(
                @NonNull Network network, @NonNull NetworkCapabilities caps) {
              if (hasInternet(caps)) {
                cancelPendingOffline();
                MAIN.post(() -> dismissOffline(app));
              } else {
                scheduleOfflineCheck(app, cm);
              }
            }
          };

      try {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.N) {
          return;
        }
        cm.registerDefaultNetworkCallback(callback);
        registered = true;
        // Sync tray with current state on cold start.
        if (!isOnline(cm)) {
          MAIN.post(() -> showOffline(app));
        } else {
          MAIN.post(() -> dismissOffline(app));
        }
      } catch (Throwable ignored) {
        registered = false;
        callback = null;
      }
    }
  }

  private static void scheduleOfflineCheck(Context app, ConnectivityManager cm) {
    cancelPendingOffline();
    pendingOffline =
        () -> {
          pendingOffline = null;
          if (!isOnline(cm)) {
            showOffline(app);
          }
        };
    MAIN.postDelayed(pendingOffline, OFFLINE_DEBOUNCE_MS);
  }

  private static void cancelPendingOffline() {
    if (pendingOffline != null) {
      MAIN.removeCallbacks(pendingOffline);
      pendingOffline = null;
    }
  }

  private static boolean isOnline(ConnectivityManager cm) {
    try {
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
        Network active = cm.getActiveNetwork();
        if (active == null) return false;
        NetworkCapabilities caps = cm.getNetworkCapabilities(active);
        return hasInternet(caps);
      }
      @SuppressWarnings("deprecation")
      android.net.NetworkInfo info = cm.getActiveNetworkInfo();
      return info != null && info.isConnected();
    } catch (Throwable t) {
      return true;
    }
  }

  private static boolean hasInternet(NetworkCapabilities caps) {
    if (caps == null) return false;
    return caps.hasCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET);
  }

  private static void showOffline(Context context) {
    try {
      ensureChannel(context);
      Intent launch = context.getPackageManager().getLaunchIntentForPackage(context.getPackageName());
      if (launch == null) {
        launch = new Intent(context, Class.forName("${packageName}.MainActivity"));
      }
      launch.addFlags(
          Intent.FLAG_ACTIVITY_NEW_TASK
              | Intent.FLAG_ACTIVITY_CLEAR_TOP
              | Intent.FLAG_ACTIVITY_SINGLE_TOP);

      int flags = PendingIntent.FLAG_UPDATE_CURRENT;
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
        flags |= PendingIntent.FLAG_IMMUTABLE;
      }
      PendingIntent contentIntent =
          PendingIntent.getActivity(context, NOTIFICATION_ID, launch, flags);

      NotificationCompat.Builder builder =
          new NotificationCompat.Builder(context, CHANNEL_ID)
              .setSmallIcon(getSmallIcon(context))
              .setContentTitle(TITLE)
              .setContentText(BODY)
              .setStyle(new NotificationCompat.BigTextStyle().bigText(BODY))
              .setPriority(NotificationCompat.PRIORITY_HIGH)
              .setCategory(NotificationCompat.CATEGORY_STATUS)
              .setOngoing(true)
              .setOnlyAlertOnce(true)
              .setAutoCancel(false)
              .setContentIntent(contentIntent);

      NotificationManagerCompat.from(context).notify(NOTIFICATION_ID, builder.build());
    } catch (Throwable ignored) {
      // Never crash the process for a tray alert.
    }
  }

  private static void dismissOffline(Context context) {
    try {
      NotificationManagerCompat.from(context).cancel(NOTIFICATION_ID);
    } catch (Throwable ignored) {
    }
  }

  private static void ensureChannel(Context context) {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return;
    NotificationManager nm = context.getSystemService(NotificationManager.class);
    if (nm == null) return;
    if (nm.getNotificationChannel(CHANNEL_ID) != null) return;
    NotificationChannel channel =
        new NotificationChannel(CHANNEL_ID, CHANNEL_NAME, NotificationManager.IMPORTANCE_HIGH);
    channel.setDescription(BODY);
    channel.enableVibration(true);
    nm.createNotificationChannel(channel);
  }

  private static int getSmallIcon(Context context) {
    int res =
        context
            .getResources()
            .getIdentifier("notification_icon", "drawable", context.getPackageName());
    if (res != 0) return res;
    res =
        context.getResources().getIdentifier("ic_launcher", "mipmap", context.getPackageName());
    if (res != 0) return res;
    return android.R.drawable.ic_dialog_info;
  }
}
`;
}

function providerJavaSource(packageName) {
  return `package ${packageName};

import android.content.ContentProvider;
import android.content.ContentValues;
import android.database.Cursor;
import android.net.Uri;
import androidx.annotation.NonNull;
import androidx.annotation.Nullable;

/**
 * Starts {@link OfflineConnectivityMonitor} as soon as the app process is created
 * (before JS loads), so backgrounded sessions still get offline tray alerts.
 */
public class OfflineConnectivityInitProvider extends ContentProvider {
  @Override
  public boolean onCreate() {
    if (getContext() != null) {
      OfflineConnectivityMonitor.ensureStarted(getContext());
    }
    return true;
  }

  @Nullable
  @Override
  public Cursor query(
      @NonNull Uri uri,
      @Nullable String[] projection,
      @Nullable String selection,
      @Nullable String[] selectionArgs,
      @Nullable String sortOrder) {
    return null;
  }

  @Nullable
  @Override
  public String getType(@NonNull Uri uri) {
    return null;
  }

  @Nullable
  @Override
  public Uri insert(@NonNull Uri uri, @Nullable ContentValues values) {
    return null;
  }

  @Override
  public int delete(
      @NonNull Uri uri, @Nullable String selection, @Nullable String[] selectionArgs) {
    return 0;
  }

  @Override
  public int update(
      @NonNull Uri uri,
      @Nullable ContentValues values,
      @Nullable String selection,
      @Nullable String[] selectionArgs) {
    return 0;
  }
}
`;
}

function withOfflineConnectivityMonitor(config, props = {}) {
  const options = { ...DEFAULTS, ...props };

  config = withAndroidManifest(config, (cfg) => {
    ensureAccessNetworkState(cfg.modResults);
    const packageName =
      cfg.android?.package ||
      cfg.modRequest?.projectConfig?.android?.package ||
      config.android?.package;
    if (packageName) {
      ensureProvider(cfg.modResults, packageName);
    }
    return cfg;
  });

  config = withDangerousMod(config, [
    "android",
    async (cfg) => {
      const packageName = cfg.android?.package || config.android?.package;
      if (!packageName) return cfg;
      const packagePath = packageName.replace(/\./g, "/");
      const javaDir = path.join(
        cfg.modRequest.platformProjectRoot,
        "app",
        "src",
        "main",
        "java",
        packagePath
      );
      fs.mkdirSync(javaDir, { recursive: true });
      fs.writeFileSync(
        path.join(javaDir, "OfflineConnectivityMonitor.java"),
        monitorJavaSource({ packageName, ...options }),
        "utf8"
      );
      fs.writeFileSync(
        path.join(javaDir, "OfflineConnectivityInitProvider.java"),
        providerJavaSource(packageName),
        "utf8"
      );
      return cfg;
    },
  ]);

  return config;
}

module.exports = withOfflineConnectivityMonitor;
