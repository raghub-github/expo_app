package {{PACKAGE}};

import android.content.Context;
import android.content.SharedPreferences;
import android.net.Uri;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.io.OutputStream;

/**
 * Native selected-alert-sound store.
 *
 * Optional: JS copies the Super Admin slot file here after login / settings
 * change. Killed FCM never requires that copy — OrderAlertController always
 * falls back to bundled res/raw (then system ringtone).
 *
 * Defaults: buzzer ON, ring-in-silent ON. Never require Manage Communication.
 */
public final class OrderAlertSoundStore {
  private static final String PREFS = "gatimitra_order_alert_sound_v1";
  private static final String KEY_ENABLED = "enabled";
  private static final String KEY_SLOT = "slot";
  private static final String KEY_PATH = "filePath";
  private static final String KEY_RING_SILENT = "ringInSilent";
  private static final String KEY_VOLUME = "volume01";
  private static final String COPY_PREFIX = "gatimitra_selected_alert";

  private OrderAlertSoundStore() {}

  static SharedPreferences prefs(Context context) {
    return context.getApplicationContext().getSharedPreferences(PREFS, Context.MODE_PRIVATE);
  }

  static boolean isBuzzerEnabled(Context context) {
    if (context == null) return true;
    return prefs(context).getBoolean(KEY_ENABLED, true);
  }

  static boolean ringInSilent(Context context) {
    if (context == null) return true;
    return prefs(context).getBoolean(KEY_RING_SILENT, true);
  }

  static float volume01(Context context) {
    if (context == null) return 1f;
    return prefs(context).getFloat(KEY_VOLUME, 1f);
  }

  static int slot(Context context) {
    if (context == null) return 0;
    return prefs(context).getInt(KEY_SLOT, 0);
  }

  static File selectedFile(Context context) {
    if (context == null) return null;
    String path = prefs(context).getString(KEY_PATH, "");
    if (path == null || path.trim().length() == 0) return null;
    File f = new File(path.trim());
    return f.isFile() && f.length() > 0 ? f : null;
  }

  static String persist(
      Context context,
      Boolean enabled,
      String fileUri,
      Integer slot,
      Boolean ringInSilent,
      Float volume01
  ) {
    if (context == null) return "";
    Context app = context.getApplicationContext();
    SharedPreferences.Editor editor = prefs(app).edit();
    int useSlot = slot != null ? Math.max(0, Math.min(2, slot)) : prefs(app).getInt(KEY_SLOT, 0);
    if (enabled != null) editor.putBoolean(KEY_ENABLED, enabled);
    if (slot != null) editor.putInt(KEY_SLOT, useSlot);
    if (ringInSilent != null) editor.putBoolean(KEY_RING_SILENT, ringInSilent);
    if (volume01 != null) {
      float v = volume01;
      if (v < 0f) v = 0f;
      if (v > 1f) v = 1f;
      editor.putFloat(KEY_VOLUME, v);
    }
    String copied = null;
    if (fileUri != null && fileUri.trim().length() > 0) {
      copied = copySelectedFile(app, fileUri.trim(), useSlot);
      if (copied != null && copied.length() > 0) {
        editor.putString(KEY_PATH, copied);
      } else {
        // New selection could not be copied — do not keep a stale other-slot file.
        // Killed FCM then uses bundled res/raw instead of the wrong sound (or silence).
        editor.remove(KEY_PATH);
      }
    }
    // commit() so the next killed FCM in a new process sees this write immediately.
    editor.commit();
    return copied != null ? copied : String.valueOf(prefs(app).getString(KEY_PATH, ""));
  }

  private static String copySelectedFile(Context app, String fileUri, int slot) {
    try {
      String path = fileUri;
      if (path.startsWith("file://")) {
        Uri uri = Uri.parse(path);
        path = uri.getPath() != null ? uri.getPath() : path.substring("file://".length());
      }
      File src = new File(path);
      if (!src.isFile() || src.length() <= 0) return null;
      String name = src.getName();
      String ext = "mp3";
      int dot = name.lastIndexOf('.');
      if (dot > 0 && dot < name.length() - 1) {
        ext = name.substring(dot + 1).toLowerCase();
        if (ext.length() > 5) ext = "mp3";
      }
      File dest = new File(app.getFilesDir(), COPY_PREFIX + "_" + slot + "." + ext);
      if (src.getAbsolutePath().equals(dest.getAbsolutePath())) {
        return dest.getAbsolutePath();
      }
      copyFile(src, dest);
      return dest.isFile() && dest.length() > 0 ? dest.getAbsolutePath() : null;
    } catch (Throwable ignored) {
      return null;
    }
  }

  private static void copyFile(File src, File dest) throws Exception {
    InputStream in = null;
    OutputStream out = null;
    try {
      in = new FileInputStream(src);
      out = new FileOutputStream(dest);
      byte[] buf = new byte[8192];
      int n;
      while ((n = in.read(buf)) > 0) {
        out.write(buf, 0, n);
      }
      out.flush();
    } finally {
      try {
        if (in != null) in.close();
      } catch (Throwable ignored) {
      }
      try {
        if (out != null) out.close();
      } catch (Throwable ignored) {
      }
    }
  }
}
