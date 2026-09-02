/**
 * Android BOOT_COMPLETED → local system notification prompting the user to
 * reopen the app so order alerts resume after a device restart.
 *
 * Props:
 *   title, body, channelId, channelName, notificationId
 */
const fs = require("fs");
const path = require("path");
const {
  withAndroidManifest,
  withDangerousMod,
  withMainActivity,
  AndroidConfig,
} = require("@expo/config-plugins");

const DEFAULTS = {
  title: "Reconnect to receive orders",
  body: "Your device was restarted. Open the app to resume order notifications.",
  channelId: "boot_reconnect",
  channelName: "Reconnect after restart",
  notificationId: 91001,
};

const MAIN_ACTIVITY_HOOK = "BootReconnectHelper.showPendingIfNeeded(this)";

function ensureUsesPermission(androidManifest, name) {
  const manifest = androidManifest.manifest;
  if (!manifest["uses-permission"]) manifest["uses-permission"] = [];
  const list = manifest["uses-permission"];
  if (!list.some((p) => p?.$?.["android:name"] === name)) {
    list.push({ $: { "android:name": name } });
  }
}

function ensureBootReceiver(androidManifest, packageName) {
  const app = AndroidConfig.Manifest.getMainApplicationOrThrow(androidManifest);
  if (!app.receiver) app.receiver = [];
  const receiverName = `${packageName}.BootReconnectReceiver`;
  const exists = app.receiver.some((r) => r?.$?.["android:name"] === receiverName);
  if (exists) return;

  app.receiver.push({
    $: {
      "android:name": receiverName,
      "android:enabled": "true",
      "android:exported": "true",
      "android:directBootAware": "false",
    },
    "intent-filter": [
      {
        action: [
          { $: { "android:name": "android.intent.action.BOOT_COMPLETED" } },
          { $: { "android:name": "android.intent.action.LOCKED_BOOT_COMPLETED" } },
          { $: { "android:name": "android.intent.action.QUICKBOOT_POWERON" } },
          { $: { "android:name": "com.htc.intent.action.QUICKBOOT_POWERON" } },
        ],
      },
    ],
  });
}

