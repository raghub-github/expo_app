/* Firebase Cloud Messaging service worker — dashboard (control.gatimitra.com)
 *
 * See partnersite/public/firebase-messaging-sw.js for detailed docs — this
 * file is intentionally identical structure so build tooling stays uniform.
 */

importScripts("https://www.gstatic.com/firebasejs/10.13.2/firebase-app-compat.js");
importScripts("https://www.gstatic.com/firebasejs/10.13.2/firebase-messaging-compat.js");

firebase.initializeApp({
  apiKey: "AIzaSyBD2ZJp1JCpENs2sXkbrmSUokhFBwUd_6g",
  authDomain: "gatimitra-od-c5bad.firebaseapp.com",
  projectId: "gatimitra-od-c5bad",
  storageBucket: "gatimitra-od-c5bad.firebasestorage.app",
  messagingSenderId: "29629664058",
  appId: "1:29629664058:web:91356cd8012c904bd39e03",
});

const messaging = firebase.messaging();

messaging.onBackgroundMessage((payload) => {
  const notif = payload.notification ?? {};
  const data = payload.data ?? {};
  const title = notif.title || data.title || "Gatimitra Admin";
  const body = notif.body || data.body || "";
  self.registration.showNotification(title, {
    body,
    icon: notif.icon || "/favicon.png",
    image: notif.image,
    badge: "/favicon.png",
    data: {
      deepLink: data.deep_link || "/dashboard",
      notificationId: data.notification_id,
    },
  });
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const deep = event.notification.data?.deepLink || "/dashboard";
  const notifId = event.notification.data?.notificationId;
  event.waitUntil((async () => {
    const clientsList = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    if (notifId) {
      try {
        await fetch(`/api/notifications/${encodeURIComponent(notifId)}/click`, {
          method: "POST",
          credentials: "include",
        });
      } catch {/* tolerated */}
    }
    for (const c of clientsList) {
      if (c.url.includes(deep) && "focus" in c) return c.focus();
    }
    if (self.clients.openWindow) return self.clients.openWindow(deep);
  })());
});
