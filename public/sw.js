// Do it. service worker — push, notification clicks, and a way back when there's no connection.
// Pages always come from the network and are never cached here (keeps data fresh).
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

// ───────────────────────── no connection ─────────────────────────
// A page load that fails would show the browser's error page, which a Home Screen app can't leave. Show our own
// instead: it opens the page it was asked for as soon as the server answers.
self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.mode !== "navigate" || request.method !== "GET") return;
  // signing in hops between sites: leave it to the browser
  if (/^\/(auth|api)\//.test(new URL(request.url).pathname)) return;
  event.respondWith(fetch(request).catch(offline));
});

function offline() {
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Do it.</title>
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, viewport-fit=cover"><meta name="theme-color" content="#eef0f8">
<style>
body{margin:0;min-height:100vh;min-height:100dvh;background:#eef0f8;color:#10143a;font-family:"Bricolage Grotesque",system-ui,sans-serif}
main{box-sizing:border-box;min-height:100vh;min-height:100dvh;max-width:440px;margin:auto;padding:calc(env(safe-area-inset-top) + 24px) 24px calc(env(safe-area-inset-bottom) + 24px);display:flex;flex-direction:column;justify-content:center}
h1{font-size:56px;line-height:.95;font-weight:800;letter-spacing:-.03em;margin:0}
p{font-size:17px;line-height:1.4;color:#4a5078;margin:16px 0 0}
button{margin-top:32px;height:64px;width:100%;border:0;border-radius:22px;background:#2b3cf0;color:#fff;font:800 18px system-ui,sans-serif}
</style></head><body><main><h1>No connection.</h1><p>Do it. opens by itself as soon as you\u2019re back online.</p><button>Try again</button></main>
<script>
var trying = false;
function open() {
  if (trying || document.visibilityState !== "visible") return;
  trying = true;
  fetch("/sw.js", { method: "HEAD", cache: "no-store" }).then(function () { location.reload(); }, function () { trying = false; });
}
document.querySelector("button").onclick = open;
window.addEventListener("online", open);
window.addEventListener("focus", open);
document.addEventListener("visibilitychange", open);
setInterval(open, 4000);
</script></body></html>`;
  return new Response(html, { headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" } });
}
