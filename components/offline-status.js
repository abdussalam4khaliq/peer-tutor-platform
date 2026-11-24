"use client";

import { useEffect, useState } from "react";

async function isSaved(path) {
  const names = (await caches.keys()).filter((n) => n.startsWith("coursemate-pages-"));
  for (const name of names) {
    const cache = await caches.open(name);
    if (await cache.match(window.location.origin + path)) return true;
  }
  return false;
}

// Shown on a course page. Makes sure this course is saved on the device and says so.
// (Once the service worker is in control it saves each course page as you open it;
// the message below covers the very first visit, before it has taken over.)
export default function OfflineStatus() {
  const [state, setState] = useState("checking"); // checking | saving | saved | unsupported

  useEffect(() => {
    if (!("serviceWorker" in navigator) || typeof caches === "undefined") {
      setState("unsupported");
      return;
    }

    let cancelled = false;
    const path = window.location.pathname.replace(/\/$/, "");

    function onMessage(event) {
      if (event.data?.type === "page-saved" && event.data.path.replace(/\/$/, "") === path && !cancelled) {
        setState("saved");
      }
    }
    navigator.serviceWorker.addEventListener("message", onMessage);

    (async () => {
      try {
        const registration = await navigator.serviceWorker.ready;
        // give a controlling worker a moment to finish saving the page it just served
        await new Promise((r) => setTimeout(r, 1200));
        if (cancelled) return;

        if (await isSaved(path)) {
          setState("saved");
          return;
        }
        if (!navigator.onLine) {
          setState("unsupported");
          return;
        }

        setState("saving");
        const resources = performance
          .getEntriesByType("resource")
          .map((e) => new URL(e.name, window.location.origin))
          .filter((u) => u.origin === window.location.origin && u.pathname.startsWith("/_next/static/"))
          .map((u) => u.pathname);
        (registration.active || navigator.serviceWorker.controller)?.postMessage({ type: "save-page", path, resources });

        // if no confirmation arrives, check once more
        setTimeout(async () => {
          if (!cancelled && (await isSaved(path))) setState("saved");
        }, 6000);
      } catch {
        if (!cancelled) setState("unsupported");
      }
    })();

    return () => {
      cancelled = true;
      navigator.serviceWorker.removeEventListener("message", onMessage);
    };
  }, []);

  if (state === "saved") return <p className="offline-status offline-status--saved">✓ Saved for offline reading</p>;
  if (state === "saving") return <p className="offline-status">Saving for offline reading...</p>;
  return null;
}
