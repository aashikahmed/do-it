// Do it. service worker — push + notification clicks. No page caching (keeps data fresh).
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { title: "Do it.", body: event.data ? event.data.text() : "" };
  }
  const title = data.title || "Do it.";
  const options = {
    body: data.body || "",
    icon: "/icons/192",
    badge: "/icons/badge",
    tag: data.tag || undefined,
    renotify: !!data.tag,
    data: { url: data.url || "/" },
  };
  event.waitUntil(
    Promise.all([
      self.registration.showNotification(title, options),
      self.navigator.setAppBadge ? self.navigator.setAppBadge(1).catch(() => {}) : Promise.resolve(),
    ]),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = new URL((event.notification.data && event.notification.data.url) || "/", self.location.origin).href;
  event.waitUntil(
    (async () => {
      const all = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      for (const client of all) {
        if (new URL(client.url).origin === self.location.origin) {
          try {
            const focused = await client.focus();
            // navigate() only works on clients this worker controls
            if (focused && "navigate" in focused && (await focused.navigate(url))) return;
            focused.postMessage({ type: "open", url });
            return;
          } catch {
            break;
          }
        }
      }
      await self.clients.openWindow(url);
    })(),
  );
});

