/* Firebase Cloud Messaging service worker — partnersite (partner.gatimitra.com)
 *
 * Handled OS-level notification for backgrounded / closed tabs. Foreground
 * (tab visible) messages are handled by src/lib/browser-push/firebase-web.ts
 * inside the running app.
 *
 * NOTE: web-push config values are baked in at deploy time via the
 * `firebase-messaging-sw.js.template` step in the Dockerfile — see
 * infra/docker/build-firebase-sw.sh (added by Phase 6). During local dev,
 * substitute the placeholders below with values from partnersite/.env.local.
 */

importScripts("https://www.gstatic.com/firebasejs/10.13.2/firebase-app-compat.js");
importScripts("https://www.gstatic.com/firebasejs/10.13.2/firebase-messaging-compat.js");

// Placeholder-substituted at build time. If you see the literal strings below
// in prod, the build step didn't replace them — check your env vars.
firebase.initializeApp({
  apiKey: "AIzaSyBD2ZJp1JCpENs2sXkbrmSUokhFBwUd_6g",
  authDomain: "gatimitra-od-c5bad.firebaseapp.com",
  projectId: "gatimitra-od-c5bad",
  storageBucket: "gatimitra-od-c5bad.firebasestorage.app",
  messagingSenderId: "29629664058",
  appId: "1:29629664058:web:61076c5ab022e5edd39e03",
});

const messaging = firebase.messaging();

// Background notification (tab closed / minimised). Foreground goes via
// firebase.messaging().onMessage() in the app bundle.
messaging.onBackgroundMessage((payload) => {
  const notif = payload.notification ?? {};
  const data = payload.data ?? {};
  const title = notif.title || data.title || "Gatimitra";
  const body = notif.body || data.body || "";
  const options = {
    body,
    icon: notif.icon || "/favicon.png",
    image: notif.image,
    badge: "/favicon.png",
    data: {
      deepLink: data.deep_link || "/",
      notificationId: data.notification_id,
      campaignId: data.campaign_id,
    },
  };
  self.registration.showNotification(title, options);
});

// Deep-link routing on click. Prefer to focus an existing open tab if we
// already have one on the target URL; otherwise open a new one.
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const deep = event.notification.data?.deepLink || "/";
  const notifId = event.notification.data?.notificationId;
  event.waitUntil((async () => {
    const clientsList = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    // Ping the app so it can mark the click.
    if (notifId) {
      try {
        await fetch(`/api/notifications/${encodeURIComponent(notifId)}/click`, {
          method: "POST",
          credentials: "include",
        });
      } catch { /* tolerated */ }
    }
    for (const c of clientsList) {
      if (c.url.includes(deep) && "focus" in c) return c.focus();
    }
    if (self.clients.openWindow) return self.clients.openWindow(deep);
  })());
});
