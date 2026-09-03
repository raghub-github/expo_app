/**
 * Creates Android notification channels at install / process start so FCM
 * can display tray notifications while the JS bundle is not running.
 *
 * Props.channels: [{ id, name, importance?, sound? }]
 *   importance: 3=DEFAULT, 4=HIGH, 5=MAX
 *   sound: Android res/raw name without extension (must be packaged via
 *          expo-notifications `sounds` and present before first channel create)
 */
const {
  withDangerousMod,
  withMainApplication,
} = require("@expo/config-plugins");
const fs = require("fs");
const path = require("path");

function javaSource(packageName, channels) {
  const creates = (channels || [])
    .map((ch) => {
      const id = String(ch.id || "").replace(/\\/g, "\\\\").replace(/"/g, '\\"');
      const name = String(ch.name || ch.id || "Alerts").replace(/\\/g, "\\\\").replace(/"/g, '\\"');
      const importance = Number(ch.importance) === 5 ? 5 : Number(ch.importance) === 3 ? 3 : 4;
      const sound = ch.sound != null && String(ch.sound).trim()
        ? String(ch.sound).trim().replace(/\\/g, "\\\\").replace(/"/g, '\\"')
        : "";
      return `    create(context, manager, "${id}", "${name}", ${importance}, ${
        sound ? `"${sound}"` : "null"
      });`;
    })
    .join("\n");

  return `package ${packageName};

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.content.Context;
import android.media.AudioAttributes;
import android.net.Uri;
import android.os.Build;

/** Install-time FCM channels — must exist before the first background push. */
public final class PushChannelBootstrap {
  private PushChannelBootstrap() {}

  public static void ensure(Context context) {
    if (Build.VERSION.SDK_INT < 26 || context == null) return;
    NotificationManager manager = context.getSystemService(NotificationManager.class);
    if (manager == null) return;
${creates}
  }

  private static void create(
      Context context,
      NotificationManager manager,
      String id,
      String name,
      int importance,
      String soundRaw
  ) {
    if (manager.getNotificationChannel(id) != null) return;
    NotificationChannel channel = new NotificationChannel(id, name, importance);
    channel.enableVibration(true);
    channel.setLockscreenVisibility(Notification.VISIBILITY_PUBLIC);
    channel.setShowBadge(true);
    if (soundRaw != null && !soundRaw.isEmpty()) {
      Uri soundUri = Uri.parse("android.resource://" + context.getPackageName() + "/raw/" + soundRaw);
      AudioAttributes attrs = new AudioAttributes.Builder()
          .setUsage(AudioAttributes.USAGE_NOTIFICATION_EVENT)
          .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
          .build();
      channel.setSound(soundUri, attrs);
    }
    manager.createNotificationChannel(channel);
  }
}
`;
}

function withAndroidPushChannels(config, props = {}) {
  const channels = Array.isArray(props.channels) ? props.channels : [];
  if (channels.length === 0) return config;
  const pkg = config.android?.package;
  if (!pkg) return config;

  config = withDangerousMod(config, [
    "android",
    async (mod) => {
      const rel = path.join("app", "src", "main", "java", ...pkg.split("."), "PushChannelBootstrap.java");
      const dest = path.join(mod.modRequest.platformProjectRoot, rel);
      fs.mkdirSync(path.dirname(dest), { recursive: true });
      fs.writeFileSync(dest, javaSource(pkg, channels));
      return mod;
    },
  ]);

  config = withMainApplication(config, (mod) => {
    let src = mod.modResults.contents;
    if (src.includes("PushChannelBootstrap.ensure") || !src.includes("super.onCreate()")) {
      return mod;
    }
    src = src.replace(
      /super\.onCreate\(\);/,
      `super.onCreate();\n    ${pkg}.PushChannelBootstrap.ensure(this);`,
    );
    mod.modResults.contents = src;
    return mod;
  });

  return config;
}

module.exports = withAndroidPushChannels;