function helperJavaSource({ packageName, title, body, channelId, channelName, notificationId }) {
  const esc = (s) => String(s).replace(/\\/g, "\\\\").replace(/"/g, '\\"');
  return `package ${packageName};

import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.os.Build;
import androidx.core.app.NotificationCompat;
import androidx.core.app.NotificationManagerCompat;

/** Shared boot-reconnect tray logic (receiver + MainActivity resume). */
public final class BootReconnectHelper {
  private static final String PREFS = "gatimitra_boot_reconnect";
  private static final String PENDING_KEY = "pending";
  private static final String CHANNEL_ID = "${esc(channelId)}";
  private static final String CHANNEL_NAME = "${esc(channelName)}";
  private static final int NOTIFICATION_ID = ${Number(notificationId) || 91001};
  private static final String TITLE = "${esc(title)}";
  private static final String BODY = "${esc(body)}";

  private BootReconnectHelper() {}

  public static void markPending(Context context) {
    prefs(context).edit().putBoolean(PENDING_KEY, true).apply();
  }

  public static void clearPending(Context context) {
    prefs(context).edit().remove(PENDING_KEY).apply();
  }

  public static void showPendingIfNeeded(Context context) {
    if (!prefs(context).getBoolean(PENDING_KEY, false)) return;
    if (!NotificationManagerCompat.from(context).areNotificationsEnabled()) return;
    if (showNotification(context)) {
      clearPending(context);
    }
  }

  public static boolean showNotification(Context context) {
    try {
      if (!NotificationManagerCompat.from(context).areNotificationsEnabled()) {
        markPending(context);
        return false;
      }
      ensureChannel(context);

      Intent launch = context.getPackageManager().getLaunchIntentForPackage(context.getPackageName());
      if (launch == null) {
        launch = new Intent(context, Class.forName("${packageName}.MainActivity"));
      }
      launch.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP | Intent.FLAG_ACTIVITY_SINGLE_TOP);
      launch.putExtra("boot_reconnect", true);

      int flags = PendingIntent.FLAG_UPDATE_CURRENT;
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
        flags |= PendingIntent.FLAG_IMMUTABLE;
      }
      PendingIntent contentIntent = PendingIntent.getActivity(context, NOTIFICATION_ID, launch, flags);

      NotificationCompat.Builder builder = new NotificationCompat.Builder(context, CHANNEL_ID)
          .setSmallIcon(getSmallIcon(context))
          .setContentTitle(TITLE)
          .setContentText(BODY)
          .setStyle(new NotificationCompat.BigTextStyle().bigText(BODY))
          .setPriority(NotificationCompat.PRIORITY_HIGH)
          .setCategory(NotificationCompat.CATEGORY_REMINDER)
          .setAutoCancel(true)
          .setContentIntent(contentIntent);

      NotificationManagerCompat.from(context).notify(NOTIFICATION_ID, builder.build());
      return true;
    } catch (Throwable ignored) {
      return false;
    }
  }

  private static SharedPreferences prefs(Context context) {
    return context.getApplicationContext().getSharedPreferences(PREFS, Context.MODE_PRIVATE);
  }

  private static void ensureChannel(Context context) {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return;
    NotificationManager nm = context.getSystemService(NotificationManager.class);
    if (nm == null) return;
    NotificationChannel existing = nm.getNotificationChannel(CHANNEL_ID);
    if (existing != null) return;
    NotificationChannel channel = new NotificationChannel(
        CHANNEL_ID,
        CHANNEL_NAME,
        NotificationManager.IMPORTANCE_HIGH
    );
    channel.setDescription(BODY);
    nm.createNotificationChannel(channel);
  }

  private static int getSmallIcon(Context context) {
    int res = context.getResources().getIdentifier("notification_icon", "drawable", context.getPackageName());
    if (res != 0) return res;
    res = context.getResources().getIdentifier("ic_launcher", "mipmap", context.getPackageName());
    if (res != 0) return res;
    return android.R.drawable.ic_dialog_info;
  }
}
`;
}

function receiverJavaSource({ packageName }) {
  return `package ${packageName};

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

/** Posts a reconnect notification after the device boots so partners reopen the app. */
public class BootReconnectReceiver extends BroadcastReceiver {
  @Override
  public void onReceive(Context context, Intent intent) {
    if (intent == null) return;
    String action = intent.getAction();
    if (action == null) return;
    if (!Intent.ACTION_BOOT_COMPLETED.equals(action)
        && !"android.intent.action.LOCKED_BOOT_COMPLETED".equals(action)
        && !"android.intent.action.QUICKBOOT_POWERON".equals(action)
        && !"com.htc.intent.action.QUICKBOOT_POWERON".equals(action)) {
      return;
    }

    try {
      if (!BootReconnectHelper.showNotification(context)) {
        BootReconnectHelper.markPending(context);
      }
    } catch (Throwable ignored) {
      // Never crash the boot receiver.
    }
  }
}
`;
}

function withBootReconnectNotification(config, props = {}) {
  const options = { ...DEFAULTS, ...props };
  let packageNameForMain =
    config.android?.package || "com.gatimitra.partner";

  config = withAndroidManifest(config, (cfg) => {
    ensureUsesPermission(cfg.modResults, "android.permission.RECEIVE_BOOT_COMPLETED");
    ensureUsesPermission(cfg.modResults, "android.permission.POST_NOTIFICATIONS");
    ensureUsesPermission(cfg.modResults, "android.permission.VIBRATE");
    const packageName =
      cfg.android?.package ||
      cfg.modRequest?.projectConfig?.android?.package ||
      config.android?.package;
    if (packageName) {
      packageNameForMain = packageName;
      ensureBootReceiver(cfg.modResults, packageName);
    }
    return cfg;
  });

  config = withMainActivity(config, (cfg) => {
    if (cfg.modResults.contents.includes(MAIN_ACTIVITY_HOOK)) {
      return cfg;
    }
    const hook = `
    // Deferred boot-reconnect tray when POST_NOTIFICATIONS was not granted at boot.
    try {
      ${packageNameForMain}.BootReconnectHelper.showPendingIfNeeded(this);
    } catch (Throwable ignored) {
    }
`;
    if (cfg.modResults.contents.includes("super.onCreate(null);")) {
      cfg.modResults.contents = cfg.modResults.contents.replace(
        "super.onCreate(null);",
        `super.onCreate(null);${hook}`
      );
    } else if (cfg.modResults.contents.includes("super.onCreate(savedInstanceState);")) {
      cfg.modResults.contents = cfg.modResults.contents.replace(
        "super.onCreate(savedInstanceState);",
        `super.onCreate(savedInstanceState);${hook}`
      );
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
        path.join(javaDir, "BootReconnectHelper.java"),
        helperJavaSource({ packageName, ...options }),
        "utf8"
      );
      fs.writeFileSync(
        path.join(javaDir, "BootReconnectReceiver.java"),
        receiverJavaSource({ packageName }),
        "utf8"
      );
      return cfg;
    },
  ]);

  return config;
}

module.exports = withBootReconnectNotification;
