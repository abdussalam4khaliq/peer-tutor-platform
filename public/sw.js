// Coursemate service worker
//
// 1. Offline reading: course pages you open are saved on this device, so you can
//    review the notes with no connection. Only /courses/<id> pages are saved.
//    Quizzes, tests, payments, the forum and tutor/admin pages are never cached.
// 2. Static files (scripts, styles, fonts) are cached so saved pages still run offline.
// 3. Web push notifications (below).
//
// Bump VERSION to throw away every old cache on the next visit.

const VERSION = "v1";
const STATIC_CACHE = `coursemate-static-${VERSION}`;
const PAGE_CACHE = `coursemate-pages-${VERSION}`;
const OFFLINE_PATH = "/offline";

const COURSE_PAGE = /^\/courses\/[0-9a-f-]{36}\/?$/i;
const NETWORK_TIMEOUT_MS = 5000; // a slow connection falls back to the saved copy
const MAX_PAGES = 30;
const MAX_STATIC = 300;

const origin = () => self.location.origin;
const pageKey = (url) => origin() + url.pathname.replace(/\/$/, "");
const isStaticPath = (p) => typeof p === "string" && p.startsWith("/_next/static/");

// Every script, stylesheet and font a page references (also inside Next's inline data).
function assetsFromHtml(html) {
  const found = new Set();
  for (const m of html.match(/static\/(?:chunks|css|media)\/[^"'\s\\<>)]+/g) || []) {
    found.add("/_next/" + m);
  }
  return [...found];
}

async function cacheAssets(paths) {
  const statics = await caches.open(STATIC_CACHE);
  await Promise.all(
    paths.map(async (p) => {
      try {
        if (await statics.match(origin() + p)) return;
        await statics.add(origin() + p);
      } catch {
        // skip files that fail
      }
    })
  );
}

async function trim(cacheName, max) {
  const cache = await caches.open(cacheName);
  const keys = await cache.keys();
  for (let i = 0; i < keys.length - max; i++) {
    await cache.delete(keys[i]);
  }
}

async function offlineResponse() {
  const cache = await caches.open(STATIC_CACHE);
  const hit = await cache.match(origin() + OFFLINE_PATH);
  return (
    hit ||
    new Response("You're offline.", { status: 503, headers: { "content-type": "text/plain; charset=utf-8" } })
  );
}

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      try {
        // the offline page and everything it needs to run with no connection
        const cache = await caches.open(STATIC_CACHE);
        const res = await fetch(origin() + OFFLINE_PATH, { cache: "reload" });
        if (res.ok) {
          const html = await res.clone().text();
          await cache.put(origin() + OFFLINE_PATH, res);
          await cacheAssets(assetsFromHtml(html).slice(0, 80));
        }
      } catch {
        // best effort: the worker still installs without the offline page
      }
      await self.skipWaiting();
    })()
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keep = new Set([STATIC_CACHE, PAGE_CACHE]);
      const names = await caches.keys();
      await Promise.all(names.filter((n) => n.startsWith("coursemate-") && !keep.has(n)).map((n) => caches.delete(n)));
      await self.clients.claim();
    })()
  );
});

async function cacheFirst(event) {
  const cache = await caches.open(STATIC_CACHE);
  const hit = await cache.match(event.request);
  if (hit) return hit;
  const res = await fetch(event.request);
  if (res.ok) {
    event.waitUntil(cache.put(event.request, res.clone()).then(() => trim(STATIC_CACHE, MAX_STATIC)));
  }
  return res;
}

function storeIfPage(event, cache, key, res) {
  const type = res.headers.get("content-type") || "";
  // a redirect (for example to the login page) is never saved
  if (res.ok && res.status === 200 && !res.redirected && type.includes("text/html")) {
    event.waitUntil(cache.put(key, res.clone()).then(() => trim(PAGE_CACHE, MAX_PAGES)));
  }
}

async function handleNavigation(event) {
  const request = event.request;
  const url = new URL(request.url);

  if (!COURSE_PAGE.test(url.pathname)) {
    try {
      return await fetch(request);
    } catch {
      return offlineResponse();
    }
  }

  const key = pageKey(url);
  const cache = await caches.open(PAGE_CACHE);
  const saved = await cache.match(key);

  const network = fetch(request).then((res) => {
    storeIfPage(event, cache, key, res);
    return res;
  });

  if (!saved) {
    try {
      return await network;
    } catch {
      return offlineResponse();
    }
  }

  // A saved copy exists: use the network when it answers quickly, otherwise the saved copy.
  event.waitUntil(network.catch(() => {}));
  const timeout = new Promise((resolve) => setTimeout(() => resolve(saved), NETWORK_TIMEOUT_MS));
  return Promise.race([network.catch(() => saved), timeout]);
}

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== origin()) return;

  if (request.mode === "navigate") {
    event.respondWith(handleNavigation(event));
    return;
  }

  if (isStaticPath(url.pathname)) {
    event.respondWith(cacheFirst(event));
  }
});

async function savePage({ path, resources }) {
  const url = new URL(path, origin());
  if (!COURSE_PAGE.test(url.pathname)) return;

  const wanted = new Set((resources || []).filter(isStaticPath).slice(0, 120));

  const pages = await caches.open(PAGE_CACHE);
  try {
    const res = await fetch(origin() + url.pathname, { credentials: "same-origin" });
    const type = res.headers.get("content-type") || "";
    if (res.ok && res.status === 200 && !res.redirected && type.includes("text/html")) {
      const html = await res.clone().text();
      for (const a of assetsFromHtml(html).slice(0, 120)) wanted.add(a);
      await pages.put(pageKey(url), res);
      await trim(PAGE_CACHE, MAX_PAGES);
    }
  } catch {
    // offline right now: nothing to save
  }

  await cacheAssets([...wanted]);
  await trim(STATIC_CACHE, MAX_STATIC);

  const clients = await self.clients.matchAll();
  for (const client of clients) client.postMessage({ type: "page-saved", path: url.pathname });
}

self.addEventListener("message", (event) => {
  const data = event.data || {};
  if (data.type === "save-page") {
    event.waitUntil(savePage(data));
  } else if (data.type === "remove-page") {
    event.waitUntil(
      caches.open(PAGE_CACHE).then((c) => c.delete(pageKey(new URL(data.path, origin()))))
    );
  } else if (data.type === "clear-pages") {
    event.waitUntil(caches.delete(PAGE_CACHE));
  }
});

self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { title: "Coursemate", body: event.data ? event.data.text() : "" };
  }

  const title = data.title || "Coursemate";
  const options = {
    body: data.body || "",
    icon: "/icon-192.png",
    badge: "/icon-192.png",
    data: { link: data.link || "/notifications" },
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const link = event.notification.data?.link || "/notifications";

  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
      for (const client of clients) {
        if (client.url.includes(self.location.origin) && "focus" in client) {
          client.navigate(link);
          return client.focus();
        }
      }
      return self.clients.openWindow(link);
    })
  );
});