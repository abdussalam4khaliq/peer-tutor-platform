"use client";

import { useEffect, useState } from "react";

const COURSE_URL = /\/courses\/[0-9a-f-]{36}\/?$/i;

// Reads the saved course pages from this device and lists them by title.
export default function OfflineCourses() {
  const [courses, setCourses] = useState(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      if (typeof caches === "undefined") {
        setCourses([]);
        return;
      }
      const found = [];
      try {
        const names = (await caches.keys()).filter((n) => n.startsWith("coursemate-pages-"));
        for (const name of names) {
          const cache = await caches.open(name);
          for (const request of await cache.keys()) {
            if (!COURSE_URL.test(new URL(request.url).pathname)) continue;
            const res = await cache.match(request);
            const html = res ? await res.text() : "";
            const title = new DOMParser().parseFromString(html, "text/html").querySelector("h1")?.textContent?.trim();
            found.push({ href: new URL(request.url).pathname, title: title || "Saved course" });
          }
        }
      } catch {
        // nothing readable: fall through to the empty message
      }
      if (!cancelled) setCourses(found);
    }

    load();
    return () => {
      cancelled = true;
    };
  }, []);

  if (courses === null) return <p>Looking for saved courses...</p>;

  if (courses.length === 0) {
    return (
      <div className="card">
        <p style={{ margin: 0 }}>
          Nothing is saved on this device yet. Open a course while you&apos;re online and it will be saved automatically.
        </p>
      </div>
    );
  }

  return (
    <div>
      <h2 style={{ marginTop: 0 }}>Saved courses</h2>
      {courses.map((c) => (
        <a key={c.href} className="list-row" href={c.href}>
          <span><strong>{c.title}</strong><small>Saved on this device</small></span>
          <span className="badge badge-green">Read offline</span>
        </a>
      ))}
    </div>
  );
}
