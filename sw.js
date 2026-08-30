// WgtRadar — service worker.
// Оболочка кладётся в кеш при установке, дальше сеть в приоритете:
// страница и данные должны быть свежими, кеш нужен только когда связи нет.

const VERSION = "wgtradar-v1";
const SHELL = [
  "./",
  "./index.html",
  "./icons/manifest.json",
  "./icons/icon-192x192.png",
  "./icons/icon-512x512.png",
  "./icons/icon-maskable-512.png",
  "./icons/favicon.ico",
];

self.addEventListener("install", e => {
  e.waitUntil((async () => {
    const c = await caches.open(VERSION);
    // по одному, чтобы один недостающий файл не уронил всю установку
    await Promise.all(SHELL.map(u => c.add(u).catch(() => {})));
    await self.skipWaiting();
  })());
});

self.addEventListener("activate", e => {
  e.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(k => k !== VERSION).map(k => caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener("fetch", e => {
  const req = e.request;
  if (req.method !== "GET") return;

  const url = new URL(req.url);

  // проверка ссылок обязана ходить в сеть, кешировать её бессмысленно и вредно
  if (url.origin === location.origin && url.pathname.startsWith("/api/")) return;

  // чужие домены не трогаем вовсе
  if (url.origin !== location.origin) return;

  e.respondWith((async () => {
    try {
      const fresh = await fetch(req);
      if (fresh && fresh.ok) {
        const c = await caches.open(VERSION);
        c.put(req, fresh.clone());
      }
      return fresh;
    } catch (err) {
      const hit = await caches.match(req);
      if (hit) return hit;
      if (req.mode === "navigate") {
        const shell = await caches.match("./index.html");
        if (shell) return shell;
      }
      throw err;
    }
  })());
});

// принудительное обновление по сообщению со страницы
self.addEventListener("message", e => {
  if (e.data === "skipWaiting") self.skipWaiting();
});
