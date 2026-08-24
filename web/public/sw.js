// Web Push service worker — handles incoming push events and notification clicks.
// Registered from src/lib/usePushSubscription.ts. This file is served statically from
// web/public/ (Next.js serves everything under public/ at the site root), which matters
// for Push API scoping: a service worker registered at /sw.js controls the whole
// origin ("/"), matching the default scope src/lib/usePushSubscription.ts registers with.

self.addEventListener("push", (event) => {
  // Payload shape matches src/lib/push/send.ts's serializedPayload on the backend:
  // { type, title, body, data }. web-push's sendNotification body is plain text/JSON,
  // not a structured PushMessageData object, so it must be parsed here.
  let payload = { title: "Hamame", body: "You have a new notification." };
  try {
    if (event.data) {
      payload = event.data.json();
    }
  } catch {
    // Malformed payload — fall back to the generic notification above rather than
    // dropping the push silently (a push event with no shown notification can get a
    // browser's service worker deprioritized for "silent push" abuse).
  }

  const title = payload.title ?? "Hamame";
  const options = {
    body: payload.body ?? "",
    icon: "/next.svg",
    data: payload.data ?? {},
    tag: payload.type, // same-type pushes replace each other in the notification tray
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();

  // Focus an existing tab if one's open, otherwise open a new one. All 3 V1 notification
  // types land on the dashboard for now — no per-type deep link exists yet.
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if ("focus" in client) {
          return client.focus();
        }
      }
      if (self.clients.openWindow) {
        return self.clients.openWindow("/dashboard");
      }
    })
  );
});
