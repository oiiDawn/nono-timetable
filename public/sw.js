// One-time cleanup worker for users upgrading from the retired PWA version.
// Cache Storage and IndexedDB are separate; this intentionally never opens or deletes IndexedDB.
self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const cacheNames = await caches.keys();
      await Promise.all(cacheNames.map((name) => caches.delete(name)));
      await self.registration.unregister();

      const windows = await self.clients.matchAll({
        type: "window",
        includeUncontrolled: true,
      });
      await Promise.all(windows.map((client) => client.navigate(client.url)));
    })(),
  );
});
