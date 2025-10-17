self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", () => console.log("Service Worker aktiv"));
