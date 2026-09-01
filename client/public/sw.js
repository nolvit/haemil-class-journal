const CACHE_NAME = "haemil-shell-v3";
const APP_SHELL = ["/", "/admin.webmanifest", "/parent.webmanifest", "/icons/haemil-logo-192.png", "/icons/haemil-logo-512.png", "/icons/notification-badge.png"];

self.addEventListener("install", event => {
  event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(APP_SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key !== CACHE_NAME).map(key => caches.delete(key)))).then(() => self.clients.claim()));
});

self.addEventListener("fetch", event => {
  if (event.request.method !== "GET" || new URL(event.request.url).pathname.startsWith("/api/")) return;
  event.respondWith(fetch(event.request).then(response => {
    const copy = response.clone();
    caches.open(CACHE_NAME).then(cache => cache.put(event.request, copy));
    return response;
  }).catch(() => caches.match(event.request).then(match => match || caches.match("/"))));
});

self.addEventListener("push", event => {
  const data = event.data?.json() || {};
  const title = data.title || "해밀학원 알림";
  const options = {
    body: data.body || "새로운 알림이 있습니다.",
    icon: "/icons/haemil-logo-192.png",
    badge: "/icons/notification-badge.png",
    tag: data.tag || "haemil-parent",
    data: { url: data.url || "/" },
  };
  event.waitUntil(
    self.registration
      .showNotification(title, options)
      .catch(() => self.registration.showNotification(title, {
        body: options.body,
        tag: options.tag,
        data: options.data,
      }))
  );
});

self.addEventListener("notificationclick", event => {
  event.notification.close();
  const url = new URL(event.notification.data?.url || "/", self.location.origin).href;
  event.waitUntil(self.clients.matchAll({ type: "window", includeUncontrolled: true }).then(clients => {
    const existing = clients.find(client => client.url === url);
    return existing ? existing.focus() : self.clients.openWindow(url);
  }));
});
