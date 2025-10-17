self.addEventListener("install", e => {
  console.log("Service Worker installiert");
});

self.addEventListener("activate", e => {
  console.log("Service Worker aktiviert");
});

self.addEventListener("fetch", () => {});
